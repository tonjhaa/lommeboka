/**
 * Parser for FINN.no-boligannonser (server-rendret HTML).
 *
 * FINN rendrer nøkkelfeltene som <dt>/<dd>-par («Totalpris», «Omkostninger»,
 * «Fellesgjeld», «Felleskost/mnd.», «Eieform», «Boligtype» …) pluss en egen
 * prisantydnings-span. Denne parseren er bevisst tolerant: felt som ikke
 * finnes i annonsen blir null/0, og kalleren viser hva som faktisk ble hentet.
 *
 * Brukes av api/finn.ts (Vercel-funksjon) og vite-dev-middleware — kjøres
 * aldri i nettleseren (CORS), kun server-side.
 */

export interface FinnAdData {
  finnkode: string
  tittel: string | null
  adresse: string | null
  /** Prisantydning i NOK — primærkilden for «Boligpris» i kalkulatoren */
  prisantydning: number | null
  /** Totalpris slik FINN oppgir den (prisantydning + omkostninger + ev. fellesgjeld) */
  totalpris: number | null
  /** Andel fellesgjeld (0 når ikke oppgitt) */
  fellesgjeld: number
  /** Omkostninger slik FINN oppgir dem (til visning — kalkulatoren beregner egne gebyrer) */
  omkostninger: number | null
  /** Felleskostnader per måned (0 når ikke oppgitt) */
  felleskostMnd: number
  /** Kommunale avgifter per år */
  kommunaleAvgArlig: number | null
  /** Eiendomsskatt per år */
  eiendomsskattArlig: number | null
  boligtypeRaw: string | null
  /** Kalkulatorens boligtype-kategori */
  boligtype: 'leilighet' | 'enebolig' | 'rekkehus' | 'tomannsbolig' | 'fritidsbolig' | null
  /** Kalkulatorens eierform — styrer dokumentavgift og fellesgjeld-regler */
  eieform: 'selveier' | 'andel' | 'aksje' | null
  /** Bruksareal (BRA) i m² */
  bruksareal: number | null
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Trekker første heltall ut av en tekst som «8 800 000 kr» / «5&nbsp;841 kr» */
function parseNok(text: string | null): number | null {
  if (!text) return null
  const digits = text.replace(/&nbsp;|&#160;| /g, ' ').match(/[\d][\d\s.]*/)?.[0]
  if (!digits) return null
  const n = parseInt(digits.replace(/[\s.]/g, ''), 10)
  return Number.isFinite(n) ? n : null
}

/** Henter <dd>-innholdet for en gitt <dt>-label */
function ddValue(html: string, label: string): string | null {
  const re = new RegExp(
    `<dt[^>]*>\\s*${escapeRegExp(label)}\\s*</dt>\\s*<dd[^>]*>([\\s\\S]*?)</dd>`,
    'i'
  )
  const m = html.match(re)
  return m ? stripTags(m[1]) : null
}

function parseEieform(text: string | null): FinnAdData['eieform'] {
  if (!text) return null
  const t = text.toLowerCase()
  if (t.includes('andel')) return 'andel'
  if (t.includes('aksje') || t.includes('obligasjon')) return 'aksje'
  if (t.includes('eier')) return 'selveier'
  return null
}

function parseBoligtype(text: string | null): FinnAdData['boligtype'] {
  if (!text) return null
  const t = text.toLowerCase()
  if (t.includes('enebolig')) return 'enebolig'
  if (t.includes('rekkehus')) return 'rekkehus'
  if (t.includes('tomannsbolig')) return 'tomannsbolig'
  if (t.includes('fritid') || t.includes('hytte')) return 'fritidsbolig'
  if (t.includes('leilighet')) return 'leilighet'
  return null
}

/** Parser en FINN-annonseside. Kaster ikke — manglende felt blir null/0. */
export function parseFinnAd(html: string, finnkode: string): FinnAdData {
  // Prisantydning: egen span ved siden av label — fall tilbake til dt/dd
  const prisSpan = html.match(/Prisantydning<\/span><span[^>]*>([^<]+)</i)?.[1] ?? null
  const prisantydning = parseNok(prisSpan) ?? parseNok(ddValue(html, 'Prisantydning'))

  const tittel =
    html.match(/property="og:title" content="([^"]+)"/i)?.[1]?.trim() ?? null
  const adresse =
    stripTags(html.match(/data-testid="object-address"[^>]*>([^<]+)/i)?.[1] ?? '') || null

  const eieformText = ddValue(html, 'Eieform') ?? ddValue(html, 'Eierform')

  return {
    finnkode,
    tittel,
    adresse,
    prisantydning,
    totalpris: parseNok(ddValue(html, 'Totalpris')),
    fellesgjeld: parseNok(ddValue(html, 'Fellesgjeld')) ?? 0,
    omkostninger: parseNok(ddValue(html, 'Omkostninger')),
    felleskostMnd: parseNok(ddValue(html, 'Felleskost/mnd.')) ?? 0,
    kommunaleAvgArlig: parseNok(ddValue(html, 'Kommunale avg.')),
    eiendomsskattArlig: parseNok(ddValue(html, 'Eiendomsskatt')),
    boligtypeRaw: ddValue(html, 'Boligtype'),
    boligtype: parseBoligtype(ddValue(html, 'Boligtype')),
    eieform: parseEieform(eieformText),
    bruksareal: parseNok(ddValue(html, 'Bruksareal')),
  }
}

/** Gyldig FINN-kode: 8–10 sifre (dagens koder er 9) */
export function isValidFinnkode(value: string): boolean {
  return /^\d{8,10}$/.test(value.trim())
}

/**
 * Henter og parser en FINN-annonse. Kjøres SERVER-SIDE (Vercel-funksjon /
 * vite-dev-middleware) — nettleseren blokkeres av CORS.
 */
export async function fetchFinnAd(finnkode: string): Promise<FinnAdData> {
  const url = `https://www.finn.no/realestate/homes/ad.html?finnkode=${finnkode}`
  const res = await fetch(url, {
    redirect: 'follow',
    headers: {
      // Realistiske headere — FINN serverer fullt server-rendret HTML til nettlesere
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'nb-NO,nb;q=0.9',
    },
  })
  if (res.status === 404) {
    throw new FinnLookupError('Fant ingen annonse med denne FINN-koden. Sjekk koden og prøv igjen.', 404)
  }
  if (!res.ok) {
    throw new FinnLookupError(`FINN svarte med ${res.status} — prøv igjen om litt.`, 502)
  }
  const html = await res.text()
  const data = parseFinnAd(html, finnkode)
  if (data.prisantydning === null && data.totalpris === null) {
    throw new FinnLookupError(
      'Fant annonsen, men klarte ikke å lese prisfeltene (annonsen kan være solgt/utløpt eller av en type kalkulatoren ikke støtter).',
      422
    )
  }
  return data
}

export class FinnLookupError extends Error {
  statusCode: number
  constructor(message: string, statusCode: number) {
    super(message)
    this.name = 'FinnLookupError'
    this.statusCode = statusCode
  }
}
