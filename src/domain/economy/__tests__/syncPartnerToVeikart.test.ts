import { describe, it, expect } from 'vitest'
import { buildPartnerVeikartPatch } from '../syncPartnerToVeikart'
import type { SavingsAccount, DebtAccount, EmploymentProfile, PartnerVeikart } from '@/types/economy'

const now = new Date('2026-06-04')

function makeSavingsAccount(overrides: Partial<SavingsAccount> = {}): SavingsAccount {
  return {
    id: 'acc-1',
    type: 'sparekonto',
    label: 'Sparekonto',
    openingBalance: 50_000,
    openingDate: '2025-01-01',
    monthlyContribution: 2_000,
    interestCreditFrequency: 'yearly',
    rateHistory: [{ fromDate: '2025-01-01', rate: 4.1 }],
    balanceHistory: [],
    withdrawals: [],
    contributions: [],
    ...overrides,
  }
}

function makeDebt(overrides: Partial<DebtAccount> = {}): DebtAccount {
  return {
    id: 'debt-1',
    creditor: 'Lånekassen',
    type: 'studielaan',
    originalAmount: 300_000,
    currentBalance: 200_000,
    rateHistory: [{ fromDate: '2025-01-01', nominalRate: 4.5 }],
    monthlyPayment: 2_500,
    termFee: 0,
    startDate: '2020-01-01',
    ...overrides,
  }
}

const stubVeikart: PartnerVeikart = {
  enabled: false,
  annualIncome: 0,
  annualNetIncome: 0,
  equity: 0,
  bsu: 0,
  bsuMonthlyContribution: 0,
  monthlySavings: 0,
  accounts: [],
}

describe('buildPartnerVeikartPatch', () => {
  it('mapper sparekonto til PartnerAccount med riktig saldo', () => {
    const acc = makeSavingsAccount()
    const patch = buildPartnerVeikartPatch([acc], [], null, stubVeikart, now)
    expect(patch.accounts).toHaveLength(1)
    expect(patch.accounts[0].label).toBe('Sparekonto')
    expect(patch.accounts[0].rate).toBe(4.1)
    expect(patch.accounts[0].monthlyContribution).toBe(2_000)
    expect(patch.accounts[0].balance).toBeGreaterThan(50_000)
  })

  it('ekskluderer BSU fra accounts-listen', () => {
    const bsu = makeSavingsAccount({ id: 'bsu-1', type: 'BSU', label: 'BSU' })
    const patch = buildPartnerVeikartPatch([bsu], [], null, stubVeikart, now)
    expect(patch.accounts).toHaveLength(0)
    expect(patch.bsu).toBeGreaterThan(0)
  })

  it('henter annualIncome fra profil', () => {
    const profile = { baseMonthly: 60_000 } as EmploymentProfile
    const patch = buildPartnerVeikartPatch([], [], profile, stubVeikart, now)
    expect(patch.annualIncome).toBe(720_000)
  })

  it('beholder eksisterende annualIncome om profil mangler', () => {
    const existing = { ...stubVeikart, annualIncome: 500_000 }
    const patch = buildPartnerVeikartPatch([], [], null, existing, now)
    expect(patch.annualIncome).toBe(500_000)
  })

  it('mapper aktiv gjeld til PartnerDebt', () => {
    const debt = makeDebt()
    const patch = buildPartnerVeikartPatch([], [debt], null, stubVeikart, now)
    expect(patch.debts).toHaveLength(1)
    expect(patch.debts![0].interestRate).toBe(4.5)
    expect(patch.debts![0].monthlyPayment).toBe(2_500)
    expect(patch.debts![0].label).toBe('Lånekassen')
  })

  it('ekskluderer nedbetalt gjeld', () => {
    const paid = makeDebt({ status: 'nedbetalt' })
    const patch = buildPartnerVeikartPatch([], [paid], null, stubVeikart, now)
    expect(patch.debts).toHaveLength(0)
  })
})
