import type {
  SavingsAccount,
  SavingsGoal,
  BSUStatus,
  GoalProgress,
  BalanceHistoryEntry,
  RateHistoryEntry,
  TieredRate,
  TieredRateHistoryEntry,
} from '@/types/economy'
import { BSU_MAX_YEARLY, BSU_MAX_TOTAL } from '@/config/economy.config'

// ------------------------------------------------------------
// EFFEKTIV SALDO — ÉN FELLES IMPLEMENTASJON
// ------------------------------------------------------------

/**
 * Beregner effektiv saldo: siste registrerte saldo + alle innskudd/uttak
 * datert ETTER den perioden, frem til og med `asOf`.
 *
 * Dette er kilden til sannhet for "hva er kontoen verdt nå?"
 * Brukes likt på tvers av Sparing-fanen, Veikart, Dashboard og Sparemål.
 */
export function computeEffectiveBalance(account: SavingsAccount, asOf: Date = new Date()): number {
  const asOfISO = asOf.toISOString().split('T')[0]
  const sortedHistory = [...account.balanceHistory].sort((a, b) =>
    a.year !== b.year ? a.year - b.year : a.month - b.month
  )
  const lastEntry = sortedHistory.at(-1)
  let base: number
  let afterISO: string

  if (lastEntry) {
    base = lastEntry.balance
    const y = lastEntry.month === 12 ? lastEntry.year + 1 : lastEntry.year
    const m = lastEntry.month === 12 ? 1 : lastEntry.month + 1
    afterISO = `${y}-${String(m).padStart(2, '0')}-01`
  } else {
    base = account.openingBalance
    afterISO = account.openingDate
  }

  const pending = [
    ...(account.contributions ?? []).filter((c) => c.date >= afterISO && c.date <= asOfISO),
    ...(account.withdrawals ?? []).filter((w) => w.date >= afterISO && w.date <= asOfISO),
  ]
  return base + pending.reduce((s, t) => s + t.amount, 0)
}

// ------------------------------------------------------------
// INNSKUDDS-HJELPERE
// ------------------------------------------------------------

/**
 * Estimert gjennomsnittlig månedsinnskudd basert på siste 12 måneders innskudd.
 * Faller tilbake på account.monthlyContribution hvis ingen innskudd er registrert.
 */
export function computeMonthlyContributionEstimate(account: SavingsAccount): number {
  const contribs = account.contributions ?? []
  if (contribs.length === 0) return account.monthlyContribution

  const now = new Date()
  const cutoff = new Date(now.getFullYear(), now.getMonth() - 12, 1)
  const recent = contribs.filter((c) => new Date(c.date) >= cutoff)
  if (recent.length === 0) return account.monthlyContribution

  const total = recent.reduce((s, c) => s + c.amount, 0)
  // Del på faktisk antall måneder med data, ikke hardkodet 12
  const monthsWithData = (now.getFullYear() * 12 + now.getMonth()) - (cutoff.getFullYear() * 12 + cutoff.getMonth())
  return Math.round(total / Math.max(1, monthsWithData))
}

/**
 * Sum av innskudd for et gitt år.
 */
export function computeYTDContributions(account: SavingsAccount, year: number): number {
  return (account.contributions ?? [])
    .filter((c) => new Date(c.date).getFullYear() === year)
    .reduce((s, c) => s + c.amount, 0)
}

/**
 * Projiserer saldo måned for måned med rentersrente.
 * BSU-typen tar hensyn til BSU_MAX_TOTAL-taket.
 */
export function projectBalanceMonthly(
  start: number,
  monthly: number,
  annualRate: number,
  months: number,
  isBSU = false
): number {
  if (isBSU) {
    let bal = start
    for (let i = 0; i < months; i++) {
      bal = Math.min(bal + monthly, BSU_MAX_TOTAL)
    }
    return bal
  }
  const years = months / 12
  const r = annualRate / 100
  if (r === 0) return start + monthly * months
  const factor = Math.pow(1 + r, years)
  return start * factor + monthly * 12 * (factor - 1) / r
}

/**
 * Sum av innskudd for en gitt måned (year + month).
 */
export function computeMonthContributions(account: SavingsAccount, year: number, month: number): number {
  return (account.contributions ?? [])
    .filter((c) => {
      const d = new Date(c.date)
      return d.getFullYear() === year && d.getMonth() + 1 === month
    })
    .reduce((s, c) => s + c.amount, 0)
}

