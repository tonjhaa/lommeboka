import { lazy, Suspense, useState } from 'react'

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
import {
  LayoutDashboard, Receipt, Palmtree, Clipboard,
  PiggyBank, CreditCard, FileText, TrendingUp, Users,
} from 'lucide-react'
import { useEconomyStore } from '@/application/useEconomyStore'
import { EconomyStoreProvider } from '@/contexts/EconomyStoreContext'
import { usePartnershipStore } from '@/store/usePartnershipStore'
import { PartnerLinkSection } from '@/components/PartnerLinkSection'
import { cn } from '@/lib/utils'

// Reuse the exact same page components as the user's own Economy tabs
const EconomyDashboard = lazyWithRetry(() =>
  import('./EconomyDashboard').then((m) => ({ default: m.EconomyDashboard }))
)
const SalaryPage = lazy(() =>
  import('./SalaryPage').then((m) => ({ default: m.SalaryPage }))
)
const FeriepengePage = lazy(() =>
  import('./FeriepengePage').then((m) => ({ default: m.FeriepengePage }))
)
const BudgetPage = lazy(() =>
  import('./BudgetPage').then((m) => ({ default: m.BudgetPage }))
)
const SavingsPage = lazy(() =>
  import('./SavingsPage').then((m) => ({ default: m.SavingsPage }))
)
const DebtPage = lazy(() =>
  import('./DebtPage').then((m) => ({ default: m.DebtPage }))
)
const AbsencePage = lazy(() =>
  import('./AbsencePage').then((m) => ({ default: m.AbsencePage }))
)
const TaxSettlementPage = lazy(() =>
  import('./TaxSettlementPage').then((m) => ({ default: m.TaxSettlementPage }))
)

type Tab = 'dashbord' | 'lonn' | 'feriepenger' | 'budsjett' | 'sparing' | 'gjeld' | 'fravaer' | 'skatt'

const TABS: { key: Tab; label: string; Icon: React.FC<{ className?: string }> }[] = [
  { key: 'dashbord',    label: 'Dashbord',    Icon: LayoutDashboard },
  { key: 'lonn',        label: 'Lønn',        Icon: Receipt },
  { key: 'feriepenger', label: 'Feriepenger', Icon: Palmtree },
  { key: 'budsjett',    label: 'Budsjett',    Icon: Clipboard },
  { key: 'sparing',     label: 'Sparing',     Icon: PiggyBank },
  { key: 'gjeld',       label: 'Gjeld',       Icon: CreditCard },
  { key: 'fravaer',     label: 'Fravær',      Icon: FileText },
  { key: 'skatt',       label: 'Skatt',       Icon: TrendingUp },
]

function PageFallback() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      Laster…
    </div>
  )
}

export function PartnerPage() {
  const partnerVeikart = useEconomyStore((s) => s.partnerVeikart)
  const setPartnerVeikart = useEconomyStore((s) => s.setPartnerVeikart)
  const [tab, setTab] = useState<Tab>('dashbord')
  const status = usePartnershipStore((s) => s.status)

  // Auto-aktiver første gang
  if (!partnerVeikart.enabled) {
    setPartnerVeikart({ ...partnerVeikart, enabled: true })
  }

  // Ikke koblet — vis invitasjonsskjerm
  if (status !== 'connected') {
    return (
      <div className="flex flex-col items-center justify-center h-full py-16 px-6">
        <div className="w-full max-w-sm space-y-6">
          <div className="flex flex-col items-center text-center gap-3">
            <div className="h-12 w-12 rounded-full bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
              <Users className="h-5 w-5 text-violet-400" />
            </div>
            <div>
              <p className="font-semibold text-sm">Koble til partner</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                Del økonomidata med partneren din og se hverandres tall i sanntid.
              </p>
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <PartnerLinkSection />
          </div>
        </div>
      </div>
    )
  }

  return (
    // All child pages read from usePartnerStore via the context
    <EconomyStoreProvider store="partner">
      <div className="flex flex-col h-full overflow-hidden">
        {/* Sub-nav */}
        <nav className="flex items-center gap-1 border-b border-border bg-card px-3 shrink-0 overflow-x-auto">
          {TABS.map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap shrink-0',
                tab === key
                  ? 'border-violet-400 text-violet-400'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
          <div className="ml-auto pl-3 text-xs text-violet-400/60 font-medium shrink-0">
            {partnerVeikart.employer || 'Partner'}
          </div>
        </nav>

        {/* Innhold — bruker de faktiske side-komponentene via partner-store */}
        <div className="flex-1 overflow-hidden">
          <Suspense fallback={<PageFallback />}>
            {tab === 'dashbord'    && <EconomyDashboard onNavigate={(p) => setTab(p as Tab)} />}
            {tab === 'lonn'        && <SalaryPage />}
            {tab === 'feriepenger' && <FeriepengePage />}
            {tab === 'budsjett'    && <BudgetPage />}
            {tab === 'sparing'     && <SavingsPage />}
            {tab === 'gjeld'       && <DebtPage />}
            {tab === 'fravaer'     && <AbsencePage />}
            {tab === 'skatt'       && <TaxSettlementPage />}
          </Suspense>
        </div>
      </div>
    </EconomyStoreProvider>
  )
}
