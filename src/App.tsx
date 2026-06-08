import { lazy, Suspense, useEffect, useState, type ComponentType } from 'react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function lazyWithRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>
): React.LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      return await factory()
    } catch (e) {
      const key = `lazy-reload-${factory.toString().slice(0, 60)}`
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, '1')
        window.location.reload()
        return new Promise<{ default: T }>(() => {})
      }
      throw e
    }
  })
}
import { AppLayout } from '@/components/layout/AppLayout'
import { MainNav } from '@/components/layout/MainNav'
import { CalculatorPage } from '@/pages/CalculatorPage'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAppStore } from '@/store/useAppStore'
import { useAuthStore } from '@/store/useAuthStore'
import { usePartnershipStore } from '@/store/usePartnershipStore'
import { useSharedProjectStore } from '@/store/useSharedProjectStore'
import { LoginPage } from '@/pages/LoginPage'
import { loadFromSupabase, startAutoSync } from '@/lib/syncEconomyData'
import { useEconomyStore } from '@/application/useEconomyStore'

const EconomyPage = lazyWithRetry(() =>
  import('@/pages/economy/EconomyPage').then((m) => ({
    default: m.EconomyPage,
  }))
)

const VeikartPage = lazyWithRetry(() =>
  import('@/pages/economy/VeikartPage').then((m) => ({
    default: m.VeikartPage,
  }))
)

const TaxCalculatorPage = lazyWithRetry(() =>
  import('@/pages/TaxCalculatorPage').then((m) => ({
    default: m.TaxCalculatorPage as ComponentType,
  }))
)

const PartnerPage = lazyWithRetry(() =>
  import('@/pages/economy/PartnerPage').then((m) => ({ default: m.PartnerPage }))
)
const IVFPageTop = lazyWithRetry(() =>
  import('@/pages/economy/ProsjektPage').then((m) => ({ default: m.ProsjektPage }))
)

function PageFallback() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      Laster…
    </div>
  )
}

function AppContent() {
  const currentView = useAppStore((s) => s.currentView)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <MainNav />
      <div className="flex-1 overflow-hidden">
        {currentView === 'calculator' && <CalculatorPage />}
        {currentView === 'economy' && (
          <Suspense fallback={<PageFallback />}>
            <EconomyPage />
          </Suspense>
        )}
        {currentView === 'skattekalkulator' && (
          <Suspense fallback={<PageFallback />}>
            <TaxCalculatorPage />
          </Suspense>
        )}
        {currentView === 'veikart' && (
          <Suspense fallback={<PageFallback />}>
            <VeikartPage />
          </Suspense>
        )}
        {currentView === 'partner' && (
          <Suspense fallback={<PageFallback />}>
            <PartnerPage />
          </Suspense>
        )}
        {currentView === 'ivf' && (
          <Suspense fallback={<PageFallback />}>
            <IVFPageTop />
          </Suspense>
        )}
      </div>
    </div>
  )
}

function App() {
  const { user, initialized, initialize } = useAuthStore()
  const restoreProfileFromSlips = useEconomyStore((s) => s.restoreProfileFromSlips)
  const [syncing, setSyncing] = useState(false)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    initialize()
  }, [initialize])

  // Gjenoppbygg lønnsprofil fra importerte slipper om profil mangler (datamigrasjon)
  useEffect(() => {
    restoreProfileFromSlips()
  }, [restoreProfileFromSlips])

  useEffect(() => {
    if (!user) return

    // Rydd opp stale data fra en annen bruker på samme enhet
    const STORE_KEYS = ['min-okonomi-v1', 'lommeboka-partner-v1', 'lommeboka-gaver-v1', 'lommeboka-permisjon-v1', 'boligkalkulator-storage']
    const lastUserId = localStorage.getItem('lommeboka-session-user')
    if (lastUserId && lastUserId !== user.id) {
      STORE_KEYS.forEach(k => localStorage.removeItem(k))
    }
    localStorage.setItem('lommeboka-session-user', user.id)

    setSyncing(true)
    setLoadError(false)
    loadFromSupabase()
      .then((ok) => { if (!ok) setLoadError(true) })
      .catch(() => setLoadError(true))
      .finally(() => setSyncing(false))

    const stopSync = startAutoSync()

    // Initialiser partnerskap og håndter eventuelle invite-lenker
    const initPartnership = async () => {
      const params = new URLSearchParams(window.location.search)
      const inviteId = params.get('invite') ?? localStorage.getItem('pendingInvite')
      if (inviteId) {
        localStorage.removeItem('pendingInvite')
        await usePartnershipStore.getState().accept(inviteId)
        const url = new URL(window.location.href)
        url.searchParams.delete('invite')
        window.history.replaceState({}, '', url.toString())
      } else {
        await usePartnershipStore.getState().initialize()
      }
      // Initialiser delt prosjekt om partnerskap er koblet
      const partnership = usePartnershipStore.getState().partnership
      if (partnership?.status === 'accepted') {
        useSharedProjectStore.getState().initialize(partnership.id)
      }
    }
    initPartnership()

    return stopSync
  }, [user])

  if (!initialized || syncing) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        {syncing ? 'Laster data…' : 'Laster…'}
      </div>
    )
  }

  if (!user) {
    return <LoginPage />
  }

  if (loadError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-sm text-muted-foreground px-4 text-center">
        <p className="text-base text-foreground font-medium">Kunne ikke laste data fra skyen</p>
        <p className="text-xs">Sjekk internettforbindelsen og prøv igjen.</p>
        <button
          onClick={() => {
            setLoadError(false)
            setSyncing(true)
            loadFromSupabase()
              .then((ok) => { if (!ok) setLoadError(true) })
              .catch(() => setLoadError(true))
              .finally(() => setSyncing(false))
          }}
          className="px-4 py-2 rounded bg-primary text-primary-foreground text-xs hover:bg-primary/90 transition-colors"
        >
          Prøv igjen
        </button>
      </div>
    )
  }

  return (
    <TooltipProvider delayDuration={300}>
      <AppLayout>
        <AppContent />
      </AppLayout>
    </TooltipProvider>
  )
}

export default App
