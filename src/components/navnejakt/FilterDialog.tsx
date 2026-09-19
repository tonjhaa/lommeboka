import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Chip } from './shared'
import { useNavnejaktStore } from '@/store/useNavnejaktStore'
import {
  DEFAULT_FILTERS, LENGTH_LABEL, POPULARITY_LABEL, TREND_FILTER_LABEL, toggleIn,
  type LengthBucket, type PopularityBucket, type TrendFilter,
} from '@/lib/names/filters'

function Group({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
        {hint && <p className="text-[11px] text-muted-foreground/80 mt-0.5">{hint}</p>}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </section>
  )
}

export function FilterDialog({ open, onOpenChange, latestYear }: { open: boolean; onOpenChange: (o: boolean) => void; latestYear: number }) {
  const filters = useNavnejaktStore((s) => s.filters)
  const setFilters = useNavnejaktStore((s) => s.setFilters)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>Filtre</DialogTitle></DialogHeader>
        <div className="space-y-5" aria-describedby={undefined}>
          <Group title="Kjønn">
            {(['all', 'girl', 'boy'] as const).map((g) => (
              <Chip key={g} active={filters.gender === g} onClick={() => setFilters({ gender: g })}>
                {g === 'all' ? 'Alle' : g === 'girl' ? 'Jentenavn' : 'Guttenavn'}
              </Chip>
            ))}
          </Group>
          <Group title="Popularitet" hint={`Rang blant samme kjønn i ${latestYear}`}>
            {(Object.keys(POPULARITY_LABEL) as PopularityBucket[]).map((b) => (
              <Chip key={b} active={filters.popularity.includes(b)} onClick={() => setFilters({ popularity: toggleIn(filters.popularity, b) })}>
                {POPULARITY_LABEL[b]}
              </Chip>
            ))}
          </Group>
          <Group title="Lengde">
            {(Object.keys(LENGTH_LABEL) as LengthBucket[]).map((b) => (
              <Chip key={b} active={filters.length.includes(b)} onClick={() => setFilters({ length: toggleIn(filters.length, b) })}>
                {LENGTH_LABEL[b]}
              </Chip>
            ))}
          </Group>
          <Group title="Utvikling" hint="Økende/synkende: snitt siste 2 år mot de 3 årene før (±15 %). Tidløse: stabil og registrert hvert av de siste 20 årene.">
            {(Object.keys(TREND_FILTER_LABEL) as TrendFilter[]).map((t) => (
              <Chip key={t} active={filters.trend.includes(t)} onClick={() => setFilters({ trend: toggleIn(filters.trend, t) })}>
                {TREND_FILTER_LABEL[t]}
              </Chip>
            ))}
          </Group>
          <Group title="Eldre navn" hint={`Uten dette vises bare navn med SSB-tall for ${latestYear}.`}>
            <Chip active={filters.includeOlder} onClick={() => setFilters({ includeOlder: !filters.includeOlder })}>
              Ta med navn uten tall for {latestYear}
            </Chip>
          </Group>
        </div>
        <div className="flex justify-between pt-2">
          <Button variant="ghost" size="sm" onClick={() => setFilters(DEFAULT_FILTERS)}>Nullstill</Button>
          <Button size="sm" onClick={() => onOpenChange(false)}>Ferdig</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
