import { useState, useRef, useEffect, useCallback } from 'react'
import { Plus, Trash2, ChevronDown, ChevronUp, Settings2, RefreshCw } from 'lucide-react'
import { fetchAllFondPrices, type LivePrice } from '@/domain/economy/fondPriceService'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import { useActiveEconomyStore } from '@/contexts/EconomyStoreContext'
import type { FondEntry, FondPortfolio, FondPortfolioSnapshot, ContributionPeriod } from '@/types/economy'

// Ane sin startportefølje — brukes av midlertidig import-knapp
const ANE_INITIAL_FOND: { name: string; type: FondEntry['type']; value: number; returnPct: number }[] = [
  { name: 'Alfred Berg Obligasjon ACC R', type: 'rente',   value: 2476, returnPct:  6.1  },
  { name: 'Kron Indeks Global',           type: 'indeks',  value: 2332, returnPct: 18.9  },
  { name: 'Storebrand Norge N',           type: 'aktivt',  value: 1262, returnPct: 39.9  },
  { name: 'Alfred Berg Nordic Investment Grade', type: 'rente', value: 788, returnPct: -1.6 },
  { name: 'Veritas Global Focus Fund USD D', type: 'aktivt', value: 780, returnPct: -11.8 },
  { name: 'Storebrand Indeks - Nye Markeder N', type: 'indeks', value: 696, returnPct: 42.3 },
  { name: 'PGIM Jennison Global Equity Opp', type: 'aktivt', value: 562, returnPct: -1.2 },
  { name: 'JPM Global Focus A (acc) EUR', type: 'aktivt',  value: 524, returnPct:  2.3  },
  { name: 'Storebrand Fremtid 80 N',      type: 'aktivt',  value: 463, returnPct: 22.3  },
  { name: 'KLP Obligasjon Global N',      type: 'rente',   value: 435, returnPct:  6.2  },
  { name: 'T. Rowe Price Global High Income', type: 'rente', value: 435, returnPct: 10.6 },
  { name: 'Alfred Berg Nordic High Yield C', type: 'rente', value: 208, returnPct: 11.3 },
]
const FOND_COLORS = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#84cc16','#f97316','#14b8a6','#a78bfa','#fb7185']

// ------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------

function fmtNOK(n: number) {
  return Math.round(n).toLocaleString('no-NO') + ' kr'
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('no-NO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function monthsBetween(start: string, end: Date): number {
  const s = new Date(start)
  return Math.max(
    0,
    (end.getFullYear() - s.getFullYear()) * 12 + (end.getMonth() - s.getMonth()) + 1,
  )
}

const FUND_TYPE_LABELS: Record<FondEntry['type'], string> = {
  aktivt: 'Aktivt fond',
  indeks: 'Indeksfond',
  rente: 'Rentefond',
  annet: 'Annet',
}

// ------------------------------------------------------------
// TICKER
// ------------------------------------------------------------

interface TickerItem {
  name: string
  label: string
  isPositive: boolean | null
}

function Ticker({ funds, livePrices }: { funds: FondEntry[]; livePrices: Record<string, LivePrice> }) {
  const items: TickerItem[] = funds.map((f) => {
    const live = livePrices[f.id]
    const pct = live?.dayChangePercent ?? f.returnPercent
    return {
      name: f.name,
      label: pct !== undefined && pct !== null
        ? `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`
        : `${f.allocationPercent.toFixed(1)}%`,
      isPositive: pct !== undefined && pct !== null
        ? pct > 0 ? true : pct < 0 ? false : null
        : null,
    }
  })

  const content = [...items, ...items] // duplicate for seamless loop

  return (
    <div
      className="overflow-hidden bg-zinc-950 border-b border-zinc-800 py-2"
      style={{ fontFamily: 'ui-monospace, monospace' }}
    >
      <style>{`
        @keyframes ticker-scroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .ticker-track {
          display: flex;
          width: max-content;
          animation: ticker-scroll 40s linear infinite;
        }
        .ticker-track:hover {
          animation-play-state: paused;
        }
      `}</style>
      <div className="ticker-track">
        {content.map((item, i) => (
          <span key={i} className="flex items-center gap-1.5 px-4 text-xs shrink-0">
            <span className="text-zinc-300 font-medium">{item.name}</span>
            <span
              className={
                item.isPositive === null
                  ? 'text-zinc-500'
                  : item.isPositive
                  ? 'text-green-400'
                  : 'text-red-400'
              }
            >
              {item.label}
            </span>
            <span className="text-zinc-700 mx-1">·</span>
          </span>
        ))}
      </div>
    </div>
  )
}

// ------------------------------------------------------------
// SUMMARY CARDS
// ------------------------------------------------------------

function SummaryCard({
  label,
  value,
  subvalue,
  highlight,
}: {
  label: string
  value: string
  subvalue?: string
  highlight?: 'positive' | 'negative' | 'neutral'
}) {
  const valueClass =
    highlight === 'positive'
      ? 'text-green-400'
      : highlight === 'negative'
      ? 'text-red-400'
      : 'text-foreground'

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`font-mono font-semibold text-sm ${valueClass}`}>{value}</p>
      {subvalue && <p className="text-xs text-muted-foreground">{subvalue}</p>}
    </div>
  )
}

