import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, RefreshCw, CheckCircle2, XCircle, Sparkles, TrendingDown } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useBoligsokStore } from '@/store/useBoligsokStore'
import type { AiAnbefaling, BoligAnnonse, BoligsokStatus } from '@/types/boligsok'

function fmtNOK(n: number | null) {
  if (n == null) return '–'
  return Math.round(n).toLocaleString('no-NO') + ' kr'
}

function fmtDagerSiden(dato: string | null) {
  if (!dato) return null
  const dager = Math.floor((Date.now() - new Date(dato).getTime()) / 86_400_000)
  if (dager <= 0) return 'i dag'
  if (dager === 1) return '1 dag siden'
  return `${dager} dager siden`
}

const STATUS_LABELS: Record<BoligsokStatus, string> = {
  ny: 'Ny',
  sett: 'Sett',
  interessant: 'Interessant',
  avslatt: 'Avslått',
}

const KILDE_LABELS: Record<BoligAnnonse['kilde'], string> = {
  finn: 'Finn.no',
  hjem: 'hjem.no',
}

const ANBEFALING_RANK: Record<AiAnbefaling, number> = { anbefales: 0, vurder: 1, neppe: 2 }

// Speiler HealthRing i HeroBand (samme fargeterskler/idiom for "AI-vurdert score" ett sted i appen fra før),
// men diskret tre-trinns i stedet for kontinuerlig 0–100 — anbefalingen er en kategori, ikke et tall.
const ANBEFALING_RING: Record<AiAnbefaling, { color: string; fill: number; label: string }> = {
  anbefales: { color: '#22c55e', fill: 1, label: 'Anbefales' },
  vurder: { color: '#f59e0b', fill: 0.5, label: 'Verdt å vurdere' },
  neppe: { color: '#71717a', fill: 0.12, label: 'Neppe aktuell' },
}

function AnbefalingRing({ anbefaling }: { anbefaling: AiAnbefaling }) {
  const { color, fill } = ANBEFALING_RING[anbefaling]
  const r = 7
  const circ = 2 * Math.PI * r
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" className="shrink-0">
      <circle cx="9" cy="9" r={r} fill="none" stroke="hsl(var(--border))" strokeWidth="2.5" />
      <circle
        cx="9" cy="9" r={r}
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeDasharray={`${fill * circ} ${circ}`}
        strokeLinecap="round"
        transform="rotate(-90 9 9)"
      />
    </svg>
  )
}

function KravRad({ oppfylt, label }: { oppfylt: boolean; label: string }) {
  return (
    <span className={cn('flex items-center gap-1 text-xs', oppfylt ? 'text-foreground' : 'text-muted-foreground')}>
      {oppfylt ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> : <XCircle className="h-3.5 w-3.5 text-red-400" />}
      {label}
    </span>
  )
}

/** Soft preferanse, ikke hardt krav — amber i stedet for rødt når fraværende, og skjules helt når ukjent */
function KjokkenBadge({ adskilt }: { adskilt: boolean | null }) {
  if (adskilt === null) return null
  return (
    <span className={cn('flex items-center gap-1 text-xs', adskilt ? 'text-foreground' : 'text-muted-foreground')}>
      {adskilt ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> : <XCircle className="h-3.5 w-3.5 text-warning" />}
      {adskilt ? 'Eget kjøkken' : 'Åpent kjøkken'}
    </span>
  )
}

