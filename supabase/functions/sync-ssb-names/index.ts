// Henter fødselsstatistikk for fornavn fra SSB (tabell 10467) og lagrer den i names/name_statistics.
// Kalles fra appen («Oppdater fra SSB») av en innlogget bruker. Skriver med service role.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { transformSsbNames, type JsonStat2 } from './transform.ts'

const SSB_TABLE = '10467'
const SSB_URL = `https://data.ssb.no/api/v0/no/table/${SSB_TABLE}`
/** SSB oppdaterer tabellen ca. én gang i året — ikke la klienter hamre på SSB. */
const MIN_HOURS_BETWEEN_SYNCS = 12

const ALLOWED_ORIGINS = new Set([
  'https://lommeboka.com',
  'https://www.lommeboka.com',
  'http://localhost:5173',
  (Deno.env.get('APP_ORIGIN') ?? '').replace(/\/$/, ''),
])

const SSB_QUERY = {
  query: [
    { code: 'Fornavn', selection: { filter: 'all', values: ['*'] } },
    { code: 'ContentsCode', selection: { filter: 'all', values: ['*'] } },
    { code: 'Tid', selection: { filter: 'all', values: ['*'] } },
  ],
  response: { format: 'json-stat2' },
}

function chunk<T>(rows: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size))
  return out
}

serve(async (req) => {
  const origin = req.headers.get('Origin') ?? ''
  const corsHeaders = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://lommeboka.com',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, baggage, sentry-trace',
    'Vary': 'Origin',
  }
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!jwt) return json({ error: 'Uautorisert' }, 401)

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: { user }, error: authError } = await supabase.auth.getUser(jwt)
  if (authError || !user) return json({ error: 'Uautorisert' }, 401)

  const { data: last } = await supabase
    .from('ssb_sync_log')
    .select('synced_at, latest_year')
    .eq('status', 'ok')
    .order('synced_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (last && Date.now() - new Date(last.synced_at).getTime() < MIN_HOURS_BETWEEN_SYNCS * 3600 * 1000) {
    return json({ error: 'Navnedata er allerede oppdatert nylig.', lastSync: last.synced_at, latestYear: last.latest_year }, 429)
  }

  try {
    const ssbRes = await fetch(SSB_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(SSB_QUERY),
      signal: AbortSignal.timeout(60_000),
    })
    if (!ssbRes.ok) throw new Error(`SSB svarte ${ssbRes.status}`)
    const result = transformSsbNames((await ssbRes.json()) as JsonStat2)

    const now = new Date().toISOString()
    const idByKey = new Map<string, string>()
    for (const part of chunk(result.names, 500)) {
      const { data, error } = await supabase
        .from('names')
        .upsert(
          part.map((n) => ({
            name: n.name, gender: n.gender, letters: n.letters,
            latest_year: n.latestYear, latest_count: n.latestCount, latest_rank: n.latestRank,
            latest_share: n.latestShare, trend: n.trend, timeless: n.timeless, updated_at: now,
          })),
          { onConflict: 'name,gender' },
        )
        .select('id, name, gender')
      if (error) throw new Error(`names: ${error.message}`)
      for (const row of data ?? []) idByKey.set(`${row.gender}|${row.name}`, row.id)
    }

    const statRows = result.stats.flatMap((s) => {
      const nameId = idByKey.get(`${s.gender}|${s.name}`)
      return nameId ? [{ name_id: nameId, year: s.year, count: s.count, share: s.share, rank: s.rank }] : []
    })
    for (const part of chunk(statRows, 3000)) {
      const { error } = await supabase.from('name_statistics').upsert(part, { onConflict: 'name_id,year' })
      if (error) throw new Error(`name_statistics: ${error.message}`)
    }

    await supabase.from('ssb_sync_log').insert({
      source_table: SSB_TABLE, source_updated: result.sourceUpdated, latest_year: result.latestYear,
      names_count: result.names.length, stats_count: statRows.length, status: 'ok',
    })
    return json({ ok: true, names: result.names.length, statistics: statRows.length, latestYear: result.latestYear })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await supabase.from('ssb_sync_log').insert({ source_table: SSB_TABLE, status: 'error', error: message })
    return json({ error: `Synkronisering mot SSB feilet: ${message}` }, 502)
  }
})
