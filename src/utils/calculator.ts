import type { ScenarioInput, LoanAnalysis, AmortizationPlan, DistributionPlan, AppConfig } from '@/types'
import { analyzeProperty } from './property'
import { analyzeEquity } from './equity'
import { analyzeDebtRatio } from './debtRatio'
import { analyzeAffordability } from './affordability'
import { analyzeMaxPurchase } from './maxPurchase'
import { buildScenarioStatus } from './rules'
import { buildAmortizationPlanWithSimulator } from './amortization'
import { buildDistributionPlan } from './distribution'
import { calcTotalAnnualIncome } from './tax'
import { calcAcquisitionFees, calcEffectiveEquity, calcTotalPropertyValue } from './property'

/**
 * Beregner effektive gebyrer og laanebeloep for et scenario.
 * Haandterer ownershipType (0% dok.avgift for andel/aksje) og
 * financeAllFees (finansier alle kjopsgebyrer i laanet).
 */
function calcLoanAmount(scenario: ScenarioInput, config: AppConfig): number {
  const { property, loanParameters } = scenario
  const equity = loanParameters.equity
  const totalPropertyValue = calcTotalPropertyValue(property)
  const financeEstFee = loanParameters.financeAllFees ?? false

  const fees = calcAcquisitionFees(
    property.price,
    config.fees,
    property.ownershipType,
    financeEstFee
  )
  const effectiveEquity = calcEffectiveEquity(equity, fees.totalFees)
  return Math.max(0, totalPropertyValue - effectiveEquity + fees.financedFees)
}

/**
 * Komplett beregning for ett scenario.
 */
export function calculateScenario(
  scenario: ScenarioInput,
  config: AppConfig
): LoanAnalysis {
  const { property, household, loanParameters } = scenario
  const equity = loanParameters.equity
  const financeEstFee = loanParameters.financeAllFees ?? false
  const loanAmount = calcLoanAmount(scenario, config)

  // 1. Boliganalyse
  const propertyAnalysis = analyzeProperty(
    property,
    equity,
    config.fees,
    config.lendingRules,
    financeEstFee
  )

  // 2. Egenkapital — bruk effektiv fees (hensyn til eierform og finansiering)
  const equityAnalysis = analyzeEquity(
    property.price,
    property.sharedDebt ?? 0,
    equity,
    config.fees,
    config.lendingRules,
    property.ownershipType,
    financeEstFee
  )

  // 3. Gjeldsgrad
  const existingDebt =
    (household.primaryApplicant.existingDebt ?? 0) +
    (household.coApplicant?.existingDebt ?? 0)

  const totalAnnualIncome = calcTotalAnnualIncome(
    household.primaryApplicant.grossIncome,
    household.primaryApplicant.otherIncome,
    household.coApplicant?.grossIncome,
    household.coApplicant?.otherIncome
  )

  const debtRatioAnalysis = analyzeDebtRatio(
    loanAmount,
    existingDebt,
    totalAnnualIncome,
    config.lendingRules
  )

  // 4. Betjeningsevne — inkl. betjening av eksisterende gjeld ved stressrente
  const affordabilityAnalysis = analyzeAffordability(
    loanAmount,
    loanParameters.interestRate,
    loanParameters.loanTermYears,
    household,
    property.monthlyFee,
    property.propertyTax,
    loanParameters.extraMonthlyExpenses,
    config,
    existingDebt
  )

  // 5. Maks kjopsbeloep — samme forutsetninger som scenarioet (rente, lopetid, eierform)
  const maxPurchaseAnalysis = analyzeMaxPurchase(
    equity,
    property.sharedDebt ?? 0,
    existingDebt,
    household,
    property.monthlyFee ?? 0,
    property.propertyTax ?? 0,
    loanParameters.extraMonthlyExpenses ?? 0,
    config,
    loanParameters.interestRate,
    loanParameters.loanTermYears,
    property.ownershipType,
    financeEstFee
  )

  // 6. Regelstatus
  const status = buildScenarioStatus(
    equityAnalysis,
    debtRatioAnalysis,
    affordabilityAnalysis,
    propertyAnalysis
  )

  return {
    scenarioId: scenario.id,
    scenarioLabel: scenario.label,
    property: propertyAnalysis,
    equity: equityAnalysis,
    debtRatio: debtRatioAnalysis,
    affordability: affordabilityAnalysis,
    maxPurchase: maxPurchaseAnalysis,
    status,
    calculatedAt: Date.now(),
  }
}

/**
 * Bygger amortiseringsplan for et scenario (med eventuelle simulatorer).
 */
export function calculateAmortization(
  scenario: ScenarioInput,
  config: AppConfig
): AmortizationPlan {
  const loanAmount = calcLoanAmount(scenario, config)
  const { loanParameters } = scenario

  return buildAmortizationPlanWithSimulator(
    scenario.id,
    loanAmount,
    loanParameters.interestRate,
    loanParameters.loanTermYears,
    loanParameters.loanType,
    loanParameters.rateChange,
    loanParameters.extraPayment
  )
}

/**
 * Bygger fordelingsplan for et scenario (kun ved medsoker).
 */
export function calculateDistribution(
  scenario: ScenarioInput,
  config: AppConfig
): DistributionPlan | null {
  const loanAmount = calcLoanAmount(scenario, config)

  return buildDistributionPlan(
    scenario.id,
    scenario.property,
    scenario.household,
    scenario.loanParameters,
    loanAmount,
    scenario.distribution
  )
}

/**
 * Kjorer fullstendig beregning for alle tre output-typer.
 */
export function calculateAll(
  scenario: ScenarioInput,
  config: AppConfig
): {
  analysis: LoanAnalysis
  amortization: AmortizationPlan
  distribution: DistributionPlan | null
} {
  return {
    analysis: calculateScenario(scenario, config),
    amortization: calculateAmortization(scenario, config),
    distribution: calculateDistribution(scenario, config),
  }
}
