import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, RefreshCw, Home } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useBoligsokStore } from '@/store/useBoligsokStore'
import type { BoligAnnonse, BoligsokStatus } from '@/types/boligsok'

function fmtNOK(n: number | null) {
  if (n == null) return '–'
  return Math.round(n).toLocaleString('no-NO') + ' kr'
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

function KravBadge({ oppfylt, label }: { oppfylt: boolean; label: string }) {
  return (
    <Badge variant={oppfylt ? 'success' : 'muted'} className={cn(!oppfylt && 'opacity-60')}>
      {label}
    </Badge>
  )
}

function AnnonseCard({ annonse }: { annonse: BoligAnnonse }) {
  const setStatus = useBoligsokStore((s) => s.setStatus)
  const setNotat = useBoligsokStore((s) => s.setNotat)
  const [notatDraft, setNotatDraft] = useState(annonse.notat ?? '')

  const pris = annonse.totalpris ?? annonse.prisantydning
  const areal = annonse.primaerrom_m2 ?? annonse.bruksareal_m2

  return (
    <Card className={cn(annonse.oppfyller_krav && 'border-success/50')}>
      <CardHeader className="p-4 pb-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-semibold truncate">{annonse.tittel ?? 'Uten tittel'}</h3>
              <Badge variant="outline">{KILDE_LABELS[annonse.kilde]}</Badge>
              {annonse.oppfyller_krav && <Badge variant="success">Oppfyller alle krav</Badge>}
            </div>
            <p className="text-sm text-muted-foreground truncate">
              {[annonse.adresse, annonse.bydel].filter(Boolean).join(', ') || 'Ukjent adresse'}
            </p>
          </div>
          <a
            href={annonse.url}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            Se annonse <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </CardHeader>

      <CardContent className="p-4 pt-3 space-y-3">
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <span className="font-medium">{fmtNOK(pris)}</span>
          {annonse.soverom != null && <span className="text-muted-foreground">{annonse.soverom} soverom</span>}
          {areal != null && <span className="text-muted-foreground">{areal} m²</span>}
          {annonse.boligtype && <span className="text-muted-foreground">{annonse.boligtype}</span>}
          {annonse.byggeaar != null && <span className="text-muted-foreground">Bygget {annonse.byggeaar}</span>}
        </div>

        {annonse.fellesutgifter != null && (
          <p className="text-xs text-muted-foreground">
            Fellesutgifter: {fmtNOK(annonse.fellesutgifter)}/mnd
            {annonse.in_ordning && (
              <span className="text-warning"> · inkluderer trolig IN-ordning/individuell nedbetaling — sjekk reell løpende kostnad selv</span>
            )}
          </p>
        )}

        <div className="flex flex-wrap gap-1.5">
          <KravBadge oppfylt={annonse.balkong} label="Balkong/terrasse" />
          <KravBadge oppfylt={annonse.garasje} label="Garasjeplass" />
        </div>

        {annonse.raw_snippet && (
          <p className="text-xs text-muted-foreground italic border-l-2 border-border pl-2">{annonse.raw_snippet}</p>
        )}

        <div className="flex items-center gap-3 pt-1">
          <Select value={annonse.status} onValueChange={(v) => setStatus(annonse.id, v as BoligsokStatus)}>
            <SelectTrigger className="h-8 w-36 text-xs">
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
            className="flex-1 h-8 rounded-md border border-border bg-input px-2 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </CardContent>
    </Card>
  )
}

export function BoligsokPage() {
  const annonser = useBoligsokStore((s) => s.annonser)
  const loading = useBoligsokStore((s) => s.loading)
  const error = useBoligsokStore((s) => s.error)
  const fetchAnnonser = useBoligsokStore((s) => s.fetchAnnonser)
  const subscribe = useBoligsokStore((s) => s.subscribe)
  const unsubscribe = useBoligsokStore((s) => s.unsubscribe)

  const [visFilter, setVisFilter] = useState<'alle' | 'krav'>('alle')

  useEffect(() => {
    fetchAnnonser()
    subscribe()
    return () => unsubscribe()
  }, [fetchAnnonser, subscribe, unsubscribe])

  const filtrerte = useMemo(
    () => (visFilter === 'krav' ? annonser.filter((a) => a.oppfyller_krav) : annonser),
    [annonser, visFilter]
  )

  const antallOppfyller = annonser.filter((a) => a.oppfyller_krav).length

  return (
    <div className="flex-1 overflow-y-auto h-full">
      <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <Home className="h-5 w-5" /> Boligsøk
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Nye boligannonser fra dine lagrede søk på Finn.no, synkronisert automatisk hver morgen.
              {annonser.length > 0 && ` ${antallOppfyller} av ${annonser.length} oppfyller alle krav.`}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => fetchAnnonser()} disabled={loading}>
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          </Button>
        </div>

        <div className="flex gap-2">
          <Button
            variant={visFilter === 'alle' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setVisFilter('alle')}
          >
            Alle ({annonser.length})
          </Button>
          <Button
            variant={visFilter === 'krav' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setVisFilter('krav')}
          >
            Oppfyller alle krav ({antallOppfyller})
          </Button>
        </div>

        {error && <p className="text-sm text-destructive">Kunne ikke laste boligannonser: {error}</p>}

        {!loading && filtrerte.length === 0 && (
          <div className="text-center py-12 text-sm text-muted-foreground">
            {annonser.length === 0
              ? 'Ingen annonser ennå. De dukker opp her når det lagrede søket ditt på Finn.no finner nye treff og den daglige synkroniseringen har kjørt.'
              : 'Ingen annonser matcher filteret.'}
          </div>
        )}

        <div className="space-y-3">
          {filtrerte.map((a) => <AnnonseCard key={a.id} annonse={a} />)}
        </div>
      </div>
    </div>
  )
}
