import { buildAmortizationPlan } from './amortization'
import type { AmortizationPlan } from '@/types'
import {
  COST_ITEM_DEFAULTS,
  COST_KEYS,
  COST_LEVEL_FACTOR,
  DEFAULT_ANNUAL_KM,
  DEFAULT_DEPRECIATION_PCT,
  ENERGY_PRICE_DEFAULTS,
  FUEL_DEFAULTS,
  LOAN_FEE_DEFAULTS,
  LOAN_RATE_FALLBACK,
  LOAN_RATE_TIERS,
  type CostKey,
  type CostLevel,
} from '@/config/carCost.config'
import { manualTollEstimator, type TollInputs } from '@/domain/toll/tollEstimator'

/**
 * Beregningsmotor for bilkalkulatoren (v2). Gjenbruker den eksisterende
 * amortiseringsmotoren (buildAmortizationPlan, samme som boligkalkulatoren)
 * for lånematematikken — annuitets-/serieformlene ligger der.
 *
 * Prinsipper:
 * - Alle standardverdier kommer fra carCost.config.ts og er ESTIMATER.
 * - Overstyring: kostnadsposter har `overriddenAmount` (null = følg estimat,
 *   skalert med kostnadsnivå lav/normal/høy). Energikostnad kan enten
 *   detaljberegnes fra forbruk/priser eller overstyres flatt.
 * - Verditap er IKKE en kontantkostnad og holdes utenfor totalMonthlyCost;
 *   det vises separat og i totalMonthlyCostInclDepreciation / kost per km.
 * - Ved partnerdeling vurderes «har jeg råd» mot MIN andel, ikke totalen.
 */

export type FuelType = 'bensin' | 'diesel' | 'el' | 'hybrid' | 'ladbar_hybrid'
export type SharingMode = 'alene' | 'femtifemti' | 'prosent' | 'fastbelop'

export const FUEL_TYPE_LABELS: Record<FuelType, string> = {
  bensin: 'Bensin',
  diesel: 'Diesel',
  el: 'El',
  hybrid: 'Hybrid',
  ladbar_hybrid: 'Ladbar hybrid',
}

export const SHARING_MODE_LABELS: Record<SharingMode, string> = {
  alene: 'Jeg betaler alt selv',
  femtifemti: 'Vi deler 50/50',
  prosent: 'Vi deler prosentvis',
  fastbelop: 'Jeg betaler et fast beløp',
}

/** null = følg estimatet (skalert med kostnadsnivå); tall = brukerens overstyring */
export interface CostItem {
  enabled: boolean
  overriddenAmount: number | null
}

/** null-felt = bruk standardverdi for valgt drivlinje */
export interface FuelEconomyOverrides {
  /** l/100 km for fossildelen */
  fossilPer100: number | null
  fossilPricePerLiter: number | null
  /** kWh/100 km for el-delen */
  kwhPer100: number | null
  homePricePerKwh: number | null
  publicPricePerKwh: number | null
  /** Andel offentlig lading, prosent */
  publicChargeSharePct: number | null
  /** Andel elektrisk kjøring (kun ladbar hybrid), prosent */
  electricSharePct: number | null
}

export interface CarLoanInputs {
  // Bil
  price: number
  modelName: string | null
  year: number | null
  mileageKm: number | null
  fuelType: FuelType | null
  gearbox: 'automat' | 'manuell' | null
  // Lån og gebyrer
  equity: number
  /** null = følg rente-estimatet som avhenger av egenkapitalandelen */
  annualRateOverride: number | null
  termYears: number
  loanType: 'annuitet' | 'serie'
  etableringsgebyr: number
  termingebyr: number
  /** Engangskostnad ved eierskifte — betales første måned, finansieres ikke */
  omregistreringsavgift: number
  // Bruk
  annualKm: number
  costLevel: CostLevel
  fuelEconomy: FuelEconomyOverrides
  /** Flat overstyring av beregnet drivstoff-/strømkostnad */
  energyOverride: { enabled: boolean; monthlyAmount: number }
  costs: Record<CostKey, CostItem>
  toll: TollInputs
  depreciation: { enabled: boolean; annualPct: number | null }
  sharing: { mode: SharingMode; myPct: number; myFixedAmount: number }
  availableMonthlyBudget: number
}

export interface CostDriver {
  label: string
  monthly: number
}

