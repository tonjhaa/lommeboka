import { describe, it, expect } from 'vitest'
import { calcAnnualTax, calcMonthlyNetIncome, calcTotalAnnualIncome } from '../tax'
import { calcNorwegianTax } from '@/domain/economy/norwegianTaxRules'

describe('calcAnnualTax', () => {
  it('600 000 kr brutto → samlet skatt i rimelig bånd', () => {
    const annualTax = calcAnnualTax(600_000)
    expect(annualTax).toBeGreaterThan(130_000)
    expect(annualTax).toBeLessThan(160_000)
  })
  it('0 kr brutto → 0 kr skatt', () => {
    expect(calcAnnualTax(0)).toBe(0)
  })
  it('200 000 kr brutto → under 30% effektiv', () => {
    const result = calcAnnualTax(200_000)
    expect(result).toBeGreaterThan(0)
    expect(result).toBeLessThan(200_000 * 0.30)
  })
  it('1 000 000 kr brutto → ~28–36% effektiv', () => {
    const result = calcAnnualTax(1_000_000)
    expect(result / 1_000_000).toBeGreaterThan(0.28)
    expect(result / 1_000_000).toBeLessThan(0.36)
  })
})

describe('calcAnnualTax ↔ calcNorwegianTax konsistens', () => {
  for (const lonn of [300_000, 600_000, 1_000_000]) {
    it(`calcAnnualTax(${lonn}) = B sin skattEtterFradrag`, () => {
      expect(calcAnnualTax(lonn, 2026)).toBe(calcNorwegianTax(lonn, 2026).skattEtterFradrag)
    })
  }
})

describe('calcMonthlyNetIncome', () => {
  it('600 000 kr brutto → ~33 000–40 000 kr netto/mnd', () => {
    const monthly = calcMonthlyNetIncome(600_000)
    expect(monthly).toBeGreaterThan(33_000)
    expect(monthly).toBeLessThan(40_000)
  })
  it('nettoinntekt < brutto / 12', () => {
    const gross = 800_000
    expect(calcMonthlyNetIncome(gross)).toBeLessThan(gross / 12)
  })
})

describe('calcTotalAnnualIncome', () => {
  it('to søkere + annen inntekt summeres korrekt', () => {
    expect(calcTotalAnnualIncome(600_000, 50_000, 500_000, 0)).toBe(1_150_000)
  })
  it('undefined verdier behandles som 0', () => {
    expect(calcTotalAnnualIncome(600_000, undefined, undefined, undefined)).toBe(600_000)
  })
})
