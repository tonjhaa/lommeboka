import type { AmortizationPlan, AmortizationRow } from '@/types'
import { annuityPayment } from './loan'

/**
 * Bygger en amortiseringsplan rad for rad.
 * Stoetter:
 *  - Annuitetslaan (fast terminbeloep)
 *  - Serielaan (fast avdragsdel)
 *  - Renteendring fra termin N (ny fast betaling beregnes)
 *  - Ekstra innbetaling fra termin N:
 *      'shorten': kortere lopetid, samme terminbeloep
 *      'reduce':  lavere terminbeloep, samme lopetid
 */

interface SimulatorOptions {
  rateChange?: { fromMonth: number; newRate: number }
  extraPayment?: { fromMonth: number; amount: number; strategy: 'shorten' | 'reduce'; recurring?: boolean }
  /** Avdragsfrihet fra start: kun renter betales i N år, deretter amortiseres restsaldo over gjenværende løpetid */
  interestOnlyYears?: number
}

function buildPlanObject(
  scenarioId: string,
  loanAmount: number,
  interestRate: number,
  loanType: 'annuitet' | 'serie',
  rows: AmortizationRow[],
  simMeta?: {
    rateChangeMonth?: number
    newRateAfterChange?: number
    extraPaymentFromMonth?: number
    interestSavedByExtraPayment?: number
    monthsSavedByExtraPayment?: number
    originalTermMonths?: number
  }
): AmortizationPlan {
  const totalInterestPaid = rows.reduce((sum, r) => sum + r.interest, 0)
  const totalPaid = rows.reduce((sum, r) => sum + r.payment, 0)

  const yearsCount = Math.ceil(rows.length / 12)
  const rateChangeYear = simMeta?.rateChangeMonth
    ? Math.ceil(simMeta.rateChangeMonth / 12)
    : undefined

  const yearlyTotals = Array.from({ length: yearsCount }, (_, i) => {
    const yearRows = rows.filter((r) => r.year === i + 1)
    return {
      year: i + 1,
      totalPayment: yearRows.reduce((s, r) => s + r.payment, 0),
      totalInterest: yearRows.reduce((s, r) => s + r.interest, 0),
      totalPrincipal: yearRows.reduce((s, r) => s + r.principal, 0),
      endBalance: yearRows[yearRows.length - 1]?.balance ?? 0,
      isRateChangeYear: rateChangeYear !== undefined && i + 1 === rateChangeYear,
    }
  })

  return {
    scenarioId,
    loanAmount,
    interestRate,
    loanType,
    termMonths: rows.length,
    rows,
    totalInterestPaid: Math.round(totalInterestPaid),
    totalPaid: Math.round(totalPaid),
    yearlyTotals,
    ...simMeta,
  }
}

/**
 * Genererer alle nedbetalingsrader med stoette for simulatorer.
 */
function buildRows(
  principal: number,
  annualRate: number,
  termYears: number,
  loanType: 'annuitet' | 'serie',
  opts: SimulatorOptions = {}
): { rows: AmortizationRow[]; simMeta: object } {
  const n = termYears * 12
  const { rateChange, extraPayment, interestOnlyYears } = opts
  const interestOnlyMonths = Math.min(Math.max(0, Math.round((interestOnlyYears ?? 0) * 12)), n - 1)

  // Beregn baseline terminbeloep
  const r = annualRate / 100 / 12
  const fixedPayment = loanType === 'annuitet' ? annuityPayment(principal, annualRate, termYears) : 0
  let fixedPrincipalSeries = loanType === 'serie' ? principal / n : 0

  const rows: AmortizationRow[] = []
  let balance = principal
  let cumulativeInterest = 0
  let cumulativePrincipal = 0
  let currentRate = r
  let currentAnnualRate = annualRate
  let currentFixedPayment = fixedPayment

  // For 'reduce' ekstra innbetaling: ny betaling beregnes etter forste ekstra innbetaling
  let extraPaymentApplied = false

  for (let m = 1; m <= n; m++) {
    if (balance <= 0) break

    // Renteendring
    if (rateChange && m === rateChange.fromMonth) {
      currentRate = rateChange.newRate / 100 / 12
      currentAnnualRate = rateChange.newRate
      const remainingMonths = n - m + 1
      if (loanType === 'annuitet') {
        // Ny fast betaling for resterende lopetid
        currentFixedPayment = annuityPayment(balance, currentAnnualRate, remainingMonths / 12)
      }
    }

    // Avdragsfrihet over: amortiser restsaldoen over gjenvaerende lopetid
    if (interestOnlyMonths > 0 && m === interestOnlyMonths + 1) {
      const remainingMonths = n - interestOnlyMonths
      if (loanType === 'annuitet') {
        currentFixedPayment = annuityPayment(balance, currentAnnualRate, remainingMonths / 12)
      } else {
        fixedPrincipalSeries = balance / remainingMonths
      }
    }

    // Ekstra innbetaling — engangs eller fast hver maaned fra gitt termin
    const applyExtra = extraPayment && (
      extraPayment.recurring
        ? m >= extraPayment.fromMonth
        : m === extraPayment.fromMonth && !extraPaymentApplied
    )
    if (applyExtra && extraPayment) {
      const extra = Math.min(extraPayment.amount, balance)
      balance = Math.max(0, balance - extra)
      cumulativePrincipal += extra

      if (extraPayment.strategy === 'reduce' && loanType === 'annuitet' && !extraPayment.recurring) {
        const remainingMonths = n - m + 1
        // Beregn ny lavere betaling basert paa ny saldo
        const monthlyRate = currentRate
        if (monthlyRate > 0) {
          const pow = Math.pow(1 + monthlyRate, remainingMonths)
          currentFixedPayment = (balance * monthlyRate * pow) / (pow - 1)
        } else {
          currentFixedPayment = balance / remainingMonths
        }
      }
      extraPaymentApplied = true

      if (balance <= 0) break
    }

    const interest = balance * currentRate

    let principalPart: number
    if (m <= interestOnlyMonths) {
      principalPart = 0 // avdragsfrihet: kun renter
    } else if (loanType === 'serie') {
      principalPart = Math.min(fixedPrincipalSeries, balance)
    } else {
      principalPart = Math.min(currentFixedPayment - interest, balance)
    }
    principalPart = Math.max(0, principalPart)

    const payment = principalPart + interest
    balance = Math.max(0, balance - principalPart)
    cumulativeInterest += interest
    cumulativePrincipal += principalPart

    rows.push({
      month: m,
      year: Math.ceil(m / 12),
      payment: Math.round(payment),
      interest: Math.round(interest),
      principal: Math.round(principalPart),
      balance: Math.round(balance),
      cumulativeInterest: Math.round(cumulativeInterest),
      cumulativePrincipal: Math.round(cumulativePrincipal),
    })

    // 'shorten': stopp naar saldo er 0 (kortere lopetid)
    if (balance <= 0) break
  }

  return { rows, simMeta: {} as never }
}

