import { Suspense, useEffect, useState } from 'react'
import { lazyWithRetry } from '@/lib/lazyWithRetry'
import { useAppStore } from '@/store/useAppStore'
import { useNewScenario } from '@/hooks/useNewScenario'
import { useAllCalculations } from '@/hooks/useCalculator'
import { useIsMobile } from '@/hooks/useIsMobile'
import { ScenarioFormPanel } from '@/components/calculator/ScenarioFormPanel'
import { ResultsPanel } from '@/components/calculator/ResultsPanel'
import { Button } from '@/components/ui/button'
import { Plus, Calculator, FileInput, BarChart2, BarChart3, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

const ScenarioComparison = lazyWithRetry(() =>
  import('@/components/scenarios/ScenarioComparison').then((m) => ({ default: m.ScenarioComparison }))
)
const SettingsPanel = lazyWithRetry(() =>
  import('@/components/settings/SettingsPanel').then((m) => ({ default: m.SettingsPanel }))
)

type CalcTab = 'kalkulator' | 'sammenligning' | 'innstillinger'

function CalcSubNav({ tab, setTab }: { tab: CalcTab; setTab: (t: CalcTab) => void }) {
  const items: { id: CalcTab; label: string; Icon: React.FC<{ className?: string }> }[] = [
    { id: 'kalkulator',    label: 'Kalkulator',    Icon: Calculator },
    { id: 'sammenligning', label: 'Sammenligning', Icon: BarChart3 },
    { id: 'innstillinger', label: 'Innstillinger', Icon: Settings },
  ]
  return (
    <div className="flex border-b border-border shrink-0 bg-card px-2">
      {items.map(({ id, label, Icon }) => (
        <button
          key={id}
          onClick={() => setTab(id)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors',
            tab === id
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          <Icon className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  )
}

function EmptyState() {
  const { createScenario } = useNewScenario()
  const rules = useAppStore((s) => s.config.lendingRules)
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 text-center px-6">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20">
        <Calculator className="h-8 w-8 text-primary" />
      </div>
      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-foreground">Kom i gang</h2>
        <p className="text-sm text-muted-foreground max-w-xs">
          Start et nytt scenario for å analysere boliglånet ditt mot gjeldende utlånsregler.
        </p>
      </div>
      <Button onClick={createScenario} className="gap-2">
        <Plus className="h-4 w-4" />
        Start nytt scenario
      </Button>
      <div className="grid grid-cols-3 gap-4 text-center text-xs text-muted-foreground max-w-sm">
        <div className="space-y-1">
          <p className="font-semibold text-foreground">{rules.minEquityPercent}% EK-krav</p>
          <p>Utlånsforskriften</p>
        </div>
        <div className="space-y-1">
          <p className="font-semibold text-foreground">{rules.maxDebtRatio}× gjeldsgrad</p>
          <p>Maks gjeld / inntekt</p>
        </div>
        <div className="space-y-1">
          <p className="font-semibold text-foreground">+{rules.stressTestAddition}% stresstest</p>
          <p>Min {rules.minStressTestRate}% stressrente</p>
        </div>
      </div>
    </div>
  )
}

/** Mobil-layout: tabs for å bytte mellom inndata og resultater */
function MobileLayout({ scenarioId }: { scenarioId: string }) {
  const scenarios = useAppStore((s) => s.scenarios)
  const scenario = scenarios.find((s) => s.id === scenarioId)
  const [tab, setTab] = useState<'input' | 'results'>('input')

  if (!scenario) return null

  return (
    <div className="flex flex-col h-full">
      {/* Mobil tab-bar */}
      <div className="flex border-b border-border shrink-0">
        <button
          className={cn(
            'flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium border-b-2 transition-colors',
            tab === 'input'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground'
          )}
          onClick={() => setTab('input')}
        >
          <FileInput className="h-4 w-4" />
          Inndata
        </button>
        <button
          className={cn(
            'flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium border-b-2 transition-colors',
            tab === 'results'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground'
          )}
          onClick={() => setTab('results')}
        >
          <BarChart2 className="h-4 w-4" />
          Resultater
        </button>
      </div>

      <div className="flex-1 overflow-hidden">
        {tab === 'input' ? (
          <ScenarioFormPanel key={scenario.id} scenario={scenario} />
        ) : (
          <ResultsPanel scenarioId={scenarioId} />
        )}
      </div>
    </div>
  )
}

export function CalculatorPage() {
  const scenarios = useAppStore((s) => s.scenarios)
  const activeId = useAppStore((s) => s.activeScenarioId)
  const setActive = useAppStore((s) => s.setActiveScenario)
  const { createScenario } = useNewScenario()
  const isMobile = useIsMobile()
  const [tab, setTab] = useState<CalcTab>('kalkulator')

  useAllCalculations()

  const activeScenario = scenarios.find((s) => s.id === activeId)

  useEffect(() => {
    if (!activeId && scenarios.length > 0) setActive(scenarios[0].id)
  }, [activeId, scenarios, setActive])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <CalcSubNav tab={tab} setTab={setTab} />

      <div className="flex-1 overflow-hidden">
        {tab === 'sammenligning' && (
          <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-muted-foreground">Laster…</div>}>
            <ScenarioComparison />
          </Suspense>
        )}

        {tab === 'innstillinger' && (
          <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-muted-foreground">Laster…</div>}>
            <SettingsPanel />
          </Suspense>
        )}

        {tab === 'kalkulator' && (
          <>
            {scenarios.length === 0 ? (
              <EmptyState />
            ) : !activeScenario ? (
              <div className="flex items-center justify-center h-full">
                <Button onClick={createScenario} variant="outline" className="gap-2">
                  <Plus className="h-4 w-4" />
                  Velg eller opprett et scenario
                </Button>
              </div>
            ) : isMobile ? (
              <MobileLayout scenarioId={activeScenario.id} />
            ) : (
              <div className="flex h-full overflow-hidden">
                <div className="w-[380px] shrink-0 border-r border-border overflow-hidden flex flex-col">
                  <ScenarioFormPanel key={activeScenario.id} scenario={activeScenario} />
                </div>
                <div className="flex-1 overflow-hidden">
                  <ResultsPanel scenarioId={activeScenario.id} />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
