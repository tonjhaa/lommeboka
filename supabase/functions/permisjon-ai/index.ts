import Anthropic from 'npm:@anthropic-ai/sdk'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SYSTEM_PROMPT = `Du er en norsk permisjonrådgiver som hjelper foreldre med å planlegge foreldrepermisjonen optimalt.

## Norsk regelverk — tall fra navikt/fp-stonadskonto (barn født etter 1. juli 2024)

**100 % dekningsgrad (49 uker totalt):**
- FORELDREPENGER_FØR_FØDSEL: 3 uker — separat konto, obligatorisk for mor FØR termin
- MØDREKVOTE_DAGER: 15 uker etter fødsel (av disse er 6 uker obligatorisk rett etter fødsel)
- FEDREKVOTE_DAGER: 15 uker (kan tas fra uke 7 etter fødsel, 2 uker kan tas rundt fødsel)
- FELLESPERIODE_DAGER: 16 uker (mor MÅ være i godkjent aktivitet om far tar fellesperioden)
- Mor disponerer totalt: 3 + 15 = 18 uker + andel av fellesperiode

**80 % dekningsgrad (ca. 61 uker + 1 dag totalt):**
- FORELDREPENGER_FØR_FØDSEL: 3 uker
- MØDREKVOTE_DAGER: 19 uker
- FEDREKVOTE_DAGER: 19 uker
- FELLESPERIODE_DAGER: 20 uker + 1 dag (101 stønadsdager)

**Tvillinger:** +17 uker (100%) / +21 uker + 1 dag (80%)
**For tidlig fødsel (< uke 33):** Perioden forlenges tilsvarende antall uker/dager

**Obligatoriske regler:**
- Mor SKAL starte permisjon senest 3 uker før termin (FORELDREPENGER_FØR_FØDSEL)
- Mor kan IKKE jobbe, ta ferie eller gjøre annet de første 6 ukene etter fødsel
- Fedrekvote kan tidligst starte uke 7 etter fødsel
- All permisjon MÅ tas ut før barnet fyller 3 år
- Ubrukte dager i fellesperioden er TAPT om de ikke tas ut innen fristen

**Ferie og pause:**
- Ferie kan "pause" foreldrepengeperioden — oppgis i NAV-søknaden ved å avslutte periode og starte ny etter ferien

**Barnehagestart:** 1. august i kalenderåret barnet fyller 1 år (norsk standard)

**Viktig om lærere:**
- Lærere har sommerferie ca. 22. juni – 14. august (~8 uker)
- Permisjonstid som overlapper sommerferie er "bortkastet" — partneren er hjemme uansett
- Anbefalt strategi: legg fedrekvoten til SKOLEÅRET (august–juni), ikke sommeren
- Alternativt: bruk sommerferie som "ferie-pause" i NAV-søknaden (da forskyves ukene til etter ferien)
- Far trenger INGEN dokumentasjon på aktivitet fra mor for å ta FEDREKVOTEN — kun fellesperioden krever at mor er i aktivitet
- Mor kan ta fellesperioden om sommeren slik at far sparer sine uker til skoleåret

**Gradert uttak:**
- Kan kombinere deltidsjobb med foreldrepenger (f.eks. 80% arbeid + 20% foreldrepenger)
- Perioden forlenges tilsvarende

Svar alltid på norsk. Vær konkret med datoer og uker. Forklar regelverket enkelt. Gi optimaliseringsforslag tilpasset brukerens situasjon.`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { messages, userContext } = await req.json()

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'ANTHROPIC_API_KEY ikke satt i Supabase secrets' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const client = new Anthropic({ apiKey })

    const systemWithContext = userContext
      ? `${SYSTEM_PROMPT}\n\n## Brukerens situasjon\n${userContext}`
      : SYSTEM_PROMPT

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemWithContext,
      messages,
    })

    return new Response(
      JSON.stringify({ content: response.content[0] }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
