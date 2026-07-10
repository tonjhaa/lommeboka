import { useState } from 'react'
import { ChevronDown, ChevronUp, Loader2, RotateCcw, SlidersHorizontal, Zap } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { NumberInput } from '@/components/ui/number-input'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Field, fmtNOK } from './carloanShared'
import { useCarLoanCalculatorStore } from '@/store/useCarLoanCalculatorStore'
import {
  resolveCostAmount,
  resolveDepreciationPct,
  resolveFuelEconomy,
  computeEnergyCostMonthly,
} from '@/utils/carLoanCalculator'
import { COST_ITEM_DEFAULTS, COST_KEYS, type CostKey } from '@/config/carCost.config'
import {
  fetchTodaysAverageSpotPrice,
  GRID_FEE_ESTIMATE,
  SPOT_ZONE_LABELS,
  SPOT_ZONES,
  type SpotZone,
} from '@/domain/energy/spotPrice'

/**
 * «Juster detaljer» — alle antakelsene samlet: enkeltposter for faste
 * kostnader, energimodellens forbruk/priser, lånegebyrer og verditap.
 * Hovedflyten klarer seg uten å åpne denne.
 */
export function DetailsSection() {
  const [open, setOpen] = useState(false)
  const inputs = useCarLoanCalculatorStore((s) => s.inputs)
  const setInputs = useCarLoanCalculatorStore((s) => s.setInputs)
  const setFuelEconomy = useCarLoanCalculatorStore((s) => s.setFuelEconomy)
  const setEnergyOverride = useCarLoanCalculatorStore((s) => s.setEnergyOverride)
  const setDepreciation = useCarLoanCalculatorStore((s) => s.setDepreciation)

  const fe = resolveFuelEconomy(inputs)
  const energyMonthly = computeEnergyCostMonthly(inputs)
  const depreciationPct = resolveDepreciationPct(inputs)
  const ft = inputs.fuelType
  const hasFossil = ft === 'bensin' || ft === 'diesel' || ft === 'hybrid' || ft === 'ladbar_hybrid'
  const hasElectric = ft === 'el' || ft === 'ladbar_hybrid'

  const [spotZone, setSpotZone] = useState<SpotZone>('NO1')
  const [spotLoading, setSpotLoading] = useState(false)
  const [spotError, setSpotError] = useState(false)

  async function handleFetchSpotPrice() {
    setSpotLoading(true)
    setSpotError(false)
    const avg = await fetchTodaysAverageSpotPrice(spotZone)
    setSpotLoading(false)
    if (avg === null) {
      setSpotError(true)
      return
    }
    // Spot + grovt nettleie-/påslagsestimat, rundet til 2 desimaler
    setFuelEconomy({ homePricePerKwh: Math.round((avg + GRID_FEE_ESTIMATE) * 100) / 100 })
  }

  return (
    <Card>
      <CardHeader className="py-3">
        <button
          className="flex items-center justify-between w-full text-left"
          onClick={() => setOpen((v) => !v)}
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
            Juster detaljer
            <span className="text-xs font-normal text-muted-foreground">
              — kostnadsposter, forbruk, gebyrer og verditap
            </span>
          </span>
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>
      </CardHeader>

      {open && (
        <CardContent className="space-y-6">
          {/* Faste kostnadsposter */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Faste kostnader per måned
            </p>
            {COST_KEYS.map((key) => (
              <CostRow key={key} costKey={key} />
            ))}
          </div>

          {/* Energidetaljer */}
          {ft && (
            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Drivstoff og strøm
              </p>
              {!inputs.energyOverride.enabled && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {hasFossil && (
                    <>
                      <Field label="Forbruk">
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
                        <NumberInput value={fe.kwhPer100} onChange={(v) => setFuelEconomy({ kwhPer100: v })} suffix="kWh/100" step={0.5} min={0} />
                      </Field>
                      <Field label="Strømpris hjemme">
                        <NumberInput value={fe.homePricePerKwh} onChange={(v) => setFuelEconomy({ homePricePerKwh: v })} suffix="kr/kWh" step={0.1} min={0} />
                      </Field>
                      <Field label="Offentlig lading">
                        <NumberInput value={fe.publicPricePerKwh} onChange={(v) => setFuelEconomy({ publicPricePerKwh: v })} suffix="kr/kWh" step={0.1} min={0} />
                      </Field>
                    </>
                  )}
                </div>
              )}
              {hasElectric && !inputs.energyOverride.enabled && (
                <div className="flex items-center gap-2 flex-wrap">
                  <Select value={spotZone} onValueChange={(v) => setSpotZone(v as SpotZone)}>
                    <SelectTrigger className="h-8 text-xs w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SPOT_ZONES.map((z) => (
                        <SelectItem key={z} value={z} className="text-xs">{SPOT_ZONE_LABELS[z]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <button
                    className="flex items-center gap-1 text-xs text-primary/80 hover:text-primary transition-colors disabled:opacity-50"
                    onClick={handleFetchSpotPrice}
                    disabled={spotLoading}
                  >
                    {spotLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                    Bruk dagens spotpris + nettleie-estimat
                  </button>
                  {spotError && <span className="text-xs text-red-500">Klarte ikke å hente prisen.</span>}
                  <span className="w-full text-[10px] text-muted-foreground">
                    Strømpriser levert av Hva koster strømmen.no
                  </span>
                </div>
              )}
              {hasElectric && !inputs.energyOverride.enabled && (
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
              {ft === 'ladbar_hybrid' && !inputs.energyOverride.enabled && (
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
              <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
                <label className="flex items-center gap-3 cursor-pointer">
                  <Switch
                    checked={inputs.energyOverride.enabled}
                    onCheckedChange={(v) => setEnergyOverride({ enabled: v })}
                  />
                  <span className="text-sm">Overstyr med fast beløp</span>
                </label>
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
            </div>
          )}

          {/* Lånegebyrer */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Lånegebyrer og avgifter <Badge variant="muted" className="ml-1 normal-case">estimat</Badge>
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Field label="Etableringsgebyr" help="Engangsgebyr fra banken. Sjekk lånetilbudet.">
                <NumberInput value={inputs.etableringsgebyr} onChange={(v) => setInputs({ etableringsgebyr: v })} suffix="kr" min={0} />
              </Field>
              <Field label="Termingebyr" help="Gebyr per månedlige termin.">
                <NumberInput value={inputs.termingebyr} onChange={(v) => setInputs({ termingebyr: v })} suffix="kr" min={0} />
              </Field>
              <Field label="Omregistrering" help="Engangsavgift ved eierskifte av bruktbil. Står ofte i annonsen.">
                <NumberInput value={inputs.omregistreringsavgift} onChange={(v) => setInputs({ omregistreringsavgift: v })} suffix="kr" min={0} />
              </Field>
              <Field label="Lånetype" help="Annuitet: likt terminbeløp. Serie: likt avdrag, synkende termin.">
                <Select value={inputs.loanType} onValueChange={(v) => setInputs({ loanType: v as 'annuitet' | 'serie' })}>
                  <SelectTrigger className="h-10 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="annuitet">Annuitet</SelectItem>
                    <SelectItem value="serie">Serie</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </div>

          {/* Verditap */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Verditap</p>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <label className="flex items-center gap-3 cursor-pointer">
                <Switch
                  checked={inputs.depreciation.enabled}
                  onCheckedChange={(v) => setDepreciation({ enabled: v })}
                />
                <span className="text-sm">Vis estimert verditap</span>
              </label>
              {inputs.depreciation.enabled && (
                <div className="flex items-center gap-2">
                  <div className="w-32">
                    <NumberInput
                      value={depreciationPct}
                      onChange={(v) => setDepreciation({ annualPct: v })}
                      suffix="%/år" step={1} min={0} max={50} grouping={false}
                    />
                  </div>
                  {inputs.depreciation.annualPct !== null ? (
                    <button
                      className="text-muted-foreground hover:text-foreground transition-colors"
                      title="Tilbakestill til estimat"
                      onClick={() => setDepreciation({ annualPct: null })}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <Badge variant="muted">estimat</Badge>
                  )}
                </div>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Verditap er ikke penger ut av konto og holdes utenfor månedskostnaden, men vises
              separat og teller i kostnad per kilometer.
            </p>
          </div>
        </CardContent>
      )}
    </Card>
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