function AnnonseCard({ annonse }: { annonse: BoligAnnonse }) {
  const setStatus = useBoligsokStore((s) => s.setStatus)
  const setNotat = useBoligsokStore((s) => s.setNotat)
  const [notatDraft, setNotatDraft] = useState(annonse.notat ?? '')

  const pris = annonse.totalpris ?? annonse.prisantydning
  const areal = annonse.primaerrom_m2 ?? annonse.bruksareal_m2
  const ring = ANBEFALING_RING[annonse.ai_anbefaling]

  return (
    <Card className={cn('flex flex-col', !annonse.aktiv && 'opacity-50')}>
      <CardContent className="p-4 space-y-2.5 flex flex-col flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <AnbefalingRing anbefaling={annonse.ai_anbefaling} />
              <h3 className="text-sm font-semibold truncate">{annonse.tittel ?? 'Uten tittel'}</h3>
              {!annonse.aktiv && <span className="text-[10px] font-semibold uppercase tracking-wider text-destructive shrink-0">Solgt</span>}
            </div>
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {[annonse.adresse, annonse.bydel].filter(Boolean).join(', ') || 'Ukjent adresse'}
              {' · '}{KILDE_LABELS[annonse.kilde]}
              {fmtDagerSiden(annonse.annonsert_dato) && ` · ${fmtDagerSiden(annonse.annonsert_dato)}`}
            </p>
          </div>
          <a
            href={annonse.url}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 inline-flex items-center gap-1 text-xs text-primary hover:underline mt-0.5"
          >
            Se annonse <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        <div className="flex items-baseline gap-4">
          <p className="font-mono tabular-nums font-semibold text-sm">{fmtNOK(pris)}</p>
          <p className="font-mono tabular-nums text-xs text-muted-foreground">
            {annonse.soverom != null ? `${annonse.soverom} sov` : '–'}
            {areal != null && ` · ${areal} m²`}
          </p>
          {annonse.prisnedgang && (
            <span className="flex items-center gap-1 text-xs text-green-500 font-medium">
              <TrendingDown className="h-3 w-3" /> Prisnedgang
            </span>
          )}
        </div>

        {annonse.ai_vurdering && (
          <p className="flex gap-1.5 text-xs text-muted-foreground border-l-2 pl-2" style={{ borderColor: ring.color }}>
            <Sparkles className="h-3 w-3 shrink-0 mt-0.5 text-muted-foreground" />
            <span>{annonse.ai_vurdering}</span>
          </p>
        )}

        {annonse.fellesutgifter != null && (
          <p className="text-[11px] text-muted-foreground">
            Fellesutgifter <span className="font-mono tabular-nums">{fmtNOK(annonse.fellesutgifter)}/mnd</span>
            {annonse.in_ordning && <span className="text-warning"> · IN-ordning — sjekk reell kostnad</span>}
          </p>
        )}

        <div className="flex items-center gap-3">
          <KravRad oppfylt={annonse.balkong} label="Balkong" />
          <KravRad oppfylt={annonse.garasje} label="Garasje" />
          <KjokkenBadge adskilt={annonse.kjokken_adskilt} />
        </div>

        {annonse.raw_snippet && (
          <p className="text-[11px] text-muted-foreground italic">{annonse.raw_snippet}</p>
        )}

        <div className="flex items-center gap-2 pt-1 mt-auto">
          <Select value={annonse.status} onValueChange={(v) => setStatus(annonse.id, v as BoligsokStatus)}>
            <SelectTrigger className="h-7 w-32 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(STATUS_LABELS) as BoligsokStatus[]).map((s) => (
                <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <input
            value={notatDraft}
            onChange={(e) => setNotatDraft(e.target.value)}
            onBlur={() => { if (notatDraft !== (annonse.notat ?? '')) setNotat(annonse.id, notatDraft) }}
            placeholder="Notat…"
            className="flex-1 h-7 rounded-md border border-border bg-input px-2 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </CardContent>
    </Card>
  )
}

type Visfilter = 'alle' | 'anbefales' | 'vurder'

const SOVEROM_OPTIONS = [0, 2, 3, 4] as const
const AREAL_OPTIONS = [0, 65, 70, 80, 90] as const

function StatTile({ label, value, active, accent, onClick }: { label: string; value: number; active: boolean; accent?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'text-left rounded-lg border bg-card px-4 py-3 transition-colors',
        active ? 'border-primary ring-1 ring-primary' : 'border-border hover:border-muted-foreground/40'
      )}
    >
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="font-mono tabular-nums font-semibold text-lg mt-0.5" style={accent ? { color: accent } : undefined}>
        {value}
      </p>
    </button>
  )
}

