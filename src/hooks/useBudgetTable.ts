import { useEffect, useMemo, useState } from 'react'
import { useActiveEconomyStore } from '@/contexts/EconomyStoreContext'
import { useKeyFigures } from '@/hooks/useKeyFigures'
import { computeBudgetTable } from '@/domain/economy/budgetTableComputer'
import { forecastJune } from '@/domain/economy/holidayPayCalculator'
import { slaaOppTrekk, slaaOppTrekkSync } from '@/utils/trekktabellLookup'

export type BudgetTable = ReturnType<typeof computeBudgetTable>
export type JuneForecast = ReturnType<typeof forecastJune>

export interface BudgetTableResult {
  /** Alltid satt — computeBudgetTable takler null-profil (viser kun budsjettlinjer). */
  table: BudgetTable
  juneForecast: JuneForecast | null
}

/**
 * Kanonisk budsjettabell-motor for hele appen.
 *
 * ALL visning av budsjett-/prognosetall (Budsjett, Dashbord, Simulator,
 * Treffsikkerhet, Skattekalkulator, Veikart-intelligens) skal gå gjennom denne
 * hooken, slik at alle steder regner med de samme forutsetningene:
 * trekktabell-oppslag, lønnsoppgjør, ansettelsesdato, IVF-transaksjoner og fond.
 * Ikke kall computeBudgetTable direkte fra sider/komponenter.
 */
export function useBudgetTable(year: number, opts?: { hideTemporary?: boolean }): BudgetTableResult {
  const profile = useActiveEconomyStore((s) => s.profile)
  const budgetTemplate = useActiveEconomyStore((s) => s.budgetTemplate)
  const monthHistory = useActiveEconomyStore((s) => s.monthHistory)
  const atfEntries = useActiveEconomyStore((s) => s.atfEntries)
  const savingsAccounts = useActiveEconomyStore((s) => s.savingsAccounts)
  const debts = useActiveEconomyStore((s) => s.debts)
  const subscriptions = useActiveEconomyStore((s) => s.subscriptions)
  const insurances = useActiveEconomyStore((s) => s.insurances)
  const budgetOverrides = useActiveEconomyStore((s) => s.budgetOverrides)
  const temporaryPayEntries = useActiveEconomyStore((s) => s.temporaryPayEntries)
  const ivfTransactions = useActiveEconomyStore((s) => s.ivfTransactions)
  const fondPortfolio = useActiveEconomyStore((s) => s.fondPortfolio)
  const ivfSettings = useActiveEconomyStore((s) => s.ivfSettings)
  const absenceHireDate = useActiveEconomyStore((s) => s.absenceHireDate)
  const lonnsoppgjor = useActiveEconomyStore((s) => s.lonnsoppgjor)
  const kf = useKeyFigures()

  const hideTemporary = opts?.hideTemporary ?? false

  // Last trekktabelldata for brukerens tabellnummer inn i minne-cachen.
  // Nettverksfeil ignoreres — trekkrutinen brukes som fallback.
  const [trekktabellLoaded, setTrekktabellLoaded] = useState(false)
  useEffect(() => {
    const tabellnummer = profile?.tabellnummer
    if (!tabellnummer) return
    const baseMonthly = profile?.baseMonthly ?? 0
    if (baseMonthly <= 0) return
    slaaOppTrekk(tabellnummer, Math.round(baseMonthly), 1)
      .then(() => setTrekktabellLoaded(true))
      .catch(() => {})
  }, [profile?.tabellnummer, profile?.baseMonthly])

  const trekktabellLookup = useMemo(() => {
    const tabellnummer = profile?.tabellnummer
    if (!trekktabellLoaded || !tabellnummer) return undefined
    return (grunnlag: number) => slaaOppTrekkSync(tabellnummer, grunnlag, 1) ?? undefined
  }, [trekktabellLoaded, profile?.tabellnummer])

  return useMemo(() => {
    const prefix = `${year}:`
    const yearOverrides: Record<string, number> = {}
    for (const [k, v] of Object.entries(budgetOverrides)) {
      if (k.startsWith(prefix)) yearOverrides[k.slice(prefix.length)] = v
    }

    // computeBudgetTable takler null-profil (viser kun budsjettlinjer) — samme
    // oppførsel som Budsjett-fanen alltid har hatt.
    const juneForecast = profile
      ? forecastJune(year, monthHistory, profile, atfEntries, temporaryPayEntries, kf.feriepengerProsent)
      : null

    const table = computeBudgetTable(
      year,
      profile,
      budgetTemplate,
      monthHistory,
      atfEntries,
      savingsAccounts,
      debts,
      subscriptions,
      insurances,
      yearOverrides,
      temporaryPayEntries,
      juneForecast ?? undefined,
      hideTemporary,
      ivfTransactions,
      fondPortfolio,
      ivfSettings?.selfLabel,
      trekktabellLookup,
      absenceHireDate,
      lonnsoppgjor,
    )
    return { table, juneForecast }
  }, [
    year, profile, budgetTemplate, monthHistory, atfEntries, savingsAccounts,
    debts, subscriptions, insurances, budgetOverrides, temporaryPayEntries,
    ivfTransactions, fondPortfolio, ivfSettings?.selfLabel, trekktabellLookup,
    absenceHireDate, lonnsoppgjor, hideTemporary, kf.feriepengerProsent,
  ])
}
