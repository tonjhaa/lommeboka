import { useMemo } from 'react'
import { useActiveEconomyStore } from '@/contexts/EconomyStoreContext'
import { useAppStore } from '@/store/useAppStore'
import { simulateScenario, type ScenarioBaseline } from '@/domain/economy/scenarioSimulator'
import { GRUNNBELOP_NOK } from '@/config/economy.config'
import type { ScenarioResult } from '@/types/economy'

export function useScenario(): ScenarioResult | null {
  const profile = useActiveEconomyStore((s) => s.profile)
  const savingsAccounts = useActiveEconomyStore((s) => s.savingsAccounts)
  const fondPortfolio = useActiveEconomyStore((s) => s.fondPortfolio)
  const ivfTransactions = useActiveEconomyStore((s) => s.ivfTransactions)
  const debts = useActiveEconomyStore((s) => s.debts)
  const partnerVeikart = useActiveEconomyStore((s) => s.partnerVeikart)
  const userPreferences = useActiveEconomyStore((s) => s.userPreferences)
  const levers = useAppStore((s) => s.scenarioLevers)

  return useMemo(() => {
    if (!profile) return null
    const d = new Date()
    const now = { year: d.getFullYear(), month: d.getMonth() + 1 }
    const fasteTillegg = (profile.fixedAdditions ?? []).reduce((s, t) => s + t.amount, 0)
    const grossMonthly = profile.baseMonthly + fasteTillegg
    const equity = savingsAccounts.reduce((s, a) => s + a.openingBalance, 0)
    const existingDebt = debts
      .filter((dd) => dd.status !== 'nedbetalt')
      .reduce((s, dd) => s + dd.currentBalance, 0)

    const baseline: ScenarioBaseline = {
      now,
      historyMonths: 36,
      projectionMonths: 60,
      grossMonthly,
      baseMonthlyForPension: profile.baseMonthly,
      pensionBirthYear: userPreferences?.birthYear ?? 1995,
      pensionServiceStartYear: now.year - 5,
      currentG: GRUNNBELOP_NOK,
      equity,
      existingDebt,
      savingsAccounts,
      fondPortfolio,
      ivfTransactions,
      debts,
      partnerVeikart,
    }
    return simulateScenario(baseline, levers)
  }, [profile, savingsAccounts, fondPortfolio, ivfTransactions, debts, partnerVeikart, userPreferences, levers])
}