// ------------------------------------------------------------
// DEVELOPMENT CHART
// ------------------------------------------------------------

interface ChartPoint {
  label: string
  investert: number
  faktisk: number | null
}

function buildChartData(portfolio: FondPortfolio, now: Date): ChartPoint[] {
  const months = monthsBetween(portfolio.startDate, now)
  if (months === 0) return []

  const sortedSnapshots = [...portfolio.snapshots].sort((a, b) =>
    a.date.localeCompare(b.date),
  )

  const points: ChartPoint[] = []
  for (let i = 1; i <= months; i++) {
    const d = new Date(portfolio.startDate)
    d.setMonth(d.getMonth() + i - 1)
    const yearStr = d.getFullYear()
    const monthStr = String(d.getMonth() + 1).padStart(2, '0')
    const isoPrefix = `${yearStr}-${monthStr}`

    const investert = portfolio.monthlyDeposit * i

    // Find the latest snapshot at or before this month
    const snap = [...sortedSnapshots]
      .filter((s) => s.date.slice(0, 7) <= isoPrefix)
      .at(-1)

    // Use actual deposited amount from snapshot if available
    const investertAktual = snap?.totalDeposited ?? investert

    points.push({
      label: `${monthStr}/${String(yearStr).slice(2)}`,
      investert: investertAktual,
      faktisk: snap ? snap.totalValue : null,
    })
  }

  return points
}

