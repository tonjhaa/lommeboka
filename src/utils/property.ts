import type { PropertyInput, PropertyAnalysis, FeesConfig, LendingRulesConfig } from '@/types'

/**
 * Beregner alle kjopskostnader og laanebeloep for en eiendom.
 *
 * Dokumentavgift:
 *   - Selveier: 2.5% av kjopesummen
 *   - Andel/borettslag eller aksje: 0% (eierformen overtar gjelden)
 *
 * Gebyrer:
 *   - Betalt kontant (standard): trekkes fra egenkapitalen
 *   - Finansiert i laanet: alle gebyrer legges til laanesaldoen, EK reduseres ikke
 */

export interface AcquisitionFees {
  stampDuty: number
  mortgageRegistrationFee: number
  propertyRegistrationFee: number
  loanEstablishmentFee: number
  /** Gebyrer som betales kontant av EK (0 naar alle finansieres) */
  totalFees: number
  /** Gebyrer finansiert i laanet (0 hvis kontant) */
  financedFees: number
}

/**
 * Beregner alle gebyrer ved kjop.
 */
export function calcAcquisitionFees(
  purchasePrice: number,
  fees: FeesConfig,
  ownershipType?: 'selveier' | 'andel' | 'aksje',
  financeAllFees = false
): AcquisitionFees {
  const stampDutyPercent =
    ownershipType === 'andel' || ownershipType === 'aksje' ? 0 : fees.stampDutyPercent

  const stampDuty = Math.round(purchasePrice * (stampDutyPercent / 100))
  const allFees =
    stampDuty +
    fees.mortgageRegistrationFee +
    fees.propertyRegistrationFee +
    fees.loanEstablishmentFee

  const financedFees = financeAllFees ? allFees : 0
  const totalFees = financeAllFees ? 0 : allFees

  return {
    stampDuty,
    mortgageRegistrationFee: fees.mortgageRegistrationFee,
    propertyRegistrationFee: fees.propertyRegistrationFee,
    loanEstablishmentFee: fees.loanEstablishmentFee,
    totalFees,
    financedFees,
  }
}

/**
 * Beregner effektiv egenkapital etter fratrekk av kontantgebyrer.
 */
export function calcEffectiveEquity(equity: number, totalFees: number): number {
  return Math.max(0, equity - totalFees)
}

/**
 * Beregner total boligverdi inkl. fellesgjeld.
 */
export function calcTotalPropertyValue(property: PropertyInput): number {
  return property.price + (property.sharedDebt ?? 0)
}

/**
 * Komplett PropertyAnalysis for ett scenario.
 */
export function analyzeProperty(
  property: PropertyInput,
  equity: number,
  fees: FeesConfig,
  rules: LendingRulesConfig,
  financeAllFees = false
): PropertyAnalysis {
  const totalValue = calcTotalPropertyValue(property)
  const sharedDebt = property.sharedDebt ?? 0
  const feeBreakdown = calcAcquisitionFees(
    property.price,
    fees,
    property.ownershipType,
    financeAllFees
  )
  const effectiveEquity = calcEffectiveEquity(equity, feeBreakdown.totalFees)

  const totalAcquisitionCost = totalValue + feeBreakdown.totalFees + feeBreakdown.financedFees
  // Eget banklån: kjøpesum − effektiv EK. Fellesgjelden er borettslagets lån —
  // den betjenes via felleskostnadene og skal IKKE inn i ditt eget annuitetslån.
  const loanAmount = Math.max(
    0,
    property.price - effectiveEquity + feeBreakdown.financedFees
  )
  // Belåningsgrad per utlånsforskriften: (eget lån + andel fellesgjeld) / verdi inkl. fellesgjeld.
  const ltvRatio = totalValue > 0 ? ((loanAmount + sharedDebt) / totalValue) * 100 : 0

  return {
    purchasePrice: property.price,
    stampDuty: feeBreakdown.stampDuty,
    mortgageRegistrationFee: feeBreakdown.mortgageRegistrationFee,
    propertyRegistrationFee: feeBreakdown.propertyRegistrationFee,
    buyerCosts: 0,
    totalAcquisitionCost,
    loanAmount,
    ltvRatio,
    maxLtvRatio: rules.maxLtvRatio,
  }
}
