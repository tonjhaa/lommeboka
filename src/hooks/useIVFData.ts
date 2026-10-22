import { useSharedProjectStore } from '@/store/useSharedProjectStore'
import { useActiveEconomyStore } from '@/contexts/EconomyStoreContext'
import type { IVFTransactionType } from '@/types/economy'


export type IVFTx = { id: string; date: string; label: string; type: IVFTransactionType; amount: number; merknad?: string }

export function useIVFData() {
  const shared = useSharedProjectStore()
  const personalTxs = useActiveEconomyStore((s) => s.ivfTransactions)
  const addPersonal = useActiveEconomyStore((s) => s.addIvfTransaction)
  const updatePersonal = useActiveEconomyStore((s) => s.updateIvfTransaction)
  const removePersonal = useActiveEconomyStore((s) => s.removeIvfTransaction)
  const isShared = shared.partnershipId !== null

  // Bruk delt data kun etter at migrering er gjort ELLER delt tabell allerede har innhold
  const sharedHasData = shared.transactions.length > 0 || shared.migrated
  const useShared = isShared && sharedHasData

  return {
    transactions: useShared ? shared.transactions : personalTxs,
    isShared,
    loading: isShared ? shared.loading : false,
    addTransaction: (tx: IVFTx) =>
      useShared ? shared.addTransaction(tx) : addPersonal(tx),
    updateTransaction: (id: string, updates: Partial<IVFTx>) =>
      useShared ? shared.updateTransaction(id, updates) : updatePersonal(id, updates),
    removeTransaction: (id: string) =>
      useShared ? shared.removeTransaction(id) : removePersonal(id),
    personalTxs,
    migrated: shared.migrated,
    migrateFrom: shared.migrateFrom,
  }
}