function DevelopmentChart({ portfolio, now }: { portfolio: FondPortfolio; now: Date }) {
  const data = buildChartData(portfolio, now)

  if (data.length === 0) {
    return (
      <p className="text-xs text-muted-foreground text-center py-4">
        Ingen data å vise ennå.
      </p>
    )
  }

  // Fill null faktisk forward/backward for chart continuity
  const filled = data.map((pt, i) => {
    if (pt.faktisk !== null) return pt
    // Find nearest snapshot after this point
    const next = data.slice(i + 1).find((p) => p.faktisk !== null)
    return { ...pt, faktisk: next ? next.faktisk : undefined }
  })

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={filled} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="gradInvestert" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gradFaktisk" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
          interval={Math.floor(filled.length / 6)}
        />
        <YAxis
          tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
          tickFormatter={(v) => `${Math.round(v / 1000)}k`}
          width={42}
        />
        <Tooltip
          contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', fontSize: 12 }}
          formatter={(v) => [fmtNOK(Number(v)), '']}
        />
        <Area
          type="monotone"
          dataKey="investert"
          name="Investert"
          stroke="#6366f1"
          strokeWidth={1.5}
          fill="url(#gradInvestert)"
          dot={false}
          connectNulls
        />
        <Area
          type="monotone"
          dataKey="faktisk"
          name="Faktisk verdi"
          stroke="#22c55e"
          strokeWidth={2}
          fill="url(#gradFaktisk)"
          dot={false}
          connectNulls
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ------------------------------------------------------------
// DONUT + FUND LIST
// ------------------------------------------------------------

function AllocationSection({ portfolio, latestValue, livePrices }: { portfolio: FondPortfolio; latestValue: number | null; livePrices: Record<string, LivePrice> }) {
  if (portfolio.funds.length === 0) {
    return (
      <p className="text-xs text-muted-foreground text-center py-4">
        Ingen fond registrert.
      </p>
    )
  }

  const pieData = portfolio.funds.map((f) => ({
    name: f.name,
    value: f.allocationPercent,
    color: f.color,
  }))

  return (
    <div className="flex flex-col md:flex-row gap-4">
      {/* Donut */}
      <div className="flex-shrink-0 flex items-center justify-center">
        <PieChart width={180} height={180}>
          <Pie
            data={pieData}
            cx={85}
            cy={85}
            innerRadius={52}
            outerRadius={80}
            paddingAngle={2}
            dataKey="value"
            isAnimationActive={false}
          >
            {pieData.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', fontSize: 11 }}
            formatter={(v) => [`${Number(v).toFixed(1)}%`, 'Andel']}
          />
        </PieChart>
      </div>

      {/* Fund list */}
      <div className="flex-1 space-y-2 min-w-0">
        {portfolio.funds.map((fund) => {
          const fundValue = latestValue !== null ? (fund.allocationPercent / 100) * latestValue : null
          const live = livePrices[fund.id]
          const dayPct = live?.dayChangePercent
          return (
            <div
              key={fund.id}
              className="flex items-center gap-2 rounded-md border border-border/50 px-3 py-2"
            >
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ background: fund.color }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{fund.name}</p>
                <p className="text-xs text-muted-foreground">
                  {FUND_TYPE_LABELS[fund.type]}
                  {live && (
                    <span className="ml-1 text-zinc-500">· NAV {live.nav.toLocaleString('no-NO', { maximumFractionDigits: 2 })} ({live.navDate})</span>
                  )}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs font-bold font-mono">{fund.allocationPercent.toFixed(1)}%</p>
                {fundValue !== null && (
                  <p className="text-xs text-muted-foreground font-mono">{fmtNOK(fundValue)}</p>
                )}
                {dayPct !== undefined && dayPct !== null ? (
                  <p className={`text-xs font-mono font-medium ${dayPct > 0 ? 'text-green-400' : dayPct < 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
                    {dayPct >= 0 ? '+' : ''}{dayPct.toFixed(2)}% i dag
                  </p>
                ) : fund.returnPercent !== undefined ? (
                  <p className={`text-xs font-mono font-medium ${fund.returnPercent > 0 ? 'text-green-400' : fund.returnPercent < 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
                    {fund.returnPercent >= 0 ? '+' : ''}{fund.returnPercent.toFixed(1)}%
                  </p>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ------------------------------------------------------------
// SNAPSHOT SECTION
// ------------------------------------------------------------

function SnapshotSection({
  portfolio,
  onAdd,
  onRemove,
}: {
  portfolio: FondPortfolio
  onAdd: (s: FondPortfolioSnapshot) => void
  onRemove: (date: string) => void
}) {
  const today = new Date().toISOString().split('T')[0]
  const [date, setDate] = useState(today)
  const [value, setValue] = useState('')
  const [deposited, setDeposited] = useState('')

  const sorted = [...portfolio.snapshots].sort((a, b) => b.date.localeCompare(a.date))

  function handleAdd() {
    const v = parseFloat(value)
    if (!date || isNaN(v) || v <= 0) return
    const dep = parseFloat(deposited)
    onAdd({ date, totalValue: v, totalDeposited: isNaN(dep) ? undefined : dep })
    setValue('')
    setDeposited('')
    setDate(today)
  }

  return (
    <div className="space-y-3">
      {/* Form */}
      <div className="flex flex-wrap items-end gap-2 rounded-md border border-border p-3">
        <div className="space-y-1">
          <Label className="text-xs">Dato</Label>
          <Input
            type="date"
            className="h-8 text-xs w-36"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Totalverdi (kr)</Label>
          <Input
            type="number"
            className="h-8 text-xs w-32"
            placeholder="f.eks. 80458"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Innskutt (kr)</Label>
          <Input
            type="number"
            className="h-8 text-xs w-32"
            placeholder="f.eks. 76343"
            value={deposited}
            onChange={(e) => setDeposited(e.target.value)}
          />
        </div>
        <Button
          size="sm"
          className="h-8 text-xs"
          onClick={handleAdd}
          disabled={!date || !value || parseFloat(value) <= 0}
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          Legg til
        </Button>
      </div>

      {/* Snapshot list */}
      {sorted.length > 0 ? (
        <div className="rounded-md border border-border overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Dato</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Innskutt</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Verdi</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Avk.</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((snap) => {
                const gain = snap.totalDeposited !== undefined ? snap.totalValue - snap.totalDeposited : null
                const gainPct = gain !== null && snap.totalDeposited ? (gain / snap.totalDeposited) * 100 : null
                return (
                  <tr key={snap.date} className="border-b border-border/50 last:border-0">
                    <td className="px-3 py-2 text-muted-foreground">{fmtDate(snap.date)}</td>
                    <td className="px-3 py-2 text-right font-mono">
                      {snap.totalDeposited !== undefined ? fmtNOK(snap.totalDeposited) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-medium">{fmtNOK(snap.totalValue)}</td>
                    <td className={`px-3 py-2 text-right font-mono text-xs ${gain !== null ? (gain >= 0 ? 'text-green-400' : 'text-red-400') : 'text-muted-foreground'}`}>
                      {gain !== null
                        ? `${gain >= 0 ? '+' : ''}${fmtNOK(gain)} (${gainPct !== null ? `${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(1)}%` : ''})`
                        : '—'}
                    </td>
                    <td className="px-1 py-2">
                      <button
                        className="text-muted-foreground hover:text-red-400 transition-colors p-1"
                        onClick={() => onRemove(snap.date)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground text-center py-2">
          Ingen verdimålinger registrert ennå. Logg din KRON-verdi ovenfor.
        </p>
      )}
    </div>
  )
}

// ------------------------------------------------------------
// SPAREPLAN CARD (standalone, not inside settings)
// ------------------------------------------------------------

function SpareplanCard({
  portfolio,
  onUpdate,
}: {
  portfolio: FondPortfolio
  onUpdate: (p: FondPortfolio) => void
}) {
  const [adding, setAdding] = useState(false)
  const [amount, setAmount] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const periods = portfolio.contributionPeriods ?? []

  function save() {
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) return
    const newPeriod: ContributionPeriod = {
      id: crypto.randomUUID(),
      amount: amt,
      fromDate: from ? `${from}-01` : undefined,
      toDate: to ? `${to}-01` : undefined,
    }
    onUpdate({ ...portfolio, contributionPeriods: [...periods, newPeriod] })
    setAmount(''); setFrom(''); setTo(''); setAdding(false)
  }

  function remove(id: string) {
    onUpdate({ ...portfolio, contributionPeriods: periods.filter(p => p.id !== id) })
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <span>Spareplan</span>
          <button
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded border border-border"
            onClick={() => { setAdding(true); setAmount(''); setFrom(''); setTo('') }}
          >
            <Plus className="h-3 w-3" /> Ny periode
          </button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {/* Fallback: fast månedlig */}
        {periods.length === 0 && !adding && (
          <div className="flex items-center justify-between rounded border border-border/40 bg-muted/10 px-2.5 py-2 text-xs">
            <div>
              <p className="font-mono font-medium">{portfolio.monthlyDeposit.toLocaleString('no-NO')} kr/mnd</p>
              <p className="text-muted-foreground text-[10px]">Fast beløp (ingen perioder satt) · endre under Innstillinger</p>
            </div>
          </div>
        )}

        {/* Perioder */}
        {periods.map(p => (
          <div key={p.id} className="flex items-center justify-between rounded border border-border/40 bg-muted/10 px-2.5 py-2 text-xs">
            <div className="flex flex-col gap-0.5">
              <span className="font-mono font-medium">{Math.round(p.amount).toLocaleString('no-NO')} kr/mnd</span>
              <span className="text-muted-foreground text-[10px]">
                {p.fromDate ? new Date(p.fromDate).toLocaleDateString('no-NO', { month: 'short', year: 'numeric' }) : 'Start'}
                {' → '}
                {p.toDate ? new Date(p.toDate).toLocaleDateString('no-NO', { month: 'short', year: 'numeric' }) : 'Ingen slutt'}
              </span>
            </div>
            <button className="text-muted-foreground hover:text-red-400 transition-colors p-1" onClick={() => remove(p.id)}>
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}

        {/* Legg til periode */}
        {adding && (
          <div className="rounded-lg border border-border bg-muted/10 p-3 space-y-2.5">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Ny spareperiode</p>
            <div>
              <label className="text-[10px] text-muted-foreground block mb-1">Beløp per måned (kr)</label>
              <input autoFocus type="number" min={0} step={100} placeholder="f.eks. 5000"
                className="h-7 w-full rounded border border-border bg-background px-2 text-xs font-mono outline-none focus:border-primary"
                value={amount} onChange={e => setAmount(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && save()} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-muted-foreground block mb-1">Fra (valgfri)</label>
                <input type="month" className="h-7 w-full rounded border border-border bg-background px-2 text-xs outline-none focus:border-primary"
                  value={from} onChange={e => setFrom(e.target.value)} />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground block mb-1">Til (valgfri)</label>
                <input type="month" className="h-7 w-full rounded border border-border bg-background px-2 text-xs outline-none focus:border-primary"
                  value={to} onChange={e => setTo(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-1.5 justify-end">
              <button onClick={() => setAdding(false)}
                className="px-3 py-1 rounded text-xs border border-border text-muted-foreground hover:text-foreground transition-colors">Avbryt</button>
              <button onClick={save} disabled={!amount || parseFloat(amount) <= 0}
                className="px-3 py-1 rounded text-xs bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">Lagre</button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ------------------------------------------------------------
// PORTFOLIO SETTINGS
// ------------------------------------------------------------

function PortfolioSettings({
  portfolio,
  onUpdate,
}: {
  portfolio: FondPortfolio
  onUpdate: (p: FondPortfolio) => void
}) {
  const [monthlyDeposit, setMonthlyDeposit] = useState(String(portfolio.monthlyDeposit))
  const [startDate, setStartDate] = useState(portfolio.startDate)
  const [funds, setFunds] = useState<FondEntry[]>(portfolio.funds)
  const [addingPeriod, setAddingPeriod] = useState(false)
  const [periodAmount, setPeriodAmount] = useState('')
  const [periodFrom, setPeriodFrom] = useState('')
  const [periodTo, setPeriodTo] = useState('')

  // New fund form
  const [newFundName, setNewFundName] = useState('')
  const [newFundType, setNewFundType] = useState<FondEntry['type']>('aktivt')
  const [newFundAlloc, setNewFundAlloc] = useState('')
  const [newFundColor, setNewFundColor] = useState('#6366f1')
  const [newFundIsin, setNewFundIsin] = useState('')
  const [newFundYahoo, setNewFundYahoo] = useState('')

  const isDirty =
    monthlyDeposit !== String(portfolio.monthlyDeposit) ||
    startDate !== portfolio.startDate ||
    JSON.stringify(funds) !== JSON.stringify(portfolio.funds)

  function handleSave() {
    onUpdate({
      ...portfolio,
      monthlyDeposit: parseFloat(monthlyDeposit) || portfolio.monthlyDeposit,
      startDate,
      funds,
    })
  }

  function addPeriod() {
    const amt = parseFloat(periodAmount)
    if (!amt || amt <= 0) {
      setPeriodAmount('')
      return
    }
    const newPeriod: ContributionPeriod = {
      id: crypto.randomUUID(),
      amount: amt,
      fromDate: periodFrom ? `${periodFrom}-01` : undefined,
      toDate: periodTo ? `${periodTo}-01` : undefined,
    }
    onUpdate({ ...portfolio, contributionPeriods: [...(portfolio.contributionPeriods ?? []), newPeriod] })
    setPeriodAmount(''); setPeriodFrom(''); setPeriodTo(''); setAddingPeriod(false)
  }

  function removePeriod(id: string) {
    onUpdate({ ...portfolio, contributionPeriods: (portfolio.contributionPeriods ?? []).filter(p => p.id !== id) })
  }

  function handleAddFund() {
    const alloc = parseFloat(newFundAlloc)
    if (!newFundName.trim() || isNaN(alloc)) return
    const newFund: FondEntry = {
      id: crypto.randomUUID(),
      name: newFundName.trim(),
      type: newFundType,
      allocationPercent: alloc,
      color: newFundColor,
      ...(newFundIsin.trim() ? { isin: newFundIsin.trim().toUpperCase() } : {}),
      ...(newFundYahoo.trim() ? { yahooTicker: newFundYahoo.trim() } : {}),
    }
    setFunds((prev) => [...prev, newFund])
    setNewFundName('')
    setNewFundAlloc('')
    setNewFundIsin('')
    setNewFundYahoo('')
  }

  function handleRemoveFund(id: string) {
    setFunds((prev) => prev.filter((f) => f.id !== id))
  }

  function handleFundAllocationChange(id: string, val: string) {
    setFunds((prev) =>
      prev.map((f) => (f.id === id ? { ...f, allocationPercent: parseFloat(val) || f.allocationPercent } : f)),
    )
  }

  return (
    <div className="space-y-4">
      {/* Basic settings */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Månedlig sparing (kr)</Label>
          <Input
            type="number"
            className="h-8 text-xs"
            value={monthlyDeposit}
            onChange={(e) => setMonthlyDeposit(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Startdato</Label>
          <Input
            type="date"
            className="h-8 text-xs"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
      </div>

      {/* Spareplaner */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground">Spareplaner (månedsoversikt)</p>
          <button
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded border border-border"
            onClick={() => { setAddingPeriod(true); setPeriodAmount(''); setPeriodFrom(''); setPeriodTo('') }}
          >
            <Plus className="h-3 w-3" /> Legg til periode
          </button>
        </div>
        {(portfolio.contributionPeriods ?? []).length > 0 && (
          <div className="space-y-1">
            {(portfolio.contributionPeriods ?? []).map(p => (
              <div key={p.id} className="flex items-center justify-between rounded border border-border/40 bg-muted/10 px-2.5 py-1.5 text-xs">
                <div className="flex flex-col gap-0.5">
                  <span className="font-mono font-medium">{Math.round(p.amount).toLocaleString('no-NO')} kr/mnd</span>
                  <span className="text-muted-foreground text-[10px]">
                    {p.fromDate ? new Date(p.fromDate).toLocaleDateString('no-NO', { month: 'short', year: 'numeric' }) : 'Start'}
                    {' → '}
                    {p.toDate ? new Date(p.toDate).toLocaleDateString('no-NO', { month: 'short', year: 'numeric' }) : 'Ingen slutt'}
                  </span>
                </div>
                <button className="text-muted-foreground hover:text-red-400 transition-colors p-1" onClick={() => removePeriod(p.id)}>
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        {(portfolio.contributionPeriods ?? []).length === 0 && !addingPeriod && (
          <p className="text-[10px] text-muted-foreground">Ingen perioder — bruker fast månedlig beløp over.</p>
        )}
        {addingPeriod && (
          <div className="rounded-lg border border-border bg-muted/10 p-3 space-y-2.5">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Ny spareperiode</p>
            <div>
              <label className="text-[10px] text-muted-foreground block mb-1">Beløp per måned (kr)</label>
              <input autoFocus type="number" min={0} step={100} placeholder="f.eks. 5000"
                className="h-7 w-full rounded border border-border bg-background px-2 text-xs font-mono outline-none focus:border-primary"
                value={periodAmount} onChange={e => setPeriodAmount(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-muted-foreground block mb-1">Fra (valgfri)</label>
                <input type="month" className="h-7 w-full rounded border border-border bg-background px-2 text-xs outline-none focus:border-primary"
                  value={periodFrom} onChange={e => setPeriodFrom(e.target.value)} />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground block mb-1">Til (valgfri)</label>
                <input type="month" className="h-7 w-full rounded border border-border bg-background px-2 text-xs outline-none focus:border-primary"
                  value={periodTo} onChange={e => setPeriodTo(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-1.5 justify-end">
              <button onClick={() => setAddingPeriod(false)}
                className="px-3 py-1 rounded text-xs border border-border text-muted-foreground hover:text-foreground transition-colors">Avbryt</button>
              <button onClick={addPeriod}
                className="px-3 py-1 rounded text-xs bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">Lagre</button>
            </div>
          </div>
        )}
      </div>

      {/* Fund list */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Fond</p>
        {funds.map((f) => (
          <div key={f.id} className="flex items-center gap-2">
            <span
              className="h-3 w-3 rounded-full shrink-0 border border-border/50"
              style={{ background: f.color }}
            />
            <span className="flex-1 text-xs truncate">{f.name}</span>
            <span className="text-xs text-muted-foreground">{FUND_TYPE_LABELS[f.type]}</span>
            <Input
              type="number"
              step="0.1"
              className="h-7 text-xs w-20"
              value={f.allocationPercent}
              onChange={(e) => handleFundAllocationChange(f.id, e.target.value)}
            />
            <span className="text-xs text-muted-foreground">%</span>
            <button
              className="text-muted-foreground hover:text-red-400 transition-colors"
              onClick={() => handleRemoveFund(f.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* Add fund */}
      <div className="space-y-2 rounded-md border border-dashed border-border p-3">
        <p className="text-xs font-medium text-muted-foreground">Legg til fond</p>
        <div className="flex flex-wrap gap-2 items-end">
          <div className="space-y-1 flex-1 min-w-32">
            <Label className="text-xs">Navn</Label>
            <Input
              className="h-8 text-xs"
              placeholder="Fondsnavn"
              value={newFundName}
              onChange={(e) => setNewFundName(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Type</Label>
            <Select value={newFundType} onValueChange={(v) => setNewFundType(v as FondEntry['type'])}>
              <SelectTrigger className="h-8 text-xs w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(FUND_TYPE_LABELS) as FondEntry['type'][]).map((t) => (
                  <SelectItem key={t} value={t} className="text-xs">
                    {FUND_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 w-20">
            <Label className="text-xs">Andel %</Label>
            <Input
              type="number"
              step="0.1"
              className="h-8 text-xs"
              placeholder="20"
              value={newFundAlloc}
              onChange={(e) => setNewFundAlloc(e.target.value)}
            />
          </div>
          <div className="space-y-1 w-36">
            <Label className="text-xs">ISIN (norske fond)</Label>
            <Input
              className="h-8 text-xs"
              placeholder="NO0010140502"
              value={newFundIsin}
              onChange={(e) => setNewFundIsin(e.target.value)}
            />
          </div>
          <div className="space-y-1 w-28">
            <Label className="text-xs">Yahoo ticker (ETF)</Label>
            <Input
              className="h-8 text-xs"
              placeholder="DFNS.AS"
              value={newFundYahoo}
              onChange={(e) => setNewFundYahoo(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Farge</Label>
            <input
              type="color"
              value={newFundColor}
              onChange={(e) => setNewFundColor(e.target.value)}
              className="h-8 w-8 rounded border border-border cursor-pointer"
            />
          </div>
          <Button
            size="sm"
            className="h-8 text-xs"
            onClick={handleAddFund}
            disabled={!newFundName.trim() || !newFundAlloc}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Legg til
          </Button>
        </div>
      </div>

      {isDirty && (
        <div className="flex justify-end">
          <Button size="sm" onClick={handleSave}>
            Lagre endringer
          </Button>
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------
// MAIN PAGE
// ------------------------------------------------------------

export function FondPage() {
  const { fondPortfolio, setFondPortfolio, addFondSnapshot, removeFondSnapshot } = useActiveEconomyStore()

  const [showSettings, setShowSettings] = useState(false)
  const [livePrices, setLivePrices] = useState<Record<string, LivePrice>>({})
  const [isFetching, setIsFetching] = useState(false)
  const [lastFetched, setLastFetched] = useState<Date | null>(null)
  const now = useRef(new Date()).current

  const fetchPrices = useCallback(async () => {
    const fundsWith = fondPortfolio.funds.filter((f) => f.isin || f.yahooTicker)
    if (fundsWith.length === 0) return
    setIsFetching(true)
    try {
      const prices = await fetchAllFondPrices(fundsWith)
      setLivePrices(prices)
      setLastFetched(new Date())
    } finally {
      setIsFetching(false)
    }
  }, [fondPortfolio.funds])

  // Hent ved oppstart
  useEffect(() => {
    fetchPrices()
  }, [fetchPrices])

  const months = monthsBetween(fondPortfolio.startDate, now)

  const sortedSnapshots = [...fondPortfolio.snapshots].sort((a, b) => b.date.localeCompare(a.date))
  const latestSnapshot = sortedSnapshots[0] ?? null

  // Use actual deposited amount from snapshot if available, else calculate from monthly deposit
  const investert = latestSnapshot?.totalDeposited ?? fondPortfolio.monthlyDeposit * months
  const naverdi = latestSnapshot ? latestSnapshot.totalValue : investert
  const avkastning = naverdi - investert
  const avkastningPct = investert > 0 ? (avkastning / investert) * 100 : 0

  function importAnesFond() {
    const total = ANE_INITIAL_FOND.reduce((s, f) => s + f.value, 0)
    const today = new Date().toISOString().split('T')[0]
    const funds: FondEntry[] = ANE_INITIAL_FOND.map((f, i) => ({
      id: crypto.randomUUID(),
      name: f.name,
      type: f.type,
      allocationPercent: Math.round((f.value / total) * 10000) / 100,
      color: FOND_COLORS[i % FOND_COLORS.length],
      returnPercent: f.returnPct,
    }))
    const snapshot: FondPortfolioSnapshot = { date: today, totalValue: total }
    setFondPortfolio({
      monthlyDeposit: 0,
      startDate: '2023-09-05',
      funds,
      snapshots: [snapshot],
    })
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Animated ticker */}
      {fondPortfolio.funds.length > 0 && <Ticker funds={fondPortfolio.funds} livePrices={livePrices} />}

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold">KRON-portefølje</h2>
            <p className="text-xs text-muted-foreground">
              {fondPortfolio.monthlyDeposit.toLocaleString('no-NO')} kr/mnd · startet{' '}
              {fmtDate(fondPortfolio.startDate)} · {months} mnd
            </p>
          </div>
          <div className="flex items-center gap-2">
            {fondPortfolio.funds.length === 0 && (
              <Button
                variant="outline"
                size="sm"
                className="text-violet-400 border-violet-500/40 hover:bg-violet-500/10"
                onClick={importAnesFond}
              >
                Importer Kron-portefølje
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={fetchPrices}
              disabled={isFetching}
              title={lastFetched ? `Sist hentet: ${lastFetched.toLocaleTimeString('no-NO')}` : 'Hent live kurser'}
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSettings((v) => !v)}
            >
              <Settings2 className="h-4 w-4 mr-1" />
              Innstillinger
              {showSettings ? <ChevronUp className="h-3.5 w-3.5 ml-1" /> : <ChevronDown className="h-3.5 w-3.5 ml-1" />}
            </Button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-2">
          <SummaryCard
            label="Investert"
            value={fmtNOK(investert)}
            subvalue={
              latestSnapshot?.totalDeposited !== undefined
                ? `per ${fmtDate(latestSnapshot.date)}`
                : `${months} mnd × ${fondPortfolio.monthlyDeposit.toLocaleString('no-NO')} kr`
            }
            highlight="neutral"
          />
          <SummaryCard
            label="Nåverdi"
            value={fmtNOK(naverdi)}
            subvalue={latestSnapshot ? `per ${fmtDate(latestSnapshot.date)}` : 'Ingen måling ennå'}
            highlight="neutral"
          />
          <SummaryCard
            label="Avkastning"
            value={`${avkastning >= 0 ? '+' : ''}${fmtNOK(avkastning)}`}
            subvalue={`${avkastningPct >= 0 ? '+' : ''}${avkastningPct.toFixed(1)}%`}
            highlight={avkastning > 0 ? 'positive' : avkastning < 0 ? 'negative' : 'neutral'}
          />
        </div>

        {/* Development chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Utvikling</CardTitle>
          </CardHeader>
          <CardContent>
            <DevelopmentChart portfolio={fondPortfolio} now={now} />
          </CardContent>
        </Card>

        {/* Spareplan */}
        <SpareplanCard
          portfolio={fondPortfolio}
          onUpdate={setFondPortfolio}
        />

        {/* Allocation donut + fund list */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between">
              <span>Fordeling</span>
              {lastFetched && (
                <span className="text-xs font-normal text-muted-foreground">
                  Live kurs {lastFetched.toLocaleTimeString('no-NO', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AllocationSection
              portfolio={fondPortfolio}
              latestValue={latestSnapshot?.totalValue ?? null}
              livePrices={livePrices}
            />
          </CardContent>
        </Card>

        {/* Snapshot section */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Logg KRON-verdi</CardTitle>
          </CardHeader>
          <CardContent>
            <SnapshotSection
              portfolio={fondPortfolio}
              onAdd={addFondSnapshot}
              onRemove={removeFondSnapshot}
            />
          </CardContent>
        </Card>

        {/* Portfolio settings (collapsible) */}
        {showSettings && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Porteføljeinnstillinger</CardTitle>
            </CardHeader>
            <CardContent>
              <PortfolioSettings
                portfolio={fondPortfolio}
                onUpdate={(p) => {
                  setFondPortfolio(p)
                  setShowSettings(false)
                }}
              />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
