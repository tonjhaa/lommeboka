/**
 * Standardestimater for bilkalkulatoren — ALLE tall her er grove estimater
 * (norske 2026-nivåer), ment som startpunkt brukeren kan overstyre. De er
 * IKKE fasit og merkes som estimat i UI.
 *
 * Samlet på ett sted slik at satser kan justeres uten å lete i beregnings-
 * eller UI-kode.
 */

import type { FuelType } from '@/utils/carLoanCalculator'

export type CostLevel = 'lav' | 'normal' | 'hoy'

/** Skaleringsfaktor per kostnadsnivå — gjelder kun estimater brukeren ikke har overstyrt */
export const COST_LEVEL_FACTOR: Record<CostLevel, number> = {
  lav: 0.7,
  normal: 1.0,
  hoy: 1.35,
}

export const COST_LEVEL_LABELS: Record<CostLevel, string> = {
  lav: 'Lavt',
  normal: 'Normalt',
  hoy: 'Høyt',
}

/** Faste månedlige kostnadsposter med normal-estimat (kr/mnd før nivåskalering) */
export const COST_ITEM_DEFAULTS = {
  insurance: { label: 'Forsikring', monthly: 800, defaultEnabled: true },
  service: { label: 'Service og vedlikehold', monthly: 500, defaultEnabled: true },
  tires: { label: 'Dekk', monthly: 200, defaultEnabled: true },
  trafikkforsikringsavgift: { label: 'Trafikkforsikringsavgift', monthly: 265, defaultEnabled: true },
  parking: { label: 'Parkering', monthly: 400, defaultEnabled: false },
  washing: { label: 'Vask og rekvisita', monthly: 100, defaultEnabled: false },
  subscriptions: { label: 'Abonnementer (lading, bombrikke, apper)', monthly: 150, defaultEnabled: false },
  buffer: { label: 'Buffer / uforutsett (EU-kontroll, reparasjoner)', monthly: 300, defaultEnabled: true },
} as const

export type CostKey = keyof typeof COST_ITEM_DEFAULTS

export const COST_KEYS = Object.keys(COST_ITEM_DEFAULTS) as CostKey[]

/** Drivstoff-/energiestimater per drivlinje. forbruk = per 100 km. */
export const FUEL_DEFAULTS: Record<FuelType, {
  /** l/100km for fossildelen (0 for ren el) */
  fossilPer100: number
  /** kWh/100km for el-delen (0 for ren fossil) */
  kwhPer100: number
  /** Andel av kjøringen som skjer elektrisk (kun relevant for ladbar hybrid) */
  electricSharePct: number
}> = {
  bensin: { fossilPer100: 6.5, kwhPer100: 0, electricSharePct: 0 },
  diesel: { fossilPer100: 5.5, kwhPer100: 0, electricSharePct: 0 },
  hybrid: { fossilPer100: 5.0, kwhPer100: 0, electricSharePct: 0 },
  ladbar_hybrid: { fossilPer100: 6.0, kwhPer100: 20, electricSharePct: 60 },
  el: { fossilPer100: 0, kwhPer100: 18, electricSharePct: 100 },
}

/** Energipriser (estimat, kr) */
export const ENERGY_PRICE_DEFAULTS = {
  bensinPerLiter: 22,
  dieselPerLiter: 20,
  homeKwh: 1.5,
  publicKwh: 5.5,
  /** Andel offentlig lading for elbil/ladbar (prosent) */
  publicChargeSharePct: 20,
}

/** Standard årlig kjørelengde (km) — norsk gjennomsnitt ligger rundt 11–12 000 */
export const DEFAULT_ANNUAL_KM = 12_000

/** Verditap: flat prosent av bilens pris per år. Grovt estimat — reelt tap er
 *  størst de første årene og avhenger sterkt av modell/marked. */
export const DEFAULT_DEPRECIATION_PCT = 10

/** Lånegebyrer (estimat — varierer per bank) */
export const LOAN_FEE_DEFAULTS = {
  etableringsgebyr: 2_500,
  termingebyr: 65,
}

/** Gjennomsnittlig antall uker per måned (365.25 / 7 / 12) — for bompengeberegning */
export const WEEKS_PER_MONTH = 4.345
