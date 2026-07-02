import { useState } from 'react'
import {
  Shield, Briefcase, PiggyBank, BarChart2, CreditCard,
  FileText, TrendingUp, RefreshCw, HeartPulse, Umbrella,
  Palmtree, CheckCircle2, ArrowRight, ChevronLeft, Map, Gift, Baby, Landmark, SlidersHorizontal,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useEconomyStore } from '@/application/useEconomyStore'
import type { EconomyTab, UserPreferences } from '@/types/economy'

// ------------------------------------------------------------
// Tab module definitions
// ------------------------------------------------------------

interface ModuleOption {
  tab: EconomyTab
  label: string
  desc: string
  icon: React.FC<{ className?: string }>
  defaultFor: ('forsvaret' | 'custom')[]
}

export const ALWAYS_ENABLED: EconomyTab[] = ['dashboard', 'budget', 'salary', 'settings']

export const MODULES: ModuleOption[] = [
  {
    tab: 'feriepenger',
    label: 'Feriepenger',
    desc: 'Prognose for juni og desember',
    icon: Palmtree,
    defaultFor: ['forsvaret', 'custom'],
  },
  {
    tab: 'savings',
    label: 'Sparing',
    desc: 'BSU, sparekonto og renteprognoser',
    icon: PiggyBank,
    defaultFor: ['forsvaret', 'custom'],
  },
  {
    tab: 'fond',
    label: 'Fond',
    desc: 'Portefølje med live kurspriser',
    icon: BarChart2,
    defaultFor: ['custom'],
  },
  {
    tab: 'debt',
    label: 'Gjeld',
    desc: 'Studielån, boliglån og avdragsplan',
    icon: CreditCard,
    defaultFor: ['forsvaret', 'custom'],
  },
  {
    tab: 'tax',
    label: 'Skatteoppgjør',
    desc: 'Prognose og historikk for skatteoppgjør',
    icon: TrendingUp,
    defaultFor: ['forsvaret', 'custom'],
  },
  {
    tab: 'atf',
    label: 'ATF',
    desc: 'Avtalefestet tillegg og variable tillegg',
    icon: Shield,
    defaultFor: ['forsvaret'],
  },
  {
    tab: 'pension',
    label: 'Pensjon',
    desc: 'Pensjonsprognose: folketrygd, SPK og AFP',
    icon: Landmark,
    defaultFor: ['forsvaret'],
  },
  {
    tab: 'absence',
    label: 'Fravær',
    desc: 'Sykefravær, permisjon og 24-dagersregel',
    icon: FileText,
    defaultFor: ['forsvaret'],
  },
  {
    tab: 'subscriptions',
    label: 'Abonnement & forsikring',
    desc: 'Oversikt over faste abonnement',
    icon: RefreshCw,
    defaultFor: ['custom'],
  },
  {
    tab: 'vacation',
    label: 'Ferieplanning',
    desc: 'Nedtelling til neste ferie',
    icon: Umbrella,
    defaultFor: ['forsvaret', 'custom'],
  },
  {
    tab: 'ivf',
    label: 'Delt prosjekt',
    desc: 'Felles sparing og økonomi med partner',
    icon: HeartPulse,
    defaultFor: [],
  },
  {
    tab: 'veikart',
    label: 'Boligveikart',
    desc: 'Fremtidsplaner og kjøpekraftprognose',
    icon: Map,
    defaultFor: ['forsvaret', 'custom'],
  },
  {
    tab: 'scenario',
    label: 'Simulator',
    desc: 'Hva-skjer-hvis: lønn, rente, sparing, engangsbeløp',
    icon: SlidersHorizontal,
    defaultFor: ['forsvaret', 'custom'],
  },
  {
    tab: 'gaver',
    label: 'Gaveplanlegger',
    desc: 'Planlegg og fordel gaveutgifter gjennom året',
    icon: Gift,
    defaultFor: ['forsvaret', 'custom'],
  },
  {
    tab: 'permisjon',
    label: 'Permisjon',
    desc: 'Planlegg foreldrepermisjon og se lønnsutfall',
    icon: Baby,
    defaultFor: [],
  },
]
// Forbruk og Treffsikkerhet ligger nå som visninger i Budsjett, og Formue over
// tid som detaljvisning på Dashbord — de er ikke lenger egne moduler.

// ------------------------------------------------------------
// Step components
// ------------------------------------------------------------

type Employer = 'forsvaret' | 'custom'

