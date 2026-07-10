import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { NumberInput } from '@/components/ui/number-input'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Field, fmtNOK } from './carloanShared'
import { useCarLoanCalculatorStore } from '@/store/useCarLoanCalculatorStore'
import {
  computeEnergyCostMonthly,
  resolveFuelEconomy,
  FUEL_TYPE_LABELS,
} from '@/utils/carLoanCalculator'

/**
 * Bruk og kjøremønster + drivstoff-/strømkostnad.
 * Feltene viser effektive verdier (estimat for drivlinjen eller brukerens
 * overstyring) — å endre et felt lagrer det som overstyring.
 */
export function UsageEnergySection() {
  const inputs = useCarLoanCalculatorStore((s) => s.inputs)
  const setInputs = useCarLoanCalculatorStore((s) => s.setInputs)
  const setFuelEconomy = useCarLoanCalculatorStore((s) => s.setFuelEconomy)
  const setEnergyOverride = useCarLoanCalculatorStore((s) => s.setEnergyOverride)

  const fe = resolveFuelEconomy(inputs)
  const energyMonthly = computeEnergyCostMonthly(inputs)
  const ft = inputs.fuelType
  const hasFossil = ft === 'bensin' || ft === 'diesel' || ft === 'hybrid' || ft === 'ladbar_hybrid'
  const hasElectric = ft === 'el' || ft === 'ladbar_hybrid'
  const hasOverrides = Object.values(inputs.fuelEconomy).some((v) => v !== null)

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Bruk og kjøremønster</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Kjørelengde per år</span>
            <span>{inputs.annualKm.toLocaleString('no-NO')} km</span>
          </div>
          <input
            type="range" min={2_000} max={40_000} step={1_000} value={inputs.annualKm}
            onChange={(e) => setInputs({ annualKm: parseInt(e.target.value) })}
            className="w-full accent-primary"
          />
        </div>

        {!ft && (
          <p className="text-xs text-muted-foreground">
            Velg drivstoff under «Bilinformasjon» for å estimere drivstoff-/strømkostnad.
          </p>
        )}

        {ft && !inputs.energyOverride.enabled && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">
                Forbruk og priser ({FUEL_TYPE_LABELS[ft]}) <Badge variant="muted" className="ml-1">estimat</Badge>
              </p>
              {hasOverrides && (
                <button
                  className="text-xs text-primary/70 hover:text-primary transition-colors"
                  onClick={() => setFuelEconomy({
                    fossilPer100: null, fossilPricePerLiter: null, kwhPer100: null,
                    homePricePerKwh: null, publicPricePerKwh: null,
                    publicChargeSharePct: null, electricSharePct: null,
                  })}
                >
                  Tilbakestill til estimat
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {hasFossil && (
                <>
                  <Field label="Forbruk" help="Liter per 100 km. Standardverdien er et grovt estimat for drivlinjen — juster til bilens reelle forbruk.">
                    <NumberInput value={fe.fossilPer100} onChange={(v) => setFuelEconomy({ fossilPer100: v })} suffix="l/100km" step={0.1} min={0} />
                  </Field>
                  <Field label="Drivstoffpris">
                    <NumberInput value={fe.fossilPricePerLiter} onChange={(v) => setFuelEconomy({ fossilPricePerLiter: v })} suffix="kr/l" step={0.1} min={0} />
                  </Field>
                </>
              )}
              {hasElectric && (
                <>
                  <Field label="Strømforbruk">
                    <NumberInput value={fe.kwhPer100} onChange={(v) => setFuelEconomy({ kwhPer100: v })} suffix="kWh/100km" step={0.5} min={0} />
                  </Field>
                  <Field label="Strømpris hjemme">
                    <NumberInput value={fe.homePricePerKwh} onChange={(v) => setFuelEconomy({ homePricePerKwh: v })} suffix="kr/kWh" step={0.1} min={0} />
                  </Field>
                  <Field label="Pris offentlig lading">
                    <NumberInput value={fe.publicPricePerKwh} onChange={(v) => setFuelEconomy({ publicPricePerKwh: v })} suffix="kr/kWh" step={0.1} min={0} />
                  </Field>
                </>
              )}
            </div>

            {hasElectric && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Andel offentlig lading</span>
                  <span>{Math.round(fe.publicChargeSharePct)} %</span>
                </div>
                <input
                  type="range" min={0} max={100} step={5} value={fe.publicChargeSharePct}
                  onChange={(e) => setFuelEconomy({ publicChargeSharePct: parseInt(e.target.value) })}
                  className="w-full accent-primary"
                />
              </div>
            )}

            {ft === 'ladbar_hybrid' && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Andel elektrisk kjøring</span>
                  <span>{Math.round(fe.electricSharePct)} %</span>
                </div>
                <input
                  type="range" min={0} max={100} step={5} value={fe.electricSharePct}
                  onChange={(e) => setFuelEconomy({ electricSharePct: parseInt(e.target.value) })}
                  className="w-full accent-primary"
                />
              </div>
            )}
          </div>
        )}

        {ft && (
          <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
            <div className="flex items-center gap-3">
              <Switch
                checked={inputs.energyOverride.enabled}
                onCheckedChange={(v) => setEnergyOverride({ enabled: v })}
              />
              <span className="text-sm">Overstyr med fast beløp</span>
            </div>
            {inputs.energyOverride.enabled ? (
              <div className="w-36">
                <NumberInput
                  value={inputs.energyOverride.monthlyAmount}
                  onChange={(v) => setEnergyOverride({ monthlyAmount: v })}
                  suffix="kr/mnd" min={0}
                />
              </div>
            ) : (
              <span className="text-sm font-mono text-muted-foreground">≈ {fmtNOK(energyMonthly)}/mnd</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
