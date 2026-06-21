import type { VercelRequest, VercelResponse } from '@vercel/node'

// URL-allowlist. Brukeren kan KUN velge en nøkkel her — aldri sende vilkårlig URL.
// → SSRF nær null. redirect:'error' som forsvar i dybden (NAV-API-et skal ikke redirecte).
const SOURCE_URLS: Record<string, string> = {
  grunnbelop: 'https://g.nav.no/api/v1/grunnbeloep',
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { source } = req.query
  if (typeof source !== 'string' || !Object.prototype.hasOwnProperty.call(SOURCE_URLS, source)) {
    return res.status(400).json({ error: 'Unknown source' })
  }

  try {
    const upstream = await fetch(SOURCE_URLS[source], {
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
      headers: { Accept: 'application/json' },
    })
    if (!upstream.ok) {
      return res.status(502).json({ error: 'Upstream returned an error' })
    }
    const json = await upstream.json()
    // Cache 1 time på Vercel-edge — G endres sjelden; reduserer last mot NAV.
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
    return res.status(200).json(json)
  } catch {
    return res.status(502).json({ error: 'Could not fetch source' })
  }
}
