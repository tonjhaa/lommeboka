import { describe, it, expect } from 'vitest'
import { beregnSkatt } from '../norwegianTaxCalc'

/**
 * Regresjonsvern for lønnssimulator-skatten (SalaryPage LønnssimulatorCard).
 * Bug: simulatoren ganget brutto med en flat ~52 %-sats skrapet fra slipper (tabelltrekk).
 * Fiks: progressiv årsskatt via beregnSkatt (samme motor som scenario/budsjett), /12.
 */
function simulatorMonthlyTax(bruttoMnd: number, pensjonMnd = 0, fagforeningMnd = 0): number {
  const res = beregnSkatt({
    lonnsInntekt: bruttoMnd * 12, pensjonsinntekt: 0, næringsInntekt: 0, kapitalInntekt: 0,
    andreFradrag: 0, renteutgifter: 0, arbeidsreiseFradrag: 0,
    fagforeningskontingent: fagforeningMnd * 12, pensjonspremie: pensjonMnd * 12,
    utgiftsgodtgjørelse: 0, bsuSkattefradrag: 0,
    primaerboligVerdi: 0, sekundaerboligVerdi: 0, bankinnskudd: 0, aksjerFondVerdi: 0,
    annenFormue: 0, gjeld: 0,
  })
  return Math.round(res.skattInntekt / 12)
}

describe('lønnssimulator-skatt — fornuftig progressiv sats', () => {
  it('~63 287 kr/mnd ⇒ effektiv sats godt under den gamle 52 %-buggen', () => {
    const brutto = 63_287
    const skatt = simulatorMonthlyTax(brutto, 1_266, 723)
    const rate = skatt / brutto
    // Reell gjennomsnittsskatt for ~760k/år ligger ~25–38 %, IKKE 52 %.
    expect(rate).toBeGreaterThan(0.20)
    expect(rate).toBeLessThan(0.40)
  })

  it('progressiv: høyere lønn ⇒ høyere effektiv sats (marginalsats)', () => {
    const low = simulatorMonthlyTax(40_000)
    const high = simulatorMonthlyTax(90_000)
    expect(high / 90_000).toBeGreaterThan(low / 40_000)
  })

  it('fradrag (pensjon/fagforening) reduserer skatten', () => {
    const utenFradrag = simulatorMonthlyTax(60_000, 0, 0)
    const medFradrag = simulatorMonthlyTax(60_000, 1_200, 700)
    expect(medFradrag).toBeLessThan(utenFradrag)
  })
})
