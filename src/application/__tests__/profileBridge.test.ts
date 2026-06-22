import { describe, it, expect, beforeEach } from 'vitest'
import { useEconomyStore } from '@/application/useEconomyStore'
import { extractLoanInputFromEconomy } from '@/application/profileBridge'

describe('extractLoanInputFromEconomy — år-bevisst', () => {
  beforeEach(() => {
    useEconomyStore.setState({
      profile: { baseMonthly: 50_000, fixedAdditions: [] } as never,
      savingsAccounts: [], fondPortfolio: { monthlyDeposit: 0, startDate: '2025-01-01', funds: [], snapshots: [] } as never,
      debts: [],
    })
  })

  it('uten år (default nå) ⇒ inntekt = baseMonthly*12 (uendret oppførsel)', () => {
    const r = extractLoanInputFromEconomy()
    expect(r.household?.primaryApplicant?.grossIncome).toBe(600_000)
  })
  it('fremtidig år ⇒ inntekt vokser med lønnsvekst', () => {
    const nowYear = new Date().getFullYear()
    const r = extractLoanInputFromEconomy(nowYear + 3)
    expect(r.household?.primaryApplicant?.grossIncome).toBeGreaterThan(600_000)
  })
})