export interface CarLoanResult {
  loanAmount: number
  amortization: AmortizationPlan
  /** Terminbeløp første termin (renter + avdrag), uten gebyr */
  monthlyInstallment: number
  /** Terminbeløp + termingebyr */
  monthlyLoanCost: number
  energyCostMonthly: number
  tollCostMonthly: number
  /** Sum av påslåtte faste poster (forsikring, service, dekk, …) */
  fixedCostsMonthly: number
  /** energi + bom + faste poster (ekskl. verditap) */
  operatingCostMonthly: number
  depreciationMonthly: number
  /** Kontantkostnad per måned: lån + drift */
  totalMonthlyCost: number
  totalMonthlyCostInclDepreciation: number
  myShareMonthly: number
  partnerShareMonthly: number
  /** totalMonthlyCost + etableringsgebyr + omregistrering (engangs) */
  firstMonthCost: number
  annualCost: number
  /** Lån (alle terminer + gebyrer) + drift over hele løpetiden */
  totalCostOverLoanTerm: number
  totalInterestCost: number
  /** Inkl. verditap — reell kostnad per kjørte km */
  costPerKm: number
  costPerDay: number
  affordability: 'ok' | 'stramt' | 'ikke-rad'
  /** De største kostnadspostene, sortert synkende — «hva påvirker mest» */
  topCostDrivers: CostDriver[]
  /** Estimert bilverdi når lånet er nedbetalt */
  residualValueAtLoanEnd: number
  /** Siste måned der restgjelden er høyere enn bilens verdi (null = aldri) */
  underwaterUntilMonth: number | null
}

// ------------------------------------------------------------
// OPPLØSNING AV ESTIMATER (brukes også av UI for placeholder-visning)
// ------------------------------------------------------------

/** Effektiv månedskostnad for en fast post: overstyring eller nivåskalert estimat */
export function resolveCostAmount(key: CostKey, inputs: CarLoanInputs): number {
  const item = inputs.costs[key]
  if (item.overriddenAmount !== null) return item.overriddenAmount
  return Math.round(COST_ITEM_DEFAULTS[key].monthly * COST_LEVEL_FACTOR[inputs.costLevel])
}

export interface ResolvedFuelEconomy {
  fossilPer100: number
  fossilPricePerLiter: number
  kwhPer100: number
  homePricePerKwh: number
  publicPricePerKwh: number
  publicChargeSharePct: number
  electricSharePct: number
}

/** Effektive forbruks-/pristall for valgt drivlinje (overstyring eller standard) */
export function resolveFuelEconomy(inputs: CarLoanInputs): ResolvedFuelEconomy {
  const fuelType = inputs.fuelType ?? 'bensin'
  const d = FUEL_DEFAULTS[fuelType]
  const o = inputs.fuelEconomy
  const defaultLiterPrice =
    fuelType === 'diesel' ? ENERGY_PRICE_DEFAULTS.dieselPerLiter : ENERGY_PRICE_DEFAULTS.bensinPerLiter
  return {
    fossilPer100: o.fossilPer100 ?? d.fossilPer100,
    fossilPricePerLiter: o.fossilPricePerLiter ?? defaultLiterPrice,
    kwhPer100: o.kwhPer100 ?? d.kwhPer100,
    homePricePerKwh: o.homePricePerKwh ?? ENERGY_PRICE_DEFAULTS.homeKwh,
    publicPricePerKwh: o.publicPricePerKwh ?? ENERGY_PRICE_DEFAULTS.publicKwh,
    publicChargeSharePct: o.publicChargeSharePct ?? ENERGY_PRICE_DEFAULTS.publicChargeSharePct,
    electricSharePct: o.electricSharePct ?? d.electricSharePct,
  }
}

/**
 * Månedlig drivstoff-/strømkostnad fra forbruksmodellen.
 * - Bensin/diesel/hybrid: ren fossilberegning (hybrid = lavere forbruk).
 * - El: ren strømberegning med blandet hjemme-/offentlig ladepris.
 * - Ladbar hybrid: electricSharePct av kjøringen elektrisk, resten fossilt.
 */
export function computeEnergyCostMonthly(inputs: CarLoanInputs): number {
  if (inputs.energyOverride.enabled) return inputs.energyOverride.monthlyAmount
  if (!inputs.fuelType || inputs.annualKm <= 0) return 0

  const fe = resolveFuelEconomy(inputs)
  const publicShare = Math.min(100, Math.max(0, fe.publicChargeSharePct)) / 100
  const blendedKwhPrice = fe.homePricePerKwh * (1 - publicShare) + fe.publicPricePerKwh * publicShare

  const fossilCostPer100 = fe.fossilPer100 * fe.fossilPricePerLiter
  const elCostPer100 = fe.kwhPer100 * blendedKwhPrice

  const elShare = inputs.fuelType === 'el' ? 1
    : inputs.fuelType === 'ladbar_hybrid' ? Math.min(100, Math.max(0, fe.electricSharePct)) / 100
    : 0

  const blendedCostPer100 = elCostPer100 * elShare + fossilCostPer100 * (1 - elShare)
  return Math.round((inputs.annualKm / 12 / 100) * blendedCostPer100)
}

