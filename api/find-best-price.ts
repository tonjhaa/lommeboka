import type { VercelRequest, VercelResponse } from '@vercel/node'
import { promises as dns } from 'dns'

export interface PriceResult {
  store: string
  price: number
  url: string
}

// ── SSRF guard (reused from scrape-product.ts) ────────────────────────────────
function isPrivateAddress(ip: string): boolean {
  if (ip === '::1' || ip === '::' || ip.startsWith('fe80:') || ip.startsWith('fc') || ip.startsWith('fd')) return true
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some(isNaN)) return false
  const [a, b, c] = parts
  return (
    a === 127 || a === 10 || a === 0 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    (a === 100 && b >= 64 && b <= 127)
  )
}

async function safeFetch(rawUrl: string): Promise<Response> {
  const parsed = new URL(rawUrl)
  if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('Invalid protocol')
  const hostname = parsed.hostname.toLowerCase().replace(/\.+$/, '')
  const addresses = await dns.lookup(hostname, { all: true })
  for (const { address } of addresses) {
    if (isPrivateAddress(address)) throw new Error('Private address')
  }
  const response = await fetch(parsed.href, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'no-NO,no;q=0.9,en;q=0.8',
    },
    redirect: 'manual',
    signal: AbortSignal.timeout(8000),
  })
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location')
    if (!location) throw new Error('Redirect with no Location header')
    return safeFetch(new URL(location, parsed.href).href)
  }
  return response
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { name, storeUrl } = req.query
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Missing name' })
  }
  const sanitizedName = name.slice(0, 200).replace(/[<>"']/g, '').trim()

  // If a storeUrl is provided, re-scrape it for the current price
  let currentPrice: number | null = null
  let currentStore = ''
  if (storeUrl && typeof storeUrl === 'string') {
    try {
      const parsed = new URL(storeUrl)
      if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('Invalid protocol')
      const response = await safeFetch(storeUrl)
      if (response.ok) {
        const html = await response.text()
        currentPrice = extractPriceFromHtml(html)
        currentStore = parsed.hostname.replace('www.', '')
      }
    } catch { /* skip */ }
  }

  // Build search links for major Norwegian baby stores
  const q = encodeURIComponent(sanitizedName)
  const searchLinks: PriceResult[] = [
    { store: 'Prisjakt', price: 0, url: `https://www.prisjakt.no/search.php?search=${q}` },
    { store: 'Jollyroom', price: 0, url: `https://www.jollyroom.no/search?query=${q}` },
    { store: 'Barnashus', price: 0, url: `https://www.barnashus.no/search?q=${q}` },
    { store: 'Babyshop', price: 0, url: `https://www.babyshop.com/no/search?q=${q}` },
    { store: 'Kids Brand Store', price: 0, url: `https://www.kidsbrandstore.no/search?q=${q}` },
    { store: 'BabyCare', price: 0, url: `https://www.babycare.no/search/?q=${q}` },
  ]

  const results: PriceResult[] = []
  if (currentPrice && currentStore) {
    results.push({ store: currentStore, price: currentPrice, url: storeUrl as string })
  }

  return res.json({ results, searchLinks, currentPrice, currentStore })
}

// ── Price extraction (same logic as scrape-product.ts) ───────────────────────

function extractPriceFromHtml(html: string): number | null {
  // JSON-LD
  const jsonLdBlocks = [...html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)]
  for (const [, block] of jsonLdBlocks) {
    try {
      const data = JSON.parse(block)
      const products = Array.isArray(data) ? data : data['@graph'] ?? [data]
      for (const item of products) {
        const p = extractPriceFromJsonLd(item as Record<string, unknown>)
        if (p) return p
      }
    } catch { /* skip */ }
  }
  // og:price:amount
  const ogPrice = metaContent(html, 'og:price:amount') ?? metaContent(html, 'product:price:amount')
  if (ogPrice) { const p = parseNOKPrice(ogPrice); if (p) return p }
  return null
}

function extractPriceFromJsonLd(obj: Record<string, unknown>): number | null {
  if (!obj || typeof obj !== 'object') return null
  if (obj['@type'] === 'Offer' || obj['@type'] === 'AggregateOffer') {
    const spec = obj.priceSpecification as Record<string, unknown> | undefined
    if (spec?.price != null) { const p = parseNOKPrice(String(spec.price)); if (p) return p }
    if (obj.price != null) { const p = parseNOKPrice(String(obj.price)); if (p) return p }
  }
  if (obj.offers) {
    const offers = Array.isArray(obj.offers) ? obj.offers : [obj.offers]
    for (const o of offers) {
      const p = extractPriceFromJsonLd(o as Record<string, unknown>)
      if (p) return p
    }
  }
  return null
}

function metaContent(html: string, property: string): string | null {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']{1,400})["']`, 'i')
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']{1,400})["'][^>]+(?:property|name)=["']${property}["']`, 'i')
  return html.match(re)?.[1] ?? html.match(re2)?.[1] ?? null
}

function parseNOKPrice(raw: string): number | null {
  const trimmed = raw.trim()
  const direct = parseFloat(trimmed)
  if (isFinite(direct) && direct >= 1 && direct <= 500_000) return Math.round(direct)
  const cleaned = trimmed.replace(/\s/g, '').replace(/\.(?=\d{3}(?!\d))/g, '').replace(',', '.')
  const n = parseFloat(cleaned)
  return isFinite(n) && n >= 1 && n <= 500_000 ? Math.round(n) : null
}
