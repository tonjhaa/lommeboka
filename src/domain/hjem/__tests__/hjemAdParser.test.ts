import { describe, it, expect } from 'vitest'
import { parseHjemAd, isValidHjemId } from '../hjemAdParser'

// Fixtures bygget av de faktiske feltnavnene fra hjem.no sitt properties-API (2026).
const FIXTURE_MED_GARASJE = {
  id: '69f486b4982e40bf49c8f84c',
  title: 'Klassisk 3-roms i historisk bygård | Balkong mot rolig bakgård',
  address: { display_name: 'Normannsgata 5B, 0655 Oslo' },
  construction_year: 1898,
  first_publish_date: '2026-05-01T00:00:00Z',
  description: {
    plain:
      '<b>Velkommen til Normannsgata 5B!</b><br/><br/>Med boligen følger egen garasjeplass i fellesgarasje inkludert i prisen.',
  },
  facilities: ['balcony', 'broadbandConnection', 'garageParking', 'elevator'],
  type: ['apartment'],
  details: {
    bedrooms: { value: 2 },
    primary_room: { value: 0 },
    usage_area: { value: 88 },
    area_measurement: { internal: { value: 78 }, balcony: { value: 4 }, terrace: { value: null } },
  },
  prices: {
    asking_price: { amount: 7_000_000 },
    total_price: { amount: 7_361_890 },
    joint_debt: { amount: 181_280 },
    adding_cost: { amount: 180_610 },
    shared_cost: { amount: 6_356 },
  },
  contract_details: {
    included_in_shared_cost: {
      plain: 'Fellesutgiftene inkluderer:<br/>- Felleskostnader: kr 3 435,-<br/>- Lånekostnader: kr 1 944,-',
    },
  },
}

const FIXTURE_MINIMAL = {
  id: '69a80a67ca5691e427329f2d',
  title: null,
  address: null,
  construction_year: null,
  first_publish_date: null,
  description: null,
  facilities: [],
  type: ['house'],
  details: null,
  prices: null,
  contract_details: null,
}

describe('parseHjemAd', () => {
  it('parser alle felt fra fixture med garasje og IN-lignende ordning', () => {
    const d = parseHjemAd(FIXTURE_MED_GARASJE)
    expect(d.id).toBe('69f486b4982e40bf49c8f84c')
    expect(d.tittel).toBe('Klassisk 3-roms i historisk bygård | Balkong mot rolig bakgård')
    expect(d.adresse).toBe('Normannsgata 5B, 0655 Oslo')
    expect(d.byggeaar).toBe(1898)
    expect(d.annonsertDato).toBe('2026-05-01T00:00:00Z')
    expect(d.prisantydning).toBe(7_000_000)
    expect(d.totalpris).toBe(7_361_890)
    expect(d.fellesgjeld).toBe(181_280)
    expect(d.omkostninger).toBe(180_610)
    expect(d.felleskostMnd).toBe(6_356)
    expect(d.boligtype).toBe('leilighet')
    expect(d.soverom).toBe(2)
    expect(d.bruksareal).toBe(78) // internal foretrekkes over usage_area/primary_room
    expect(d.fasiliteter).toEqual(['balcony', 'broadbandConnection', 'garageParking', 'elevator'])
    expect(d.balkong).toBe(true)
    expect(d.garasjeParkeringChip).toBe(true)
    expect(d.beskrivelse).toContain('Med boligen følger egen garasjeplass')
    expect(d.beskrivelse).not.toContain('<b>')
    expect(d.felleskostnaderTekst).toContain('Lånekostnader: kr 1 944,-')
  })

  it('manglende felt blir null/0/tom-liste — minimal fixture', () => {
    const d = parseHjemAd(FIXTURE_MINIMAL)
    expect(d.tittel).toBeNull()
    expect(d.adresse).toBeNull()
    expect(d.byggeaar).toBeNull()
    expect(d.annonsertDato).toBeNull()
    expect(d.prisantydning).toBeNull()
    expect(d.fellesgjeld).toBe(0)
    expect(d.felleskostMnd).toBe(0)
    expect(d.boligtype).toBe('enebolig')
    expect(d.soverom).toBeNull()
    expect(d.bruksareal).toBeNull()
    expect(d.fasiliteter).toEqual([])
    expect(d.balkong).toBe(false)
    expect(d.garasjeParkeringChip).toBe(false)
    expect(d.beskrivelse).toBeNull()
    expect(d.felleskostnaderTekst).toBeNull()
  })

  it('facility-nøkkel "garageParking" alene er IKKE bevis på faktisk garasje (kun chip)', () => {
    const d = parseHjemAd({ ...FIXTURE_MINIMAL, facilities: ['garageParking'] })
    expect(d.garasjeParkeringChip).toBe(true)
    // beskrivelse mangler her — kalleren (AI-vurderingen) må avgjøre garantert vs. mulighet
    expect(d.beskrivelse).toBeNull()
  })

  it('roofTerrace regnes som balkong-ekvivalent', () => {
    const d = parseHjemAd({ ...FIXTURE_MINIMAL, facilities: ['roofTerrace'] })
    expect(d.balkong).toBe(true)
  })
})

describe('isValidHjemId', () => {
  it('godtar 24-tegns hex (Mongo ObjectId)', () => {
    expect(isValidHjemId('69f486b4982e40bf49c8f84c')).toBe(true)
  })
  it('avviser alt annet', () => {
    expect(isValidHjemId('')).toBe(false)
    expect(isValidHjemId('123')).toBe(false)
    expect(isValidHjemId('69f486b4982e40bf49c8f84c; DROP TABLE')).toBe(false)
  })
})
