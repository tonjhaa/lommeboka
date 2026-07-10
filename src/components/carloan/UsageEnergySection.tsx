import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { NumberInput } from '@/components/ui/number-input'
import { Switch } from '@/components/ui/switch'
import { HelpTooltip } from '@/components/ui/help-tooltip'
import { Field, fmtNOK } from './carloanShared'
import { useCarLoanCalculatorStore } from '@/store/useCarLoanCalculatorStore'
import { computeEnergyCostMonthly } from '@/utils/carLoanCalculator'
import { COST_LEVEL_LABELS, type CostLevel } from '@/config/carCost.config'
import { manualTollEstimator } from '@/domain/toll/tollEstimator'
import { SHARING_MODE_LABELS, type CarLoanResult, type SharingMode } from '@/utils/carLoanCalculator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

/**
 * Bruk: kjørelengde, kostnadsnivå, bompendling og deling — de få valgene
 * som betyr mest. Drivstoffkostnaden beregnes automatisk fra drivlinjen;
 * finjustering ligger i «Juster detaljer».
 */
export function UsageEnergySection({ result }: { result: CarLoanResult }) {
  const inputs = useCarLoanCalculatorStore((s) => s.inputs)
  const setInputs = useCarLoanCalculatorStore((s) => s.setInputs)
  const setToll = useCarLoanCalculatorStore((s) => s.setToll)
  const setSharing = useCarLoanCalculatorStore((s) => s.setSharing)

  const energyMonthly = computeEnergyCostMonthly(inputs)
  const tollMonthly = manualTollEstimator.monthlyCost(inputs.toll)
  const { mode, myPct, myFixedAmount } = inputs.sharing
  const sharingActive = mode !== 'alene'

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Bruk og deling</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Kjørelengde per år</span>
            <span>
              {inputs.annualKm.toLocaleString('no-NO')} km
              {inputs.fuelType && <> · drivstoff/strøm ≈ <span className="font-mono">{fmtNOK(energyMonthly)}/mnd</span></>}
            </span>
          </div>
          <input
            type="range" min={2_000} max={40_000} step={1_000} value={inputs.annualKm}
            onChange={(e) => setInputs({ annualKm: parseInt(e.target.value) })}
            className="w-full accent-primary"
          />
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="text-xs text-muted-foreground flex items-center">
            Kostnadsnivå
            <HelpTooltip content="Skalerer estimatene for forsikring, service, dekk osv. (lavt −30 %, høyt +35 %). Beløp du selv har justert påvirkes ikke. Finjuster enkeltposter under «Juster detaljer»." />
          </span>
          <div className="flex rounded-md border border-border overflow-hidden">
            {(Object.keys(COST_LEVEL_LABELS) as CostLevel[]).map((level) => (
              <button
                key={level}
                className={`px-3 py-1.5 text-xs transition-colors ${
                  inputs.costLevel === level
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setInputs({ costLevel: level })}
              >
                {COST_LEVEL_LABELS[level]}
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-border/40 pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-3 cursor-pointer">
              <Switch checked={inputs.toll.enabled} onCheckedChange={(v) => setToll({ enabled: v })} />
              <span className="text-sm">Pendler du gjennom bom?</span>
            </label>
            {inputs.toll.enabled && (
              <span className="text-sm font-mono text-muted-foreground">≈ {fmtNOK(tollMonthly)}/mnd</span>
            )}
          </div>
          {inputs.toll.enabled && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Field label="Passeringer/dag" help="Tur/retur gjennom én bomstasjon = 2 passeringer.">
                <NumberInput value={inputs.toll.passesPerDay} onChange={(v) => setToll({ passesPerDay: v })} min={0} max={40} grouping={false} />
              </Field>
              <Field label="Pris/passering">
                <NumberInput value={inputs.toll.pricePerPass} onChange={(v) => setToll({ pricePerPass: v })} suffix="kr" min={0} />
              </Field>
              <Field label="Dager/uke">
                <NumberInput value={inputs.toll.daysPerWeek} onChange={(v) => setToll({ daysPerWeek: v })} min={0} max={7} grouping={false} />
              </Field>
              <Field label="Rabatt" help="Bombrikke gir typisk 20 % rabatt.">
                <NumberInput value={inputs.toll.discountPct} onChange={(v) => setToll({ discountPct: v })} suffix="%" min={0} max={100} grouping={false} />
              </Field>
            </div>
          )}
        </div>

        <div className="border-t border-border/40 pt-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
            <Field label="Deler du kostnadene med noen?" help="Deler dere etter bruk, velg prosentvis og sett andelen ut fra hvor mye hver av dere kjører. «Har jeg råd»-vurderingen gjøres mot din andel.">
              <Select value={mode} onValueChange={(v) => setSharing({ mode: v as SharingMode })}>
                <SelectTrigger className="h-10 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(SHARING_MODE_LABELS) as SharingMode[]).map((m) => (
                    <SelectItem key={m} value={m}>{SHARING_MODE_LABELS[m]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {mode === 'fastbelop' && (
              <Field label="Jeg betaler per måned">
                <NumberInput value={myFixedAmount} onChange={(v) => setSharing({ myFixedAmount: v })} suffix="kr" min={0} />
              </Field>
            )}
          </div>

          {mode === 'prosent' && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Min andel</span>
                <span>{myPct} % / partner {100 - myPct} %</span>
              </div>
              <input
                type="range" min={0} max={100} step={5} value={myPct}
                onChange={(e) => setSharing({ myPct: parseInt(e.target.value) })}
                className="w-full accent-primary"
              />
            </div>
          )}

          {sharingActive && (
            <p className="text-xs text-muted-foreground">
              Min andel <span className="font-mono text-foreground">{fmtNOK(result.myShareMonthly)}</span>
              {' '}· partner <span className="font-mono text-foreground">{fmtNOK(result.partnerShareMonthly)}</span>
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
