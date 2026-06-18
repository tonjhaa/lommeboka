// ============================================================
// PENSJONSKALKULATOR — 2020-modellen (født 1963+)
// Rene funksjoner. Satser/tabeller injiseres for deterministisk testing.
// Kildeforankring: navikt/pensjonssimulator (se design-spec).
// ============================================================

import {
  FOLKETRYGD_OPPTJENINGSSATS,
  TAK_FOLKETRYGD_G,
} from '@/config/economy.config'

interface IncomeProjectionParams {
  currentYear: number
  currentAnnualIncome: number
  fromYear: number
  toYear: number
  growthPct: number
}

/** Årlig inntekt skalert med vekst relativt til currentYear, for [fromYear, toYear]. */
export function buildIncomeProjection(p: IncomeProjectionParams): Record<number, number> {
  const out: Record<number, number> = {}
  for (let y = p.fromYear; y <= p.toYear; y++) {
    out[y] = p.currentAnnualIncome * Math.pow(1 + p.growthPct / 100, y - p.currentYear)
  }
  return out
}

interface GProjectionParams {
  currentYear: number
  currentG: number
  fromYear: number
  toYear: number
  gGrowthPct: number
}

/** Årlig grunnbeløp framskrevet med gGrowthPct fra currentYear. */
export function buildGProjection(p: GProjectionParams): Record<number, number> {
  const out: Record<number, number> = {}
  for (let y = p.fromYear; y <= p.toYear; y++) {
    out[y] = p.currentG * Math.pow(1 + p.gGrowthPct / 100, y - p.currentYear)
  }
  return out
}

/** Folketrygdens pensjonsbeholdning: 18,1 % av inntekt ≤ 7,1G, summert over år. */
export function accrueFolketrygdBeholdning(
  incomeByYear: Record<number, number>,
  gByYear: Record<number, number>,
): number {
  let beholdning = 0
  for (const [yearStr, income] of Object.entries(incomeByYear)) {
    const year = Number(yearStr)
    const g = gByYear[year]
    if (!g) continue
    const tak = TAK_FOLKETRYGD_G * g
    beholdning += Math.min(income, tak) * FOLKETRYGD_OPPTJENINGSSATS
  }
  return beholdning
}

/** Årlig ytelse = beholdning / delingstall. */
export function annualFromBeholdning(beholdning: number, delingstall: number): number {
  return delingstall > 0 ? beholdning / delingstall : 0
}
