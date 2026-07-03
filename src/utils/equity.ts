import type { EquityAnalysis, LendingRulesConfig, FeesConfig } from '@/types'
import { calcAcquisitionFees, calcEffectiveEquity } from './property'

/**
 * Egenkapitalanalyse i henhold til utlaansforskriften.
 *
 * Kravet: Effektiv egenkapital >= minEquityPercent (10% fra 2025) av
 * (kjopspris + fellesgjeld). Effektiv EK = tilgjengelig EK - kontantgebyrer.
 */
export function analyzeEquity(
  purchasePrice: number,
  sharedDebt: number,
  equity: number,
  fees: FeesConfig,
  rules: LendingRulesConfig,
  ownershipType?: 'selveier' | 'andel' | 'aksje',
  financeAllFees = false
): EquityAnalysis {
  const totalPropertyValue = purchasePrice + sharedDebt
  const feeBreakdown = calcAcquisitionFees(
    purchasePrice,
    fees,
    ownershipType,
    financeAllFees
  )
  const effectiveEquity = calcEffectiveEquity(equity, feeBreakdown.totalFees)

  const requiredEquityPercent = rules.minEquityPercent
  const requiredEquity =
    totalPropertyValue * (requiredEquityPercent / 100) + feeBreakdown.totalFees

  const equityPercent =
    totalPropertyValue > 0 ? (effectiveEquity / totalPropertyValue) * 100 : 0

  const approved = equityPercent >= requiredEquityPercent
  const equityBuffer = effectiveEquity - totalPropertyValue * (requiredEquityPercent / 100)

  return {
    availableEquity: equity,
    requiredEquity: Math.round(requiredEquity),
    equityPercent: Math.round(equityPercent * 10) / 10,
    requiredEquityPercent,
    approved,
    equityBuffer: Math.round(equityBuffer),
    sharedDebtIncluded: sharedDebt,
  }
}
