// ============================================================
// FORMUE OVER TID — ren kalkulator (rekonstruksjon, ingen lagring)
// Utleder netto formue per måned fra eksisterende data.
// ============================================================

import type { NetWorthInput, NetWorthPoint, NetWorthSeries, SavingsAccount, FondPortfolio, IVFTransaction, DebtAccount, PartnerVeikart } from '@/types/economy'
import { computeEffectiveBalance, projectSavingsGrowth, projectBalanceMonthly } from './savingsCalculator'
import { buildRepaymentPlan } from './debtCalculator'
import { DEFAULT_FOND_RATE } from '@/config/economy.config'
import { partnerNonBsuEquity, partnerMonthlySavingsTotal } from '@/types/economy'

/**
 * Siste dag i måneden som Date i UTC. `month` er 1-basert (1 = januar).
 * UTC er bevisst: forbrukere sammenligner via `toISOString().split('T')[0]`
 * (f.eks. `computeEffectiveBalance`), og lokal-midnatt ville gitt feil dato
 * (én dag bak) i tidssoner øst for UTC. Bruk `getUTCDate()` for dag-tall.
 */
export function monthEndDate(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 0)) // dag 0 i neste måned = siste dag denne
}

/** Alle {year,month} fra `from` til `to` inklusiv. */
export function enumerateMonths(
  from: { year: number; month: number },
  to: { year: number; month: number },
): { year: number; month: number }[] {
  const out: { year: number; month: number }[] = []
  let y = from.year
  let m = from.month
  while (y < to.year || (y === to.year && m <= to.month)) {
    out.push({ year: y, month: m })
    m++
    if (m > 12) { m = 1; y++ }
  }
  return out
}

/** Månedsindeks fra konto-åpning (0-basert). UTC-konsistent med monthEndDate. */
function monthIndexFromOpening(account: SavingsAccount, year: number, month: number): number {
  const open = new Date(account.openingDate)
  return (year - open.getUTCFullYear()) * 12 + (month - (open.getUTCMonth() + 1))
}

/**
 * Sparesaldo (sum kontoer) ved (year,month).
 * Fortid/nå: faktisk via computeEffectiveBalance.
 * Fremtid: projectSavingsGrowth, ankret slik at nå-verdien matcher faktisk.
 */
export function savingsBalanceAt(
  accounts: SavingsAccount[],
  year: number,
  month: number,
  now: { year: number; month: number },
): number {
  if (!isAfter(year, month, now)) {
    return accounts.reduce((s, a) => s + computeEffectiveBalance(a, monthEndDate(year, month)), 0)
  }
  return accounts.reduce((s, a) => {
    const tIdx = monthIndexFromOpening(a, year, month)
    if (tIdx < 0) return s // konto ikke åpnet ennå ved målmåneden
    const proj = projectSavingsGrowth(a, { year, month })
    const nowIdx = monthIndexFromOpening(a, now.year, now.month)
    const projT = proj[tIdx] ?? proj[proj.length - 1] ?? 0
    const projNow = proj[nowIdx] ?? projT
    const actualNow = computeEffectiveBalance(a, monthEndDate(now.year, now.month))
    return s + projT + (actualNow - projNow)
  }, 0)
}

/** Siste snapshot-verdi ≤ gitt månedsslutt (0 før første snapshot). */
function fondSnapshotAt(portfolio: FondPortfolio, year: number, month: number): number {
  const cutoff = monthEndDate(year, month).toISOString().split('T')[0]
  const upto = (portfolio.snapshots ?? [])
    .filter((s) => s.date <= cutoff)
    .sort((a, b) => a.date.localeCompare(b.date))
  return upto.length > 0 ? upto[upto.length - 1].totalValue : 0
}

/**
 * Fondverdi ved (year,month).
 * Fortid/nå: nærmeste snapshot ≤ månedsslutt (0 før første snapshot).
 * Fremtid: framskriv fra nå-verdien med månedlig innskudd + forventet avkastning —
 * samme motor (projectBalanceMonthly) og rate (DEFAULT_FOND_RATE) som Veikart bruker,
 * slik at fond-projeksjonen er konsistent på tvers av verktøyet.
 */
export function fondValueAt(
  portfolio: FondPortfolio,
  year: number,
  month: number,
  now: { year: number; month: number },
): number {
  if (!isAfter(year, month, now)) {
    return fondSnapshotAt(portfolio, year, month)
  }
  const startValue = fondSnapshotAt(portfolio, now.year, now.month)
  const months = (year - now.year) * 12 + (month - now.month)
  return projectBalanceMonthly(startValue, portfolio.monthlyDeposit ?? 0, DEFAULT_FOND_RATE, months)
}

/** IVF-kassesaldo ved (year,month): maks(0, kumulativ sum av transaksjoner ≤ månedsslutt). */
export function ivfBalanceAt(txs: IVFTransaction[], year: number, month: number): number {
  const cutoff = monthEndDate(year, month).toISOString().split('T')[0]
  const sum = txs.filter((t) => t.date <= cutoff).reduce((s, t) => s + t.amount, 0)
  return Math.max(0, sum)
}

