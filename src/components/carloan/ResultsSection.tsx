import { useState } from 'react'
import {
  CheckCircle2, AlertTriangle, XCircle, ChevronDown, ChevronUp, Copy, Check, Info,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { NumberInput } from '@/components/ui/number-input'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { HelpTooltip } from '@/components/ui/help-tooltip'
import { AmortizationTable } from '@/components/charts/AmortizationTable'
import { AmortizationChart } from '@/components/charts/AmortizationChart'
import { fmtNOK } from './carloanShared'
import { useCarLoanCalculatorStore } from '@/store/useCarLoanCalculatorStore'
import type { CarLoanResult } from '@/utils/carLoanCalculator'

export const AFFORDABILITY_STYLE = {
  ok: { icon: CheckCircle2, className: 'text-green-500', label: 'Innenfor det du har å avse' },
  stramt: { icon: AlertTriangle, className: 'text-yellow-500', label: 'Stramt — nær grensen' },
  'ikke-rad': { icon: XCircle, className: 'text-red-500', label: 'Over det du har å avse' },
} as const

function KeyFigure({ label, value, sub, help }: { label: string; value: string; sub?: string; help?: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground flex items-center">{label}{help && <HelpTooltip content={help} />}</p>
      <p className="font-mono font-medium">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  )
}

export function ResultsSection({ result }: { result: CarLoanResult }) {
  const inputs = useCarLoanCalculatorStore((s) => s.inputs)
  const setAvailableMonthlyBudget = useCarLoanCalculatorStore((s) => s.setAvailableMonthlyBudget)

  const [showAmortization, setShowAmortization] = useState(false)
  const [copied, setCopied] = useState(false)

  const sharingActive = inputs.sharing.mode !== 'alene'
  const style = AFFORDABILITY_STYLE[result.affordability]
  const AffordabilityIcon = style.icon

  async function copySummary() {
    const lines = [
      `Bilkalkulator — ${inputs.modelName ?? 'bil'}${inputs.year ? ` (${inputs.year})` : ''}`,
      `Pris: ${fmtNOK(inputs.price)} | Egenkapital: ${fmtNOK(inputs.equity)} | Lån: ${fmtNOK(result.loanAmount)}`,
      `Lånekostnad: ${fmtNOK(result.monthlyLoanCost)}/mnd (${inputs.annualRate} %, ${inputs.termYears} år, ${inputs.loanType})`,
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
      // Utklippstavle utilgjengelig (eldre nettleser/HTTP) — knappen forblir uendret
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Resultat</CardTitle>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={copySummary}>
            {copied ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
            {copied ? 'Kopiert!' : 'Kopier oppsummering'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Hovedtall */}
        <div className="rounded-lg border border-border p-4 grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
          <div className="sm:col-span-2">
            <p className="text-xs text-muted-foreground">Total månedskostnad (lån + drift)</p>
            <p className="font-mono font-bold text-3xl">{fmtNOK(result.totalMonthlyCost)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Lån {fmtNOK(result.monthlyLoanCost)} + drift {fmtNOK(result.operatingCostMonthly)}
              {result.depreciationMonthly > 0 && (
                <> · {fmtNOK(result.totalMonthlyCostInclDepreciation)} inkl. verditap</>
              )}
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <AffordabilityIcon className={`h-4 w-4 shrink-0 ${style.className}`} />
              <span className={`text-sm font-medium ${style.className}`}>{style.label}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                Disponibelt/mnd
                <HelpTooltip content="Forhåndsutfylt med inneværende måneds overskudd fra budsjettet ditt. Skriv inn et eget tall for å overstyre — da holder det seg." />
              </span>
              <NumberInput
                value={inputs.availableMonthlyBudget}
                onChange={(v) => setAvailableMonthlyBudget(v, true)}
                suffix="kr"
              />
            </div>
            {sharingActive && (
              <p className="text-[11px] text-muted-foreground">Vurdert mot din andel: {fmtNOK(result.myShareMonthly)}</p>
            )}
          </div>
        </div>

        {/* Nøkkeltall */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <KeyFigure label="Lånebeløp" value={fmtNOK(result.loanAmount)} />
          <KeyFigure
            label="Terminbeløp"
            value={fmtNOK(result.monthlyLoanCost)}
            sub={result.loanAmount > 0 ? `inkl. ${fmtNOK(inputs.termingebyr)} termingebyr` : undefined}
            help={inputs.loanType === 'serie' ? 'Serielån: viser første termin — beløpet synker utover i løpetiden.' : undefined}
          />
          <KeyFigure
            label="Første måned"
            value={fmtNOK(result.firstMonthCost)}
            help="Total månedskostnad pluss engangskostnader: etableringsgebyr og omregistrering."
          />
          <KeyFigure label="Kostnad per år" value={fmtNOK(result.annualCost)} />
          <KeyFigure
            label="Over låneperioden"
            value={fmtNOK(result.totalCostOverLoanTerm)}
            sub={`${inputs.termYears} år inkl. drift`}
          />
          <KeyFigure label="Renter totalt" value={fmtNOK(result.totalInterestCost)} />
          <KeyFigure
            label="Verditap"
            value={`${fmtNOK(result.depreciationMonthly)}/mnd`}
            help="Ikke penger ut av konto, men reduksjon i bilens verdi. Holdes utenfor månedskostnaden."
          />
          <KeyFigure
            label="Per km / per dag"
            value={`${result.costPerKm.toFixed(1).replace('.', ',')} kr / ${fmtNOK(result.costPerDay)}`}
            help="Per km inkluderer verditap (reell totalkostnad ved kjøring). Per dag er kontantkostnaden fordelt på årets dager."
          />
        </div>

        {/* Hva påvirker kostnaden mest */}
        {result.topCostDrivers.length > 0 && (
          <div className="rounded-md border border-border/60 overflow-hidden">
            <div className="bg-muted/20 px-3 py-1.5 text-xs font-medium text-muted-foreground">
              Hva påvirker kostnaden mest?
            </div>
            {result.topCostDrivers.map((d) => {
              const maxMonthly = result.topCostDrivers[0].monthly
              const widthPct = maxMonthly > 0 ? Math.max(4, Math.round((d.monthly / maxMonthly) * 100)) : 0
              return (
                <div key={d.label} className="px-3 py-1.5 border-t border-border/30">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span>{d.label}</span>
                    <span className="font-mono">{fmtNOK(d.monthly)}/mnd</span>
                  </div>
                  <div className="h-1.5 rounded bg-muted/40 overflow-hidden">
                    <div className="h-full bg-primary/60 rounded" style={{ width: `${widthPct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Nedbetalingsplan */}
        {result.amortization.rows.length > 0 && (
          <div className="space-y-3">
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

        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription className="text-xs">
            Beregningene bygger på tallene du har lagt inn pluss merkede estimater, og er ment som
            beslutningsstøtte — ikke et bindende lånetilbud. Terminbeløpet bruker standard
            annuitets-/serieformel på nominell rente; gebyrer vises separat. Sjekk alltid effektiv
            rente og totalkostnad i bankens eget tilbud.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  )
}
