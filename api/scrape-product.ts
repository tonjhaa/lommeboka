import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET')

  const { url } = req.query
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing url parameter' })
  }

  let targetUrl: string
  try {
    targetUrl = new URL(url).href
  } catch {
    return res.status(400).json({ error: 'Invalid URL' })
  }

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'no-NO,no;q=0.9,en;q=0.8',
      },
      signal: AbortSignal.timeout(8000),
    })

    if (!response.ok) {
      return res.status(502).json({ error: `Site returned ${response.status}` })
    }

    const html = await response.text()

    // ── Product name ──────────────────────────────────────────────────────────
    const ogTitle = metaContent(html, 'og:title')
    const metaTitle = html.match(/<title[^>]*>([^<]{3,200})<\/title>/i)?.[1]?.trim()
    const h1 = html.match(/<h1[^>]*>\s*([^<]{3,200})\s*<\/h1>/i)?.[1]?.trim()

    const name = (ogTitle || h1 || metaTitle || '').replace(/\s+/g, ' ').trim()

    // ── Price from JSON-LD ────────────────────────────────────────────────────
    let price: number | null = null

    const jsonLdBlocks = [...html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)]
    for (const [, block] of jsonLdBlocks) {
      try {
        const data = JSON.parse(block)
        const products = Array.isArray(data) ? data : data['@graph'] ?? [data]
        for (const item of products) {
          const p = extractPrice(item)
          if (p) { price = p; break }
        }
        if (price) break
      } catch { /* invalid JSON-LD, skip */ }
    }

    // ── Fallback: og:price:amount ─────────────────────────────────────────────
    if (!price) {
      const ogPrice = metaContent(html, 'og:price:amount') ?? metaContent(html, 'product:price:amount')
      if (ogPrice) price = parseNOKPrice(ogPrice)
    }

    // ── Fallback: heuristic regex on common price patterns ───────────────────
    if (!price) {
      // Look for Norwegian price patterns: "1 299 kr", "1299,-", "1 299,00"
      const pricePatterns = [
        /class="[^"]*price[^"]*"[^>]*>\s*(?:kr\.?\s*)?([\d\s.,]+)\s*(?:kr|,-)?/i,
        /(?:pris|price)[^>]*>\s*(?:kr\.?\s*)?([\d\s.,]+)\s*(?:kr|,-)/i,
        /([\d\s]{3,8}(?:,\d{2})?)\s*kr/,
        /([\d\s]{3,8}),-/,
      ]
      for (const re of pricePatterns) {
        const m = html.match(re)
        if (m) {
          const p = parseNOKPrice(m[1])
          if (p && p > 1 && p < 1_000_000) { price = p; break }
        }
      }
    }

    return res.json({ name: name || null, price: price || null })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return res.status(500).json({ error: msg })
  }
}

function metaContent(html: string, property: string): string | null {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']{1,400})["']`, 'i')
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']{1,400})["'][^>]+(?:property|name)=["']${property}["']`, 'i')
  return html.match(re)?.[1] ?? html.match(re2)?.[1] ?? null
}

function extractPrice(obj: Record<string, unknown>): number | null {
  if (!obj || typeof obj !== 'object') return null
  // Direct offer
  if (obj['@type'] === 'Offer' && obj.price != null) {
    return parseNOKPrice(String(obj.price))
  }
  // Product with offers
  if (obj.offers) {
    const offers = Array.isArray(obj.offers) ? obj.offers : [obj.offers]
    for (const o of offers) {
      const p = extractPrice(o as Record<string, unknown>)
      if (p) return p
    }
  }
  return null
}

function parseNOKPrice(raw: string): number | null {
  // Remove thousands separators (space or dot), normalise decimal comma
  const cleaned = raw.replace(/\s/g, '').replace(/\.(?=\d{3})/g, '').replace(',', '.')
  const n = parseFloat(cleaned)
  return isFinite(n) && n > 0 ? Math.round(n) : null
}
