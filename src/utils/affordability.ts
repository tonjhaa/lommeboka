import type {
  AffordabilityAnalysis,
  HouseholdInput,
  LendingRulesConfig,
  AppConfig,
} from '@/types'
import { annuityPayment } from './loan'
import { calcSIFOExpenses } from './sifo'
import { calcHouseholdMonthlyNetIncome } from './tax'

/**
 * Betjeningsevneanalyse (stresstest) i henhold til Boliglånsforskriften.
 *
 * Banken SKAL sjekke at låntakeren kan betjene lånet dersom renten øker
 * med 3 prosentpoeng, dog minimum 7% rente.
 *
 * Beregning:
 *   1. Beregn nettoinntekt etter skatt for husstanden
 *   2. Beregn månedlig terminbeløp ved stresstestrente
 *   3. Beregn SIFO-referansebudsjett for husstanden
 *   4. Legg til øvrige boutgifter (fellesutgifter, eiendomsskatt, etc.)
 *   5. Disponibelt = nettoinntekt - terminbeløp - SIFO - boutgifter
 *   6. Godkjent hvis disponibelt >= 0 (banken kan vurdere noe buffer i tillegg)
 */

/** Minimumsgrense for disponibelt beløp — banken krever positiv betjeningsevne */
const MINIMUM_DISPOSABLE = 0

/** Antatt gjenværende nedbetalingstid for eksisterende gjeld i stresstesten (år).
 *  Bankene stresstester ALL gjeld — eksisterende gjeld modelleres som
 *  annuitet ved stressrente over denne perioden. */
export const EXISTING_DEBT_TERM_YEARS = 15

/** Månedlig betjening av eksisterende gjeld ved stressrente. */
export function calcExistingDebtServicing(
  existingDebt: number,
  stressTestRate: number
): number {
  if (existingDebt <= 0) return 0
  return annuityPayment(existingDebt, stressTestRate, EXISTING_DEBT_TERM_YEARS)
}

/**
 * Beregner stresstestrenten som er bindende.
 */
export function calcStressTestRate(
  nominalRate: number,
  rules: LendingRulesConfig
): number {
  const withAddition = nominalRate + rules.stressTestAddition
  return Math.max(withAddition, rules.minStressTestRate)
}

/**
 * Beregner månedlige boutgifter utover terminbeløp og SIFO.
 */
export function calcOtherMonthlyExpenses(
  monthlyFee: number | undefined,
  propertyTaxAnnual: number | undefined,
  extraMonthlyExpenses: number | undefined,
  termFeePerMonth: number
): number {
  return (
    (monthlyFee ?? 0) +
    (propertyTaxAnnual ?? 0) / 12 +
    (extraMonthlyExpenses ?? 0) +
    termFeePerMonth
  )
}

/**
 * Komplett betjeningsevneanalyse.
 */
export function analyzeAffordability(
  loanAmount: number,
  nominalRate: number,
  termYears: number,
  household: HouseholdInput,
  monthlyFee: number | undefined,
  propertyTaxAnnual: number | undefined,
  extraMonthlyExpenses: number | undefined,
  config: AppConfig,
  existingDebt = 0
): AffordabilityAnalysis {
  const stressTestRate = calcStressTestRate(nominalRate, config.lendingRules)

  const monthlyPaymentNormal = annuityPayment(loanAmount, nominalRate, termYears)
  const monthlyPaymentStress = annuityPayment(loanAmount, stressTestRate, termYears)

  const primaryGross = household.primaryApplicant.grossIncome
  const coGross = household.coApplicant?.grossIncome
  const monthlyNetIncome = calcHouseholdMonthlyNetIncome(primaryGross, coGross)

  const sifoExpenses = calcSIFOExpenses(household, config.sifo)

  const otherMonthlyExpenses = calcOtherMonthlyExpenses(
    monthlyFee,
    propertyTaxAnnual,
    extraMonthlyExpenses,
    config.fees.termFee
  )

  const existingDebtServicing = calcExistingDebtServicing(existingDebt, stressTestRate)

  const disposableAmount =
    monthlyNetIncome - monthlyPaymentStress - sifoExpenses - otherMonthlyExpenses - existingDebtServicing

  const approved = disposableAmount >= MINIMUM_DISPOSABLE

  return {
    monthlyNetIncome: Math.round(monthlyNetIncome),
    monthlyPaymentNormal: Math.round(monthlyPaymentNormal),
    monthlyPaymentStress: Math.round(monthlyPaymentStress),
    stressTestRate,
    sifoExpenses: Math.round(sifoExpenses),
    otherMonthlyExpenses: Math.round(otherMonthlyExpenses),
    existingDebtServicing: Math.round(existingDebtServicing),
    disposableAmount: Math.round(disposableAmount),
    approved,
    minimumDisposable: MINIMUM_DISPOSABLE,
  }
}
