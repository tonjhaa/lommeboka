import { useEffect, useMemo, useState } from 'react'
import * as Slider from '@radix-ui/react-slider'
import { ExternalLink, RefreshCw, CheckCircle2, XCircle, Sparkles, TrendingDown } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { useBoligsokStore } from '@/store/useBoligsokStore'
import type {
  AiAnbefaling, BoligAnnonse, BoligsokStatus,
  BoligsokKjokkenFilter, BoligsokKildeFilter, BoligsokSortBy,
} from '@/types/boligsok'

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
  const markerSett = useBoligsokStore((s) => s.markerSett)
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
            onClick={() => markerSett(annonse.id)}
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

const KJOKKEN_FILTER_LABELS: Record<BoligsokKjokkenFilter, string> = {
  alle: 'Alle',
  adskilt: 'Eget kjøkken',
  apent: 'Åpent kjøkken',
}

const KILDE_FILTER_LABELS: Record<BoligsokKildeFilter, string> = {
  alle: 'Alle',
  finn: 'Finn.no',
  hjem: 'hjem.no',
}

const SORT_LABELS: Record<BoligsokSortBy, string> = {
  anbefaling: 'Anbefaling',
  nyest: 'Nyeste',
  pris_lav: 'Lavest pris',
  pris_hoy: 'Høyest pris',
  areal_stor: 'Størst areal',
  soverom_mange: 'Flest soverom',
  fellesutgift_lav: 'Lavest fellesutgift',
}

function sammenlign(a: BoligAnnonse, b: BoligAnnonse, sortBy: BoligsokSortBy): number {
  switch (sortBy) {
    case 'nyest': {
      const aDato = a.annonsert_dato ?? a.created_at
      const bDato = b.annonsert_dato ?? b.created_at
      return bDato.localeCompare(aDato)
    }
    case 'pris_lav':
      return (a.totalpris ?? a.prisantydning ?? Infinity) - (b.totalpris ?? b.prisantydning ?? Infinity)
    case 'pris_hoy':
      return (b.totalpris ?? b.prisantydning ?? -Infinity) - (a.totalpris ?? a.prisantydning ?? -Infinity)
    case 'areal_stor':
      return (b.primaerrom_m2 ?? b.bruksareal_m2 ?? -Infinity) - (a.primaerrom_m2 ?? a.bruksareal_m2 ?? -Infinity)
    case 'soverom_mange':
      return (b.soverom ?? -Infinity) - (a.soverom ?? -Infinity)
    case 'fellesutgift_lav':
      return (a.fellesutgifter ?? Infinity) - (b.fellesutgifter ?? Infinity)
    case 'anbefaling':
    default: {
      const rankDiff = ANBEFALING_RANK[a.ai_anbefaling] - ANBEFALING_RANK[b.ai_anbefaling]
      if (rankDiff !== 0) return rankDiff
      return b.created_at.localeCompare(a.created_at)
    }
  }
}

