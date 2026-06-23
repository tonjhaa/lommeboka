import { describe, it, expect, beforeEach } from 'vitest'
import { useEconomyStore } from '@/application/useEconomyStore'
import { extractLoanInputFromEconomy } from '@/application/profileBridge'

describe('extractLoanInputFromEconomy — år-bevisst', () => {
  const nowMonth = new Date().toISOString().slice(0, 7) + '-01'

  beforeEach(() => {
    useEconomyStore.setState({
      profile: { baseMonthly: 50_000, fixedAdditions: [] } as never,
      savingsAccounts: [
        { id: 's', name: 'Spar', type: 'sparekonto', openingBalance: 250_000, openingDate: '2024-01-01',
          monthlyContribution: 0, balanceHistory: [], withdrawals: [], rateHistory: [{ from: '2024-01-01', rate: 3 }] } as never,
      ],
      fondPortfolio: { monthlyDeposit: 0, startDate: '2025-01-01', funds: [], snapshots: [{ date: nowMonth, totalValue: 80_000 }] } as never,
      debts: [
        { id: 'd', name: 'Lån', currentBalance: 120_000, monthlyPayment: 2_000, status: 'aktiv' } as never,
      ],
    })
  })

  it('uten år (default nå) ⇒ inntekt/EK/gjeld = nå-snapshot (bakoverkompat-invariant)', () => {
    const r = extractLoanInputFromEconomy()
    expect(r.household?.primaryApplicant?.grossIncome).toBe(600_000)
    // EK = sparekonto-saldo + fond-snapshot (nå); gjeld = aktiv restgjeld (nå)
    expect(r.loanParameters?.equity).toBe(330_000)
    expect(r.household?.primaryApplicant?.existingDebt).toBe(120_000)
  })
  it('fremtidig år ⇒ inntekt vokser med lønnsvekst', () => {
    const nowYear = new Date().getFullYear()
    const r = extractLoanInputFromEconomy(nowYear + 3)
    expect(r.household?.primaryApplicant?.grossIncome).toBeGreaterThan(600_000)
  })
})
