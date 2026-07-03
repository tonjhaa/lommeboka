import { Route, CheckCircle2, Clock, XCircle, PiggyBank } from 'lucide-react'
import { useAffordabilityPath } from '@/hooks/useAffordabilityPath'
import { HelpTooltip } from '@/components/ui/help-tooltip'
import { formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { ScenarioInput } from '@/types'

const MND = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des']

/** «om 2 år 3 mnd (sep. 2028)» */
function fmtHorizon(months: number): string {
  if (months === 0) return 'nå'
  const target = new Date()
  target.setMonth(target.getMonth() + months)
  const when = `${MND[target.getMonth()]} ${target.getFullYear()}`
  const years = Math.floor(months / 12)
  const rest = months % 12
  const dur = years > 0
    ? `${years} år${rest > 0 ? ` ${rest} mnd` : ''}`
    : `${rest} mnd`
  return `om ~${dur} (${when})`
}

function ConstraintRow({ label, months, horizon }: { label: string; months: number | null; horizon: number }) {
  const ok = months === 0
  const later = months !== null && months > 0
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="flex items-center gap-1.5">
        {ok ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-green-400 shrink-0" />
        ) : later ? (
          <Clock className="h-3.5 w-3.5 text-yellow-400 shrink-0" />
        ) : (
          <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
        )}
        <span className="text-muted-foreground">{label}</span>
      </span>
      <span className={cn('font-medium', ok ? 'text-green-400' : later ? 'text-yellow-400' : 'text-red-400')}>
        {ok ? 'Oppfylt nå' : later ? fmtHorizon(months) : `Ikke innen ${horizon / 12} år`}
      </span>
    </div>
  )
}

/**
 * «Vei til råd»: når blir boligen i scenarioet oppnåelig med dagens spareplaner
 * fra Lommeboka — og hva mangler i dag (EK, kausjon, lønn).
 */
export function AffordabilityPathCard({ scenario }: { scenario: ScenarioInput }) {
  const path = useAffordabilityPath(scenario)
  const { timeline, gaps } = path

  const affordableNow = timeline.allMonths === 0
  const hasGaps = gaps.equityGap > 0 || gaps.incomeGapDebtRatio > 0 || gaps.incomeGapAffordability > 0

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Route className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium text-foreground">Vei til råd</span>
        <HelpTooltip content="Basert på kontoene, spareplanene og gjelden dine i Lommeboka (og partners når medsøker er på): egenkapitalen projiseres måned for måned med renter, BSU-tak og fondssparing, gjelden amortiseres ned — og kortet viser når alle tre forskriftskravene er oppfylt for akkurat denne boligen. Antakelser: dagens sparetempo og flat inntekt." />
      </div>

      {!path.hasSavingsData ? (
        <p className="text-xs text-muted-foreground">
          Legg inn sparekontoer under Sparing & gjeld for å se når denne boligen blir oppnåelig
          med spareplanen din.
        </p>
      ) : (
        <>
          {/* Hovedsvar */}
          <div
            className={cn(
              'rounded-md border px-3 py-2.5 text-sm font-medium flex items-start gap-2',
              affordableNow
                ? 'border-green-500/30 bg-green-500/10 text-green-400'
                : timeline.allMonths !== null
                ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400'
                : 'border-red-500/30 bg-red-500/10 text-red-400',
            )}
          >
            {affordableNow ? (
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
            ) : timeline.allMonths !== null ? (
              <Clock className="h-4 w-4 mt-0.5 shrink-0" />
            ) : (
              <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
            )}
            <span>
              {affordableNow
                ? 'Med Lommeboka-tallene deres har dere råd til denne boligen nå.'
                : timeline.allMonths !== null
                ? `Med dagens spareplan har dere råd ${fmtHorizon(timeline.allMonths)}.`
                : `Ikke oppnåelig innen ${path.horizonMonths / 12} år med dagens spareplan og inntekt — se hva som mangler under.`}
            </span>
          </div>

          {/* Per krav */}
          <div className="space-y-1.5">
            <ConstraintRow label="Egenkapital (10 %)" months={timeline.equityMonths} horizon={path.horizonMonths} />
            <ConstraintRow label="Gjeldsgrad (5×)" months={timeline.debtRatioMonths} horizon={path.horizonMonths} />
            <ConstraintRow label="Betjeningsevne (stresstest)" months={timeline.affordabilityMonths} horizon={path.horizonMonths} />
          </div>
        </>
      )}

      {/* Hva mangler i dag */}
      {hasGaps && (
        <div className="rounded-md bg-muted/40 px-3 py-2.5 space-y-1.5 text-xs">
          <p className="font-medium text-foreground">Mangler i dag</p>
          {gaps.equityGap > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Egenkapital</span>
              <span className="font-mono text-red-400">−{formatCurrency(gaps.equityGap)}</span>
            </div>
          )}
          {gaps.equityGap > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground flex items-center">
                … eller kausjon
                <HelpTooltip content="Realkausjon (pant i f.eks. foreldres bolig) kan erstatte manglende egenkapital — men hjelper ikke forbi gjeldsgrad- og betjeningsevnetaket." side="right" />
              </span>
              <span className={cn('font-mono', gaps.kausjonReachable ? 'text-foreground' : 'text-red-400')}>
                {formatCurrency(gaps.kausjonNeeded)}
                {!gaps.kausjonReachable && ' (utenfor tak)'}
              </span>
            </div>
          )}
          {gaps.incomeGapDebtRatio > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Lønn (gjeldsgrad)</span>
              <span className="font-mono text-red-400">+{formatCurrency(gaps.incomeGapDebtRatio)}/år</span>
            </div>
          )}
          {gaps.incomeGapAffordability > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Lønn (betjeningsevne)</span>
              <span className="font-mono text-red-400">+{formatCurrency(gaps.incomeGapAffordability)}/år</span>
            </div>
          )}
          {!gaps.kausjonReachable && gaps.equityGap > 0 && (
            <p className="text-[11px] text-muted-foreground/80 pt-0.5">
              Kausjon alene er ikke nok her — gjeldsgrad/betjeningsevne setter taket på{' '}
              {formatCurrency(gaps.kausjonCeiling)}. Da må inntekten opp eller prisen ned.
            </p>
          )}
        </div>
      )}

      {/* Antakelser */}
      {path.hasSavingsData && (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground/80">
          <PiggyBank className="h-3 w-3 shrink-0" />
          EK i dag {formatCurrency(path.equityNow)} · sparetempo {formatCurrency(path.monthlySavingsRate)}/mnd
          (fra Sparing-fanen{scenario.household.coApplicant ? ' + partner' : ''}) · flat inntekt antatt
        </p>
      )}
    </div>
  )
}