export function computeMonthWithdrawals(account: SavingsAccount, year: number, month: number): number {
  return (account.withdrawals ?? [])
    .filter((w) => {
      const d = new Date(w.date)
      return d.getFullYear() === year && d.getMonth() + 1 === month
    })
    .reduce((s, w) => s + w.amount, 0) // amount er negativ
}

export interface HistoricalAccountMonth {
  year: number
  month: number
  balance: number
  contribution: number
  interest: number
}

/**
 * Faktisk saldo/innskudd måned for måned fra kontoens openingDate til
 * (eksklusiv) `toMonth` — ingen simulering, kun ekte transaksjonsdata.
 * Brukes til å vise historikk i månedsoversikten, i motsetning til
 * projectSavingsGrowth som projiserer fremover med planlagt innskudd/rente.
 */
export function computeAccountHistory(
  account: SavingsAccount,
  toMonth: { year: number; month: number }
): HistoricalAccountMonth[] {
  const opening = new Date(account.openingDate)
  let y = opening.getFullYear()
  let m = opening.getMonth() + 1
  const result: HistoricalAccountMonth[] = []
  let prevBalance = account.openingBalance

  while (y < toMonth.year || (y === toMonth.year && m < toMonth.month)) {
    const monthEnd = new Date(y, m, 0, 12)
    const balance = computeEffectiveBalance(account, monthEnd)
    const contribution = computeMonthContributions(account, y, m) + computeMonthWithdrawals(account, y, m)
    const interest = Math.round(balance - prevBalance - contribution)
    result.push({
      year: y,
      month: m,
      balance: Math.round(balance),
      contribution: Math.round(contribution),
      interest,
    })
    prevBalance = balance
    m++
    if (m > 12) { m = 1; y++ }
  }
  return result
}

export function getBaseContribForPeriod(acc: SavingsAccount, year: number, month: number): number {
  const periods = acc.contributionPeriods
  if (periods && periods.length > 0) {
    const ym = `${year}-${String(month).padStart(2, '0')}`
    const period = periods.find(p => {
      const from = p.fromDate ? p.fromDate.slice(0, 7) : '0000-00'
      const to = p.toDate ? p.toDate.slice(0, 7) : '9999-99'
      return ym >= from && ym <= to
    })
    return period ? Math.round(period.amount) : 0
  }
  const inRange = acc.monthlyContributionFromDate || acc.monthlyContributionToDate
    ? (() => {
        const ym2 = year * 100 + month
        const from = acc.monthlyContributionFromDate ? parseInt(acc.monthlyContributionFromDate.slice(0, 4)) * 100 + parseInt(acc.monthlyContributionFromDate.slice(5, 7)) : 0
        const to = acc.monthlyContributionToDate ? parseInt(acc.monthlyContributionToDate.slice(0, 4)) * 100 + parseInt(acc.monthlyContributionToDate.slice(5, 7)) : 999999
        return ym2 >= from && ym2 <= to
      })()
    : true
  return inRange ? Math.round(acc.monthlyContribution ?? 0) : 0
}

/**
 * Estimert dato for å nå targetBalance gitt nåværende saldo og estimert månedssparing.
 * Returnerer null hvis saldo allerede er nådd eller månedssparing = 0.
 */
export function computeETA(account: SavingsAccount, targetBalance: number): string | null {
  const currentBalance = account.balanceHistory.at(-1)?.balance ?? account.openingBalance
  if (currentBalance >= targetBalance) return null

  const monthly = computeMonthlyContributionEstimate(account)
  if (monthly <= 0) return null

  const remaining = targetBalance - currentBalance
  const months = Math.ceil(remaining / monthly)

  const eta = new Date()
  eta.setMonth(eta.getMonth() + months)
  return eta.toLocaleDateString('no-NO', { year: 'numeric', month: 'long' })
}

// ------------------------------------------------------------
// HJELPEFUNKSJONER
// ------------------------------------------------------------

/** Henter gjeldende rentesats for en dato fra rateHistory */
function getCurrentRateForDate(rateHistory: RateHistoryEntry[] | undefined, date: Date): number {
  if (!rateHistory?.length) return 0
  const sorted = [...rateHistory].sort(
    (a, b) => new Date(a.fromDate).getTime() - new Date(b.fromDate).getTime()
  )
  let rate = sorted[0].rate
  for (const entry of sorted) {
    if (new Date(entry.fromDate) <= date) {
      rate = entry.rate
    } else {
      break
    }
  }
  return rate
}

