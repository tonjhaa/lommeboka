import { describe, it, expect } from 'vitest'
import { parseFinnAd, isValidFinnkode } from '../finnAdParser'

// Fixture bygget av de faktiske mønstrene fra en ekte FINN-annonse (2026):
// prisantydning som span, resten som <dt>/<dd>-par, adresse med data-testid.
const FIXTURE_ANDEL = `
<html><head>
<title>Sjelden perle på Vålerenga | FINN eiendom</title>
<meta property="og:title" content="Sjelden perle på Vålerenga m takterrasse"/>
</head><body>
<span data-testid="object-address" class="pl-4">Etterstadgata 39D, 0658 Oslo</span>
<div><span class="t5">Prisantydning</span><span class="text-28 font-bold">8 800 000 kr</span></div>
<dl>
<dt class="m-0">Totalpris</dt><dd class="m-0 font-bold">9 801 940 kr</dd>
<dt class="m-0">Omkostninger</dt><dd class="m-0 font-bold">1 940 kr</dd>
<dt class="m-0">Fellesgjeld</dt><dd class="m-0 font-bold">1 000 000 kr</dd>
<dt class="m-0">Felleskost/mnd.</dt><dd class="m-0 font-bold">5 841 kr</dd>
<dt class="m-0">Kommunale avg.</dt><dd class="m-0 font-bold">12 400 kr</dd>
<dt class="m-0">Boligtype</dt><dd class="m-0">Leilighet</dd>
<dt class="m-0">Eieform</dt><dd class="m-0">Andel </dd>
<dt class="m-0">Bruksareal</dt><dd class="m-0">82 m²</dd>
<dt class="m-0">Soverom</dt><dd class="m-0">2</dd>
</dl>
<section data-testid="object-facilities"><h2 class="h3" id="facilities-heading">Fasiliteter</h2><div class="grid md:grid-cols-3 grid-cols-2"><div class="py-4 break-words">Balkong/Terrasse</div><div class="py-4 break-words">Garasje/P-plass</div><div class="py-4 break-words">Heis</div></div></section>
<section aria-label="Om boligen"><div class="pt-16" data-testid="om boligen"><h2 class="h3">Om boligen</h2><div class="description-area whitespace-pre-wrap">Fin leilighet med egen garasjeplass i fellesgarasje inkludert i prisen.</div></div></section>
<section aria-labelledby="common-cost" data-testid="html-felleskostnader inkluderer"><h2 class="h3" id="common-cost">Felleskostnader inkluderer</h2><div class="description-area whitespace-pre-wrap" data-testid="common-cost">Felleskostnader: 2 314,-<br />Avdrag felleslån: 3 200,-<br />Renter felleslån: 327,-</div></section>
</body></html>`

const FIXTURE_SELVEIER_MINIMAL = `
<html><head><meta property="og:title" content="Enebolig med utsikt"/></head><body>
<div><span>Prisantydning</span><span class="text-28">4 500 000 kr</span></div>
<dl>
<dt>Totalpris</dt><dd>4 617 000 kr</dd>
<dt>Boligtype</dt><dd>Enebolig</dd>
<dt>Eieform</dt><dd>Eier (Selveier)</dd>
<dt>Eiendomsskatt</dt><dd>8 000 kr</dd>
</dl>
</body></html>`

describe('parseFinnAd', () => {
  it('parser alle felt fra andelsleilighet-fixture', () => {
    const d = parseFinnAd(FIXTURE_ANDEL, '468534269')
    expect(d.finnkode).toBe('468534269')
    expect(d.tittel).toBe('Sjelden perle på Vålerenga m takterrasse')
    expect(d.adresse).toBe('Etterstadgata 39D, 0658 Oslo')
    expect(d.prisantydning).toBe(8_800_000)
    expect(d.totalpris).toBe(9_801_940)
    expect(d.omkostninger).toBe(1_940)
    expect(d.fellesgjeld).toBe(1_000_000)
    expect(d.felleskostMnd).toBe(5_841)
    expect(d.kommunaleAvgArlig).toBe(12_400)
    expect(d.boligtype).toBe('leilighet')
    expect(d.eieform).toBe('andel')
    expect(d.bruksareal).toBe(82)
    expect(d.soverom).toBe(2)
    expect(d.fasiliteter).toEqual(['Balkong/Terrasse', 'Garasje/P-plass', 'Heis'])
    expect(d.balkong).toBe(true)
    expect(d.garasjeParkeringChip).toBe(true)
    expect(d.beskrivelse).toBe('Fin leilighet med egen garasjeplass i fellesgarasje inkludert i prisen.')
    expect(d.felleskostnaderTekst).toContain('Avdrag felleslån: 3 200,-')
  })

  it('manglende felt blir null/0 — selveier uten fellesgjeld', () => {
    const d = parseFinnAd(FIXTURE_SELVEIER_MINIMAL, '123456789')
    expect(d.prisantydning).toBe(4_500_000)
    expect(d.fellesgjeld).toBe(0)
    expect(d.felleskostMnd).toBe(0)
    expect(d.omkostninger).toBeNull()
    expect(d.eiendomsskattArlig).toBe(8_000)
    expect(d.eieform).toBe('selveier')
    expect(d.boligtype).toBe('enebolig')
    expect(d.adresse).toBeNull()
    expect(d.soverom).toBeNull()
    expect(d.fasiliteter).toEqual([])
    expect(d.balkong).toBe(false)
    expect(d.garasjeParkeringChip).toBe(false)
    expect(d.beskrivelse).toBeNull()
    expect(d.felleskostnaderTekst).toBeNull()
  })

  it('tom side gir null-pris (kalleren avviser)', () => {
    const d = parseFinnAd('<html><body>Ingenting her</body></html>', '1')
    expect(d.prisantydning).toBeNull()
    expect(d.totalpris).toBeNull()
  })
})

describe('isValidFinnkode', () => {
  it('godtar 8–10 sifre', () => {
    expect(isValidFinnkode('46853426')).toBe(true)
    expect(isValidFinnkode('468534269')).toBe(true)
    expect(isValidFinnkode('4685342690')).toBe(true)
  })
  it('avviser alt annet', () => {
    expect(isValidFinnkode('')).toBe(false)
    expect(isValidFinnkode('abc123')).toBe(false)
    expect(isValidFinnkode('1234567')).toBe(false)
    expect(isValidFinnkode('https://finn.no/ad?finnkode=468534269')).toBe(false)
  })
})
