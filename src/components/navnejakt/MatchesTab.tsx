import { useEffect, useMemo, useState } from 'react'
import { MessageSquare, Star } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useNavnejaktStore } from '@/store/useNavnejaktStore'
import { MATCH_SORT_LABEL, sortMatches, type MatchEntry, type MatchSort } from '@/lib/names/matches'
import { formatDate, rankLine, trendLine } from '@/lib/names/format'
import { NOTE_MAX_LENGTH, type MatchNote, type NameRow } from '@/lib/names/types'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { NameDetailDialog } from './NameDetailDialog'
import { Chip, GenderTag, TrendIcon } from './shared'

export function MatchesTab({ connected, partnerName }: { connected: boolean; partnerName: string }) {
  const matches = useNavnejaktStore((s) => s.matches)
  const namesById = useNavnejaktStore((s) => s.namesById)
  const favorites = useNavnejaktStore((s) => s.favorites)
  const latestYear = useNavnejaktStore((s) => s.latestYear)
  const toggleFavorite = useNavnejaktStore((s) => s.toggleFavorite)
  const notes = useNavnejaktStore((s) => s.notes)
  const userId = useNavnejaktStore((s) => s.userId)
  const saveNote = useNavnejaktStore((s) => s.saveNote)
  const refreshNotes = useNavnejaktStore((s) => s.refreshNotes)
  const markMatchesSeen = useNavnejaktStore((s) => s.markMatchesSeen)
  const seenIds = useNavnejaktStore((s) => (s.userId ? s.seenMatchIds[s.userId] : undefined))
  // Matcher som var usett da fanen ble åpnet, får «Ny»-merke mens fanen er åpen
  const [newIds] = useState(() => new Set(matches.filter((m) => !(seenIds ?? []).includes(m.id)).map((m) => m.id)))
  const [editing, setEditing] = useState<string | null>(null)
  const [sort, setSort] = useState<MatchSort>('newest')
  const [onlyFavs, setOnlyFavs] = useState(false)
  const [detail, setDetail] = useState<NameRow | null>(null)

  useEffect(() => { void refreshNotes() }, [refreshNotes])
  // Marker som sett litt etter at listen er vist, slik at «Ny»-merket rekker å bli lest
  const unseenNow = matches.some((m) => !(seenIds ?? []).includes(m.id))
  useEffect(() => {
    if (!unseenNow) return
    const t = setTimeout(() => markMatchesSeen(), 1500)
    return () => clearTimeout(t)
  }, [unseenNow, markMatchesSeen])

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
              <li key={match.id} className="rounded-2xl border border-border bg-card px-4 py-3">
                <div className="flex items-center gap-3">
                <button type="button" onClick={() => setDetail(name)} className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md" aria-label={`Vis detaljer for ${name.name}`}>
                  <span className="flex items-center gap-2"><GenderTag gender={name.gender} />{newIds.has(match.id) && <span className="rounded-full bg-primary px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider text-primary-foreground">Ny</span>}</span>
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
                  onClick={() => setEditing(editing === name.id ? null : name.id)}
                  aria-expanded={editing === name.id}
                  aria-label={`Notat om ${name.name}`}
                  className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', notes.some((n) => n.nameId === name.id) ? 'text-primary' : 'text-muted-foreground')}
                ><MessageSquare className="h-5 w-5" /></button>
                <button
                  type="button"
                  onClick={() => void toggleFavorite(name.id)}
                  aria-pressed={fav}
                  aria-label={fav ? `Fjern ${name.name} som favoritt` : `Marker ${name.name} som favoritt`}
                  className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', fav ? 'text-warning' : 'text-muted-foreground')}
                ><Star className={cn('h-5 w-5', fav && 'fill-current')} /></button>
                </div>
                <NoteSection
                  notes={notes.filter((n) => n.nameId === name.id)}
                  userId={userId}
                  partnerName={partnerName}
                  editing={editing === name.id}
                  onEdit={() => setEditing(name.id)}
                  onClose={() => setEditing(null)}
                  onSave={(text) => saveNote(name.id, text)}
                />
              </li>
            )
          })}
        </ul>
      )}
      <NameDetailDialog name={detail} latestYear={latestYear} onClose={() => setDetail(null)} />
    </div>
  )
}

function NoteSection({ notes, userId, partnerName, editing, onEdit, onClose, onSave }: {
  notes: MatchNote[]; userId: string | null; partnerName: string; editing: boolean
  onEdit: () => void; onClose: () => void; onSave: (text: string) => Promise<void>
}) {
  const mine = notes.find((n) => n.userId === userId)
  const theirs = notes.filter((n) => n.userId !== userId)
  const [draft, setDraft] = useState(mine?.note ?? '')
  const [saving, setSaving] = useState(false)

  if (!editing && !mine && theirs.length === 0) return null

  async function submit(text: string) {
    setSaving(true)
    try { await onSave(text); onClose() } finally { setSaving(false) }
  }

  return (
    <div className="mt-3 space-y-2 border-t border-border/60 pt-3">
      {[...(mine ? [mine] : []), ...theirs].map((n) => (
        !(editing && n.userId === userId) && (
          <p key={n.userId} className="text-sm">
            <span className="text-xs font-medium text-muted-foreground">{n.userId === userId ? 'Du' : partnerName}: </span>
            {n.note}
            {n.userId === userId && <button type="button" onClick={() => { setDraft(n.note); onEdit() }} className="ml-2 text-xs text-primary hover:underline">Rediger</button>}
          </p>
        )
      ))}
      {editing && (
        <div className="space-y-2">
          <label className="sr-only" htmlFor="match-note">Ditt notat</label>
          <textarea
            id="match-note"
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, NOTE_MAX_LENGTH))}
            rows={2}
            maxLength={NOTE_MAX_LENGTH}
            placeholder="F.eks. «etter bestemor»"
            className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">{draft.length}/{NOTE_MAX_LENGTH} · synlig for begge</span>
            <div className="flex gap-1">
              {mine && <Button variant="ghost" size="sm" disabled={saving} onClick={() => void submit('')}>Slett</Button>}
              <Button variant="ghost" size="sm" onClick={onClose}>Avbryt</Button>
              <Button size="sm" disabled={saving || draft.trim().length === 0} onClick={() => void submit(draft)}>Lagre</Button>
            </div>
          </div>
        </div>
      )}
      {!editing && !mine && theirs.length > 0 && (
        <button type="button" onClick={() => { setDraft(''); onEdit() }} className="text-xs text-primary hover:underline">Legg til ditt notat</button>
      )}
    </div>
  )
}
