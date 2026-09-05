import { create, type UseBoundStore, type StoreApi } from 'zustand'
import { loadSharedData, saveSharedData, subscribeToSharedData } from '@/lib/sharedData'

export interface SharedDataState<T> {
  data: T | null
  partnershipId: string | null
  loading: boolean
  error: string | null
  migrated: boolean
  _unsubscribe: (() => void) | null

  initialize: (partnershipId: string) => Promise<void>
  reset: () => void
  setData: (data: T) => Promise<void>
  /** Engangs-migrering av personlig data til delt lager — hopper over hvis delt data
   *  allerede finnes (ifølge `isEmpty`). Returnerer true hvis migreringen faktisk skjedde. */
  migrateFrom: (personalData: T, isEmpty: (d: T) => boolean) => Promise<boolean>
}

/** Fabrikk for en partnerskaps-scopet delt datastore — én instans per feature/nøkkel
 *  (se useSharedUtstyrStore.ts, useSharedKlaerStore.ts, useSharedGaverStore.ts). Samme
 *  livssyklus-mønster som useSharedProjectStore, men for én hel JSON-verdi per nøkkel
 *  istedenfor én rad per transaksjon. */
export function createSharedDataStore<T>(key: string, fallback: T): UseBoundStore<StoreApi<SharedDataState<T>>> {
  return create<SharedDataState<T>>((set, get) => ({
    data: null,
    partnershipId: null,
    loading: false,
    error: null,
    migrated: false,
    _unsubscribe: null,

    initialize: async (partnershipId) => {
      if (get().partnershipId === partnershipId) return
      get()._unsubscribe?.()
      set({ loading: true, error: null, partnershipId })

      try {
        const data = await loadSharedData<T>(partnershipId, key, fallback)
        set({ data, loading: false })

        const unsub = subscribeToSharedData<T>(partnershipId, key, (d) => set({ data: d }))
        set({ _unsubscribe: unsub })
      } catch (err) {
        set({ loading: false, error: String(err) })
      }
    },

    reset: () => {
      get()._unsubscribe?.()
      set({ data: null, partnershipId: null, loading: false, error: null, migrated: false, _unsubscribe: null })
    },

    setData: async (data) => {
      const { partnershipId } = get()
      if (!partnershipId) return
      // Oppdater lokalt umiddelbart — ikke stol på at realtime-hendelsen kommer fram
      set({ data })
      await saveSharedData(partnershipId, key, data)
    },

    migrateFrom: async (personalData, isEmpty) => {
      const { partnershipId, data } = get()
      if (!partnershipId) return false
      if (data !== null && !isEmpty(data)) {
        set({ migrated: true })
        return false
      }
      await saveSharedData(partnershipId, key, personalData)
      set({ data: personalData, migrated: true })
      return true
    },
  }))
}
