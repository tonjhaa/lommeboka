// ----------------------------------------------------------------
// Bygger kontohistorikk (innskudd, uttak, årsslutt-saldo og rentesatser)
// ut av en parset kontoutskrift.
//
// Hvorfor dette er et eget steg: banken gir oss en flat transaksjonsliste,
// men Lommeboka trenger tre ulike ting ut av den —
//   1. innskudd  → BSU-kvote, månedsoversikt, sparerate
//   2. renter    → skal IKKE telle mot BSU-kvoten, men må forklare saldoen
//   3. saldopunkt→ ankeret månedsoversikten regner videre fra
// Renter skilles derfor ut som saldohopp ved årsslutt, ikke som innskudd.
// ----------------------------------------------------------------

import type { ParsedBankStatement, ParsedTransaction } from './bankTransactionParser'
import type {
  BalanceHistoryEntry,
  RateHistoryEntry,
  SavingsAccount,
  SavingsContribution,
  WithdrawalEntry,
} from '@/types/economy'

const ACCOUNT_TYPE_MAP: Record<string, SavingsAccount['type']> = {
  BSU: 'BSU', sparekonto: 'sparekonto', annet: 'annet',
}

export function statementAccountType(parsed: ParsedBankStatement): SavingsAccount['type'] {
  return ACCOUNT_TYPE_MAP[parsed.accountType] ?? 'sparekonto'
}

/**
 * Finner kontoen en utskrift hører til. Kontonummer er sikrest, men kontoer
 * opprettet for hånd har det ikke — da faller vi tilbake på kontotype, og bare
 * når det finnes én åpenbar kandidat. Ellers risikerer vi å skrive historikk
 * inn på feil konto.
 *
 * Delt mellom importdialogen (som viser «oppdater» vs. «ny») og selve
 * importen, slik at de aldri kan si to ulike ting.
 */
export function findStatementAccount(
  accounts: SavingsAccount[],
  parsed: ParsedBankStatement,
): SavingsAccount | undefined {
  const byNumber = parsed.accountNumber
    ? accounts.find((a) => a.accountNumber === parsed.accountNumber)
    : undefined
  if (byNumber) return byNumber

  const type = statementAccountType(parsed)
  const untagged = accounts.filter((a) => a.type === type && !a.accountNumber)
  return untagged.length === 1 ? untagged[0] : undefined
}

export interface StatementYear {
  year: number
  deposits: number
  interest: number
  /** Gjennomsnittlig saldo gjennom året, før rentene ble godskrevet */
  averageBalance: number
  /** Estimert nominell årsrente i prosent. Null når året mangler rentepostering. */
  rate: number | null
  yearEndBalance: number
}

export interface StatementHistory {
  openingBalance: number
  openingDate: string
  contributions: SavingsContribution[]
  withdrawals: WithdrawalEntry[]
  balanceHistory: BalanceHistoryEntry[]
  rateHistory: RateHistoryEntry[]
  years: StatementYear[]
  /** Saldo utledet av startsaldo + alle transaksjoner. Skal matche closingBalance. */
  derivedClosingBalance: number
}

const isInterest = (tx: ParsedTransaction) => tx.type === 'renter'

/** Stabil id slik at reimport av samme utskrift ikke lager duplikater */
function stableId(prefix: string, date: string, amount: number, seq: number): string {
  return `${prefix}-${date}-${Math.round(amount * 100)}-${seq}`
}

function ym(date: string): { year: number; month: number } {
  return { year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) }
}

