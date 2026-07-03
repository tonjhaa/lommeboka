import { TrendingUp, Building2, Target, ShieldCheck, ShieldX } from 'lucide-react'
import type { LoanAnalysis } from '@/types'
import { formatCurrency, formatPercent, formatNumber } from '@/lib/utils'
import { Progress } from '@/components/ui/progress'
import { HelpTooltip } from '@/components/ui/help-tooltip'
import { cn } from '@/lib/utils'

interface CardProps {
  analysis: LoanAnalysis
}

function MetricRow({
  label,
  value,
  sub,
}: {
  label: string
  value: string
  sub?: string
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <div className="text-right">
        <span className="text-sm font-medium text-foreground">{value}</span>
        {sub && <span className="text-xs text-muted-foreground ml-1">{sub}</span>}
      </div>
    </div>
  )
}

export function EquityCard({ analysis }: CardProps) {
  const { equity } = analysis
  const pct = Math.min(100, (equity.equityPercent / 30) * 100)

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Building2 className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground flex items-center">
          Egenkapital
          <HelpTooltip content={`Kravet er ${equity.requiredEquityPercent}% av (kjøpspris + fellesgjeld) etter fratrekk av gebyrer. Effektiv EK = din EK minus dokumentavgift og tinglysingsgebyrer.`} />
        </span>
        <span
          className={cn(
            'ml-auto text-xs font-semibold px-2 py-0.5 rounded-full',
            equity.approved
              ? 'bg-green-400/10 text-green-400'
              : 'bg-red-400/10 text-red-400'
          )}
        >
          {equity.approved ? 'OK' : 'Mangler'}
        </span>
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">{formatPercent(equity.equityPercent)}</span>
          <span className="text-muted-foreground">krav: {equity.requiredEquityPercent}%</span>
        </div>
        <Progress
          value={pct}
          className="h-1.5"
          indicatorClassName={equity.approved ? 'bg-green-400' : 'bg-red-400'}
        />
      </div>

      <div className="space-y-1.5">
        <MetricRow label="Tilgjengelig EK" value={formatCurrency(equity.availableEquity)} />
        <MetricRow label="Krevd minimum" value={formatCurrency(equity.requiredEquity)} />
        <MetricRow
          label="Buffer"
          value={formatCurrency(equity.equityBuffer)}
          sub={equity.equityBuffer >= 0 ? 'overskudd' : 'underskudd'}
        />
      </div>
    </div>
  )
}

export function DebtRatioCard({ analysis }: CardProps) {
  const { debtRatio } = analysis
  const pct = Math.min(100, (debtRatio.debtRatio / debtRatio.maxDebtRatio) * 100)

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground flex items-center">
          Gjeldsgrad
          <HelpTooltip content="Samlet gjeld (lån + eksisterende gjeld) delt på samlet bruttoinntekt. Maks 5,0x etter Boliglånsforskriften 2025." />
        </span>
        <span
          className={cn(
            'ml-auto text-xs font-semibold px-2 py-0.5 rounded-full',
            debtRatio.approved
              ? 'bg-green-400/10 text-green-400'
              : 'bg-red-400/10 text-red-400'
          )}
        >
          {debtRatio.approved ? 'OK' : 'For høy'}
        </span>
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">{formatNumber(debtRatio.debtRatio, 2)}x</span>
          <span className="text-muted-foreground">maks: {debtRatio.maxDebtRatio}x</span>
        </div>
        <Progress
          value={pct}
          className="h-1.5"
          indicatorClassName={
            pct < 80 ? 'bg-green-400' : pct < 100 ? 'bg-yellow-400' : 'bg-red-400'
          }
        />
      </div>

      <div className="space-y-1.5">
        <MetricRow label="Total gjeld" value={formatCurrency(debtRatio.totalDebt)} />
        <MetricRow label="Samlet inntekt" value={formatCurrency(debtRatio.totalAnnualIncome)} sub="/ år" />
        <MetricRow label="Maks tillatt gjeld" value={formatCurrency(debtRatio.maxAllowedDebt)} />
      </div>
    </div>
  )
}

