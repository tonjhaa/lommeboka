import type { VercelRequest, VercelResponse } from '@vercel/node'
import { promises as dns } from 'dns'

// Reject private/loopback/link-local IPv4 and IPv6 ranges
function isPrivateAddress(ip: string): boolean {
  const lower = ip.toLowerCase()
  // IPv4-mapped IPv6 (::ffff:x.x.x.x) — recurse on the embedded IPv4
  if (lower.startsWith('::ffff:')) return isPrivateAddress(ip.slice(7))
  // 6to4 (2002::/16) embeds an IPv4 in the next two groups
  if (lower.startsWith('2002:')) {
    const hex = lower.split(':')[1] ?? ''
    if (hex.length === 4) {
      const a = parseInt(hex.slice(0, 2), 16)
      const b = parseInt(hex.slice(2, 4), 16)
      const next = lower.split(':')[2] ?? ''
      const c = parseInt(next.slice(0, 2), 16)
      const d = parseInt(next.slice(2, 4), 16)
      return isPrivateAddress(`${a}.${b}.${c}.${d}`)
    }
  }
  // NAT64 (64:ff9b::/96 og 64:ff9b:1::/48) — kan translere private IPv4-adresser
  if (lower.startsWith('64:ff9b:')) return true
  // IPv6 med innebygd dotted-IPv4 (f.eks. ::192.168.1.1 eller 64:ff9b::10.0.0.1)
  if (lower.includes('.')) {
    const lastColon = lower.lastIndexOf(':')
    return isPrivateAddress(lower.slice(lastColon + 1))
  }
  // IPv6 loopback / unspecified / link-local / ULA
  if (lower === '::1' || lower === '::' || lower.startsWith('fe80:') ||
      lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('100::')) return true
  // Offentlig IPv6 (inneholder ':' og matchet ingen privat sjekk) → tillatt
  if (lower.includes(':')) return false
  // IPv4
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true // ukjent format → blokker
  }
  const [a, b] = parts
  return (
    a === 127 ||                          // 127.0.0.0/8 loopback
    a === 10 ||                           // 10.0.0.0/8 private
    a === 0 ||                            // 0.0.0.0/8 unspecified
    (a === 172 && b >= 16 && b <= 31) ||  // 172.16.0.0/12 private
    (a === 192 && b === 168) ||           // 192.168.0.0/16 private
    (a === 169 && b === 254) ||           // 169.254.0.0/16 link-local
    (a === 100 && b >= 64 && b <= 127)    // 100.64.0.0/10 shared address
  )
}

async function validateAndFetch(rawUrl: string): Promise<Response> {
  const parsed = new URL(rawUrl)

  if (!['https:', 'http:'].includes(parsed.protocol)) {
    throw new Error('Only http/https allowed')
  }

  const hostname = parsed.hostname.toLowerCase().replace(/\.+$/, '')

  // Resolve all addresses and reject if any is private
  const addresses = await dns.lookup(hostname, { all: true })
  for (const { address } of addresses) {
    if (isPrivateAddress(address)) {
      throw new Error('Hostname resolves to a private address')
    }
  }

  // Fetch without following redirects — re-validate Location if needed
  const response = await fetch(parsed.href, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'no-NO,no;q=0.9,en;q=0.8',
    },
    redirect: 'manual',
    signal: AbortSignal.timeout(8000),
  })

  // Handle redirects safely (re-validate destination)
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location')
    if (!location) throw new Error('Redirect with no Location header')
    return validateAndFetch(new URL(location, parsed.href).href)
  }

  return response
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
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
    const response = await validateAndFetch(targetUrl)

    if (!response.ok) {
      return res.status(502).json({ error: 'Could not fetch product page' })
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
      } catch { /* invalid JSON-LD */ }
    }

    // ── Fallback: og:price:amount ─────────────────────────────────────────────
    if (!price) {
      const ogPrice = metaContent(html, 'og:price:amount') ?? metaContent(html, 'product:price:amount')
      if (ogPrice) price = parseNOKPrice(ogPrice)
    }

    // ── Fallback: heuristic Norwegian price patterns ──────────────────────────
    if (!price) {
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

    const category = inferCategory(name, html)

    return res.json({ name: name || null, price: price || null, category })
  } catch {
    return res.status(500).json({ error: 'Could not retrieve product information' })
  }
}

function metaContent(html: string, property: string): string | null {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']{1,400})["']`, 'i')
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']{1,400})["'][^>]+(?:property|name)=["']${property}["']`, 'i')
  return html.match(re)?.[1] ?? html.match(re2)?.[1] ?? null
}

function extractPrice(obj: Record<string, unknown>): number | null {
  if (!obj || typeof obj !== 'object') return null
  if (obj['@type'] === 'Offer' || obj['@type'] === 'AggregateOffer') {
    // priceSpecification takes priority over price (avoids IDs/timestamps in price field)
    const spec = obj.priceSpecification as Record<string, unknown> | undefined
    if (spec?.price != null) {
      const p = parseNOKPrice(String(spec.price)); if (p) return p
    }
    if (obj.price != null) {
      const p = parseNOKPrice(String(obj.price)); if (p) return p
    }
  }
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
  const trimmed = raw.trim()
  // Try direct float first — handles JSON-LD values like "15499.000000000"
  const direct = parseFloat(trimmed)
  if (isFinite(direct) && direct >= 1 && direct <= 500_000) return Math.round(direct)
  // Norwegian format: dot as thousands separator (only strip dot followed by EXACTLY 3 digits)
  const cleaned = trimmed.replace(/\s/g, '').replace(/\.(?=\d{3}(?!\d))/g, '').replace(',', '.')
  const n = parseFloat(cleaned)
  return isFinite(n) && n >= 1 && n <= 500_000 ? Math.round(n) : null
}

function inferCategory(name: string, html: string): string | null {
  const text = (name + ' ' + html.slice(0, 20000)).toLowerCase()
  if (/bilsete|bilstol|baksete|besafe|axkid|maxi.cosi|cybex cloud|britax/.test(text)) return 'Transport'
  if (/barnevogn|bugaboo|stokke|cybex balios|uppababy|bæresele|bærestol|regnslag/.test(text)) return 'Transport'
  if (/vugge|babyseng|sovepose|baby.alarm|lydovervåk|mørkelegging/.test(text)) return 'Søvn'
  if (/stellebord|stelleunderlag|bleie|bleier|termometer|neglesaks|stellekrem|sesamolje/.test(text)) return 'Stell'
  if (/brystpumpe|tåteflaske|sterilisator|smokk|smekke|bibs|høystol|morsmelk/.test(text)) return 'Ernæring'
  if (/babybody|sparkebukse|sparkedress|babylue|babyvott|ytterdrakt|overall/.test(text)) return 'Klær'
  if (/babybadekar|badetermometer|babysåpe|babyhåndkle/.test(text)) return 'Bad'
  if (/gymstativ|aktivitetsteppe|babyleke|rasler/.test(text)) return 'Lek & utvikling'
  return null
}
