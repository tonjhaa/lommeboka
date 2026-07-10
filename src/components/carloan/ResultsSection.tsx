import { useMemo, useState } from 'react'
import {
  CheckCircle2, AlertTriangle, XCircle, ChevronDown, ChevronUp, Copy, Check, Info,
  Lightbulb, TrendingUp, GitCompare, X as XIcon,
} from 'lucide-react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { NumberInput } from '@/components/ui/number-input'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { HelpTooltip } from '@/components/ui/help-tooltip'
import { AmortizationTable } from '@/components/charts/AmortizationTable'
import { AmortizationChart } from '@/components/charts/AmortizationChart'
import { fmtNOK } from './carloanShared'
import { AddToLommeboka } from './AddToLommeboka'
import { useCarLoanCalculatorStore } from '@/store/useCarLoanCalculatorStore'
import {
  buildValueVsDebtCurve,
  calculateCarLoan,
  resolveAnnualRate,
  type CarLoanResult,
} from '@/utils/carLoanCalculator'
import { generateInsights } from '@/utils/carLoanInsights'

export const AFFORDABILITY_STYLE = {
  ok: { icon: CheckCircle2, className: 'text-green-500', label: 'Innenfor det du har å avse' },
  stramt: { icon: AlertTriangle, className: 'text-yellow-500', label: 'Stramt — nær grensen' },
  'ikke-rad': { icon: XCircle, className: 'text-red-500', label: 'Over det du har å avse' },
} as const

/** Fargekoding for kostnadsstacken — gjenbrukes i legend */
const STACK_SEGMENTS = [
  { key: 'loan', label: 'Lån', className: 'bg-primary' },
  { key: 'energy', label: 'Drivstoff/strøm', className: 'bg-amber-500/80' },
  { key: 'fixed', label: 'Faste kostnader', className: 'bg-emerald-500/70' },
  { key: 'toll', label: 'Bompenger', className: 'bg-rose-500/70' },
] as const

function KeyFigure({ label, value, help }: { label: string; value: string; help?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs text-muted-foreground flex items-center shrink-0">{label}{help && <HelpTooltip content={help} />}</span>
      <span className="font-mono text-sm text-right">{value}</span>
    </div>
  )
}

/**
 * Resultatpanel — sticky på desktop (høyre kolonne). Signaturelementet er
 * kostnadsstacken: månedskostnaden som én fargekodet søyle delt i
 * lån/energi/faste/bom, som oppdaterer seg live mens man justerer.
 */
const INSIGHT_STYLE = {
  advarsel: { icon: AlertTriangle, className: 'text-amber-400' },
  tips: { icon: Lightbulb, className: 'text-primary' },
  positiv: { icon: TrendingUp, className: 'text-green-500' },
} as const

