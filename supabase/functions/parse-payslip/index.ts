import { createClient } from 'npm:@supabase/supabase-js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
}

const DAILY_CALL_LIMIT = 20   // maks PDF-parsingkall per bruker per dag
const MAX_TEXT_CHARS   = 8000 // maks tegn fra PDF-tekst

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Krev gyldig Supabase-sesjon
  const authHeader = req.headers.get('Authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
  const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // Rate limiting: maks DAILY_CALL_LIMIT per bruker per dag
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count } = await supabaseAdmin
    .from('ai_usage_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('endpoint', 'parse-payslip')
    .gte('created_at', since)
  if ((count ?? 0) >= DAILY_CALL_LIMIT) {
    return new Response(JSON.stringify({ error: 'Daglig kvote nådd (20 slipper per dag). Prøv igjen i morgen.' }),
      { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  let text: string
  try {
    const body = await req.json() as { text?: unknown }
    if (typeof body.text !== 'string' || !body.text.trim()) {
      throw new Error('Mangler felt: text')
    }
    text = body.text.slice(0, MAX_TEXT_CHARS)
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY ikke satt i Supabase secrets' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const prompt = `Du er en ekspert på norske lønnsslipper. Ekstraher følgende felt fra lønnsslippen under og returner KUN gyldig JSON uten forklaring.

Felt som skal ekstraheres:
- periode: { year: number, month: number }  (måned 1–12)
- maanedslonn: number  (grunnlønn / fastlønn per måned, 0 hvis ikke funnet)
- bruttoSum: number  (total bruttolønn inkl. tillegg)
- skattetrekk: number  (positivt tall)
- pensjonstrekk: number  (positivt tall)
- fagforeningskontingent: number  (positivt tall)
- nettoUtbetalt: number  (positivt tall)
- feriepengegrunnlag: number  (YTD, positivt tall)

Tall skal være norske kroner uten tusenskille og uten desimaler.
Returner JSON på formen:
{"periode":{"year":2026,"month":1},"maanedslonn":55000,"bruttoSum":60000,"skattetrekk":15000,"pensjonstrekk":2000,"fagforeningskontingent":500,"nettoUtbetalt":42500,"feriepengegrunnlag":180000}

Lønnsslipp:
${text}`

  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!anthropicRes.ok) {
    const errText = await anthropicRes.text()
    return new Response(JSON.stringify({ error: `Anthropic API feil: ${errText}` }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const anthropicData = await anthropicRes.json() as {
    content: Array<{ type: string; text: string }>
  }
  const rawText = anthropicData.content?.[0]?.text ?? ''

  let parsed: Record<string, unknown>
  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('Ingen JSON i svar')
    parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>
  } catch {
    return new Response(JSON.stringify({ error: 'Klarte ikke parse AI-svar', raw: rawText }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Logg vellykket kall (best-effort)
  supabaseAdmin.from('ai_usage_log').insert({
    user_id: user.id,
    endpoint: 'parse-payslip',
    tokens_est: Math.ceil(text.length / 4),
  }).then(() => {}).catch(() => {})

  const periode = (parsed.periode as { year: number; month: number }) ?? { year: new Date().getFullYear(), month: new Date().getMonth() + 1 }
  const result = {
    periode,
    ansattnummer: '',
    loennstrinn: 0,
    maanedslonn: Number(parsed.maanedslonn) || 0,
    fasteTillegg: [],
    trekk: [],
    bruttoSum: Number(parsed.bruttoSum) || 0,
    nettoUtbetalt: Number(parsed.nettoUtbetalt) || 0,
    feriepengegrunnlag: Number(parsed.feriepengegrunnlag) || 0,
    opptjentFerie: 0,
    skattetrekk: Number(parsed.skattetrekk) || 0,
    ekstraTrekk: 0,
    husleietrekk: 0,
    pensjonstrekk: Number(parsed.pensjonstrekk) || 0,
    fagforeningskontingent: Number(parsed.fagforeningskontingent) || 0,
    ouFond: 0,
    gruppelivspremie: 0,
    hittilBrutto: 0,
    hittilPensjon: 0,
    hittilForskuddstrekk: 0,
    tabelltrekkGrunnlag: 0,
    tabelltrekkBelop: Number(parsed.skattetrekk) || 0,
    tabellnummer: undefined,
  }

  return new Response(JSON.stringify(result), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
