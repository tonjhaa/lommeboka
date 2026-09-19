import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Trophy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useNavnejaktStore } from '@/store/useNavnejaktStore'
import * as api from '@/lib/names/api'
import { combineRankings, type JointEntry } from '@/lib/names/jointRanking'
import { rankLine } from '@/lib/names/format'
import { currentPair, finalRanking, isDone, pick, progress, startTournament, type FinalRank } from '@/lib/names/tournament'
import type { NameRow } from '@/lib/names/types'
import { cn } from '@/lib/utils'
import { GenderTag } from './shared'

/** Færrest matcher som gir en meningsfull finale. */
export const MIN_FINAL_NAMES = 4
const POLL_MS = 15000

interface Loaded {
  session: api.FinalSession | null
  run: api.FinalRun | null
  results: Array<{ userId: string; result: FinalRank[] }>
}

function groupLabel(rank: number): string {
  if (rank === 1) return 'Vinner'
  if (rank <= 3) return 'Topp 3'
  if (rank <= 5) return 'Topp 5'
  if (rank <= 10) return 'Topp 10'
  return 'Resten'
}

export function FinalTab({ connected, partnershipId, userId, partnerName }: {
  connected: boolean; partnershipId: string | null; userId: string; partnerName: string
}) {
  const matches = useNavnejaktStore((s) => s.matches)
  const namesById = useNavnejaktStore((s) => s.namesById)
  const latestYear = useNavnejaktStore((s) => s.latestYear)
  const [data, setData] = useState<Loaded | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const saveChain = useRef<Promise<void>>(Promise.resolve())

  const load = useCallback(async () => {
    if (!partnershipId) return
    try {
      const session = await api.fetchLatestFinal(partnershipId)
      if (!session) { setData({ session: null, run: null, results: [] }); return }
      const run = await api.fetchMyRun(session.id, userId)
      const results = run?.status === 'done' ? await api.fetchFinalResults(session.id) : []
      setData({ session, run, results })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [partnershipId, userId])

  useEffect(() => { void load() }, [load])

  // Vent på partneren: sjekk jevnlig til begge er ferdige
  const waiting = data?.run?.status === 'done' && data.results.length < 2
  useEffect(() => {
    if (!waiting) return
    const t = setInterval(() => { void load() }, POLL_MS)
    return () => clearInterval(t)
  }, [waiting, load])

  const nameOf = useCallback((id: string) => namesById.get(id)?.name ?? id, [namesById])

  async function begin(session: api.FinalSession) {
    const run: api.FinalRun = { state: startTournament(session.nameIds, Math.floor(Math.random() * 2 ** 31)), status: 'in_progress', result: null }
    setData({ session, run, results: [] })
    await api.saveRun(session.id, userId, run)
  }

  async function guard(fn: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    setError(null)
    try { await fn() } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }

  const startNew = () => guard(async () => {
    if (!partnershipId) return
    const session = await api.createFinal(partnershipId, userId, matches.map((m) => m.nameId))
    await begin(session)
  })

  /** Lagrer i rekkefølge slik at en eldre tilstand aldri overskriver en nyere. */
  function queueSave(finalId: string, run: api.FinalRun, after?: () => Promise<void>) {
    saveChain.current = saveChain.current
      .then(() => api.saveRun(finalId, userId, run))
      .then(after)
      .catch((e) => setError(`Kunne ikke lagre valget: ${e instanceof Error ? e.message : String(e)}`))
  }

  // Valget vises umiddelbart; lagringen skjer i bakgrunnen
  const choose = (winnerId: string) => {
    if (!data?.session || !data.run || data.run.status !== 'in_progress') return
    const pairNow = currentPair(data.run.state)
    if (!pairNow || !pairNow.includes(winnerId)) return
    const state = pick(data.run.state, winnerId)
    const done = isDone(state)
    const run: api.FinalRun = { state, status: done ? 'done' : 'in_progress', result: done ? finalRanking(state) : null }
    setData({ ...data, run })
    queueSave(data.session.id, run, done ? load : undefined)
  }

  // Tastatur i duellen: ← / →
  const pair = data?.run?.status === 'in_progress' ? currentPair(data.run.state) : null
  useEffect(() => {
    if (!pair) return
    function onKey(e: KeyboardEvent) {
      if (document.querySelector('[role="dialog"]')) return
      if (e.key === 'ArrowLeft') { e.preventDefault(); choose(pair![0]) }
      if (e.key === 'ArrowRight') { e.preventDefault(); choose(pair![1]) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const joint: JointEntry[] | null = useMemo(() => {
    if (!data || data.results.length < 2) return null
    const mine = data.results.find((r) => r.userId === userId)
    const theirs = data.results.find((r) => r.userId !== userId)
    return mine && theirs ? combineRankings(mine.result, theirs.result, nameOf) : null
  }, [data, userId, nameOf])

  const Header = (
    <div>
      <h2 className="flex items-center gap-2 text-lg font-semibold"><Trophy className="h-5 w-5 text-warning" aria-hidden /> Finalen</h2>
      <p className="text-xs text-muted-foreground">Matchene settes opp mot hverandre to og to. Dere rangerer hver for dere, og først når begge er ferdige lages en felles liste.</p>
    </div>
  )

  let body: React.ReactNode
  if (!connected) {
    body = <Notice>Koble til partneren din i Partner-fanen for å bruke Finalen.</Notice>
  } else if (!data) {
    body = <Notice>{error ? `Kunne ikke laste Finalen: ${error}` : 'Laster…'}</Notice>
  } else if (!data.session) {
    body = matches.length < MIN_FINAL_NAMES
      ? <Notice>Dere trenger minst {MIN_FINAL_NAMES} matcher for å starte Finalen. Dere har {matches.length}.</Notice>
      : (
        <div className="space-y-3 rounded-2xl border border-border bg-card p-5">
          <p className="text-sm">{matches.length} matcher er klare. Hvert oppgjør velger du det navnet du foretrekker.</p>
          <Button onClick={() => void startNew()} disabled={busy}>Start Finalen</Button>
        </div>
      )
  } else if (!data.run) {
    body = (
      <div className="space-y-3 rounded-2xl border border-border bg-card p-5">
        <p className="text-sm">Finalen er startet med {data.session.nameIds.length} navn. Start din egen rangering — {partnerName} ser ikke valgene dine før dere begge er ferdige.</p>
        <Button onClick={() => void guard(() => begin(data.session as api.FinalSession))} disabled={busy}>Start min rangering</Button>
      </div>
    )
  } else if (pair) {
    const [a, b] = pair.map((id) => namesById.get(id)) as [NameRow | undefined, NameRow | undefined]
    const p = progress(data.run.state, data.session.nameIds.length)
    body = (
      <div className="space-y-4">
        <div>
          <div className="mb-1 flex justify-between text-xs text-muted-foreground"><span>Runde {data.run.state.round}</span><span>{p.played} av {p.total} oppgjør</span></div>
          <div className="h-1.5 rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={p.total} aria-valuenow={p.played}>
            <div className="h-1.5 rounded-full bg-primary transition-all" style={{ width: `${p.total ? (p.played / p.total) * 100 : 0}%` }} />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
          <DuelCard name={a} latestYear={latestYear} disabled={false} onPick={() => choose(pair[0])} hint="←" />
          <p className="text-center text-xs font-semibold tracking-[0.3em] text-muted-foreground">VS.</p>
          <DuelCard name={b} latestYear={latestYear} disabled={false} onPick={() => choose(pair[1])} hint="→" />
        </div>
      </div>
    )
  } else if (!joint) {
    body = (
      <div className="space-y-2 rounded-2xl border border-border bg-card p-5">
        <p className="text-sm font-medium">Du er ferdig med din rangering.</p>
        <p className="text-sm text-muted-foreground" role="status">Venter på at {partnerName} blir ferdig. Den felles listen vises her så snart begge er ferdige.</p>
      </div>
    )
  } else {
    let lastGroup = ''
    body = (
      <div className="space-y-4">
        <ol className="space-y-2">
          {joint.map((e) => {
            const group = groupLabel(e.jointRank)
            const heading = group !== lastGroup ? group : null
            lastGroup = group
            const n = namesById.get(e.id)
            return (
              <li key={e.id}>
                {heading && <p className="mb-1.5 mt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{heading}</p>}
                <div className={cn('flex items-center gap-3 rounded-2xl border bg-card px-4 py-3', e.jointRank === 1 ? 'border-warning/50' : 'border-border')}>
                  <span className="w-8 text-center text-lg font-semibold tabular-nums text-muted-foreground">{e.jointRank}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xl font-semibold tracking-tight">{n?.name ?? e.id}</p>
                    <p className="text-xs text-muted-foreground">Du #{e.rankA} · {partnerName} #{e.rankB}</p>
                  </div>
                  {e.tied && <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">Delt plass</span>}
                </div>
              </li>
            )
          })}
        </ol>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Felles liste: summen av begge sine plasseringer (delte plasseringer regnes som snittet av plassene de deler). Navn med lik sum står likt — vi bruker ingen tilfeldig tie-breaker. Rekkefølgen innenfor en delt plass er alfabetisk kun for visning.
        </p>
        <Button variant="outline" size="sm" onClick={() => void startNew()} disabled={busy}>Start ny finale</Button>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 px-4 py-4">
      {Header}
      {error && data && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      {body}
    </div>
  )
}

function Notice({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">{children}</div>
}

function DuelCard({ name, latestYear, onPick, disabled, hint }: { name: NameRow | undefined; latestYear: number; onPick: () => void; disabled: boolean; hint: string }) {
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled || !name}
      aria-label={`Velg ${name?.name ?? 'navn'}`}
      className="flex min-h-40 flex-col items-center justify-center rounded-3xl border border-border bg-card px-4 py-6 text-center transition-all hover:border-primary/60 hover:bg-primary/5 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
    >
      {name && <GenderTag gender={name.gender} />}
      <span className="mt-2 max-w-full break-words text-4xl font-semibold tracking-tight">{name?.name ?? '…'}</span>
      {name && <span className="mt-3 text-xs text-muted-foreground">{rankLine(name, latestYear) ?? ' '}</span>}
      <span className="mt-3 hidden text-[11px] text-muted-foreground/60 sm:block" aria-hidden>{hint}</span>
    </button>
  )
}
