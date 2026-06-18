import { describe, it, expect } from 'vitest'
import { buildIncomeProjection, buildGProjection, accrueFolketrygdBeholdning, annualFromBeholdning, accrueSpkPaaslagBeholdning, sumLivsinntektUnder7_1G, annualAfp } from '../pensionCalculator'
import { FOLKETRYGD_OPPTJENINGSSATS, TAK_FOLKETRYGD_G, SPK_PAASLAG_SATS_LAV, SPK_PAASLAG_SATS_HOY, TAK_SPK_G, AFP_OPPTJENINGSSATS } from '@/config/economy.config'

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

describe('accrueSpkPaaslagBeholdning', () => {
  it('gir kun lav sats når grunnlag ≤ 7,1G', () => {
    const G = 100_000
    const grunnlag = { 2030: 500_000 } // < 7,1G
    const beholdning = accrueSpkPaaslagBeholdning(grunnlag, { 2030: G })
    expect(beholdning).toBeCloseTo(500_000 * SPK_PAASLAG_SATS_LAV, 2)
  })

  it('legger høy sats på båndet 7,1G–12G', () => {
    const G = 100_000
    const grunnlag = { 2030: 800_000 } // 7,1G=710k, 12G=1,2M → bånd = 90k
    const beholdning = accrueSpkPaaslagBeholdning(grunnlag, { 2030: G })
    const forventet = 800_000 * SPK_PAASLAG_SATS_LAV + (800_000 - 7.1 * G) * SPK_PAASLAG_SATS_HOY
    expect(beholdning).toBeCloseTo(forventet, 2)
  })

  it('kapper grunnlaget ved 12G', () => {
    const G = 100_000
    const grunnlag = { 2030: 2_000_000 } // over 12G
    const beholdning = accrueSpkPaaslagBeholdning(grunnlag, { 2030: G })
    const cap = TAK_SPK_G * G // 1,2M
    const forventet = cap * SPK_PAASLAG_SATS_LAV + (cap - 7.1 * G) * SPK_PAASLAG_SATS_HOY
    expect(beholdning).toBeCloseTo(forventet, 2)
  })
})

describe('AFP (ny livsvarig)', () => {
  it('summerer livsinntekt kappet ved 7,1G', () => {
    const G = 100_000
    const income = { 2030: 500_000, 2031: 900_000 } // år 2: kappes til 710k
    const sum = sumLivsinntektUnder7_1G(income, { 2030: G, 2031: G })
    expect(sum).toBeCloseTo(500_000 + 710_000, 2)
  })

  it('beregner AFP = livsinntekt × 4,21 % / delingstall', () => {
    const livsinntekt = 20_000_000
    const delingstall = 16
    expect(annualAfp(livsinntekt, delingstall)).toBeCloseTo(
      livsinntekt * AFP_OPPTJENINGSSATS / delingstall, 4,
    )
  })
})
