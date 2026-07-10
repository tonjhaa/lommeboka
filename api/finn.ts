// api/finn.ts
// NB: .js-endelsen er PÅKREVD: package.json har "type":"module", så Vercel
// kjører funksjonen som ESM — Node-ESM krever eksplisitt endelse i relative
// imports (uten den: ERR_MODULE_NOT_FOUND i /var/task). TS mapper .js → .ts.
import { fetchFinnAd, isValidFinnkode, FinnLookupError } from '../src/domain/finn/finnAdParser.js'
import { fetchFinnCarAd, FinnCarLookupError } from '../src/domain/finn/finnCarAdParser.js'

// Minimal strukturell typing — unngår @vercel/node-avhengighet.
// (api/ ligger utenfor tsconfig-include; Vercel bygger funksjonen med esbuild.)
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
 * GET /api/finn?finnkode=468534269[&type=car]
 * Henter og parser en FINN-annonse server-side (CORS hindrer nettleseren).
 * type=housing (default, bakoverkompatibel) → boligannonse. type=car → bilannonse.
 * Personlig bruksmønster: enkeltoppslag initiert av brukeren, med CDN-cache
 * så samme annonse ikke hentes på nytt innen en time.
 */
export default async function handler(req: Req, res: Res) {
  if (req.method && req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  const rawFinnkode = req.query.finnkode
  const finnkode = (Array.isArray(rawFinnkode) ? rawFinnkode[0] : rawFinnkode ?? '').trim()
  const rawType = req.query.type
  const type = Array.isArray(rawType) ? rawType[0] : rawType

  if (!isValidFinnkode(finnkode)) {
    res.status(400).json({ error: 'Ugyldig FINN-kode — lim inn tallet fra annonsen (8–10 sifre).' })
    return
  }

  try {
    const data = type === 'car' ? await fetchFinnCarAd(finnkode) : await fetchFinnAd(finnkode)
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
    res.status(200).json(data)
  } catch (err) {
    if (err instanceof FinnLookupError || err instanceof FinnCarLookupError) {
      res.status(err.statusCode).json({ error: err.message })
      return
    }
    res.status(502).json({ error: 'Klarte ikke å hente annonsen fra FINN. Prøv igjen, eller fyll inn tallene manuelt.' })
  }
}
