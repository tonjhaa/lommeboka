// ============================================================
// PENSJONSKALKULATOR — 2020-modellen (født 1963+)
// Rene funksjoner. Satser/tabeller injiseres for deterministisk testing.
// Kildeforankring: navikt/pensjonssimulator (se design-spec).
// ============================================================

import {
  FOLKETRYGD_OPPTJENINGSSATS,
  TAK_FOLKETRYGD_G,
  SPK_PAASLAG_SATS_LAV,
  SPK_PAASLAG_SATS_HOY,
  TAK_SPK_G,
  AFP_OPPTJENINGSSATS,
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

/** Sum av pensjonsgivende inntekt kappet ved 7,1G per år (AFP-grunnlag). */
export function sumLivsinntektUnder7_1G(
  incomeByYear: Record<number, number>,
  gByYear: Record<number, number>,
): number {
  let sum = 0
  for (const [yearStr, income] of Object.entries(incomeByYear)) {
    const g = gByYear[Number(yearStr)]
    if (!g) continue
    sum += Math.min(income, TAK_FOLKETRYGD_G * g)
  }
  return sum
}

/** Ny livsvarig offentlig AFP: livsinntekt ≤ 7,1G × 4,21 % / delingstall. */
export function annualAfp(livsinntektUnder7_1G: number, delingstall: number): number {
  return delingstall > 0 ? (livsinntektUnder7_1G * AFP_OPPTJENINGSSATS) / delingstall : 0
}

/** SPK påslagsbeholdning: 5,7 % av grunnlag ≤ 12G + 18,1 % av båndet 7,1G–12G. */
export function accrueSpkPaaslagBeholdning(
  grunnlagByYear: Record<number, number>,
  gByYear: Record<number, number>,
): number {
  let beholdning = 0
  for (const [yearStr, grunnlag] of Object.entries(grunnlagByYear)) {
    const year = Number(yearStr)
    const g = gByYear[year]
    if (!g) continue
    const lavtGrunnlag = Math.min(grunnlag, TAK_SPK_G * g)
    const baandStart = TAK_FOLKETRYGD_G * g
    const baand = Math.max(0, Math.min(grunnlag, TAK_SPK_G * g) - baandStart)
    beholdning += lavtGrunnlag * SPK_PAASLAG_SATS_LAV + baand * SPK_PAASLAG_SATS_HOY
  }
  return beholdning
}
