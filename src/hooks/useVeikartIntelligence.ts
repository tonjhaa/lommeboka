import { useMemo } from 'react'
import { useEconomyStore } from '@/application/useEconomyStore'
import { computeEffectiveBalance } from '@/domain/economy/savingsCalculator'
import { computeBudgetTable } from '@/domain/economy/budgetTableComputer'
import { forecastJune } from '@/domain/economy/holidayPayCalculator'
import { settlementBalance } from '@/domain/economy/taxSettlementCalc'

// ── Typer ────────────────────────────────────────────────────────

export type VeikartEventType =
  | 'fungering_start'
  | 'fungering_slutt'
  | 'gjeld_nedbetalt'
  | 'lonnsoppgjor'
  | 'tillegg_slutter'
  | 'bsu_aldersgrense'
  | 'bsu_maxet'
  | 'atf_utbetaling'
  | 'skatteoppgjor'

export type VeikartEventImpact = 'positive' | 'negative' | 'neutral'

export interface VeikartEvent {
  id: string
  yearMonth: string          // "YYYY-MM"
  type: VeikartEventType
  label: string
  detail: string             // kort beskrivelse av delta
  impact: VeikartEventImpact
  deltaMonthlyNet: number    // varig endring i nettoinntekt per mnd
  deltaMonthlySavings: number // varig endring i disponibelt til sparing
  deltaAnnualGross: number   // varig endring i bruttoinntekt (for låneevne)
  oneTimeAmount: number      // engangsbeløp (ATF etc.)
}

export interface VeikartNetEstimate {
  monthlyNet: number
  source: 'slips' | 'profile_estimate'
  slipMonths: number
}

export interface VeikartSavingsRate {
  actual: number    // faktisk snitt mnd-vekst fra balanceHistory
  planned: number   // sum monthlyContribution
  months: number    // antall kontoer med nok historikk
}

export interface VeikartPaidDebt {
  creditor: string
  freed: number      // frigjorte kr/mnd
  paidOffDate: string
}

// ── Konstanter ───────────────────────────────────────────────────

const BSU_MAX_TOTAL = 300_000
const PROJECTION_MONTHS = 72  // 6 år

// ── Hook ─────────────────────────────────────────────────────────

