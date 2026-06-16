import { describe, it, expect } from 'vitest'
import { calcNorwegianTax, calcTrinnskatt, calcTrygdeavgift, getTaxRules } from '../norwegianTaxRules'

describe('norwegianTaxRules — delte algoritmer', () => {
  it('calcTrinnskatt er eksportert og 0 under første trinn', () => {
    const rules = getTaxRules(2026)
    expect(calcTrinnskatt(100_000, rules.trinnskattBrackets)).toBe(0)
  })

  it('calcTrygdeavgift er eksportert og 0 under frigrensen', () => {
    const rules = getTaxRules(2026)
    expect(calcTrygdeavgift(50_000, rules)).toBe(0)
  })

  it('calcTrygdeavgift bruker ordinær sats godt over frigrensen', () => {
    const rules = getTaxRules(2026)
    expect(calcTrygdeavgift(600_000, rules)).toBe(Math.round(600_000 * rules.trygdeavgiftSats / 100))
  })
})

// Karakteriseringstest: låser nåværende oppførsel for TAX_RULES[2026].
// OPPDATER tallene hvis offisielle satser endres.
describe('norwegianTaxRules — referansecaser (baseline for nåværende satser)', () => {
  it('500 000 kr lønn gir forventet samlet inntektsskatt', () => {
    const b = calcNorwegianTax(500_000, 2026)
    expect(b.skattEtterFradrag).toBe(110_582)
  })

  it('800 000 kr lønn gir forventet samlet inntektsskatt', () => {
    const b = calcNorwegianTax(800_000, 2026)
    expect(b.skattEtterFradrag).toBe(218_653)
  })
})
