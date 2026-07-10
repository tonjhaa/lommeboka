// src/pages/CarLoanCalculatorPage.tsx
import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCarLoanCalculatorStore } from '@/store/useCarLoanCalculatorStore'
import { useCarLoanCalculator } from '@/hooks/useCarLoanCalculator'
import { FinnImportSection } from '@/components/carloan/FinnImportSection'
import { CarAndLoanSection } from '@/components/carloan/CarAndLoanSection'
import { UsageEnergySection } from '@/components/carloan/UsageEnergySection'
import { CostsSection } from '@/components/carloan/CostsSection'
import { SharingSection } from '@/components/carloan/SharingSection'
import { ResultsSection, AFFORDABILITY_STYLE } from '@/components/carloan/ResultsSection'
import { fmtNOK } from '@/components/carloan/carloanShared'

export function CarLoanCalculatorPage() {
  const inputs = useCarLoanCalculatorStore((s) => s.inputs)
  const resetAll = useCarLoanCalculatorStore((s) => s.resetAll)
  const { result } = useCarLoanCalculator()

  const [confirmReset, setConfirmReset] = useState(false)

  const sharingActive = inputs.sharing.mode !== 'alene'
  const style = AFFORDABILITY_STYLE[result.affordability]
  const AffordabilityIcon = style.icon
  const hasNumbers = inputs.price > 0

  return (
    <div className="overflow-y-auto h-full">
      {/* Sticky sammendrag — synlig mens man fyller ut */}
      {hasNumbers && (
        <div className="sticky top-0 z-10 border-b border-border/60 bg-background/95 backdrop-blur px-6 py-2">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-baseline gap-2">
              <span className="text-xs text-muted-foreground">Total/mnd</span>
              <span className="font-mono font-bold text-lg">{fmtNOK(result.totalMonthlyCost)}</span>
              {sharingActive && (
                <span className="text-xs text-muted-foreground">
                  · min andel <span className="font-mono font-medium text-foreground">{fmtNOK(result.myShareMonthly)}</span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <AffordabilityIcon className={`h-4 w-4 ${style.className}`} />
              <span className={`text-xs font-medium ${style.className}`}>{style.label}</span>
            </div>
          </div>
        </div>
      )}

      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Bilkalkulator</h1>
            <p className="text-sm text-muted-foreground">
              Planlegg kjøp og bilhold — hent tall fra en FINN-annonse eller fyll inn selv.
              Merkede beløp er estimater du kan overstyre.
            </p>
          </div>
          {confirmReset ? (
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="destructive" size="sm" className="h-7 text-xs"
                onClick={() => { resetAll(); setConfirmReset(false) }}>
                Ja, nullstill
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setConfirmReset(false)}>
                Avbryt
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" className="h-7 text-xs shrink-0" onClick={() => setConfirmReset(true)}>
              <RotateCcw className="h-3.5 w-3.5 mr-1" />
              Nullstill
            </Button>
          )}
        </div>

        <FinnImportSection />
        <CarAndLoanSection />
        <UsageEnergySection />
        <CostsSection />
        <SharingSection result={result} />
        <ResultsSection result={result} />
      </div>
    </div>
  )
}
