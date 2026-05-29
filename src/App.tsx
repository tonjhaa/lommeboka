import { lazy, Suspense, useEffect, useState, type ComponentType } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { MainNav } from '@/components/layout/MainNav'
import { CalculatorPage } from '@/pages/CalculatorPage'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAppStore } from '@/store/useAppStore'
import { useAuthStore } from '@/store/useAuthStore'
import { usePartnershipStore } from '@/store/usePartnershipStore'
import { LoginPage } from '@/pages/LoginPage'
import { loadFromSupabase, startAutoSync } from '@/lib/syncEconomyData'
import { useEconomyStore } from '@/application/useEconomyStore'

const EconomyPage = lazy(() =>
  import('@/pages/economy/EconomyPage').then((m) => ({
    default: m.EconomyPage,
  }))
)

const VeikartPage = lazy(() =>
  import('@/pages/economy/VeikartPage').then((m) => ({
    default: m.VeikartPage,
  }))
)

const TaxCalculatorPage = lazy(() =>
  import('@/pages/TaxCalculatorPage').then((m) => ({
    default: m.TaxCalculatorPage as ComponentType,
  }))
)

const PartnerPage = lazy(() =>
  import('@/pages/economy/PartnerPage').then((m) => ({ default: m.PartnerPage }))
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
      </div>
    </div>
  )
}

function App() {
  const { user, initialized, initialize } = useAuthStore()
  const restoreProfileFromSlips = useEconomyStore((s) => s.restoreProfileFromSlips)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    initialize()
  }, [initialize])

  // Gjenoppbygg lønnsprofil fra importerte slipper om profil mangler (datamigrasjon)
  useEffect(() => {
    restoreProfileFromSlips()
  }, [restoreProfileFromSlips])

  useEffect(() => {
    if (!user) return

    setSyncing(true)
    loadFromSupabase().finally(() => setSyncing(false))

    const stopSync = startAutoSync()

    // Initialiser partnerskap og håndter eventuelle invite-lenker
    const initPartnership = async () => {
      const params = new URLSearchParams(window.location.search)
      const inviteId = params.get('invite')
      if (inviteId) {
        await usePartnershipStore.getState().accept(inviteId)
        // Fjern ?invite= fra URL uten reload
        const url = new URL(window.location.href)
        url.searchParams.delete('invite')
        window.history.replaceState({}, '', url.toString())
      } else {
        await usePartnershipStore.getState().initialize()
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

  return (
    <TooltipProvider delayDuration={300}>
      <AppLayout>
        <AppContent />
      </AppLayout>
    </TooltipProvider>
  )
}

export default App