/** Effektiv verditapsprosent per år (overstyring eller standardestimat) */
export function resolveDepreciationPct(inputs: CarLoanInputs): number {
  return inputs.depreciation.annualPct ?? DEFAULT_DEPRECIATION_PCT
}

/**
 * Estimert bilverdi etter `month` måneder — geometrisk kurve (prosent av
 * GJENSTÅENDE verdi per år, ikke av kjøpesum). Det gir størst tap i kroner
 * de første årene, slik bruktbilmarkedet faktisk oppfører seg.
 */
export function estimatedValueAtMonth(inputs: CarLoanInputs, month: number): number {
  if (!inputs.depreciation.enabled) return inputs.price
  const r = resolveDepreciationPct(inputs) / 100
  return inputs.price * Math.pow(1 - r, month / 12)
}

export interface ValuePoint {
  month: number
  value: number
  remainingDebt: number
}

/**
 * Bilens estimerte verdi mot restgjeld måned for måned over låneperioden.
 * Brukes til verdi/gjeld-grafen og «under vann»-deteksjonen.
 */
export function buildValueVsDebtCurve(
  inputs: CarLoanInputs,
  amortization: AmortizationPlan
): ValuePoint[] {
  const months = inputs.termYears * 12
  const points: ValuePoint[] = []
  for (let m = 0; m <= months; m++) {
    const remainingDebt = m === 0
      ? amortization.loanAmount
      : amortization.rows[m - 1]?.balance ?? 0
    points.push({
      month: m,
      value: Math.round(estimatedValueAtMonth(inputs, m)),
      remainingDebt: Math.round(remainingDebt),
    })
  }
  return points
}

/**
 * Effektiv nominell rente: brukerens overstyring, ellers trinnbasert
 * estimat etter egenkapitalandel (mer EK → lavere rente — slik banker
 * faktisk priser billån etter belåningsgrad).
 */
export function resolveAnnualRate(inputs: CarLoanInputs): number {
  if (inputs.annualRateOverride !== null) return inputs.annualRateOverride
  if (inputs.price <= 0) return LOAN_RATE_FALLBACK
  const equityPct = (inputs.equity / inputs.price) * 100
  for (const tier of LOAN_RATE_TIERS) {
    if (equityPct >= tier.minEquityPct) return tier.rate
  }
  return LOAN_RATE_FALLBACK
}

// ------------------------------------------------------------
// HOVEDBEREGNING
// ------------------------------------------------------------

