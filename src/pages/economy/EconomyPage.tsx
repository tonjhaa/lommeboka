import { lazy, Suspense, Component, useEffect } from 'react'
import type { ReactNode } from 'react'

/* Auto-reload ved stale cache etter ny deploy (Failed to fetch dynamically imported module).
 * Prøver å laste én ekstra gang, deretter gir opp og viser feilmelding.  */
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
import { useEconomyStore } from '@/application/useEconomyStore'
import { useAppStore } from '@/store/useAppStore'
import type { EconomySubPage } from '@/store/useAppStore'
import { OnboardingWizard } from './OnboardingWizard'
import {
  LayoutDashboard,
  CreditCard,
  TrendingUp,
  Shield,
  Receipt,
  PiggyBank,
  Clipboard,
  FileText,
  RefreshCw,
  Palmtree,
  Umbrella,
  Map,
  Gift,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const EconomyDashboard = lazyWithRetry(() =>
  import('./EconomyDashboard').then((m) => ({ default: m.EconomyDashboard }))
)
const BudgetPage = lazyWithRetry(() =>
  import('./BudgetPage').then((m) => ({ default: m.BudgetPage }))
)
const SalaryPage = lazyWithRetry(() =>
  import('./SalaryPage').then((m) => ({ default: m.SalaryPage }))
)
const ATFPage = lazyWithRetry(() =>
  import('./ATFPage').then((m) => ({ default: m.ATFPage }))
)
const SavingsPage = lazyWithRetry(() =>
  import('./SavingsPage').then((m) => ({ default: m.SavingsPage }))
)
const DebtPage = lazyWithRetry(() =>
  import('./DebtPage').then((m) => ({ default: m.DebtPage }))
)
const AbsencePage = lazyWithRetry(() =>
  import('./AbsencePage').then((m) => ({ default: m.AbsencePage }))
)
const TaxSettlementPage = lazyWithRetry(() =>
  import('./TaxSettlementPage').then((m) => ({ default: m.TaxSettlementPage }))
)
const SubscriptionsPage = lazyWithRetry(() =>
  import('./SubscriptionsPage').then((m) => ({ default: m.SubscriptionsPage }))
)
const FeriepengePage = lazyWithRetry(() =>
  import('./FeriepengePage').then((m) => ({ default: m.FeriepengePage }))
)
const VacationPage = lazyWithRetry(() =>
  import('./VacationPage').then((m) => ({ default: m.VacationPage }))
)
const EconomySettingsPage = lazyWithRetry(() =>
  import('./EconomySettingsPage').then((m) => ({ default: m.EconomySettingsPage }))
)
const VeikartPage = lazyWithRetry(() =>
  import('./VeikartPage').then((m) => ({ default: m.VeikartPage }))
)
const GiftPage = lazyWithRetry(() =>
  import('./GiftPage').then((m) => ({ default: m.GiftPage }))
)

interface NavItem {
  page: EconomySubPage
  label: string
  Icon: React.FC<{ className?: string }>
}

const NAV_ITEMS: NavItem[] = [
  { page: 'dashboard', label: 'Dashbord', Icon: LayoutDashboard },
  { page: 'budget', label: 'Budsjett', Icon: Clipboard },
  { page: 'salary', label: 'Lønn', Icon: Receipt },
  { page: 'atf', label: 'ATF', Icon: Shield },
  { page: 'feriepenger', label: 'Feriepenger', Icon: Palmtree },
  { page: 'savings', label: 'Sparing', Icon: PiggyBank },
  { page: 'debt', label: 'Gjeld', Icon: CreditCard },
  { page: 'absence', label: 'Fravær', Icon: FileText },
  { page: 'tax', label: 'Skatt', Icon: TrendingUp },
  { page: 'subscriptions', label: 'Abo & Fors.', Icon: RefreshCw },
  { page: 'vacation', label: 'Ferie', Icon: Umbrella },
  { page: 'veikart', label: 'Veikart', Icon: Map },
  { page: 'gaver', label: 'Gaver', Icon: Gift },
]

function PageFallback() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      Laster…
    </div>
  )
}

