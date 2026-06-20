// ============================================================
// SCENARIO-SIMULATOR — hva-skjer-hvis via eksisterende motorer
// Rene funksjoner. Transformerer input og kjører motorene to ganger.
// ============================================================

import type { SavingsAccount, DebtAccount } from '@/types/economy'

/** Legg prosentpoeng på alle rentepunkter for hver sparekonto. */
export function bumpAccountRates(accounts: SavingsAccount[], deltaPp: number): SavingsAccount[] {
  if (deltaPp === 0) return accounts
  return accounts.map((a) => ({
    ...a,
    rateHistory: a.rateHistory.map((r) => ({ ...r, rate: r.rate + deltaPp })),
    tieredRates: a.tieredRates?.map((t) => ({ ...t, rate: t.rate + deltaPp })),
    tieredRateHistory: a.tieredRateHistory?.map((h) => ({ ...h, tiers: h.tiers.map((t) => ({ ...t, rate: t.rate + deltaPp })) })),
  }))
}

/** Legg prosentpoeng på nominalRate for hver gjeld. */
export function bumpDebtRates(debts: DebtAccount[], deltaPp: number): DebtAccount[] {
  if (deltaPp === 0) return debts
  return debts.map((d) => ({
    ...d,
    rateHistory: d.rateHistory.map((r) => ({ ...r, nominalRate: r.nominalRate + deltaPp })),
  }))
}

/** Legg månedlig sparingDelta på første ikke-BSU sparekonto; syntetiser om ingen finnes. */
export function addSavingsDelta(accounts: SavingsAccount[], deltaPerMonth: number): SavingsAccount[] {
  if (deltaPerMonth === 0) return accounts
  const idx = accounts.findIndex((a) => a.type !== 'BSU')
  if (idx === -1) {
    const synthetic: SavingsAccount = {
      id: 'scenario-savings', type: 'sparekonto', label: 'Scenario-sparing',
      openingBalance: 0, openingDate: new Date().toISOString().split('T')[0],
      monthlyContribution: deltaPerMonth, interestCreditFrequency: 'monthly',
      rateHistory: [{ fromDate: new Date().toISOString().split('T')[0], rate: 0 }],
      balanceHistory: [], withdrawals: [], contributions: [],
    }
    return [...accounts, synthetic]
  }
  return accounts.map((a, i) => i === idx ? { ...a, monthlyContribution: a.monthlyContribution + deltaPerMonth } : a)
}
