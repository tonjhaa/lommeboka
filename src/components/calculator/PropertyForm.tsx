import { useState } from 'react'
import { Search, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { NumberInput } from '@/components/ui/number-input'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { HelpTooltip } from '@/components/ui/help-tooltip'
import { formatCurrency } from '@/lib/utils'
import type { ScenarioInput } from '@/types'
import type { FinnAdData } from '@/domain/finn/finnAdParser'

interface Props {
  scenario: ScenarioInput
  section?: 'essential' | 'advanced' | 'all'
}

/** Trekker FINN-koden ut av rå input — godtar både ren kode og hel annonse-URL */
function extractFinnkode(input: string): string | null {
  const trimmed = input.trim()
  if (/^\d{8,10}$/.test(trimmed)) return trimmed
  const fromUrl = trimmed.match(/finnkode=(\d{8,10})/)?.[1]
  return fromUrl ?? null
}

/** FINN-oppslag: hent annonse via /api/finn og fyll kalkulatorfeltene */
function FinnLookup({ scenario }: { scenario: ScenarioInput }) {
  const update = useAppStore((s) => s.updateScenario)
  const analysis = useAppStore((s) => s.analyses[scenario.id])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ad, setAd] = useState<FinnAdData | null>(null)

  async function lookup() {
    const finnkode = extractFinnkode(input)
    if (!finnkode) {
      setError('Lim inn FINN-koden (8–10 sifre) eller hele annonse-lenken.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/finn?finnkode=${finnkode}`)
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? 'Klarte ikke å hente annonsen.')
        return
      }
      const data = body as FinnAdData
      setAd(data)
      // Fyll kalkulatoren med annonsens tall — motoren regner resten
      update(scenario.id, {
        property: {
          ...scenario.property,
          price: data.prisantydning ?? scenario.property.price,
          sharedDebt: data.fellesgjeld,
          monthlyFee: data.felleskostMnd,
          propertyTax: data.eiendomsskattArlig ?? 0,
          ...(data.eieform ? { ownershipType: data.eieform } : {}),
          ...(data.boligtype ? { type: data.boligtype } : {}),
          ...(data.adresse ? { address: data.adresse } : {}),
          ...(data.bruksareal ? { size: data.bruksareal } : {}),
          finnkode: data.finnkode,
        },
      })
    } catch {
      setError('Klarte ikke å nå oppslagstjenesten. Sjekk nettforbindelsen, eller fyll inn tallene manuelt.')
    } finally {
      setLoading(false)
    }
  }

  // Verdikt regnes av kalkulatormotoren ETTER at feltene er fylt — samme
  // maks-kjøpsbeløp som resten av appen (én motor).
  const maxPrice = analysis?.maxPurchase?.maxPurchasePrice
  const applied = ad !== null && scenario.property.finnkode === ad.finnkode
  const margin = applied && maxPrice !== undefined ? maxPrice - scenario.property.price : null
  const withinBudget = margin !== null && margin >= 0

  return (
    <div className="space-y-2 rounded-lg border border-primary/25 bg-primary/5 p-3">
      <Label htmlFor="finnkode" className="flex items-center">
        Hent fra FINN
        <HelpTooltip content="Lim inn FINN-koden (står nederst i annonsen) eller hele lenken. Prisantydning, fellesgjeld, felleskostnader, eierform og boligtype fylles inn automatisk — og kalkulatoren svarer på om dere har råd." />
      </Label>
      <div className="flex gap-2">
        <Input
          id="finnkode"
          placeholder="FINN-kode eller annonse-lenke"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') lookup() }}
          className="h-9 text-sm"
        />
        <Button size="sm" className="h-9 gap-1.5 shrink-0" onClick={lookup} disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
          Hent
        </Button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}

      {applied && ad && (
        <div className="space-y-1.5 pt-1">
          <p className="text-xs font-medium text-foreground leading-snug">{ad.tittel}</p>
          {ad.adresse && <p className="text-xs text-muted-foreground">{ad.adresse}</p>}
          <p className="text-xs text-muted-foreground">
            {formatCurrency(ad.prisantydning ?? 0)}
            {ad.fellesgjeld > 0 && <> + {formatCurrency(ad.fellesgjeld)} fellesgjeld</>}
            {ad.totalpris !== null && <> · totalpris {formatCurrency(ad.totalpris)}</>}
          </p>
          {margin !== null && (
            <div
              className={`flex items-start gap-1.5 rounded-md border px-2.5 py-2 text-xs ${
                withinBudget
                  ? 'border-green-500/30 bg-green-500/10 text-green-400'
                  : 'border-red-500/30 bg-red-500/10 text-red-400'
              }`}
            >
              {withinBudget
                ? <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                : <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
              <span>
                {withinBudget
                  ? <>Innenfor maks kjøpsbeløp — {formatCurrency(margin)} margin (maks {formatCurrency(maxPrice!)})</>
                  : <>{formatCurrency(Math.abs(margin))} over maks kjøpsbeløp ({formatCurrency(maxPrice!)})</>}
              </span>
            </div>
          )}
          {ad.kommunaleAvgArlig !== null && (
            <p className="text-[11px] text-muted-foreground/70">
              Kommunale avgifter ({formatCurrency(ad.kommunaleAvgArlig)}/år) legges ikke inn automatisk —
              før dem opp under «Ekstra månedlige utgifter» ved behov.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export function PropertyForm({ scenario, section = 'all' }: Props) {
  const update = useAppStore((s) => s.updateScenario)
  const { property } = scenario

  function set(patch: Partial<typeof property>) {
    update(scenario.id, { property: { ...property, ...patch } })
  }

  const isAndel = property.ownershipType === 'andel' || property.ownershipType === 'aksje'
  const showEssential = section === 'all' || section === 'essential'
  const showAdvanced = section === 'all' || section === 'advanced'

  return (
    <div className="space-y-5">
      {/* 0. FINN-oppslag — fyller feltene under automatisk */}
      {showEssential && <FinnLookup scenario={scenario} />}
      {/* 1. Eierform — viktigst, påvirker dokumentavgift */}
      {showAdvanced && (
        <div className="space-y-1.5">
          <Label htmlFor="ownershipType" className="flex items-center">
            Eierform
            <HelpTooltip content="Selveier: du eier boligen direkte og betaler 2,5% dokumentavgift. Andel/borettslag og aksje: du overtar en andel — ingen dokumentavgift, men fellesgjeld påvirker lånegrenser." />
          </Label>
          <Select
            value={property.ownershipType ?? 'selveier'}
            onValueChange={(v) =>
              set({ ownershipType: v as typeof property.ownershipType })
            }
          >
            <SelectTrigger id="ownershipType">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="selveier">Selveier — dokumentavgift 2,5%</SelectItem>
              <SelectItem value="andel">Andel / Borettslag — ingen dokumentavgift</SelectItem>
              <SelectItem value="aksje">Aksje / Andelsleilighet — ingen dokumentavgift</SelectItem>
            </SelectContent>
          </Select>
          {isAndel && (
            <p className="text-xs text-green-400">
              Ingen dokumentavgift for andel/aksje — spar typisk 100 000+ kr
            </p>
          )}
        </div>
      )}

      {/* 2. Boligpris */}
      {showEssential && (
        <div className="space-y-1.5">
          <Label htmlFor="price" className="flex items-center">
            Boligpris
            <HelpTooltip content="Prisantydning eller avtalt kjøpspris. For borettslag: legg inn andelsverdi ekskl. fellesgjeld." />
          </Label>
          <NumberInput
            id="price"
            value={property.price}
            onChange={(v) => set({ price: v })}
            suffix="kr"
            min={100_000}
            step={10_000}
          />
        </div>
      )}

      {/* 3. Boligtype */}
      {showAdvanced && (
        <div className="space-y-1.5">
          <Label htmlFor="type">Boligtype</Label>
          <Select
            value={property.type}
            onValueChange={(v) => set({ type: v as typeof property.type })}
          >
            <SelectTrigger id="type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="leilighet">Leilighet / Seksjon</SelectItem>
              <SelectItem value="enebolig">Enebolig</SelectItem>
              <SelectItem value="rekkehus">Rekkehus / Halvpart</SelectItem>
              <SelectItem value="tomannsbolig">Tomannsbolig</SelectItem>
              <SelectItem value="fritidsbolig">Fritidsbolig</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* 4. Fellesgjeld (relevant for andel/borettslag) */}
      {showAdvanced && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="sharedDebt" className="flex items-center">
              Fellesgjeld
              <HelpTooltip content="Andel fellesgjeld i borettslaget. Legges til kjøpspris ved beregning av EK-krav og gjeldsgrad." />
            </Label>
            <NumberInput
              id="sharedDebt"
              value={property.sharedDebt ?? 0}
              onChange={(v) => set({ sharedDebt: v })}
              suffix="kr"
              min={0}
              step={10_000}
            />
            <p className="text-xs text-muted-foreground">Andel i borettslag</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="monthlyFee" className="flex items-center">
              Fellesutgifter
              <HelpTooltip content="Månedlig fellesutgift til borettslaget/sameiet. Inkluderer gjerne nedbetaling av fellesgjeld og forsikring." />
            </Label>
            <NumberInput
              id="monthlyFee"
              value={property.monthlyFee ?? 0}
              onChange={(v) => set({ monthlyFee: v })}
              suffix="kr/mnd"
              min={0}
              step={100}
            />
          </div>
        </div>
      )}

      {/* 5. Eiendomsskatt (kun relevant for selveier) */}
      {showAdvanced && !isAndel && (
        <div className="space-y-1.5">
          <Label htmlFor="propertyTax" className="flex items-center">
            Eiendomsskatt
            <HelpTooltip content="Kommunal eiendomsskatt per år. Varierer per kommune — mange kommuner har 0. Sjekk kommunens nettsider." />
          </Label>
          <NumberInput
            id="propertyTax"
            value={property.propertyTax ?? 0}
            onChange={(v) => set({ propertyTax: v })}
            suffix="kr/år"
            min={0}
            step={500}
          />
          <p className="text-xs text-muted-foreground">
            Sett 0 hvis ikke aktuelt
          </p>
        </div>
      )}
    </div>
  )
}
