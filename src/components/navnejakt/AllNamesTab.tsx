import { useEffect, useMemo, useState } from 'react'
import { Check, HelpCircle, SlidersHorizontal, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { fetchYearStats } from '@/lib/names/api'
import { useNavnejaktStore } from '@/store/useNavnejaktStore'
import { searchNames, SORT_LABEL, VOTE_FILTER_LABEL, type SortKey, type VoteFilter } from '@/lib/names/browse'
import { availableLetters, DEFAULT_ATTRIBUTE_FILTERS, matchesAttributes, type AttributeFilters } from '@/lib/names/filters'
import { rankLine } from '@/lib/names/format'
import { GENDER_LABEL, GENDER_LABEL_SHORT, type Gender, type NameRow, type Vote, type YearStat } from '@/lib/names/types'
import { groupYearStats, variantLine } from '@/lib/names/variants'
import { cn } from '@/lib/utils'
import { AttributeFilterGroups } from './AttributeFilterGroups'
import { NameDetailDialog } from './NameDetailDialog'
import { Chip, GenderTag } from './shared'

const PAGE = 60
/** Eldste år SSB-tabellen har tall for. */
const FIRST_YEAR = 1945

const VOTE_BUTTONS: Array<{ vote: Vote; label: string; Icon: typeof X; active: string }> = [
  { vote: 'no', label: 'Nei', Icon: X, active: 'border-destructive bg-destructive/15 text-destructive' },
  { vote: 'maybe', label: 'Kanskje', Icon: HelpCircle, active: 'border-primary bg-primary/15 text-primary' },
  { vote: 'yes', label: 'Ja', Icon: Check, active: 'border-success bg-success/15 text-success' },
]

function yearLine(stat: YearStat | undefined, gender: Gender, year: number): string {
  return stat ? `#${stat.rank} blant ${GENDER_LABEL_SHORT[gender]} i ${year} · ${stat.count} barn` : `Ikke registrert i ${year}`
}

/** Alle navn, uavhengig av swipe-filtre — for å finne et navn og se eller endre egen vurdering. */
export function AllNamesTab() {
  const names = useNavnejaktStore((s) => s.names)
  const votes = useNavnejaktStore((s) => s.votes)
  const latestYear = useNavnejaktStore((s) => s.latestYear)
  const vote = useNavnejaktStore((s) => s.vote)
  const [query, setQuery] = useState('')
  const [gender, setGender] = useState<Gender | 'all'>('all')
  const [voteFilter, setVoteFilter] = useState<VoteFilter>('all')
  const [sort, setSort] = useState<SortKey>('alpha')
  const [year, setYear] = useState<number | null>(null)
  const [rawYearStats, setRawYearStats] = useState<{ year: number; stats: ReadonlyMap<string, YearStat> } | null>(null)
  const [yearError, setYearError] = useState(false)
  const [attrs, setAttrs] = useState<AttributeFilters>(DEFAULT_ATTRIBUTE_FILTERS)
  const [showAttrs, setShowAttrs] = useState(false)
  const [limit, setLimit] = useState(PAGE)
  const [detail, setDetail] = useState<NameRow | null>(null)

  // Rangering i et annet år enn siste: hent rang/antall for det året (ca. 2000 rader)
  const pickedYear = (sort === 'popular' || sort === 'fewest') && year !== null && year !== latestYear ? year : null
  useEffect(() => {
    if (pickedYear === null) return
    let cancelled = false
    setYearError(false)
    fetchYearStats(pickedYear)
      .then((stats) => { if (!cancelled) setRawYearStats({ year: pickedYear, stats }) })
      .catch(() => { if (!cancelled) setYearError(true) })
    return () => { cancelled = true }
  }, [pickedYear])
  // Tallene hentes per skrivemåte; summer og rangér per gruppe
  const activeYearStats = useMemo(
    () => (pickedYear !== null && rawYearStats?.year === pickedYear ? groupYearStats(names, rawYearStats.stats) : undefined),
    [pickedYear, rawYearStats, names],
  )
  const yearLoading = pickedYear !== null && !activeYearStats && !yearError

  const letters = useMemo(() => availableLetters(names), [names])
  const attrCount = attrs.letters.length + attrs.length.length + attrs.syllables.length
  const results = useMemo(
    () => searchNames(names, votes, { query, gender, vote: voteFilter, sort, latestYear, yearStats: activeYearStats }).filter((n) => matchesAttributes(n, attrs)),
    [names, votes, query, gender, voteFilter, sort, latestYear, activeYearStats, attrs],
  )

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 px-4 py-4">
      <div>
        <h2 className="text-lg font-semibold">Alle navn</h2>
        <p className="text-xs text-muted-foreground">Finn et navn og se eller endre din egen vurdering. Bare du ser vurderingene dine.</p>
      </div>

      <Input
        value={query}
        onChange={(e) => { setQuery(e.target.value); setLimit(PAGE) }}
        placeholder="Søk etter navn"
        aria-label="Søk etter navn"
        autoComplete="off"
      />
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Kjønn">
          <Chip active={gender === 'all'} onClick={() => { setGender('all'); setLimit(PAGE) }}>Alle kjønn</Chip>
          {(['girl', 'boy'] as const).map((g) => (
            <Chip key={g} active={gender === g} onClick={() => { setGender(g); setLimit(PAGE) }}>{GENDER_LABEL[g]}</Chip>
          ))}
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Din vurdering">
          {(Object.keys(VOTE_FILTER_LABEL) as VoteFilter[]).map((k) => (
            <Chip key={k} active={voteFilter === k} onClick={() => { setVoteFilter(k); setLimit(PAGE) }}>{VOTE_FILTER_LABEL[k]}</Chip>
          ))}
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Sortering">
          {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
            <Chip key={k} active={sort === k} onClick={() => { setSort(k); setLimit(PAGE) }}>{SORT_LABEL[k]}</Chip>
          ))}
        </div>
        {(sort === 'popular' || sort === 'fewest') && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            {sort === 'popular' ? 'Rangert etter popularitet i' : 'Antall fødte i'}
            <select
              value={year ?? latestYear}
              onChange={(e) => { setYear(Number(e.target.value)); setLimit(PAGE) }}
              className="h-8 rounded-md border border-input bg-transparent px-2 text-sm text-foreground"
              aria-label="År for rangering"
            >
              {Array.from({ length: latestYear - FIRST_YEAR + 1 }, (_, i) => latestYear - i).map((y) => (
                <option key={y} value={y} className="bg-background">{y}</option>
              ))}
            </select>
            {yearLoading && <span>Henter …</span>}
            {yearError && <span className="text-destructive">Kunne ikke hente tall for året.</span>}
          </label>
        )}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowAttrs((v) => !v)} aria-expanded={showAttrs}>
            <SlidersHorizontal /> Forbokstav, lengde, stavelser{attrCount > 0 && <span className="ml-0.5 rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">{attrCount}</span>}
          </Button>
          {attrCount > 0 && <Button variant="ghost" size="sm" onClick={() => { setAttrs(DEFAULT_ATTRIBUTE_FILTERS); setLimit(PAGE) }}>Nullstill</Button>}
        </div>
        {showAttrs && (
          <div className="space-y-4 rounded-2xl border border-border bg-card/50 p-4">
            <AttributeFilterGroups value={attrs} onChange={(patch) => { setAttrs((a) => ({ ...a, ...patch })); setLimit(PAGE) }} letters={letters} />
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground" aria-live="polite">{results.length} {results.length === 1 ? 'navn' : 'navn'}</p>

      {results.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">Ingen navn passer søket.</div>
      ) : (
        <ul className="space-y-2">
          {results.slice(0, limit).map((n) => {
            const current = votes.get(n.id)
            return (
              <li key={n.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
                <button type="button" onClick={() => setDetail(n)} className="min-w-0 flex-1 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Vis detaljer for ${n.name}`}>
                  <GenderTag gender={n.gender} />
                  <p className="truncate text-xl font-semibold tracking-tight">{n.name}</p>
                  {variantLine(n) && <p className="truncate text-xs text-muted-foreground/80">{variantLine(n)}</p>}
                  <p className="text-xs text-muted-foreground">{activeYearStats
                      ? yearLine(activeYearStats.get(n.id), n.gender, pickedYear!)
                      : (rankLine(n, latestYear) ?? `Ikke registrert i ${latestYear}`)
                        + (sort === 'fewest' && n.latestYear === latestYear ? ` · ${n.latestCount} barn i ${latestYear}` : '')}</p>
                </button>
                <div className="flex shrink-0 gap-1.5" role="group" aria-label={`Vurdering av ${n.name}`}>
                  {VOTE_BUTTONS.map(({ vote: v, label, Icon, active }) => (
                    <Button
                      key={v}
                      variant="outline"
                      size="icon"
                      aria-label={`${label} til ${n.name}`}
                      aria-pressed={current === v}
                      // Trykk på aktiv vurdering fjerner den, så navnet kommer tilbake i swipe-bunken
                      onClick={() => void vote(n.id, current === v ? null : v)}
                      className={cn(current === v ? active : 'text-muted-foreground')}
                    ><Icon /></Button>
                  ))}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {results.length > limit && (
        <div className="text-center"><Button variant="outline" size="sm" onClick={() => setLimit((l) => l + PAGE)}>Vis flere</Button></div>
      )}
      <NameDetailDialog name={detail} latestYear={latestYear} onClose={() => setDetail(null)} />
    </div>
  )
}