export function getEffectiveRateFromTiers(tiers: TieredRate[], balance: number): number {
  const sorted = [...tiers].sort((a, b) => b.fromBalance - a.fromBalance)
  return sorted.find(t => balance >= t.fromBalance)?.rate ?? sorted.at(-1)!.rate
}

export function getActiveTiersForDate(
  history: TieredRateHistoryEntry[],
  date: string,
): TieredRate[] | undefined {
  return [...history]
    .filter((e) => e.fromDate <= date)
    .sort((a, b) => b.fromDate.localeCompare(a.fromDate))[0]?.tiers
}

export function getEffectiveRate(account: SavingsAccount, balance: number): number {
  const nowISO = new Date().toISOString().slice(0, 10)
  const activeTiers = account.tieredRateHistory?.length
    ? getActiveTiersForDate(account.tieredRateHistory, nowISO)
    : account.tieredRates?.length
      ? account.tieredRates
      : undefined
  if (activeTiers?.length) {
    return getEffectiveRateFromTiers(activeTiers, balance)
  }
  return getCurrentRateForDate(account.rateHistory, new Date())
}

/** Konverterer year/month til en Date (første dag i måneden) */
function toDate(year: number, month: number): Date {
  return new Date(year, month - 1, 1)
}

/** Finner faktisk saldo fra balanceHistory for en gitt måned */
function getActualBalance(
  account: SavingsAccount,
  year: number,
  month: number
): number | null {
  const entry = account.balanceHistory.find(
    (b) => b.year === year && b.month === month
  )
  return entry?.balance ?? null
}

// ------------------------------------------------------------
// SPAREPROGNOSER
// ------------------------------------------------------------

/**
 * Beregner månedlige saldoer fra openingDate til toMonth.
 *
 * - Fond/krypto: bruker faktisk balanceHistory (manuelt tastet inn)
 * - BSU: rente krediteres én gang per år (31. desember)
 * - Andre: månedlig renteberegning
 */
export function projectSavingsGrowth(
  account: SavingsAccount,
  toMonth: { year: number; month: number }
): number[] {
  const openingDate = new Date(account.openingDate)
  const startYear = openingDate.getFullYear()
  const startMonth = openingDate.getMonth() + 1

  const results: number[] = []
  let currentBalance = account.openingBalance
  let yearlyInterestAccrued = 0

  let y = startYear
  let m = startMonth

  while (y < toMonth.year || (y === toMonth.year && m <= toMonth.month)) {
    const date = toDate(y, m)

    // Legg til månedlig innskudd (BSU maks 27 500/år og stopper ved aldersgrense)
    let contribution = account.monthlyContribution
    if (account.type === 'BSU') {
      const bsuCutoff = account.birthYear ? bsuLastContributionYear(account.birthYear) : Infinity
      const pastCutoff = y > bsuCutoff
      contribution = (currentBalance >= BSU_MAX_TOTAL || pastCutoff) ? 0 : Math.min(account.monthlyContribution, BSU_MAX_YEARLY / 12)
    }

    // Sjekk for uttak denne måneden
    const withdrawalThisMonth = account.withdrawals
      .filter((w) => {
        const d = new Date(w.date)
        return d.getFullYear() === y && d.getMonth() + 1 === m
      })
      .reduce((s, w) => s + w.amount, 0)

    // Faktisk saldo har forrang for fond/krypto
    const actualBalance = getActualBalance(account, y, m)
    if (
      actualBalance !== null &&
      (account.type === 'fond' || account.type === 'krypto')
    ) {
      currentBalance = actualBalance
      results.push(currentBalance)
      advanceMonth()
      continue
    }

    currentBalance += contribution + withdrawalThisMonth

    const dateISO = `${y}-${String(m).padStart(2, '0')}-01`
    const activeTiers = account.tieredRateHistory?.length
      ? getActiveTiersForDate(account.tieredRateHistory, dateISO)
      : account.tieredRates?.length
        ? account.tieredRates
        : undefined
    const rate = activeTiers?.length
      ? getEffectiveRateFromTiers(activeTiers, currentBalance)
      : getCurrentRateForDate(account.rateHistory, date)
    const monthlyRate = rate / 100 / 12

    if (account.interestCreditFrequency === 'yearly') {
      // BSU: akkumuler rente, kreditér 31. desember
      yearlyInterestAccrued += currentBalance * monthlyRate
      if (m === 12) {
        currentBalance += yearlyInterestAccrued
        yearlyInterestAccrued = 0
      }
    } else {
      currentBalance += currentBalance * monthlyRate
    }

    // BSU-tak
    if (account.type === 'BSU' && currentBalance > BSU_MAX_TOTAL) {
      currentBalance = BSU_MAX_TOTAL
    }

    results.push(Math.round(currentBalance))
    advanceMonth()
  }

  function advanceMonth() {
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }

  return results
}

