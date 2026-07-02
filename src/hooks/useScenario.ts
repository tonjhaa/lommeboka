import { useMemo } from 'react'
import { useActiveEconomyStore } from '@/contexts/EconomyStoreContext'
import { useAppStore } from '@/store/useAppStore'
import { simulateScenario, type ScenarioBaseline } from '@/domain/economy/scenarioSimulator'
import { usePensionBaseInput } from '@/hooks/usePensionBaseInput'
import { computeEffectiveBalance } from '@/domain/economy/savingsCalculator'
import type { ScenarioResult } from '@/types/economy'

export function useScenario(): ScenarioResult | null {
  const profile = useActiveEconomyStore((s) => s.profile)
  const savingsAccounts = useActiveEconomyStore((s) => s.savingsAccounts)
  const fondPortfolio = useActiveEconomyStore((s) => s.fondPortfolio)
  const ivfTransactions = useActiveEconomyStore((s) => s.ivfTransactions)
  const debts = useActiveEconomyStore((s) => s.debts)
  const partnerVeikart = useActiveEconomyStore((s) => s.partnerVeikart)
  const levers = useAppStore((s) => s.scenarioLevers)
  // Kanonisk pensjonsinput — samme hook som Pensjon-siden og dashbord-chipen,
  // så baseline-pensjonen matcher overalt.
  const { baseInput: pensionBase } = usePensionBaseInput()

  return useMemo(() => {
    if (!profile || !pensionBase) return null
    const d = new Date()
    const now = { year: d.getFullYear(), month: d.getMonth() + 1 }
    const fasteTillegg = (profile.fixedAdditions ?? []).reduce((s, t) => s + t.amount, 0)
    const grossMonthly = profile.baseMonthly + fasteTillegg

    // Egenkapital med samme basis som Veikart: effektiv saldo (sparekonto + BSU) + fond.
    const equity =
      savingsAccounts
        .filter((a) => a.type === 'sparekonto' || a.type === 'BSU')
        .reduce((s, a) => s + computeEffectiveBalance(a, d), 0) +
      ([...(fondPortfolio?.snapshots ?? [])].sort((a, b) => b.date.localeCompare(a.date))[0]?.totalValue ?? 0)

    const existingDebt = debts
      .filter((dd) => dd.status !== 'nedbetalt')
      .reduce((s, dd) => s + dd.currentBalance, 0)

    const baseline: ScenarioBaseline = {
      now,
      historyMonths: 36,
      projectionMonths: 60,
      grossMonthly,
      pensionBase,
      equity,
      existingDebt,
      savingsAccounts,
      fondPortfolio,
      ivfTransactions,
      debts,
      partnerVeikart,
    }
    return simulateScenario(baseline, levers)
  }, [profile, pensionBase, savingsAccounts, fondPortfolio, ivfTransactions, debts, partnerVeikart, levers])
}
