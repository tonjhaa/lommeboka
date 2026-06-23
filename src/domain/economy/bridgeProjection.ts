// ============================================================
// PROJEKSJON FOR PROFIL-BRO — projiserer lønn/EK/gjeld/partner til et målår.
// Gjenbruker netWorth-primitivene → EK/gjeld matcher Formue-over-tid for samme år.
// Rene funksjoner; targetYear = nå ⇒ nå-verdier (bakoverkompatibelt).
// ============================================================

import type { SavingsAccount, FondPortfolio, DebtAccount, PartnerVeikart } from '@/types/economy'
import { savingsBalanceAt, fondValueAt, debtBalanceAt, partnerNetWorthAt } from './netWorthCalculator'

/** Brutto årsinntekt framskrevet med antatt lønnsvekst (whole-year-eksponent). */
export function projectIncomeToYear(annualIncome: number, nowYear: number, targetYear: number, growthPct: number): number {
  const years = Math.max(0, targetYear - nowYear)
  return Math.round(annualIncome * Math.pow(1 + growthPct / 100, years))
}

/** EK (sparing + fond) ved målåret — samme primitiver som netWorth/Formue-over-tid. */
export function projectEquityToYear(
  equityAccounts: SavingsAccount[], fondPortfolio: FondPortfolio,
  targetYear: number, targetMonth: number, now: { year: number; month: number },
): number {
  return Math.round(
    savingsBalanceAt(equityAccounts, targetYear, targetMonth, now) +
    fondValueAt(fondPortfolio, targetYear, targetMonth, now),
  )
}

/** Restgjeld ved målåret — samme primitiv som netWorth/Formue-over-tid. */
export function projectDebtToYear(
  debts: DebtAccount[], targetYear: number, targetMonth: number, now: { year: number; month: number },
): number {
  return Math.round(debtBalanceAt(debts, targetYear, targetMonth, now))
}

/** Partner projisert til målåret: inntekt med vekst, EK/gjeld via partnerNetWorthAt. */
export function projectPartnerToYear(
  partner: PartnerVeikart, targetYear: number, targetMonth: number,
  now: { year: number; month: number }, growthPct: number,
): { grossIncome: number; equity: number; debt: number } | null {
  if (!partner?.enabled) return null
  const grossIncome = projectIncomeToYear(Math.round(partner.annualIncome ?? 0), now.year, targetYear, growthPct)
  const nw = partnerNetWorthAt(partner, targetYear, targetMonth, now)
  return { grossIncome, equity: Math.round(nw.sparing + nw.fond), debt: Math.round(nw.gjeld) }
}