// ------------------------------------------------------------
// SPAREMÅL
// ------------------------------------------------------------

export function calculateGoalProgress(
  goal: SavingsGoal,
  accounts: SavingsAccount[],
  fondCurrentValue = 0,
  fondMonthlyDeposit = 0,
): GoalProgress {
  const linked = accounts.filter((a) => goal.linkedAccountIds.includes(a.id))

  const today = new Date().toISOString().split('T')[0]
  const accountsTotal = linked.reduce((s, a) => {
    const sortedHistory = [...a.balanceHistory].sort((x, y) =>
      x.year !== y.year ? x.year - y.year : x.month - y.month
    )
    const last = sortedHistory.at(-1)
    let base: number
    let afterISO: string
    if (last) {
      base = last.balance
      const y = last.month === 12 ? last.year + 1 : last.year
      const m = last.month === 12 ? 1 : last.month + 1
      afterISO = `${y}-${String(m).padStart(2, '0')}-01`
    } else {
      base = a.openingBalance
      afterISO = a.openingDate
    }
    const pending = [
      ...(a.contributions ?? []).filter((c) => c.date >= afterISO && c.date <= today),
      ...(a.withdrawals ?? []).filter((w) => w.date >= afterISO && w.date <= today),
    ]
    return s + base + pending.reduce((ps, t) => ps + t.amount, 0)
  }, 0)

  const currentTotal = accountsTotal + (goal.includeFond ? fondCurrentValue : 0)

  const percent = Math.min(100, (currentTotal / goal.targetAmount) * 100)
  const remaining = goal.targetAmount - currentTotal

  if (remaining <= 0) {
    return { currentTotal, targetAmount: goal.targetAmount, percent: 100, monthsRemaining: 0, monthlyNeeded: 0 }
  }

  const totalMonthlyContrib =
    linked.reduce((s, a) => s + a.monthlyContribution, 0) +
    (goal.includeFond ? fondMonthlyDeposit : 0)

  let monthsRemaining: number | null = null
  let monthlyNeeded: number | null = null

  if (goal.targetDate) {
    const target = new Date(goal.targetDate)
    const now = new Date()
    const diffMs = target.getTime() - now.getTime()
    monthsRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24 * 30.44)))
    monthlyNeeded = monthsRemaining > 0 ? remaining / monthsRemaining : null
  } else if (totalMonthlyContrib > 0) {
    monthsRemaining = Math.ceil(remaining / totalMonthlyContrib)
    monthlyNeeded = totalMonthlyContrib
  }

  return { currentTotal, targetAmount: goal.targetAmount, percent, monthsRemaining, monthlyNeeded }
}

// ------------------------------------------------------------
// RENTEINNTEKTER FOR ET ÅR
// ------------------------------------------------------------

/**
 * Beregner renteinntekter for en sparekonto i et gitt år.
 *
 * - BSU: renter akkumuleres månedlig, krediteres 31. desember (eller vises opptjent for inneværende år)
 * - Andre kontoer: renter krediteres og legges til saldo månedlig
 *
 * Bruker rateHistory for riktig rente per periode.
 */
