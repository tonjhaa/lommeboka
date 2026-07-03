import { fetchFinnAd, isValidFinnkode, FinnLookupError } from '../src/domain/finn/finnAdParser'

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
 * GET /api/finn?finnkode=468534269
 * Henter og parser en FINN-boligannonse server-side (CORS hindrer nettleseren).
 * Personlig bruksmønster: enkeltoppslag initiert av brukeren, med CDN-cache
 * så samme annonse ikke hentes på nytt innen en time.
 */
export default async function handler(req: Req, res: Res) {
  if (req.method && req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  const raw = req.query.finnkode
  const finnkode = (Array.isArray(raw) ? raw[0] : raw ?? '').trim()

  if (!isValidFinnkode(finnkode)) {
    res.status(400).json({ error: 'Ugyldig FINN-kode — lim inn tallet fra annonsen (8–10 sifre).' })
    return
  }

  try {
    const data = await fetchFinnAd(finnkode)
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
    res.status(200).json(data)
  } catch (err) {
    if (err instanceof FinnLookupError) {
      res.status(err.statusCode).json({ error: err.message })
      return
    }
    res.status(502).json({ error: 'Klarte ikke å hente annonsen fra FINN. Prøv igjen, eller fyll inn tallene manuelt.' })
  }
}
