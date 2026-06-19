import { useMemo } from 'react'
import { useActiveEconomyStore } from '@/contexts/EconomyStoreContext'
import { useSharedProjectStore } from '@/store/useSharedProjectStore'
import { computeNetWorthSeries } from '@/domain/economy/netWorthCalculator'
import type { NetWorthScope, NetWorthSeries } from '@/types/economy'

/** Antall måneder historikk og projeksjon som standard. */
const HISTORY_MONTHS = 36
const PROJECTION_MONTHS = 60

export function useNetWorthSeries(
  scope: NetWorthScope,
  opts?: { historyMonths?: number; projectionMonths?: number },
): NetWorthSeries {
  const { savingsAccounts, fondPortfolio, ivfTransactions, debts, partnerVeikart } = useActiveEconomyStore()
  const sharedIvf = useSharedProjectStore((s) => s.transactions)

  const historyMonths = opts?.historyMonths ?? HISTORY_MONTHS
  const projectionMonths = opts?.projectionMonths ?? PROJECTION_MONTHS

  return useMemo(() => {
    const d = new Date()
    const now = { year: d.getFullYear(), month: d.getMonth() + 1 }
    const back = new Date(d.getFullYear(), d.getMonth() - historyMonths, 1)
    const fwd = new Date(d.getFullYear(), d.getMonth() + projectionMonths, 1)
    const ivf = sharedIvf.length > 0
      ? sharedIvf.map((t) => ({ id: t.id, date: t.date, label: t.label, type: t.type, amount: t.amount, merknad: t.merknad }))
      : ivfTransactions
    return computeNetWorthSeries({
      scope,
      from: { year: back.getFullYear(), month: back.getMonth() + 1 },
      to: { year: fwd.getFullYear(), month: fwd.getMonth() + 1 },
      now,
      savingsAccounts, fondPortfolio, ivfTransactions: ivf, debts, partnerVeikart,
    })
  }, [scope, historyMonths, projectionMonths, savingsAccounts, fondPortfolio, ivfTransactions, sharedIvf, debts, partnerVeikart])
}
