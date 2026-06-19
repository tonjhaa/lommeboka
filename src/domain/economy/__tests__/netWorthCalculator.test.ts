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
})

describe('monthEndDate', () => {
  it('gir siste dag i måneden', () => {
    expect(monthEndDate(2026, 2).getDate()).toBe(28)
    expect(monthEndDate(2024, 2).getDate()).toBe(29) // skuddår
  })
})

describe('computeNetWorthSeries — tom', () => {
  it('gir et punkt per måned med total 0', () => {
    const s = computeNetWorthSeries(EMPTY)
    expect(s).toHaveLength(3)
    expect(s.every((p) => p.total === 0)).toBe(true)
    expect(s[0].isProjected).toBe(false) // jan ≤ nå (feb)
    expect(s[2].isProjected).toBe(true)  // mars > nå
  })
})
