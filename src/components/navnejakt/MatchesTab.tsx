import { useMemo, useState } from 'react'
import { Star } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useNavnejaktStore } from '@/store/useNavnejaktStore'
import { MATCH_SORT_LABEL, sortMatches, type MatchEntry, type MatchSort } from '@/lib/names/matches'
import { formatDate, rankLine, trendLine } from '@/lib/names/format'
import type { NameRow } from '@/lib/names/types'
import { cn } from '@/lib/utils'
import { NameDetailDialog } from './NameDetailDialog'
import { Chip, GenderTag, TrendIcon } from './shared'

export function MatchesTab({ connected }: { connected: boolean }) {
  const matches = useNavnejaktStore((s) => s.matches)
  const namesById = useNavnejaktStore((s) => s.namesById)
  const favorites = useNavnejaktStore((s) => s.favorites)
  const latestYear = useNavnejaktStore((s) => s.latestYear)
  const toggleFavorite = useNavnejaktStore((s) => s.toggleFavorite)
  const [sort, setSort] = useState<MatchSort>('newest')
  const [onlyFavs, setOnlyFavs] = useState(false)
  const [detail, setDetail] = useState<NameRow | null>(null)

  const entries = useMemo(() => {
    const all: MatchEntry[] = matches.flatMap((m) => {
      const name = namesById.get(m.nameId)
      return name ? [{ match: m, name }] : []
    })
    return sortMatches(onlyFavs ? all.filter((e) => favorites.has(e.name.id)) : all, sort, latestYear)
  }, [matches, namesById, favorites, sort, onlyFavs, latestYear])

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 px-4 py-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Våre matcher</h2>
          <p className="text-xs text-muted-foreground">{matches.length} {matches.length === 1 ? 'navn' : 'navn'} dere begge har sagt ja til</p>
        </div>
        <div className="flex items-center gap-2">
          <Chip active={onlyFavs} onClick={() => setOnlyFavs((v) => !v)}>Bare favoritter</Chip>
          <Select value={sort} onValueChange={(v) => setSort(v as MatchSort)}>
            <SelectTrigger className="h-8 w-40 text-xs" aria-label="Sorter matcher"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(MATCH_SORT_LABEL) as MatchSort[]).map((k) => <SelectItem key={k} value={k}>{MATCH_SORT_LABEL[k]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
          {!connected
            ? 'Koble til partneren din i Partner-fanen for å få matcher.'
            : onlyFavs ? 'Ingen favoritter ennå. Trykk på stjernen på en match.'
            : 'Ingen matcher ennå. Når dere begge sier ja til samme navn dukker det opp her.'}
        </div>
      ) : (
        <ul className="space-y-2">
          {entries.map(({ match, name }) => {
            const fav = favorites.has(name.id)
            const rank = rankLine(name, latestYear)
            return (
              <li key={match.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
                <button type="button" onClick={() => setDetail(name)} className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md" aria-label={`Vis detaljer for ${name.name}`}>
                  <GenderTag gender={name.gender} />
                  <p className="truncate text-2xl font-semibold tracking-tight">{name.name}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                    {rank && <span>{rank}</span>}
                    {rank && <span aria-hidden>·</span>}
                    <TrendIcon trend={name.trend} /><span>{trendLine(name.trend)}</span>
                    <span aria-hidden>·</span>
                    <span>Match {formatDate(match.matchedAt)}</span>
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => void toggleFavorite(name.id)}
                  aria-pressed={fav}
                  aria-label={fav ? `Fjern ${name.name} som favoritt` : `Marker ${name.name} som favoritt`}
                  className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', fav ? 'text-warning' : 'text-muted-foreground')}
                ><Star className={cn('h-5 w-5', fav && 'fill-current')} /></button>
              </li>
            )
          })}
        </ul>
      )}
      <NameDetailDialog name={detail} latestYear={latestYear} onClose={() => setDetail(null)} />
    </div>
  )
}
