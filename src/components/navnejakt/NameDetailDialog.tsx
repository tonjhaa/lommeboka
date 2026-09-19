import { useEffect, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { fetchNameStats } from '@/lib/names/api'
import { countLine, rankLine, trendLine } from '@/lib/names/format'
import { GENDER_LABEL, type NameRow, type NameStat } from '@/lib/names/types'
import { TrendIcon } from './shared'
import { cn } from '@/lib/utils'

export function NameDetailDialog({ name, latestYear, onClose }: { name: NameRow | null; latestYear: number; onClose: () => void }) {
  const [loaded, setLoaded] = useState<{ id: string; stats: NameStat[] | null; error: string | null } | null>(null)
  const [range, setRange] = useState<10 | 'all'>(10)
  const nameId = name?.id

  useEffect(() => {
    if (!nameId) return
    let cancelled = false
    fetchNameStats(nameId)
      .then((s) => { if (!cancelled) setLoaded({ id: nameId, stats: s, error: null }) })
      .catch((e) => { if (!cancelled) setLoaded({ id: nameId, stats: null, error: e instanceof Error ? e.message : String(e) }) })
    return () => { cancelled = true }
  }, [nameId])

  // Resultat gjelder bare hvis det er for navnet som vises nå
  const current = loaded && loaded.id === nameId ? loaded : null
  const stats = current?.stats ?? null
  const error = current?.error ?? null

  const visible = stats ? (range === 'all' ? stats : stats.filter((s) => s.year > latestYear - 10)) : []

  return (
    <Dialog open={name !== null} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
        {name && (
          <>
            <DialogHeader>
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">{GENDER_LABEL[name.gender]}</p>
              <DialogTitle className="text-4xl font-semibold tracking-tight">{name.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-1 text-sm text-muted-foreground" aria-describedby={undefined}>
              <p>{countLine(name, latestYear)}</p>
              <p className="flex items-center gap-1.5">
                {rankLine(name, latestYear) && <span className="text-foreground font-medium">{rankLine(name, latestYear)}</span>}
                {rankLine(name, latestYear) && <span aria-hidden>·</span>}
                <TrendIcon trend={name.trend} />
                <span>{trendLine(name.trend)}</span>
              </p>
            </div>

            {error && <p role="alert" className="text-sm text-destructive">Kunne ikke hente historikk: {error}</p>}
            {!error && current === null && <p className="text-sm text-muted-foreground">Henter historikk…</p>}
            {stats && stats.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Barn per år</h3>
                  <div className="flex gap-1">
                    {([10, 'all'] as const).map((r) => (
                      <button
                        key={r}
                        type="button"
                        aria-pressed={range === r}
                        onClick={() => setRange(r)}
                        className={cn('rounded px-2 py-1 text-xs', range === r ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground')}
                      >
                        {r === 10 ? '10 år' : 'Alle år'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="h-44" role="img" aria-label={`Antall barn som fikk navnet ${name.name} per år`}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={visible} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
                      <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="year" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} width={44} />
                      <Tooltip
                        contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                        formatter={(v) => [`${v} barn`, '']}
                        labelFormatter={(y) => `${y}`}
                      />
                      <Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 2 }} connectNulls={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-muted-foreground text-left">
                      <th className="py-1 font-medium">År</th><th className="py-1 font-medium text-right">Barn</th><th className="py-1 font-medium text-right">Rang</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...visible].reverse().slice(0, 8).map((s) => (
                      <tr key={s.year} className="border-t border-border/60">
                        <td className="py-1">{s.year}</td>
                        <td className="py-1 text-right tabular-nums">{s.count}</td>
                        <td className="py-1 text-right tabular-nums">{s.rank ?? '–'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-[11px] text-muted-foreground/80 leading-relaxed">
                  SSB gir ikke tall for navn med færre enn 4 barn et år, så år uten linje mangler data. Rang er beregnet av oss fra SSBs antall, blant samme kjønn og år.
                  Trend sammenligner andelen fødte siste 2 år med de 3 årene før (±15 % = økende/synkende).
                </p>
              </div>
            )}
            {stats && stats.length === 0 && <p className="text-sm text-muted-foreground">Ingen SSB-tall funnet for dette navnet.</p>}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
