import type { TaxSettlementRecord, TaxSettlementAnalysis } from '@/types/economy'
import { TAX_REFUND_RECOMMENDATION_THRESHOLD } from '@/config/economy.config'

/**
 * Analyserer skatteoppgjør-historikk og gir anbefaling om justering av ekstra trekk.
 *
 * - Positivt skattTilGodeEllerRest = du får penger tilbake (til gode)
 * - Negativt skattTilGodeEllerRest = du skylder restskatt
 */
export function analyzeTaxSettlements(
  records: TaxSettlementRecord[],
  currentExtraWithholding: number
): TaxSettlementAnalysis {
  if (records.length === 0) {
    return {
      records,
      avgYearlyRefund: 0,
      recommendation: 'keep',
      recommendedExtraAdjustment: 0,
      reasoning: 'Ingen skatteoppgjør registrert ennå.',
    }
  }

  // Bruk siste 3 år
  const recent = [...records]
    .sort((a, b) => b.year - a.year)
    .slice(0, 3)

  // positivt = tilgode, negativt = restskatt — bruker displayOverride om satt
  const refunds = recent.map((r) => r.displayOverride !== undefined ? r.displayOverride : r.skattTilGodeEllerRest)
  const avgYearlyRefund = refunds.reduce((s, r) => s + r, 0) / refunds.length

  let recommendation: TaxSettlementAnalysis['recommendation']
  let recommendedExtraAdjustment: number
  let reasoning: string

  if (avgYearlyRefund > TAX_REFUND_RECOMMENDATION_THRESHOLD) {
    // Systematisk tilgode — kan redusere ekstra trekk
    recommendation = 'reduce_extra'
    const monthlyOver = Math.round(avgYearlyRefund / 12 / 100) * 100
    recommendedExtraAdjustment = Math.min(monthlyOver, currentExtraWithholding)
    reasoning =
      `Du har i snitt fått ${Math.round(avgYearlyRefund).toLocaleString('no-NO')} kr tilbake ` +
      `siste ${recent.length} år. Du betaler ca. ${recommendedExtraAdjustment.toLocaleString('no-NO')} kr/mnd for mye i trekk. ` +
      `Ved å redusere ekstra trekk med dette beløpet vil du ha mer å disponere hver måned.`
  } else if (avgYearlyRefund < -TAX_REFUND_RECOMMENDATION_THRESHOLD) {
    // Systematisk restskatt
    recommendation = 'increase_extra'
    const monthlyUnder = Math.round(Math.abs(avgYearlyRefund) / 12 / 100) * 100
    recommendedExtraAdjustment = monthlyUnder
    reasoning =
      `Du har i snitt betalt ${Math.round(Math.abs(avgYearlyRefund)).toLocaleString('no-NO')} kr i restskatt ` +
      `siste ${recent.length} år. Vurder å øke ekstra trekk med ` +
      `${recommendedExtraAdjustment.toLocaleString('no-NO')} kr/mnd for å unngå restskatt.`
  } else {
    recommendation = 'keep'
    recommendedExtraAdjustment = 0
    reasoning = `Skatteoppgjørene er godt balansert (snitt ±${Math.abs(Math.round(avgYearlyRefund)).toLocaleString('no-NO')} kr/år). Ingen justeringer nødvendig.`
  }

  return {
    records: recent,
    avgYearlyRefund,
    recommendation,
    recommendedExtraAdjustment,
    reasoning,
  }
}

/**
 * Skatteoppgjørs-saldo. Positivt = til gode (du får penger),
 * negativt = restskatt (du skylder). Samme konvensjon som
 * TaxSettlementRecord.skattTilGodeEllerRest.
 */
export function settlementBalance(innbetaltTrekk: number, beregnetInntektsskatt: number): number {
  return Math.round(innbetaltTrekk - beregnetInntektsskatt)
}