export function buildStatementHistory(parsed: ParsedBankStatement): StatementHistory {
  const sorted = [...parsed.transactions].sort((a, b) => a.date.localeCompare(b.date))

  const openingBalance = parsed.openingBalance
  const openingDate = parsed.openingDate ?? parsed.printDate

  // ---- Del transaksjonene i innskudd / uttak / renter ----
  const contributions: SavingsContribution[] = []
  const withdrawals: WithdrawalEntry[] = []
  const interestByYear = new Map<number, number>()
  const seqByKey = new Map<string, number>()

  for (const tx of sorted) {
    if (isInterest(tx)) {
      const year = Number(tx.date.slice(0, 4))
      interestByYear.set(year, (interestByYear.get(year) ?? 0) + tx.amount)
      continue
    }
    const key = `${tx.date}:${Math.round(tx.amount * 100)}`
    const seq = seqByKey.get(key) ?? 0
    seqByKey.set(key, seq + 1)

    const note = tx.booked === false
      ? `${tx.description ?? 'Overføring'} (reservert)`
      : tx.description

    if (tx.amount >= 0) {
      contributions.push({ id: stableId('imp', tx.date, tx.amount, seq), date: tx.date, amount: tx.amount, note })
    } else {
      withdrawals.push({ id: stableId('impw', tx.date, tx.amount, seq), date: tx.date, amount: tx.amount, note })
    }
  }

  // ---- Gå måned for måned og bygg saldo + årsstatistikk ----
  const movements = [...contributions, ...withdrawals]
  const sumForMonth = (year: number, month: number) =>
    movements
      .filter((m) => Number(m.date.slice(0, 4)) === year && Number(m.date.slice(5, 7)) === month)
      .reduce((s, m) => s + m.amount, 0)

  const start = ym(openingDate)
  const end = ym(parsed.printDate)

  const balanceHistory: BalanceHistoryEntry[] = []
  const years: StatementYear[] = []
  let balance = openingBalance

  for (let year = start.year; year <= end.year; year++) {
    const firstMonth = year === start.year ? start.month : 1
    const lastMonth = year === end.year ? end.month : 12

    const monthEndBalances: number[] = []
    let deposits = 0

    for (let month = firstMonth; month <= lastMonth; month++) {
      const movement = sumForMonth(year, month)
      if (movement > 0) deposits += movement
      balance += movement
      monthEndBalances.push(balance)
    }

    const interest = interestByYear.get(year) ?? 0
    const averageBalance = monthEndBalances.length
      ? monthEndBalances.reduce((a, b) => a + b, 0) / monthEndBalances.length
      : balance

    // Renter godskrives ved årsslutt (31.12) — etter at årets innskudd er inne
    balance += interest

    // Saldopunkt ved årsslutt låser inn rentene, slik at månedsoversikten
    // viser dem som avkastning i desember i stedet for å gjette.
    if (lastMonth === 12) {
      balanceHistory.push({ year, month: 12, balance: Math.round(balance * 100) / 100, isManual: false })
    }

    years.push({
      year,
      deposits: Math.round(deposits * 100) / 100,
      interest: Math.round(interest * 100) / 100,
      averageBalance: Math.round(averageBalance * 100) / 100,
      rate: interest > 0 && averageBalance > 0
        ? Math.round((interest / averageBalance) * 10000) / 100
        : null,
      yearEndBalance: Math.round(balance * 100) / 100,
    })
  }

  const derivedClosingBalance = Math.round(balance * 100) / 100

  // ---- Ankersaldo for inneværende måned ----
  // closingBalance fra banken er fasit; erstatt et eventuelt årsslutt-punkt
  // for samme måned slik at vi ikke får to konkurrerende saldoer.
  const anchorIdx = balanceHistory.findIndex((b) => b.year === end.year && b.month === end.month)
  const anchor: BalanceHistoryEntry = {
    year: end.year,
    month: end.month,
    balance: parsed.closingBalance,
    isManual: false,
  }
  if (anchorIdx >= 0) balanceHistory[anchorIdx] = anchor
  else balanceHistory.push(anchor)

  // ---- Rentehistorikk ----
  // Én sats per år der vi faktisk fikk renter. Året vi står i har ennå ikke
  // fått rentepostering, så det arver forrige kjente sats.
  const rateHistory: RateHistoryEntry[] = []
  for (const y of years) {
    if (y.rate == null) continue
    rateHistory.push({ fromDate: `${y.year}-01-01`, rate: y.rate })
  }
  const lastRatedYear = [...years].reverse().find((y) => y.rate != null)
  if (lastRatedYear && lastRatedYear.year < end.year) {
    rateHistory.push({ fromDate: `${lastRatedYear.year + 1}-01-01`, rate: lastRatedYear.rate! })
  }

  return {
    openingBalance,
    openingDate,
    contributions,
    withdrawals,
    balanceHistory,
    rateHistory,
    years,
    derivedClosingBalance,
  }
}
