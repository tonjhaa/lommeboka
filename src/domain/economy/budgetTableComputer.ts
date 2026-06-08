import type {
  EmploymentProfile,
  BudgetTemplate,
  MonthRecord,
  ATFEntry,
  SavingsAccount,
  DebtAccount,
  SubscriptionEntry,
  InsuranceEntry,
  TemporaryPayEntry,
  JuneForecast,
  IVFTransaction,
  FondPortfolio,
} from '@/types/economy'
import { estimateSalaryTrend, projectMonthlySalary } from './salaryCalculator'
import { computeMonthContributions, getBaseContribForPeriod } from './savingsCalculator'
import { calcMonthlyTaxWithholding } from './norwegianTaxRules'

// ----------------------------------------------------------------
// Public types
// ----------------------------------------------------------------

export interface MonthMeta {
  month: number   // 1–12
  isLocked: boolean
  hasSlip: boolean
}

export interface BudgetCell {
  budget: number
  actual: number | null  // null = no slip/locked data for this month
}

export interface BudgetRow {
  id: string
  label: string
  cells: BudgetCell[]  // 12 items, index 0 = January
  annualBudget: number
  annualActual: number  // uses actual where available, budget as fallback
  /** true = celler viser løpende YTD-sum, ikke månedlig beløp */
  isCumulative?: boolean
  /** true = vises med fet skrift som en summeringsrad */
  isBold?: boolean
  /** true = rad vises med overstreking/grå i "uten tillegg"-modus, ekskludert fra summer */
  isHidden?: boolean
}

export interface BudgetSection {
  key: string
  label: string
  colorClass: string
  dualColumn: boolean  // true = show Bud|Fak for slip months; false = always colspan=2
  rows: BudgetRow[]
}

export interface BudgetTableData {
  year: number
  metas: MonthMeta[]
  sections: BudgetSection[]
  /** Estimert årlig lønnsøkning (desimal). null = ikke nok data. */
  estimatedAnnualGrowthRate: number | null
}

// ----------------------------------------------------------------
// Internal helpers
// ----------------------------------------------------------------

function mkRow(id: string, label: string, cells: BudgetCell[], isBold = false): BudgetRow {
  return {
    id,
    label,
    cells,
    annualBudget: cells.reduce((s, c) => s + c.budget, 0),
    annualActual: cells.reduce((s, c) => s + (c.actual ?? c.budget), 0),
    isBold,
  }
}

function uniform12(budgetFn: (m: number) => number, actualFn: (m: number) => number | null): BudgetCell[] {
  return Array.from({ length: 12 }, (_, i) => ({
    budget: budgetFn(i + 1),
    actual: actualFn(i + 1),
  }))
}

function subMonthAmount(sub: SubscriptionEntry, year: number, month: number): number {
  const key = `${year}-${String(month).padStart(2, '0')}`
  if (sub.activeUntil && key > sub.activeUntil) return 0
  if (sub.monthlyAmounts[key] !== undefined) return sub.monthlyAmounts[key]
  // Finn gjeldende pris fra prishistorikk — siste oppføring ≤ aktuell måned
  if (sub.priceChanges && sub.priceChanges.length > 0) {
    const applicable = [...sub.priceChanges]
      .filter((c) => c.fromMonth <= key)
      .sort((a, b) => b.fromMonth.localeCompare(a.fromMonth))
    if (applicable.length > 0) return applicable[0].amount
  }
  return sub.defaultMonthly
}

function insMonthAmount(ins: InsuranceEntry, year: number, month: number): number {
  if (ins.cancelledDate) {
    const monthKey = `${year}-${String(month).padStart(2, '0')}`
    if (monthKey > ins.cancelledDate.slice(0, 7)) return 0
  }
  return (ins.yearlyAmounts[String(year)] ?? 0) / 12
}

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

/** Returnerer effektivt beløp for en budsjettlinje i en gitt måned.
 *  Bruker periodOverride.amount hvis måneden er innenfor perioden, ellers line.amount. */
function lineAmt(line: { amount: number; periodOverride?: { amount: number; from: string; to: string } }, year: number, m: number): number {
  const po = line.periodOverride
  if (!po) return line.amount
  const key = `${year}-${String(m).padStart(2, '0')}`
  return key >= po.from && key <= po.to ? po.amount : line.amount
}

/** Sjekker om en gitt måned (1–12) i et gitt år faller innenfor en valgfri datoavgrensing. */
function monthInDateRange(year: number, month: number, fromDate?: string, toDate?: string): boolean {
  if (!fromDate && !toDate) return true
  const monthStart = new Date(year, month - 1, 1)
  const monthEnd = new Date(year, month, 0)
  if (fromDate && monthEnd < new Date(fromDate)) return false
  if (toDate && monthStart > new Date(toDate)) return false
  return true
}

// ----------------------------------------------------------------
// Main export
// ----------------------------------------------------------------

