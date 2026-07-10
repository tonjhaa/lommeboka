/**
 * Parser for FINN.no-bilannonser (server-rendret HTML, FINN Motor / mobility).
 *
 * Helt annen sidestruktur enn boligannonser (finnAdParser.ts): nøkkelfeltene
 * (årsmodell, kilometerstand, drivstoff) ligger i faste "hurtigfakta"-rader
 * (<span class="s-text-subtle">LABEL</span><p class="m-0 font-bold">VERDI</p>),
 * og prisen ligger i et innebygd JSON-LD Product-objekt
 * (<script type="application/ld+json">) i stedet for en egen
 * prisantydnings-span slik boligannonser har. Verifisert mot ekte annonser
 * (finn.no/mobility/item/<finnkode>) under research for denne funksjonen —
 * bevisst tolerant på samme måte som finnAdParser: manglende felt blir null,
 * kaster ikke.
 */

export type FinnCarFuelType = 'bensin' | 'diesel' | 'el' | 'hybrid'

export interface FinnCarAdData {
  finnkode: string
  tittel: string | null
  price: number | null
  year: number | null
  mileageKm: number | null
  fuelType: FinnCarFuelType | null
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Trekker <p class="m-0 font-bold">VERDI</p>-innholdet for en gitt hurtigfakta-label */
function quickFact(html: string, label: string): string | null {
  const re = new RegExp(
    `<span[^>]*class="[^"]*s-text-subtle[^"]*"[^>]*>\\s*${escapeRegExp(label)}\\s*</span>\\s*` +
    `<p[^>]*class="[^"]*font-bold[^"]*"[^>]*>([^<]*)</p>`
  )
  const m = html.match(re)
  if (!m) return null
  return m[1].replace(/ |&nbsp;|&#160;/g, ' ').trim()
}

/** Trekker første heltall ut av en tekst som «90 500 km» */
function parseIntFromText(text: string | null): number | null {
  if (!text) return null
  const digits = text.match(/[\d\s]+/)?.[0]?.replace(/\s/g, '')
  if (!digits) return null
  const n = parseInt(digits, 10)
  return Number.isFinite(n) ? n : null
}

function parseFuelType(text: string | null): FinnCarFuelType | null {
  if (!text) return null
  const t = text.toLowerCase()
  if (t.includes('hybrid')) return 'hybrid'
  if (t.includes('diesel')) return 'diesel'
  if (t.includes('bensin')) return 'bensin'
  if (t.includes('el')) return 'el'
  return null
}

/** Henter prisen fra JSON-LD-blokken med @type "Product" (offers.price) */
function extractProductPrice(html: string): number | null {
  const scripts = html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)
  for (const m of scripts) {
    try {
      const data = JSON.parse(m[1]) as { '@type'?: string; offers?: { price?: number } }
      if (data['@type'] === 'Product' && typeof data.offers?.price === 'number') {
        return data.offers.price
      }
    } catch {
      continue
    }
  }
  return null
}

/** Parser en FINN-bilannonseside. Kaster ikke — manglende felt blir null. */
export function parseFinnCarAd(html: string, finnkode: string): FinnCarAdData {
  const tittel = html.match(/property="og:title" content="([^"]+)"/i)?.[1]?.trim() ?? null

  return {
    finnkode,
    tittel,
    price: extractProductPrice(html),
    year: parseIntFromText(quickFact(html, 'Modellår')),
    mileageKm: parseIntFromText(quickFact(html, 'Kilometerstand')),
    fuelType: parseFuelType(quickFact(html, 'Drivstoff')),
  }
}

export class FinnCarLookupError extends Error {
  statusCode: number
  constructor(message: string, statusCode: number) {
    super(message)
    this.name = 'FinnCarLookupError'
    this.statusCode = statusCode
  }
}

/**
 * Henter og parser en FINN-bilannonse. Kjøres SERVER-SIDE (Vercel-funksjon) —
 * nettleseren blokkeres av CORS.
 */
export async function fetchFinnCarAd(finnkode: string): Promise<FinnCarAdData> {
  const url = `https://www.finn.no/mobility/item/${finnkode}`
  const res = await fetch(url, {
    redirect: 'follow',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'nb-NO,nb;q=0.9',
    },
  })
  if (res.status === 404) {
    throw new FinnCarLookupError('Fant ingen annonse med denne FINN-koden. Sjekk koden og prøv igjen.', 404)
  }
  if (!res.ok) {
    throw new FinnCarLookupError(`FINN svarte med ${res.status} — prøv igjen om litt.`, 502)
  }
  const html = await res.text()
  const data = parseFinnCarAd(html, finnkode)
  if (data.price === null) {
    throw new FinnCarLookupError(
      'Fant annonsen, men klarte ikke å lese prisen (annonsen kan være solgt/utløpt eller av en type kalkulatoren ikke støtter).',
      422
    )
  }
  return data
}
