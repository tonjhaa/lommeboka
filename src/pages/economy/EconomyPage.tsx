import { Suspense, Component, useEffect } from 'react'
import type { ReactNode } from 'react'
import { lazyWithRetry } from '@/lib/lazyWithRetry'
import { useEconomyStore } from '@/application/useEconomyStore'
import { useAppStore } from '@/store/useAppStore'
import type { EconomySubPage } from '@/store/useAppStore'
import { OnboardingWizard } from './OnboardingWizard'

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
const PensionPage = lazyWithRetry(() =>
  import('./PensionPage').then((m) => ({ default: m.PensionPage }))
)
const ScenarioPage = lazyWithRetry(() =>
  import('./ScenarioPage').then((m) => ({ default: m.ScenarioPage }))
)

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

// Sider denne komponenten faktisk kan rendre. Ukjente/utdaterte persisted-verdier
// faller tilbake til dashbordet i stedet for blank side.
const KNOWN_PAGES: ReadonlySet<EconomySubPage> = new Set<EconomySubPage>([
  'dashboard', 'budget', 'salary', 'atf', 'savings', 'fond', 'debt', 'absence',
  'tax', 'subscriptions', 'feriepenger', 'vacation', 'veikart', 'pension',
  'gaver', 'scenario', 'settings',
])

export function EconomyPage() {
  const userPreferences = useEconomyStore((s) => s.userPreferences)
  const hasData = useEconomyStore((s) => s.savingsAccounts.length > 0 || s.monthHistory.length > 0 || s.debts.length > 0 || s.profile !== null)
  const currentPage = useAppStore((s) => s.currentEconomyPage)

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

  const page: EconomySubPage = KNOWN_PAGES.has(currentPage) ? currentPage : 'dashboard'

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-hidden">
        <PageErrorBoundary>
        <Suspense fallback={<PageFallback />}>
          {page === 'dashboard' && (
            <EconomyDashboard onNavigate={(p) => useAppStore.getState().setCurrentEconomyPage(p as EconomySubPage)} />
          )}
          {page === 'budget' && <BudgetPage />}
          {page === 'salary' && <SalaryPage />}
          {page === 'atf' && <ATFPage />}
          {(page === 'savings' || page === 'fond') && <SavingsPage />}
          {page === 'debt' && <DebtPage />}
          {page === 'absence' && <AbsencePage />}
          {page === 'tax' && <TaxSettlementPage />}
          {page === 'subscriptions' && <SubscriptionsPage />}
          {page === 'feriepenger' && <FeriepengePage />}
          {page === 'vacation' && <VacationPage />}
          {page === 'veikart' && <VeikartPage />}
          {page === 'pension' && <PensionPage />}
          {page === 'gaver' && <GiftPage />}
          {page === 'scenario' && <ScenarioPage />}
          {page === 'settings' && <EconomySettingsPage />}
        </Suspense>
        </PageErrorBoundary>
      </div>
    </div>
  )
}
