import { describe, it, expect } from 'vitest'
import { buildIncomeProjection, buildGProjection, accrueFolketrygdBeholdning, annualFromBeholdning } from '../pensionCalculator'
import { FOLKETRYGD_OPPTJENINGSSATS, TAK_FOLKETRYGD_G } from '@/config/economy.config'

describe('buildIncomeProjection', () => {
  it('holder inntekt konstant når vekst = 0', () => {
    const inc = buildIncomeProjection({ currentYear: 2026, currentAnnualIncome: 600_000, fromYear: 2024, toYear: 2028, growthPct: 0 })
    expect(inc[2026]).toBe(600_000)
    expect(inc[2024]).toBe(600_000)
    expect(inc[2028]).toBe(600_000)
  })

  it('skalerer framover og bakover med vekst relativt til currentYear', () => {
    const inc = buildIncomeProjection({ currentYear: 2026, currentAnnualIncome: 100_000, fromYear: 2025, toYear: 2027, growthPct: 10 })
    expect(inc[2027]).toBeCloseTo(110_000, 0)
    expect(inc[2025]).toBeCloseTo(100_000 / 1.1, 0)
  })
})

describe('buildGProjection', () => {
  it('framskriver G med gGrowthPct fra currentYear', () => {
    const g = buildGProjection({ currentYear: 2026, currentG: 130_000, fromYear: 2026, toYear: 2027, gGrowthPct: 5 })
    expect(g[2026]).toBe(130_000)
    expect(g[2027]).toBeCloseTo(136_500, 0)
  })
})

describe('accrueFolketrygdBeholdning', () => {
  it('legger 18,1 % av inntekt ≤ 7,1G i beholdningen per år', () => {
    const G = 100_000
    const income = { 2030: 500_000 } // 500k < 7,1G (710k) → hele teller
    const beholdning = accrueFolketrygdBeholdning(income, { 2030: G })
    expect(beholdning).toBeCloseTo(500_000 * FOLKETRYGD_OPPTJENINGSSATS, 2)
  })

  it('kapper inntekt ved 7,1G', () => {
    const G = 100_000
    const tak = TAK_FOLKETRYGD_G * G // 710 000
    const income = { 2030: 900_000 } // over taket
    const beholdning = accrueFolketrygdBeholdning(income, { 2030: G })
    expect(beholdning).toBeCloseTo(tak * FOLKETRYGD_OPPTJENINGSSATS, 2)
  })

  it('summerer over flere år', () => {
    const income = { 2030: 300_000, 2031: 300_000 }
    const g = { 2030: 100_000, 2031: 100_000 }
    const beholdning = accrueFolketrygdBeholdning(income, g)
    expect(beholdning).toBeCloseTo(2 * 300_000 * FOLKETRYGD_OPPTJENINGSSATS, 2)
  })
})

describe('annualFromBeholdning', () => {
  it('deler beholdning på delingstall', () => {
    expect(annualFromBeholdning(1_600_000, 16)).toBeCloseTo(100_000, 6)
  })
})
