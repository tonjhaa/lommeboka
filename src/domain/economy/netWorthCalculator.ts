// ============================================================
// FORMUE OVER TID — ren kalkulator (rekonstruksjon, ingen lagring)
// Utleder netto formue per måned fra eksisterende data.
// ============================================================

import type { NetWorthInput, NetWorthPoint, NetWorthSeries, SavingsAccount, FondPortfolio, IVFTransaction } from '@/types/economy'
import { computeEffectiveBalance, projectSavingsGrowth } from './savingsCalculator'

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

/** Månedsindeks fra konto-åpning (0-basert). */
function monthIndexFromOpening(account: SavingsAccount, year: number, month: number): number {
  const open = new Date(account.openingDate)
  return (year - open.getFullYear()) * 12 + (month - (open.getMonth() + 1))
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
  const future = year > now.year || (year === now.year && month > now.month)
  if (!future) {
    return accounts.reduce((s, a) => s + computeEffectiveBalance(a, monthEndDate(year, month)), 0)
  }
  return accounts.reduce((s, a) => {
    const proj = projectSavingsGrowth(a, { year, month })
    const tIdx = monthIndexFromOpening(a, year, month)
    const nowIdx = monthIndexFromOpening(a, now.year, now.month)
    const projT = proj[tIdx] ?? proj[proj.length - 1] ?? 0
    const projNow = proj[nowIdx] ?? projT
    const actualNow = computeEffectiveBalance(a, monthEndDate(now.year, now.month))
    return s + projT + (actualNow - projNow)
  }, 0)
}

/** Fondverdi ved (year,month): nærmeste snapshot ≤ månedsslutt, ellers 0. Fremtid framskrives flatt fra siste snapshot. */
export function fondValueAt(
  portfolio: FondPortfolio,
  year: number,
  month: number,
  _now: { year: number; month: number },
): number {
  const cutoff = monthEndDate(year, month).toISOString().split('T')[0]
  const upto = (portfolio.snapshots ?? [])
    .filter((s) => s.date <= cutoff)
    .sort((a, b) => a.date.localeCompare(b.date))
  return upto.length > 0 ? upto[upto.length - 1].totalValue : 0
}

/** IVF-kassesaldo ved (year,month): maks(0, kumulativ sum av transaksjoner ≤ månedsslutt). */
export function ivfBalanceAt(txs: IVFTransaction[], year: number, month: number): number {
  const cutoff = monthEndDate(year, month).toISOString().split('T')[0]
  const sum = txs.filter((t) => t.date <= cutoff).reduce((s, t) => s + t.amount, 0)
  return Math.max(0, sum)
}

/** True hvis (year,month) er etter `now`. */
function isAfter(year: number, month: number, now: { year: number; month: number }): boolean {
  return year > now.year || (year === now.year && month > now.month)
}

export function computeNetWorthSeries(input: NetWorthInput): NetWorthSeries {
  return enumerateMonths(input.from, input.to).map(({ year, month }): NetWorthPoint => {
    const sparing = 0
    const fond = 0
    const ivf = 0
    const gjeld = 0
    return {
      year, month, sparing, fond, ivf, gjeld,
      total: sparing + fond + ivf - gjeld,
      isProjected: isAfter(year, month, input.now),
    }
  })
}
