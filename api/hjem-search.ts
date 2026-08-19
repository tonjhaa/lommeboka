// api/hjem-search.ts
// NB: .js-endelsen er PÅKREVD, se api/finn.ts for forklaring.
import { fetchHjemSearchPage } from '../src/domain/hjem/hjemSearchClient.js'

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
 * GET /api/hjem-search?page=1
 * Henter én side av det faste Boligsøk-kriteriet fra hjem.no (samme kriterier
 * som Finn-søket) server-side. Brukes av den daglige synk-rutinen.
 */
export default async function handler(req: Req, res: Res) {
  if (req.method && req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  const rawPage = req.query.page
  const page = parseInt((Array.isArray(rawPage) ? rawPage[0] : rawPage) ?? '1', 10)

  try {
    const data = await fetchHjemSearchPage(Number.isFinite(page) && page > 0 ? page : 1)
    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600')
    res.status(200).json(data)
  } catch {
    res.status(502).json({ error: 'Klarte ikke å hente søkeresultater fra hjem.no. Prøv igjen om litt.' })
  }
}
