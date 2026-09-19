import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Heart, Info, SlidersHorizontal, Undo2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useNavnejaktStore } from '@/store/useNavnejaktStore'
import { buildDeck } from '@/lib/names/deck'
import { activeFilterCount, DEFAULT_FILTERS } from '@/lib/names/filters'
import { countLine, rankLine, trendLine } from '@/lib/names/format'
import type { NameRow, Vote } from '@/lib/names/types'
import { cn } from '@/lib/utils'
import { FilterDialog } from './FilterDialog'
import { NameDetailDialog } from './NameDetailDialog'
import { GenderTag, SyncButton, TrendIcon } from './shared'

type Dir = 'left' | 'right' | 'up'
const DIR_TO_VOTE: Record<Dir, Vote> = { left: 'no', right: 'yes', up: 'maybe' }
const SWIPE_THRESHOLD = 96
const EXIT_MS = 190

const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

function exitTransform(dir: Dir): string {
  if (dir === 'left') return 'translateX(-130%) rotate(-16deg)'
  if (dir === 'right') return 'translateX(130%) rotate(16deg)'
  return 'translateY(-40%) scale(0.92)'
}

function SwipeCard({ name, latestYear, leaving, onSwipe, onInfo }: {
  name: NameRow; latestYear: number; leaving: Dir | null; onSwipe: (d: Dir) => void; onInfo: () => void
}) {
  const [dx, setDx] = useState(0)
  const [dragging, setDragging] = useState(false)
  const startX = useRef(0)
  const moved = useRef(false)

  const rank = rankLine(name, latestYear)
  const intent = Math.max(-1, Math.min(1, dx / SWIPE_THRESHOLD))

  const style: React.CSSProperties = leaving
    ? { transform: exitTransform(leaving), opacity: 0, transition: `transform ${EXIT_MS}ms ease-in, opacity ${EXIT_MS}ms ease-in` }
    : {
        transform: `translateX(${dx}px) rotate(${dx / 22}deg)`,
        transition: dragging ? 'none' : 'transform 220ms cubic-bezier(0.2, 0.9, 0.3, 1.2)',
      }

  return (
    <div
      role="group"
      aria-roledescription="navnekort"
      aria-label={`${name.name}, ${countLine(name, latestYear)}`}
      className="absolute inset-0 touch-pan-y select-none cursor-grab active:cursor-grabbing"
      style={style}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('button')) return
        startX.current = e.clientX
        moved.current = false
        setDragging(true)
        try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* pekeren kan være syntetisk/avsluttet — draing virker uten capture */ }
      }}
      onPointerMove={(e) => {
        if (!dragging) return
        const delta = e.clientX - startX.current
        if (Math.abs(delta) > 4) moved.current = true
        setDx(delta)
      }}
      onPointerUp={() => {
        if (!dragging) return
        setDragging(false)
        if (dx > SWIPE_THRESHOLD) onSwipe('right')
        else if (dx < -SWIPE_THRESHOLD) onSwipe('left')
        else {
          setDx(0)
          if (!moved.current) onInfo()
        }
      }}
      onPointerCancel={() => { setDragging(false); setDx(0) }}
    >
      <div className="relative flex h-full flex-col items-center justify-center rounded-3xl border border-border bg-card px-6 text-center shadow-lg">
        <span
          aria-hidden
          className="absolute left-5 top-5 rounded-md border-2 border-destructive/70 px-2 py-0.5 text-sm font-semibold uppercase tracking-widest text-destructive"
          style={{ opacity: Math.max(0, -intent) }}
        >Nei</span>
        <span
          aria-hidden
          className="absolute right-5 top-5 rounded-md border-2 border-success/70 px-2 py-0.5 text-sm font-semibold uppercase tracking-widest text-success"
          style={{ opacity: Math.max(0, intent) }}
        >Ja</span>

        <button
          type="button"
          onClick={onInfo}
          aria-label={`Vis detaljer for ${name.name}`}
          className="absolute bottom-4 right-4 flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        ><Info className="h-5 w-5" /></button>

        <GenderTag gender={name.gender} />
        <h2 className="mt-3 max-w-full break-words text-5xl font-semibold tracking-tight sm:text-7xl">{name.name}</h2>

        <div className="mt-8 space-y-1 text-sm text-muted-foreground">
          <p>{countLine(name, latestYear)}</p>
          <p className="flex flex-col items-center justify-center gap-x-1.5 gap-y-0.5 sm:flex-row">
            {rank && <span className="whitespace-nowrap font-medium text-foreground/80">{rank}</span>}
            {rank && <span aria-hidden className="hidden sm:inline">·</span>}
            <span className="inline-flex items-center gap-1 whitespace-nowrap"><TrendIcon trend={name.trend} />{trendLine(name.trend)}</span>
          </p>
        </div>
      </div>
    </div>
  )
}

function ActionButton({ label, hint, onClick, disabled, className, children }: {
  label: string; hint: string; onClick: () => void; disabled?: boolean; className?: string; children: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={`${label} (${hint})`}
        className={cn(
          'flex h-16 w-16 items-center justify-center rounded-full border-2 transition-transform active:scale-90 disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background [&_svg]:h-7 [&_svg]:w-7',
          className,
        )}
      >{children}</button>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
    </div>
  )
}

