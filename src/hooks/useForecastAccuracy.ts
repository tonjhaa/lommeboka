import { useMemo } from 'react'
import { useActiveEconomyStore } from '@/contexts/EconomyStoreContext'
import { useBudgetTable } from '@/hooks/useBudgetTable'
import { computeAccuracy } from '@/domain/economy/forecastCalibration'

export type AccuracyReport = ReturnType<typeof computeAccuracy>

/**
 * Kanonisk treffsikkerhet-beregning (budsjett vs faktisk).
 * Én kilde for Treffsikkerhet-visningen og Simulatorens treff-bånd — bruker
 * samme budsjettmotor (useBudgetTable) som resten av appen.
 */
export function useForecastAccuracy(): { report: AccuracyReport | null; slipCount: number } {
  const monthHistory = useActiveEconomyStore((s) => s.monthHistory)
  const { table } = useBudgetTable(new Date().getFullYear())

  const slipCount = useMemo(
    () => monthHistory.filter((m) => m.source === 'imported_slip').length,
    [monthHistory],
  )

  const report = useMemo(() => {
    if (!table) return null
    // Mål kun granulære linjerader (+ netto som hovedtall). Sum-/YTD-rader ekskluderes:
    // de er avledet og padder treff-% med nær-duplikate avvik (sum-trekk, overskudd, brutto …).
    const rows = table.sections
      .flatMap((s) => s.rows)
      .filter((r) => (!r.isBold || r.id === 'netto') && !r.isCumulative)
      .map((r) => ({
        id: r.id, label: r.label, cells: r.cells.map((c) => ({ budget: c.budget, actual: c.actual })),
      }))
    return computeAccuracy(rows)
  }, [table])

  return { report, slipCount }
}
