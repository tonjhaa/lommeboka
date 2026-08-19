import { describe, it, expect } from 'vitest'
import { mapSearchResponse } from '../hjemSearchClient'

// Fixture bygget av de faktiske feltnavnene fra en ekte hjem.no søke-API-respons (2026)
const FIXTURE = {
  data: [
    {
      id: '69f486b4982e40bf49c8f84c',
      title: 'Klassisk 3-roms i historisk bygård',
      address: { display_name: 'Normannsgata 5B, 0655 Oslo' },
      agency: { id: 390 },
    },
    {
      id: '69f76e045bedeb301276d7fa',
      title: 'Lys og romslig 2-roms',
      address: { display_name: 'Herslebs Gate 17C, 0561 Oslo' },
      agency: { id: 6478 },
    },
  ],
  pagination: { current_page: 1, next_page: 2, last_page: 6, per_page: 18, results: 105 },
}

describe('mapSearchResponse', () => {
  it('mapper treff og bygger property-URL med 6-sifret agency-id-padding', () => {
    const r = mapSearchResponse(FIXTURE)
    expect(r.totalHits).toBe(105)
    expect(r.hits).toEqual([
      {
        eksternId: '69f486b4982e40bf49c8f84c',
        url: 'https://hjem.no/property/000390/69f486b4982e40bf49c8f84c',
        tittel: 'Klassisk 3-roms i historisk bygård',
        adresse: 'Normannsgata 5B, 0655 Oslo',
      },
      {
        eksternId: '69f76e045bedeb301276d7fa',
        url: 'https://hjem.no/property/006478/69f76e045bedeb301276d7fa',
        tittel: 'Lys og romslig 2-roms',
        adresse: 'Herslebs Gate 17C, 0561 Oslo',
      },
    ])
  })

  it('tomt resultat gir tom liste og null totalHits', () => {
    const r = mapSearchResponse({})
    expect(r.hits).toEqual([])
    expect(r.totalHits).toBeNull()
  })
})
