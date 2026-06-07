import type { VercelRequest, VercelResponse } from '@vercel/node'

export interface PriceResult {
  store: string
  price: number
  url: string
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { name } = req.query
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Missing name' })
  }
  const sanitized = name.slice(0, 200).replace(/[<>"']/g, '').trim()
  if (!sanitized) return res.status(400).json({ error: 'Invalid name' })

  try {
    const results = await searchPrisjakt(sanitized)
    return res.json({ results })
  } catch {
    return res.json({ results: [] })
  }
}

async function searchPrisjakt(query: string): Promise<PriceResult[]> {
  const url = `https://www.prisjakt.no/search.php?search=${encodeURIComponent(query)}`
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'no-NO,no;q=0.9,en;q=0.8',
      'Referer': 'https://www.prisjakt.no/',
    },
    signal: AbortSignal.timeout(9000),
  })

  if (!response.ok) return []
  const html = await response.text()
  return parse(html, query)
}

function parse(html: string, query: string): PriceResult[] {
  const results: PriceResult[] = []

  // ── Strategy 1: JSON-LD ItemList / Product ──────────────────────────────
  const jsonLdBlocks = [...html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)]
  for (const [, block] of jsonLdBlocks) {
    try {
      const data = JSON.parse(block)
      collectFromJsonLd(Array.isArray(data) ? data : [data], results)
    } catch { /* skip */ }
  }

  // ── Strategy 2: __NEXT_DATA__ / Nuxt __NUXT_DATA__ ────────────────────
  if (results.length === 0) {
    const nextMatch = html.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i)
    if (nextMatch) {
      try {
        const root = JSON.parse(nextMatch[1])
        const props = root?.props?.pageProps ?? {}
        const products = props.products ?? props.items ?? props.searchResult?.products ?? []
        for (const p of (Array.isArray(products) ? products : []).slice(0, 8)) {
          pushResult(results, {
            store: p.shopName ?? p.sellerName ?? p.shop?.name ?? '',
            price: p.lowestPrice ?? p.price ?? p.currentPrice ?? 0,
            url: p.shopUrl ?? p.url ?? p.offerUrl ?? '',
          })
        }
      } catch { /* skip */ }
    }
  }

  // ── Strategy 3: Inline JSON variables (prisjakt stores data in window.__*) ──
  if (results.length === 0) {
    const storeDataMatch = html.match(/window\.__(?:INITIAL|STORE|APP)(?:_STATE|_DATA)?__\s*=\s*({[\s\S]{10,50000}?});/)
    if (storeDataMatch) {
      try {
        const root = JSON.parse(storeDataMatch[1])
        collectFromJsonLd(flatten(root), results)
      } catch { /* skip */ }
    }
  }

  // ── Strategy 4: HTML price patterns ────────────────────────────────────
  if (results.length === 0) {
    const rows = html.split('\n')
    for (const row of rows) {
      const priceMatch = row.match(/(\d[\d\s]{1,6})\s*kr/i)
      if (!priceMatch) continue
      const price = parseNOK(priceMatch[1])
      if (!price) continue
      const storeMatch = row.match(/(?:href|src)="([^"]{10,})"/)
      const storeHref = storeMatch?.[1] ?? ''
      let store = ''
      try { store = new URL(storeHref).hostname.replace('www.', '') } catch { store = '' }
      if (store && store !== 'prisjakt.no') {
        results.push({ store, price, url: safeUrl(storeHref) })
      }
    }
  }

  // Deduplicate by store, keep cheapest per store
  const byStore = new Map<string, PriceResult>()
  for (const r of results) {
    if (!r.store || !r.price) continue
    const existing = byStore.get(r.store)
    if (!existing || r.price < existing.price) byStore.set(r.store, r)
  }

  const sorted = [...byStore.values()].sort((a, b) => a.price - b.price)

  // Fallback: direct Prisjakt search link if nothing found
  if (sorted.length === 0) {
    return [{
      store: 'Prisjakt.no (søk)',
      price: 0,
      url: `https://www.prisjakt.no/search.php?search=${encodeURIComponent(query)}`,
    }]
  }

  return sorted.slice(0, 5)
}

function collectFromJsonLd(items: unknown[], results: PriceResult[]) {
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    const obj = item as Record<string, unknown>
    if (obj['@type'] === 'ItemList' && Array.isArray(obj.itemListElement)) {
      for (const el of obj.itemListElement) {
        const product = (el as Record<string, unknown>).item ?? el
        collectFromJsonLd([product], results)
      }
    }
    if ((obj['@type'] === 'Product' || obj['@type'] === 'Offer') && obj.offers) {
      const offers = Array.isArray(obj.offers) ? obj.offers : [obj.offers]
      for (const offer of offers) {
        const o = offer as Record<string, unknown>
        const seller = (o.seller as Record<string, unknown>)?.name as string ?? ''
        pushResult(results, { store: seller, price: o.price, url: o.url })
      }
    }
    if (obj['@type'] === 'Offer') {
      const seller = (obj.seller as Record<string, unknown>)?.name as string ?? ''
      pushResult(results, { store: seller, price: obj.price, url: obj.url })
    }
    if (obj['@graph']) collectFromJsonLd(obj['@graph'] as unknown[], results)
  }
}

function pushResult(results: PriceResult[], r: { store: unknown; price: unknown; url: unknown }) {
  const price = parseNOK(String(r.price ?? ''))
  const store = typeof r.store === 'string' ? r.store.trim() : ''
  const url = safeUrl(typeof r.url === 'string' ? r.url : '')
  if (price && store) results.push({ store, price, url })
}

function safeUrl(u: string): string {
  try {
    const p = new URL(u, 'https://www.prisjakt.no')
    return (p.protocol === 'https:' || p.protocol === 'http:') ? p.href : ''
  } catch { return '' }
}

function parseNOK(raw: string): number | null {
  const n = parseFloat(raw.replace(/\s/g, '').replace(',', '.'))
  return isFinite(n) && n >= 1 && n <= 500_000 ? Math.round(n) : null
}

function flatten(obj: unknown): unknown[] {
  if (!obj || typeof obj !== 'object') return []
  if (Array.isArray(obj)) return obj.flatMap(flatten)
  const values = Object.values(obj as object)
  return [...values, ...values.flatMap(flatten)]
}
