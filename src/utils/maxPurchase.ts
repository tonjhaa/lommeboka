import type { MaxPurchaseAnalysis, AppConfig, HouseholdInput, PropertyInput } from '@/types'
import { calcAcquisitionFees, calcEffectiveEquity } from './property'
import { calcStressTestRate, calcExistingDebtServicing } from './affordability'
import { calcSIFOExpenses } from './sifo'
import { calcHouseholdMonthlyNetIncome, calcTotalAnnualIncome } from './tax'
import { maxLoanFromPayment } from './loan'

/**
 * Beregner maksimalt kjøpsbeløp begrenset av tre uavhengige regler:
 *
 *  1. EGENKAPITAL: pris <= EK / (EK-krav% + gebyrsats)
 *     Løses med binærsøk siden gebyrer avhenger av prisen.
 *
 *  2. GJELDSGRAD: lån <= inntekt × 5 - eksisterende gjeld
 *     pris = max lån + effektiv EK
 *
 *  3. BETJENINGSEVNE: max månedsbetaling ved stressrente
 *     pris = max lån (invers annuitet) + effektiv EK
 *
 * Den bindende grensen (minste tall) er det reelle makstaket.
 * Alle tre bruker scenarioets eierform og gebyrvalg, og betjeningsevnen
 * bruker scenarioets rente/løpetid — samme forutsetninger som stresstest-kortet.
 */

type OwnershipType = PropertyInput['ownershipType']

/** Løser max pris ved egenkapitalkravet med binærsøk */
function maxPriceByEquity(
  equity: number,
  sharedDebt: number,
  config: AppConfig,
  ownershipType: OwnershipType,
  financeAllFees: boolean
): number {
  const minEqPct = config.lendingRules.minEquityPercent / 100
  const fees = config.fees

  // Binærsøk: finn P slik at effectiveEquity(P) >= (P + sharedDebt) * minEqPct
  let lo = 0
  let hi = equity * 20 // øvre grense langt over realistisk verdi

  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2
    const feeBreakdown = calcAcquisitionFees(mid, fees, ownershipType, financeAllFees)
    const effEq = calcEffectiveEquity(equity, feeBreakdown.totalFees)
    const required = (mid + sharedDebt) * minEqPct

    if (effEq >= required) {
      lo = mid
    } else {
      hi = mid
    }

    if (hi - lo < 100) break
  }

  return Math.round(lo)
}

/** Max pris ved gjeldsgradsregelen */
function maxPriceByDebtRatio(
  equity: number,
  sharedDebt: number,
  existingDebt: number,
  totalAnnualIncome: number,
  config: AppConfig,
  ownershipType: OwnershipType,
  financeAllFees: boolean
): number {
  const maxTotalDebt = totalAnnualIncome * config.lendingRules.maxDebtRatio
  const maxNewLoan = Math.max(0, maxTotalDebt - existingDebt)
  const fees = config.fees

  // Lag estimat på gebyrer (avhenger av pris, men er liten andel)
  const estimatedPrice = maxNewLoan + equity
  const feeBreakdown = calcAcquisitionFees(estimatedPrice, fees, ownershipType, financeAllFees)
  const effEq = calcEffectiveEquity(equity, feeBreakdown.totalFees)

  // lån = pris + fellesgjeld − effEq + finansierte gebyrer  →  løs for pris
  const maxPrice = maxNewLoan + effEq - sharedDebt - feeBreakdown.financedFees
  return Math.max(0, Math.round(maxPrice))
}

