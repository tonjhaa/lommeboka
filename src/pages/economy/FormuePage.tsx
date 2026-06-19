import { useState, useMemo } from 'react'
import { ComposedChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { useNetWorthSeries } from '@/hooks/useNetWorthSeries'
import { useActiveEconomyStore } from '@/contexts/EconomyStoreContext'
import { cn } from '@/lib/utils'

const MONTHS = ['Jan','Feb','Mar','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Des']
function fmtNOK(n: number): string { return Math.round(n).toLocaleString('no-NO') + ' kr' }
const RANGES = [{ label: '1 år', m: 12 }, { label: '3 år', m: 36 }, { label: '5 år', m: 60 }, { label: 'Alt', m: 240 }]

export function FormuePage() {
  const { partnerVeikart } = useActiveEconomyStore()
  const [scope, setScope] = useState<'din' | 'felles'>('din')
  const [historyMonths, setHistoryMonths] = useState(36)
  const serie = useNetWorthSeries(scope, { historyMonths, projectionMonths: 60 })

  const data = useMemo(() => serie.map((p) => ({
    label: `${MONTHS[p.month - 1]} ${String(p.year).slice(2)}`,
    sparing: p.sparing, fond: p.fond, ivf: p.ivf,
    gjeld: -p.gjeld, total: p.total, isProjected: p.isProjected,
  })), [serie])

  const sisteFaktiske = [...serie].reverse().find((p) => !p.isProjected)
  const naa = sisteFaktiske?.total ?? 0

  if (serie.every((p) => p.total === 0)) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
        Legg til sparing eller gjeld for å se formue over tid.
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 space-y-4">
      {/* Topp: nå-tall + Din/Felles + tidsspenn */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">Netto formue nå</p>
          <p className="text-3xl font-bold font-mono tabular-nums">{fmtNOK(naa)}</p>
        </div>
        <div className="flex gap-2">
          {partnerVeikart.enabled && (
            <div className="flex gap-1">
              {(['din','felles'] as const).map((sc) => (
                <button key={sc} onClick={() => setScope(sc)}
                  className={cn('rounded px-2.5 py-1 text-xs border', scope === sc ? 'border-primary text-primary' : 'border-border/40 text-muted-foreground')}>
                  {sc === 'din' ? 'Din' : 'Felles'}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-1">
            {RANGES.map((r) => (
              <button key={r.label} onClick={() => setHistoryMonths(r.m)}
                className={cn('rounded px-2.5 py-1 text-xs border', historyMonths === r.m ? 'border-primary text-primary' : 'border-border/40 text-muted-foreground')}>
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Stablet nedbrytning + total-linje */}
      <div className="rounded-xl border border-border/50 bg-card/60 p-4" style={{ height: 360 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(215 20% 22%)" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
            <Tooltip formatter={(v, n) => [fmtNOK(Math.abs(Number(v))), String(n)]} />
            <Area type="monotone" dataKey="sparing" stackId="a" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} />
            <Area type="monotone" dataKey="fond" stackId="a" stroke="#22c55e" fill="#22c55e" fillOpacity={0.3} />
            <Area type="monotone" dataKey="ivf" stackId="a" stroke="#a855f7" fill="#a855f7" fillOpacity={0.3} />
            <Area type="monotone" dataKey="gjeld" stackId="b" stroke="#ef4444" fill="#ef4444" fillOpacity={0.25} />
            <Line type="monotone" dataKey="total" stroke="#e5e7eb" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Sammensetningspanel: dagens fordeling */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {sisteFaktiske && ([
          ['Sparing', sisteFaktiske.sparing, 'text-blue-400'],
          ['Fond', sisteFaktiske.fond, 'text-green-400'],
          ['Prosjekt', sisteFaktiske.ivf, 'text-purple-400'],
          ['Gjeld', -sisteFaktiske.gjeld, 'text-red-400'],
        ] as const).map(([navn, verdi, farge]) => (
          <div key={navn} className="rounded-lg border border-border/50 bg-card/60 p-3">
            <p className="text-[11px] text-muted-foreground">{navn}</p>
            <p className={cn('text-sm font-mono font-semibold', farge)}>{fmtNOK(verdi)}</p>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-muted-foreground">
        Faktisk formue bakover (gjeld bakover er rekonstruert), projisert fremover. Felles-visning simulerer partners formue.
      </p>
    </div>
  )
}
