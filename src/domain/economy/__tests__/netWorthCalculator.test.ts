import { describe, it, expect } from 'vitest'
import { enumerateMonths, monthEndDate, computeNetWorthSeries, savingsBalanceAt, fondValueAt, ivfBalanceAt, debtBalanceAt } from '../netWorthCalculator'
import type { NetWorthInput, SavingsAccount, FondPortfolio, IVFTransaction, DebtAccount } from '@/types/economy'

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

function laan(overrides: Partial<DebtAccount> = {}): DebtAccount {
  return {
    id: 'd1', creditor: 'Lånekassen', type: 'studielaan',
    originalAmount: 200_000, currentBalance: 120_000,
    rateHistory: [{ fromDate: '2020-01-01', nominalRate: 4 }],
    monthlyPayment: 3_000, termFee: 0, startDate: '2020-01-01',
    ...overrides,
  }
}

describe('debtBalanceAt', () => {
  const now = { year: 2026, month: 6 }
  it('gir currentBalance ved nå', () => {
    expect(debtBalanceAt([laan()], 2026, 6, now)).toBeCloseTo(120_000, 0)
  })
  it('interpolerer bakover mellom originalAmount (startdato) og currentBalance (nå)', () => {
    // et punkt mellom start og nå skal ligge mellom 120k og 200k
    const v = debtBalanceAt([laan()], 2023, 1, now)
    expect(v).toBeGreaterThan(120_000)
    expect(v).toBeLessThanOrEqual(200_000)
  })
  it('reduseres fremover (amortisering)', () => {
    const v = debtBalanceAt([laan()], 2026, 12, now)
    expect(v).toBeLessThan(120_000)
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

describe('computeNetWorthSeries — konsistens-invariant (din)', () => {
  it('nå-punkt.total == Σ faktisk sparing + fond + maks(0,ivf) − Σ currentBalance', () => {
    const input: NetWorthInput = {
      ...EMPTY,
      from: { year: 2026, month: 1 }, to: { year: 2026, month: 3 }, now: { year: 2026, month: 2 },
      savingsAccounts: [konto()],
      debts: [laan()],
    }
    const s = computeNetWorthSeries(input)
    const naa = s.find((p) => p.year === 2026 && p.month === 2)!
    const forventet = savingsBalanceAt([konto()], 2026, 2, input.now)
      + 0 /* fond */ + 0 /* ivf */ - 120_000 /* gjeld currentBalance */
    expect(naa.total).toBeCloseTo(forventet, 0)
    expect(naa.gjeld).toBeCloseTo(120_000, 0)
  })
})

describe('computeNetWorthSeries — felles', () => {
  const base: NetWorthInput = {
    ...EMPTY,
    from: { year: 2026, month: 2 }, to: { year: 2026, month: 2 }, now: { year: 2026, month: 2 },
    savingsAccounts: [konto()],
  }
  it('felles legger partnerformue oppå din', () => {
    const partner = {
      ...base.partnerVeikart,
      enabled: true,
      accounts: [{ id: 'p1', label: 'Partner sparekonto', balance: 80_000, monthlyContribution: 0, rate: 0 }],
      debts: [{ id: 'pd', label: 'Partner billån', currentBalance: 30_000, interestRate: 5, monthlyPayment: 2000 }],
    }
    const din = computeNetWorthSeries({ ...base, scope: 'din', partnerVeikart: partner })
    const felles = computeNetWorthSeries({ ...base, scope: 'felles', partnerVeikart: partner })
    const naaDin = din[0].total
    const naaFelles = felles[0].total
    // Partner bidrar netto 80 000 − 30 000 = 50 000
    expect(naaFelles - naaDin).toBeCloseTo(50_000, 0)
  })
})