/** Antall måneder fra (ay,am) til (by,bm). */
function monthsDiff(ay: number, am: number, by: number, bm: number): number {
  return (by - ay) * 12 + (bm - am)
}

/**
 * Gjeldssaldo (sum, positivt) ved (year,month).
 * Nå: currentBalance. Fremtid: buildRepaymentPlan. Fortid: lineær interpolasjon
 * mellom originalAmount (startDate) og currentBalance (nå) — tilnærming, lander
 * eksakt på currentBalance ved nå. Gjeld uten gyldig startDate: flat på currentBalance bakover.
 */
export function debtBalanceAt(
  debts: DebtAccount[],
  year: number,
  month: number,
  now: { year: number; month: number },
): number {
  return debts.reduce((sum, d) => {
    if (year === now.year && month === now.month) return sum + d.currentBalance
    if (isAfter(year, month, now)) {
      // buildRepaymentPlan er i-dag-forankret (rows[i] = saldo etter termin i+1 fra i dag),
      // så indekser fra systemdato. Forutsetter at `now` er inneværende måned (hooken sikrer det).
      const plan = buildRepaymentPlan(d)
      const today = new Date()
      const idx = monthsDiff(today.getUTCFullYear(), today.getUTCMonth() + 1, year, month) - 1
      const bal = idx < 0 ? d.currentBalance : (idx < plan.rows.length ? plan.rows[idx].balance : 0)
      return sum + bal
    }
    // fortid: interpoler start→nå
    const start = new Date(d.startDate)
    if (isNaN(start.getTime()) || !d.originalAmount) return sum + d.currentBalance
    const startY = start.getFullYear()
    const startM = start.getMonth() + 1
    const totalMonths = monthsDiff(startY, startM, now.year, now.month)
    if (totalMonths <= 0) return sum + d.currentBalance
    const elapsed = monthsDiff(startY, startM, year, month)
    const frac = Math.min(1, Math.max(0, elapsed / totalMonths))
    return sum + (d.originalAmount + (d.currentBalance - d.originalAmount) * frac)
  }, 0)
}

/** True hvis (year,month) er etter `now`. */
function isAfter(year: number, month: number, now: { year: number; month: number }): boolean {
  return year > now.year || (year === now.year && month > now.month)
}

/**
 * Partners netto formue ved (year,month) — SIMULERT (partner har ingen balanceHistory).
 * Sparing: nåverdi (accounts + BSU) ± månedssparing × antall måneder fra nå.
 * Fond: flat (fondCurrentValue). Gjeld: nåverdi ± terminbeløp.
 */
export function partnerNetWorthAt(
  partner: PartnerVeikart,
  year: number,
  month: number,
  now: { year: number; month: number },
): { sparing: number; fond: number; gjeld: number } {
  if (!partner.enabled) return { sparing: 0, fond: 0, gjeld: 0 }
  const dM = (year - now.year) * 12 + (month - now.month) // negativ = fortid
  const nowSparing = partnerNonBsuEquity(partner) + (partner.bsu ?? 0)
  const monthlySave = partnerMonthlySavingsTotal(partner) + (partner.bsuMonthlyContribution ?? 0)
  const sparing = Math.max(0, nowSparing + monthlySave * dM)
  const fond = partner.fondCurrentValue ?? 0
  const nowGjeld = (partner.debts ?? []).reduce((s, d) => s + (d.currentBalance ?? 0), 0)
  const monthlyPay = (partner.debts ?? []).reduce((s, d) => s + (d.monthlyPayment ?? 0), 0)
  const gjeld = Math.max(0, nowGjeld - monthlyPay * dM)
  return { sparing, fond, gjeld }
}

export function computeNetWorthSeries(input: NetWorthInput): NetWorthSeries {
  return enumerateMonths(input.from, input.to).map(({ year, month }): NetWorthPoint => {
    const sparing = savingsBalanceAt(input.savingsAccounts, year, month, input.now)
    const fond = fondValueAt(input.fondPortfolio, year, month, input.now)
    const ivf = ivfBalanceAt(input.ivfTransactions, year, month)
    const gjeld = debtBalanceAt(input.debts, year, month, input.now)
    const partner = input.scope === 'felles'
      ? partnerNetWorthAt(input.partnerVeikart, year, month, input.now)
      : { sparing: 0, fond: 0, gjeld: 0 }
    const totalSparing = sparing + partner.sparing
    const totalFond = fond + partner.fond
    const totalGjeld = gjeld + partner.gjeld
    return {
      year, month,
      sparing: totalSparing, fond: totalFond, ivf, gjeld: totalGjeld,
      total: totalSparing + totalFond + ivf - totalGjeld,
      isProjected: isAfter(year, month, input.now),
    }
  })
}