export function SwipeTab() {
  const names = useNavnejaktStore((s) => s.names)
  const votes = useNavnejaktStore((s) => s.votes)
  const filters = useNavnejaktStore((s) => s.filters)
  const latestYear = useNavnejaktStore((s) => s.latestYear)
  const seed = useNavnejaktStore((s) => s.seed)
  const canUndo = useNavnejaktStore((s) => s.history.length > 0)
  const vote = useNavnejaktStore((s) => s.vote)
  const undo = useNavnejaktStore((s) => s.undo)
  const setFilters = useNavnejaktStore((s) => s.setFilters)

  const deck = useMemo(() => buildDeck(names, votes, filters, latestYear, seed), [names, votes, filters, latestYear, seed])
  const top = deck[0]
  const next = deck[1]

  const [leaving, setLeaving] = useState<{ id: string; dir: Dir } | null>(null)
  const [filterOpen, setFilterOpen] = useState(false)
  const [detail, setDetail] = useState<NameRow | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const filterCount = activeFilterCount(filters)

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const commit = useCallback((dir: Dir) => {
    if (!top || leaving) return
    const id = top.id
    if (prefersReducedMotion()) { void vote(id, DIR_TO_VOTE[dir]); return }
    setLeaving({ id, dir })
    timer.current = setTimeout(() => {
      void vote(id, DIR_TO_VOTE[dir])
      setLeaving(null)
    }, EXIT_MS)
  }, [top, leaving, vote])

  // Tastatur: ← nei, → ja, ↓ kanskje, Z angre, I detaljer
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (document.querySelector('[role="dialog"]')) return
      if (e.key === 'ArrowLeft') { e.preventDefault(); commit('left') }
      else if (e.key === 'ArrowRight') { e.preventDefault(); commit('right') }
      else if (e.key === 'ArrowDown') { e.preventDefault(); commit('up') }
      else if (e.key === 'z' || e.key === 'Z') { void undo() }
      else if ((e.key === 'i' || e.key === 'I') && top) setDetail(top)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [commit, undo, top])

  return (
    <div className="mx-auto flex h-full w-full max-w-md flex-col px-4 pb-4 pt-3">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {names.length > 0 ? `${deck.length} ${deck.length === 1 ? 'navn' : 'navn'} igjen` : ''}
        </p>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => void undo()} disabled={!canUndo} aria-label="Angre forrige vurdering (Z)">
            <Undo2 /> Angre
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setFilterOpen(true)} aria-label="Åpne filtre">
            <SlidersHorizontal /> Filtre{filterCount > 0 && <span className="ml-0.5 rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">{filterCount}</span>}
          </Button>
        </div>
      </div>

      <div className="relative min-h-[17rem] flex-1">
        {top ? (
          <>
            {next && (
              <div aria-hidden className="absolute inset-0 scale-[0.95] translate-y-2 rounded-3xl border border-border bg-card/70 flex items-center justify-center">
                <span className="text-4xl font-semibold tracking-tight text-muted-foreground/25 sm:text-6xl">{next.name}</span>
              </div>
            )}
            <SwipeCard
              key={top.id}
              name={top}
              latestYear={latestYear}
              leaving={leaving?.id === top.id ? leaving.dir : null}
              onSwipe={commit}
              onInfo={() => setDetail(top)}
            />
            <p className="sr-only" aria-live="polite">Nytt navn: {top.name}</p>
          </>
        ) : (
          <EmptyDeck hasNames={names.length > 0} filtered={filterCount > 0} onReset={() => setFilters(DEFAULT_FILTERS)} onFilters={() => setFilterOpen(true)} />
        )}
      </div>

      <div className="mt-5 flex items-start justify-center gap-6">
        <ActionButton label="Nei" hint="pil venstre" onClick={() => commit('left')} disabled={!top} className="border-destructive/50 text-destructive hover:bg-destructive/10"><X /></ActionButton>
        <ActionButton label="Kanskje" hint="pil ned" onClick={() => commit('up')} disabled={!top} className="border-border text-muted-foreground hover:bg-muted"><Heart /></ActionButton>
        <ActionButton label="Ja" hint="pil høyre" onClick={() => commit('right')} disabled={!top} className="border-success/60 text-success hover:bg-success/10"><Check /></ActionButton>
      </div>
      <p className="mt-3 hidden text-center text-[11px] text-muted-foreground/70 sm:block">← nei · ↓ kanskje · → ja · Z angre · I detaljer</p>

      <FilterDialog open={filterOpen} onOpenChange={setFilterOpen} latestYear={latestYear} />
      <NameDetailDialog name={detail} latestYear={latestYear} onClose={() => setDetail(null)} />
    </div>
  )
}

function EmptyDeck({ hasNames, filtered, onReset, onFilters }: { hasNames: boolean; filtered: boolean; onReset: () => void; onFilters: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 rounded-3xl border border-dashed border-border px-6 text-center">
      {!hasNames ? (
        <>
          <h2 className="text-lg font-semibold">Ingen navnedata ennå</h2>
          <p className="max-w-xs text-sm text-muted-foreground">Navnene hentes fra SSBs statistikk over fødte etter fornavn og lagres i Lommeboka.</p>
          <SyncButton />
        </>
      ) : filtered ? (
        <>
          <h2 className="text-lg font-semibold">Ingen flere navn innenfor filtrene</h2>
          <p className="max-w-xs text-sm text-muted-foreground">Du har vurdert alle navn som passer. Juster eller nullstill filtrene for å se flere.</p>
          <div className="flex gap-2"><Button variant="outline" size="sm" onClick={onFilters}>Juster filtre</Button><Button size="sm" onClick={onReset}>Nullstill</Button></div>
        </>
      ) : (
        <>
          <h2 className="text-lg font-semibold">Du har vurdert alle navn</h2>
          <p className="max-w-xs text-sm text-muted-foreground">Ta en ny runde i Kanskje-listen, eller se matchene deres.</p>
          <Button variant="outline" size="sm" onClick={onFilters}>Ta med eldre navn</Button>
        </>
      )}
    </div>
  )
}
