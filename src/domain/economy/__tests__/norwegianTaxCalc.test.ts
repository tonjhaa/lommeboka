import { describe, it, expect } from 'vitest'
import { beregnSkatt, type TaxInput } from '../norwegianTaxCalc'
import { calcNorwegianTax } from '../norwegianTaxRules'

const EMPTY: TaxInput = {
  lonnsInntekt: 0, pensjonsinntekt: 0, næringsInntekt: 0, kapitalInntekt: 0,
  andreFradrag: 0, renteutgifter: 0, arbeidsreiseFradrag: 0, fagforeningskontingent: 0,
  pensjonspremie: 0, utgiftsgodtgjørelse: 0, bsuSkattefradrag: 0,
  primaerboligVerdi: 0, sekundaerboligVerdi: 0, bankinnskudd: 0, aksjerFondVerdi: 0,
  annenFormue: 0, gjeld: 0,
}

describe('beregnSkatt ↔ calcNorwegianTax konsistens (lønn-only)', () => {
  for (const lonn of [300_000, 500_000, 800_000, 1_200_000]) {
    it(`inntektsskatt = B for ${lonn} kr lønn`, () => {
      const a = beregnSkatt({ ...EMPTY, lonnsInntekt: lonn }, 2026)
      const b = calcNorwegianTax(lonn, 2026)
      expect(a.skattInntekt).toBe(b.skattEtterFradrag)
    })
  }
})

describe('beregnSkatt — formueskatt-split', () => {
  it('skattInntekt ekskluderer formueskatt; totalSkatt = inntekt + formue', () => {
    const r = beregnSkatt({ ...EMPTY, lonnsInntekt: 600_000, bankinnskudd: 5_000_000 }, 2026)
    expect(r.skattFormue).toBeGreaterThan(0)
    expect(r.totalSkatt).toBe(r.skattInntekt + r.skattFormue)
    const utenFormue = beregnSkatt({ ...EMPTY, lonnsInntekt: 600_000 }, 2026)
    expect(r.skattInntekt).toBe(utenFormue.skattInntekt)
  })
})
