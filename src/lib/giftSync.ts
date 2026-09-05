import { useGiftStore, giftSharedSlice, giftSliceIsEmpty, type GaverSharedData } from '@/application/useGiftStore'
import { useSharedGaverStore } from '@/store/useSharedGaverStore'

function isSharedActive(shared: ReturnType<typeof useSharedGaverStore.getState>): boolean {
  return shared.partnershipId !== null && ((shared.data !== null && !giftSliceIsEmpty(shared.data)) || shared.migrated)
}

/**
 * Gaveplanleggeren (useGiftStore) leses fra ~26 steder i GiftPage.tsx (6 interne
 * faner + egne selector-metoder som getResult/getActualVsPlanned) — å bytte
 * lesekilde per lesepunkt slik useIVFData/useBabyShopping/useClothing gjør ville
 * krevd en full omskriving av siden. Denne brosjen gjør det motsatte: speiler
 * innholdet toveis mellom useGiftStore (lokal) og useSharedGaverStore (delt),
 * slik at GiftPage selv ikke trenger å vite om deling i det hele tatt.
 *
 * Lokale endringer debounces 3s (samme som Supabase-synken i syncEconomyData.ts)
 * før de pushes til delt lagring. Innkommende delt data skrives rett inn i
 * useGiftStore — `applyingRemote`-flagget hindrer at det trigger en ny push.
 */
export function startGiftSync(): () => void {
  let applyingRemote = false
  let saveTimer: ReturnType<typeof setTimeout> | null = null

  const flush = () => {
    if (!saveTimer) return
    clearTimeout(saveTimer)
    saveTimer = null
    const shared = useSharedGaverStore.getState()
    if (!isSharedActive(shared)) return
    void shared.setData(giftSharedSlice())
  }

  const unsubGift = useGiftStore.subscribe(() => {
    if (applyingRemote) return
    if (!isSharedActive(useSharedGaverStore.getState())) return
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(flush, 3000)
  })

  const unsubShared = useSharedGaverStore.subscribe((state, prevState) => {
    if (state.data === prevState.data || state.data === null) return
    const data: GaverSharedData = state.data
    applyingRemote = true
    useGiftStore.setState({
      settings: data.settings,
      weightRules: data.weightRules,
      recipients: data.recipients,
      events: data.events,
    })
    setTimeout(() => { applyingRemote = false }, 0)
  })

  const onVisibilityChange = () => { if (document.visibilityState === 'hidden') flush() }
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('pagehide', flush)

  return () => {
    unsubGift()
    unsubShared()
    document.removeEventListener('visibilitychange', onVisibilityChange)
    window.removeEventListener('pagehide', flush)
    if (saveTimer) clearTimeout(saveTimer)
  }
}
