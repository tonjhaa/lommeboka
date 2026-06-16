import { describe, it, expect } from 'vitest'
import { analyzeTaxSettlements, settlementBalance } from '../taxSettlementCalc'
import type { TaxSettlementRecord } from '@/types/economy'

// Konvensjon (se types/economy.ts og taxSettlementParser):
// positivt skattTilGodeEllerRest = til gode (du får penger), negativt = restskatt

describe('analyzeTaxSettlements', () => {
  it('returnerer keep uten data', () => {
    const result = analyzeTaxSettlements([], 0)
    expect(result.recommendation).toBe('keep')
    expect(result.avgYearlyRefund).toBe(0)
  })

  it('anbefaler reduce_extra ved systematisk tilgode (>5 000 kr snitt)', () => {
    const records: TaxSettlementRecord[] = [
      { year: 2023, skattTilGodeEllerRest: 15_000 },  // 15k tilgode
      { year: 2022, skattTilGodeEllerRest: 12_000 },  // 12k tilgode
      { year: 2021, skattTilGodeEllerRest: 18_000 },  // 18k tilgode
    ]
    const result = analyzeTaxSettlements(records, 1_000)
    expect(result.recommendation).toBe('reduce_extra')
    expect(result.avgYearlyRefund).toBeCloseTo(15_000, 0)
    expect(result.recommendedExtraAdjustment).toBeGreaterThan(0)
  })

  it('anbefaler increase_extra ved systematisk restskatt (> -5 000 kr snitt)', () => {
    const records: TaxSettlementRecord[] = [
      { year: 2023, skattTilGodeEllerRest: -12_000 },  // restskatt
      { year: 2022, skattTilGodeEllerRest: -8_000 },
      { year: 2021, skattTilGodeEllerRest: -9_000 },
    ]
    const result = analyzeTaxSettlements(records, 0)
    expect(result.recommendation).toBe('increase_extra')
    expect(result.recommendedExtraAdjustment).toBeGreaterThan(0)
  })

  it('anbefaler keep ved balanserte oppgjør', () => {
    const records: TaxSettlementRecord[] = [
      { year: 2023, skattTilGodeEllerRest: -2_000 },
      { year: 2022, skattTilGodeEllerRest: 1_000 },
      { year: 2021, skattTilGodeEllerRest: -3_000 },
    ]
    const result = analyzeTaxSettlements(records, 500)
    expect(result.recommendation).toBe('keep')
  })

  it('bruker bare siste 3 år i analysen', () => {
    const records: TaxSettlementRecord[] = [
      { year: 2023, skattTilGodeEllerRest: 20_000 },
      { year: 2022, skattTilGodeEllerRest: 18_000 },
      { year: 2021, skattTilGodeEllerRest: 22_000 },
      { year: 2015, skattTilGodeEllerRest: -50_000 },  // gammelt år — skal ikke telle
    ]
    const result = analyzeTaxSettlements(records, 1_000)
    // Snitt bør være ~20 000 tilgode, ikke påvirket av 2015
    expect(result.avgYearlyRefund).toBeCloseTo(20_000, -2)
    expect(result.recommendation).toBe('reduce_extra')
  })

  it('recommendedExtraAdjustment er rundet til nærmeste 100', () => {
    const records: TaxSettlementRecord[] = [
      { year: 2023, skattTilGodeEllerRest: 12_000 },  // 1000/mnd tilgode
    ]
    const result = analyzeTaxSettlements(records, 2_000)
    expect(result.recommendedExtraAdjustment % 100).toBe(0)
  })

  it('reasoning inneholder nyttig tekst', () => {
    const records: TaxSettlementRecord[] = [
      { year: 2023, skattTilGodeEllerRest: 20_000 },
    ]
    const result = analyzeTaxSettlements(records, 1_000)
    expect(result.reasoning.length).toBeGreaterThan(10)
  })
})

describe('settlementBalance — fortegn (positivt = til gode)', () => {
  it('trekk > skatt → positivt (til gode)', () => {
    expect(settlementBalance(120_000, 100_000)).toBe(20_000)
  })
  it('trekk < skatt → negativt (restskatt)', () => {
    expect(settlementBalance(90_000, 100_000)).toBe(-10_000)
  })
  it('likt → 0', () => {
    expect(settlementBalance(100_000, 100_000)).toBe(0)
  })
})
