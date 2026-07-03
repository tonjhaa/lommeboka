import { useMemo } from 'react'
import { useEconomyStore } from '@/application/useEconomyStore'
import { useAppStore } from '@/store/useAppStore'
import { analyzeAffordabilityPath, type AffordabilityPath } from '@/utils/affordabilityPath'
import type { ScenarioInput } from '@/types'

/**
 * «Vei til råd» for et kalkulator-scenario, basert på Lommebokas faktiske
 * kontoer, spareplaner og gjeld (personlig store — kalkulatoren er personlig).
 * Partner-tall tas med når scenarioet har medsøker og Partner-fanen er aktiv.
 */
export function useAffordabilityPath(scenario: ScenarioInput): AffordabilityPath {
  const savingsAccounts = useEconomyStore((s) => s.savingsAccounts)
  const fondPortfolio = useEconomyStore((s) => s.fondPortfolio)
  const debts = useEconomyStore((s) => s.debts)
  const partnerVeikart = useEconomyStore((s) => s.partnerVeikart)
  const config = useAppStore((s) => s.config)

  return useMemo(
    () =>
      analyzeAffordabilityPath({
        property: scenario.property,
        household: scenario.household,
        interestRate: scenario.loanParameters.interestRate,
        loanTermYears: scenario.loanParameters.loanTermYears,
        extraMonthlyExpenses: scenario.loanParameters.extraMonthlyExpenses,
        financeAllFees: scenario.loanParameters.financeAllFees,
        savingsAccounts,
        fondPortfolio,
        debts,
        partner: partnerVeikart,
        config,
      }),
    [scenario.property, scenario.household, scenario.loanParameters, savingsAccounts, fondPortfolio, debts, partnerVeikart, config],
  )
}
