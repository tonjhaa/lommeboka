import { describe, it, expect } from 'vitest'
import { parseFinnCarAdText } from '../finnCarAdTextParser'

// Typisk kopiering fra FINN: label og verdi på hver sin linje
const SAMPLE_LINJEDELT = `Nissan Leaf 40kWh Tekna
Til salgs
Modellår
2019
Kilometerstand
90 500 km
Rekkevidde (WLTP)
270 km
Drivstoff
El
Girkasse
Automat
Effekt
150 hk
Totalpris
129 532 kr
Omregistrering
2 970 kr`

// Inline-stil (label: verdi på samme linje)
const SAMPLE_INLINE = `Audi Q6 e-tron
Pris: kr 669 800
Årsmodell: 2025
Km.stand: 17 467
Drivstoff: Elektrisk
Girtype: Automat`

const SAMPLE_LADBAR = `Volvo XC60 T8 Plug-in hybrid
Totalpris
485 000 kr
Modellår
2021
Drivstoff
Bensin
Kilometerstand
62 000 km`

describe('parseFinnCarAdText', () => {
  it('parser linjedelt FINN-kopiering (label og verdi på hver sin linje)', () => {
    const r = parseFinnCarAdText(SAMPLE_LINJEDELT)
    expect(r.modelName).toBe('Nissan Leaf 40kWh Tekna')
    expect(r.price).toBe(129_532)
    expect(r.year).toBe(2019)
    expect(r.mileageKm).toBe(90_500)
    expect(r.fuelType).toBe('el')
    expect(r.gearbox).toBe('automat')
    expect(r.powerHp).toBe(150)
    expect(r.omregistreringsavgift).toBe(2_970)
  })

  it('parser inline-stil med kr-prefiks og alternative labels', () => {
    const r = parseFinnCarAdText(SAMPLE_INLINE)
    expect(r.modelName).toBe('Audi Q6 e-tron')
    expect(r.price).toBe(669_800)
    expect(r.year).toBe(2025)
    expect(r.mileageKm).toBe(17_467)
    expect(r.fuelType).toBe('el')
    expect(r.gearbox).toBe('automat')
  })

  it('gjenkjenner ladbar hybrid fra fritekst selv om Drivstoff-feltet sier Bensin', () => {
    const r = parseFinnCarAdText(SAMPLE_LADBAR)
    expect(r.fuelType).toBe('ladbar_hybrid')
    expect(r.price).toBe(485_000)
  })

  it('delvis tekst: kun funne felt rapporteres, resten er null', () => {
    const r = parseFinnCarAdText('Totalpris\n250 000 kr')
    expect(r.price).toBe(250_000)
    expect(r.year).toBeNull()
    expect(r.mileageKm).toBeNull()
    expect(r.fuelType).toBeNull()
    expect(r.foundFields).toContain('price')
    expect(r.foundFields).not.toContain('year')
  })

  it('tom eller irrelevant tekst gir ingen treff — ingen krasj', () => {
    const r = parseFinnCarAdText('hei på deg')
    expect(r.price).toBeNull()
    expect(r.foundFields).toEqual(['modelName']) // fritekstlinje tolkes som mulig modellnavn
  })

  it('for lav pris (gebyr-nivå) plukkes ikke opp som kjøpesum', () => {
    const r = parseFinnCarAdText('Pris\n1 200 kr')
    expect(r.price).toBeNull()
  })

  it('Totalpris prioriteres over Prisantydning', () => {
    const r = parseFinnCarAdText('Prisantydning\n300 000 kr\nTotalpris\n310 000 kr')
    expect(r.price).toBe(310_000)
  })
})
