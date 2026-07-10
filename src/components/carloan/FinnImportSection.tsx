import { useState } from 'react'
import { Search, Loader2, ClipboardPaste, Check } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Field, fmtNOK } from './carloanShared'
import { useCarLoanCalculatorStore } from '@/store/useCarLoanCalculatorStore'
import { isValidFinnkode } from '@/domain/finn/finnAdParser'
import type { FinnCarAdData } from '@/domain/finn/finnCarAdParser'
import { parseFinnCarAdText, type FinnCarAdTextResult } from '@/domain/finn/finnCarAdTextParser'
import { FUEL_TYPE_LABELS } from '@/utils/carLoanCalculator'

/**
 * FINN-import: enten oppslag via FINN-kode (server-side henting) eller
 * parsing av annonsetekst brukeren selv limer inn (ingen scraping).
 * Tekst-varianten viser hva som ble funnet og lar brukeren godkjenne
 * før verdiene tas i bruk.
 */
export function FinnImportSection() {
  const inputs = useCarLoanCalculatorStore((s) => s.inputs)
  const setInputs = useCarLoanCalculatorStore((s) => s.setInputs)

  const [finnkode, setFinnkode] = useState('')
  const [finnLoading, setFinnLoading] = useState(false)
  const [finnError, setFinnError] = useState<string | null>(null)

  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [parsed, setParsed] = useState<FinnCarAdTextResult | null>(null)
  const [applied, setApplied] = useState(false)

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
        modelName: data.tittel ?? inputs.modelName,
      })
    } catch {
      setFinnError('Klarte ikke å nå FINN. Prøv igjen, eller fyll inn tallene manuelt.')
    } finally {
      setFinnLoading(false)
    }
  }

  function handleParseText() {
    setApplied(false)
    setParsed(parseFinnCarAdText(pasteText))
  }

  function handleApplyParsed() {
    if (!parsed) return
    setInputs({
      ...(parsed.price !== null ? { price: parsed.price } : {}),
      ...(parsed.year !== null ? { year: parsed.year } : {}),
      ...(parsed.mileageKm !== null ? { mileageKm: parsed.mileageKm } : {}),
      ...(parsed.fuelType !== null ? { fuelType: parsed.fuelType } : {}),
      ...(parsed.gearbox !== null ? { gearbox: parsed.gearbox } : {}),
      ...(parsed.modelName !== null ? { modelName: parsed.modelName } : {}),
      ...(parsed.omregistreringsavgift !== null
        ? { omregistreringsavgift: parsed.omregistreringsavgift }
        : {}),
    })
    setApplied(true)
  }

  const previewRows: Array<{ label: string; value: string | null }> = parsed
    ? [
        { label: 'Modell', value: parsed.modelName },
        { label: 'Pris', value: parsed.price !== null ? fmtNOK(parsed.price) : null },
        { label: 'Årsmodell', value: parsed.year !== null ? String(parsed.year) : null },
        { label: 'Kilometerstand', value: parsed.mileageKm !== null ? `${parsed.mileageKm.toLocaleString('no-NO')} km` : null },
        { label: 'Drivstoff', value: parsed.fuelType ? FUEL_TYPE_LABELS[parsed.fuelType] : null },
        { label: 'Girkasse', value: parsed.gearbox === 'automat' ? 'Automat' : parsed.gearbox === 'manuell' ? 'Manuell' : null },
        { label: 'Effekt', value: parsed.powerHp !== null ? `${parsed.powerHp} hk` : null },
        { label: 'Omregistrering', value: parsed.omregistreringsavgift !== null ? fmtNOK(parsed.omregistreringsavgift) : null },
      ]
    : []

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Hent fra FINN-annonse</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[180px]">
            <Field label="FINN-kode" help="Tallet i annonsens nettadresse eller nederst i annonsen (8–10 sifre). Henter pris, årsmodell, km og drivstoff automatisk.">
              <Input
                value={finnkode}
                onChange={(e) => setFinnkode(e.target.value)}
                placeholder="f.eks. 469404429"
              />
            </Field>
          </div>
          <Button onClick={handleFinnLookup} disabled={finnLoading}>
            {finnLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Search className="h-4 w-4 mr-1.5" />}
            Hent
          </Button>
        </div>
        {finnError && <p className="text-xs text-red-500">{finnError}</p>}

        <button
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setPasteOpen((v) => !v)}
        >
          <ClipboardPaste className="h-3.5 w-3.5" />
          {pasteOpen ? 'Skjul tekst-innliming' : 'Eller lim inn annonsetekst i stedet'}
        </button>

        {pasteOpen && (
          <div className="space-y-2">
            <textarea
              className="w-full h-28 rounded-md border border-border bg-input px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Kopier tekst fra annonsen (pris, modellår, kilometerstand osv.) og lim inn her …"
              value={pasteText}
              onChange={(e) => { setPasteText(e.target.value); setParsed(null); setApplied(false) }}
            />
            <Button variant="outline" size="sm" onClick={handleParseText} disabled={!pasteText.trim()}>
              Tolk teksten
            </Button>

            {parsed && (
              <div className="rounded-md border border-border/60 overflow-hidden">
                <div className="bg-muted/20 px-3 py-1.5 text-xs font-medium text-muted-foreground">
                  Fant disse verdiene — sjekk at de stemmer før du bruker dem
                </div>
                {previewRows.map((row) => (
                  <div key={row.label} className="flex items-center justify-between px-3 py-1.5 text-xs border-t border-border/30">
                    <span className="text-muted-foreground">{row.label}</span>
                    {row.value !== null
                      ? <span className="font-medium">{row.value}</span>
                      : <Badge variant="muted">ikke funnet</Badge>}
                  </div>
                ))}
                <div className="px-3 py-2 border-t border-border/30 flex items-center gap-2">
                  <Button size="sm" onClick={handleApplyParsed} disabled={parsed.foundFields.length === 0}>
                    {applied ? <Check className="h-4 w-4 mr-1.5" /> : null}
                    {applied ? 'Verdiene er brukt' : 'Bruk verdiene'}
                  </Button>
                  <span className="text-[11px] text-muted-foreground">
                    Felt som ikke ble funnet fyller du inn manuelt under.
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