function StepEmployer({
  value,
  onChange,
}: {
  value: Employer | null
  onChange: (e: Employer) => void
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Hva passer best for deg?</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Vi tilpasser modulene og beregningene etter dette. Du kan endre det senere.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {([
          { key: 'forsvaret' as Employer, label: 'Offentlig / spesialstilling', desc: 'Inkluderer ATF, fraværsmodul og offentlig tjenestepensjon', icon: Shield },
          { key: 'custom' as Employer, label: 'Privat arbeidsgiver', desc: 'Privat sektor, frilanser eller selvstendig næringsdrivende', icon: Briefcase },
        ] as const).map(({ key, label, desc, icon: Icon }) => (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={cn(
              'flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all',
              value === key
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-border/80 hover:bg-muted/30'
            )}
          >
            <div className={cn(
              'shrink-0 h-9 w-9 rounded-lg flex items-center justify-center mt-0.5',
              value === key ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
            )}>
              <Icon className="h-4.5 w-4.5 h-5 w-5" />
            </div>
            <div>
              <p className="font-medium text-sm">{label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
            </div>
            {value === key && (
              <CheckCircle2 className="h-4 w-4 text-primary ml-auto shrink-0 mt-0.5" />
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

function StepModules({
  employer,
  selected,
  onToggle,
}: {
  employer: Employer
  selected: Set<EconomyTab>
  onToggle: (tab: EconomyTab) => void
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Hva vil du følge med på?</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Du kan alltid endre dette senere under Innstillinger.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {MODULES.map(({ tab, label, desc, icon: Icon, defaultFor }) => {
          const active = selected.has(tab)
          const isDefault = defaultFor.includes(employer)
          return (
            <button
              key={tab}
              onClick={() => onToggle(tab)}
              className={cn(
                'flex items-start gap-3 p-3 rounded-lg border text-left transition-all',
                active
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:bg-muted/30'
              )}
            >
              <div className={cn(
                'shrink-0 h-7 w-7 rounded-md flex items-center justify-center mt-0.5',
                active ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
              )}>
                <Icon className="h-3.5 w-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-medium">{label}</p>
                  {isDefault && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary leading-none">
                      anbefalt
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
              </div>
              <div className={cn(
                'shrink-0 h-4 w-4 rounded border-2 mt-1 flex items-center justify-center',
                active ? 'border-primary bg-primary' : 'border-muted-foreground/40'
              )}>
                {active && <span className="text-primary-foreground text-[10px] leading-none">✓</span>}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function StepDone({ enabledCount }: { enabledCount: number }) {
  return (
    <div className="space-y-6 text-center py-4">
      <div className="flex justify-center">
        <div className="h-16 w-16 rounded-full bg-green-500/15 flex items-center justify-center">
          <CheckCircle2 className="h-8 w-8 text-green-500" />
        </div>
      </div>
      <div>
        <h2 className="text-xl font-semibold">Du er klar!</h2>
        <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">
          Du har satt opp {enabledCount} moduler. Dashbordet viser det som er relevant for deg.
        </p>
      </div>
      <div className="text-sm text-muted-foreground space-y-1.5 max-w-xs mx-auto text-left bg-muted/30 rounded-lg p-4">
        <p className="font-medium text-foreground">Neste steg:</p>
        <p>1. Last opp en lønnsslipp under <strong>Lønn</strong></p>
        <p>2. Legg til sparekonto under <strong>Sparing</strong></p>
        <p>3. Registrer faste utgifter under <strong>Budsjett</strong></p>
      </div>
    </div>
  )
}

// ------------------------------------------------------------
// Main wizard
// ------------------------------------------------------------

export function OnboardingWizard() {
  const setUserPreferences = useEconomyStore((s) => s.setUserPreferences)

  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [employer, setEmployer] = useState<Employer | null>(null)
  const [selectedTabs, setSelectedTabs] = useState<Set<EconomyTab>>(new Set())

  function handleEmployerSelect(e: Employer) {
    setEmployer(e)
    // Pre-select defaults for this employer
    const defaults = MODULES
      .filter((m) => m.defaultFor.includes(e))
      .map((m) => m.tab)
    setSelectedTabs(new Set(defaults))
  }

  function toggleTab(tab: EconomyTab) {
    setSelectedTabs((prev) => {
      const next = new Set(prev)
      if (next.has(tab)) next.delete(tab)
      else next.add(tab)
      return next
    })
  }

  function finish() {
    const enabledTabs: EconomyTab[] = [
      ...ALWAYS_ENABLED,
      ...Array.from(selectedTabs),
    ]
    const prefs: UserPreferences = {
      onboardingCompleted: true,
      enabledTabs,
    }
    setUserPreferences(prefs)
  }

  const canProceed = step === 1 ? employer !== null : true
  const totalModules = ALWAYS_ENABLED.length + selectedTabs.size

  return (
    <div className="min-h-full flex items-start justify-center p-6 pt-12">
      <div className="w-full max-w-xl">

        {/* Progress */}
        <div className="flex items-center gap-2 mb-8">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={cn(
                'h-1.5 flex-1 rounded-full transition-colors',
                s <= step ? 'bg-primary' : 'bg-muted'
              )}
            />
          ))}
        </div>

        {/* Step content */}
        <div className="min-h-[320px]">
          {step === 1 && (
            <StepEmployer value={employer} onChange={handleEmployerSelect} />
          )}
          {step === 2 && employer && (
            <StepModules employer={employer} selected={selectedTabs} onToggle={toggleTab} />
          )}
          {step === 3 && (
            <StepDone enabledCount={totalModules} />
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8 pt-4 border-t border-border">
          <button
            onClick={() => setStep((s) => Math.max(1, s - 1) as 1 | 2 | 3)}
            className={cn(
              'flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors',
              step === 1 && 'invisible'
            )}
          >
            <ChevronLeft className="h-4 w-4" />
            Tilbake
          </button>

          <p className="text-xs text-muted-foreground">Steg {step} av 3</p>

          {step < 3 ? (
            <Button
              size="sm"
              disabled={!canProceed}
              onClick={() => setStep((s) => Math.min(3, s + 1) as 1 | 2 | 3)}
              className="gap-1.5"
            >
              Neste
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button size="sm" onClick={finish} className="gap-1.5">
              Gå til dashbord
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
