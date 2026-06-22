import { describe, it, expect } from 'vitest'
import { analyzeMaxPurchase, kausjonNeededForPrice, guarantorFreeCollateral } from '../maxPurchase'
import { defaultConfig } from '@/config/default.config'
import type { HouseholdInput } from '@/types'

const household: HouseholdInput = {
  primaryApplicant: { grossIncome: 750_000, existingDebt: 0, label: 'A' },
  coApplicant: { grossIncome: 650_000, existingDebt: 0, label: 'B' },
  children: 0,
  adults: 2,
}

// Lav EK gjør at EK-regelen binder (kausjon skal da hjelpe).
function analyze(equity: number, kausjon = 0) {
  return analyzeMaxPurchase(
    equity, 0, 0, household, 4_500, 0, 0, defaultConfig,
    5.5, 25, 'selveier', false, kausjon,
  )
}

describe('analyzeMaxPurchase — kausjon-invariant', () => {
  it('kausjon=0 ⇒ uendret fra dagens motor (alle felt)', () => {
    const a = analyze(900_000, 0)
    expect(a.kausjonApplied).toBe(0)
    expect(a.maxPriceWithoutKausjon).toBe(a.maxPurchasePrice)
  })
})

describe('analyzeMaxPurchase — kausjon løfter KUN EK-grensen', () => {
  it('kausjon hever maxByEquity, men ikke debtRatio/affordability', () => {
    const base = analyze(400_000, 0)        // lav EK → EK binder
    const withK = analyze(400_000, 1_000_000)
    expect(withK.maxByEquity).toBeGreaterThan(base.maxByEquity)
    expect(withK.maxByDebtRatio).toBe(base.maxByDebtRatio)
    expect(withK.maxByAffordability).toBe(base.maxByAffordability)
  })
  it('maxPurchasePrice kan ikke overstige kausjonCeiling (min av debt/affordability)', () => {
    const withK = analyze(400_000, 50_000_000)  // urealistisk høy kausjon
    expect(withK.maxPurchasePrice).toBe(withK.kausjonCeiling)
    expect(withK.maxPurchasePrice).toBeLessThanOrEqual(Math.min(withK.maxByDebtRatio, withK.maxByAffordability))
  })
  it('kausjon på en allerede gjeldsgrad-/betjeningsbundet bruker ⇒ 0 løft', () => {
    const base = analyze(5_000_000, 0)        // høy EK → ikke EK-bundet
    const withK = analyze(5_000_000, 2_000_000)
    expect(withK.maxPurchasePrice).toBe(base.maxPurchasePrice)
  })
})

describe('kausjonNeededForPrice', () => {
  it('returnerer EK-mangelen for målpris (krav − EK)', () => {
    const r = kausjonNeededForPrice(3_000_000, 100_000, 0, household, defaultConfig, 5.5, 25, 'selveier', false)
    expect(r.kausjonNeeded).toBeGreaterThan(0)
    // EK-krav ~ 10% av 3M = 300k + gebyrer; med 100k EK trengs ~ 200k+ kausjon
    expect(r.kausjonNeeded).toBeGreaterThan(150_000)
  })
  it('nok EK ⇒ kausjonNeeded = 0', () => {
    const r = kausjonNeededForPrice(1_000_000, 2_000_000, 0, household, defaultConfig, 5.5, 25, 'selveier', false)
    expect(r.kausjonNeeded).toBe(0)
  })
  it('målpris over taket ⇒ reachable=false', () => {
    const r = kausjonNeededForPrice(50_000_000, 100_000, 0, household, defaultConfig, 5.5, 25, 'selveier', false)
    expect(r.reachable).toBe(false)
    expect(r.ceiling).toBeLessThan(50_000_000)
  })
})

describe('guarantorFreeCollateral', () => {
  it('homeValue×maxLTV − mortgage, gulv 0', () => {
    expect(guarantorFreeCollateral(4_000_000, 1_000_000, 0.90)).toBe(2_600_000)
    expect(guarantorFreeCollateral(2_000_000, 2_000_000, 0.90)).toBe(0)
  })
})
