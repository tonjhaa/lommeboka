import { useMemo, useState } from 'react'
import { Check, HelpCircle, SlidersHorizontal, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useNavnejaktStore } from '@/store/useNavnejaktStore'
import { searchNames, SORT_LABEL, VOTE_FILTER_LABEL, type SortKey, type VoteFilter } from '@/lib/names/browse'
import { availableLetters, DEFAULT_ATTRIBUTE_FILTERS, matchesAttributes, type AttributeFilters } from '@/lib/names/filters'
import { rankLine } from '@/lib/names/format'
import { GENDER_LABEL, type Gender, type NameRow, type Vote } from '@/lib/names/types'
import { cn } from '@/lib/utils'
import { AttributeFilterGroups } from './AttributeFilterGroups'
import { NameDetailDialog } from './NameDetailDialog'
import { Chip, GenderTag } from './shared'

const PAGE = 60

const VOTE_BUTTONS: Array<{ vote: Vote; label: string; Icon: typeof X; active: string }> = [
  { vote: 'no', label: 'Nei', Icon: X, active: 'border-destructive bg-destructive/15 text-destructive' },
  { vote: 'maybe', label: 'Kanskje', Icon: HelpCircle, active: 'border-primary bg-primary/15 text-primary' },
  { vote: 'yes', label: 'Ja', Icon: Check, active: 'border-success bg-success/15 text-success' },
]

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
  const [attrs, setAttrs] = useState<AttributeFilters>(DEFAULT_ATTRIBUTE_FILTERS)
  const [showAttrs, setShowAttrs] = useState(false)
  const [limit, setLimit] = useState(PAGE)
  const [detail, setDetail] = useState<NameRow | null>(null)

  const letters = useMemo(() => availableLetters(names), [names])
  const attrCount = attrs.letters.length + attrs.length.length + attrs.syllables.length
  const results = useMemo(
    () => searchNames(names, votes, { query, gender, vote: voteFilter, sort, latestYear }).filter((n) => matchesAttributes(n, attrs)),
    [names, votes, query, gender, voteFilter, sort, latestYear, attrs],
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
                  <p className="text-xs text-muted-foreground">{rankLine(n, latestYear) ?? `Ikke registrert i ${latestYear}`}</p>
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
