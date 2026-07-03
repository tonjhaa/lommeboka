import { Suspense, useState } from 'react'
import { lazyWithRetry } from '@/lib/lazyWithRetry'
import { useCalculator } from '@/hooks/useCalculator'
import { useAppStore } from '@/store/useAppStore'
import { StatusBanner, RuleMessageList } from './StatusBanner'
import {
  EquityCard,
  DebtRatioCard,
  AffordabilityCard,
  MaxPurchaseCard,
} from './AnalysisCards'
import { AffordabilityPathCard } from './AffordabilityPathCard'
import { DistributionPlanSection } from './DistributionPlanCard'
import { Separator } from '@/components/ui/separator'
import { NumberInput } from '@/components/ui/number-input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { HelpTooltip } from '@/components/ui/help-tooltip'
import { BarChart2, Table2, ChevronDown, ChevronUp, Zap } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { buildAmortizationPlanWithSimulator } from '@/utils/amortization'
import { calcAcquisitionFees, calcEffectiveEquity, calcTotalPropertyValue } from '@/utils/property'
import { effectiveRate } from '@/utils/loan'

const AmortizationChart = lazyWithRetry(() =>
  import('@/components/charts/AmortizationChart').then((m) => ({ default: m.AmortizationChart }))
)
const AmortizationTable = lazyWithRetry(() =>
  import('@/components/charts/AmortizationTable').then((m) => ({ default: m.AmortizationTable }))
)

function LoadingFallback() {
  return (
    <div className="flex h-48 items-center justify-center text-xs text-muted-foreground">
      Laster graf...
    </div>
  )
}

interface Props { scenarioId: string }

