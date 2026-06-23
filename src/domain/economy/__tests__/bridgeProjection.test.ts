import { describe, it, expect } from 'vitest'
import {
  projectIncomeToYear, projectEquityToYear, projectDebtToYear, projectPartnerToYear,
} from '../bridgeProjection'
import { savingsBalanceAt, fondValueAt, debtBalanceAt } from '../netWorthCalculator'
import type { SavingsAccount, FondPortfolio, DebtAccount, PartnerVeikart } from '@/types/economy'

const now = { year: 2026, month: 6 }
const accounts: SavingsAccount[] = [
  { id: 'a', name: 'Spar', type: 'sparekonto', openingBalance: 200_000, openingDate: '2024-01-01',
    monthlyContribution: 5_000, rateTiers: [{ threshold: 0, rate: 3 }],
    balanceHistory: [{ year: 2026, month: 6, balance: 270_000, isManual: false }],
    withdrawals: [], contributions: [],
    rateHistory: [{ fromDate: '2024-01-01', rate: 3 }] } as unknown as SavingsAccount,
]
const fond: FondPortfolio = { monthlyDeposit: 0, startDate: '2025-01-01', funds: [], snapshots: [{ date: '2026-06-01', totalValue: 100_000 }] }
const debts: DebtAccount[] = [
  { id: 'd', name: 'Lån', currentBalance: 300_000, monthlyPayment: 4_000, status: 'aktiv' } as unknown as DebtAccount,
]

describe('projectIncomeToYear', () => {
  it('år = nå ⇒ uendret inntekt (eksponent 0)', () => {
    expect(projectIncomeToYear(600_000, 2026, 2026, 3)).toBe(600_000)
  })
  it('3 år fram ⇒ vokser med satsen', () => {
    expect(projectIncomeToYear(600_000, 2026, 2029, 3)).toBe(Math.round(600_000 * Math.pow(1.03, 3)))
  })
})

describe('projectEquityToYear — matcher netWorth-primitivene', () => {
  it('= savingsBalanceAt + fondValueAt ved målåret', () => {
    const ek = projectEquityToYear(accounts, fond, 2029, 6, now)
    const expected = savingsBalanceAt(accounts, 2029, 6, now) + fondValueAt(fond, 2029, 6, now)
    expect(ek).toBe(Math.round(expected))
  })
  it('år = nå ⇒ nå-saldo (bit-identisk grunnlag)', () => {
    const ek = projectEquityToYear(accounts, fond, 2026, 6, now)
    expect(ek).toBe(Math.round(savingsBalanceAt(accounts, 2026, 6, now) + fondValueAt(fond, 2026, 6, now)))
  })
})

describe('projectDebtToYear', () => {
  it('= debtBalanceAt ved målåret', () => {
    expect(projectDebtToYear(debts, 2029, 6, now)).toBe(Math.round(debtBalanceAt(debts, 2029, 6, now)))
  })
})

describe('projectPartnerToYear', () => {
  const partner: PartnerVeikart = {
    enabled: true, partnerName: 'P', annualIncome: 500_000, annualNetIncome: 0,
    equity: 0, bsu: 0, bsuMonthlyContribution: 0, monthlySavings: 2_000, accounts: [{ balance: 100_000 } as never],
    debts: [{ currentBalance: 200_000, monthlyPayment: 3_000 } as never], fondCurrentValue: 50_000,
  } as unknown as PartnerVeikart
  it('projiserer partner-inntekt med vekst + EK/gjeld via partnerNetWorthAt', () => {
    const r = projectPartnerToYear(partner, 2029, 6, now, 3)
    expect(r).not.toBeNull()
    if (r === null) return
    expect(r.grossIncome).toBe(Math.round(500_000 * Math.pow(1.03, 3)))
    expect(r.equity).toBeGreaterThan(0)
    expect(r.debt).toBeLessThan(200_000) // nedbetalt noe over 3 år
  })
  it('partner disabled ⇒ null', () => {
    expect(projectPartnerToYear({ enabled: false } as PartnerVeikart, 2029, 6, now, 3)).toBeNull()
  })
  it('legacy debt-skalar brukes når debts-arrayen er tom', () => {
    const legacy = { enabled: true, partnerName: 'P', annualIncome: 0, monthlySavings: 0,
      accounts: [], debts: [], debt: 150_000 } as unknown as PartnerVeikart
    // år = nå ⇒ ingen nedbetaling ⇒ gjeld = legacy-skalaren
    expect(projectPartnerToYear(legacy, now.year, now.month, now, 3)?.debt).toBe(150_000)
  })
})