export function useVeikartIntelligence() {
  const {
    profile,
    userPreferences,
    monthHistory,
    temporaryPayEntries,
    lonnsoppgjor,
    debts,
    savingsAccounts,
    atfEntries,
    taxSettlements,
    budgetTemplate,
    budgetOverrides,
    subscriptions,
    insurances,
    fondPortfolio,
  } = useEconomyStore()

  return useMemo(() => {
    const now = new Date()
    const nowYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const maxDate = new Date(now.getFullYear(), now.getMonth() + PROJECTION_MONTHS, 1)
    const maxYM = `${maxDate.getFullYear()}-${String(maxDate.getMonth() + 1).padStart(2, '0')}`

    // Budsjettets trekktabell-projeksjon for inneværende år — samme kilde som
    // Skatt-fanen, så skatteoppgjør-estimatet under matcher (ikke naiv ×12/mnd).
    // Beregnes én gang og gjenbrukes til både skatteoppgjør-event og budgetSurplus.
    let budgetWithheldAnnual: number | null = null
    let budgetOverskuddCell: { budget: number; actual: number | null } | undefined
    if (profile) {
      const cy = now.getFullYear()
      const juneFc = forecastJune(cy, monthHistory, profile, atfEntries)
      const yearOv = Object.fromEntries(
        Object.entries(budgetOverrides)
          .filter(([k]) => k.startsWith(`${cy}:`))
          .map(([k, v]) => [k.slice(String(cy).length + 1), v]),
      )
      const bt = computeBudgetTable(
        cy, profile, budgetTemplate, monthHistory, atfEntries,
        savingsAccounts, debts, subscriptions, insurances,
        yearOv, temporaryPayEntries, juneFc ?? undefined,
        false, [], fondPortfolio,
      )
      const rows = bt?.sections.flatMap(s => s.rows) ?? []
      const skattR = rows.find(r => r.id === 'skatt')
      const ekstraR = rows.find(r => r.id === 'ekstra')
      if (skattR) {
        budgetWithheldAnnual = Math.round(Math.abs(skattR.annualActual) + Math.abs(ekstraR?.annualActual ?? 0))
      }
      budgetOverskuddCell = rows.find(r => r.id === 'overskudd')?.cells[now.getMonth()]
    }

    // ── Bruttoinntekt og effektiv skattesats ──────────────────
    const grossMonthly = (profile?.baseMonthly ?? 0) +
      (profile?.fixedAdditions ?? []).reduce((s, a) => s + a.amount, 0)

    const monthlyDeductions =
      (profile?.lastKnownTaxWithholding ?? 0) +
      (profile?.extraTaxWithholding ?? 0) +
      (profile?.housingDeduction ?? 0) +
      (profile?.unionFee ?? 0) +
      Math.round(grossMonthly * (profile?.pensionPercent ?? 2) / 100)

    const effectiveTaxRate = grossMonthly > 0
      ? Math.min(0.50, monthlyDeductions / grossMonthly)
      : 0.33

    // ── Netto-estimat ─────────────────────────────────────────
    // Bruker snitt av siste 3 slipper (ekskluderer fungeringsmåneder)
    const fungeringMonths = new Set(temporaryPayEntries.flatMap(e => {
      const months: string[] = []
      const from = new Date(e.fromDate)
      const to = new Date(e.toDate)
      const cur = new Date(from)
      while (cur <= to) {
        months.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`)
        cur.setMonth(cur.getMonth() + 1)
      }
      return months
    }))

    const recentSlips = monthHistory
      .filter(m =>
        m.source === 'imported_slip' &&
        m.nettoUtbetalt > 0 &&
        !fungeringMonths.has(`${m.year}-${String(m.month).padStart(2, '0')}`)
      )
      .sort((a, b) => b.year - a.year || b.month - a.month)
      .slice(0, 3)

    const netEstimate: VeikartNetEstimate = recentSlips.length >= 2
      ? {
          monthlyNet: Math.round(
            recentSlips.reduce((s, m) => s + m.nettoUtbetalt, 0) / recentSlips.length
          ),
          source: 'slips',
          slipMonths: recentSlips.length,
        }
      : {
          monthlyNet: Math.max(0, grossMonthly - monthlyDeductions),
          source: 'profile_estimate',
          slipMonths: 0,
        }

    // ── BSU og alder ──────────────────────────────────────────
    const bsuAccount = savingsAccounts.find(a => a.type === 'BSU')
    const birthYear = userPreferences?.birthYear ?? bsuAccount?.birthYear
    const myAge = birthYear ? now.getFullYear() - birthYear : undefined
    const bsuCanSave = myAge === undefined ? true : myAge <= 33
    const bsuLastSaveYear = birthYear ? birthYear + 33 : undefined

    // ── Hjelpere ──────────────────────────────────────────────
    function ymInRange(ym: string) {
      return ym >= nowYM && ym <= maxYM
    }

    function fmtDelta(n: number, suffix = 'kr/mnd') {
      const abs = Math.abs(n)
      const sign = n >= 0 ? '+' : '−'
      if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)} mill ${suffix}`
      if (abs >= 1_000) return `${sign}${Math.round(abs / 1_000)} k ${suffix}`
      return `${sign}${Math.round(abs)} ${suffix}`
    }

    function formatYM(ym: string) {
      const [y, m] = ym.split('-')
      const names = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des']
      return `${names[parseInt(m) - 1]} ${y}`
    }

    const events: VeikartEvent[] = []

    // ── 1. Fungering ──────────────────────────────────────────
    for (const entry of temporaryPayEntries) {
      const startYM = entry.fromDate.slice(0, 7)
      const endYM = entry.toDate.slice(0, 7)
      const delta = entry.maanedslonn - grossMonthly
      if (delta === 0) continue
      const deltaNet = Math.round(delta * (1 - effectiveTaxRate))

      if (ymInRange(startYM)) {
        events.push({
          id: `fung-start-${entry.id}`,
          yearMonth: startYM,
          type: 'fungering_start',
          label: entry.label,
          detail: fmtDelta(deltaNet),
          impact: delta > 0 ? 'positive' : 'negative',
          deltaMonthlyNet: deltaNet,
          deltaMonthlySavings: deltaNet,
          deltaAnnualGross: delta * 12,
          oneTimeAmount: 0,
        })
      }
      if (ymInRange(endYM)) {
        events.push({
          id: `fung-slutt-${entry.id}`,
          yearMonth: endYM,
          type: 'fungering_slutt',
          label: `${entry.label} slutter`,
          detail: fmtDelta(-deltaNet),
          impact: delta > 0 ? 'negative' : 'positive',
          deltaMonthlyNet: -deltaNet,
          deltaMonthlySavings: -deltaNet,
          deltaAnnualGross: -delta * 12,
          oneTimeAmount: 0,
        })
      }
    }

    // ── 2. Gjeld nedbetalt ────────────────────────────────────
    for (const debt of debts) {
      if (debt.status === 'nedbetalt') continue
      if (!debt.expectedPayoffDate) continue
      const ym = debt.expectedPayoffDate.slice(0, 7)
      if (!ymInRange(ym)) continue
      const freed = (debt.monthlyPayment ?? 0) + (debt.termFee ?? 0)
      if (freed <= 0) continue

      events.push({
        id: `gjeld-${debt.id}`,
        yearMonth: ym,
        type: 'gjeld_nedbetalt',
        label: `${debt.creditor} nedbetalt`,
        detail: fmtDelta(freed) + ' frigjøres',
        impact: 'positive',
        deltaMonthlyNet: 0,
        deltaMonthlySavings: freed,
        deltaAnnualGross: 0,
        oneTimeAmount: 0,
      })
    }

    // ── 3. Fremtidige lønnsoppgjør ────────────────────────────
    for (const opp of lonnsoppgjor) {
      // Kun forventede oppgjør som er aktivert i prognosen skal vises som
      // fremtidig lønnsøkning (samme gating som budsjettprognosen).
      if (opp.source !== 'forventet' || opp.activeInProjection !== true) continue
      const ym = opp.effectiveDate.slice(0, 7)
      if (!ymInRange(ym)) continue
      const delta = opp.maanedslonn - (opp.forrigeMaanedslonn || grossMonthly)
      if (delta === 0) continue
      const deltaNet = Math.round(delta * (1 - effectiveTaxRate))

      events.push({
        id: `lonn-${opp.id}`,
        yearMonth: ym,
        type: 'lonnsoppgjor',
        label: `Lønnsoppgjør ${opp.year}`,
        detail: fmtDelta(delta, 'kr/mnd brutto'),
        impact: delta > 0 ? 'positive' : 'negative',
        deltaMonthlyNet: deltaNet,
        deltaMonthlySavings: deltaNet,
        deltaAnnualGross: delta * 12,
        oneTimeAmount: 0,
      })
    }

    // ── 4. Faste tillegg som slutter ──────────────────────────
    for (const addition of profile?.fixedAdditions ?? []) {
      if (!addition.toDate || addition.isPermanent) continue
      const ym = addition.toDate  // format "YYYY-MM"
      if (!ymInRange(ym)) continue
      const deltaNet = -Math.round(addition.amount * (1 - effectiveTaxRate))

      events.push({
        id: `tillegg-${addition.kode}`,
        yearMonth: ym,
        type: 'tillegg_slutter',
        label: `${addition.label} slutter`,
        detail: fmtDelta(deltaNet),
        impact: 'negative',
        deltaMonthlyNet: deltaNet,
        deltaMonthlySavings: deltaNet,
        deltaAnnualGross: -addition.amount * 12,
        oneTimeAmount: 0,
      })
    }

    // ── 5. BSU aldersgrense ───────────────────────────────────
    if (bsuLastSaveYear && bsuCanSave) {
      const ym = `${bsuLastSaveYear}-12`
      const bsuMonthly = bsuAccount?.monthlyContribution ?? 0
      if (ymInRange(ym)) {
        events.push({
          id: 'bsu-alder',
          yearMonth: ym,
          type: 'bsu_aldersgrense',
          label: 'Siste år å spare i BSU',
          detail: bsuMonthly > 0
            ? `${fmtDelta(bsuMonthly)} kan omdirigeres`
            : 'BSU-innskudd avsluttes',
          impact: 'neutral',
          deltaMonthlyNet: 0,
          deltaMonthlySavings: bsuMonthly,
          deltaAnnualGross: 0,
          oneTimeAmount: 0,
        })
      }
    }

    // ── 6. BSU maxet ──────────────────────────────────────────
    if (bsuCanSave && bsuAccount) {
      const currentBSU = computeEffectiveBalance(bsuAccount, now)
      const remaining = BSU_MAX_TOTAL - currentBSU
      const monthly = bsuAccount.monthlyContribution ?? 0
      if (monthly > 0 && remaining > 0) {
        const monthsToMax = Math.ceil(remaining / monthly)
        const maxDate = new Date(now.getFullYear(), now.getMonth() + monthsToMax, 1)
        const ym = `${maxDate.getFullYear()}-${String(maxDate.getMonth() + 1).padStart(2, '0')}`
        if (ymInRange(ym)) {
          events.push({
            id: 'bsu-maxet',
            yearMonth: ym,
            type: 'bsu_maxet',
            label: 'BSU fylt opp',
            detail: `${fmtDelta(monthly)} kan omdirigeres`,
            impact: 'positive',
            deltaMonthlyNet: 0,
            deltaMonthlySavings: monthly,
            deltaAnnualGross: 0,
            oneTimeAmount: 0,
          })
        }
      }
    }

    // ── 7. ATF-utbetalinger ───────────────────────────────────
    for (const atf of atfEntries) {
      if (!atf.payoutMonth || !atf.payoutYear || atf.excludeFromBudget) continue
      const ym = `${atf.payoutYear}-${String(atf.payoutMonth).padStart(2, '0')}`
      if (!ymInRange(ym)) continue
      const netAmount = Math.round(atf.beregnetBeløp * (1 - effectiveTaxRate))

      events.push({
        id: `atf-${atf.id}`,
        yearMonth: ym,
        type: 'atf_utbetaling',
        label: atf.øvelsesnavn,
        detail: `~${fmtDelta(netAmount, 'kr')} etter skatt`,
        impact: 'positive',
        deltaMonthlyNet: 0,
        deltaMonthlySavings: 0,
        deltaAnnualGross: 0,
        oneTimeAmount: netAmount,
      })
    }

    // ── 8. Skatteoppgjør ──────────────────────────────────────
    // Eksisterende registrerte skatteoppgjør
    for (const ts of taxSettlements) {
      const ym = `${ts.year}-06`
      if (!ymInRange(ym)) continue
      const amount = ts.skattTilGodeEllerRest
      if (amount === 0) continue
      events.push({
        id: `skatt-${ts.year}`,
        yearMonth: ym,
        type: 'skatteoppgjor',
        label: `Skatteoppgjør ${ts.year}`,
        detail: amount > 0
          ? `${fmtDelta(amount, 'kr')} tilgode`
          : `${fmtDelta(Math.abs(amount), 'kr')} restskatt`,
        impact: amount > 0 ? 'positive' : 'negative',
        deltaMonthlyNet: 0,
        deltaMonthlySavings: 0,
        deltaAnnualGross: 0,
        oneTimeAmount: amount,
      })
    }

    // Projisert skatteoppgjør fra taxForecast (kun inneværende år)
    const forecastYear = profile?.taxForecast?.year
    if (forecastYear && forecastYear === now.getFullYear() &&
        !taxSettlements.some(ts => ts.year === forecastYear)) {
      const forecastYM = `${forecastYear}-06`
      if (ymInRange(forecastYM)) {
        const latestSlip = [...monthHistory]
          .filter(m => m.source === 'imported_slip' &&
            (m.slipData?.hittilForskuddstrekk ?? 0) > 0 &&
            m.year === forecastYear)
          .sort((a, b) => b.month - a.month)[0]
        if (latestSlip?.slipData) {
          // Bruk budsjettets trekktabell-projeksjon (samme som Skatt-fanen) for
          // trekket; fall tilbake på naiv ×12/mnd kun om budsjett mangler.
          const expectedTax = profile!.taxForecast!.expectedTax
          const withheld = budgetWithheldAnnual
            ?? Math.round(latestSlip.slipData.hittilForskuddstrekk * 12 / latestSlip.month)
          const projected = settlementBalance(withheld, expectedTax)
          if (Math.abs(projected) > 500) {
            events.push({
              id: `skatt-prognose-${forecastYear}`,
              yearMonth: forecastYM,
              type: 'skatteoppgjor',
              label: `Skatteoppgjør ${forecastYear} (est.)`,
              detail: projected > 0
                ? `~${fmtDelta(projected, 'kr')} tilgode`
                : `~${fmtDelta(Math.abs(projected), 'kr')} restskatt`,
              impact: projected > 0 ? 'positive' : 'negative',
              deltaMonthlyNet: 0,
              deltaMonthlySavings: 0,
              deltaAnnualGross: 0,
              oneTimeAmount: projected,
            })
          }
        }
      }
    }

    events.sort((a, b) => a.yearMonth.localeCompare(b.yearMonth))

    // ── Faktisk sparerate ──────────────────────────────────────
    const savingsRateComparison: VeikartSavingsRate | null = (() => {
      const nonBsu = savingsAccounts.filter(a => a.type !== 'BSU')
      let totalActual = 0
      let totalPlanned = 0
      let validAccounts = 0
      for (const acc of nonBsu) {
        const sorted = [...acc.balanceHistory].sort((a, b) =>
          a.year !== b.year ? a.year - b.year : a.month - b.month)
        if (sorted.length < 2) continue
        const recent = sorted.slice(-6)
        if (recent.length < 2) continue
        const first = recent[0]
        const last = recent[recent.length - 1]
        const months = (last.year - first.year) * 12 + (last.month - first.month)
        if (months <= 0) continue
        totalActual += (last.balance - first.balance) / months
        totalPlanned += acc.monthlyContribution ?? 0
        validAccounts++
      }
      if (validAccounts === 0 || totalPlanned === 0) return null
      return { actual: Math.round(totalActual), planned: Math.round(totalPlanned), months: validAccounts }
    })()

    // ── Nylig nedbetalt gjeld ─────────────────────────────────
    const sixMonthsAgo = new Date(now)
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
    const recentlyPaidDebts: VeikartPaidDebt[] = debts
      .filter(d =>
        d.status === 'nedbetalt' && d.paidOffDate &&
        new Date(d.paidOffDate) >= sixMonthsAgo
      )
      .map(d => ({
        creditor: d.creditor,
        freed: Math.round((d.monthlyPayment ?? 0) + (d.termFee ?? 0)),
        paidOffDate: d.paidOffDate!,
      }))

    // ── Budsjett-overskudd (for Veikart-sammenligning) ────────
    let budgetSurplus: number | null = null
    if (budgetOverskuddCell) {
      budgetSurplus = budgetOverskuddCell.actual ?? budgetOverskuddCell.budget
    }

    return {
      netEstimate,
      birthYear,
      myAge,
      bsuCanSave,
      bsuLastSaveYear,
      effectiveTaxRate,
      grossMonthly,
      events,
      formatYM,
      savingsRateComparison,
      recentlyPaidDebts,
      budgetSurplus,
    }
  }, [
    profile, userPreferences, monthHistory, temporaryPayEntries,
    lonnsoppgjor, debts, savingsAccounts, atfEntries, taxSettlements,
    budgetTemplate, budgetOverrides, subscriptions, insurances, fondPortfolio,
  ])
}
