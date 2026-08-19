/**
 * Klient/parser for hjem.no sitt annonsedetalj-API (JSON, ikke HTML-scraping).
 *
 * apigw.hjem.no/search-backend/api/v2/properties?ids[]=... er det samme
 * offentlige, ikke-autentiserte endepunktet den rendrede annonsesiden selv
 * bruker — bekreftet fungerende med et rått fetch-kall. Støtter FLERE id-er
 * i én forespørsel (`ids[]=a&ids[]=b&...`), så nye treff fra et søk kan
 * detalj-hentes i én batch i stedet for ett kall per annonse.
 *
 * Feltnavnene i `HjemAdData` er bevisst holdt like `FinnAdData` sine
 * (soverom, balkong, garasjeParkeringChip, beskrivelse, felleskostnaderTekst)
 * slik at synk-prompten kan vurdere begge kilder med samme logikk.
 */

export interface HjemAdData {
  id: string
  tittel: string | null
  adresse: string | null
  prisantydning: number | null
  totalpris: number | null
  fellesgjeld: number
  omkostninger: number | null
  felleskostMnd: number
  boligtypeRaw: string | null
  boligtype: 'leilighet' | 'enebolig' | 'rekkehus' | 'tomannsbolig' | 'fritidsbolig' | null
  bruksareal: number | null
  soverom: number | null
  byggeaar: number | null
  /** Rå fasilitet-nøkler fra hjem.no, f.eks. ["balcony", "garageParking", "elevator"] */
  fasiliteter: string[]
  balkong: boolean
  /**
   * Fasilitet-nøkkel "garageParking" er til stede. hjem.no skiller IKKE mellom faktisk
   * garasje og ren (leie/venteliste-)parkeringsplass i denne fasiliteten — bruk
   * `beskrivelse` for å avgjøre hvilket av de to det faktisk er.
   */
  garasjeParkeringChip: boolean
  /** Fritekst-beskrivelse — eneste pålitelige kilde til om en ev. garasje/p-plass faktisk følger med handelen */
  beskrivelse: string | null
  /** Fritekst om hva fellesutgiftene dekker — her fremgår ev. "Lånekostnader" (IN-ordning/individuell nedbetaling) */
  felleskostnaderTekst: string | null
  /** Første publiseringsdato (ISO 8601) — hjem.no eksponerer denne direkte, i motsetning til FINN */
  annonsertDato: string | null
}

interface RawPropertyDetail {
  id: string
  title?: string | null
  address?: { display_name?: string | null } | null
  construction_year?: number | null
  first_publish_date?: string | null
  description?: { plain?: string | null } | null
  facilities?: string[] | null
  type?: string[] | null
  details?: {
    bedrooms?: { value?: number | null } | null
    primary_room?: { value?: number | null } | null
    usage_area?: { value?: number | null } | null
    area_measurement?: {
      internal?: { value?: number | null } | null
      balcony?: { value?: number | null } | null
      terrace?: { value?: number | null } | null
    } | null
  } | null
  prices?: {
    asking_price?: { amount?: number | null } | null
    total_price?: { amount?: number | null } | null
    joint_debt?: { amount?: number | null } | null
    adding_cost?: { amount?: number | null } | null
    shared_cost?: { amount?: number | null } | null
  } | null
  contract_details?: {
    included_in_shared_cost?: { plain?: string | null } | null
  } | null
}

const MAX_TEXT_LENGTH = 4000

/** hjem.no sine "plain"-tekstfelt inneholder likevel rå HTML-tags (<b>, <br/>, <li>) — fjern dem */
function stripTags(html: string | null | undefined): string | null {
  if (!html) return null
  const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  return text ? text.slice(0, MAX_TEXT_LENGTH) : null
}

function nonZero(value: number | null | undefined): number | null {
  return typeof value === 'number' && value > 0 ? value : null
}

function parseBoligtype(types: string[] | null | undefined): HjemAdData['boligtype'] {
  const t = (types ?? []).join(' ').toLowerCase()
  if (t.includes('house') && !t.includes('terraced') && !t.includes('semi')) return 'enebolig'
  if (t.includes('terraced')) return 'rekkehus'
  if (t.includes('semi')) return 'tomannsbolig'
  if (t.includes('cabin') || t.includes('leisure')) return 'fritidsbolig'
  if (t.includes('apartment')) return 'leilighet'
  return null
}

/** Parser ett element fra properties-API-responsen. Kaster ikke — manglende felt blir null/0. */
export function parseHjemAd(raw: RawPropertyDetail): HjemAdData {
  const facilities = raw.facilities ?? []
  const measurement = raw.details?.area_measurement
  const bruksareal =
    nonZero(measurement?.internal?.value) ??
    nonZero(raw.details?.usage_area?.value) ??
    nonZero(raw.details?.primary_room?.value)

  return {
    id: raw.id,
    tittel: raw.title?.trim() || null,
    adresse: raw.address?.display_name?.trim() || null,
    prisantydning: raw.prices?.asking_price?.amount ?? null,
    totalpris: raw.prices?.total_price?.amount ?? null,
    fellesgjeld: raw.prices?.joint_debt?.amount ?? 0,
    omkostninger: raw.prices?.adding_cost?.amount ?? null,
    felleskostMnd: raw.prices?.shared_cost?.amount ?? 0,
    boligtypeRaw: raw.type?.join(', ') ?? null,
    boligtype: parseBoligtype(raw.type),
    bruksareal,
    soverom: raw.details?.bedrooms?.value ?? null,
    byggeaar: raw.construction_year ?? null,
    fasiliteter: facilities,
    balkong:
      facilities.some((f) => /balcony|terrace/i.test(f)) ||
      nonZero(measurement?.balcony?.value) !== null ||
      nonZero(measurement?.terrace?.value) !== null,
    garasjeParkeringChip: facilities.some((f) => /garage|parking|carport/i.test(f)),
    beskrivelse: stripTags(raw.description?.plain),
    felleskostnaderTekst: stripTags(raw.contract_details?.included_in_shared_cost?.plain),
    annonsertDato: raw.first_publish_date ?? null,
  }
}

export class HjemLookupError extends Error {
  statusCode: number
  constructor(message: string, statusCode: number) {
    super(message)
    this.name = 'HjemLookupError'
    this.statusCode = statusCode
  }
}

/** Gyldig hjem.no property-id: 24-tegns hex (Mongo ObjectId) */
export function isValidHjemId(value: string): boolean {
  return /^[a-f0-9]{24}$/i.test(value.trim())
}

/**
 * Henter og parser en eller flere hjem.no-annonser i ÉN batch-forespørsel.
 * Kjøres SERVER-SIDE — ren fetch, ingen nettleser/Playwright nødvendig.
 */
export async function fetchHjemAdDetails(ids: string[]): Promise<HjemAdData[]> {
  const validIds = ids.filter(isValidHjemId)
  if (validIds.length === 0) return []
  const qs = validIds.map((id) => `ids[]=${encodeURIComponent(id)}`).join('&')
  const res = await fetch(`https://apigw.hjem.no/search-backend/api/v2/properties?${qs}&availability[]=all`, {
    headers: { accept: 'application/json', referer: 'https://hjem.no/' },
  })
  if (!res.ok) {
    throw new HjemLookupError(`hjem.no svarte med ${res.status}`, 502)
  }
  const json = (await res.json()) as { data?: RawPropertyDetail[] }
  return (json.data ?? []).map(parseHjemAd)
}
