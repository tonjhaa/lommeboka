import { describe, it, expect } from 'vitest'
import { enumerateMonths, monthEndDate, computeNetWorthSeries } from '../netWorthCalculator'
import type { NetWorthInput } from '@/types/economy'

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
