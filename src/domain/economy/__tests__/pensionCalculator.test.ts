import { describe, it, expect } from 'vitest'
import { buildIncomeProjection, buildGProjection } from '../pensionCalculator'

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
