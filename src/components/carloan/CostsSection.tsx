import { RotateCcw } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { NumberInput } from '@/components/ui/number-input'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { HelpTooltip } from '@/components/ui/help-tooltip'
import { Field, fmtNOK } from './carloanShared'
import { useCarLoanCalculatorStore } from '@/store/useCarLoanCalculatorStore'
import { resolveCostAmount, resolveDepreciationPct } from '@/utils/carLoanCalculator'
import {
  COST_ITEM_DEFAULTS,
  COST_KEYS,
  COST_LEVEL_LABELS,
  type CostKey,
  type CostLevel,
} from '@/config/carCost.config'
import { manualTollEstimator } from '@/domain/toll/tollEstimator'

/**
 * Faste bilkostnader (estimater med lav/normal/høy-nivå og overstyring),
 * bompenger og verditap.
 */
export function CostsSection() {
  const inputs = useCarLoanCalculatorStore((s) => s.inputs)
  const setInputs = useCarLoanCalculatorStore((s) => s.setInputs)
  const setToll = useCarLoanCalculatorStore((s) => s.setToll)
  const setDepreciation = useCarLoanCalculatorStore((s) => s.setDepreciation)

  const tollMonthly = manualTollEstimator.monthlyCost(inputs.toll)
  const depreciationPct = resolveDepreciationPct(inputs)
  const depreciationMonthly = inputs.depreciation.enabled
    ? Math.round((inputs.price * depreciationPct) / 100 / 12)
    : 0

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm">
              Faste bilkostnader
              <HelpTooltip content="Standardbeløpene er grove estimater — ikke fasit. Juster til dine reelle tall, eller bruk nivåvelgeren for et lavt/normalt/høyt anslag." />
            </CardTitle>
            <div className="flex rounded-md border border-border overflow-hidden">
              {(Object.keys(COST_LEVEL_LABELS) as CostLevel[]).map((level) => (
                <button
                  key={level}
                  className={`px-2.5 py-1 text-xs transition-colors ${
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
        </CardHeader>
        <CardContent className="space-y-2">
          {COST_KEYS.map((key) => (
            <CostRow key={key} costKey={key} />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            Bompenger og pendling
            <HelpTooltip content="Manuell beregning ut fra ditt kjøremønster. Tur/retur gjennom én bomstasjon = 2 passeringer per dag. Bombrikke gir typisk 20 % rabatt." />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Switch checked={inputs.toll.enabled} onCheckedChange={(v) => setToll({ enabled: v })} />
              <span className="text-sm">Ta med bompenger</span>
            </div>
            {inputs.toll.enabled && (
              <span className="text-sm font-mono text-muted-foreground">≈ {fmtNOK(tollMonthly)}/mnd</span>
            )}
          </div>
          {inputs.toll.enabled && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Field label="Passeringer per dag">
                <NumberInput value={inputs.toll.passesPerDay} onChange={(v) => setToll({ passesPerDay: v })} min={0} max={40} grouping={false} />
              </Field>
              <Field label="Pris per passering">
                <NumberInput value={inputs.toll.pricePerPass} onChange={(v) => setToll({ pricePerPass: v })} suffix="kr" step={1} min={0} />
              </Field>
              <Field label="Dager per uke">
                <NumberInput value={inputs.toll.daysPerWeek} onChange={(v) => setToll({ daysPerWeek: v })} min={0} max={7} grouping={false} />
              </Field>
              <Field label="Rabatt" help="Bombrikke/avtale gir typisk 20 % rabatt på de fleste anlegg.">
                <NumberInput value={inputs.toll.discountPct} onChange={(v) => setToll({ discountPct: v })} suffix="%" min={0} max={100} grouping={false} />
              </Field>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            Verditap
            <HelpTooltip content="Verditap er ikke penger ut av konto hver måned, men reduserer det bilen er verdt. Det holdes derfor utenfor månedskostnaden, men vises separat og teller med i kostnad per kilometer." />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Switch
                checked={inputs.depreciation.enabled}
                onCheckedChange={(v) => setDepreciation({ enabled: v })}
              />
              <span className="text-sm">Vis estimert verditap</span>
            </div>
            {inputs.depreciation.enabled && (
              <span className="text-sm font-mono text-muted-foreground">≈ {fmtNOK(depreciationMonthly)}/mnd</span>
            )}
          </div>
          {inputs.depreciation.enabled && (
            <div className="flex items-end gap-3">
              <div className="w-40">
                <Field label="Verditap per år" help="Flat prosent av kjøpesummen per år. Grovt estimat — reelt verditap er størst de første årene og varierer mye per modell.">
                  <NumberInput
                    value={depreciationPct}
                    onChange={(v) => setDepreciation({ annualPct: v })}
                    suffix="%" step={1} min={0} max={50} grouping={false}
                  />
                </Field>
              </div>
              {inputs.depreciation.annualPct === null && <Badge variant="muted" className="mb-2.5">estimat</Badge>}
              {inputs.depreciation.annualPct !== null && (
                <button
                  className="mb-3 text-muted-foreground hover:text-foreground transition-colors"
                  title="Tilbakestill til estimat"
                  onClick={() => setDepreciation({ annualPct: null })}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}

/** Én kostnadspost: av/på + beløp (estimat eller overstyring) */
function CostRow({ costKey }: { costKey: CostKey }) {
  const inputs = useCarLoanCalculatorStore((s) => s.inputs)
  const setCost = useCarLoanCalculatorStore((s) => s.setCost)

  const item = inputs.costs[costKey]
  const resolved = resolveCostAmount(costKey, inputs)
  const isEstimate = item.overriddenAmount === null

  return (
    <div className="flex items-center gap-3">
      <label className="flex items-center gap-3 cursor-pointer flex-1 min-w-0">
        <Switch checked={item.enabled} onCheckedChange={(v) => setCost(costKey, { enabled: v })} />
        <span className="text-sm truncate">{COST_ITEM_DEFAULTS[costKey].label}</span>
        {item.enabled && isEstimate && <Badge variant="muted" className="shrink-0">estimat</Badge>}
      </label>
      {item.enabled && !isEstimate && (
        <button
          className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
          title="Tilbakestill til estimat"
          onClick={() => setCost(costKey, { overriddenAmount: null })}
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      )}
      <div className="w-36 shrink-0">
        <NumberInput
          value={resolved}
          onChange={(v) => setCost(costKey, { overriddenAmount: v })}
          suffix="kr/mnd"
          disabled={!item.enabled}
        />
      </div>
    </div>
  )
}
