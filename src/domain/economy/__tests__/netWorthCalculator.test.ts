import { describe, it, expect } from 'vitest'
import { enumerateMonths, monthEndDate, computeNetWorthSeries, savingsBalanceAt, fondValueAt, ivfBalanceAt } from '../netWorthCalculator'
import type { NetWorthInput, SavingsAccount, FondPortfolio, IVFTransaction } from '@/types/economy'

function konto(overrides: Partial<SavingsAccount> = {}): SavingsAccount {
  return {
    id: 's1', type: 'sparekonto', label: 'Sparekonto',
    openingBalance: 100_000, openingDate: '2026-01-01',
    monthlyContribution: 1_000, interestCreditFrequency: 'monthly',
    rateHistory: [{ fromDate: '2026-01-01', rate: 0 }],
    balanceHistory: [{ year: 2026, month: 2, balance: 102_000, isManual: false }],
    withdrawals: [], contributions: [],
    ...overrides,
  }
}

const EMPTY: NetWorthInput = {
  scope: 'din',
  from: { year: 2026, month: 1 },
  to: { year: 2026, month: 3 },
  now: { year: 2026, month: 2 },
  savingsAccounts: [],
  fondPortfolio: { monthlyDeposit: 0, startDate: '2026-01-01', funds: [], snapshots: [] },
  ivfTransactions: [],
  debts: [],
  partnerVeikart: { enabled: false, annualIncome: 0, annualNetIncome: 0, equity: 0, bsu: 0, bsuMonthlyContribution: 0, monthlySavings: 0, accounts: [] },
}

describe('enumerateMonths', () => {
  it('lister alle måneder inklusiv endepunkter', () => {
    expect(enumerateMonths({ year: 2025, month: 11 }, { year: 2026, month: 2 }))
      .toEqual([
        { year: 2025, month: 11 }, { year: 2025, month: 12 },
        { year: 2026, month: 1 }, { year: 2026, month: 2 },
      ])
  })

  it('gir én måned når from === to', () => {
    expect(enumerateMonths({ year: 2026, month: 6 }, { year: 2026, month: 6 }))
      .toEqual([{ year: 2026, month: 6 }])
  })
})

describe('monthEndDate', () => {
  it('gir siste dag i måneden (UTC, tidssone-robust)', () => {
    expect(monthEndDate(2026, 2).getUTCDate()).toBe(28)
    expect(monthEndDate(2024, 2).getUTCDate()).toBe(29) // skuddår
  })

  it('toISOString gir korrekt dato uavhengig av tidssone', () => {
    expect(monthEndDate(2026, 2).toISOString().split('T')[0]).toBe('2026-02-28')
  })
})

describe('savingsBalanceAt', () => {
  const now = { year: 2026, month: 2 }
  it('bruker faktisk saldo (computeEffectiveBalance) for fortid/nå', () => {
    // balanceHistory har 102 000 i feb 2026
    expect(savingsBalanceAt([konto()], 2026, 2, now)).toBeCloseTo(102_000, 0)
  })
  it('projiserer fremtid ankret til faktisk nå (vokser med innskudd)', () => {
    const v = savingsBalanceAt([konto()], 2026, 4, now)
    expect(v).toBeGreaterThan(102_000) // to mnd innskudd lagt til
  })
})

describe('fondValueAt', () => {
  const portfolio: FondPortfolio = {
    monthlyDeposit: 0, startDate: '2026-01-01', funds: [],
    snapshots: [
      { date: '2026-01-15', totalValue: 50_000 },
      { date: '2026-03-15', totalValue: 60_000 },
    ],
  }
  const now = { year: 2026, month: 3 }
  it('bruker nærmeste snapshot ≤ måned', () => {
    expect(fondValueAt(portfolio, 2026, 2, now)).toBe(50_000) // siste ≤ feb
    expect(fondValueAt(portfolio, 2026, 3, now)).toBe(60_000)
  })
  it('gir 0 før første snapshot', () => {
    expect(fondValueAt(portfolio, 2025, 12, now)).toBe(0)
  })
})

describe('ivfBalanceAt', () => {
  const txs: IVFTransaction[] = [
    { id: '1', date: '2026-01-10', label: 'Sparing', type: 'SPARING', amount: 20_000 },
    { id: '2', date: '2026-02-10', label: 'Faktura', type: 'FAKTURA', amount: -5_000 },
  ]
  it('kumulativ sum ≤ måned, gulvet på 0', () => {
    expect(ivfBalanceAt(txs, 2026, 1)).toBe(20_000)
    expect(ivfBalanceAt(txs, 2026, 2)).toBe(15_000)
  })
})

describe('computeNetWorthSeries — tom', () => {
  it('gir et punkt per måned med total 0', () => {
    const s = computeNetWorthSeries(EMPTY)
    expect(s).toHaveLength(3)
    expect(s.every((p) => p.total === 0)).toBe(true)
    expect(s[0].isProjected).toBe(false) // jan ≤ nå (feb)
    expect(s[1].isProjected).toBe(false) // feb == nå → ikke projisert
    expect(s[2].isProjected).toBe(true)  // mars > nå
  })
})