/**
 * Bygger komplett amortiseringsplan med valgfrie simulatorer.
 */
export function buildAmortizationPlanWithSimulator(
  scenarioId: string,
  principal: number,
  annualRate: number,
  termYears: number,
  loanType: 'annuitet' | 'serie',
  rateChange?: { fromMonth: number; newRate: number },
  extraPayment?: { fromMonth: number; amount: number; strategy: 'shorten' | 'reduce'; recurring?: boolean },
  interestOnlyYears?: number
): AmortizationPlan {
  if (principal <= 0) {
    return buildPlanObject(scenarioId, 0, annualRate, loanType, [])
  }

  const hasSimulator = rateChange || extraPayment || (interestOnlyYears ?? 0) > 0
  const opts: SimulatorOptions = hasSimulator ? { rateChange, extraPayment, interestOnlyYears } : {}

  const { rows } = buildRows(principal, annualRate, termYears, loanType, opts)

  // Beregn baseline plan for sammenligning (antall maaneder / total rente uten simulator)
  let simMeta: Parameters<typeof buildPlanObject>[5] = {}

  if (hasSimulator) {
    const { rows: baseRows } = buildRows(principal, annualRate, termYears, loanType)
    const baseInterest = baseRows.reduce((s, r) => s + r.interest, 0)
    const simInterest = rows.reduce((s, r) => s + r.interest, 0)

    simMeta = {
      rateChangeMonth: rateChange?.fromMonth,
      newRateAfterChange: rateChange?.newRate,
      extraPaymentFromMonth: extraPayment?.fromMonth,
      interestSavedByExtraPayment: Math.round(baseInterest - simInterest),
      monthsSavedByExtraPayment:
        extraPayment?.strategy === 'shorten' ? baseRows.length - rows.length : 0,
      originalTermMonths: baseRows.length,
    }
  }

  return buildPlanObject(scenarioId, principal, annualRate, loanType, rows, simMeta)
}

/** Bakoverkompatibel alias */
export function buildAmortizationPlan(
  scenarioId: string,
  principal: number,
  annualRate: number,
  termYears: number,
  loanType: 'annuitet' | 'serie'
): AmortizationPlan {
  return buildAmortizationPlanWithSimulator(scenarioId, principal, annualRate, termYears, loanType)
}

/**
 * Henter ett enkelt aar fra planen (for grafvisning).
 */
export function getYearlySnapshot(
  plan: AmortizationPlan,
  year: number
): AmortizationRow | undefined {
  return plan.rows.find((r) => r.year === year && r.month % 12 === 0)
    ?? plan.rows.filter((r) => r.year === year).at(-1)
}

/**
 * Beregner gjenstaaende saldo etter et gitt antall aar.
 */
export function balanceAfterYears(plan: AmortizationPlan, years: number): number {
  const month = years * 12
  return plan.rows[Math.min(month - 1, plan.rows.length - 1)]?.balance ?? 0
}
