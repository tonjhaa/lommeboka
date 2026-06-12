import type {
  RuleMessage,
  ScenarioStatus,
  EquityAnalysis,
  DebtRatioAnalysis,
  AffordabilityAnalysis,
  PropertyAnalysis,
} from '@/types'
import { formatCurrency, formatPercent, formatNumber } from '@/lib/utils'

/**
 * Genererer RuleMessage-objekter basert på analyseresultatene.
 *
 * Regelkoder:
 *   EK_OK / EK_LOW / EK_CRITICAL
 *   DEBT_OK / DEBT_HIGH / DEBT_CRITICAL
 *   AFF_OK / AFF_LOW / AFF_NEGATIVE
 *   LTV_OK / LTV_HIGH
 */

function equityMessages(eq: EquityAnalysis): RuleMessage[] {
  const messages: RuleMessage[] = []

  if (eq.approved) {
    const buffer = eq.equityPercent - eq.requiredEquityPercent
    messages.push({
      id: 'EK_OK',
      severity: buffer > 5 ? 'success' : 'info',
      code: 'EK_OK',
      title: 'Egenkapital godkjent',
      message: `Du har ${formatPercent(eq.equityPercent)} egenkapital — ${formatPercent(buffer)} over kravet på ${formatPercent(eq.requiredEquityPercent)}.`,
      value: eq.equityPercent,
      threshold: eq.requiredEquityPercent,
    })
  } else {
    const missing = Math.abs(eq.equityBuffer)
    messages.push({
      id: 'EK_LOW',
      severity: 'error',
      code: 'EK_LOW',
      title: 'For lite egenkapital',
      message:
        `Du har ${formatPercent(eq.equityPercent)} egenkapital, men kravet er ${formatPercent(eq.requiredEquityPercent)}. ` +
        `Du mangler ${formatCurrency(missing)} i egenkapital.`,
      value: eq.equityPercent,
      threshold: eq.requiredEquityPercent,
    })
  }

  if (eq.sharedDebtIncluded > 0) {
    messages.push({
      id: 'SHARED_DEBT_INFO',
      severity: 'info',
      code: 'SHARED_DEBT_INFO',
      title: 'Fellesgjeld inkludert',
      message: `Fellesgjeld på ${formatCurrency(eq.sharedDebtIncluded)} er inkludert i beregningsgrunnlaget for EK-kravet.`,
      value: eq.sharedDebtIncluded,
    })
  }

  return messages
}

function debtRatioMessages(dr: DebtRatioAnalysis): RuleMessage[] {
  const messages: RuleMessage[] = []

  if (dr.approved) {
    const buffer = dr.maxDebtRatio - dr.debtRatio
    messages.push({
      id: 'DEBT_OK',
      severity: buffer > 0.5 ? 'success' : 'info',
      code: 'DEBT_OK',
      title: 'Gjeldsgrad godkjent',
      message:
        `Gjeldsgraden er ${formatNumber(dr.debtRatio, 2)}× — under makstaket på ${dr.maxDebtRatio}×. ` +
        `Du kan ta opp ${formatCurrency(dr.debtBuffer)} mer i gjeld.`,
      value: dr.debtRatio,
      threshold: dr.maxDebtRatio,
    })
  } else if (dr.debtRatio > dr.maxDebtRatio * 1.1) {
    messages.push({
      id: 'DEBT_CRITICAL',
      severity: 'error',
      code: 'DEBT_CRITICAL',
      title: 'Gjeldsgraden er kritisk høy',
      message:
        `Gjeldsgraden er ${formatNumber(dr.debtRatio, 2)}×, langt over makstaket på ${dr.maxDebtRatio}×. ` +
        `Samlet gjeld overstiger kravet med ${formatCurrency(Math.abs(dr.debtBuffer))}.`,
      value: dr.debtRatio,
      threshold: dr.maxDebtRatio,
    })
  } else {
    messages.push({
      id: 'DEBT_HIGH',
      severity: 'error',
      code: 'DEBT_HIGH',
      title: 'Gjeldsgraden er for høy',
      message:
        `Gjeldsgraden er ${formatNumber(dr.debtRatio, 2)}×, over makstaket på ${dr.maxDebtRatio}×. ` +
        `Du overstiger grensen med ${formatCurrency(Math.abs(dr.debtBuffer))}.`,
      value: dr.debtRatio,
      threshold: dr.maxDebtRatio,
    })
  }

  return messages
}

