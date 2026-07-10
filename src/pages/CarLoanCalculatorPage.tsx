// src/pages/CarLoanCalculatorPage.tsx
import { useState } from 'react'
import { Search, Loader2, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NumberInput } from '@/components/ui/number-input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AmortizationTable } from '@/components/charts/AmortizationTable'
import { AmortizationChart } from '@/components/charts/AmortizationChart'
import { useCarLoanCalculatorStore } from '@/store/useCarLoanCalculatorStore'
import { useCarLoanCalculator } from '@/hooks/useCarLoanCalculator'
import { estimateFuelCost, type FuelType } from '@/utils/carLoanCalculator'
import { isValidFinnkode } from '@/domain/finn/finnAdParser'
import type { FinnCarAdData } from '@/domain/finn/finnCarAdParser'

function fmtNOK(n: number): string {
  return Math.round(n).toLocaleString('no-NO') + ' kr'
}

const FUEL_LABELS: Record<FuelType, string> = {
  bensin: 'Bensin',
  diesel: 'Diesel',
  el: 'El',
  hybrid: 'Hybrid',
}

export function CarLoanCalculatorPage() {
  const inputs = useCarLoanCalculatorStore((s) => s.inputs)
  const setInputs = useCarLoanCalculatorStore((s) => s.setInputs)
  const setAvailableMonthlyBudget = useCarLoanCalculatorStore((s) => s.setAvailableMonthlyBudget)
  const setRunningCostToggle = useCarLoanCalculatorStore((s) => s.setRunningCostToggle)
  const setMaintenanceToggle = useCarLoanCalculatorStore((s) => s.setMaintenanceToggle)
  const { result } = useCarLoanCalculator()

  const [finnkode, setFinnkode] = useState('')
  const [finnLoading, setFinnLoading] = useState(false)
  const [finnError, setFinnError] = useState<string | null>(null)

  async function handleFinnLookup() {
    const code = finnkode.trim()
    if (!isValidFinnkode(code)) {
      setFinnError('Ugyldig FINN-kode — lim inn tallet fra annonsen (8–10 sifre).')
      return
    }
    setFinnLoading(true)
    setFinnError(null)
    try {
      const res = await fetch(`/api/finn?finnkode=${code}&type=car`)
      const data = (await res.json()) as FinnCarAdData | { error: string }
      if (!res.ok || 'error' in data) {
        setFinnError('error' in data ? data.error : 'Klarte ikke å hente annonsen.')
        return
      }
      setInputs({
        price: data.price ?? inputs.price,
        year: data.year ?? inputs.year,
        mileageKm: data.mileageKm ?? inputs.mileageKm,
        fuelType: data.fuelType ?? inputs.fuelType,
      })
      // Foreslå drivstoffkostnad ut fra de nye tallene, men ikke overskriv
      // et beløp brukeren allerede har justert manuelt inn i feltet under.
      if (!inputs.runningCosts.fuel.enabled) {
        setRunningCostToggle('fuel', {
          monthlyAmount: estimateFuelCost(data.fuelType, data.mileageKm, data.year),
        })
      }
    } catch {
      setFinnError('Klarte ikke å nå FINN. Prøv igjen, eller fyll inn tallene manuelt.')
    } finally {
      setFinnLoading(false)
    }
  }

  const affordabilityStyle = {
    ok: { icon: CheckCircle2, className: 'text-green-500', label: 'Innenfor det du har å avse' },
    stramt: { icon: AlertTriangle, className: 'text-yellow-500', label: 'Stramt — nær grensen' },
    'ikke-rad': { icon: XCircle, className: 'text-red-500', label: 'Over det du har å avse' },
  }[result.affordability]
  const AffordabilityIcon = affordabilityStyle.icon

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Bilkalkulator</h1>
        <p className="text-sm text-muted-foreground">
          Planlegg et bilkjøp — hent tall fra en FINN-annonse eller fyll inn selv.
        </p>
      </div>

      {/* FINN-oppslag */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">FINN-annonse</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-2">
          <div className="space-y-1 flex-1 min-w-[180px]">
            <Label className="text-xs">FINN-kode</Label>
            <Input
              value={finnkode}
              onChange={(e) => setFinnkode(e.target.value)}
              placeholder="f.eks. 469404429"
            />
          </div>
          <Button onClick={handleFinnLookup} disabled={finnLoading}>
            {finnLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Search className="h-4 w-4 mr-1.5" />}
            Hent
          </Button>
          {finnError && <p className="w-full text-xs text-red-500">{finnError}</p>}
        </CardContent>
      </Card>

      {/* Bil og lån */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Bil og lån</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="space-y-1">
            <Label className="text-xs">Pris</Label>
            <NumberInput value={inputs.price} onChange={(v) => setInputs({ price: v })} suffix="kr" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Egenkapital</Label>
            <NumberInput value={inputs.equity} onChange={(v) => setInputs({ equity: v })} suffix="kr" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Rente</Label>
            <NumberInput value={inputs.annualRate} onChange={(v) => setInputs({ annualRate: v })} suffix="%" step={0.1} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Løpetid</Label>
            <NumberInput value={inputs.termYears} onChange={(v) => setInputs({ termYears: v })} suffix="år" min={1} max={15} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Lånetype</Label>
            <Select value={inputs.loanType} onValueChange={(v) => setInputs({ loanType: v as 'annuitet' | 'serie' })}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="annuitet">Annuitet</SelectItem>
                <SelectItem value="serie">Serie</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Drivstoff</Label>
            <Select
              value={inputs.fuelType ?? '__none__'}
              onValueChange={(v) => setInputs({ fuelType: v === '__none__' ? null : (v as FuelType) })}
            >
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Ukjent</SelectItem>
                {(Object.keys(FUEL_LABELS) as FuelType[]).map((f) => (
                  <SelectItem key={f} value={f}>{FUEL_LABELS[f]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Årsmodell</Label>
            <NumberInput value={inputs.year ?? 0} onChange={(v) => setInputs({ year: v || null })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Kilometerstand</Label>
            <NumberInput value={inputs.mileageKm ?? 0} onChange={(v) => setInputs({ mileageKm: v || null })} suffix="km" />
          </div>
        </CardContent>
      </Card>

      {/* Driftskostnader */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Driftskostnader (valgfritt)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-3 cursor-pointer flex-1">
              <input
                type="checkbox"
                checked={inputs.runningCosts.insurance.enabled}
                onChange={(e) => setRunningCostToggle('insurance', { enabled: e.target.checked })}
                className="h-4 w-4"
              />
              <span className="text-sm">Forsikring</span>
            </label>
            <NumberInput
              value={inputs.runningCosts.insurance.monthlyAmount}
              onChange={(v) => setRunningCostToggle('insurance', { monthlyAmount: v })}
              suffix="kr/mnd"
              disabled={!inputs.runningCosts.insurance.enabled}
              className="w-36"
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-3 cursor-pointer flex-1">
              <input
                type="checkbox"
                checked={inputs.runningCosts.fuel.enabled}
                onChange={(e) => setRunningCostToggle('fuel', { enabled: e.target.checked })}
                className="h-4 w-4"
              />
              <span className="text-sm">Drivstoff/lading</span>
            </label>
            <NumberInput
              value={inputs.runningCosts.fuel.monthlyAmount}
              onChange={(v) => setRunningCostToggle('fuel', { monthlyAmount: v })}
              suffix="kr/mnd"
              disabled={!inputs.runningCosts.fuel.enabled}
              className="w-36"
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-3 cursor-pointer flex-1">
              <input
                type="checkbox"
                checked={inputs.runningCosts.maintenance.enabled}
                onChange={(e) => setMaintenanceToggle({ enabled: e.target.checked })}
                className="h-4 w-4"
              />
              <span className="text-sm">Service/vedlikehold + årsavgift</span>
            </label>
            <NumberInput
              value={inputs.runningCosts.maintenance.yearlyAmount}
              onChange={(v) => setMaintenanceToggle({ yearlyAmount: v })}
              suffix="kr/år"
              disabled={!inputs.runningCosts.maintenance.enabled}
              className="w-36"
            />
          </div>
        </CardContent>
      </Card>

      {/* Resultat */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Resultat</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Lånebeløp</p>
              <p className="font-mono font-medium">{fmtNOK(result.loanAmount)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Terminbeløp</p>
              <p className="font-mono font-medium">{fmtNOK(result.monthlyInstallment)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total driftskostnad</p>
              <p className="font-mono font-medium">{fmtNOK(result.totalRunningCostMonthly)}/mnd</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total rentekostnad</p>
              <p className="font-mono font-medium">{fmtNOK(result.totalInterestCost)}</p>
            </div>
          </div>

          <div className="rounded-lg border border-border p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AffordabilityIcon className={`h-4 w-4 ${affordabilityStyle.className}`} />
              <span className={`text-sm font-medium ${affordabilityStyle.className}`}>{affordabilityStyle.label}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Disponibelt til bil/mnd</span>
              <NumberInput
                value={inputs.availableMonthlyBudget}
                onChange={(v) => setAvailableMonthlyBudget(v, true)}
                suffix="kr"
                className="w-32"
              />
            </div>
          </div>

          {result.amortization.rows.length > 0 && (
            <>
              <AmortizationChart plan={result.amortization} />
              <AmortizationTable plan={result.amortization} label="Bilkalkulator" />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
