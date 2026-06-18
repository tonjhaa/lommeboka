// ============================================================
// PENSJONSKALKULATOR — 2020-modellen (født 1963+)
// Rene funksjoner. Satser/tabeller injiseres for deterministisk testing.
// Kildeforankring: navikt/pensjonssimulator (se design-spec).
// ============================================================

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
