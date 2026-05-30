import type { DebtAccount, RepaymentPlan, RepaymentRow } from '@/types/economy'

// ------------------------------------------------------------
// HJELPEFUNKSJONER
// ------------------------------------------------------------

/** Henter gjeldende rentesats for en dato fra rateHistory */
export function getCurrentRate(account: DebtAccount, date: Date = new Date()): number {
  if (!account.rateHistory?.length) return 0
  const sorted = [...account.rateHistory].sort(
    (a, b) => new Date(a.fromDate).getTime() - new Date(b.fromDate).getTime()
  )
  let rate = sorted[0].nominalRate
  for (const entry of sorted) {
    if (new Date(entry.fromDate) <= date) {
      rate = entry.nominalRate
    } else {
      break
    }
  }
  return rate
}

// ------------------------------------------------------------
// TOTAL MÅNEDLIG GJELDSKOSTAND
// ------------------------------------------------------------

// monthlyPayment er totalbeløpet per termin (inkl. renter, avdrag og termingebyr).
// termFee er en del av monthlyPayment og skal ikke legges til en gang til.
export function calculateTotalMonthlyDebtCost(debts: DebtAccount[]): number {
  return debts.reduce((s, d) => s + d.monthlyPayment, 0)
}

// ------------------------------------------------------------
// NEDBETALINGSPLAN
// ------------------------------------------------------------

/**
 * Bygger nedbetalingsplan termin for termin.
 * Støtter daglig renteberegning (rente/365 × faktiske dager) for Lånekassen-kompatibilitet.
 */
export function buildRepaymentPlan(debt: DebtAccount): RepaymentPlan {
  const rows: RepaymentRow[] = []
  let balance = debt.currentBalance
  let totalInterestCost = 0
  let monthNum = 0
  const maxMonths = 600

  const useDailyCalc = debt.dailyInterestCalc ?? false
  const paymentDay = debt.paymentDay ?? 1

  // Finn neste forfallsdato fra i dag
  function nextPaymentDate(from: Date): Date {
    const d = new Date(from)
    if (d.getDate() < paymentDay) {
      d.setDate(paymentDay)
    } else {
      d.setMonth(d.getMonth() + 1)
      d.setDate(paymentDay)
    }
    return d
  }

  // Start fra neste forfallsdato
  let prevDate = nextPaymentDate(new Date())
  // Dersom prevDate er mer enn 1 mnd frem i tid, bruk debt.startDate som ankerpunkt
  const startAnchor = new Date(debt.startDate)
  if (startAnchor > new Date()) {
    prevDate = nextPaymentDate(startAnchor)
  }

  while (balance > 0.01 && monthNum < maxMonths) {
    const currentPaymentDate = new Date(prevDate)
    currentPaymentDate.setMonth(currentPaymentDate.getMonth() + monthNum)
    currentPaymentDate.setDate(paymentDay)

    let interest: number
    if (useDailyCalc) {
      const prevPaymentDate = new Date(currentPaymentDate)
      prevPaymentDate.setMonth(prevPaymentDate.getMonth() - 1)
      const days = Math.round(
        (currentPaymentDate.getTime() - prevPaymentDate.getTime()) / (1000 * 60 * 60 * 24)
      )
      const rate = getCurrentRate(debt, currentPaymentDate)
      interest = balance * (rate / 100 / 365) * days
    } else {
      const rate = getCurrentRate(debt, currentPaymentDate)
      interest = balance * (rate / 100 / 12)
    }

    const rate = getCurrentRate(debt, currentPaymentDate)
    let principal = debt.monthlyPayment - interest - debt.termFee

    if (principal > balance) principal = balance
    if (principal < 0) principal = 0

    balance = Math.max(0, balance - principal)
    totalInterestCost += interest

    rows.push({
      month: monthNum + 1,
      payment: debt.monthlyPayment,
      interest: Math.round(interest * 100) / 100,
      principal: Math.round(principal * 100) / 100,
      balance: Math.round(balance * 100) / 100,
      rate,
    })

    monthNum++
  }

  const payoffDate = new Date(prevDate)
  payoffDate.setMonth(payoffDate.getMonth() + monthNum)

  return {
    rows,
    payoffDate,
    totalInterestCost: Math.round(totalInterestCost),
  }
}

/**
 * Beregner estimert innfrielsesdato.
 */
export function projectDebtFreeDate(debt: DebtAccount): Date {
  const plan = buildRepaymentPlan(debt)
  return plan.payoffDate
}
