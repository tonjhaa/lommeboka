import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { NumberInput } from '@/components/ui/number-input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Field, fmtNOK } from './carloanShared'
import { useCarLoanCalculatorStore } from '@/store/useCarLoanCalculatorStore'
import { FUEL_TYPE_LABELS, type FuelType } from '@/utils/carLoanCalculator'

/** Bilinformasjon + lån og finansiering */
export function CarAndLoanSection() {
  const inputs = useCarLoanCalculatorStore((s) => s.inputs)
  const setInputs = useCarLoanCalculatorStore((s) => s.setInputs)

  const equityPct = inputs.price > 0 ? Math.round((inputs.equity / inputs.price) * 100) : 0

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Bilinformasjon</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="col-span-2 md:col-span-3">
            <Field label="Modell (valgfritt)">
              <Input
                value={inputs.modelName ?? ''}
                onChange={(e) => setInputs({ modelName: e.target.value || null })}
                placeholder="f.eks. Nissan Leaf Tekna"
              />
            </Field>
          </div>
          <Field label="Pris" help="Kjøpesum for bilen. Skriv fritt — «kr 350 000» og «350.000» tolkes riktig.">
            <NumberInput value={inputs.price} onChange={(v) => setInputs({ price: v })} suffix="kr" min={0} />
          </Field>
          <Field label="Årsmodell">
            <NumberInput value={inputs.year ?? 0} onChange={(v) => setInputs({ year: v || null })} grouping={false} placeholder="f.eks. 2019" />
          </Field>
          <Field label="Kilometerstand">
            <NumberInput value={inputs.mileageKm ?? 0} onChange={(v) => setInputs({ mileageKm: v || null })} suffix="km" min={0} placeholder="f.eks. 90 000" />
          </Field>
          <Field label="Drivstoff" help="Styrer hvordan drivstoff-/strømkostnad estimeres. Ladbar hybrid lar deg angi hvor stor andel du kjører elektrisk.">
            <Select
              value={inputs.fuelType ?? '__none__'}
              onValueChange={(v) => setInputs({ fuelType: v === '__none__' ? null : (v as FuelType) })}
            >
              <SelectTrigger className="h-10 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Ukjent</SelectItem>
                {(Object.keys(FUEL_TYPE_LABELS) as FuelType[]).map((f) => (
                  <SelectItem key={f} value={f}>{FUEL_TYPE_LABELS[f]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Girkasse (valgfritt)">
            <Select
              value={inputs.gearbox ?? '__none__'}
              onValueChange={(v) => setInputs({ gearbox: v === '__none__' ? null : (v as 'automat' | 'manuell') })}
            >
              <SelectTrigger className="h-10 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Ukjent</SelectItem>
                <SelectItem value="automat">Automat</SelectItem>
                <SelectItem value="manuell">Manuell</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Lån og finansiering</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Field label="Egenkapital" help="Det du betaler kontant. Resten lånefinansieres.">
              <NumberInput value={inputs.equity} onChange={(v) => setInputs({ equity: v })} suffix="kr" min={0} />
            </Field>
            <Field label="Rente (nominell)" help="Nominell årlig rente fra lånetilbudet. Effektiv rente blir noe høyere pga. gebyrene under.">
              <NumberInput value={inputs.annualRate} onChange={(v) => setInputs({ annualRate: v })} suffix="%" step={0.1} min={0} max={30} />
            </Field>
            <Field label="Lånetype" help="Annuitet: likt terminbeløp hele veien. Serie: likt avdrag, synkende terminbeløp.">
              <Select value={inputs.loanType} onValueChange={(v) => setInputs({ loanType: v as 'annuitet' | 'serie' })}>
                <SelectTrigger className="h-10 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="annuitet">Annuitet</SelectItem>
                  <SelectItem value="serie">Serie</SelectItem>
                </SelectContent>
              </Select>
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
              <span>{inputs.termYears} år</span>
            </div>
            <input
              type="range" min={1} max={10} step={1} value={inputs.termYears}
              onChange={(e) => setInputs({ termYears: parseInt(e.target.value) })}
              className="w-full accent-primary"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Field label="Etableringsgebyr" help="Engangsgebyr fra banken når lånet opprettes. Estimat — sjekk lånetilbudet ditt.">
              <NumberInput value={inputs.etableringsgebyr} onChange={(v) => setInputs({ etableringsgebyr: v })} suffix="kr" min={0} />
            </Field>
            <Field label="Termingebyr" help="Gebyr per månedlige termin. Estimat — sjekk lånetilbudet ditt.">
              <NumberInput value={inputs.termingebyr} onChange={(v) => setInputs({ termingebyr: v })} suffix="kr" min={0} />
            </Field>
            <Field label="Omregistrering" help="Engangsavgift ved eierskifte av bruktbil — betales i tillegg til kjøpesummen. Står ofte i annonsen.">
              <NumberInput value={inputs.omregistreringsavgift} onChange={(v) => setInputs({ omregistreringsavgift: v })} suffix="kr" min={0} />
            </Field>
          </div>
        </CardContent>
      </Card>
    </>
  )
}
