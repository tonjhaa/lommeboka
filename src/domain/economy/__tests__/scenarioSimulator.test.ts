import { describe, it, expect } from 'vitest'
import { bumpAccountRates, bumpDebtRates, addSavingsDelta } from '../scenarioSimulator'
import type { SavingsAccount, DebtAccount } from '@/types/economy'

function konto(over: Partial<SavingsAccount> = {}): SavingsAccount {
  return {
    id: 's1', type: 'sparekonto', label: 'Sparekonto',
    openingBalance: 100_000, openingDate: '2025-01-01',
    monthlyContribution: 2_000, interestCreditFrequency: 'monthly',
    rateHistory: [{ fromDate: '2025-01-01', rate: 3 }],
    balanceHistory: [], withdrawals: [], contributions: [], ...over,
  }
}
function laan(over: Partial<DebtAccount> = {}): DebtAccount {
  return {
    id: 'd1', creditor: 'Lån', type: 'annet', originalAmount: 100_000, currentBalance: 80_000,
    rateHistory: [{ fromDate: '2025-01-01', nominalRate: 5 }],
    monthlyPayment: 2_000, termFee: 0, startDate: '2025-01-01', ...over,
  }
}

describe('bumpAccountRates', () => {
  it('legger prosentpoeng på alle rate-historikkpunkter', () => {
    const bumped = bumpAccountRates([konto()], 2)
    expect(bumped[0].rateHistory[0].rate).toBe(5)
  })
  it('0 pp = uendret', () => {
    expect(bumpAccountRates([konto()], 0)[0].rateHistory[0].rate).toBe(3)
  })
})

describe('bumpDebtRates', () => {
  it('legger prosentpoeng på nominalRate', () => {
    expect(bumpDebtRates([laan()], 2)[0].rateHistory[0].nominalRate).toBe(7)
  })
})

describe('addSavingsDelta', () => {
  it('legger delta på første ikke-BSU sparekontos månedsbidrag', () => {
    const out = addSavingsDelta([konto()], 1_500)
    expect(out[0].monthlyContribution).toBe(3_500)
  })
  it('0 delta = uendret referanse-likt innhold', () => {
    expect(addSavingsDelta([konto()], 0)[0].monthlyContribution).toBe(2_000)
  })
  it('syntetiserer en konto hvis ingen sparekonto finnes', () => {
    const out = addSavingsDelta([], 1_000)
    expect(out).toHaveLength(1)
    expect(out[0].monthlyContribution).toBe(1_000)
  })
})