export function calculateCarLoan(inputs: CarLoanInputs): CarLoanResult {
  const loanAmount = Math.max(0, inputs.price - inputs.equity)
  const amortization = buildAmortizationPlan(
    'bilkalkulator',
    loanAmount,
    resolveAnnualRate(inputs),
    inputs.termYears,
    inputs.loanType
  )
  const monthlyInstallment = amortization.rows[0]?.payment ?? 0
  const monthlyLoanCost = monthlyInstallment + (loanAmount > 0 ? inputs.termingebyr : 0)

  const energyCostMonthly = computeEnergyCostMonthly(inputs)
  const tollCostMonthly = manualTollEstimator.monthlyCost(inputs.toll)
  const fixedCostsMonthly = COST_KEYS.reduce(
    (sum, key) => sum + (inputs.costs[key].enabled ? resolveCostAmount(key, inputs) : 0),
    0
  )
  const operatingCostMonthly = energyCostMonthly + tollCostMonthly + fixedCostsMonthly

  // Snitt månedlig verditap over låneperioden fra den geometriske kurven —
  // matcher totalkostnads-/per-km-perspektivet bedre enn et rent førsteårstap.
  const termMonthsForDepreciation = Math.max(1, inputs.termYears * 12)
  const depreciationMonthly = inputs.depreciation.enabled
    ? Math.round((inputs.price - estimatedValueAtMonth(inputs, termMonthsForDepreciation)) / termMonthsForDepreciation)
    : 0

  const totalMonthlyCost = monthlyLoanCost + operatingCostMonthly
  const totalMonthlyCostInclDepreciation = totalMonthlyCost + depreciationMonthly

  // Partnerdeling — av kontantkostnaden
  let myShareMonthly: number
  switch (inputs.sharing.mode) {
    case 'femtifemti':
      myShareMonthly = totalMonthlyCost / 2
      break
    case 'prosent':
      myShareMonthly = (totalMonthlyCost * Math.min(100, Math.max(0, inputs.sharing.myPct))) / 100
      break
    case 'fastbelop':
      myShareMonthly = Math.min(totalMonthlyCost, Math.max(0, inputs.sharing.myFixedAmount))
      break
    default:
      myShareMonthly = totalMonthlyCost
  }
  const partnerShareMonthly = totalMonthlyCost - myShareMonthly

  const oneTimeFees = (loanAmount > 0 ? inputs.etableringsgebyr : 0) + inputs.omregistreringsavgift
  const firstMonthCost = totalMonthlyCost + oneTimeFees

  const termMonths = inputs.termYears * 12
  const annualCost = totalMonthlyCost * 12
  const totalCostOverLoanTerm =
    amortization.totalPaid +
    (loanAmount > 0 ? inputs.termingebyr * termMonths : 0) +
    oneTimeFees +
    operatingCostMonthly * termMonths

  const costPerKm = inputs.annualKm > 0
    ? (totalMonthlyCostInclDepreciation * 12) / inputs.annualKm
    : 0
  const costPerDay = (totalMonthlyCost * 12) / 365

  // Råd-vurdering mot MIN andel (hele kostnaden når man betaler alt selv)
  let affordability: CarLoanResult['affordability']
  if (myShareMonthly <= inputs.availableMonthlyBudget) {
    affordability = 'ok'
  } else if (myShareMonthly <= inputs.availableMonthlyBudget * 1.1) {
    affordability = 'stramt'
  } else {
    affordability = 'ikke-rad'
  }

  const drivers: CostDriver[] = [
    { label: 'Lån (termin + gebyr)', monthly: monthlyLoanCost },
    { label: 'Drivstoff/strøm', monthly: energyCostMonthly },
    { label: 'Bompenger', monthly: tollCostMonthly },
    { label: 'Verditap', monthly: depreciationMonthly },
    ...COST_KEYS.filter((k) => inputs.costs[k].enabled).map((k) => ({
      label: COST_ITEM_DEFAULTS[k].label,
      monthly: resolveCostAmount(k, inputs),
    })),
  ]
  const topCostDrivers = drivers
    .filter((d) => d.monthly > 0)
    .sort((a, b) => b.monthly - a.monthly)
    .slice(0, 4)

  const residualValueAtLoanEnd = Math.round(estimatedValueAtMonth(inputs, termMonths))
  let underwaterUntilMonth: number | null = null
  if (loanAmount > 0 && inputs.depreciation.enabled) {
    const curve = buildValueVsDebtCurve(inputs, amortization)
    for (const point of curve) {
      if (point.remainingDebt > point.value) underwaterUntilMonth = point.month
    }
  }

  return {
    loanAmount,
    amortization,
    monthlyInstallment,
    monthlyLoanCost,
    energyCostMonthly,
    tollCostMonthly,
    fixedCostsMonthly,
    operatingCostMonthly,
    depreciationMonthly,
    totalMonthlyCost,
    totalMonthlyCostInclDepreciation,
    myShareMonthly,
    partnerShareMonthly,
    firstMonthCost,
    annualCost,
    totalCostOverLoanTerm,
    totalInterestCost: amortization.totalInterestPaid,
    costPerKm,
    costPerDay,
    affordability,
    topCostDrivers,
    residualValueAtLoanEnd,
    underwaterUntilMonth,
  }
}

// ------------------------------------------------------------
// STANDARDINPUT (brukes av store som utgangstilstand)
// ------------------------------------------------------------

export function defaultCarLoanInputs(): CarLoanInputs {
  const costs = {} as Record<CostKey, CostItem>
  for (const key of COST_KEYS) {
    costs[key] = { enabled: COST_ITEM_DEFAULTS[key].defaultEnabled, overriddenAmount: null }
  }
  return {
    price: 0,
    modelName: null,
    year: null,
    mileageKm: null,
    fuelType: null,
    gearbox: null,
    equity: 0,
    annualRateOverride: null,
    termYears: 5,
    loanType: 'annuitet',
    etableringsgebyr: LOAN_FEE_DEFAULTS.etableringsgebyr,
    termingebyr: LOAN_FEE_DEFAULTS.termingebyr,
    omregistreringsavgift: 0,
    annualKm: DEFAULT_ANNUAL_KM,
    costLevel: 'normal',
    fuelEconomy: {
      fossilPer100: null,
      fossilPricePerLiter: null,
      kwhPer100: null,
      homePricePerKwh: null,
      publicPricePerKwh: null,
      publicChargeSharePct: null,
      electricSharePct: null,
    },
    energyOverride: { enabled: false, monthlyAmount: 0 },
    costs,
    toll: { enabled: false, passesPerDay: 2, pricePerPass: 30, daysPerWeek: 5, discountPct: 20 },
    depreciation: { enabled: true, annualPct: null },
    sharing: { mode: 'alene', myPct: 50, myFixedAmount: 0 },
    availableMonthlyBudget: 0,
  }
}
