import { create } from 'zustand'
import {
  loadSharedTransactions,
  addSharedTransaction,
  updateSharedTransaction,
  removeSharedTransaction,
  subscribeToSharedProject,
  migratePersonalToShared,
  type SharedProjectTransaction,
} from '@/lib/sharedProject'
import type { IVFTransactionType } from '@/types/economy'

interface SharedProjectState {
  transactions: SharedProjectTransaction[]
  partnershipId: string | null
  loading: boolean
  error: string | null
  migrated: boolean
  _unsubscribe: (() => void) | null

  initialize: (partnershipId: string) => Promise<void>
  reset: () => void
  addTransaction: (tx: Omit<SharedProjectTransaction, 'id' | 'partnership_id' | 'created_at' | 'created_by'>) => Promise<void>
  updateTransaction: (id: string, updates: Partial<Pick<SharedProjectTransaction, 'date' | 'label' | 'type' | 'amount' | 'merknad'>>) => Promise<void>
  removeTransaction: (id: string) => Promise<void>
  migrateFrom: (personalTxs: Array<{ id: string; date: string; label: string; type: IVFTransactionType; amount: number; merknad?: string }>) => Promise<number>
}

export const useSharedProjectStore = create<SharedProjectState>((set, get) => ({
  transactions: [],
  partnershipId: null,
  loading: false,
  error: null,
  migrated: false,
  _unsubscribe: null,

  initialize: async (partnershipId: string) => {
    if (get().partnershipId === partnershipId) return
    get()._unsubscribe?.()
    set({ loading: true, error: null, partnershipId })

    try {
      const txs = await loadSharedTransactions(partnershipId)
      set({ transactions: txs, loading: false })

      const unsub = subscribeToSharedProject(
        partnershipId,
        (tx) => set((s) => ({ transactions: [...s.transactions, tx] })),
        (tx) => set((s) => ({ transactions: s.transactions.map((t) => t.id === tx.id ? tx : t) })),
        (id) => set((s) => ({ transactions: s.transactions.filter((t) => t.id !== id) })),
      )
      set({ _unsubscribe: unsub })
    } catch (err) {
      set({ loading: false, error: String(err) })
    }
  },

  reset: () => {
    get()._unsubscribe?.()
    set({ transactions: [], partnershipId: null, loading: false, error: null, _unsubscribe: null })
  },

  addTransaction: async (tx) => {
    const { partnershipId } = get()
    if (!partnershipId) return
    await addSharedTransaction(partnershipId, tx)
    // realtime INSERT vil oppdatere state automatisk
  },

  updateTransaction: async (id, updates) => {
    await updateSharedTransaction(id, updates)
    // realtime UPDATE vil oppdatere state automatisk
  },

  removeTransaction: async (id) => {
    await removeSharedTransaction(id)
    // realtime DELETE vil oppdatere state automatisk
  },

  migrateFrom: async (personalTxs) => {
    const { partnershipId } = get()
    if (!partnershipId) return 0
    const count = await migratePersonalToShared(partnershipId, personalTxs)
    if (count > 0) {
      const txs = await loadSharedTransactions(partnershipId)
      set({ transactions: txs, migrated: true })
    } else {
      set({ migrated: true })
    }
    return count
  },
}))