export function BoligsokPage() {
  const annonser = useBoligsokStore((s) => s.annonser)
  const loading = useBoligsokStore((s) => s.loading)
  const error = useBoligsokStore((s) => s.error)
  const fetchAnnonser = useBoligsokStore((s) => s.fetchAnnonser)
  const subscribe = useBoligsokStore((s) => s.subscribe)
  const unsubscribe = useBoligsokStore((s) => s.unsubscribe)

  const [visFilter, setVisFilter] = useState<Visfilter>('alle')
  const [minSoverom, setMinSoverom] = useState(0)
  const [minAreal, setMinAreal] = useState(0)
  const [visSolgte, setVisSolgte] = useState(false)

  useEffect(() => {
    fetchAnnonser()
    subscribe()
    return () => unsubscribe()
  }, [fetchAnnonser, subscribe, unsubscribe])

  const sortert = useMemo(
    () =>
      [...annonser].sort((a, b) => {
        const rankDiff = ANBEFALING_RANK[a.ai_anbefaling] - ANBEFALING_RANK[b.ai_anbefaling]
        if (rankDiff !== 0) return rankDiff
        return b.created_at.localeCompare(a.created_at)
      }),
    [annonser]
  )

  const filtrerte = useMemo(() => {
    return sortert.filter((a) => {
      if (!visSolgte && !a.aktiv) return false
      if (visFilter !== 'alle' && a.ai_anbefaling !== visFilter) return false
      if (minSoverom > 0 && (a.soverom ?? 0) < minSoverom) return false
      const areal = a.primaerrom_m2 ?? a.bruksareal_m2 ?? 0
      if (minAreal > 0 && areal < minAreal) return false
      return true
    })
  }, [sortert, visFilter, minSoverom, minAreal, visSolgte])

  const antallSolgte = annonser.filter((a) => !a.aktiv).length
  const aktive = annonser.filter((a) => a.aktiv)

  const antallAnbefales = aktive.filter((a) => a.ai_anbefaling === 'anbefales').length
  const antallVurder = aktive.filter((a) => a.ai_anbefaling === 'vurder').length

  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Boligsøk</h2>
        <Button variant="outline" size="sm" onClick={() => fetchAnnonser()} disabled={loading}>
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <StatTile label="Alle" value={aktive.length} active={visFilter === 'alle'} onClick={() => setVisFilter('alle')} />
        <StatTile label="Anbefales" value={antallAnbefales} active={visFilter === 'anbefales'} accent="#22c55e" onClick={() => setVisFilter('anbefales')} />
        <StatTile label="Verdt å vurdere" value={antallVurder} active={visFilter === 'vurder'} accent="#f59e0b" onClick={() => setVisFilter('vurder')} />
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Min. soverom</span>
          <Select value={String(minSoverom)} onValueChange={(v) => setMinSoverom(Number(v))}>
            <SelectTrigger className="h-7 w-20 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SOVEROM_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)}>{n === 0 ? 'Alle' : `${n}+`}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Min. areal</span>
          <Select value={String(minAreal)} onValueChange={(v) => setMinAreal(Number(v))}>
            <SelectTrigger className="h-7 w-24 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AREAL_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)}>{n === 0 ? 'Alle' : `${n} m²`}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {antallSolgte > 0 && (
          <button
            onClick={() => setVisSolgte((v) => !v)}
            className="text-[11px] text-muted-foreground hover:text-foreground ml-auto"
          >
            {visSolgte ? 'Skjul' : 'Vis'} solgte ({antallSolgte})
          </button>
        )}
      </div>

      {error && <p className="text-sm text-destructive">Kunne ikke laste boligannonser: {error}</p>}

      {!loading && filtrerte.length === 0 && (
        <div className="text-center py-12 text-sm text-muted-foreground">
          {annonser.length === 0
            ? 'Ingen annonser ennå. De dukker opp her når det lagrede søket ditt finner nye treff og den daglige synkroniseringen har kjørt.'
            : 'Ingen annonser matcher filteret.'}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {filtrerte.map((a) => <AnnonseCard key={a.id} annonse={a} />)}
      </div>
    </div>
  )
}
