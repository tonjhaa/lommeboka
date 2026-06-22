import { useState } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { Input } from '@/components/ui/input'
import { PropertyForm } from './PropertyForm'
import { HouseholdForm } from './HouseholdForm'
import { LoanForm } from './LoanForm'
import { Pencil, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import { calcAcquisitionFees } from '@/utils/property'
import { annuityPayment } from '@/utils/loan'
import { calcStressTestRate } from '@/utils/affordability'
import type { ScenarioInput } from '@/types'

interface Props {
  scenario: ScenarioInput
}

/** Alltid-synlig sammendrag: konsekvensen av inndataene uansett hvilken fane som er åpen */
function MiniSummary({ scenario }: { scenario: ScenarioInput }) {
  const config = useAppStore((s) => s.config)
  const { property, loanParameters } = scenario

  const fees = calcAcquisitionFees(
    property.price,
    config.fees,
    property.ownershipType,
    loanParameters.financeAllFees ?? false
  )
  const effEq = Math.max(0, loanParameters.equity - fees.totalFees)
  const total = property.price + (property.sharedDebt ?? 0)
  const loan = Math.max(0, total - effEq + fees.financedFees)
  const stressRate = calcStressTestRate(loanParameters.interestRate, config.lendingRules)
  const normal = annuityPayment(loan, loanParameters.interestRate, loanParameters.loanTermYears)
  const stress = annuityPayment(loan, stressRate, loanParameters.loanTermYears)

  return (
    <div className="shrink-0 border-t border-border bg-muted/30 px-4 py-2.5 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
      <div className="flex justify-between gap-2">
        <span className="text-muted-foreground">Lånebeløp</span>
        <span className="font-mono font-medium text-primary">{formatCurrency(loan)}</span>
      </div>
      <div className="flex justify-between gap-2">
        <span className="text-muted-foreground">Effektiv EK</span>
        <span className="font-mono">{formatCurrency(effEq)}</span>
      </div>
      <div className="flex justify-between gap-2">
        <span className="text-muted-foreground">Terminbeløp</span>
        <span className="font-mono font-medium">{formatCurrency(normal)}/mnd</span>
      </div>
      <div className="flex justify-between gap-2">
        <span className="text-muted-foreground">Ved {stressRate.toFixed(1)} % stress</span>
        <span className="font-mono text-amber-400">{formatCurrency(stress)}/mnd</span>
      </div>
    </div>
  )
}

export function ScenarioFormPanel({ scenario }: Props) {
  const updateScenario = useAppStore((s) => s.updateScenario)
  const [editingLabel, setEditingLabel] = useState(false)
  const [labelValue, setLabelValue] = useState(scenario.label)

  function saveLabel() {
    if (labelValue.trim()) {
      updateScenario(scenario.id, { label: labelValue.trim() })
    }
    setEditingLabel(false)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Scenarionavn */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        {editingLabel ? (
          <div className="flex items-center gap-2 flex-1">
            <Input
              autoFocus
              value={labelValue}
              onChange={(e) => setLabelValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') saveLabel() }}
              className="h-8 text-sm font-medium"
            />
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={saveLabel}>
              <Check className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-1">
            <span className="text-sm font-semibold text-foreground flex-1">{scenario.label}</span>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 opacity-50 hover:opacity-100"
              onClick={() => { setLabelValue(scenario.label); setEditingLabel(true) }}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      {/* Inndata — essensielt alltid synlig, avansert bak details */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          {/* Essensielle felt — alltid synlig */}
          <HouseholdForm scenario={scenario} section="essential" />
          <LoanForm scenario={scenario} section="essential" />
          <PropertyForm scenario={scenario} section="essential" />

          {/* Progressiv avsløring */}
          <details className="rounded-lg border border-border/50 bg-card/40">
            <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium hover:bg-muted/30">
              Boligdetaljer
            </summary>
            <div className="px-3 pb-3 pt-1"><PropertyForm scenario={scenario} section="advanced" /></div>
          </details>

          <details className="rounded-lg border border-border/50 bg-card/40">
            <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium hover:bg-muted/30">
              Husstand & medsøker
            </summary>
            <div className="px-3 pb-3 pt-1"><HouseholdForm scenario={scenario} section="advanced" /></div>
          </details>

          <details className="rounded-lg border border-border/50 bg-card/40">
            <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium hover:bg-muted/30">
              Avanserte lånevilkår
            </summary>
            <div className="px-3 pb-3 pt-1"><LoanForm scenario={scenario} section="advanced" /></div>
          </details>
        </div>
      </div>

      {/* Alltid-synlig lånesammendrag */}
      <MiniSummary scenario={scenario} />
    </div>
  )
}