export function computeYearlyInterestIncome(account: SavingsAccount, year: number, forceFullYear = false): number {
  // Startbalanse: siste kjente saldo FØR dette året
  const prevEntry = [...account.balanceHistory]
    .filter((b) => b.year < year || (b.year === year && b.month === 0))
    .sort((a, b) => (b.year * 12 + b.month) - (a.year * 12 + a.month))[0]
  let balance = prevEntry?.balance ?? account.openingBalance

  const now = new Date()
  const toMonth = forceFullYear || year < now.getFullYear() ? 12 : now.getMonth() + 1

  let totalInterest = 0
  let yearlyAccrued = 0

  for (let m = 1; m <= toMonth; m++) {
    // For fond/krypto: bruk faktisk saldo fra historikk hvis tilgjengelig
    if (account.type === 'fond' || account.type === 'krypto') {
      const entry = account.balanceHistory.find((b) => b.year === year && b.month === m)
      if (entry) { balance = entry.balance; continue }
    }

    // Legg til innskudd denne måneden
    const contrib = computeMonthContributions(account, year, m)
    balance += contrib

    const date = new Date(year, m - 1, 1)
    const dateISO = `${year}-${String(m).padStart(2, '0')}-01`
    const activeTiersYearly = account.tieredRateHistory?.length
      ? getActiveTiersForDate(account.tieredRateHistory, dateISO)
      : account.tieredRates?.length
        ? account.tieredRates
        : undefined
    const rate = activeTiersYearly?.length
      ? getEffectiveRateFromTiers(activeTiersYearly, balance)
      : getCurrentRateForDate(account.rateHistory, date)
    const monthlyInterest = balance * (rate / 100 / 12)

    if (account.interestCreditFrequency === 'yearly') {
      yearlyAccrued += monthlyInterest
      if (m === 12) {
        totalInterest += yearlyAccrued
        balance += yearlyAccrued
        yearlyAccrued = 0
      }
    } else {
      totalInterest += monthlyInterest
      balance += monthlyInterest
    }
  }

  // Inneværende år med BSU: returner opptjent (ikke kreditert ennå)
  // Ved forceFullYear kjøres til des, så yearlyAccrued er lagt til totalInterest allerede
  if (account.interestCreditFrequency === 'yearly' && year === now.getFullYear() && !forceFullYear) {
    return Math.round(yearlyAccrued)
  }

  return Math.round(totalInterest)
}

// ------------------------------------------------------------
// BSU ALDERSGRENSE OG PROGNOSE
// ------------------------------------------------------------

/** Siste innskuddsår for BSU (inntektsåret du fyller 33 år) */
export function bsuLastContributionYear(birthYear: number): number {
  return birthYear + 33
}

export interface BSUForecast {
  cutoffYear: number      // siste innskuddsår (fyller 33)
  rateDropYear: number    // BSU-renten faller dette året (fyller 36)
  totalRemainingContributions: number  // sum fremtidige innskudd frem til siste innskuddsår
  interestAtCutoff: number             // renter opptjent frem til slutten av siste innskuddsår
  balanceAtCutoff: number              // saldo ved utgangen av siste innskuddsår
  balanceAtYear: (targetYear: number) => number
  interestAtYear: (targetYear: number) => number
  contributionsAtYear: (targetYear: number) => number
}

/**
 * Beregner BSU-prognose fra nåværende saldo frem til og med siste innskuddsår,
 * og kan videre projisere renteeffekt for år etter aldersgrensen.
 *
 * BSU-regler:
 * - Siste innskuddsår = år du fyller 33
 * - BSU-renten fortsetter ut år du fyller 35
 * - Fra år du fyller 36 faller renten til vanlig sparerente (postRate)
 */
