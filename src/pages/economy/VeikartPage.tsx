import { useState, useMemo } from 'react'
import { Map, TrendingUp, PiggyBank, Users, RefreshCw, CheckCircle2, XCircle, Info, RotateCcw, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useEconomyStore } from '@/application/useEconomyStore'
import { DEFAULT_FOND_RATE } from '@/config/economy.config'
import { useVeikartIntelligence, type VeikartEvent } from '@/hooks/useVeikartIntelligence'
import {
  calcMaxPurchase, monthlyPayment,
  BSU_MAX_YEARLY, BSU_MAX_TOTAL, BSU_TAX_BENEFIT, EK_KRAV, MAX_GJELDSGRAD,
} from '@/hooks/useVeikart'
import { computeEffectiveBalance, projectBalanceMonthly } from '@/domain/economy/savingsCalculator'
import { partnerNonBsuEquity, partnerMonthlySavingsTotal } from '@/types/economy'
import { cn } from '@/lib/utils'

const CURRENT_RATE = 0.0425
const STRESS_RATE = Math.max(0.07, CURRENT_RATE + 0.03)
const DEFAULT_SAVINGS_RATE = 3.5  // % per år, sparekonto
// DEFAULT_FOND_RATE importeres fra economy.config (delt med Formue-modulen)

// ── Formatering ──────────────────────────────────────────────────

function fmtNOK(n: number, short = false): string {
  if (short) {
    if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} mill`
    if (Math.abs(n) >= 1_000) return `${Math.round(n / 1000)} k`
    return String(Math.round(n))
  }
  return Math.round(n).toLocaleString('no-NO') + ' kr'
}

function fmtMonths(m: number): string {
  if (m === 0) return 'Nå'
  if (m < 12) return `${m} mnd`
  const y = Math.floor(m / 12)
  const mo = m % 12
  if (mo === 0) return `${y} år`
  return `${y} år ${mo} mnd`
}

function fmtTargetDate(months: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() + months)
  const names = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des']
  return `${names[d.getMonth()]} ${d.getFullYear()}`
}

// ── Beregninger ──────────────────────────────────────────────────

function calcKjøpekraft(
  equity: number, bsu: number, fond: number,
  fondMonthly: number,
  annualIncome: number, existingDebt: number,
  monthlySavings: number,    // ekskl. fond og BSU
  monthlyBSU: number,
  bsuCutoffMonths: number | null,
  month: number,
): number {
  const futureEquity = projectBalanceMonthly(equity, monthlySavings, DEFAULT_SAVINGS_RATE, month)
  const effectiveBsuMonths = bsuCutoffMonths !== null ? Math.min(month, bsuCutoffMonths) : month
  const futureBsu = Math.min(BSU_MAX_TOTAL, bsu + monthlyBSU * effectiveBsuMonths)
  const futureFond = projectBalanceMonthly(fond, fondMonthly, DEFAULT_FOND_RATE, month)
  return calcMaxPurchase(futureEquity + futureBsu + futureFond, annualIncome, existingDebt)
}

function findKlarMonth(
  equity: number, bsu: number, fond: number,
  fondMonthly: number,
  annualIncome: number, existingDebt: number,
  monthlySavings: number, monthlyBSU: number,
  bsuCutoffMonths: number | null,
  malPris: number,
): number | null {
  if (malPris <= 0) return null
  for (let m = 0; m <= 120; m++) {
    if (calcKjøpekraft(equity, bsu, fond, fondMonthly, annualIncome, existingDebt, monthlySavings, monthlyBSU, bsuCutoffMonths, m) >= malPris) {
      return m
    }
  }
  return null
}

// ── SVG: Kjøpekraft-kurve ────────────────────────────────────────

function KjøpekraftChart({
  points, klarMonth, malPris,
}: {
  points: { month: number; maxBuy: number }[]
  klarMonth: number | null
  malPris: number
}) {
  const W = 560, H = 170
  const pad = { top: 16, right: 20, bottom: 30, left: 52 }
  const innerW = W - pad.left - pad.right
  const innerH = H - pad.top - pad.bottom

  const rawMax = Math.max(...points.map(p => p.maxBuy), malPris || 0)
  const maxVal = rawMax > 0 ? rawMax * 1.12 : 10_000_000

  const xOf = (month: number) => pad.left + (month / 72) * innerW
  const yOf = (val: number) => pad.top + (1 - val / maxVal) * innerH

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(p.month).toFixed(1)},${yOf(p.maxBuy).toFixed(1)}`)
    .join(' ')

  const goalY = malPris > 0 ? yOf(malPris) : null
  const klarX = klarMonth !== null ? xOf(klarMonth) : null
  const klarY = klarMonth !== null ? yOf(points[Math.min(klarMonth, points.length - 1)].maxBuy) : null

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(pct => ({ val: pct * maxVal, y: yOf(pct * maxVal) }))
  const xTicks = [0, 12, 24, 36, 48, 60, 72].map(m => ({ month: m, x: xOf(m), label: m === 0 ? 'Nå' : `År ${m / 12}` }))

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minHeight: 130 }}>
      <defs>
        <linearGradient id="kp-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
        </linearGradient>
      </defs>
      {yTicks.map((t, i) => (
        <line key={i} x1={pad.left} y1={t.y} x2={W - pad.right} y2={t.y}
          stroke="hsl(215 20.2% 18%)" strokeWidth="0.5" />
      ))}
      <path
        d={`${linePath} L${xOf(72).toFixed(1)},${(pad.top + innerH).toFixed(1)} L${xOf(0).toFixed(1)},${(pad.top + innerH).toFixed(1)} Z`}
        fill="url(#kp-grad)"
      />
      {goalY !== null && goalY >= pad.top && goalY <= pad.top + innerH && (
        <>
          <line x1={pad.left} y1={goalY} x2={W - pad.right} y2={goalY}
            stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="5 3" />
          <text x={W - pad.right + 3} y={goalY + 4} fontSize="7.5" fill="#f59e0b" fontWeight="600">Mål</text>
        </>
      )}
      <path d={linePath} fill="none" stroke="#3b82f6" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" />
      {klarX !== null && klarY !== null && (
        <g>
          <line x1={klarX} y1={klarY} x2={klarX} y2={pad.top + innerH}
            stroke="#22c55e" strokeWidth="1" strokeDasharray="3 2" opacity="0.6" />
          <circle cx={klarX} cy={klarY} r="6" fill="#22c55e" opacity="0.2" />
          <circle cx={klarX} cy={klarY} r="3.5" fill="#22c55e" />
          <text x={klarX} y={klarY - 9} textAnchor="middle" fontSize="8" fill="#22c55e" fontWeight="700">KLAR</text>
        </g>
      )}
      {yTicks.filter((_, i) => i > 0).map((t, i) => (
        <text key={i} x={pad.left - 3} y={t.y + 3} textAnchor="end" fontSize="7" fill="hsl(215 20.2% 48%)">
          {t.val >= 1_000_000 ? `${(t.val / 1_000_000).toFixed(1)}M` : `${Math.round(t.val / 1000)}k`}
        </text>
      ))}
      {xTicks.map((t, i) => (
        <text key={i} x={t.x} y={H - 4} textAnchor="middle" fontSize="7" fill="hsl(215 20.2% 48%)">{t.label}</text>
      ))}
      <line x1={pad.left} y1={pad.top} x2={pad.left} y2={pad.top + innerH} stroke="hsl(215 20.2% 28%)" strokeWidth="0.5" />
      <line x1={pad.left} y1={pad.top + innerH} x2={W - pad.right} y2={pad.top + innerH} stroke="hsl(215 20.2% 28%)" strokeWidth="0.5" />
    </svg>
  )
}

