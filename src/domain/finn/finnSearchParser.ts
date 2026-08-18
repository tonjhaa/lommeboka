/**
 * Parser for FINN.no søkeresultatsider (server-rendret HTML).
 *
 * Hvert treff har en <h2 id="search-ad-FINNKODE"> etterfulgt av en lenke med
 * tittel og en adresse-span. Siden er paginert med ?page=N (50 treff/side).
 */

export interface FinnSearchHit {
  finnkode: string
  tittel: string | null
  adresse: string | null
}

export interface FinnSearchResult {
  totalHits: number | null
  hits: FinnSearchHit[]
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
}

export function parseFinnSearchResults(html: string): FinnSearchResult {
  const totalHitsMatch = html.match(/class="font-bold">(\d[\d\s]*)<\/span>\s*<!-- -->treff/)
  const totalHits = totalHitsMatch ? parseInt(totalHitsMatch[1].replace(/\s/g, ''), 10) : null

  const hits: FinnSearchHit[] = []
  const seen = new Set<string>()
  const re = /id="search-ad-(\d{8,10})"[\s\S]{0,50}?<a[^>]*>([\s\S]*?)<\/a>[\s\S]{0,300}?<span class="text-s s-text-subtle">([^<]*)<\/span>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const finnkode = m[1]
    if (seen.has(finnkode)) continue
    seen.add(finnkode)
    hits.push({
      finnkode,
      tittel: stripTags(m[2]) || null,
      adresse: stripTags(m[3]) || null,
    })
  }

  return { totalHits, hits }
}

/**
 * Henter én side av det faste boligsøk-kriteriet (indre Oslo NØ, polygon +
 * totalpris/areal/soverom). Kjøres SERVER-SIDE — nettleseren blokkeres av CORS.
 */
export async function fetchFinnSearchPage(page = 1): Promise<FinnSearchResult> {
  const polylocation = '10.75187 59.95295,10.77216 59.95581,10.79922 59.95157,10.8007 59.9413,10.80493 59.92912,10.80683 59.92202,10.81021 59.9163,10.81592 59.9092,10.79563 59.90602,10.77829 59.90835,10.7618 59.92404,10.75758 59.93315,10.74362 59.93495,10.74574 59.95104,10.75187 59.95295'
  const params = new URLSearchParams({
    polylocation,
    price_collective_to: '7850000',
    area_from: '65',
    min_bedrooms: '2',
  })
  if (page > 1) params.set('page', String(page))

  const url = `https://www.finn.no/realestate/homes/search.html?${params.toString()}`
  const res = await fetch(url, {
    redirect: 'follow',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'nb-NO,nb;q=0.9',
    },
  })
  if (!res.ok) {
    throw new Error(`FINN søk svarte med ${res.status}`)
  }
  const html = await res.text()
  return parseFinnSearchResults(html)
}