/** Max pris ved betjeningsevne (stresstest) — samme modell som analyzeAffordability */
function maxPriceByAffordability(
  equity: number,
  sharedDebt: number,
  existingDebt: number,
  household: HouseholdInput,
  monthlyFee: number,
  propertyTaxAnnual: number,
  extraMonthlyExpenses: number,
  config: AppConfig,
  interestRate: number,
  loanTermYears: number,
  ownershipType: OwnershipType,
  financeAllFees: boolean
): number {
  const primaryGross = household.primaryApplicant.grossIncome
  const coGross = household.coApplicant?.grossIncome
  const monthlyNetIncome = calcHouseholdMonthlyNetIncome(primaryGross, coGross)

  const stressRate = calcStressTestRate(interestRate, config.lendingRules)

  const sifo = calcSIFOExpenses(household, config.sifo)
  // Samme utgiftsmodell som analyzeAffordability: fellesutgifter er allerede månedlige
  const otherExpenses =
    monthlyFee +
    propertyTaxAnnual / 12 +
    extraMonthlyExpenses +
    config.fees.termFee
  const debtServicing = calcExistingDebtServicing(existingDebt, stressRate)

  const maxPayment = monthlyNetIncome - sifo - otherExpenses - debtServicing
  const maxLoan = maxLoanFromPayment(Math.max(0, maxPayment), stressRate, loanTermYears)

  const fees = config.fees
  const estimatedPrice = maxLoan + equity
  const feeBreakdown = calcAcquisitionFees(estimatedPrice, fees, ownershipType, financeAllFees)
  const effEq = calcEffectiveEquity(equity, feeBreakdown.totalFees)

  const maxPrice = maxLoan + effEq - sharedDebt - feeBreakdown.financedFees
  return Math.max(0, Math.round(maxPrice))
}

/**
 * Lettvektsvariant for Veikart og Sparing-månedsoversikten: EK-grensen
 * (med kjøpsgebyrer, antatt selveier) og gjeldsgradsgrensen — uten
 * betjeningsevne (krever husstandsdata). Gir samme tall som kalkulatorens
 * to første grenser, slik at «kjøpekraft» betyr det samme overalt.
 */
export function calcMaxPurchaseSimple(
  equity: number,
  annualIncome: number,
  existingDebt: number,
  config: AppConfig
): number {
  if (equity <= 0) return 0
  const byEquity = maxPriceByEquity(equity, 0, config, 'selveier', false)
  const byDebtRatio = maxPriceByDebtRatio(equity, 0, existingDebt, annualIncome, config, 'selveier', false)
  return Math.max(0, Math.min(byEquity, byDebtRatio))
}

/**
 * Beregner maksimalt kjøpsbeløp fra alle tre regelperspektiver.
 */
export function analyzeMaxPurchase(
  equity: number,
  sharedDebt: number,
  existingDebt: number,
  household: HouseholdInput,
  monthlyFee: number,
  propertyTaxAnnual: number,
  extraMonthlyExpenses: number,
  config: AppConfig,
  interestRate: number = config.loanDefaults.defaultInterestRate,
  loanTermYears: number = config.loanDefaults.defaultLoanTermYears,
  ownershipType: OwnershipType = 'selveier',
  financeAllFees = false
): MaxPurchaseAnalysis {
  const totalAnnualIncome = calcTotalAnnualIncome(
    household.primaryApplicant.grossIncome,
    household.primaryApplicant.otherIncome,
    household.coApplicant?.grossIncome,
    household.coApplicant?.otherIncome
  )

  const maxByEquity = maxPriceByEquity(equity, sharedDebt, config, ownershipType, financeAllFees)
  const maxByDebtRatio = maxPriceByDebtRatio(
    equity,
    sharedDebt,
    existingDebt,
    totalAnnualIncome,
    config,
    ownershipType,
    financeAllFees
  )
  const maxByAffordability = maxPriceByAffordability(
    equity,
    sharedDebt,
    existingDebt,
    household,
    monthlyFee,
    propertyTaxAnnual,
    extraMonthlyExpenses,
    config,
    interestRate,
    loanTermYears,
    ownershipType,
    financeAllFees
  )

  const maxPurchasePrice = Math.min(maxByEquity, maxByDebtRatio, maxByAffordability)

  let limitingFactor: 'equity' | 'debtRatio' | 'affordability'
  if (maxPurchasePrice === maxByEquity) {
    limitingFactor = 'equity'
  } else if (maxPurchasePrice === maxByDebtRatio) {
    limitingFactor = 'debtRatio'
  } else {
    limitingFactor = 'affordability'
  }

  const feeBreakdown = calcAcquisitionFees(maxPurchasePrice, config.fees, ownershipType, financeAllFees)
  const effEq = calcEffectiveEquity(equity, feeBreakdown.totalFees)
  const maxLoanAmount = Math.max(0, maxPurchasePrice + sharedDebt - effEq + feeBreakdown.financedFees)

  return {
    maxByEquity,
    maxByDebtRatio,
    maxByAffordability,
    maxPurchasePrice,
    limitingFactor,
    maxLoanAmount: Math.round(maxLoanAmount),
  }
}