class PageErrorBoundary extends Component<
  { children: ReactNode },
  { error: string | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(err: unknown) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
  render() {
    if (this.state.error) {
      const isStaleChunk = this.state.error.includes('Failed to fetch dynamically imported module')
        || this.state.error.includes('Importing a module script failed')
      return (
        <div className="flex flex-col h-full items-center justify-center gap-3 p-6 text-center">
          {isStaleChunk ? (
            <>
              <p className="text-sm font-medium">Ny versjon tilgjengelig</p>
              <p className="text-xs text-muted-foreground max-w-xs">
                Siden er oppdatert siden du åpnet den. Last inn på nytt for å få den nyeste versjonen.
              </p>
              <button
                className="mt-1 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                onClick={() => window.location.reload()}
              >
                Last inn på nytt
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-red-400">Noe gikk galt</p>
              <p className="text-xs text-muted-foreground font-mono">{this.state.error}</p>
              <button
                className="text-xs underline text-muted-foreground hover:text-foreground"
                onClick={() => this.setState({ error: null })}
              >
                Prøv igjen
              </button>
            </>
          )}
        </div>
      )
    }
    return this.props.children
  }
}

export function EconomyPage() {
  const userPreferences = useEconomyStore((s) => s.userPreferences)
  const hasData = useEconomyStore((s) => s.savingsAccounts.length > 0 || s.monthHistory.length > 0 || s.debts.length > 0 || s.profile !== null)
  const currentPage = useAppStore((s) => s.currentEconomyPage)
  const setCurrentPage = useAppStore((s) => s.setCurrentEconomyPage)

  // Re-parse lagrede slipper automatisk når parserlogikken er oppdatert
  useEffect(() => {
    import('@/features/payslip/reparseSlips').then(({ SLIP_PARSER_VERSION, reparseAllSlips }) => {
      if (useEconomyStore.getState().slipParserVersion >= SLIP_PARSER_VERSION) return
      void reparseAllSlips()
    })
  }, [])

  // Vis onboarding kun for reelt nye brukere uten noen data
  if (!userPreferences?.onboardingCompleted && !hasData) {
    return (
      <div className="flex-1 overflow-y-auto h-full">
        <OnboardingWizard />
      </div>
    )
  }

  const enabledPages = new Set(userPreferences?.enabledTabs ?? [])
  const visibleNavItems = NAV_ITEMS.filter(
    ({ page }) => enabledPages.has(page) || page === 'settings'
  )

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Sub-navigasjon */}
      <nav className="flex items-center gap-1 border-b border-border bg-card px-3 shrink-0 overflow-x-auto">
        {visibleNavItems.map(({ page, label, Icon }) => (
          <button
            key={page}
            onClick={() => setCurrentPage(page)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap shrink-0',
              currentPage === page
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </nav>

      {/* Sideinnhold */}
      <div className="flex-1 overflow-hidden">
        <PageErrorBoundary>
        <Suspense fallback={<PageFallback />}>
          {currentPage === 'dashboard' && (
            <EconomyDashboard onNavigate={(p) => setCurrentPage(p as EconomySubPage)} />
          )}
          {currentPage === 'budget' && <BudgetPage />}
          {currentPage === 'salary' && <SalaryPage />}
          {currentPage === 'atf' && <ATFPage />}
          {(currentPage === 'savings' || currentPage === 'fond') && <SavingsPage />}
          {currentPage === 'debt' && <DebtPage />}
          {currentPage === 'absence' && <AbsencePage />}
          {currentPage === 'tax' && <TaxSettlementPage />}
          {currentPage === 'subscriptions' && <SubscriptionsPage />}
          {currentPage === 'feriepenger' && <FeriepengePage />}
          {currentPage === 'vacation' && <VacationPage />}
          {currentPage === 'veikart' && <VeikartPage />}
          {currentPage === 'gaver' && <GiftPage />}
          {currentPage === 'settings' && <EconomySettingsPage />}
        </Suspense>
        </PageErrorBoundary>
      </div>
    </div>
  )
}
