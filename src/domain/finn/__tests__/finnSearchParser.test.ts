import { describe, it, expect } from 'vitest'
import { parseFinnSearchResults } from '../finnSearchParser'

// Fixture bygget av de faktiske mønstrene fra en ekte FINN-søkeresultatside (2026)
const FIXTURE = `
<html><body>
<span>Bolig til salgs</span> <span class="font-bold">132</span> <!-- -->treff i<!-- --> <span class="font-bold">128</span> annonser
<div class="ad">
<h2 class="h4 mb-0 col-span-2 mt-12 sf-realestate-heading" id="search-ad-470588400">
<a class="sf-search-ad-link" href="/realestate/homes/ad.html?finnkode=470588400" id="470588400">
<span class="absolute inset-0" aria-hidden="true"></span>Tiltalende 3-roms med balkong</a>
</h2>
<div class="mt-4 sf-realestate-location"><span class="text-s s-text-subtle">Sannergata 19C, Oslo</span></div>
</div>
<div class="ad">
<h2 class="h4 mb-0 col-span-2 mt-12 sf-realestate-heading" id="search-ad-473790720">
<a class="sf-search-ad-link" href="/realestate/homes/ad.html?finnkode=473790720" id="473790720">
<span class="absolute inset-0" aria-hidden="true"></span>Lekker fabrikkleilighet</a>
</h2>
<div class="mt-4 sf-realestate-location"><span class="text-s s-text-subtle">Konghellegata 8, Oslo</span></div>
</div>
</body></html>`

describe('parseFinnSearchResults', () => {
  it('parser totalHits og alle treff fra fixture', () => {
    const r = parseFinnSearchResults(FIXTURE)
    expect(r.totalHits).toBe(132)
    expect(r.hits).toEqual([
      { finnkode: '470588400', tittel: 'Tiltalende 3-roms med balkong', adresse: 'Sannergata 19C, Oslo' },
      { finnkode: '473790720', tittel: 'Lekker fabrikkleilighet', adresse: 'Konghellegata 8, Oslo' },
    ])
  })

  it('dedupliserer samme finnkode og gir tomt resultat for tom side', () => {
    const dup = FIXTURE + FIXTURE
    const r = parseFinnSearchResults(dup)
    expect(r.hits).toHaveLength(2)

    const empty = parseFinnSearchResults('<html><body>Ingen treff</body></html>')
    expect(empty.hits).toEqual([])
    expect(empty.totalHits).toBeNull()
  })
})
