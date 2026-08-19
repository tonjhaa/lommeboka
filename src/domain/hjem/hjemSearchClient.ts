/**
 * Klient for hjem.no sitt søke-API (JSON, ikke HTML-scraping).
 *
 * hjem.no er en ren klientside-SPA, men søkeresultatlisten hentes av
 * frontend fra et offentlig, ikke-autentisert JSON-endepunkt
 * (apigw.hjem.no/search-backend/api/v4/property/search — bekreftet fungerende
 * med et rått fetch-kall uten cookies/nettleser-økt). Resultatlisten er
 * paginert med `page`/`size`, IKKE «last inn flere» via nettleser-scroll.
 *
 * Brukes av api/hjem-search.ts (Vercel-funksjon) og vite-dev-middleware —
 * kjøres server-side.
 */

const SEARCH_URL = 'https://apigw.hjem.no/search-backend/api/v4/property/search'
const PAGE_SIZE = 18

/** Faste kriterier — samme geografiske/tallmessige filter som Finn-søket */
const SEARCH_BODY_BASE = {
  size: PAGE_SIZE,
  acquisition: 'buy',
  view: 'list',
  listing_type: 'residential_sale',
  order: 'desc',
  property_type: ['apartment'],
  bedroom_min: 2,
  total_price_max: 7_850_000,
  primary_room_min: 65,
  sorting: 'publishedDesc',
  address: [
    ['oslo', 'oslo', 'grünerløkka'],
    ['oslo', 'oslo', 'gamle oslo'],
    ['oslo', 'oslo', 'nordre aker'],
    ['oslo', 'oslo', 'sagene'],
  ],
}

export interface HjemSearchHit {
  eksternId: string
  url: string
  tittel: string | null
  adresse: string | null
}

export interface HjemSearchResult {
  totalHits: number | null
  hits: HjemSearchHit[]
}

interface RawSearchItem {
  id: string
  title?: string | null
  address?: { display_name?: string | null } | null
  agency?: { id?: number | null } | null
}

function buildPropertyUrl(item: RawSearchItem): string {
  const agencyId = String(item.agency?.id ?? 0).padStart(6, '0')
  return `https://hjem.no/property/${agencyId}/${item.id}`
}

interface RawSearchResponse {
  data?: RawSearchItem[]
  pagination?: { results?: number }
}

/** Ren mapping-funksjon fra rå API-respons til domenetype — testbar uten nettverk. */
export function mapSearchResponse(json: RawSearchResponse): HjemSearchResult {
  const hits: HjemSearchHit[] = (json.data ?? []).map((item) => ({
    eksternId: item.id,
    url: buildPropertyUrl(item),
    tittel: item.title?.trim() || null,
    adresse: item.address?.display_name?.trim() || null,
  }))
  return { totalHits: json.pagination?.results ?? null, hits }
}

/**
 * Henter én side av det faste hjem.no-søket (samme kriterier som Finn-søket).
 * Kjøres SERVER-SIDE — ren fetch, ingen nettleser/Playwright nødvendig.
 */
export async function fetchHjemSearchPage(page = 1): Promise<HjemSearchResult> {
  const res = await fetch(SEARCH_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      referer: 'https://hjem.no/',
    },
    body: JSON.stringify({ ...SEARCH_BODY_BASE, page }),
  })
  if (!res.ok) {
    throw new Error(`hjem.no søk svarte med ${res.status}`)
  }
  const json = (await res.json()) as RawSearchResponse
  return mapSearchResponse(json)
}
