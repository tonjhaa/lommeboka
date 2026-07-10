import { useRef, useState } from 'react'
import { Car } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useCarLoanCalculatorStore } from '@/store/useCarLoanCalculatorStore'
import { FUEL_TYPE_LABELS } from '@/utils/carLoanCalculator'
import { searchCarPresets, type CarPreset } from '@/config/carPresets'

/**
 * Søkbar bilvelger over ~100 vanlige biler i Norge. Å velge en bil fyller
 * inn drivlinje, forbruk, forsikrings- og verditapsestimat automatisk —
 * alt kan justeres etterpå.
 */
export function CarPresetPicker() {
  const setInputs = useCarLoanCalculatorStore((s) => s.setInputs)
  const setFuelEconomy = useCarLoanCalculatorStore((s) => s.setFuelEconomy)
  const setCost = useCarLoanCalculatorStore((s) => s.setCost)
  const setDepreciation = useCarLoanCalculatorStore((s) => s.setDepreciation)

  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const hits = searchCarPresets(query)

  function applyPreset(preset: CarPreset) {
    setInputs({ modelName: preset.label, fuelType: preset.fuelType })
    setFuelEconomy({
      fossilPer100: preset.fossilPer100 ?? null,
      kwhPer100: preset.kwhPer100 ?? null,
      electricSharePct: preset.electricSharePct ?? null,
      // Priser beholdes som standardestimater
      fossilPricePerLiter: null,
      homePricePerKwh: null,
      publicPricePerKwh: null,
      publicChargeSharePct: null,
    })
    setCost('insurance', { enabled: true, overriddenAmount: preset.insuranceMonthly })
    setDepreciation({ annualPct: preset.depreciationPct })
    setQuery(preset.label)
    setOpen(false)
  }

  return (
    <div className="relative">
      <div className="relative">
        <Car className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          className="pl-9"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={() => { blurTimer.current = setTimeout(() => setOpen(false), 150) }}
          placeholder="Søk blant 100 vanlige biler — f.eks. «RAV4» eller «Model Y»"
        />
      </div>
      {open && hits.length > 0 && (
        <div
          className="absolute z-20 mt-1 w-full rounded-md border border-border bg-popover shadow-lg overflow-hidden"
          onMouseDown={() => { if (blurTimer.current) clearTimeout(blurTimer.current) }}
        >
          {hits.map((preset) => (
            <button
              key={preset.id}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left hover:bg-muted/40 transition-colors"
              onClick={() => applyPreset(preset)}
            >
              <span>{preset.label}</span>
              <span className="flex items-center gap-1.5 shrink-0">
                <Badge variant="muted">{FUEL_TYPE_LABELS[preset.fuelType]}</Badge>
                <span className="text-[11px] text-muted-foreground font-mono">
                  ~{preset.insuranceMonthly} kr/mnd fors.
                </span>
              </span>
            </button>
          ))}
          <p className="px-3 py-1.5 text-[10px] text-muted-foreground border-t border-border/40">
            Fyller inn forbruk, forsikring og verditap som estimater — juster fritt etterpå.
          </p>
        </div>
      )}
    </div>
  )
}
