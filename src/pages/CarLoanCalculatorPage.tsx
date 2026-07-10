// src/pages/CarLoanCalculatorPage.tsx
import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCarLoanCalculatorStore } from '@/store/useCarLoanCalculatorStore'
import { useCarLoanCalculator } from '@/hooks/useCarLoanCalculator'
import { FinnImportSection } from '@/components/carloan/FinnImportSection'
import { CarAndLoanSection } from '@/components/carloan/CarAndLoanSection'
import { UsageEnergySection } from '@/components/carloan/UsageEnergySection'
import { DetailsSection } from '@/components/carloan/DetailsSection'
import { ResultsSection, AFFORDABILITY_STYLE } from '@/components/carloan/ResultsSection'
import { fmtNOK } from '@/components/carloan/carloanShared'

/**
 * To-kolonne «cockpit» på desktop: input-flyt til venstre, sticky
 * resultatpanel til høyre som oppdaterer seg live. På mobil: stablet
 * med kompakt sticky-sammendrag øverst.
 */
export function CarLoanCalculatorPage() {
  const inputs = useCarLoanCalculatorStore((s) => s.inputs)
  const resetAll = useCarLoanCalculatorStore((s) => s.resetAll)
  const { result, currentSurplus } = useCarLoanCalculator()

  const [confirmReset, setConfirmReset] = useState(false)

  const sharingActive = inputs.sharing.mode !== 'alene'
  const style = AFFORDABILITY_STYLE[result.affordability]
  const AffordabilityIcon = style.icon
  const hasNumbers = inputs.price > 0

  return (
    <div className="overflow-y-auto h-full">
      {/* Kompakt sticky-sammendrag — kun mobil (desktop har panelet synlig) */}
      {hasNumbers && (
        <div className="lg:hidden sticky top-0 z-10 border-b border-border/60 bg-background/95 backdrop-blur px-4 py-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-baseline gap-2">
              <span className="text-xs text-muted-foreground">Total/mnd</span>
              <span className="font-mono font-bold text-lg">{fmtNOK(result.totalMonthlyCost)}</span>
              {sharingActive && (
                <span className="text-xs text-muted-foreground">
                  · min andel <span className="font-mono font-medium text-foreground">{fmtNOK(result.myShareMonthly)}</span>
                </span>
              )}
            </div>
            <AffordabilityIcon className={`h-4 w-4 ${style.className}`} />
          </div>
        </div>
      )}

      <div className="p-4 md:p-6 max-w-7xl space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Bilkalkulator</h1>
            <p className="text-sm text-muted-foreground">
              Velg en bil eller hent fra FINN — resten er ferdig utfylte estimater du kan justere.
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

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Venstre: input-flyt */}
          <div className="lg:col-span-7 space-y-5 min-w-0">
            <CarAndLoanSection />
            <UsageEnergySection result={result} />
            <FinnImportSection />
            <DetailsSection />
          </div>

          {/* Høyre: sticky resultatpanel */}
          <div className="lg:col-span-5 lg:sticky lg:top-4 min-w-0">
            <ResultsSection result={result} currentSurplus={currentSurplus} />
          </div>
        </div>
      </div>
    </div>
  )
}