export function ResultsPanel({ scenarioId }: Props) {
  const { analysis, amortization } = useCalculator(scenarioId)
  const distributionPlans = useAppStore((s) => s.distributionPlans)
  const scenarios = useAppStore((s) => s.scenarios)
  const config = useAppStore((s) => s.config)

  const [showMessages, setShowMessages]         = useState(false)
  const [amortView, setAmortView]               = useState<'chart' | 'table'>('chart')
  const [showAmortization, setShowAmortization] = useState(true)
  const [showSimulator, setShowSimulator]       = useState(false)

  // Renteendring-simulator (lokal state)
  const [rateChangeEnabled, setRateChangeEnabled] = useState(false)
  const [rateChangeMonth, setRateChangeMonth]     = useState(60)
  const [newRate, setNewRate]                     = useState(6.0)

  // Ekstra innbetaling-simulator (lokal state)
  const [extraPayEnabled, setExtraPayEnabled]   = useState(false)
  const [extraPayMonth, setExtraPayMonth]       = useState(12)
  const [extraPayAmount, setExtraPayAmount]     = useState(100_000)
  const [extraPayStrategy, setExtraPayStrategy] = useState<'shorten' | 'reduce'>('shorten')
  const [extraPayRecurring, setExtraPayRecurring] = useState(false)

  // Avdragsfrihet-simulator (lokal state)
  const [interestOnlyEnabled, setInterestOnlyEnabled] = useState(false)
  const [interestOnlyYears, setInterestOnlyYears]     = useState(2)

  if (!analysis) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Beregner...
      </div>
    )
  }

  const scenario       = scenarios.find((s) => s.id === scenarioId)
  const distribution   = distributionPlans[scenarioId]
  const hasMessages    = analysis.status.messages.filter(
    (m) => m.severity === 'error' || m.severity === 'warning'
  ).length > 0

  // Bygg simulert amortiseringsplan lokalt (påvirker ikke Zustand)
  const simActive = rateChangeEnabled || extraPayEnabled || interestOnlyEnabled
  let simAmortization = amortization
  if (amortization && simActive) {
    const { property, loanParameters } = scenario ?? {}
    if (property && loanParameters) {
      const totalPropertyValue = calcTotalPropertyValue(property)
      const fees = calcAcquisitionFees(
        property.price,
        config.fees,
        property.ownershipType,
        loanParameters.financeAllFees ?? false
      )
      const effectiveEquity = calcEffectiveEquity(loanParameters.equity, fees.totalFees)
      const loanAmount = Math.max(
        0,
        totalPropertyValue - effectiveEquity + fees.financedFees
      )

      simAmortization = buildAmortizationPlanWithSimulator(
        scenarioId,
        loanAmount,
        loanParameters.interestRate,
        loanParameters.loanTermYears,
        loanParameters.loanType,
        rateChangeEnabled ? { fromMonth: rateChangeMonth, newRate } : undefined,
        extraPayEnabled
          ? {
              fromMonth: extraPayMonth,
              amount: extraPayAmount,
              strategy: extraPayRecurring ? 'shorten' : extraPayStrategy,
              recurring: extraPayRecurring,
            }
          : undefined,
        interestOnlyEnabled ? interestOnlyYears : undefined
      )
    }
  }

  const ownershipShare = distribution
    ? { primary: distribution.paymentSplit.primaryPercent, co: distribution.paymentSplit.coApplicantPercent ?? 0 }
    : undefined

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">

      {/* 1. Statusbanner */}
      <StatusBanner analysis={analysis} />

      {/* 2. Maks kjøpsbeløp */}
      <MaxPurchaseCard analysis={analysis} />

      {/* 3. Vei til råd — når blir boligen oppnåelig med Lommeboka-spareplanen */}
      {scenario && <AffordabilityPathCard scenario={scenario} />}

      {/* 4–6. Detaljkort (kollapsede) */}
      <details className="rounded-lg border border-border/50 bg-card/40">
        <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium hover:bg-muted/30">
          Vis detaljer
        </summary>
        <div className="space-y-3 px-3 pb-3 pt-1">
          <AffordabilityCard analysis={analysis} />
          <div className="grid grid-cols-2 gap-3">
            <EquityCard analysis={analysis} />
            <DebtRatioCard analysis={analysis} />
          </div>
        </div>
      </details>

      {/* 6. Fordelingsplan (bare ved medsøker) */}
      {distribution && <DistributionPlanSection plan={distribution} />}

      {/* 7. Regelmeldinger */}
      {hasMessages && (
        <>
          <Separator />
          <button
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full text-left"
            onClick={() => setShowMessages(!showMessages)}
          >
            {showMessages ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {showMessages ? 'Skjul' : 'Vis'} regeldetaljer
            {!showMessages && analysis.status.errorCount > 0 && (
              <span className="ml-auto bg-red-400/10 text-red-400 text-xs px-2 py-0.5 rounded-full">
                {analysis.status.errorCount} feil
              </span>
            )}
          </button>
          {showMessages && <RuleMessageList analysis={analysis} />}
        </>
      )}

      {/* 8. Amortiseringsplan */}
      {amortization && (
        <>
          <Separator />

          {/* Header */}
          <div className="flex items-center gap-2">
            <button
              className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary transition-colors flex-1 text-left"
              onClick={() => setShowAmortization(!showAmortization)}
            >
              <BarChart2 className="h-4 w-4 text-muted-foreground" />
              Nedbetalingsplan
              {showAmortization
                ? <ChevronUp className="h-4 w-4 ml-1 text-muted-foreground" />
                : <ChevronDown className="h-4 w-4 ml-1 text-muted-foreground" />}
            </button>

            {showAmortization && (
              <div className="flex items-center rounded-md border border-border overflow-hidden text-xs">
                <button
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1.5 transition-colors',
                    amortView === 'chart' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
                  )}
                  onClick={() => setAmortView('chart')}
                >
                  <BarChart2 className="h-3 w-3" /> Graf
                </button>
                <button
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1.5 border-l border-border transition-colors',
                    amortView === 'table' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
                  )}
                  onClick={() => setAmortView('table')}
                >
                  <Table2 className="h-3 w-3" /> Tabell
                </button>
              </div>
            )}
          </div>

          {showAmortization && (
            <>
              {/* Nøkkeltall for lånet */}
              {(() => {
                const plan = simAmortization ?? amortization
                if (!plan || plan.loanAmount <= 0 || plan.rows.length === 0) return null
                const effRate = effectiveRate(
                  plan.loanAmount,
                  plan.rows[0].payment,
                  plan.termMonths / 12,
                  config.fees.loanEstablishmentFee,
                  config.fees.termFee
                )
                return (
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-md border border-border/50 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                    <span>Lånebeløp <span className="font-medium text-foreground">{formatCurrency(plan.loanAmount)}</span></span>
                    <span>Total rentekostnad <span className="font-medium text-red-400/80">{formatCurrency(plan.totalInterestPaid)}</span></span>
                    <span>Totalt betalt <span className="font-medium text-foreground">{formatCurrency(plan.totalPaid)}</span></span>
                    <span className="flex items-center">
                      Effektiv rente <span className="font-medium text-foreground ml-1">{effRate.toFixed(2)} %</span>
                      <HelpTooltip content="Effektiv årlig rente inkl. etableringsgebyr og termingebyr (ÅOP)." side="top" />
                    </span>
                  </div>
                )
              })()}

              {/* Simulator-toggle */}
              <div>
                <button
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setShowSimulator(!showSimulator)}
                >
                  <Zap className="h-3.5 w-3.5" />
                  {showSimulator ? 'Skjul' : 'Vis'} hva-om-simulator
                  <HelpTooltip content="Simuler effekten av renteendring eller ekstra innbetaling. Endringene vises kun i grafen og påvirker ikke hovedberegningen." side="top" />
                </button>
              </div>

              {/* Simulator-panel */}
              {showSimulator && (
                <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-4 text-sm">

                  {/* Renteendring */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold flex items-center">
                        Renteendring
                        <HelpTooltip content="Simuler at renten endres fra en bestemt termin. Ny fast betaling beregnes automatisk basert på resterende saldo og løpetid." />
                      </Label>
                      <Switch checked={rateChangeEnabled} onCheckedChange={setRateChangeEnabled} />
                    </div>
                    {rateChangeEnabled && (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Fra termin</Label>
                          <NumberInput
                            value={rateChangeMonth}
                            onChange={(v) => setRateChangeMonth(Math.round(v))}
                            suffix="mnd"
                            min={1}
                            max={amortization.termMonths - 1}
                            step={12}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Ny rente</Label>
                          <NumberInput
                            value={newRate}
                            onChange={setNewRate}
                            suffix="%"
                            min={0.1}
                            max={20}
                            step={0.1}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <Separator />

                  {/* Ekstra innbetaling */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold flex items-center">
                        Ekstra innbetaling
                        <HelpTooltip content="Simuler en ekstra nedbetaling fra en bestemt termin. Velg om du vil forkorte løpetiden (samme terminbeløp) eller redusere terminbeløpet (samme løpetid)." />
                      </Label>
                      <Switch checked={extraPayEnabled} onCheckedChange={setExtraPayEnabled} />
                    </div>
                    {extraPayEnabled && (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">{extraPayRecurring ? 'Hver måned fra termin' : 'I termin'}</Label>
                            <NumberInput
                              value={extraPayMonth}
                              onChange={(v) => setExtraPayMonth(Math.round(v))}
                              suffix="mnd"
                              min={1}
                              max={amortization.termMonths - 1}
                              step={12}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Beløp</Label>
                            <NumberInput
                              value={extraPayAmount}
                              onChange={setExtraPayAmount}
                              suffix="kr"
                              min={500}
                              step={extraPayRecurring ? 500 : 50_000}
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Hyppighet</Label>
                            <Select
                              value={extraPayRecurring ? 'monthly' : 'once'}
                              onValueChange={(v) => {
                                const recurring = v === 'monthly'
                                setExtraPayRecurring(recurring)
                                setExtraPayAmount(recurring ? 2_000 : 100_000)
                              }}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="once">Engangsbeløp</SelectItem>
                                <SelectItem value="monthly">Fast hver måned</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          {!extraPayRecurring && (
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">Strategi</Label>
                              <Select
                                value={extraPayStrategy}
                                onValueChange={(v) => setExtraPayStrategy(v as 'shorten' | 'reduce')}
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="shorten">Forkort løpetid (samme terminbeløp)</SelectItem>
                                  <SelectItem value="reduce">Reduser terminbeløp (samme løpetid)</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                        </div>
                        {extraPayRecurring && (
                          <p className="text-[11px] text-muted-foreground">
                            Fast ekstra innbetaling forkorter løpetiden (samme terminbeløp).
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  <Separator />

                  {/* Avdragsfrihet */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold flex items-center">
                        Avdragsfrihet
                        <HelpTooltip content="Simuler avdragsfrihet fra start: du betaler kun renter i perioden, og restsaldoen nedbetales over gjenværende løpetid etterpå. Gir lavere betaling nå, men høyere total rentekostnad." />
                      </Label>
                      <Switch checked={interestOnlyEnabled} onCheckedChange={setInterestOnlyEnabled} />
                    </div>
                    {interestOnlyEnabled && (
                      <div className="space-y-1 w-40">
                        <Label className="text-xs text-muted-foreground">Antall år</Label>
                        <NumberInput
                          value={interestOnlyYears}
                          onChange={(v) => setInterestOnlyYears(Math.round(v))}
                          suffix="år"
                          min={1}
                          max={10}
                          step={1}
                        />
                      </div>
                    )}
                  </div>

                  {/* Simulator-resultat */}
                  {simActive && simAmortization && (
                    <div className="rounded-md bg-muted/50 px-3 py-2 space-y-1 text-xs">
                      {simAmortization.interestSavedByExtraPayment !== undefined &&
                        simAmortization.interestSavedByExtraPayment !== 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            {extraPayEnabled && !rateChangeEnabled && !interestOnlyEnabled ? 'Spart rente' : 'Endring i rentekostnad'}
                          </span>
                          <span className={simAmortization.interestSavedByExtraPayment > 0 ? 'text-green-400 font-medium' : 'text-red-400 font-medium'}>
                            {simAmortization.interestSavedByExtraPayment > 0 ? '−' : '+'}
                            {formatCurrency(Math.abs(simAmortization.interestSavedByExtraPayment))}
                          </span>
                        </div>
                      )}
                      {simAmortization.monthsSavedByExtraPayment !== undefined &&
                        simAmortization.monthsSavedByExtraPayment > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Spart tid</span>
                          <span className="text-green-400 font-medium">
                            {simAmortization.monthsSavedByExtraPayment} måneder kortere
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total rentekostnad (sim)</span>
                        <span className="font-medium">{formatCurrency(simAmortization.totalInterestPaid)}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <Suspense fallback={<LoadingFallback />}>
                {amortView === 'chart' ? (
                  <AmortizationChart plan={simAmortization ?? amortization} />
                ) : (
                  <AmortizationTable
                    plan={simAmortization ?? amortization}
                    label={scenario?.label ?? 'scenario'}
                    ownershipShare={ownershipShare}
                  />
                )}
              </Suspense>
            </>
          )}
        </>
      )}
    </div>
  )
}
