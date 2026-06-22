import { useAppStore } from '@/store/useAppStore'
import { NumberInput } from '@/components/ui/number-input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { HelpTooltip } from '@/components/ui/help-tooltip'
import type { ScenarioInput } from '@/types'

interface Props {
  scenario: ScenarioInput
  section?: 'essential' | 'advanced' | 'all'
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