export function computeBudgetTable(
  year: number,
  profile: EmploymentProfile | null,
  budgetTemplate: BudgetTemplate,
  monthHistory: MonthRecord[],
  atfEntries: ATFEntry[],
  savingsAccounts: SavingsAccount[],
  debts: DebtAccount[],
  subscriptions: SubscriptionEntry[],
  insurances: InsuranceEntry[],
  overrides: Record<string, number> = {},
  temporaryPayEntries: TemporaryPayEntry[] = [],
  juneForecast?: JuneForecast,
  hideTemporary = false,
  ivfTransactions: IVFTransaction[] = [],
  fondPortfolio?: FondPortfolio,
  ivfSelfLabel?: string,
  /** Slår opp skattetrekk fra faktisk trekktabell for et gitt grunnlag.
   *  Returnerer undefined ved cache-miss — da brukes trekkrutinen som fallback. */
  trekktabellLookup?: (grunnlag: number) => number | undefined,
): BudgetTableData {

  // ---- Month lookup (locked months in this year) ----
  const monthMap = new Map<number, MonthRecord>()
  monthHistory.filter((m) => m.year === year).forEach((m) => monthMap.set(m.month, m))

  // ---- Metas ----
  const metas: MonthMeta[] = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1
    const rec = monthMap.get(m)
    return { month: m, isLocked: rec?.isLocked ?? false, hasSlip: !!(rec?.slipData) }
  })

  // Override helper: use manual override if present, otherwise computed value
  function budgetVal(rowId: string, m: number, computed: number): number {
    return overrides[`${m}:${rowId}`] ?? computed
  }

  // ---- Lønnsutvikling ----
  const trend = estimateSalaryTrend(monthHistory)

  // Bygger opp fungering-oppslag per måned (1–12) for dette året
  const fungeringByMonth = new Map<number, TemporaryPayEntry>()
  for (const entry of temporaryPayEntries) {
    const from = new Date(entry.fromDate)
    const to = new Date(entry.toDate)
    for (let m = 1; m <= 12; m++) {
      const monthStart = new Date(year, m - 1, 1)
      const monthEnd = new Date(year, m, 0)  // siste dag i måneden
      if (monthStart <= to && monthEnd >= from) {
        fungeringByMonth.set(m, entry)
      }
    }
  }

  // For prognose: bruk fremskrevet lønn basert på trend, eller basislønn når fungering er aktiv.
  // Fungeringstillegget (mellomlegget) vises i egen rad — inkluderes IKKE her for å unngå dobbeltføring.
  const budgetSalary = (month: number): number => {
    if (!profile) return 0
    // Har vi slipp for denne måneden i budsjettåret, bruk faktisk lønn (allerede basislønn fra slip)
    const slip = monthMap.get(month)?.slipData
    if (slip) return slip.maanedslonn
    // Fungering aktiv: vis basislønn — mellomlegget håndteres i Fungering-raden
    if (fungeringByMonth.has(month)) return profile.baseMonthly ?? projectMonthlySalary(trend, year, month)
    // Ingen slipphistorikk (f.eks. ny bruker): fall tilbake på profil-grunnlønn
    const projected = projectMonthlySalary(trend, year, month)
    return projected > 0 ? projected : (profile.baseMonthly ?? 0)
  }

  // ---- ATF: summer per utbetalingsmåned ----
  // Prioritet: 1) eksplisitt payoutMonth/payoutYear, 2) tilDateISO + 1 mnd, 3) desember fallback
  const atfByMonth = new Map<number, number>()
  for (const entry of atfEntries.filter((e) => !e.excludeFromBudget)) {
    let payoutYear: number
    let payoutMonth: number
    if (entry.payoutMonth !== undefined && entry.payoutYear !== undefined) {
      payoutYear = entry.payoutYear
      payoutMonth = entry.payoutMonth
    } else if (entry.tilDateISO) {
      const til = new Date(entry.tilDateISO)
      const d = new Date(til.getFullYear(), til.getMonth() + 1, 1)
      payoutYear = d.getFullYear()
      payoutMonth = d.getMonth() + 1
    } else {
      payoutYear = entry.year
      payoutMonth = 12
    }
    if (payoutYear !== year) continue
    atfByMonth.set(payoutMonth, (atfByMonth.get(payoutMonth) ?? 0) + entry.beregnetBeløp)
  }

  // Bruk JuneForecast som eneste kilde til sannhet for feriepenger.
  // Alle tall i budsjett-juni speiler feriepengefanen.
  const juneHoliday = juneForecast
    ? {
        holidayPay: juneForecast.feriepenger,
        holidayLeaveDeduction: juneForecast.ferietrekk,
        netJune: juneForecast.nettoJuni,
        juneSkattetrekk: juneForecast.skattetrekk,
      }
    : null

  // ================================================================
  // INNTEKTER (dualColumn = true)
  // ================================================================
  const inntekterRows: BudgetRow[] = []

  if (profile) {
    // Månedslønn — fremskrevet per måned basert på trend (inkl. fungering)
    inntekterRows.push(mkRow('lonn', 'Månedslønn', uniform12(
      (m) => budgetVal('lonn', m, budgetSalary(m)),
      (m) => monthMap.get(m)?.slipData?.maanedslonn ?? null,
    )))

    // Tillegg — én rad per artskode fra profil (vises som på slippen)
    // Tillegg merket isTemporary=true vises med overstreking og ekskluderes fra summer
    for (const addition of profile.fixedAdditions) {
      if (addition.amount <= 0) continue
      const rowId = `tillegg-${addition.kode}`
      const row = mkRow(rowId, `${addition.label} (${addition.kode})`, uniform12(
        (m) => budgetVal(rowId, m, addition.amount),
        (m) => {
          const slip = monthMap.get(m)?.slipData
          if (!slip) return null
          return slip.fasteTillegg.find((t) => t.artskode === addition.kode)?.belop ?? null
        },
      ))
      inntekterRows.push(hideTemporary && addition.isTemporary ? { ...row, isHidden: true } : row)
    }

    // Feriepenger og ferietrekk (June only) — begge hører til inntektsområdet
    if (juneHoliday) {
      inntekterRows.push(mkRow('feriepenger', 'Feriepenger (juni)', uniform12(
        (m) => budgetVal('feriepenger', m, m === 6 ? juneHoliday.holidayPay : 0),
        () => null,
      )))
      inntekterRows.push(mkRow('ferietrekk', 'Ferietrekk (25 dager)', uniform12(
        (m) => budgetVal('ferietrekk', m, m === 6 ? -juneHoliday.holidayLeaveDeduction : 0),
        () => null,
      )))
    }

    // ATF: plasser i korrekt utbetalingsmåned (budsjett fra atfEntries, faktisk fra slip)
    const hasAtfData = atfByMonth.size > 0 || [...monthMap.values()].some(r => (r.slipData?.atfBeløp ?? 0) > 0)
    if (hasAtfData) {
      inntekterRows.push(mkRow('atf', 'ATF-utbetaling', uniform12(
        (m) => budgetVal('atf', m, atfByMonth.get(m) ?? 0),
        (m) => {
          const slip = monthMap.get(m)?.slipData
          return slip ? (slip.atfBeløp ?? null) : null
        },
      )))
    }

    // Fungering (10P2) — prognose fra temporaryPayEntries, faktisk fra slipp
    const hasGjøring = fungeringByMonth.size > 0 || [...monthMap.values()].some(r => (r.slipData?.fungeringBeløp ?? 0) > 0)
    if (hasGjøring) {
      inntekterRows.push(mkRow('fungering', 'Fungering (10P2)', uniform12(
        (m) => {
          const fungering = fungeringByMonth.get(m)
          if (!fungering) return 0
          // Fungeringstillegg = total fungering-lønn minus siste kjente grunnlønn
          // Bruker profile.baseMonthly (faktisk fra siste slipp) fremfor trend-prognose
          // for å unngå variasjon per måned.
          const baseSalary = profile?.baseMonthly ?? trend.latestMonthly
          return Math.max(0, fungering.maanedslonn - baseSalary)
        },
        (m) => {
          const slip = monthMap.get(m)?.slipData
          return slip ? (slip.fungeringBeløp ?? null) : null
        },
      )))
    }
  }

  // Template income lines (annen_inntekt) — recurring + once-off for this year
  for (const line of budgetTemplate.lines.filter((l) =>
    l.category === 'annen_inntekt' && !(hideTemporary && l.isTemporary) &&
    (l.isRecurring || (l.specificMonth != null && (!l.specificYear || l.specificYear === year)))
  )) {
    const rowId = `income-${line.id}`
    inntekterRows.push(mkRow(rowId, line.label, uniform12(
      (m) => {
        if (!line.isRecurring && m !== line.specificMonth) return 0
        if (!monthInDateRange(year, m, line.temporaryFromDate, line.temporaryToDate)) return 0
        return budgetVal(rowId, m, lineAmt(line, year, m))
      },
      () => null,
    )))
  }

  // ================================================================
  // TREKK (dualColumn = true)
  // ================================================================
  const trekkRows: BudgetRow[] = []
  const grunnlagRows: BudgetRow[] = []

  // Pensjonerbare artskoder fra SPK-regelverket (1162 = HTA-tillegg)
  // 10P2 (fungering) er variabel og ikke inkludert i budsjettbasen
  const PENSJONABLE_ARTSKODER = new Set(['1162'])
  const pensjonableTillegg = profile
    ? profile.fixedAdditions
        .filter((a) => PENSJONABLE_ARTSKODER.has(a.kode) && !(hideTemporary && a.isTemporary))
        .reduce((s, a) => s + a.amount, 0)
    : 0

  if (profile) {
    // Effektiv lønn per måned: inkluderer manuelle overrides, fungering og trend-prognose.
    const effectiveSalaryForMonth = (m: number) => budgetVal('lonn', m, budgetSalary(m))

    // Effektive faste tillegg per måned (inkl. manuelle overrides per tilleggslinje).
    // Disse inngår i /440-grunnlaget på slippen akkurat som lønn.
    const effectiveTilleggForMonth = (m: number) =>
      profile.fixedAdditions.reduce((s, a) => {
        if (a.amount <= 0) return s
        if (hideTemporary && a.isTemporary) return s
        return s + budgetVal(`tillegg-${a.kode}`, m, a.amount)
      }, 0)

    // ---- Grunnlagsrader (vises mellom INNTEKTER og TREKK) ----
    // Skattepliktig inntekt = lønn + faste tillegg + ATF (/440-grunnlag)
    grunnlagRows.push(mkRow('brutto-inntekt', 'Bruttoinntekt', uniform12(
      (m) => inntekterRows.filter(r => !r.isHidden).reduce((s, r) => s + r.cells[m - 1].budget, 0),
      (m) => {
        const slip = monthMap.get(m)?.slipData
        if (!slip) return null
        return slip.maanedslonn
          + slip.fasteTillegg.reduce((s, t) => s + t.belop, 0)
          + (slip.atfBeløp ?? 0)
          + (slip.fungeringBeløp ?? 0)
      },
    )))
    grunnlagRows.push(mkRow('skattepliktig', 'Skattepliktig inntekt', uniform12(
      (m) => effectiveSalaryForMonth(m) + effectiveTilleggForMonth(m) + (atfByMonth.get(m) ?? 0),
      (m) => {
        const slip = monthMap.get(m)?.slipData
        if (!slip) return null
        return slip.maanedslonn + slip.fasteTillegg.reduce((s, t) => s + t.belop, 0) + (atfByMonth.get(m) ?? 0)
      },
    )))

    trekkRows.push(mkRow('skatt', 'Skattetrekk', uniform12(
      (m) => {
        const atfAmount = atfByMonth.get(m) ?? 0
        if (m === 6 && juneHoliday) {
          // Juni: bruk skattetrekk direkte fra JuneForecast (samme kilde som feriepengefanen)
          if ('juneSkattetrekk' in juneHoliday) {
            return budgetVal('skatt', m, -juneHoliday.juneSkattetrekk)
          }
        }
        // Beregn månedlig trekk: prioriter trekktabelloppslag, fall tilbake på trekkrutine
        const grunnlagLonnTillegg = effectiveSalaryForMonth(m) + effectiveTilleggForMonth(m)
        const grunnlagRounded = Math.round(grunnlagLonnTillegg)
        const baseMonthlyTax = trekktabellLookup?.(grunnlagRounded)
          ?? calcMonthlyTaxWithholding(grunnlagLonnTillegg, year)
        // Desember: halvskatt for lønn+tillegg; ATF trekkes fullt uansett måned
        const desemberFaktor = m === 12 ? 0.5 : 1
        const skattLonnTillegg = Math.round(baseMonthlyTax * desemberFaktor)
        // ATF: marginal trekk (trekktabell eller trekkrutine på total - base)
        const skattATF = atfAmount > 0
          ? (() => {
              const grunnlagMedAtf = Math.round(grunnlagLonnTillegg + atfAmount)
              const totalTax = trekktabellLookup?.(grunnlagMedAtf)
                ?? calcMonthlyTaxWithholding(grunnlagLonnTillegg + atfAmount, year)
              return Math.round(totalTax - baseMonthlyTax)
            })()
          : 0
        return budgetVal('skatt', m, -(skattLonnTillegg + skattATF))
      },
      (m) => {
        const slip = monthMap.get(m)?.slipData
        return slip ? -slip.skattetrekk : null
      },
    )))

    // Pensjonstrekk — 2% av (effektiv lønn inkl. override + pensjonerbare faste tillegg, f.eks. 1162 HTA)
    trekkRows.push(mkRow('pensjon', 'Pensjonstrekk SPK', uniform12(
      (m) => budgetVal('pensjon', m, -((effectiveSalaryForMonth(m) + pensjonableTillegg) * profile.pensionPercent / 100)),
      (m) => {
        const slip = monthMap.get(m)?.slipData
        return slip ? -slip.pensjonstrekk : null
      },
    )))

    // Fagforeningskontingent
    if (profile.unionFee > 0) {
      trekkRows.push(mkRow('fagforening', 'Fagforeningskontingent', uniform12(
        (m) => budgetVal('fagforening', m, -profile.unionFee),
        (m) => {
          const slip = monthMap.get(m)?.slipData
          return slip ? -slip.fagforeningskontingent : null
        },
      )))
    }

    // Husleietrekk — vises alltid, men markeres isHidden hvis housingDeductionIsTemporary=true
    if (profile.housingDeduction > 0) {
      const husleieRow = mkRow('husleie', 'Husleietrekk', uniform12(
        (m) => budgetVal('husleie', m, -profile.housingDeduction),
        (m) => {
          const slip = monthMap.get(m)?.slipData
          return slip ? -slip.husleietrekk : null
        },
      ))
      trekkRows.push(hideTemporary && profile.housingDeductionIsTemporary
        ? { ...husleieRow, isHidden: true }
        : husleieRow)
    }

    // Ekstra forskuddstrekk
    if (profile.extraTaxWithholding > 0) {
      trekkRows.push(mkRow('ekstra', 'Ekstra forskuddstrekk', uniform12(
        (m) => budgetVal('ekstra', m, -profile.extraTaxWithholding),
        (m) => {
          const slip = monthMap.get(m)?.slipData
          return slip ? (slip.ekstraTrekk > 0 ? -slip.ekstraTrekk : 0) : null
        },
      )))
    }

    // OU-fond (only if present in any slip)
    if ([...monthMap.values()].some((r) => (r.slipData?.ouFond ?? 0) > 0)) {
      trekkRows.push(mkRow('oufond', 'OU-fond', uniform12(
        () => 0,
        (m) => {
          const slip = monthMap.get(m)?.slipData
          return slip ? -slip.ouFond : null
        },
      )))
    }

  }

  // ================================================================
  // NETTO (dualColumn = true)
  // ================================================================
  const nettoCells: BudgetCell[] = Array.from({ length: 12 }, (_, i) => {
    const inntektBudget = inntekterRows.filter(r => !r.isHidden).reduce((s, r) => s + r.cells[i].budget, 0)
    const trekkBudget = trekkRows.filter(r => !r.isHidden).reduce((s, r) => s + r.cells[i].budget, 0)
    const rec = monthMap.get(i + 1)
    return {
      budget: inntektBudget + trekkBudget,
      actual: rec?.nettoUtbetalt ?? null,
    }
  })


  // ================================================================
  // SKATTEOPPGJØR (dualColumn = true — viser budsjett vs ingen faktisk)
  // ================================================================
  const skatteoppgjorRows: BudgetRow[] = []
  for (const line of budgetTemplate.lines.filter((l) =>
    l.category === 'skatteoppgjor' &&
    (l.isRecurring || (l.specificMonth != null && (!l.specificYear || l.specificYear === year)))
  )) {
    const rowId = `skattoppgjor-${line.id}`
    skatteoppgjorRows.push(mkRow(rowId, line.label, uniform12(
      (m) => {
        if (!line.isRecurring && m !== line.specificMonth) return 0
        return budgetVal(rowId, m, lineAmt(line, year, m))
      },
      () => null,
    )))
  }

  // ================================================================
  // FASTE UTGIFTER (dualColumn = false)
  // ================================================================
  const EXPENSE_CATS = new Set([
    'bolig', 'transport', 'mat', 'helse', 'abonnement', 'forsikring', 'klær', 'fritid', 'annet_forbruk',
  ])
  // Faste kategorier: alltid gjentakende poster (husleie, forsikring, abonnement, bolig)
  const FIXED_CATS = new Set(['bolig', 'forsikring', 'abonnement'])
  // En linje er "variabel" hvis: eksplisitt markert, ELLER det er en engangskostnad, ELLER kategorien er ikke fast
  const isVarLine = (l: { isVariable?: boolean; isRecurring?: boolean; category: string }) =>
    l.isVariable || !l.isRecurring || !FIXED_CATS.has(l.category)

  const fasteRows: BudgetRow[] = []

  for (const line of budgetTemplate.lines.filter((l) =>
    EXPENSE_CATS.has(l.category) && !isVarLine(l) && !(hideTemporary && l.isTemporary) &&
    (l.isRecurring || (l.specificMonth != null && (!l.specificYear || l.specificYear === year)))
  )) {
    const rowId = `exp-${line.id}`
    fasteRows.push(mkRow(rowId, line.label, uniform12(
      (m) => {
        if (!line.isRecurring && m !== line.specificMonth) return 0
        if (!monthInDateRange(year, m, line.temporaryFromDate, line.temporaryToDate)) return 0
        return budgetVal(rowId, m, lineAmt(line, year, m))
      },
      () => null,
    )))
  }

  const activeSubs = subscriptions.filter((s) => s.isActive)
  if (activeSubs.length > 0) {
    fasteRows.push(mkRow('abonnement-auto', 'Abonnement', uniform12(
      (m) => budgetVal('abonnement-auto', m, -activeSubs.reduce((s, sub) => s + subMonthAmount(sub, year, m), 0)),
      () => null,
    )))
  }

  const activeIns = insurances.filter((ins) => ins.isActive || (ins.status === 'avsluttet' && !!ins.cancelledDate))
  if (activeIns.length > 0) {
    fasteRows.push(mkRow('forsikring-auto', 'Forsikringer', uniform12(
      (m) => budgetVal('forsikring-auto', m, -activeIns.reduce((s, ins) => s + insMonthAmount(ins, year, m), 0)),
      () => null,
    )))
  }

  // ================================================================
  // VARIABLE UTGIFTER (dualColumn = false)
  // ================================================================
  const variableRows: BudgetRow[] = []
  for (const line of budgetTemplate.lines.filter((l) =>
    EXPENSE_CATS.has(l.category) && isVarLine(l) && !(hideTemporary && l.isTemporary) &&
    (l.isRecurring || (l.specificMonth != null && (!l.specificYear || l.specificYear === year)))
  )) {
    const rowId = `var-${line.id}`
    variableRows.push(mkRow(rowId, line.label, uniform12(
      (m) => {
        if (!line.isRecurring && m !== line.specificMonth) return 0
        if (!monthInDateRange(year, m, line.temporaryFromDate, line.temporaryToDate)) return 0
        return budgetVal(rowId, m, lineAmt(line, year, m))
      },
      () => null,
    )))
  }

  // ================================================================
  // GJELD (dualColumn = false)
  // ================================================================
  const gjeldRows: BudgetRow[] = []
  for (const debt of debts) {
    if (debt.status === 'nedbetalt') {
      if (!debt.paidOffDate) continue
      const paidMonth = debt.paidOffDate.substring(0, 7)
      if (paidMonth < `${year}-01`) continue  // nedbetalt før dette budsjettåret
      gjeldRows.push(mkRow(`debt-${debt.id}`, debt.creditor, uniform12(
        (m) => {
          const monthKey = `${year}-${String(m).padStart(2, '0')}`
          if (monthKey > paidMonth) return 0
          return budgetVal(`debt-${debt.id}`, m, -(debt.monthlyPayment + debt.termFee))
        },
        () => null,
      )))
    } else {
      const debtStart = debt.startDate.substring(0, 7) // "YYYY-MM"
      if (debtStart > `${year}-12`) continue  // lånet starter etter dette budsjettåret
      gjeldRows.push(mkRow(`debt-${debt.id}`, debt.creditor, uniform12(
        (m) => {
          const monthKey = `${year}-${String(m).padStart(2, '0')}`
          if (monthKey < debtStart) return 0
          return budgetVal(`debt-${debt.id}`, m, -(debt.monthlyPayment + debt.termFee))
        },
        () => null,
      )))
    }
  }

  // ================================================================
  // SPARING (dualColumn = false)
  // ================================================================
  const sparingRows: BudgetRow[] = []
  const SAVINGS_CATS = new Set(['bsu', 'fond', 'krypto', 'buffer', 'annen_sparing'])

  const hasActivity = (a: SavingsAccount) =>
    a.monthlyContribution > 0 ||
    (a.contributionPeriods ?? []).length > 0 ||
    (a.contributions ?? []).length > 0

  for (const acc of savingsAccounts.filter(hasActivity)) {
    sparingRows.push(mkRow(`sav-${acc.id}`, acc.label, uniform12(
      (m) => {
        const monthlyAmt = getBaseContribForPeriod(acc, year, m)
        const overriddenMonthly = monthlyAmt > 0 ? budgetVal(`sav-${acc.id}`, m, -monthlyAmt) : 0
        const oneTime = computeMonthContributions(acc, year, m)
        return overriddenMonthly - oneTime
      },
      (m) => {
        const oneTime = computeMonthContributions(acc, year, m)
        if (oneTime <= 0) return null
        const monthly = getBaseContribForPeriod(acc, year, m)
        return -(oneTime + monthly)
      },
    )))
  }

  // KRON-fond spareavtale
  if (fondPortfolio && (fondPortfolio.monthlyDeposit > 0 || (fondPortfolio.contributionPeriods ?? []).length > 0)) {
    const fondStartYear = new Date(fondPortfolio.startDate).getFullYear()
    const fondStartMonth = new Date(fondPortfolio.startDate).getMonth() + 1
    const nowYear = new Date().getFullYear()
    const nowMonth = new Date().getMonth() + 1

    function fondMndForMonth(m: number): number {
      const periods = fondPortfolio!.contributionPeriods
      if (periods && periods.length > 0) {
        const ym = `${year}-${String(m).padStart(2, '0')}`
        const period = periods.find(p => {
          const from = p.fromDate ? p.fromDate.slice(0, 7) : '0000-00'
          const to = p.toDate ? p.toDate.slice(0, 7) : '9999-99'
          return ym >= from && ym <= to
        })
        return period ? Math.round(period.amount) : 0
      }
      return fondPortfolio!.monthlyDeposit
    }

    sparingRows.push(mkRow('kron-fond', 'KRON Fond', uniform12(
      (m) => {
        if (year < fondStartYear || (year === fondStartYear && m < fondStartMonth)) return 0
        const mnd = fondMndForMonth(m)
        return mnd > 0 ? budgetVal('kron-fond', m, -mnd) : 0
      },
      (m) => {
        if (year < fondStartYear || (year === fondStartYear && m < fondStartMonth)) return null
        const mnd = fondMndForMonth(m)
        if (year < nowYear || (year === nowYear && m <= nowMonth)) return mnd > 0 ? -mnd : null
        return null
      },
    )))
  }

  for (const line of budgetTemplate.lines.filter((l) =>
    SAVINGS_CATS.has(l.category) && !(hideTemporary && l.isTemporary) &&
    (l.isRecurring || (l.specificMonth != null && (!l.specificYear || l.specificYear === year)))
  )) {
    const rowId = `sav-t-${line.id}`
    sparingRows.push(mkRow(rowId, line.label, uniform12(
      (m) => {
        if (!line.isRecurring && m !== line.specificMonth) return 0
        if (!monthInDateRange(year, m, line.temporaryFromDate, line.temporaryToDate)) return 0
        return budgetVal(rowId, m, lineAmt(line, year, m))
      },
      () => null,
    )))
  }

  // IVF eget sparebidrag — faktiske beløp per måned fra prosjektfanen
  const ivfTonjeSparByMonth = new Map<number, number>()
  for (const tx of ivfTransactions) {
    if (tx.type !== 'SPARING') continue
    const lbl = tx.label.toLowerCase()
    if (ivfSelfLabel && !lbl.includes(ivfSelfLabel.toLowerCase())) continue
    if (lbl.includes('mamma') || lbl.includes('bidrag')) continue
    const d = new Date(tx.date)
    if (d.getFullYear() !== year) continue
    const m = d.getMonth() + 1
    ivfTonjeSparByMonth.set(m, (ivfTonjeSparByMonth.get(m) ?? 0) + tx.amount)
  }
  // Vis kun Prosjekt-sparing hvis eier-filter er satt — ellers vet vi ikke hvem sin sparing det er
  if (ivfSelfLabel && ivfTonjeSparByMonth.size > 0) {
    sparingRows.push(mkRow('ivf-sparing-tonje', 'Sparing (Prosjekt)', uniform12(
      (m) => budgetVal('ivf-sparing-tonje', m, -(ivfTonjeSparByMonth.get(m) ?? 0)),
      (m) => ivfTonjeSparByMonth.has(m) ? -(ivfTonjeSparByMonth.get(m)!) : null,
    )))
  }

  // ================================================================
  // DISPONIBELT (summary, dualColumn = true)
  // ================================================================
  const allExpenseRows = [...fasteRows, ...variableRows, ...gjeldRows, ...sparingRows]
  const disponibeltCells: BudgetCell[] = Array.from({ length: 12 }, (_, i) => {
    const expenseBudget = allExpenseRows.reduce((s, r) => s + r.cells[i].budget, 0)
    // Bruk faktiske utgifter der de finnes (f.eks. BSU-bidrag uten månedlig budsjett)
    const hasExpenseActual = allExpenseRows.some((r) => r.cells[i].actual !== null)
    const expenseActual = hasExpenseActual
      ? allExpenseRows.reduce((s, r) => s + (r.cells[i].actual ?? r.cells[i].budget), 0)
      : null
    const netto = nettoCells[i]
    return {
      budget: netto.budget + expenseBudget,
      actual: netto.actual !== null
        ? netto.actual + (expenseActual ?? expenseBudget)
        : expenseActual !== null
          ? netto.budget + expenseActual
          : null,
    }
  })

  // ================================================================
  // Assemble sections
  // ================================================================
  const sections: BudgetSection[] = []

  // BRUTTO-sumrad (ekskluderer isHidden-rader)
  const bruttoSumCells: BudgetCell[] = Array.from({ length: 12 }, (_, i) => {
    const vis = inntekterRows.filter(r => !r.isHidden)
    const budget = vis.reduce((s, r) => s + r.cells[i].budget, 0)
    const hasActual = vis.some((r) => r.cells[i].actual !== null)
    return {
      budget,
      actual: hasActual ? vis.reduce((s, r) => s + (r.cells[i].actual ?? r.cells[i].budget), 0) : null,
    }
  })

  // SUM TREKK-rad (ekskluderer isHidden-rader)
  const trekkSumCells: BudgetCell[] = Array.from({ length: 12 }, (_, i) => {
    const vis = trekkRows.filter(r => !r.isHidden)
    const budget = vis.reduce((s, r) => s + r.cells[i].budget, 0)
    const hasActual = vis.some((r) => r.cells[i].actual !== null)
    return {
      budget,
      actual: hasActual ? vis.reduce((s, r) => s + (r.cells[i].actual ?? r.cells[i].budget), 0) : null,
    }
  })

  if (inntekterRows.length > 0) {
    sections.push({
      key: 'INNTEKTER', label: 'Inntekter', colorClass: 'text-green-400', dualColumn: true,
      rows: [...inntekterRows, ...grunnlagRows, mkRow('brutto', 'BRUTTO', bruttoSumCells, true)],
    })
  }
  if (trekkRows.length > 0) {
    sections.push({
      key: 'TREKK', label: 'Trekk', colorClass: 'text-red-400', dualColumn: true,
      rows: [...trekkRows, mkRow('sum-trekk', 'SUM TREKK', trekkSumCells, true)],
    })
  }

  sections.push({ key: 'NETTO', label: 'Netto utbetalt', colorClass: 'text-foreground', dualColumn: true, rows: [mkRow('netto', 'NETTO', nettoCells, true)] })

  if (fasteRows.length > 0) {
    sections.push({ key: 'FASTE', label: 'Faste utgifter', colorClass: 'text-blue-400', dualColumn: false, rows: fasteRows })
  }
  if (variableRows.length > 0 || skatteoppgjorRows.length > 0) {
    sections.push({ key: 'VARIABLE', label: 'Variable utgifter', colorClass: 'text-yellow-400', dualColumn: false, rows: [...variableRows, ...skatteoppgjorRows] })
  }
  if (gjeldRows.length > 0) {
    sections.push({ key: 'GJELD', label: 'Gjeld', colorClass: 'text-orange-400', dualColumn: false, rows: gjeldRows })
  }
  if (sparingRows.length > 0) {
    sections.push({ key: 'SPARING', label: 'Sparing', colorClass: 'text-purple-400', dualColumn: true, rows: sparingRows })
  }

  // SUM UT = sum av alle utgiftsrader (faktisk der tilgjengelig, ellers budsjett)
  const sumUtCells: BudgetCell[] = Array.from({ length: 12 }, (_, i) => {
    const budget = allExpenseRows.reduce((s, r) => s + r.cells[i].budget, 0)
    const hasActual = allExpenseRows.some((r) => r.cells[i].actual !== null)
    return {
      budget,
      actual: hasActual
        ? allExpenseRows.reduce((s, r) => s + (r.cells[i].actual ?? r.cells[i].budget), 0)
        : null,
    }
  })

  // OVERSKUDD = NETTO + SUM UT (utgifter er negative, så + gir riktig resultat)
  const overskuddCells: BudgetCell[] = Array.from({ length: 12 }, (_, i) => ({
    budget: disponibeltCells[i].budget,
    actual: disponibeltCells[i].actual,
  }))

  sections.push({
    key: 'BUNN', label: 'Oppsummering', colorClass: 'text-foreground', dualColumn: true,
    rows: [
      mkRow('sum-inn', 'SUM INN', nettoCells, true),
      mkRow('sum-ut', 'SUM UT', sumUtCells, true),
      mkRow('overskudd', 'OVERSKUDD', overskuddCells, true),
    ],
  })

  // ================================================================
  // ÅRSOPPSUMMERING — løpende YTD-totaler (kun når profil er satt)
  // ================================================================
  if (profile) {
    // YTD brutto: akkumulert sum per måned.
    // For måneder med slipp brukes faktisk bruttoSum (konsistent med brutto-inntekt-raden).
    // For fremtidige måneder brukes budsjettert inntektssum (inkl. ATF og feriepenger-netto).
    const ytdBruttoCells: BudgetCell[] = []
    let ytdBruttoBudget = 0
    for (let i = 0; i < 12; i++) {
      const m = i + 1
      const slip = monthMap.get(m)?.slipData
      if (slip) {
        ytdBruttoBudget += slip.bruttoSum
      } else {
        ytdBruttoBudget += inntekterRows.filter(r => !r.isHidden).reduce((s, r) => s + r.cells[i].budget, 0)
      }
      ytdBruttoCells.push({ budget: ytdBruttoBudget, actual: slip?.hittilBrutto ?? null })
    }

    // YTD feriepengegrunnlag: lønn + pensjonerbare tillegg, ingen ATF (samme som feriepengegrunnlag på slippen)
    const ytdFerieCells: BudgetCell[] = []
    let ytdFerieBudget = 0
    for (let i = 0; i < 12; i++) {
      const m = i + 1
      const slip = monthMap.get(m)?.slipData
      ytdFerieBudget += budgetSalary(m) + pensjonableTillegg
      ytdFerieCells.push({ budget: ytdFerieBudget, actual: slip?.feriepengegrunnlag ?? null })
    }

    sections.push({
      key: 'OPPSUMMERING',
      label: 'Årsoppsummering',
      colorClass: 'text-muted-foreground',
      dualColumn: true,
      rows: [
        {
          id: 'ytd-brutto',
          label: 'Brutto lønn hittil',
          cells: ytdBruttoCells,
          annualBudget: ytdBruttoCells[11].budget,
          annualActual: ytdBruttoCells[11].actual ?? ytdBruttoCells[11].budget,
          isCumulative: true,
        },
        {
          id: 'ytd-ferie',
          label: 'Feriepengegrunnlag hittil',
          cells: ytdFerieCells,
          annualBudget: ytdFerieCells[11].budget,
          annualActual: ytdFerieCells[11].actual ?? ytdFerieCells[11].budget,
          isCumulative: true,
        },
      ],
    })
  }

  return { year, metas, sections, estimatedAnnualGrowthRate: trend.annualGrowthRate }
}
