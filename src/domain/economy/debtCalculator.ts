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
 * Tar hensyn til rateHistory (renteendringer underveis).
 */
export function buildRepaymentPlan(debt: DebtAccount): RepaymentPlan {
  const rows: RepaymentRow[] = []
  let balance = debt.currentBalance
  let totalInterestCost = 0
  let monthNum = 0
  const startDate = new Date(debt.startDate)
  const maxMonths = 600 // 50 år som sikkerhetsventil

  while (balance > 0.01 && monthNum < maxMonths) {
    const date = new Date(startDate)
    date.setMonth(date.getMonth() + monthNum)

    const rate = getCurrentRate(debt, date)
    const monthlyRate = rate / 100 / 12

    const interest = balance * monthlyRate
    let principal = debt.monthlyPayment - interest - debt.termFee

    // Betaler mer enn gjenstående
    if (principal > balance) {
      principal = balance
    }

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

  const payoffDate = new Date(startDate)
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