/** Stresstest-kort — visuelt fremtredende med tydelig grønn/rød status */
export function AffordabilityCard({ analysis }: CardProps) {
  const { affordability: aff } = analysis
  const approved = aff.approved
  const Icon = approved ? ShieldCheck : ShieldX

  return (
    <div
      className={cn(
        'rounded-lg border-2 p-4 space-y-3',
        approved
          ? 'border-green-500/40 bg-green-400/5'
          : 'border-red-500/40 bg-red-400/5'
      )}
    >
      {/* Hode med tydelig status */}
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-full shrink-0',
            approved ? 'bg-green-400/15' : 'bg-red-400/15'
          )}
        >
          <Icon className={cn('h-5 w-5', approved ? 'text-green-400' : 'text-red-400')} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground flex items-center">
              Stresstest
              <HelpTooltip content="Banken krever at du kan betjene lånet ved rente + 3 pp (minimum 7%). Stresstesten sjekker at nettoinntekt minus SIFO-budsjett minus stressrente-terminbeløp er positivt." />
            </span>
            <span
              className={cn(
                'text-xs font-bold px-2.5 py-0.5 rounded-full',
                approved
                  ? 'bg-green-400/20 text-green-400'
                  : 'bg-red-400/20 text-red-400'
              )}
            >
              {approved ? 'BESTÅTT' : 'IKKE BESTÅTT'}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Stressrente: <span className="font-medium text-foreground">{formatPercent(aff.stressTestRate)}</span>
          </p>
        </div>
      </div>

      {/* Regnskaps-oversikt */}
      <div className="rounded-md bg-muted/40 px-3 py-2.5 space-y-1.5 text-xs">
        <div className="flex justify-between font-medium text-foreground">
          <span>Nettoinntekt / mnd</span>
          <span>+{formatCurrency(aff.monthlyNetIncome)}</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>Terminbeløp ({formatPercent(aff.stressTestRate)} stress)</span>
          <span>−{formatCurrency(aff.monthlyPaymentStress)}</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span className="flex items-center">
            SIFO-budsjett
            <HelpTooltip content="SIFO-referansebudsjettet 2026 dekker mat, klær, hygiene, fritid og kommunikasjon for husstandens sammensetning. Brukes av bankene som minimums levekostnad." side="right" />
          </span>
          <span>−{formatCurrency(aff.sifoExpenses)}</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span className="flex items-center">
            Andre boutgifter
            <HelpTooltip content="Fellesutgifter + eiendomsskatt/12 + termingebyr + ekstra månedlige utgifter du har lagt inn." side="right" />
          </span>
          <span>−{formatCurrency(aff.otherMonthlyExpenses)}</span>
        </div>
        {(aff.existingDebtServicing ?? 0) > 0 && (
          <div className="flex justify-between text-muted-foreground">
            <span className="flex items-center">
              Eksisterende gjeld (stresset)
              <HelpTooltip content="Beregnet betjening av eksisterende gjeld som annuitet ved stressrenten over 15 år. Bankene stresstester all gjeld, ikke bare boliglånet." side="right" />
            </span>
            <span>−{formatCurrency(aff.existingDebtServicing)}</span>
          </div>
        )}
        {(aff.sharedDebtStress ?? 0) > 0 && (
          <div className="flex justify-between text-muted-foreground">
            <span className="flex items-center">
              Fellesgjeld (rentestress)
              <HelpTooltip content="Renteøkning på andel fellesgjeld ved stresspåslaget. Dagens betjening av fellesgjelden ligger allerede i felleskostnadene — dette er tillegget banken stresstester." side="right" />
            </span>
            <span>−{formatCurrency(aff.sharedDebtStress)}</span>
          </div>
        )}
        <div
          className={cn(
            'flex justify-between border-t border-border pt-1.5 font-bold text-sm',
            approved ? 'text-green-400' : 'text-red-400'
          )}
        >
          <span>Disponibelt</span>
          <span>{formatCurrency(aff.disposableAmount)}</span>
        </div>
      </div>

      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">Normalt terminbeløp</span>
        <span className="font-medium">{formatCurrency(aff.monthlyPaymentNormal)} / mnd</span>
      </div>
    </div>
  )
}