export function computeBSUForecast(
  account: SavingsAccount,
  birthYear: number,
  currentBalance: number,
  postRate = 3.0,
  monthlyContributionOverride?: number,
): BSUForecast {
  const cutoffYear = bsuLastContributionYear(birthYear)  // birthYear + 33
  const rateDropYear = birthYear + 36                    // fra dette år faller renten

  const now = new Date()
  const startYear = now.getFullYear()
  const startMonth = now.getMonth() + 1

  function simulate(untilYear: number): {
    balance: number
    contributions: number
    interest: number
  } {
    const monthly = monthlyContributionOverride ?? account.monthlyContribution

    let balance = currentBalance
    let yearContributions = computeYTDContributions(account, startYear)
    let totalNewContributions = 0
    let totalInterest = 0
    let yearlyAccrued = 0

    let y = startYear
    let m = startMonth

    while (y < untilYear || (y === untilYear && m <= 12)) {
      const date = new Date(y, m - 1, 1)
      // Bruk BSU-rente frem til rateDropYear, deretter postRate
      const rate = y < rateDropYear
        ? getCurrentRateForDate(account.rateHistory, date)
        : postRate

      // Innskudd – stopp ved cutoffYear
      if (y <= cutoffYear && balance < BSU_MAX_TOTAL) {
        const remainingQuota = BSU_MAX_YEARLY - yearContributions
        const contrib = Math.min(monthly, Math.max(0, remainingQuota))
        const actual = Math.min(contrib, BSU_MAX_TOTAL - balance)
        balance += actual
        totalNewContributions += actual
        yearContributions += actual
      }

      // BSU: rente akkumuleres månedlig, krediteres i desember
      yearlyAccrued += balance * (rate / 100 / 12)
      if (m === 12) {
        balance += yearlyAccrued
        totalInterest += yearlyAccrued
        yearlyAccrued = 0
        yearContributions = 0  // ny kvote neste år
      }

      m++
      if (m > 12) { m = 1; y++ }
    }

    return { balance: Math.round(balance), contributions: Math.round(totalNewContributions), interest: Math.round(totalInterest) }
  }

  const atCutoff = simulate(cutoffYear)

  return {
    cutoffYear,
    rateDropYear,
    totalRemainingContributions: atCutoff.contributions,
    interestAtCutoff: atCutoff.interest,
    balanceAtCutoff: atCutoff.balance,
    balanceAtYear: (targetYear: number) => simulate(targetYear).balance,
    interestAtYear: (targetYear: number) => simulate(targetYear).interest,
    contributionsAtYear: (targetYear: number) => simulate(targetYear).contributions,
  }
}

// ------------------------------------------------------------
// BSU-KONTROLL
// ------------------------------------------------------------

export function checkBSULimits(account: SavingsAccount, year: number): BSUStatus {
  const currentBalance = account.balanceHistory
    .filter((b) => b.year <= year)
    .reduce((latest, b) => {
      if (!latest || b.year > latest.year || (b.year === latest.year && b.month > latest.month)) {
        return b
      }
      return latest
    }, null as BalanceHistoryEntry | null)?.balance ?? account.openingBalance

  // Bruk faktiske innskudd hvis tilgjengelig, ellers estimat
  const actualYTD = computeYTDContributions(account, year)
  const yearlyContributionSoFar = actualYTD > 0 ? actualYTD : account.monthlyContribution * new Date().getMonth()

  const remainingYearlyQuota = Math.max(0, BSU_MAX_YEARLY - yearlyContributionSoFar)
  const totalRemainingRoom = Math.max(0, BSU_MAX_TOTAL - currentBalance)
  const isMaxed = currentBalance >= BSU_MAX_TOTAL

  let warning: string | undefined
  if (isMaxed) {
    warning = 'BSU er fullspart (300 000 kr). Vurder å flytte sparingen til annen konto.'
  } else if (remainingYearlyQuota < 1000) {
    warning = `Nærmer seg årsgrensen (${BSU_MAX_YEARLY.toLocaleString('no')} kr/år).`
  } else if (totalRemainingRoom < 10_000) {
    warning = `Snart maks BSU-saldo (${BSU_MAX_TOTAL.toLocaleString('no')} kr).`
  }

  return {
    currentBalance,
    yearlyContributionSoFar,
    remainingYearlyQuota,
    totalRemainingRoom,
    isMaxed,
    warning,
  }
}

// ------------------------------------------------------------
// FAKTISK AVKASTNING (fond/krypto)
// ------------------------------------------------------------

export function calculateRealizedReturn(account: SavingsAccount): {
  totalContributed: number
  currentValue: number
  returnPercent: number
} {
  const currentValue = account.balanceHistory.at(-1)?.balance ?? account.openingBalance

  // Estimert total innskudd
  const openingDate = new Date(account.openingDate)
  const now = new Date()
  const months =
    (now.getFullYear() - openingDate.getFullYear()) * 12 +
    (now.getMonth() - openingDate.getMonth())

  const totalContributed =
    account.openingBalance + Math.max(0, months) * account.monthlyContribution

  // Legg til manuelle uttrekk
  const totalWithdrawals = account.withdrawals.reduce((s, w) => s + w.amount, 0)
  const adjustedContributed = totalContributed + totalWithdrawals

  const returnPercent =
    adjustedContributed > 0
      ? ((currentValue - adjustedContributed) / adjustedContributed) * 100
      : 0

  return { totalContributed: adjustedContributed, currentValue, returnPercent }
}
