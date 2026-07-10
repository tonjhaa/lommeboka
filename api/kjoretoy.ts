// NB: .js-endelsen er PÅKREVD: package.json har "type":"module", så Vercel
// kjører funksjonen som ESM — Node-ESM krever eksplisitt endelse i relative
// imports. TS mapper .js → .ts.
import { mapKjoretoyResponse, isValidRegnr } from '../src/domain/vehicle/kjoretoyMapper.js'

// Minimal strukturell typing — unngår @vercel/node-avhengighet.
interface Req {
  method?: string
  query: Record<string, string | string[] | undefined>
}
interface Res {
  status(code: number): Res
  setHeader(name: string, value: string): void
  json(body: unknown): void
}

/**
 * GET /api/kjoretoy?regnr=EK12345
 *
 * Slår opp kjøretøydata hos Statens vegvesen (Autosys enkeltoppslag) og
 * returnerer modell, årsmodell, drivstoff og EU-kontrollfrist.
 *
 * Krever gratis API-nøkkel fra Vegvesenet i env-variabelen SVV_API_KEY:
 * registrer deg på https://autosys-kjoretoy-api.atlas.vegvesen.no
 * (tjenesten «Enkeltoppslag kjøretøyopplysninger») og legg nøkkelen inn i
 * Vercel-prosjektets Environment Variables. Uten nøkkel svarer endepunktet
 * 503 og UI viser en forklarende melding.
 */
export default async function handler(req: Req, res: Res) {
  if (req.method && req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const apiKey = process.env.SVV_API_KEY
  if (!apiKey) {
    res.status(503).json({
      error: 'Regnr-oppslag er ikke konfigurert ennå (mangler SVV_API_KEY). Fyll inn tallene manuelt.',
    })
    return
  }

  const raw = req.query.regnr
  const regnr = (Array.isArray(raw) ? raw[0] : raw ?? '').replace(/\s/g, '').toUpperCase()
  if (!isValidRegnr(regnr)) {
    res.status(400).json({ error: 'Ugyldig registreringsnummer — f.eks. EK12345.' })
    return
  }

  try {
    const svvRes = await fetch(
      `https://akfell-datautlevering.atlas.vegvesen.no/enkeltoppslag/kjoretoydata?kjennemerke=${regnr}`,
      { headers: { 'SVV-Authorization': `Apikey ${apiKey}` } }
    )
    if (svvRes.status === 403 || svvRes.status === 401) {
      res.status(503).json({ error: 'API-nøkkelen mot Vegvesenet ble avvist — sjekk SVV_API_KEY.' })
      return
    }
    if (!svvRes.ok) {
      res.status(502).json({ error: `Vegvesenet svarte med ${svvRes.status} — prøv igjen om litt.` })
      return
    }
    const data = mapKjoretoyResponse(await svvRes.json())
    if (!data.modelName && data.year === null) {
      res.status(404).json({ error: 'Fant ingen kjøretøydata for dette registreringsnummeret.' })
      return
    }
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800')
    res.status(200).json(data)
  } catch {
    res.status(502).json({ error: 'Klarte ikke å nå Vegvesenet. Prøv igjen, eller fyll inn manuelt.' })
  }
}