export function MaxPurchaseCard({ analysis }: CardProps) {
  const { maxPurchase } = analysis

  // Ett record for begge label-variantene → en ny limitingFactor må kun legges til ett sted.
  const limitFactorMeta: Record<typeof maxPurchase.limitingFactor, { label: string; ceiling: string }> = {
    equity: { label: 'Begrenset av egenkapital', ceiling: 'egenkapitalkravet' },
    debtRatio: { label: 'Begrenset av gjeldsgrad', ceiling: 'gjeldsgradsregelen' },
    affordability: { label: 'Begrenset av betjeningsevne', ceiling: 'betjeningsevnen' },
  }

  const kausjonApplied = maxPurchase.kausjonApplied
  const gfc = maxPurchase.guarantorFreeCollateral

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Target className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium text-foreground flex items-center">
          Maksimalt kjøpsbeløp
          <HelpTooltip content="Det laveste av: maks pris etter EK-kravet, gjeldsgradsregelen og betjeningsevnen (stresstest). Bruker scenarioets rente, løpetid, eierform og denne boligens fellesutgifter som forutsetninger." />
        </span>
      </div>

      <div className="text-center py-2">
        <p className="text-3xl font-bold text-primary">
          {formatCurrency(maxPurchase.maxPurchasePrice)}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {limitFactorMeta[maxPurchase.limitingFactor].label}
        </p>
      </div>

      <div className="space-y-1.5 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Maks (egenkapital)</span>
          <span className={maxPurchase.limitingFactor === 'equity' ? 'text-primary font-semibold' : 'text-foreground'}>
            {formatCurrency(maxPurchase.maxByEquity)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Maks (gjeldsgrad)</span>
          <span className={maxPurchase.limitingFactor === 'debtRatio' ? 'text-primary font-semibold' : 'text-foreground'}>
            {formatCurrency(maxPurchase.maxByDebtRatio)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Maks (betjeningsevne)</span>
          <span className={maxPurchase.limitingFactor === 'affordability' ? 'text-primary font-semibold' : 'text-foreground'}>
            {formatCurrency(maxPurchase.maxByAffordability)}
          </span>
        </div>
        <div className="flex justify-between border-t border-border pt-1">
          <span className="text-muted-foreground">Maks lånebeløp</span>
          <span className="font-medium">{formatCurrency(maxPurchase.maxLoanAmount)}</span>
        </div>
      </div>

      {kausjonApplied > 0 && (
        <div className="space-y-1.5 border-t border-border pt-2 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Kausjon brukt</span>
            <span className="font-medium text-foreground">{formatCurrency(kausjonApplied)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Uten kausjon</span>
            <span className="text-foreground">
              {formatCurrency(maxPurchase.maxPriceWithoutKausjon)}
              {' → '}
              <span className="font-medium text-primary">{formatCurrency(maxPurchase.maxPurchasePrice)}</span>
            </span>
          </div>
          {maxPurchase.maxPurchasePrice === maxPurchase.kausjonCeiling && (
            <p className="text-muted-foreground italic">
              Begrenset av {limitFactorMeta[maxPurchase.limitingFactor].ceiling} — mer kausjon hjelper ikke.
            </p>
          )}
          {gfc != null && (
            <>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Kausjonistens frie sikkerhet</span>
                <span className="font-medium text-foreground">{formatCurrency(gfc)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Dekker kausjonen?</span>
                {gfc >= kausjonApplied ? (
                  <span className="text-green-400 font-medium">✓ dekker kausjonen</span>
                ) : (
                  <span className="text-red-400 font-medium">
                    mangler {formatCurrency(kausjonApplied - gfc)}
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {maxPurchase.kausjonForTarget && (
        <div className="space-y-1 border-t border-border pt-2 text-xs">
          {maxPurchase.kausjonForTarget.reachable ? (
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                For å nå {formatCurrency(maxPurchase.kausjonForTarget.targetPrice)}
              </span>
              <span className="font-medium text-foreground">
                trenger {formatCurrency(maxPurchase.kausjonForTarget.kausjonNeeded)} kausjon
              </span>
            </div>
          ) : (
            <p className="text-amber-400">
              Kausjon hjelper opp til {formatCurrency(maxPurchase.kausjonForTarget.ceiling)}. For å nå{' '}
              {formatCurrency(maxPurchase.kausjonForTarget.targetPrice)} må inntekt øke eller annen gjeld ned.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
