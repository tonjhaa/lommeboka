import { useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Chip } from './shared'
import { AttributeFilterGroups, FilterGroup } from './AttributeFilterGroups'
import { useNavnejaktStore } from '@/store/useNavnejaktStore'
import {
  availableLetters, DEFAULT_FILTERS, PEAK_LABEL, POPULARITY_LABEL, TREND_FILTER_LABEL, toggleIn,
  type PeakBucket, type PopularityBucket, type TrendFilter,
} from '@/lib/names/filters'

export function FilterDialog({ open, onOpenChange, latestYear }: { open: boolean; onOpenChange: (o: boolean) => void; latestYear: number }) {
  const filters = useNavnejaktStore((s) => s.filters)
  const setFilters = useNavnejaktStore((s) => s.setFilters)
  const names = useNavnejaktStore((s) => s.names)
  const letters = useMemo(() => availableLetters(names), [names])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>Filtre</DialogTitle></DialogHeader>
        <div className="space-y-5" aria-describedby={undefined}>
          <FilterGroup title="Kjønn">
            {(['all', 'girl', 'boy'] as const).map((g) => (
              <Chip key={g} active={filters.gender === g} onClick={() => setFilters({ gender: g })}>
                {g === 'all' ? 'Alle' : g === 'girl' ? 'Jentenavn' : 'Guttenavn'}
              </Chip>
            ))}
          </FilterGroup>
          <FilterGroup title="Popularitet" hint={`Rang blant samme kjønn i ${latestYear}`}>
            {(Object.keys(POPULARITY_LABEL) as PopularityBucket[]).map((b) => (
              <Chip key={b} active={filters.popularity.includes(b)} onClick={() => setFilters({ popularity: toggleIn(filters.popularity, b) })}>
                {POPULARITY_LABEL[b]}
              </Chip>
            ))}
          </FilterGroup>
          <AttributeFilterGroups value={filters} onChange={setFilters} letters={letters} />
          <FilterGroup title="Utvikling" hint="Økende/synkende: snitt siste 2 år mot de 3 årene før (±15 %). Tidløse: stabil og registrert hvert av de siste 20 årene.">
            {(Object.keys(TREND_FILTER_LABEL) as TrendFilter[]).map((t) => (
              <Chip key={t} active={filters.trend.includes(t)} onClick={() => setFilters({ trend: toggleIn(filters.trend, t) })}>
                {TREND_FILTER_LABEL[t]}
              </Chip>
            ))}
          </FilterGroup>
          <FilterGroup title="Mest populær" hint="Tiåret navnet hadde høyest andel fødte. Navn uten beregnet toppår skjules når du velger her — oppdater fra SSB i Statistikk-fanen hvis ingen vises.">
            {(Object.keys(PEAK_LABEL) as PeakBucket[]).map((b) => (
              <Chip key={b} active={filters.peak.includes(b)} onClick={() => setFilters({ peak: toggleIn(filters.peak, b) })}>
                {PEAK_LABEL[b]}
              </Chip>
            ))}
          </FilterGroup>
          <FilterGroup title="Eldre navn" hint={`Uten dette vises bare navn med SSB-tall for ${latestYear}.`}>
            <Chip active={filters.includeOlder} onClick={() => setFilters({ includeOlder: !filters.includeOlder })}>
              Ta med navn uten tall for {latestYear}
            </Chip>
          </FilterGroup>
        </div>
        <div className="flex justify-between pt-2">
          <Button variant="ghost" size="sm" onClick={() => setFilters(DEFAULT_FILTERS)}>Nullstill</Button>
          <Button size="sm" onClick={() => onOpenChange(false)}>Ferdig</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
