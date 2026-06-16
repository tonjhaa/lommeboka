import { calcNorwegianTax } from '@/domain/economy/norwegianTaxRules'

/**
 * Estimert samlet årsskatt for en lønnsmottaker.
 * Delegerer til den kanoniske skattemotoren (norwegianTaxRules) — samme tall som
 * skatteoppgjør, budsjett-trekk og skattekalkulator. Ingen ekstra fradrag (brutto→skatt).
 */
export function calcAnnualTax(grossIncome: number, year: number = new Date().getFullYear()): number {
  return calcNorwegianTax(grossIncome, year).skattEtterFradrag
}

/** Månedlig nettoinntekt etter skatt for én person. */
export function calcMonthlyNetIncome(grossIncome: number, year?: number): number {
  return (grossIncome - calcAnnualTax(grossIncome, year)) / 12
}

/** Total månedlig nettoinntekt for en husholdning. */
export function calcHouseholdMonthlyNetIncome(
  primaryGross: number,
  coApplicantGross: number | undefined,
  year?: number,
): number {
  const primary = calcMonthlyNetIncome(primaryGross, year)
  const co = coApplicantGross ? calcMonthlyNetIncome(coApplicantGross, year) : 0
  return primary + co
}

/** Total bruttoinntekt for husstanden per år. */
export function calcTotalAnnualIncome(
  primaryGross: number,
  primaryOtherIncome: number | undefined,
  coApplicantGross: number | undefined,
  coApplicantOtherIncome: number | undefined,
): number {
  return (
    primaryGross +
    (primaryOtherIncome ?? 0) +
    (coApplicantGross ?? 0) +
    (coApplicantOtherIncome ?? 0)
  )
}
