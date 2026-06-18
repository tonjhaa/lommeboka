import { AlertTriangle, Zap, Home } from 'lucide-react'
import { useMemo } from 'react'
import { useSharedProjectStore } from '@/store/useSharedProjectStore'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { useActiveEconomyStore } from '@/contexts/EconomyStoreContext'
import type { EconomyState } from '@/application/useEconomyStore'
import { calculateGoalProgress, computeEffectiveBalance, checkBSULimits } from '@/domain/economy/savingsCalculator'
import { projectPension } from '@/domain/economy/pensionCalculator'
import { GRUNNBELOP_NOK } from '@/config/economy.config'
import { analyzeTaxSettlements } from '@/domain/economy/taxSettlementCalc'
import { getDaysUsedLast12Months, getDaysUsedFromEvents, getAbsenceStatus, getAbsenceStatusFromEvents, getStatusColor } from '@/domain/economy/absenceCalculator'
import type { AbsenceStatus } from '@/types/economy'
import { sumATFByYear } from '@/domain/economy/atfCalculator'
import { forecastJune } from '@/domain/economy/holidayPayCalculator'
import { computeBudgetTable } from '@/domain/economy/budgetTableComputer'
import { useAppStore } from '@/store/useAppStore'
import { useVeikart, calcMaxPurchase } from '@/hooks/useVeikart'
import { partnerNonBsuEquity } from '@/types/economy'
import { cn } from '@/lib/utils'
import { HeroBand, calcHealthScore } from '@/components/economy/widgets/HeroBand'
import { FormueChart } from '@/components/economy/charts/FormueChart'

const MONTH_NAMES = [
  '', 'Jan', 'Feb', 'Mars', 'April', 'Mai', 'Juni',
  'Juli', 'Aug', 'Sep', 'Okt', 'Nov', 'Des',
]

function fmtNOK(n: number): string {
  return Math.round(n).toLocaleString('no-NO') + ' kr'
}

// ── Norske helligdager ──────────────────────────────────────
function getEasterSunday(year: number): Date {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month, day)
}

function getNorwegianHolidays(year: number): Set<string> {
  const easter = getEasterSunday(year)
  const addDays = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r }
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  return new Set([
    `${year}-01-01`, `${year}-05-01`, `${year}-05-17`,
    `${year}-12-25`, `${year}-12-26`,
    fmt(addDays(easter, -3)), fmt(addDays(easter, -2)), fmt(easter),
    fmt(addDays(easter, 1)), fmt(addDays(easter, 39)),
    fmt(addDays(easter, 49)), fmt(addDays(easter, 50)),
  ])
}

function getNextPayday(from: Date, payDay = 12): Date {
  const tryMonth = (year: number, month: number): Date => {
    const holidays = getNorwegianHolidays(year)
    const day = Math.min(payDay, new Date(year, month + 1, 0).getDate()) // kap mot siste dag i måneden
    let d = new Date(year, month, day)
    while (d.getDay() === 0 || d.getDay() === 6 || holidays.has(d.toISOString().slice(0, 10))) {
      d.setDate(d.getDate() - 1)
    }
    return d
  }
  const thisMonthPayday = tryMonth(from.getFullYear(), from.getMonth())
  if (thisMonthPayday <= from) {
    const next = new Date(from.getFullYear(), from.getMonth() + 1, 1)
    return tryMonth(next.getFullYear(), next.getMonth())
  }
  return thisMonthPayday
}

// ══════════════════════════════════════════════════════════════
// HOVED-KOMPONENT
// ══════════════════════════════════════════════════════════════