export function ResultsSection({ result, currentSurplus }: { result: CarLoanResult; currentSurplus: number }) {
  const inputs = useCarLoanCalculatorStore((s) => s.inputs)
  const setAvailableMonthlyBudget = useCarLoanCalculatorStore((s) => s.setAvailableMonthlyBudget)
  const comparisonSnapshot = useCarLoanCalculatorStore((s) => s.comparisonSnapshot)
  const setComparisonSnapshot = useCarLoanCalculatorStore((s) => s.setComparisonSnapshot)

  const [showAmortization, setShowAmortization] = useState(false)
  const [copied, setCopied] = useState(false)

  const sharingActive = inputs.sharing.mode !== 'alene'
  const style = AFFORDABILITY_STYLE[result.affordability]
  const AffordabilityIcon = style.icon

  const insights = useMemo(
    () => generateInsights(inputs, result, currentSurplus),
    [inputs, result, currentSurplus]
  )

  // Verdi vs. gjeld — punkter per kvartal holder grafen lett
  const valueCurve = useMemo(() => {
    if (result.loanAmount <= 0 || !inputs.depreciation.enabled || inputs.price <= 0) return []
    return buildValueVsDebtCurve(inputs, result.amortization)
      .filter((p) => p.month % 3 === 0)
      .map((p) => ({ ...p, år: Math.round((p.month / 12) * 10) / 10 }))
  }, [inputs, result])

  const comparisonResult = useMemo(
    () => (comparisonSnapshot ? calculateCarLoan(comparisonSnapshot.inputs) : null),
    [comparisonSnapshot]
  )

  const stackValues: Record<(typeof STACK_SEGMENTS)[number]['key'], number> = {
    loan: result.monthlyLoanCost,
    energy: result.energyCostMonthly,
    fixed: result.fixedCostsMonthly,
    toll: result.tollCostMonthly,
  }
  const stackTotal = result.totalMonthlyCost

  async function copySummary() {
    const lines = [
      `Bilkalkulator — ${inputs.modelName ?? 'bil'}${inputs.year ? ` (${inputs.year})` : ''}`,
      `Pris: ${fmtNOK(inputs.price)} | Egenkapital: ${fmtNOK(inputs.equity)} | Lån: ${fmtNOK(result.loanAmount)}`,
      `Lånekostnad: ${fmtNOK(result.monthlyLoanCost)}/mnd (${resolveAnnualRate(inputs)} %, ${inputs.termYears} år, ${inputs.loanType})`,
      `Driftskostnad: ${fmtNOK(result.operatingCostMonthly)}/mnd`,
      `TOTAL MÅNEDSKOSTNAD: ${fmtNOK(result.totalMonthlyCost)}`,
      ...(sharingActive
        ? [`Min andel: ${fmtNOK(result.myShareMonthly)} | Partners andel: ${fmtNOK(result.partnerShareMonthly)}`]
        : []),
      `Første måned (inkl. engangsgebyrer): ${fmtNOK(result.firstMonthCost)}`,
      `Per år: ${fmtNOK(result.annualCost)} | Over låneperioden: ${fmtNOK(result.totalCostOverLoanTerm)}`,
      `Renter totalt: ${fmtNOK(result.totalInterestCost)} | Verditap: ${fmtNOK(result.depreciationMonthly)}/mnd`,
      `Kost per km: ${result.costPerKm.toFixed(1).replace('.', ',')} kr | Per dag: ${fmtNOK(result.costPerDay)}`,
      '',
      'Estimater fra Lommeboka — ikke et bindende lånetilbud.',
    ]
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Utklippstavle utilgjengelig — knappen forblir uendret
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Månedskostnad</CardTitle>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={copySummary}>
            {copied ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
            {copied ? 'Kopiert!' : 'Kopier'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Hovedtall */}
        <div>
          <p className="font-mono font-bold text-4xl leading-tight">{fmtNOK(result.totalMonthlyCost)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            per måned
            {result.depreciationMonthly > 0 && (
              <> · {fmtNOK(result.totalMonthlyCostInclDepreciation)} inkl. verditap</>
            )}
          </p>
        </div>

        {/* Kostnadsstack */}
        {stackTotal > 0 && (
          <div className="space-y-2">
            <div className="flex h-4 rounded-full overflow-hidden border border-border/40">
              {STACK_SEGMENTS.map((seg) => {
                const value = stackValues[seg.key]
                if (value <= 0) return null
                return (
                  <div
                    key={seg.key}
                    className={seg.className}
                    style={{ width: `${(value / stackTotal) * 100}%` }}
                    title={`${seg.label}: ${fmtNOK(value)}/mnd`}
                  />
                )
              })}
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              {STACK_SEGMENTS.map((seg) => {
                const value = stackValues[seg.key]
                if (value <= 0) return null
                return (
                  <div key={seg.key} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <span className={`h-2 w-2 rounded-full ${seg.className}`} />
                      {seg.label}
                    </span>
                    <span className="font-mono">{fmtNOK(value)}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Verdi vs. gjeld over tid */}
        {valueCurve.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground flex items-center">
              Bilens verdi vs. restgjeld
              <HelpTooltip content="Grønn linje: estimert bilverdi (geometrisk verditap — mest de første årene). Oransje: restgjeld. Er gjelden høyere enn verdien, er du «under vann»: salg dekker ikke lånet." />
            </p>
            <ResponsiveContainer width="100%" height={140}>
              <LineChart data={valueCurve} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="år" tick={{ fontSize: 10 }} tickLine={false} unit=" år" />
                <YAxis hide />
                <Tooltip
                  formatter={(v, name) => [fmtNOK(Number(v)), name === 'value' ? 'Bilens verdi' : 'Restgjeld']}
                  labelFormatter={(l) => `Etter ${l} år`}
                />
                <Line type="monotone" dataKey="value" stroke="#22C55E" strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="remainingDebt" stroke="#F59E0B" strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
            {result.underwaterUntilMonth !== null && (
              <p className="text-[11px] text-amber-400">
                Under vann (gjeld &gt; verdi) frem til ca. {Math.round((result.underwaterUntilMonth / 12) * 10) / 10} år.
              </p>
            )}
          </div>
        )}

        {/* Råd-vurdering */}
        <div className="rounded-lg border border-border p-3 space-y-2">
          <div className="flex items-center gap-2">
            <AffordabilityIcon className={`h-4 w-4 shrink-0 ${style.className}`} />
            <span className={`text-sm font-medium ${style.className}`}>{style.label}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground whitespace-nowrap">
              Disponibelt/mnd
              <HelpTooltip content="Forhåndsutfylt med inneværende måneds overskudd fra budsjettet ditt. Skriv inn et eget tall for å overstyre — da holder det seg." />
            </span>
            <div className="w-32">
              <NumberInput
                value={inputs.availableMonthlyBudget}
                onChange={(v) => setAvailableMonthlyBudget(v, true)}
                suffix="kr"
              />
            </div>
          </div>
          {sharingActive && (
            <p className="text-[11px] text-muted-foreground">
              Vurdert mot din andel: <span className="font-mono text-foreground">{fmtNOK(result.myShareMonthly)}</span>
            </p>
          )}
          {currentSurplus > 0 && (
            <p className="text-[11px] text-muted-foreground border-t border-border/40 pt-2">
              Budsjett-overskuddet ditt: <span className="font-mono text-foreground">{fmtNOK(currentSurplus)}</span>
              {' → '}
              <span className={`font-mono ${currentSurplus - result.myShareMonthly < 0 ? 'text-red-400' : 'text-foreground'}`}>
                {fmtNOK(currentSurplus - result.myShareMonthly)}
              </span>{' '}
              etter bilen
            </p>
          )}
        </div>

        {/* Innsikt — kvantifiserte råd fra ekte motor-kjøringer */}
        {insights.length > 0 && (
          <div className="space-y-2 border-t border-border/40 pt-3">
            <p className="text-xs font-medium text-muted-foreground">Innsikt</p>
            {insights.map((insight) => {
              const is = INSIGHT_STYLE[insight.severity]
              const InsightIcon = is.icon
              return (
                <div key={insight.id} className="flex gap-2">
                  <InsightIcon className={`h-4 w-4 shrink-0 mt-0.5 ${is.className}`} />
                  <div className="min-w-0">
                    <p className="text-xs font-medium leading-snug">{insight.title}</p>
                    <p className="text-[11px] text-muted-foreground leading-snug">{insight.detail}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Nøkkeltall */}
        <div className="space-y-1.5 border-t border-border/40 pt-3">
          <KeyFigure label="Lånebeløp" value={fmtNOK(result.loanAmount)} />
          <KeyFigure
            label="Første måned"
            value={fmtNOK(result.firstMonthCost)}
            help="Månedskostnad pluss engangskostnader: etableringsgebyr og omregistrering."
          />
          <KeyFigure label="Per år" value={fmtNOK(result.annualCost)} />
          <KeyFigure
            label={`Over ${inputs.termYears} år`}
            value={fmtNOK(result.totalCostOverLoanTerm)}
            help="Alle terminer og gebyrer pluss driftskostnader over hele låneperioden."
          />
          <KeyFigure label="Renter totalt" value={fmtNOK(result.totalInterestCost)} />
          <KeyFigure
            label="Verditap"
            value={`${fmtNOK(result.depreciationMonthly)}/mnd`}
            help="Ikke penger ut av konto, men reduksjon i bilens verdi — holdes utenfor månedskostnaden."
          />
          <KeyFigure
            label="Per km / per dag"
            value={`${result.costPerKm.toFixed(1).replace('.', ',')} kr / ${fmtNOK(result.costPerDay)}`}
            help="Per km inkluderer verditap. Per dag er kontantkostnaden fordelt på årets dager."
          />
          {inputs.depreciation.enabled && inputs.price > 0 && (
            <KeyFigure
              label="Restverdi ved lånets slutt"
              value={fmtNOK(result.residualValueAtLoanEnd)}
              help="Estimert bilverdi når lånet er nedbetalt — det du «sitter igjen med»."
            />
          )}
        </div>

        {/* A/B-sammenligning */}
        <div className="border-t border-border/40 pt-3 space-y-2">
          {!comparisonSnapshot ? (
            <button
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setComparisonSnapshot({
                label: inputs.modelName ?? 'Oppsett A',
                inputs: JSON.parse(JSON.stringify(inputs)) as typeof inputs,
              })}
            >
              <GitCompare className="h-3.5 w-3.5" />
              Frys dette oppsettet og sammenlign med et annet
            </button>
          ) : comparisonResult && (
            <div className="rounded-md border border-border/60 overflow-hidden">
              <div className="bg-muted/20 px-3 py-1.5 flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  Sammenligner med: {comparisonSnapshot.label}
                </span>
                <button
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  title="Fjern sammenligning"
                  onClick={() => setComparisonSnapshot(null)}
                >
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              </div>
              {([
                ['Total/mnd', comparisonResult.totalMonthlyCost, result.totalMonthlyCost],
                ['Renter totalt', comparisonResult.totalInterestCost, result.totalInterestCost],
                [`Over låneperioden`, comparisonResult.totalCostOverLoanTerm, result.totalCostOverLoanTerm],
                ['Per km', comparisonResult.costPerKm, result.costPerKm],
              ] as Array<[string, number, number]>).map(([label, a, b]) => {
                const diff = b - a
                const isPerKm = label === 'Per km'
                const fmtVal = (n: number) => isPerKm ? `${n.toFixed(1).replace('.', ',')} kr` : fmtNOK(n)
                return (
                  <div key={label} className="flex items-center justify-between px-3 py-1.5 text-xs border-t border-border/30">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-mono">
                      {fmtVal(a)} → {fmtVal(b)}{' '}
                      <span className={diff > 0 ? 'text-red-400' : diff < 0 ? 'text-green-500' : 'text-muted-foreground'}>
                        ({diff > 0 ? '+' : ''}{fmtVal(Math.abs(diff) * Math.sign(diff))})
                      </span>
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Nedbetalingsplan */}
        {result.amortization.rows.length > 0 && (
          <div className="space-y-3 border-t border-border/40 pt-3">
            <button
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowAmortization((v) => !v)}
            >
              {showAmortization ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {showAmortization ? 'Skjul nedbetalingsplan' : 'Vis nedbetalingsplan'}
            </button>
            {showAmortization && (
              <>
                <AmortizationChart plan={result.amortization} />
                <AmortizationTable plan={result.amortization} label="Bilkalkulator" />
              </>
            )}
          </div>
        )}

        {result.totalMonthlyCost > 0 && <AddToLommeboka result={result} />}

        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription className="text-xs">
            Beregningene bygger på tallene dine pluss merkede estimater og er beslutningsstøtte —
            ikke et bindende lånetilbud. Sjekk effektiv rente og totalkostnad i bankens tilbud.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  )
}
