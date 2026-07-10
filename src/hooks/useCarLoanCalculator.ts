// src/hooks/useCarLoanCalculator.ts
import { useEffect, useMemo } from 'react'
import { useCarLoanCalculatorStore } from '@/store/useCarLoanCalculatorStore'
import { useBudgetTable } from './useBudgetTable'
import { calculateCarLoan, type CarLoanResult } from '@/utils/carLoanCalculator'

/**
 * Kobler bilkalkulator-storen mot beregningsmotoren, og forhåndsfyller
 * "disponibelt til bil per måned" med inneværende måneds OVERSKUDD fra
 * budsjettmotoren — helt til brukeren skriver inn et eget tall selv
 * (`availableMonthlyBudgetIsManual`), da respekteres det manuelle tallet
 * og overstyres ikke igjen automatisk ved senere besøk.
 */
export function useCarLoanCalculator(): { result: CarLoanResult } {
  const inputs = useCarLoanCalculatorStore((s) => s.inputs)
  const isManual = useCarLoanCalculatorStore((s) => s.availableMonthlyBudgetIsManual)
  const setAvailableMonthlyBudget = useCarLoanCalculatorStore((s) => s.setAvailableMonthlyBudget)

  const { table } = useBudgetTable(new Date().getFullYear())

  const suggestedBudget = useMemo(() => {
    const overskuddRow = table.sections
      .find((s) => s.key === 'BUNN')
      ?.rows.find((r) => r.id === 'overskudd')
    const currentMonthIndex = new Date().getMonth()
    return Math.max(0, Math.round(overskuddRow?.cells[currentMonthIndex]?.budget ?? 0))
  }, [table])

  useEffect(() => {
    if (!isManual && inputs.availableMonthlyBudget !== suggestedBudget) {
      setAvailableMonthlyBudget(suggestedBudget, false)
    }
  }, [isManual, suggestedBudget, inputs.availableMonthlyBudget, setAvailableMonthlyBudget])

  const result = useMemo(() => calculateCarLoan(inputs), [inputs])

  return { result }
}