export function EconomyDashboard({ onNavigate }: { onNavigate: (page: string) => void }) {
  const {
    monthHistory,
    savingsAccounts,
    savingsGoals,
    debts,
    atfEntries,
    absenceRecords,
    absenceEvents,
    taxSettlements,
    budgetTemplate,
    profile,
    fondPortfolio,
    subscriptions,
    insurances,
    temporaryPayEntries,
    budgetOverrides,
    ivfTransactions,
    userPreferences,
    partnerVeikart,
    pensionSettings,
  } = useActiveEconomyStore()

  const now = useMemo(() => new Date(), [])
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1

  // ── Nedtellinger ──────────────────────────────────────────
  const payDay = userPreferences?.payDay ?? 12
  const nextPayday = getNextPayday(now, payDay)
  const daysToPayday = Math.ceil((nextPayday.getTime() - now.getTime()) / 86400000)

  const currentMonthRecord = monthHistory.find(
    (m) => m.year === currentYear && m.month === currentMonth
  )
  const nettoInn = currentMonthRecord?.nettoUtbetalt ?? 0

  // Netto inn delta: sammenlign med forrige måneds slipp
  const prevMonthRecord = (() => {
    const prev = currentMonth === 1
      ? { year: currentYear - 1, month: 12 }
      : { year: currentYear, month: currentMonth - 1 }
    return monthHistory.find(m => m.year === prev.year && m.month === prev.month && m.nettoUtbetalt > 0)
  })()
  const nettoInnDelta = currentMonthRecord && prevMonthRecord
    ? currentMonthRecord.nettoUtbetalt - prevMonthRecord.nettoUtbetalt
    : undefined

  const fasteUt = budgetTemplate.lines
    .filter((l) => l.isRecurring && ['bolig', 'transport', 'mat', 'helse', 'abonnement', 'forsikring', 'klær', 'fritid', 'annet_forbruk'].includes(l.category))
    .reduce((s, l) => s + Math.abs(l.amount), 0)

  const atfSum = sumATFByYear(atfEntries, currentYear)
  const yearATF = atfEntries.filter((e) => (e.payoutYear ?? e.year) === currentYear)

  const absenceDays = absenceEvents.length > 0
    ? getDaysUsedFromEvents(absenceEvents)
    : getDaysUsedLast12Months(absenceRecords)
  const absenceStatus = absenceEvents.length > 0
    ? getAbsenceStatusFromEvents(absenceEvents)
    : getAbsenceStatus(absenceRecords)

  const taxAnalysis = analyzeTaxSettlements(taxSettlements, profile?.extraTaxWithholding ?? 0)

  const appScenarios = useAppStore((s) => s.scenarios)
  const appActiveScenarioId = useAppStore((s) => s.activeScenarioId)
  const appAnalyses = useAppStore((s) => s.analyses)
  const activeScenario = appScenarios.find((s) => s.id === appActiveScenarioId)
  const maxKjøpesum = activeScenario
    ? appAnalyses[activeScenario.id]?.maxPurchase?.maxPurchasePrice
    : null

  // Veikart-data for dashbord-chip
  const veikartData = useVeikart()

  // ── Formue ────────────────────────────────────────────────
  const sparingKontoer = savingsAccounts.reduce((s, a) => s + computeEffectiveBalance(a, now), 0)
  const sortedFondSnapshots = [...(fondPortfolio?.snapshots ?? [])].sort((a, b) => b.date.localeCompare(a.date))
  const fondVerdi = sortedFondSnapshots[0]?.totalValue ?? 0
  const sharedIvfTxs = useSharedProjectStore((s) => s.transactions)
  const todayStr = now.toISOString().split('T')[0]
  const ivfSrcTxs = sharedIvfTxs.length > 0 ? sharedIvfTxs : ivfTransactions
  const ivfSaldo = ivfSrcTxs.filter(t => t.date <= todayStr).reduce((s, t) => s + t.amount, 0)
  const totalSparing = sparingKontoer + fondVerdi + Math.max(0, ivfSaldo)
  const totalGjeld = debts.filter(d => d.status !== 'nedbetalt').reduce((s, d) => s + d.currentBalance, 0)
  const nettoFormue = totalSparing - totalGjeld

  // ── Inntektstrend — siste 3 faktiske + 6 projiserte ─────
  const sortedSlips = [...monthHistory]
    .filter((m) => m.slipData != null && m.nettoUtbetalt > 0)
    .sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month)

  const last3Slips = sortedSlips.slice(-3)
  const trendData = last3Slips.map((m) => ({ m: MONTH_NAMES[m.month], v: m.nettoUtbetalt }))

  // ── Budsjett ──────────────────────────────────────────────
  const juneForecast = profile ? forecastJune(currentYear, monthHistory, profile, atfEntries) : null

  const yearOverrides = Object.fromEntries(
    Object.entries(budgetOverrides)
      .filter(([k]) => k.startsWith(`${currentYear}:`))
      .map(([k, v]) => [k.slice(String(currentYear).length + 1), v])
  )
  const budgetTable = profile
    ? computeBudgetTable(
        currentYear, profile, budgetTemplate, monthHistory, atfEntries,
        savingsAccounts, debts, subscriptions, insurances,
        yearOverrides, temporaryPayEntries, juneForecast ?? undefined,
        false, ivfTransactions, fondPortfolio,
      )
    : null

  const allBudgetRows = budgetTable?.sections.flatMap((s) => s.rows) ?? []
  const monthIdx = currentMonth - 1
  const nettoRow = allBudgetRows.find((r) => r.id === 'netto')
  const nettoCell = nettoRow?.cells[monthIdx]
  const overskuddCell = allBudgetRows.find((r) => r.id === 'overskudd')?.cells[monthIdx]
  const nettoFraBudsjett = nettoCell ? (nettoCell.actual ?? nettoCell.budget) : 0
  const overskuddFraBudsjett = overskuddCell ? (overskuddCell.actual ?? overskuddCell.budget) : null

  // ── Inntektstrend projeksjon — bruk budsjettabellens netto for fremtidige måneder ─────
  const projectedTrend: { m: string; v: number }[] = (() => {
    const MONTH_SHORT = ['Jan','Feb','Mar','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Des']
    const lastEntry = sortedSlips[sortedSlips.length - 1]
    const startMonth = lastEntry ? lastEntry.month : currentMonth
    const startYear = lastEntry ? lastEntry.year : currentYear
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(startYear, startMonth - 1 + i + 1, 1)
      // Bruk budsjettabellens netto-celle for måneder i inneværende år, ellers siste kjente
      const cellIdx = d.getMonth() // 0-based
      const budgetNetto = nettoRow && d.getFullYear() === currentYear
        ? (nettoRow.cells[cellIdx]?.budget ?? 0)
        : 0
      const v = budgetNetto > 0 ? budgetNetto : nettoFraBudsjett
      if (v <= 0) return null
      return { m: MONTH_SHORT[d.getMonth()], v }
    }).filter((p): p is { m: string; v: number } => p !== null)
  })()

  // ── Sparerate siste 12 mnd (faktisk sparevekst / total netto) ────
  const sparerate12m = (() => {
    const last12 = [...monthHistory]
      .filter(m => m.source === 'imported_slip' && m.nettoUtbetalt > 0)
      .sort((a, b) => b.year - a.year || b.month - a.month)
      .slice(0, 12)
    if (last12.length < 2) return null

    const totalNetto = last12.reduce((s, m) => s + m.nettoUtbetalt, 0)

    // Tidligste og seneste punkt i de 12 månedene
    const oldest = last12[last12.length - 1]
    const oldestDate = new Date(oldest.year, oldest.month - 1, 1)

    let totalGrowth = 0
    for (const acc of savingsAccounts) {
      const sorted = [...acc.balanceHistory].sort((a, b) =>
        a.year !== b.year ? a.year - b.year : a.month - b.month)
      // Saldo ved starten av perioden
      const before = sorted.filter(e =>
        e.year < oldestDate.getFullYear() ||
        (e.year === oldestDate.getFullYear() && e.month <= oldestDate.getMonth() + 1)
      )
      const startBal = before.length > 0 ? before[before.length - 1].balance : 0
      const currentBal = computeEffectiveBalance(acc, now)
      totalGrowth += Math.max(0, currentBal - startBal)
    }

    return totalNetto > 0 ? Math.max(0, Math.round((totalGrowth / totalNetto) * 100)) : null
  })()

  const sparerate = sparerate12m
    ?? (nettoFraBudsjett > 0 && overskuddFraBudsjett !== null
      ? Math.max(0, Math.round((overskuddFraBudsjett / nettoFraBudsjett) * 100))
      : 0)

  // Snitt-netto siste 12 mnd (for månedligflyt-kortet)
  const avgNetto12m = (() => {
    const last12 = [...monthHistory]
      .filter(m => m.source === 'imported_slip' && m.nettoUtbetalt > 0)
      .sort((a, b) => b.year - a.year || b.month - a.month)
      .slice(0, 12)
    return last12.length >= 3
      ? Math.round(last12.reduce((s, m) => s + m.nettoUtbetalt, 0) / last12.length)
      : null
  })()

  const healthScore = calcHealthScore({
    sparerate,
    absenceDays,
    nettoFormue,
    overskudd: overskuddFraBudsjett,
    totalSparing,
    totalGjeld,
  })

  // ── Pengepuls-chips ───────────────────────────────────────
  const chips: { icon: string; text: string; accent?: string }[] = []
  if (sparerate12m !== null) {
    chips.push({
      icon: '💰',
      text: `Sparerate ${sparerate12m}% av netto (siste 12 mnd faktisk)`,
      accent: sparerate12m >= 20 ? 'green' : sparerate12m >= 10 ? 'yellow' : 'red',
    })
  } else if (nettoFraBudsjett > 0 && overskuddFraBudsjett !== null) {
    chips.push({
      icon: '💰',
      text: `Sparerate ${sparerate}% av netto (budsjettestimert)`,
      accent: sparerate >= 20 ? 'green' : sparerate >= 10 ? 'yellow' : 'red',
    })
  }
  if (ivfSaldo > 0) {
    chips.push({
      icon: '🫀',
      text: `Prosjekt-kassen: ${fmtNOK(ivfSaldo)} (inngår i formue)`,
    })
  } else if (ivfSaldo < -500) {
    chips.push({
      icon: '🫀',
      text: `Prosjektet er netto ${fmtNOK(Math.abs(ivfSaldo))} i underskudd`,
      accent: 'red',
    })
  }
  if (juneForecast) {
    const junePayday = new Date(now.getFullYear(), 5, payDay)
    if (junePayday < now) junePayday.setFullYear(now.getFullYear() + 1)
    const isNextPaycheck = nextPayday.getMonth() === 5 // juni = 5
    const days = Math.ceil((junePayday.getTime() - now.getTime()) / 86400000)
    chips.push({
      icon: '🏖️',
      text: isNextPaycheck
        ? `Feriepenger inngår i neste lønn (${Math.round(juneForecast.nettoJuni).toLocaleString('no-NO')} kr)`
        : `${days} dager til feriepenger (${Math.round(juneForecast.nettoJuni).toLocaleString('no-NO')} kr)`,
    })
  }
  if (savingsGoals.length > 0) {
    const goal = savingsGoals[0]
    const prog = calculateGoalProgress(goal, savingsAccounts, fondVerdi, fondPortfolio?.monthlyDeposit ?? 0)
    if (prog.percent >= 100) {
      chips.push({ icon: '✅', text: `«${goal.label}» er nådd!`, accent: 'green' })
    } else if (prog.monthsRemaining !== null && prog.monthsRemaining > 0) {
      chips.push({ icon: '🎯', text: `«${goal.label}» nås om ca. ${prog.monthsRemaining} mnd` })
    }
  }
  if (atfSum > 0) {
    chips.push({ icon: '🎖️', text: `ATF-bonus i år: ${Math.round(atfSum).toLocaleString('no-NO')} kr` })
  }

  // ATF-validering: sjekk om forventet utbetaling mangler importert slipp
  const atfMissingSlip = atfEntries.filter((e) => {
    const payYear = e.payoutYear ?? e.year
    const payMonth = e.payoutMonth ?? 12
    if (payYear > currentYear || (payYear === currentYear && payMonth > currentMonth)) return false
    const cutoff = new Date(now.getFullYear(), now.getMonth() - 1, 1) // 1 mnd tilbake
    const payDate = new Date(payYear, payMonth - 1, 1)
    if (payDate > cutoff) return false
    return !monthHistory.some((m) => m.source === 'imported_slip' && m.year === payYear && m.month === payMonth)
  })
  if (atfMissingSlip.length > 0) {
    chips.push({
      icon: '⚠️',
      text: `${atfMissingSlip.length} ATF-utbetaling${atfMissingSlip.length > 1 ? 'er' : ''} mangler importert slipp`,
      accent: 'yellow',
    })
  }
  // Boligkjøp-chip fra Veikart (vises når bruker har registrert inntekt og sparing)
  if (veikartData.maxPurchase > 0) {
    const now12mScenario = veikartData.scenarios.find(s => s.years === 1)
    chips.push({
      icon: '🏠',
      text: `Kjøpekraft nå: ${(veikartData.maxPurchase / 1_000_000).toFixed(1)} mill — om 1 år: ${now12mScenario ? (now12mScenario.maxPurchase / 1_000_000).toFixed(1) : '?'} mill`,
      accent: 'green',
    })
  }
  if (absenceDays >= 16) {
    chips.push({ icon: '⚠️', text: `${absenceDays}/24 egenmeldingsdager brukt`, accent: 'red' })
  }
  if (taxAnalysis.recommendation === 'reduce_extra') {
    chips.push({
      icon: '🧾',
      text: `Vurder å senke ekstra trekk med ${fmtNOK(taxAnalysis.recommendedExtraAdjustment)}/mnd`,
      accent: 'yellow',
    })
  }

  // BSU-kvotering
  const bsuAccount = savingsAccounts.find(a => a.type === 'BSU')
  if (bsuAccount) {
    const bsuStatus = checkBSULimits(bsuAccount, currentYear)
    if (!bsuStatus.isMaxed && bsuStatus.remainingYearlyQuota > 0) {
      chips.push({
        icon: '🏦',
        text: `BSU-kvote igjen i år: ${fmtNOK(bsuStatus.remainingYearlyQuota)}`,
        accent: bsuStatus.remainingYearlyQuota < 5000 ? 'yellow' : undefined,
      })
    } else if (bsuStatus.isMaxed) {
      chips.push({ icon: '🏦', text: 'BSU er fylt opp', accent: 'green' })
    }
  }

  // Importpåminnelse: ingen slipp importert denne måneden
  if (!currentMonthRecord || currentMonthRecord.source !== 'imported_slip') {
    chips.push({ icon: '📥', text: 'Husk å importere lønnsslipp for denne måneden', accent: 'yellow' })
  }

  // Gjeldsmilepæl: ett lån er < 10 % igjen
  const nearlyPaidDebt = debts.find(d => d.status !== 'nedbetalt' && d.originalAmount > 0 && d.currentBalance / d.originalAmount < 0.1)
  if (nearlyPaidDebt) {
    chips.push({
      icon: '🎉',
      text: `«${nearlyPaidDebt.creditor}» er snart nedbetalt (${fmtNOK(nearlyPaidDebt.currentBalance)} igjen)`,
      accent: 'green',
    })
  }

  // Budsjettunderskudd
  if (overskuddFraBudsjett !== null && overskuddFraBudsjett < -500) {
    chips.push({
      icon: '📉',
      text: `Budsjettunderskudd denne måneden: ${fmtNOK(Math.abs(overskuddFraBudsjett))}`,
      accent: 'red',
    })
  }

  // Pensjon-chip
  if (profile && userPreferences?.birthYear && (userPreferences.birthYear >= 1963)) {
    const fasteTillegg = (profile.fixedAdditions ?? []).reduce((s, t) => s + t.amount, 0)
    const spkGrunnlag = (profile.baseMonthly + fasteTillegg) * 12
    const ps = pensionSettings
    try {
      const proj = projectPension({
        birthYear: userPreferences.birthYear,
        serviceStartYear: ps?.serviceStartYear ?? currentYear - 5,
        currentYear,
        currentG: GRUNNBELOP_NOK,
        folketrygdAnnualIncome: spkGrunnlag * 1.05,
        spkAnnualGrunnlag: spkGrunnlag,
        uttaksalder: 67,
        salaryGrowthPct: ps?.assumptions.salaryGrowthPct ?? 3,
        gGrowthPct: ps?.assumptions.gGrowthPct ?? 3.5,
        afpEnabled: ps?.afpEnabled ?? true,
        særalder: ps?.særalder ?? { enabled: false, age: 60 },
      })
      chips.push({
        icon: '🏛️',
        text: `Forventet pensjon ~${Math.round(proj.monthlyTotal).toLocaleString('no-NO')} kr/mnd ved 67 (estimat)`,
      })
    } catch { /* født før 1963 — hopp over */ }
  }

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">

      {/* ── 1. HERO BAND ── */}
      <HeroBand
        healthScore={healthScore}
        nettoFormue={nettoFormue}
        totalSparing={totalSparing}
        totalGjeld={totalGjeld}
        nettoInn={nettoFraBudsjett}
        nettoInnDelta={nettoInnDelta}
        sparerate={sparerate}
        daysToPayday={daysToPayday}
        nextPayday={nextPayday}
        juneForecast={juneForecast}
      />

      {/* ── 2. MIDT-RAD ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr_260px] gap-3 px-3 md:px-5 py-3 shrink-0">
        <MonthlyFlowCard
          nettoInn={nettoFraBudsjett || nettoInn}
          fasteUt={fasteUt}
          overskudd={overskuddFraBudsjett}
          avgNetto12m={avgNetto12m}
        />
        <FormueChart
          history={trendData}
          projected={projectedTrend}
          nettoFormue={nettoFormue}
        />
        <PengePulsCard chips={chips} />
      </div>

      {/* ── 3. PARTNER-KJØPEKRAFT ── */}
      {partnerVeikart.enabled && (() => {
        const soloMax = veikartData.maxPurchase
        const combinedEq = (veikartData.totalEquity ?? 0) + partnerNonBsuEquity(partnerVeikart)
        const combinedIncome = (veikartData.annualIncome ?? 0) + (partnerVeikart.annualIncome ?? 0)
        const combinedMax = calcMaxPurchase(combinedEq, combinedIncome, veikartData.existingDebt ?? 0)
        const gain = combinedMax - soloMax
        const pct = soloMax > 0 ? Math.round((gain / soloMax) * 100) : 0
        return (
          <div className="mx-5 mb-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-2.5 flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-amber-400 text-sm">👫</span>
              <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wide">Kjøpekraft med partner</span>
            </div>
            <div className="flex items-center gap-6 text-xs">
              <div>
                <p className="text-[10px] text-muted-foreground">Din alene</p>
                <p className="font-mono font-semibold">{(soloMax / 1_000_000).toFixed(2)} mill</p>
              </div>
              <div className="text-muted-foreground">→</div>
              <div>
                <p className="text-[10px] text-muted-foreground">Felles</p>
                <p className="font-mono font-semibold text-amber-400">{(combinedMax / 1_000_000).toFixed(2)} mill</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">Økning</p>
                <p className="font-mono font-semibold text-green-400">+{(gain / 1_000_000).toFixed(2)} mill · +{pct}%</p>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── 3. BUNN-GRID ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 px-3 md:px-5 pb-4 flex-1 min-h-0">
        <SpareMaalCard
          goals={savingsGoals}
          accounts={savingsAccounts}
          fondVerdi={fondVerdi}
          fondMonthlyDeposit={fondPortfolio?.monthlyDeposit ?? 0}
          onNavigate={onNavigate}
        />
        {(profile?.atfEnabled || atfEntries.length > 0) && (
          <ATFCard
            entries={yearATF}
            sum={atfSum}
            year={currentYear}
            onNavigate={onNavigate}
          />
        )}
        <GjeldCard debts={debts} onNavigate={onNavigate} />
        <AbsenceAndTaxCard
          absenceDays={absenceDays}
          absenceStatus={absenceStatus}
          taxAnalysis={taxAnalysis}
          onNavigate={onNavigate}
          maxKjøpesum={maxKjøpesum}
        />
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// MIDT-RAD: MÅNEDLIG FLYT
// ══════════════════════════════════════════════════════════════

function MonthlyFlowCard({
  nettoInn, fasteUt, overskudd, avgNetto12m,
}: {
  nettoInn: number
  fasteUt: number
  overskudd: number | null
  avgNetto12m: number | null
}) {
  const displayNetto = avgNetto12m ?? nettoInn
  const ledig = overskudd ?? (displayNetto - fasteUt)
  const sparing = displayNetto - fasteUt - Math.max(0, ledig)

  const rows: { label: string; value: number; color: string }[] = [
    { label: 'Netto inn', value: displayNetto, color: 'bg-green-500' },
    { label: 'Faste ut', value: fasteUt, color: 'bg-red-400' },
    ...(sparing > 0 ? [{ label: 'Sparing', value: sparing, color: 'bg-blue-400' }] : []),
    { label: 'Ledig', value: Math.max(0, ledig), color: 'bg-violet-400' },
  ]

  return (
    <div className="rounded-xl border border-border/50 bg-card/60 px-4 pt-3 pb-3 flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Månedlig flyt</p>
        {avgNetto12m !== null && (
          <p className="text-[9px] text-muted-foreground/60">snitt 12 mnd</p>
        )}
      </div>
      {displayNetto === 0 ? (
        <p className="text-xs text-muted-foreground flex-1 flex items-center">Ingen data</p>
      ) : (
        rows.map((row) => (
          <div key={row.label} className="space-y-0.5">
            <div className="flex justify-between text-[11px]">
              <span className="text-muted-foreground">{row.label}</span>
              <span className="font-mono tabular-nums text-foreground/80">
                {Math.round(row.value).toLocaleString('no-NO')} kr
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-muted/30 overflow-hidden">
              <div
                className={cn('h-full rounded-full', row.color)}
                style={{ width: `${Math.min(100, (row.value / nettoInn) * 100)}%` }}
              />
            </div>
          </div>
        ))
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// MIDT-RAD: PENGEPULS-KORT
// ══════════════════════════════════════════════════════════════

function PengePulsCard({ chips }: { chips: { icon: string; text: string; accent?: string }[] }) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/60 px-4 pt-3 pb-3 flex flex-col">
      <div className="flex items-center gap-1.5 mb-2.5">
        <Zap className="h-3 w-3 text-violet-400" />
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Pengepuls</span>
      </div>
      {chips.length === 0 ? (
        <p className="text-xs text-muted-foreground flex-1">Last inn data for å se innsikter.</p>
      ) : (
        <div className="flex flex-col gap-1.5 overflow-y-auto">
          {chips.map((chip, i) => (
            <span
              key={i}
              className={cn(
                'inline-flex items-start gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] border leading-snug',
                chip.accent === 'green' && 'bg-green-500/10 border-green-500/20 text-green-400',
                chip.accent === 'yellow' && 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400',
                chip.accent === 'red' && 'bg-red-500/10 border-red-500/20 text-red-400',
                !chip.accent && 'bg-muted/40 border-border/40 text-muted-foreground',
              )}
            >
              <span className="shrink-0">{chip.icon}</span>
              <span>{chip.text}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// BUNN-GRID: SPAREMÅL
// ══════════════════════════════════════════════════════════════

function SpareMaalCard({
  goals, accounts, fondVerdi, fondMonthlyDeposit, onNavigate,
}: {
  goals: EconomyState['savingsGoals']
  accounts: EconomyState['savingsAccounts']
  fondVerdi: number
  fondMonthlyDeposit: number
  onNavigate: (page: string) => void
}) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/60 flex flex-col overflow-hidden">
      <div className="px-4 pt-3 pb-2 border-b border-border/30">
        <p className="text-xs font-medium">Sparemål</p>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2.5">
        {goals.length === 0 ? (
          <EmptyState message="Ingen sparemål" action="Legg til" onAction={() => onNavigate('savings')} />
        ) : (
          goals.slice(0, 4).map((goal) => {
            const progress = calculateGoalProgress(goal, accounts, fondVerdi, fondMonthlyDeposit)
            return (
              <div key={goal.id} className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1 min-w-0">
                    <span>{goal.icon}</span>
                    <span className="font-medium truncate" title={goal.label}>{goal.label}</span>
                  </span>
                  <span className="text-muted-foreground shrink-0 ml-1">{Math.round(progress.percent)}%</span>
                </div>
                <Progress value={progress.percent} className="h-1.5" />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>{Math.round(progress.currentTotal).toLocaleString('no-NO')} kr</span>
                  <span>{Math.round(progress.targetAmount).toLocaleString('no-NO')} kr</span>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// BUNN-GRID: ATF
// ══════════════════════════════════════════════════════════════

function ATFCard({
  entries, sum, year, onNavigate,
}: {
  entries: EconomyState['atfEntries']
  sum: number
  year: number
  onNavigate: (page: string) => void
}) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/60 flex flex-col overflow-hidden">
      <div className="px-4 pt-3 pb-2 border-b border-border/30">
        <p className="text-xs font-medium">ATF {year}</p>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1.5">
        {entries.length === 0 ? (
          <EmptyState message={`Ingen øvelser ${year}`} action="Legg til" onAction={() => onNavigate('atf')} />
        ) : (
          <>
            {entries.slice(0, 5).map((e) => (
              <div key={e.id} className="flex justify-between text-[11px]">
                <span className="text-muted-foreground truncate">{e.øvelsesnavn}</span>
                <span className="font-mono ml-2 shrink-0">{Math.round(e.beregnetBeløp).toLocaleString('no-NO')} kr</span>
              </div>
            ))}
            <div className="flex justify-between text-[11px] border-t border-border pt-1.5 mt-1">
              <span className="font-medium">Sum</span>
              <span className="font-mono font-semibold text-green-500">{Math.round(sum).toLocaleString('no-NO')} kr</span>
            </div>
            <Button variant="ghost" size="sm" className="w-full h-7 text-xs mt-0.5" onClick={() => onNavigate('atf')}>
              + Øvelse
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// BUNN-GRID: GJELD
// ══════════════════════════════════════════════════════════════

function GjeldCard({
  debts, onNavigate,
}: {
  debts: EconomyState['debts']
  onNavigate: (page: string) => void
}) {
  const total = debts.filter(d => d.status !== 'nedbetalt').reduce((s, d) => s + d.currentBalance, 0)
  return (
    <div className="rounded-xl border border-border/50 bg-card/60 flex flex-col overflow-hidden">
      <div className="px-4 pt-3 pb-2 border-b border-border/30">
        <p className="text-xs font-medium">Gjeld</p>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1.5">
        {debts.length === 0 ? (
          <EmptyState message="Ingen gjeld" action="Legg til lån" onAction={() => onNavigate('debt')} />
        ) : (
          <>
            {debts.slice(0, 4).map((d) => (
              <div key={d.id} className="flex justify-between text-[11px]">
                <span className="text-muted-foreground truncate">{d.creditor}</span>
                <span className="font-mono ml-2 shrink-0">{Math.round(d.currentBalance).toLocaleString('no-NO')} kr</span>
              </div>
            ))}
            <div className="flex justify-between text-[11px] border-t border-border pt-1.5 mt-1">
              <span className="font-medium">Total</span>
              <span className="font-mono font-semibold text-red-400">{Math.round(total).toLocaleString('no-NO')} kr</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// BUNN-GRID: EGENMELDING + SKATT (+ valgfri bolig)
// ══════════════════════════════════════════════════════════════

function AbsenceAndTaxCard({
  absenceDays, absenceStatus, taxAnalysis, maxKjøpesum,
}: {
  absenceDays: number
  absenceStatus: AbsenceStatus
  taxAnalysis: ReturnType<typeof analyzeTaxSettlements>
  onNavigate: (page: string) => void
  maxKjøpesum: number | null | undefined
}) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/60 flex flex-col overflow-hidden">
      <div className="px-4 pt-3 pb-2 border-b border-border/30">
        <p className="text-xs font-medium">Egenmelding & skatt</p>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-3">

        {/* Egenmelding */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">Brukt siste 12 mnd</span>
            <span className={cn('font-medium', getStatusColor(absenceStatus))}>
              {absenceDays} / 24 dager
            </span>
          </div>
          <Progress
            value={(absenceDays / 24) * 100}
            className={cn(
              'h-1.5',
              absenceStatus === 'ok' ? '[&>div]:bg-green-500'
                : absenceStatus === 'warning' ? '[&>div]:bg-yellow-500'
                : '[&>div]:bg-red-500'
            )}
          />
        </div>

        {/* Skattevarsel */}
        {taxAnalysis.recommendation === 'reduce_extra' && (
          <div className="rounded-md bg-yellow-500/10 border border-yellow-500/25 px-2.5 py-2 text-[11px] text-yellow-400 flex gap-1.5 items-start">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              Du får tilbake ~{fmtNOK(taxAnalysis.avgYearlyRefund)}/år.
              Senk ekstra trekk med {fmtNOK(taxAnalysis.recommendedExtraAdjustment)}/mnd.
            </span>
          </div>
        )}
        {taxAnalysis.recommendation === 'keep' && (
          <p className="text-[11px] text-muted-foreground">Skattetrekk ser riktig ut ✓</p>
        )}

        {/* Boligscenario */}
        {maxKjøpesum && (
          <div className="flex items-center justify-between pt-1 border-t border-border/30">
            <div className="flex items-center gap-1.5 text-[11px]">
              <Home className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Maks kjøpesum</span>
            </div>
            <button
              onClick={() => useAppStore.getState().setCurrentView('calculator')}
              className="text-[11px] font-semibold font-mono text-blue-400 hover:text-blue-300 transition-colors"
            >
              {Math.round(maxKjøpesum).toLocaleString('no-NO')} kr →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Felles hjelpere ──────────────────────────────────────────

function EmptyState({ message, action, onAction }: { message: string; action: string; onAction: () => void }) {
  return (
    <div className="text-center py-2">
      <p className="text-[11px] text-muted-foreground mb-2">{message}</p>
      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onAction}>{action}</Button>
    </div>
  )
}