function affordabilityMessages(aff: AffordabilityAnalysis): RuleMessage[] {
  const messages: RuleMessage[] = []

  if (aff.approved) {
    messages.push({
      id: 'AFF_OK',
      severity: aff.disposableAmount > 5_000 ? 'success' : 'info',
      code: 'AFF_OK',
      title: 'Betjeningsevne godkjent',
      message:
        `Ved stresstestrente på ${formatPercent(aff.stressTestRate)} har du ` +
        `${formatCurrency(aff.disposableAmount)} disponibelt per måned etter alle kostnader.`,
      value: aff.disposableAmount,
      threshold: aff.minimumDisposable,
    })
  } else if (aff.disposableAmount < -10_000) {
    messages.push({
      id: 'AFF_NEGATIVE',
      severity: 'error',
      code: 'AFF_NEGATIVE',
      title: 'Betjeningsevne er kritisk negativ',
      message:
        `Ved stresstestrente på ${formatPercent(aff.stressTestRate)} er underskuddet ` +
        `${formatCurrency(Math.abs(aff.disposableAmount))} per måned. ` +
        `Inntekten er langt under det som trengs for å betjene lånet.`,
      value: aff.disposableAmount,
      threshold: aff.minimumDisposable,
    })
  } else {
    messages.push({
      id: 'AFF_LOW',
      severity: 'error',
      code: 'AFF_LOW',
      title: 'Utilstrekkelig betjeningsevne',
      message:
        `Ved stresstestrente på ${formatPercent(aff.stressTestRate)} er underskuddet ` +
        `${formatCurrency(Math.abs(aff.disposableAmount))} per måned.`,
      value: aff.disposableAmount,
      threshold: aff.minimumDisposable,
    })
  }

  // Stresstest-informasjon
  messages.push({
    id: 'STRESS_INFO',
    severity: 'info',
    code: 'STRESS_INFO',
    title: 'Stresstest',
    message:
      `Månedlig terminbeløp ved stresstestrente (${formatPercent(aff.stressTestRate)}): ` +
      `${formatCurrency(aff.monthlyPaymentStress)} (normal rente: ${formatCurrency(aff.monthlyPaymentNormal)}).`,
    value: aff.stressTestRate,
  })

  return messages
}

function ltvMessages(prop: PropertyAnalysis): RuleMessage[] {
  const messages: RuleMessage[] = []

  if (prop.ltvRatio > prop.maxLtvRatio) {
    messages.push({
      id: 'LTV_HIGH',
      severity: 'error',
      code: 'LTV_HIGH',
      title: 'Belåningsgraden er for høy',
      message:
        `Belåningsgraden er ${formatPercent(prop.ltvRatio)}, over makstaket på ${formatPercent(prop.maxLtvRatio)}. ` +
        `Banken krever tilleggssikkerhet (kausjonist eller annen pant).`,
      value: prop.ltvRatio,
      threshold: prop.maxLtvRatio,
    })
  } else if (prop.ltvRatio > prop.maxLtvRatio - 5) {
    messages.push({
      id: 'LTV_WARN',
      severity: 'warning',
      code: 'LTV_WARN',
      title: 'Belåningsgraden er høy',
      message:
        `Belåningsgraden er ${formatPercent(prop.ltvRatio)} — nær makstaket på ${formatPercent(prop.maxLtvRatio)}.`,
      value: prop.ltvRatio,
      threshold: prop.maxLtvRatio,
    })
  }

  return messages
}

/**
 * Bygger komplett ScenarioStatus fra alle delanalyser.
 */
export function buildScenarioStatus(
  equity: EquityAnalysis,
  debtRatio: DebtRatioAnalysis,
  affordability: AffordabilityAnalysis,
  property: PropertyAnalysis
): ScenarioStatus {
  const messages: RuleMessage[] = [
    ...equityMessages(equity),
    ...debtRatioMessages(debtRatio),
    ...affordabilityMessages(affordability),
    ...ltvMessages(property),
  ]

  const errorCount = messages.filter((m) => m.severity === 'error').length
  const warningCount = messages.filter((m) => m.severity === 'warning').length
  // LTV-brudd (f.eks. ved finansierte gebyrer) skal også velte godkjenningen
  const ltvApproved = property.ltvRatio <= property.maxLtvRatio
  const approved = equity.approved && debtRatio.approved && affordability.approved && ltvApproved

  return {
    approved,
    equityApproved: equity.approved,
    debtRatioApproved: debtRatio.approved,
    affordabilityApproved: affordability.approved,
    ltvApproved,
    messages,
    errorCount,
    warningCount,
  }
}
