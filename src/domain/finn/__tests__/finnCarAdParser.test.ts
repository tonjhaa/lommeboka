import { describe, it, expect } from 'vitest'
import { parseFinnCarAd } from '../finnCarAdParser'

const FIXTURE_EL = `
<html><head>
<meta property="og:title" content="Nissan Leaf til salgs"/>
</head><body>
<div class="grid mt-16 gap-24"><div class="flex gap-16 hyphens-auto"><div class="flex items-center"><w-icon name="Calendar"></w-icon></div><div><span class="s-text-subtle">Modellår</span><p class="m-0 font-bold">2019</p></div></div><div class="flex gap-16 hyphens-auto"><div class="flex items-center"><w-icon name="Speedometer"></w-icon></div><div><span class="s-text-subtle">Kilometerstand</span><p class="m-0 font-bold">90 500 km</p></div></div><div class="flex gap-16 hyphens-auto"><div class="flex items-center"><w-icon name="Road"></w-icon></div><div><span class="s-text-subtle">Rekkevidde (WLTP)</span><p class="m-0 font-bold">270 km</p></div></div><div class="flex gap-16 hyphens-auto"><div class="flex items-center"><w-icon name="Charger"></w-icon></div><div><span class="s-text-subtle">Drivstoff</span><p class="m-0 font-bold">El</p></div></div></div>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[]}</script>
<script type="application/ld+json">
{
  "@type": "Product",
  "@context": "https://schema.org",
  "name": "Nissan Leaf",
  "offers": {
    "@type": "Offer",
    "price": 129532,
    "priceCurrency": "NOK",
    "seller": { "@type": "Person" }
  },
  "brand": { "@type": "Brand", "name": "Nissan" },
  "model": "Leaf"
}
</script>
</body></html>`

const FIXTURE_BENSIN_MINIMAL = `
<html><head><meta property="og:title" content="Golf til salgs"/></head><body>
<div><span class="s-text-subtle">Modellår</span><p class="m-0 font-bold">2015</p></div>
<div><span class="s-text-subtle">Kilometerstand</span><p class="m-0 font-bold">142 000 km</p></div>
<div><span class="s-text-subtle">Drivstoff</span><p class="m-0 font-bold">Bensin</p></div>
<script type="application/ld+json">{"@type":"Product","@context":"https://schema.org","offers":{"@type":"Offer","price":89000}}</script>
</body></html>`

const FIXTURE_NO_PRICE = `
<html><head><meta property="og:title" content="Solgt bil"/></head><body>
<div><span class="s-text-subtle">Modellår</span><p class="m-0 font-bold">2018</p></div>
</body></html>`

describe('parseFinnCarAd', () => {
  it('parser alle felt fra en el-bil-fixture', () => {
    const d = parseFinnCarAd(FIXTURE_EL, '469404429')
    expect(d.finnkode).toBe('469404429')
    expect(d.tittel).toBe('Nissan Leaf til salgs')
    expect(d.price).toBe(129_532)
    expect(d.year).toBe(2019)
    expect(d.mileageKm).toBe(90_500)
    expect(d.fuelType).toBe('el')
  })

  it('parser en minimal bensinbil-fixture', () => {
    const d = parseFinnCarAd(FIXTURE_BENSIN_MINIMAL, '469406530')
    expect(d.price).toBe(89_000)
    expect(d.year).toBe(2015)
    expect(d.mileageKm).toBe(142_000)
    expect(d.fuelType).toBe('bensin')
  })

  it('manglende pris gir null, ikke krasj', () => {
    const d = parseFinnCarAd(FIXTURE_NO_PRICE, '000000000')
    expect(d.price).toBeNull()
    expect(d.year).toBe(2018)
    expect(d.mileageKm).toBeNull()
    expect(d.fuelType).toBeNull()
  })

  it('ignorerer ld+json-blokker som ikke er @type Product', () => {
    // FIXTURE_EL har en BreadcrumbList-blokk FØR Product-blokken —
    // bekrefter at parseren ikke plukker feil blokk.
    const d = parseFinnCarAd(FIXTURE_EL, '469404429')
    expect(d.price).toBe(129_532)
  })

  it('skiller diesel fra el (diesel inneholder substrengen "el")', () => {
    const fixtureDiesel = `
<html><head><meta property="og:title" content="Diesel til salgs"/></head><body>
<div><span class="s-text-subtle">Modellår</span><p class="m-0 font-bold">2017</p></div>
<div><span class="s-text-subtle">Kilometerstand</span><p class="m-0 font-bold">120 000 km</p></div>
<div><span class="s-text-subtle">Drivstoff</span><p class="m-0 font-bold">Diesel</p></div>
<script type="application/ld+json">{"@type":"Product","@context":"https://schema.org","offers":{"@type":"Offer","price":150000}}</script>
</body></html>`
    const d = parseFinnCarAd(fixtureDiesel, '111111111')
    expect(d.fuelType).toBe('diesel')
  })
})
