import { useState } from 'react'
import { TrendingUp, Building2, Target, PiggyBank, ShieldCheck, ShieldX } from 'lucide-react'
import type { LoanAnalysis } from '@/types'
import { formatCurrency, formatPercent, formatNumber } from '@/lib/utils'
import { Progress } from '@/components/ui/progress'
import { NumberInput } from '@/components/ui/number-input'
import { Label } from '@/components/ui/label'
import { HelpTooltip } from '@/components/ui/help-tooltip'
import { cn } from '@/lib/utils'
import { useEconomyStore } from '@/application/useEconomyStore'
import { getBaseContribForPeriod } from '@/domain/economy/savingsCalculator'

/** Samlet planlagt månedssparing fra Lommeboka (kontoer + fond) for inneværende måned */
function currentMonthlySavingsPlan(): number {
  const { savingsAccounts, fondPortfolio } = useEconomyStore.getState()
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() + 1
  const accSum = savingsAccounts.reduce((s, a) => s + getBaseContribForPeriod(a, y, m), 0)
  let fond = 0
  if (fondPortfolio) {
    const ym = `${y}-${String(m).padStart(2, '0')}`
    const period = fondPortfolio.contributionPeriods?.find(p => {
      const from = p.fromDate ? p.fromDate.slice(0, 7) : '0000-00'
      const to = p.toDate ? p.toDate.slice(0, 7) : '9999-99'
      return ym >= from && ym <= to
    })
    fond = period ? Math.round(period.amount) : Math.round(fondPortfolio.monthlyDeposit)
  }
  return Math.round(accSum + fond)
}

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

  const limitLabels: Record<typeof maxPurchase.limitingFactor, string> = {
    equity: 'Begrenset av egenkapital',
    debtRatio: 'Begrenset av gjeldsgrad',
    affordability: 'Begrenset av betjeningsevne',
  }

  const limitCeilingLabels: Record<typeof maxPurchase.limitingFactor, string> = {
    equity: 'egenkapitalkravet',
    debtRatio: 'gjeldsgradsregelen',
    affordability: 'betjeningsevnen',
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
          {limitLabels[maxPurchase.limitingFactor]}
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
              Begrenset av {limitCeilingLabels[maxPurchase.limitingFactor]} — mer kausjon hjelper ikke.
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
    </div>
  )
}

/** Sparemål-kort: vises når EK er utilstrekkelig */
export function SavingsGoalCard({ analysis }: CardProps) {
  const { equity } = analysis
  // Forhåndsutfyll med faktisk spareplan fra Lommeboka når den finnes
  const [planFromLommeboka] = useState(() => currentMonthlySavingsPlan())
  const [monthlySavings, setMonthlySavings] = useState(() => planFromLommeboka > 0 ? planFromLommeboka : 5_000)

  // Vises kun når EK-kravet ikke er oppfylt
  if (equity.approved) return null

  const shortfall = Math.max(0, -equity.equityBuffer)
  const monthsToGoal = monthlySavings > 0 ? Math.ceil(shortfall / monthlySavings) : Infinity
  const yearsToGoal = monthsToGoal / 12

  return (
    <div className="rounded-lg border border-yellow-500/30 bg-yellow-400/5 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <PiggyBank className="h-4 w-4 text-yellow-400" />
        <span className="text-sm font-medium text-foreground">Sparemål</span>
      </div>

      <p className="text-sm text-foreground">
        Du mangler{' '}
        <span className="font-semibold text-red-400">{formatCurrency(shortfall)}</span>
        {' '}i egenkapital.
      </p>

      <div className="space-y-1.5">
        <Label className="text-xs flex items-center">
          Månedlig sparing
          <HelpTooltip content="Beløpet du kan spare per måned. Resultatet viser når du har nok EK til å oppfylle kravet." />
        </Label>
        <NumberInput
          value={monthlySavings}
          onChange={setMonthlySavings}
          suffix="kr/mnd"
          min={500}
          step={500}
        />
        {planFromLommeboka > 0 && monthlySavings === planFromLommeboka && (
          <p className="text-[11px] text-muted-foreground">
            Forhåndsutfylt fra spareplanen din i Lommeboka ({formatCurrency(planFromLommeboka)}/mnd)
          </p>
        )}
      </div>

      {isFinite(monthsToGoal) ? (
        <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
          <p className="text-foreground font-medium">
            Klar om{' '}
            <span className="text-yellow-400">
              {monthsToGoal} måneder
              {yearsToGoal >= 1 ? ` (${yearsToGoal.toFixed(1)} år)` : ''}
            </span>
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Totalt spart: {formatCurrency(monthlySavings * monthsToGoal)} — inkl. nødvendig buffer
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Angi månedlig sparing for å se resultat.</p>
      )}
    </div>
  )
}