/** Kompakt slider til filterlinjen — matcher SliderRow-idiomet fra GiftPage, men inline i stedet for stablet */
function InlineSlider({
  label, value, min, max, step, onChange, format,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  format: (v: number) => string
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider shrink-0">{label}</span>
      <Slider.Root
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => onChange(v)}
        className="relative flex items-center select-none touch-none w-20 h-5"
      >
        <Slider.Track className="bg-border relative grow rounded-full h-1">
          <Slider.Range className="absolute bg-primary rounded-full h-full" />
        </Slider.Track>
        <Slider.Thumb className="block w-3.5 h-3.5 bg-background border-2 border-primary rounded-full shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50" />
      </Slider.Root>
      <span className="text-xs font-mono tabular-nums text-foreground shrink-0 w-9 text-right">{format(value)}</span>
    </div>
  )
}

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

  // UI-filter/sortering ligger i storen (persistert) slik at valgene overlever fane-bytte/reload
  const visFilter = useBoligsokStore((s) => s.visFilter)
  const minSoverom = useBoligsokStore((s) => s.minSoverom)
  const minAreal = useBoligsokStore((s) => s.minAreal)
  const maksTotalpris = useBoligsokStore((s) => s.maksTotalpris)
  const maksFellesutgift = useBoligsokStore((s) => s.maksFellesutgift)
  const kjokkenFilter = useBoligsokStore((s) => s.kjokkenFilter)
  const kildeFilter = useBoligsokStore((s) => s.kildeFilter)
  const kunGarasje = useBoligsokStore((s) => s.kunGarasje)
  const kunBalkong = useBoligsokStore((s) => s.kunBalkong)
  const kunPrisnedgang = useBoligsokStore((s) => s.kunPrisnedgang)
  const visSolgte = useBoligsokStore((s) => s.visSolgte)
  const sortBy = useBoligsokStore((s) => s.sortBy)
  const setVisFilter = useBoligsokStore((s) => s.setVisFilter)
  const setMinSoverom = useBoligsokStore((s) => s.setMinSoverom)
  const setMinAreal = useBoligsokStore((s) => s.setMinAreal)
  const setMaksTotalpris = useBoligsokStore((s) => s.setMaksTotalpris)
  const setMaksFellesutgift = useBoligsokStore((s) => s.setMaksFellesutgift)
  const setKjokkenFilter = useBoligsokStore((s) => s.setKjokkenFilter)
  const setKildeFilter = useBoligsokStore((s) => s.setKildeFilter)
  const setKunGarasje = useBoligsokStore((s) => s.setKunGarasje)
  const setKunBalkong = useBoligsokStore((s) => s.setKunBalkong)
  const setKunPrisnedgang = useBoligsokStore((s) => s.setKunPrisnedgang)
  const setVisSolgte = useBoligsokStore((s) => s.setVisSolgte)
  const setSortBy = useBoligsokStore((s) => s.setSortBy)

  useEffect(() => {
    fetchAnnonser()
    subscribe()
    return () => unsubscribe()
  }, [fetchAnnonser, subscribe, unsubscribe])

  const sortert = useMemo(
    () => [...annonser].sort((a, b) => sammenlign(a, b, sortBy)),
    [annonser, sortBy]
  )

  const filtrerte = useMemo(() => {
    return sortert.filter((a) => {
      if (!visSolgte && !a.aktiv) return false
      if (visFilter !== 'alle' && a.ai_anbefaling !== visFilter) return false
      if (minSoverom > 0 && (a.soverom ?? 0) < minSoverom) return false
      const areal = a.primaerrom_m2 ?? a.bruksareal_m2 ?? 0
      if (minAreal > 0 && areal < minAreal) return false
      const pris = a.totalpris ?? a.prisantydning ?? 0
      if (maksTotalpris > 0 && pris > maksTotalpris) return false
      if (maksFellesutgift > 0 && (a.fellesutgifter ?? 0) > maksFellesutgift) return false
      if (kjokkenFilter === 'adskilt' && a.kjokken_adskilt !== true) return false
      if (kjokkenFilter === 'apent' && a.kjokken_adskilt !== false) return false
      if (kildeFilter !== 'alle' && a.kilde !== kildeFilter) return false
      if (kunGarasje && !a.garasje) return false
      if (kunBalkong && !a.balkong) return false
      if (kunPrisnedgang && !a.prisnedgang) return false
      return true
    })
  }, [
    sortert, visFilter, minSoverom, minAreal, maksTotalpris, maksFellesutgift,
    kjokkenFilter, kildeFilter, kunGarasje, kunBalkong, kunPrisnedgang, visSolgte,
  ])

  const antallSolgte = annonser.filter((a) => !a.aktiv).length
  const aktive = annonser.filter((a) => a.aktiv)

  const antallAnbefales = aktive.filter((a) => a.ai_anbefaling === 'anbefales').length
  const antallVurder = aktive.filter((a) => a.ai_anbefaling === 'vurder').length

  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">Boligsøk</h2>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Sorter</span>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as BoligsokSortBy)}>
            <SelectTrigger className="h-7 w-40 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SORT_LABELS) as BoligsokSortBy[]).map((s) => (
                <SelectItem key={s} value={s}>{SORT_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => fetchAnnonser()} disabled={loading}>
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <StatTile label="Alle" value={aktive.length} active={visFilter === 'alle'} onClick={() => setVisFilter('alle')} />
        <StatTile label="Anbefales" value={antallAnbefales} active={visFilter === 'anbefales'} accent="#22c55e" onClick={() => setVisFilter('anbefales')} />
        <StatTile label="Verdt å vurdere" value={antallVurder} active={visFilter === 'vurder'} accent="#f59e0b" onClick={() => setVisFilter('vurder')} />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <InlineSlider
          label="Min. soverom"
          value={minSoverom}
          min={0}
          max={5}
          step={1}
          onChange={setMinSoverom}
          format={(v) => (v === 0 ? 'Alle' : `${v}+`)}
        />
        <InlineSlider
          label="Min. areal"
          value={minAreal}
          min={0}
          max={120}
          step={5}
          onChange={setMinAreal}
          format={(v) => (v === 0 ? 'Alle' : `${v} m²`)}
        />
        <InlineSlider
          label="Maks totalpris"
          value={maksTotalpris}
          min={0}
          max={8_000_000}
          step={250_000}
          onChange={setMaksTotalpris}
          format={(v) => (v === 0 ? 'Alle' : `${(v / 1_000_000).toFixed(2)} M`)}
        />
        <InlineSlider
          label="Maks fellesutg."
          value={maksFellesutgift}
          min={0}
          max={20_000}
          step={1_000}
          onChange={setMaksFellesutgift}
          format={(v) => (v === 0 ? 'Alle' : `${Math.round(v / 1000)}k`)}
        />
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Kjøkken</span>
          <Select value={kjokkenFilter} onValueChange={(v) => setKjokkenFilter(v as BoligsokKjokkenFilter)}>
            <SelectTrigger className="h-7 w-32 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(KJOKKEN_FILTER_LABELS) as BoligsokKjokkenFilter[]).map((k) => (
                <SelectItem key={k} value={k}>{KJOKKEN_FILTER_LABELS[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Kilde</span>
          <Select value={kildeFilter} onValueChange={(v) => setKildeFilter(v as BoligsokKildeFilter)}>
            <SelectTrigger className="h-7 w-28 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(KILDE_FILTER_LABELS) as BoligsokKildeFilter[]).map((k) => (
                <SelectItem key={k} value={k}>{KILDE_FILTER_LABELS[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Kun med garasje</span>
          <Switch checked={kunGarasje} onCheckedChange={setKunGarasje} />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Kun med balkong</span>
          <Switch checked={kunBalkong} onCheckedChange={setKunBalkong} />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Kun prisnedgang</span>
          <Switch checked={kunPrisnedgang} onCheckedChange={setKunPrisnedgang} />
        </div>
        {antallSolgte > 0 && (
          <button
            onClick={() => setVisSolgte(!visSolgte)}
            className="text-[11px] text-muted-foreground hover:text-foreground ml-auto"
          >
            {visSolgte ? 'Skjul' : 'Vis'} solgte ({antallSolgte})
          </button>
        )}
      </div>

      {!loading && annonser.length > 0 && (
        <p className="text-xs text-muted-foreground font-mono tabular-nums">
          Viser {filtrerte.length} av {visSolgte ? annonser.length : aktive.length} annonser
        </p>
      )}

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
