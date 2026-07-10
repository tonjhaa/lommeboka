import { buildAmortizationPlan } from './amortization'
import type { AmortizationPlan } from '@/types'

/**
 * Beregningsmotor for bilkalkulatoren. Gjenbruker den eksisterende
 * amortiseringsmotoren (buildAmortizationPlan, samme som boligkalkulatoren
 * bruker) — ingen ny lånematematikk her.
 */

export type FuelType = 'bensin' | 'diesel' | 'el' | 'hybrid'

export interface RunningCostToggle {
  enabled: boolean
  monthlyAmount: number
}

export interface RunningCostYearlyToggle {
  enabled: boolean
  yearlyAmount: number
}

export interface CarLoanInputs {
  price: number
  equity: number
  annualRate: number
  termYears: number
  loanType: 'annuitet' | 'serie'
  fuelType: FuelType | null
  year: number | null
  mileageKm: number | null
  runningCosts: {
    insurance: RunningCostToggle
    fuel: RunningCostToggle
    maintenance: RunningCostYearlyToggle
  }
  availableMonthlyBudget: number
}

export interface CarLoanResult {
  loanAmount: number
  amortization: AmortizationPlan
  monthlyInstallment: number
  totalRunningCostMonthly: number
  totalMonthlyCost: number
  totalInterestCost: number
  affordability: 'ok' | 'stramt' | 'ikke-rad'
}

// Sjablongverdier (kr/km, 2026-nivå) — kun et startforslag, brukeren overstyrer.
const FUEL_COST_PER_KM: Record<FuelType, number> = {
  bensin: 1.8,
  diesel: 1.6,
  el: 0.5,
  hybrid: 1.2,
}
const FUEL_COST_PER_KM_FALLBACK = 1.5
const DEFAULT_ANNUAL_KM = 15_000

/**
 * Estimerer månedlig drivstoff-/ladekostnad. `mileageKm` er kilometerstanden
 * (totalt kjørt siden ny, IKKE årlig kjørelengde) — kombinert med `year`
 * (årsmodell) gir det et estimat på faktisk årlig kjørelengde for akkurat
 * denne bilen: km / (inneværende år - årsmodell). Faller tilbake på et
 * nasjonalt gjennomsnitt (15 000 km/år) når data mangler.
 */
export function estimateFuelCost(
  fuelType: FuelType | null,
  mileageKm: number | null,
  year: number | null
): number {
  const ageYears = year ? Math.max(1, new Date().getFullYear() - year) : null
  const estimatedAnnualKm = mileageKm && ageYears ? mileageKm / ageYears : DEFAULT_ANNUAL_KM
  const costPerKm = fuelType ? FUEL_COST_PER_KM[fuelType] : FUEL_COST_PER_KM_FALLBACK
  return Math.round((estimatedAnnualKm * costPerKm) / 12)
}

export function calculateCarLoan(inputs: CarLoanInputs): CarLoanResult {
  const loanAmount = Math.max(0, inputs.price - inputs.equity)
  const amortization = buildAmortizationPlan(
    'bilkalkulator',
    loanAmount,
    inputs.annualRate,
    inputs.termYears,
    inputs.loanType
  )
  const monthlyInstallment = amortization.rows[0]?.payment ?? 0

  const { insurance, fuel, maintenance } = inputs.runningCosts
  const totalRunningCostMonthly =
    (insurance.enabled ? insurance.monthlyAmount : 0) +
    (fuel.enabled ? fuel.monthlyAmount : 0) +
    (maintenance.enabled ? maintenance.yearlyAmount / 12 : 0)

  const totalMonthlyCost = monthlyInstallment + totalRunningCostMonthly

  let affordability: CarLoanResult['affordability']
  if (totalMonthlyCost <= inputs.availableMonthlyBudget) {
    affordability = 'ok'
  } else if (totalMonthlyCost <= inputs.availableMonthlyBudget * 1.1) {
    affordability = 'stramt'
  } else {
    affordability = 'ikke-rad'
  }

  return {
    loanAmount,
    amortization,
    monthlyInstallment,
    totalRunningCostMonthly,
    totalMonthlyCost,
    totalInterestCost: amortization.totalInterestPaid,
    affordability,
  }
}
