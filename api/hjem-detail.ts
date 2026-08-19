// api/hjem-detail.ts
// NB: .js-endelsen er PÅKREVD, se api/finn.ts for forklaring.
import { fetchHjemAdDetails, HjemLookupError } from '../src/domain/hjem/hjemAdParser.js'

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
 * GET /api/hjem-detail?ids=id1,id2,id3
 * Henter og parser én eller flere hjem.no-annonser i én batch server-side.
 * Ugyldige id-er filtreres bort stille (se isValidHjemId).
 */
export default async function handler(req: Req, res: Res) {
  if (req.method && req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  const rawIds = req.query.ids
  const ids = (Array.isArray(rawIds) ? rawIds[0] : rawIds ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)

  if (ids.length === 0) {
    res.status(400).json({ error: 'Mangler ids-parameter (kommaseparert liste av hjem.no property-id-er).' })
    return
  }

  try {
    const results = await fetchHjemAdDetails(ids)
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
    res.status(200).json({ results })
  } catch (err) {
    if (err instanceof HjemLookupError) {
      res.status(err.statusCode).json({ error: err.message })
      return
    }
    res.status(502).json({ error: 'Klarte ikke å hente annonsene fra hjem.no. Prøv igjen om litt.' })
  }
}
