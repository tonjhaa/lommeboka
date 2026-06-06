import { createContext, useContext } from 'react'
import { useEconomyStore } from '@/application/useEconomyStore'
import { usePartnerStore } from '@/application/usePartnerStore'
import type { EconomyState } from '@/application/useEconomyStore'

type StoreType = 'economy' | 'partner'

const EconomyStoreContext = createContext<StoreType>('economy')

export function EconomyStoreProvider({
  store,
  children,
}: {
  store: StoreType
  children: React.ReactNode
}) {
  return (
    <EconomyStoreContext.Provider value={store}>
      {children}
    </EconomyStoreContext.Provider>
  )
}

/**
 * Drop-in replacement for useEconomyStore that respects the EconomyStoreContext.
 * In Economy context: reads from useEconomyStore.
 * In Partner context: reads from usePartnerStore.
 *
 * Works with or without a selector — matches Zustand's hook signature.
 * Both underlying hooks are always called (no conditional hooks).
 */
export function useActiveStoreType(): StoreType {
  return useContext(EconomyStoreContext)
}

export function useActiveEconomyStore(): EconomyState
export function useActiveEconomyStore<T>(selector: (s: EconomyState) => T): T
export function useActiveEconomyStore<T = EconomyState>(
  selector?: (s: EconomyState) => T
): T {
  const storeType = useContext(EconomyStoreContext)
  const sel = (selector ?? ((s: EconomyState) => s as unknown as T)) as (s: EconomyState) => T
  // Both must be called unconditionally (Rules of Hooks)
  const fromEconomy = useEconomyStore(sel)
  const fromPartner = usePartnerStore(sel)
  return storeType === 'partner' ? fromPartner : fromEconomy
}
