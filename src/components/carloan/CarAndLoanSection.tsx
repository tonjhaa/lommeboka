import { RotateCcw } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { NumberInput } from '@/components/ui/number-input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Field, fmtNOK } from './carloanShared'
import { CarPresetPicker } from './CarPresetPicker'
import { useCarLoanCalculatorStore } from '@/store/useCarLoanCalculatorStore'
import { FUEL_TYPE_LABELS, resolveAnnualRate, type FuelType } from '@/utils/carLoanCalculator'

/**
 * Bil + lån — kun de valgene som faktisk trengs. Gebyrer, girkasse og
 * finjustering ligger som antakelser i «Juster detaljer»-panelet.
 */
export function CarAndLoanSection() {
  const inputs = useCarLoanCalculatorStore((s) => s.inputs)
  const setInputs = useCarLoanCalculatorStore((s) => s.setInputs)

  const equityPct = inputs.price > 0 ? Math.round((inputs.equity / inputs.price) * 100) : 0
  const effectiveRate = resolveAnnualRate(inputs)
  const rateIsEstimate = inputs.annualRateOverride === null

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Bil og lån</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <CarPresetPicker />

        {inputs.modelName && (
          <div className="w-full">
            <Field label="Valgt bil">
              <Input
                value={inputs.modelName}
                onChange={(e) => setInputs({ modelName: e.target.value || null })}
              />
            </Field>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Field label="Pris" help="Kjøpesum. Skriv fritt — «kr 350 000» og «350.000» tolkes riktig.">
            <NumberInput value={inputs.price} onChange={(v) => setInputs({ price: v })} suffix="kr" min={0} />
          </Field>
          <Field label="Drivstoff">
            <Select
              value={inputs.fuelType ?? '__none__'}
              onValueChange={(v) => setInputs({ fuelType: v === '__none__' ? null : (v as FuelType) })}
            >
              <SelectTrigger className="h-10 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Velg …</SelectItem>
                {(Object.keys(FUEL_TYPE_LABELS) as FuelType[]).map((f) => (
                  <SelectItem key={f} value={f}>{FUEL_TYPE_LABELS[f]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Årsmodell">
            <NumberInput value={inputs.year ?? 0} onChange={(v) => setInputs({ year: v || null })} grouping={false} placeholder="f.eks. 2019" />
          </Field>
          <Field label="Kilometerstand">
            <NumberInput value={inputs.mileageKm ?? 0} onChange={(v) => setInputs({ mileageKm: v || null })} suffix="km" min={0} placeholder="f.eks. 90 000" />
          </Field>
        </div>

        <div className="border-t border-border/40 pt-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Egenkapital" help="Det du betaler kontant — resten lånefinansieres.">
              <NumberInput value={inputs.equity} onChange={(v) => setInputs({ equity: v })} suffix="kr" min={0} />
            </Field>
            <Field label="Rente (nominell)" help="Banker priser billån etter belåningsgrad: mer egenkapital gir lavere rente. Estimatet følger EK-andelen din (35 %+ EK ≈ 6 %, 20 %+ ≈ 7 %, under 20 % ≈ 8–9 %). Skriv inn din egen rente fra lånetilbudet for å overstyre.">
              <div className="flex items-center gap-2">
                <NumberInput value={effectiveRate} onChange={(v) => setInputs({ annualRateOverride: v })} suffix="%" step={0.1} min={0} max={30} />
                {rateIsEstimate ? (
                  <Badge variant="muted" className="shrink-0">følger EK</Badge>
                ) : (
                  <button
                    className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                    title="Tilbakestill til EK-basert estimat"
                    onClick={() => setInputs({ annualRateOverride: null })}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </Field>
          </div>

          {inputs.price > 0 && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Egenkapitalandel</span>
                <span>{equityPct} % ({fmtNOK(inputs.equity)})</span>
              </div>
              <input
                type="range" min={0} max={100} step={5} value={equityPct}
                onChange={(e) => setInputs({ equity: Math.round((inputs.price * parseInt(e.target.value)) / 100) })}
                className="w-full accent-primary"
              />
            </div>
          )}

          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Løpetid</span>
              <span>{inputs.termYears} år · {inputs.loanType === 'annuitet' ? 'annuitet' : 'serielån'}</span>
            </div>
            <input
              type="range" min={1} max={10} step={1} value={inputs.termYears}
              onChange={(e) => setInputs({ termYears: parseInt(e.target.value) })}
              className="w-full accent-primary"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