// ── Scenario-kort ────────────────────────────────────────────────

function ScenarioCard({ label, maxBuy, equity, bsu, malPris, isNow }: {
  label: string; maxBuy: number
  equity: number; bsu: number; malPris: number; isNow: boolean
}) {
  const loan = Math.max(0, maxBuy - equity - bsu)
  const payment = loan > 0 ? monthlyPayment(loan, STRESS_RATE, 25) : 0
  const goalReached = malPris > 0 && maxBuy >= malPris

  return (
    <div className={cn(
      'rounded-xl border p-3.5 space-y-2 flex flex-col',
      isNow ? 'border-green-500/40 bg-green-500/5' : 'border-border/50 bg-card/60',
      goalReached && !isNow && 'border-blue-500/30 bg-blue-500/5',
    )}>
      <div className="flex items-center justify-between gap-1">
        <span className={cn('text-[10px] font-semibold uppercase tracking-wide', isNow ? 'text-green-400' : 'text-muted-foreground')}>
          {label}
        </span>
        {goalReached && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/15 text-green-400 border border-green-500/30 leading-none shrink-0">✓ Mål</span>
        )}
        {isNow && !goalReached && (
          <span className="text-[9px] border border-green-500/30 text-green-400 rounded px-1.5 py-0.5 leading-none">Nå</span>
        )}
      </div>
      <div>
        <p className={cn('text-lg font-bold font-mono tabular-nums leading-none', isNow ? 'text-green-500' : goalReached ? 'text-blue-400' : 'text-foreground')}>
          {fmtNOK(maxBuy, true)}
        </p>
        <p className="text-[9px] text-muted-foreground mt-0.5">Maks kjøpspris</p>
      </div>
      <div className="border-t border-border/30 pt-2 space-y-1">
        <div className="flex justify-between text-[10px]">
          <span className="text-muted-foreground">EK</span>
          <span className="font-mono">{fmtNOK(equity + bsu, true)}</span>
        </div>
        {payment > 0 && (
          <div className="flex justify-between text-[10px]">
            <span className="text-muted-foreground">Terminbeløp</span>
            <span className="font-mono text-amber-400">{fmtNOK(payment, true)}/mnd</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── SVG: Stacked spareplan ───────────────────────────────────────

function SparePlanChart({ data, ekKrav, partnerEnabled }: {
  data: Array<{ month: number; s1: number; s2: number; s3: number; s4: number; total: number }>
  ekKrav: number
  partnerEnabled: boolean
}) {
  const W = 560, H = 160
  const pad = { top: 12, right: 20, bottom: 28, left: 52 }
  const innerW = W - pad.left - pad.right
  const innerH = H - pad.top - pad.bottom

  const maxVal = Math.max(...data.map(d => d.total), ekKrav > 0 ? ekKrav * 1.1 : 0) * 1.12 || 2_000_000

  const xOf = (m: number) => pad.left + (m / 72) * innerW
  const yOf = (v: number) => pad.top + (1 - Math.min(v / maxVal, 1.05)) * innerH

  function stackedArea(topFn: (d: typeof data[0]) => number, botFn: (d: typeof data[0]) => number) {
    const fwd = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${xOf(d.month).toFixed(1)},${yOf(topFn(d)).toFixed(1)}`).join(' ')
    const bwd = [...data].reverse().map(d => `L${xOf(d.month).toFixed(1)},${yOf(botFn(d)).toFixed(1)}`).join(' ')
    return `${fwd} ${bwd} Z`
  }

  const goalY = ekKrav > 0 ? yOf(ekKrav) : null
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(pct => ({ val: pct * maxVal, y: yOf(pct * maxVal) }))
  const xTicks = [0, 12, 24, 36, 48, 60, 72]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minHeight: 120 }}>
      {yTicks.map((t, i) => (
        <line key={i} x1={pad.left} y1={t.y} x2={W - pad.right} y2={t.y} stroke="hsl(215 20.2% 18%)" strokeWidth="0.5" />
      ))}
      <path d={stackedArea(d => d.s1, _ => 0)} fill="#3b82f6" opacity="0.4" />
      <path d={stackedArea(d => d.s2, d => d.s1)} fill="#8b5cf6" opacity="0.4" />
      <path d={stackedArea(d => d.s3, d => d.s2)} fill="#14b8a6" opacity="0.4" />
      {partnerEnabled && (
        <path d={stackedArea(d => d.s4, d => d.s3)} fill="#f59e0b" opacity="0.4" />
      )}
      {goalY !== null && goalY >= pad.top && goalY <= pad.top + innerH && (
        <>
          <line x1={pad.left} y1={goalY} x2={W - pad.right} y2={goalY} stroke="#22c55e" strokeWidth="1.5" strokeDasharray="5 3" />
          <text x={W - pad.right + 3} y={goalY + 4} fontSize="7.5" fill="#22c55e" fontWeight="600">EK</text>
        </>
      )}
      {yTicks.filter((_, i) => i > 0).map((t, i) => (
        <text key={i} x={pad.left - 3} y={t.y + 3} textAnchor="end" fontSize="7" fill="hsl(215 20.2% 48%)">
          {t.val >= 1_000_000 ? `${(t.val / 1_000_000).toFixed(1)}M` : `${Math.round(t.val / 1000)}k`}
        </text>
      ))}
      {xTicks.map((m, i) => (
        <text key={i} x={xOf(m)} y={H - 4} textAnchor="middle" fontSize="7" fill="hsl(215 20.2% 48%)">
          {m === 0 ? 'Nå' : `År ${m / 12}`}
        </text>
      ))}
      <line x1={pad.left} y1={pad.top} x2={pad.left} y2={pad.top + innerH} stroke="hsl(215 20.2% 28%)" strokeWidth="0.5" />
      <line x1={pad.left} y1={pad.top + innerH} x2={W - pad.right} y2={pad.top + innerH} stroke="hsl(215 20.2% 28%)" strokeWidth="0.5" />
    </svg>
  )
}

// ── Tidslinje-strip ──────────────────────────────────────────────

const EVENT_STYLE: Record<string, string> = {
  positive: 'border-green-500/30 bg-green-500/8 text-green-400',
  negative: 'border-red-500/30 bg-red-500/8 text-red-400',
  neutral:  'border-blue-500/30 bg-blue-500/8 text-blue-400',
}

const EVENT_ICON: Record<string, string> = {
  fungering_start:  '↑',
  fungering_slutt:  '↓',
  gjeld_nedbetalt:  '✓',
  lonnsoppgjor:     '↑',
  tillegg_slutter:  '↓',
  bsu_aldersgrense: 'i',
  bsu_maxet:        '★',
  atf_utbetaling:   '⚡',
  skatteoppgjor:    '⊕',
}

function TimelineStrip({ events, formatYM }: { events: VeikartEvent[]; formatYM: (ym: string) => string }) {
  if (events.length === 0) return null

  return (
    <div className="rounded-xl border border-border/50 bg-card/60 px-4 pt-3 pb-3">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2.5">
        Kommende hendelser · neste 6 år
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
        {events.map(event => (
          <div
            key={event.id}
            className={cn(
              'shrink-0 rounded-lg border px-2.5 py-2 min-w-[130px] max-w-[160px]',
              EVENT_STYLE[event.impact],
            )}
          >
            <div className="flex items-center gap-1 mb-1">
              <span className="text-[10px] font-bold opacity-80">{EVENT_ICON[event.type]}</span>
              <span className="text-[9px] opacity-60">{formatYM(event.yearMonth)}</span>
            </div>
            <p className="text-[10px] font-semibold leading-tight truncate">{event.label}</p>
            <p className="text-[9px] opacity-70 mt-0.5 leading-tight">{event.detail}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Hoved ────────────────────────────────────────────────────────

export function VeikartPage() {
  const { savingsAccounts, fondPortfolio, debts, profile, partnerVeikart } = useEconomyStore()
  const intelligence = useVeikartIntelligence()

  const _now = useMemo(() => new Date(), [])

  // ── Auto-fill fra store ──────────────────────────────────────
  const storeEquity = useMemo(() =>
    savingsAccounts.filter(a => a.type === 'sparekonto')
      .reduce((s, a) => s + computeEffectiveBalance(a, _now), 0),
    [savingsAccounts, _now])

  const storeBsu = useMemo(() =>
    savingsAccounts.filter(a => a.type === 'BSU')
      .reduce((s, a) => s + computeEffectiveBalance(a, _now), 0),
    [savingsAccounts, _now])

  const storeFond = useMemo(() => {
    const snaps = [...(fondPortfolio?.snapshots ?? [])].sort((a, b) => b.date.localeCompare(a.date))
    return snaps[0]?.totalValue ?? 0
  }, [fondPortfolio])

  const storeArslonn = (profile?.baseMonthly ?? 0) * 12 +
    (profile?.fixedAdditions.reduce((s, a) => s + a.amount, 0) ?? 0) * 12

  const storeDebt = debts.filter(d => d.status !== 'nedbetalt').reduce((s, d) => s + d.currentBalance, 0)

  const storeFondMonthly = fondPortfolio?.monthlyDeposit ?? 0
  const storeMndSparing = savingsAccounts.filter(a => a.type !== 'BSU')
    .reduce((s, a) => s + (a.monthlyContribution ?? 0), 0)  // fond tracked separately

  const storeArligBSU = savingsAccounts.filter(a => a.type === 'BSU')
    .reduce((s, a) => s + (a.monthlyContribution ?? 0), 0) * 12

  // ── Overrides: manuell overstyring av store-verdier ────────────
  // Når override er null, brukes store-verdi automatisk (live-sync)
  const [overrides, setOverrides] = useState<Partial<Record<string, string>>>({})
  const [malPrisInput, setMalPrisInput] = useState('')
  const [showInfo, setShowInfo] = useState(false)

  // Netto per mnd — startet fra estimat, kan overstyres
  const [nettoOverride, setNettoOverride] = useState<string | null>(null)

  const nettoMnd = nettoOverride ?? (intelligence.netEstimate.monthlyNet > 0
    ? String(intelligence.netEstimate.monthlyNet) : '')
  const nettoManual = nettoOverride !== null

  function setOverrideField(key: string, value: string) {
    setOverrides(prev => ({ ...prev, [key]: value }))
  }

  function resetNettoEstimate() {
    setNettoOverride(null)
  }

  function tilbakestillAlt() {
    setOverrides({})
    setNettoOverride(null)
  }

  // Effektive input-verdier: override ?? store
  const arslonn = overrides.arslonn ?? (storeArslonn > 0 ? String(Math.round(storeArslonn)) : '')
  const sparekonto = overrides.sparekonto ?? (storeEquity > 0 ? String(Math.round(storeEquity)) : '')
  const fond = overrides.fond ?? (storeFond > 0 ? String(Math.round(storeFond)) : '')
  const bsu = overrides.bsu ?? (storeBsu > 0 ? String(Math.round(storeBsu)) : '')
  const mndSparing = overrides.mndSparing ?? (storeMndSparing > 0 ? String(Math.round(storeMndSparing)) : '')
  const arligBSU = overrides.arligBSU ?? (storeArligBSU > 0 ? String(Math.round(storeArligBSU)) : '')

  const hasOverrides = Object.keys(overrides).length > 0 || nettoOverride !== null

  // ── Beregning ────────────────────────────────────────────────
  const partnerEnabled = partnerVeikart.enabled

  // BSU cutoff: måneder fra nå til siste BSU-innskuddsår
  const bsuCutoffMonths = useMemo(() => {
    const cutoffYear = intelligence.bsuLastSaveYear ?? null
    if (!cutoffYear) return null
    const now = _now
    return Math.max(0, (cutoffYear - now.getFullYear()) * 12 + (12 - now.getMonth()))
  }, [intelligence.bsuLastSaveYear, _now])

  const inputs = useMemo(() => {
    const myEq = parseFloat(sparekonto) || 0
    const partnerEq = partnerEnabled ? partnerNonBsuEquity(partnerVeikart) : 0
    const eq = myEq + partnerEq

    const myBsu = parseFloat(bsu) || 0
    const partnerBsu = partnerEnabled ? partnerVeikart.bsu : 0
    const bsuVal = myBsu + partnerBsu

    const fondVal = parseFloat(fond) || 0
    const fondMnd = storeFondMonthly  // fond monthly fra store (ikke overstyrbar ennå)
    const income = (parseFloat(arslonn) || 0) + (partnerEnabled ? partnerVeikart.annualIncome : 0)
    const debt = storeDebt

    // Sparing ekskl. fond og BSU (fond er en separat akkumulator)
    const mySavings = parseFloat(mndSparing) || 0
    const partnerSavings = partnerEnabled ? partnerMonthlySavingsTotal(partnerVeikart) : 0
    const savings = mySavings + partnerSavings

    const myBsuMonthly = Math.min(BSU_MAX_YEARLY, parseFloat(arligBSU) || 0) / 12
    const partnerBsuMonthly = partnerEnabled && intelligence.bsuCanSave
      ? partnerVeikart.bsuMonthlyContribution
      : 0
    const bsuMonthly = myBsuMonthly + partnerBsuMonthly

    const mal = parseFloat(malPrisInput.replace(/\s/g, '').replace(/,/g, '')) || 0
    const bsuCanSave = intelligence.bsuCanSave

    const nettoMndVal = parseFloat(nettoMnd) || 0

    return { eq, bsuVal, fondVal, fondMnd, income, debt, savings, bsuMonthly, mal, bsuCanSave, nettoMndVal, myBsu, partnerBsu, myEq, partnerEq }
  }, [arslonn, partnerEnabled, partnerVeikart, sparekonto, fond, bsu, mndSparing, arligBSU, malPrisInput, storeDebt, storeFondMonthly, intelligence.bsuCanSave, nettoMnd])

  const chartPoints = useMemo(() =>
    Array.from({ length: 73 }, (_, m) => ({
      month: m,
      maxBuy: calcKjøpekraft(inputs.eq, inputs.bsuVal, inputs.fondVal, inputs.fondMnd, inputs.income, inputs.debt, inputs.savings, inputs.bsuMonthly, bsuCutoffMonths, m),
    })),
    [inputs, bsuCutoffMonths])

  const klarMonth = useMemo(() =>
    findKlarMonth(inputs.eq, inputs.bsuVal, inputs.fondVal, inputs.fondMnd, inputs.income, inputs.debt, inputs.savings, inputs.bsuMonthly, bsuCutoffMonths, inputs.mal),
    [inputs, bsuCutoffMonths])

  const totalEquity = inputs.eq + inputs.bsuVal + inputs.fondVal

  const sparePlanData = useMemo(() => {
    const spKonto = parseFloat(sparekonto) || 0
    const mndSpar = parseFloat(mndSparing) || 0
    const pEK = partnerEnabled ? partnerNonBsuEquity(partnerVeikart) : 0
    const pMnd = partnerEnabled ? partnerMonthlySavingsTotal(partnerVeikart) : 0
    return Array.from({ length: 73 }, (_, m) => {
      // BSU med aldersgrense
      const effectiveBsuM = bsuCutoffMonths !== null ? Math.min(m, bsuCutoffMonths) : m
      const bsuAcc = Math.min(BSU_MAX_TOTAL, inputs.bsuVal + inputs.bsuMonthly * effectiveBsuM)
      // Fond med avkastning (rentes-rente)
      const fondAcc = projectBalanceMonthly(inputs.fondVal, inputs.fondMnd, DEFAULT_FOND_RATE, m)
      // Din sparing med rentes-rente
      const din = projectBalanceMonthly(spKonto, mndSpar, DEFAULT_SAVINGS_RATE, m)
      // Partner: enkel lineær (ingen kontoinfo)
      const partner = pEK + pMnd * m
      const s1 = bsuAcc
      const s2 = s1 + fondAcc
      const s3 = s2 + din
      const s4 = s3 + partner
      return { month: m, s1, s2, s3, s4, total: s4 }
    })
  }, [inputs, sparekonto, mndSparing, partnerEnabled, partnerVeikart, bsuCutoffMonths])

  const scenarioMonths = [0, 6, 12, 24, 36]
  const scenarios = scenarioMonths.map(m => {
    const pt = chartPoints[m]
    const futureEquity = projectBalanceMonthly(inputs.eq, inputs.savings, DEFAULT_SAVINGS_RATE, m)
    const effectiveBsuM = bsuCutoffMonths !== null ? Math.min(m, bsuCutoffMonths) : m
    const futureBsu = Math.min(BSU_MAX_TOTAL, inputs.bsuVal + inputs.bsuMonthly * effectiveBsuM)
    return {
      label: m === 0 ? 'Nå' : m < 12 ? `${m} mnd` : `${m / 12} år`,
      months: m,
      maxBuy: pt?.maxBuy ?? 0,
      equity: futureEquity,
      bsu: futureBsu,
    }
  })

  // "Raskere"-tips
  const raskere = useMemo(() => {
    if (inputs.mal <= 0 || klarMonth === 0) return []
    const items: { label: string; desc: string; gain: number | null }[] = []

    const with5k = findKlarMonth(inputs.eq, inputs.bsuVal, inputs.fondVal, inputs.fondMnd, inputs.income, inputs.debt, inputs.savings + 5000, inputs.bsuMonthly, bsuCutoffMonths, inputs.mal)
    if (klarMonth !== null && with5k !== null)
      items.push({ label: '+5 000 kr/mnd sparing', desc: `${fmtMonths(klarMonth - with5k)} raskere`, gain: klarMonth - with5k })
    else if (klarMonth === null && with5k !== null)
      items.push({ label: '+5 000 kr/mnd sparing', desc: `Når målet om ${fmtMonths(with5k)}`, gain: null })

    const with10kIncome = findKlarMonth(inputs.eq, inputs.bsuVal, inputs.fondVal, inputs.fondMnd, inputs.income + 10000 * 12, inputs.debt, inputs.savings, inputs.bsuMonthly, bsuCutoffMonths, inputs.mal)
    if (klarMonth !== null && with10kIncome !== null)
      items.push({ label: '+10 000 kr/mnd brutto', desc: `${fmtMonths(klarMonth - with10kIncome)} raskere`, gain: klarMonth - with10kIncome })

    if (inputs.debt > 100_000) {
      const withLessDebt = findKlarMonth(inputs.eq, inputs.bsuVal, inputs.fondVal, inputs.fondMnd, inputs.income, Math.max(0, inputs.debt - 100_000), inputs.savings, inputs.bsuMonthly, bsuCutoffMonths, inputs.mal)
      if (klarMonth !== null && withLessDebt !== null)
        items.push({ label: 'Nedbetal 100k gjeld', desc: `${fmtMonths(klarMonth - withLessDebt)} raskere`, gain: klarMonth - withLessDebt })
    }

    if (inputs.bsuCanSave && (inputs.myBsu ?? 0) < BSU_MAX_TOTAL) {
      const bsuRemaining = BSU_MAX_TOTAL - (inputs.myBsu ?? 0)
      const taxSaving = Math.min(BSU_MAX_YEARLY, bsuRemaining) * BSU_TAX_BENEFIT
      if (taxSaving > 0)
        items.push({ label: 'Maks BSU-innskudd', desc: `${fmtNOK(taxSaving)} i skattefradrag/år`, gain: null })
    }

    return items.slice(0, 4)
  }, [inputs, klarMonth, bsuCutoffMonths])

  // Sjekkliste
  const bremsene = useMemo(() => [
    {
      label: `Egenkapital ≥ ${(EK_KRAV * 100).toFixed(0)}% av mål`,
      ok: inputs.mal > 0 ? totalEquity >= inputs.mal * EK_KRAV : totalEquity > 0,
      detail: inputs.mal > 0
        ? `${fmtNOK(totalEquity, true)} av ${fmtNOK(inputs.mal * EK_KRAV, true)} krav`
        : totalEquity > 0 ? `${fmtNOK(totalEquity, true)}` : 'Sett inn mål-pris',
    },
    {
      label: `Gjeldsgrad under ${MAX_GJELDSGRAD}× inntekt`,
      ok: inputs.income <= 0 || inputs.debt <= inputs.income * MAX_GJELDSGRAD,
      detail: inputs.income > 0
        ? `${(inputs.debt / Math.max(inputs.income, 1)).toFixed(1)}× inntekt`
        : 'Ingen inntektsdata',
    },
    {
      label: 'Aktiv månedlig sparing',
      ok: inputs.savings >= 500,
      detail: inputs.savings > 0 ? `${fmtNOK(inputs.savings, true)}/mnd` : 'Ingen sparing registrert',
    },
    {
      label: 'BSU-mulighet utnyttet',
      ok: !inputs.bsuCanSave || (inputs.myBsu ?? 0) >= BSU_MAX_TOTAL,
      detail: (inputs.myBsu ?? 0) < BSU_MAX_TOTAL && inputs.bsuCanSave
        ? `${fmtNOK(BSU_MAX_TOTAL - (inputs.myBsu ?? 0), true)} igjen til tak`
        : (inputs.myBsu ?? 0) >= BSU_MAX_TOTAL ? 'BSU fylt opp!' : 'Over 33 år',
    },
  ], [inputs, totalEquity])

  const hasData = inputs.income > 0 || totalEquity > 0 || inputs.savings > 0

  // ── Netto-info for sparerate ─────────────────────────────────
  const savingsPctOfNetto = inputs.nettoMndVal > 0
    ? Math.round((inputs.savings / inputs.nettoMndVal) * 100)
    : null
  const ref20Netto = inputs.nettoMndVal > 0 ? Math.round(inputs.nettoMndVal * 0.20) : 0
  const nettoGap = ref20Netto - inputs.savings

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── VENSTRE — Inputs ── */}
      <div className="w-[290px] shrink-0 border-r border-border overflow-y-auto p-4 space-y-4">

        <div className="flex items-center gap-2">
          <Map className="h-4 w-4 text-blue-400" />
          <h2 className="text-sm font-semibold">Boligveikart</h2>
        </div>

        {hasOverrides ? (
          <Button variant="outline" size="sm" className="w-full text-xs h-7 gap-1.5 border-amber-500/30 text-amber-400" onClick={tilbakestillAlt}>
            <RefreshCw className="h-3 w-3" />
            Tilbakestill til faktiske tall
          </Button>
        ) : (
          <div className="flex items-center gap-1.5 text-[10px] text-green-400/70 px-1">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500/60" />
            Live-synkronisert med din profil
          </div>
        )}

        {/* Inntekt */}
        <div className="space-y-3">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Inntekt</p>

          <div className="space-y-1">
            <Label className="text-[11px]">Din årslønn (brutto)</Label>
            <Input type="number" value={arslonn} onChange={e => setOverrideField('arslonn', e.target.value)}
              placeholder="f.eks. 650000" className="h-7 text-xs" />
            <p className="text-[10px] text-muted-foreground">Brukes til låneevne</p>
          </div>

          <div className="space-y-1">
            <Label className="text-[11px]">Netto per mnd</Label>
            <div className="flex gap-1.5">
              <Input
                type="number"
                value={nettoMnd}
                onChange={e => setNettoOverride(e.target.value)}
                placeholder="f.eks. 32000"
                className="h-7 text-xs flex-1"
              />
              {nettoManual && (
                <button
                  onClick={resetNettoEstimate}
                  title="Tilbakestill til estimat"
                  className="h-7 w-7 flex items-center justify-center rounded border border-border text-muted-foreground hover:text-foreground transition-colors shrink-0"
                >
                  <RotateCcw className="h-3 w-3" />
                </button>
              )}
            </div>
            <p className={cn('text-[10px] leading-tight', nettoManual ? 'text-amber-400' : 'text-muted-foreground')}>
              {nettoManual
                ? 'Manuelt overstyrt'
                : intelligence.netEstimate.source === 'slips'
                  ? `Estimert fra ${intelligence.netEstimate.slipMonths} slipper`
                  : 'Estimert fra profil'}
            </p>
            {savingsPctOfNetto !== null && (
              <p className={cn('text-[10px] leading-tight', nettoGap > 2000 ? 'text-amber-400' : 'text-muted-foreground')}>
                {savingsPctOfNetto}% av netto
                {nettoGap > 2000 && ` · 20%-mål: +${Math.round(nettoGap / 100) * 100} kr/mnd`}
              </p>
            )}
          </div>
        </div>

        {/* Partner — forenklet, redigeres i Innstillinger */}
        <div className="space-y-2">
          {partnerEnabled ? (
            <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-medium text-amber-400">
                  <Users className="h-3 w-3" />
                  Partner aktivert
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] text-muted-foreground">Rediger i</span>
                  <span className="text-[9px] text-muted-foreground flex items-center gap-0.5">
                    <Settings className="h-2.5 w-2.5" /> Innstillinger
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
                <span className="text-muted-foreground">Brutto/år</span>
                <span className="font-mono text-right">
                  {partnerVeikart.annualIncome > 0 ? fmtNOK(partnerVeikart.annualIncome, true) : '—'}
                </span>
                <span className="text-muted-foreground">EK (eks. BSU)</span>
                <span className="font-mono text-right">
                  {partnerNonBsuEquity(partnerVeikart) > 0 ? fmtNOK(partnerNonBsuEquity(partnerVeikart), true) : '—'}
                </span>
                <span className="text-muted-foreground">BSU</span>
                <span className="font-mono text-right">
                  {partnerVeikart.bsu > 0 ? fmtNOK(partnerVeikart.bsu, true) : '—'}
                </span>
                <span className="text-muted-foreground">Mnd. sparing</span>
                <span className="font-mono text-right">
                  {partnerMonthlySavingsTotal(partnerVeikart) > 0 ? fmtNOK(partnerMonthlySavingsTotal(partnerVeikart), true) + '/mnd' : '—'}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-[10px] text-muted-foreground italic">
              Legg til partner i Innstillinger → Personalia
            </p>
          )}
        </div>

        {/* Egenkapital */}
        <div className="space-y-3">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Egenkapital</p>
          <div className="space-y-1">
            <Label className="text-[11px]">Sparekonto</Label>
            <Input type="number" value={sparekonto} onChange={e => setOverrideField('sparekonto', e.target.value)} placeholder="0" className="h-7 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Fond / aksjer</Label>
            <Input type="number" value={fond} onChange={e => setOverrideField('fond', e.target.value)} placeholder="0" className="h-7 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">
              BSU-saldo
              {intelligence.myAge !== undefined && (
                <span className={cn('ml-2 font-normal', intelligence.bsuCanSave ? 'text-blue-400' : 'text-muted-foreground')}>
                  {intelligence.bsuCanSave ? `(${intelligence.myAge} år — BSU OK)` : `(${intelligence.myAge} år — over BSU-alder)`}
                </span>
              )}
            </Label>
            <Input type="number" value={bsu} onChange={e => setOverrideField('bsu', e.target.value)} placeholder="0" className="h-7 text-xs" />
          </div>
        </div>

        {/* Sparing */}
        <div className="space-y-3">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Sparing</p>
          <div className="space-y-1">
            <Label className="text-[11px]">Din mnd. sparing (eks. BSU)</Label>
            <Input type="number" value={mndSparing} onChange={e => setOverrideField('mndSparing', e.target.value)} placeholder="0" className="h-7 text-xs" />
            {intelligence.budgetSurplus !== null && intelligence.budgetSurplus > 500 && (
              <p className="text-[10px] text-green-400/70">
                Budsjettoverskudd denne måneden: {Math.round(intelligence.budgetSurplus).toLocaleString('no-NO')} kr
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Årlig BSU-innskudd</Label>
            <Input
              type="number"
              value={arligBSU}
              onChange={e => setOverrideField('arligBSU', e.target.value)}
              placeholder={`maks ${BSU_MAX_YEARLY.toLocaleString('no-NO')}`}
              disabled={!inputs.bsuCanSave}
              className="h-7 text-xs"
            />
            {!inputs.bsuCanSave && (
              <p className="text-[10px] text-muted-foreground">BSU-sparing ikke tilgjengelig (over 33 år)</p>
            )}
          </div>
          {intelligence.savingsRateComparison && (() => {
            const { actual, planned } = intelligence.savingsRateComparison
            const diff = actual - planned
            const isLow = diff < -500
            const isHigh = diff > 500
            return (
              <div className={cn(
                'rounded-md px-2.5 py-2 text-[10px]',
                isLow ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-muted/20 border border-border/30',
              )}>
                <p className={cn('font-medium mb-0.5', isLow ? 'text-amber-400' : 'text-muted-foreground')}>
                  Faktisk sparerate (siste saldo)
                </p>
                <p className="text-muted-foreground">
                  Faktisk: <span className={cn('font-mono', isHigh ? 'text-green-400' : isLow ? 'text-amber-400' : 'text-foreground')}>{actual.toLocaleString('no-NO')} kr/mnd</span>
                  {' · '}Planlagt: <span className="font-mono">{planned.toLocaleString('no-NO')} kr/mnd</span>
                </p>
                {isLow && (
                  <p className="text-amber-400/80 mt-0.5">
                    {Math.abs(diff).toLocaleString('no-NO')} kr/mnd under plan
                  </p>
                )}
              </div>
            )
          })()}
        </div>

        {/* Mål */}
        <div className="space-y-2">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Drømmeboligen</p>
          <div className="space-y-1">
            <Label className="text-[11px]">Målpris (kr)</Label>
            <Input type="text" value={malPrisInput} onChange={e => setMalPrisInput(e.target.value)}
              placeholder="f.eks. 4500000" className="h-7 text-xs" />
          </div>
          {inputs.mal > 0 && (
            <div className={cn(
              'rounded-lg px-3 py-2 text-center',
              klarMonth === 0 ? 'bg-green-500/10 border border-green-500/30' : 'bg-blue-500/10 border border-blue-500/20',
            )}>
              {klarMonth === 0 ? (
                <p className="text-xs font-semibold text-green-400">KLAR NÅ</p>
              ) : klarMonth !== null ? (
                <>
                  <p className="text-[10px] text-muted-foreground">Tilgjengelig om</p>
                  <p className="text-sm font-bold text-blue-400">{fmtMonths(klarMonth)}</p>
                  <p className="text-[10px] text-blue-400/60">{fmtTargetDate(klarMonth)}</p>
                </>
              ) : (
                <p className="text-[10px] text-muted-foreground italic">Ikke innenfor 10 år</p>
              )}
            </div>
          )}
        </div>

        {/* Regelverk */}
        <button
          onClick={() => setShowInfo(!showInfo)}
          className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <Info className="h-3 w-3" />
          {showInfo ? 'Skjul regelverk' : 'Vis regelverk (2025)'}
        </button>
        {showInfo && (
          <div className="rounded-lg border border-border/40 bg-muted/10 px-3 py-3 space-y-1.5 text-[11px]">
            <p className="font-medium text-muted-foreground mb-2">Boliglånsforskriften 2025</p>
            <div className="flex justify-between"><span className="text-muted-foreground">EK-krav</span><span>{(EK_KRAV * 100).toFixed(0)}%</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Maks gjeldsgrad</span><span>{MAX_GJELDSGRAD}× bruttoinntekt</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Stresstest</span><span>+3 pp, min 7%</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">BSU maks/år</span><span>{fmtNOK(BSU_MAX_YEARLY)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">BSU skattefradrag</span><span>{(BSU_TAX_BENEFIT * 100).toFixed(0)}% av innskudd</span></div>
          </div>
        )}
      </div>

      {/* ── HØYRE — Chart + Cards + Metrics ── */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5 min-w-0">

        {!hasData ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3">
            <Map className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              Fyll inn lønn og sparing for å se ditt boligveikart.
            </p>
          </div>
        ) : (
          <>
            {/* Tidslinje */}
            <TimelineStrip events={intelligence.events} formatYM={intelligence.formatYM} />

            {/* Frigjort kapasitet — nylig nedbetalt gjeld */}
            {intelligence.recentlyPaidDebts.length > 0 && (
              <div className="rounded-xl border border-green-500/20 bg-green-500/5 px-4 py-3 space-y-1.5">
                <p className="text-[10px] font-semibold text-green-400 uppercase tracking-wide">
                  Frigjort kapasitet
                </p>
                {intelligence.recentlyPaidDebts.map(d => (
                  <div key={d.creditor} className="flex items-start gap-2">
                    <span className="text-green-500 text-[11px] shrink-0 mt-0.5">✓</span>
                    <p className="text-[11px] text-foreground/80">
                      Du betalte ned <span className="font-medium">{d.creditor}</span> — er{' '}
                      <span className="font-mono font-medium">{d.freed.toLocaleString('no-NO')} kr/mnd</span>{' '}
                      omdirigert til sparing?
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Kjøpekraft-chart */}
            <div className="rounded-xl border border-border/50 bg-card/60 px-4 pt-3 pb-2">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                    Kjøpekraftutvikling · 0–6 år
                  </span>
                  {inputs.mal > 0 && (
                    <span className="ml-2 text-[10px] text-amber-400">— mål: {fmtNOK(inputs.mal, true)}</span>
                  )}
                </div>
                <TrendingUp className="h-3.5 w-3.5 text-blue-400" />
              </div>
              <KjøpekraftChart points={chartPoints} klarMonth={klarMonth} malPris={inputs.mal} />
            </div>

            {/* Partner-effekt */}
            {partnerEnabled && (() => {
              const soloEq = parseFloat(sparekonto) || 0
              const soloBsu = inputs.myBsu ?? 0
              const soloFond = inputs.fondVal
              const soloIncome = parseFloat(arslonn) || 0
              const soloSavings = parseFloat(mndSparing) || 0
              const soloNow = calcKjøpekraft(soloEq, soloBsu, soloFond, inputs.fondMnd, soloIncome, inputs.debt, soloSavings, inputs.bsuMonthly, bsuCutoffMonths, 0)
              const combinedNow = calcKjøpekraft(inputs.eq, inputs.bsuVal, inputs.fondVal, inputs.fondMnd, inputs.income, inputs.debt, inputs.savings, inputs.bsuMonthly, bsuCutoffMonths, 0)
              const gain = combinedNow - soloNow
              const pct = soloNow > 0 ? Math.round((gain / soloNow) * 100) : 0
              return (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
                  <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-wide mb-2.5">
                    Kjøpekraft · din vs. felles
                  </p>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-0.5">Din alene</p>
                      <p className="text-sm font-bold font-mono">{(soloNow / 1_000_000).toFixed(2)} mill</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-0.5">Felles</p>
                      <p className="text-sm font-bold font-mono text-amber-400">{(combinedNow / 1_000_000).toFixed(2)} mill</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-0.5">Økning</p>
                      <p className="text-sm font-bold font-mono text-green-400">+{(gain / 1_000_000).toFixed(2)} mill</p>
                      <p className="text-[10px] text-green-400/70">+{pct}%</p>
                    </div>
                  </div>
                  {inputs.mal > 0 && (
                    <p className={cn('mt-2 text-[10px] text-center',
                      combinedNow >= inputs.mal ? 'text-green-400' : soloNow >= inputs.mal ? 'text-muted-foreground' : 'text-amber-400',
                    )}>
                      {combinedNow >= inputs.mal && soloNow < inputs.mal
                        ? '✓ Dere når målet sammen — du når det ikke alene'
                        : combinedNow >= inputs.mal && soloNow >= inputs.mal
                          ? '✓ Begge når målet'
                          : `Mangler ${((inputs.mal - combinedNow) / 1_000_000).toFixed(2)} mill felles`}
                    </p>
                  )}
                </div>
              )
            })()}

            {/* Scenario-kort */}
            <div className="grid grid-cols-5 gap-2">
              {scenarios.map((s, i) => (
                <ScenarioCard
                  key={s.months}
                  label={s.label}
                  maxBuy={s.maxBuy}
                  equity={s.equity}
                  bsu={s.bsu}
                  malPris={inputs.mal}
                  isNow={i === 0}
                />
              ))}
            </div>

            {/* Spareutvikling */}
            <div className="rounded-xl border border-border/50 bg-card/60 px-4 pt-3 pb-3">
              <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Spareutvikling per kontogruppe
                </p>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <div className="flex items-center gap-1"><div className="h-2 w-3 rounded-sm bg-blue-500 opacity-70" /><span className="text-[9px] text-muted-foreground">BSU</span></div>
                  <div className="flex items-center gap-1"><div className="h-2 w-3 rounded-sm bg-violet-500 opacity-70" /><span className="text-[9px] text-muted-foreground">Fond</span></div>
                  <div className="flex items-center gap-1"><div className="h-2 w-3 rounded-sm bg-teal-500 opacity-70" /><span className="text-[9px] text-muted-foreground">Sparekonto</span></div>
                  {partnerEnabled && <div className="flex items-center gap-1"><div className="h-2 w-3 rounded-sm bg-amber-500 opacity-70" /><span className="text-[9px] text-muted-foreground">Partner</span></div>}
                  {inputs.mal > 0 && <div className="flex items-center gap-1"><div className="h-1.5 w-3 border-t-2 border-dashed border-green-500" /><span className="text-[9px] text-muted-foreground">EK-krav (10%)</span></div>}
                  <span className="text-[9px] text-muted-foreground/50">· Fond = nåverdi</span>
                </div>
              </div>
              <SparePlanChart
                data={sparePlanData}
                ekKrav={inputs.mal > 0 ? inputs.mal * EK_KRAV : 0}
                partnerEnabled={partnerEnabled}
              />
              {/* Tabell */}
              <div className="mt-2 border-t border-border/30 pt-2 overflow-x-auto">
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="border-b border-border/30">
                      <th className="text-left py-1 pr-2 text-muted-foreground font-medium">År</th>
                      <th className="text-right py-1 px-1 text-blue-400 font-medium">BSU</th>
                      <th className="text-right py-1 px-1 text-violet-400 font-medium">Fond</th>
                      <th className="text-right py-1 px-1 text-teal-400 font-medium">Sparekonto</th>
                      {partnerEnabled && <th className="text-right py-1 px-1 text-amber-400 font-medium">Partner</th>}
                      <th className="text-right py-1 px-1 text-foreground font-semibold">Total EK</th>
                      <th className="text-right py-1 pl-2 text-green-400 font-medium">Max kjøpesum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[0, 12, 24, 36, 48, 60].map(m => {
                      const d = sparePlanData[m]
                      const yr = new Date().getFullYear() + Math.floor(m / 12)
                      const bsuAmt = d.s1
                      const fondAmt = d.s2 - d.s1
                      const sparekAmt = d.s3 - d.s2
                      const partnerAmt = d.s4 - d.s3
                      const maxKjøp = calcMaxPurchase(d.total, inputs.income, inputs.debt)
                      const ekKravMet = inputs.mal > 0 && d.total >= inputs.mal * EK_KRAV
                      return (
                        <tr key={m} className="border-b border-border/20 last:border-0 hover:bg-muted/10">
                          <td className="py-1 pr-2 text-muted-foreground">{m === 0 ? 'Nå' : yr}</td>
                          <td className="py-1 px-1 text-right font-mono text-blue-400/80">{fmtNOK(bsuAmt, true)}</td>
                          <td className="py-1 px-1 text-right font-mono text-violet-400/80">{fmtNOK(fondAmt, true)}</td>
                          <td className="py-1 px-1 text-right font-mono text-teal-400/80">{fmtNOK(sparekAmt, true)}</td>
                          {partnerEnabled && <td className="py-1 px-1 text-right font-mono text-amber-400/80">{fmtNOK(partnerAmt, true)}</td>}
                          <td className={cn('py-1 px-1 text-right font-mono font-semibold', ekKravMet ? 'text-green-400' : '')}>{fmtNOK(d.total, true)}</td>
                          <td className="py-1 pl-2 text-right font-mono text-green-400/80">{(maxKjøp / 1_000_000).toFixed(2)} mill</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-2 gap-4">
              {raskere.length > 0 && (
                <div className="rounded-xl border border-border/50 bg-card/60 px-4 py-3 space-y-2">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Hva øker kjøpekraften mest?</p>
                  <div className="space-y-2">
                    {raskere.map((item, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <div className="h-5 w-5 rounded-full bg-green-500/15 flex items-center justify-center shrink-0 mt-0.5">
                          <span className="text-[9px] text-green-400 font-bold">{i + 1}</span>
                        </div>
                        <div>
                          <p className="text-[11px] font-medium">{item.label}</p>
                          <p className={cn('text-[10px]', item.gain !== null && item.gain > 0 ? 'text-green-400' : 'text-muted-foreground')}>{item.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="rounded-xl border border-border/50 bg-card/60 px-4 py-3 space-y-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Hva er bremsen i dag?</p>
                <div className="space-y-2">
                  {bremsene.map((item, i) => (
                    <div key={i} className="flex items-start gap-2">
                      {item.ok
                        ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0 mt-0.5" />
                        : <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
                      }
                      <div>
                        <p className={cn('text-[11px] font-medium', item.ok ? 'text-foreground' : 'text-muted-foreground')}>{item.label}</p>
                        <p className={cn('text-[10px]', item.ok ? 'text-muted-foreground' : 'text-amber-400')}>{item.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Handlingsplan */}
            {inputs.mal > 0 && klarMonth !== null && (
              <div className={cn(
                'rounded-xl border px-4 py-3 space-y-2',
                klarMonth === 0
                  ? 'border-green-500/40 bg-green-500/8'
                  : 'border-blue-500/30 bg-blue-500/8',
              )}>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Handlingsplan
                </p>
                {klarMonth === 0 ? (
                  <p className="text-sm font-semibold text-green-400">
                    Du er klar til å kjøpe bolig nå!
                  </p>
                ) : (
                  <p className="text-sm font-semibold text-blue-300">
                    Du er klar i <span className="text-blue-400">{fmtTargetDate(klarMonth)}</span>{' '}
                    <span className="text-[11px] font-normal text-muted-foreground">({fmtMonths(klarMonth)})</span>
                  </p>
                )}
                {raskere.length > 0 && raskere[0].gain !== null && raskere[0].gain > 0 && (
                  <p className="text-[11px] text-foreground/80">
                    Viktigste grep:{' '}
                    <span className="font-medium">{raskere[0].label}</span>{' '}
                    — gir{' '}
                    <span className="text-green-400">{fmtMonths(raskere[0].gain)} raskere</span>
                  </p>
                )}
                {intelligence.budgetSurplus !== null && intelligence.budgetSurplus > 500 && (
                  <p className="text-[10px] text-green-400/80">
                    Denne måneden har du {Math.round(intelligence.budgetSurplus).toLocaleString('no-NO')} kr i budsjettoverskudd — vurdér et ekstra engangsbeløp til sparing.
                  </p>
                )}
              </div>
            )}

            {/* Din posisjon */}
            <div className="rounded-xl border border-border/50 bg-card/60 px-4 py-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2.5">Din posisjon i dag</p>
              <div className="grid grid-cols-4 gap-3">
                <Metric label="Sparekonto" value={fmtNOK(inputs.eq, true)} color="text-foreground" icon={<PiggyBank className="h-3 w-3" />} />
                <Metric label="BSU" value={fmtNOK(inputs.myBsu ?? 0, true)} color="text-blue-400" />
                <Metric label="Fond" value={fmtNOK(inputs.fondVal, true)} color="text-violet-400" />
                <Metric label="Total EK" value={fmtNOK(totalEquity, true)} color="text-green-500" bold />
              </div>
              {inputs.debt > 0 && (
                <div className="mt-2 pt-2 border-t border-border/30 flex justify-between text-[11px]">
                  <span className="text-muted-foreground">Eksisterende gjeld (begrenser lånerammen)</span>
                  <span className="font-mono text-red-400">−{fmtNOK(inputs.debt, true)}</span>
                </div>
              )}
              {inputs.income > 0 && (
                <div className="mt-1 flex justify-between text-[11px]">
                  <span className="text-muted-foreground">Bruttoinntekt / år</span>
                  <span className="font-mono">{fmtNOK(inputs.income, true)}</span>
                </div>
              )}
              {inputs.nettoMndVal > 0 && (
                <div className="mt-1 flex justify-between text-[11px]">
                  <span className="text-muted-foreground">Nettoinntekt / mnd</span>
                  <span className="font-mono">{fmtNOK(inputs.nettoMndVal, true)}</span>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Metric({ label, value, color, icon, bold }: {
  label: string; value: string; color: string; icon?: React.ReactNode; bold?: boolean
}) {
  return (
    <div>
      <p className="text-[9px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">{icon}{label}</p>
      <p className={cn('text-sm font-mono font-semibold mt-0.5', color, bold && 'text-base')}>{value}</p>
    </div>
  )
}
