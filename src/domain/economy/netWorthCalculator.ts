// ============================================================
// FORMUE OVER TID — ren kalkulator (rekonstruksjon, ingen lagring)
// Utleder netto formue per måned fra eksisterende data.
// ============================================================

import type { NetWorthInput, NetWorthPoint, NetWorthSeries } from '@/types/economy'

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
