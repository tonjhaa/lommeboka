import { useState } from 'react'
import { ComposedChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { SlidersHorizontal, Target, Plus, Trash2 } from 'lucide-react'
import { useScenario } from '@/hooks/useScenario'
import { useAppStore } from '@/store/useAppStore'
import { useForecastAccuracy } from '@/hooks/useForecastAccuracy'
import { DEFAULT_SCENARIO_LEVERS } from '@/domain/economy/scenarioSimulator'
import { cn } from '@/lib/utils'

const MONTHS = ['Jan','Feb','Mar','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Des']
function fmtNOK(n: number): string { return Math.round(n).toLocaleString('no-NO') + ' kr' }

export function ScenarioPage() {
  // ── Alle hooks FØR tidlig return (Rules of Hooks) ──────────────────────────
  const result = useScenario()
  const levers = useAppStore((s) => s.scenarioLevers)
  const setLevers = useAppStore((s) => s.setScenarioLevers)

  // Treffsikkerhet-bånd — kanonisk motor, delt med Treffsikkerhet-visningen
  const { report } = useForecastAccuracy()
  const hitRate = report && report.monthsWithData > 0 ? report.overallHitRate : null

  // Lokal state for engangshendelse-skjema
  const [newLabel, setNewLabel] = useState('')
  const [newDate, setNewDate] = useState('')
  const [newAmount, setNewAmount] = useState('')

  // ── Tidlig return etter alle hooks ─────────────────────────────────────────
  if (!result) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
        Importer en lønnsslipp for å simulere scenarier.
      </div>
    )
  }

  const data = result.baseline.series.map((p, i) => ({
    label: `${MONTHS[p.month - 1]} ${String(p.year).slice(2)}`,
    baseline: p.total,
    scenario: result.scenario.series[i]?.total ?? p.total,
  }))

  const figs: { label: string; base: number; scen: number; pct?: boolean }[] = [
    { label: 'Netto/mnd', base: result.baseline.figures.nettoPerMonth, scen: result.scenario.figures.nettoPerMonth },
    { label: 'Sparerate', base: result.baseline.figures.sparerate, scen: result.scenario.figures.sparerate, pct: true },
    { label: 'Formue om 5 år', base: result.baseline.figures.netWorth5y, scen: result.scenario.figures.netWorth5y },
    { label: 'Kjøpekraft', base: result.baseline.figures.purchasingPower, scen: result.scenario.figures.purchasingPower },
    { label: 'Pensjon v/67', base: result.baseline.figures.pensionAt67, scen: result.scenario.figures.pensionAt67 },
  ]

  function addOneTimeEvent() {
    const amount = parseFloat(newAmount.replace(/\s/g, '').replace(',', '.'))
    if (!newLabel.trim() || !newDate || isNaN(amount)) return
    setLevers({
      ...levers,
      oneTimeEvents: [
        ...levers.oneTimeEvents,
        { id: crypto.randomUUID(), label: newLabel.trim(), date: newDate, amount },
      ],
    })
    setNewLabel('')
    setNewDate('')
    setNewAmount('')
  }

  function removeOneTimeEvent(id: string) {
    setLevers({
      ...levers,
      oneTimeEvents: levers.oneTimeEvents.filter((e) => e.id !== id),
    })
  }

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 space-y-4">
      {/* SEKSJON 1: Spak-panel */}
      <div className="rounded-xl border border-border/50 bg-card/60 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4" /> Spaker
          </span>
          <button
            onClick={() => setLevers(DEFAULT_SCENARIO_LEVERS)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Nullstill
          </button>
        </div>

        {/* Lønn % */}
        <label className="block text-xs text-muted-foreground">
          Lønn {levers.salaryPct >= 0 ? '+' : ''}{levers.salaryPct} %
          <input
            type="range" min={-20} max={30} step={1} value={levers.salaryPct}
            onChange={(e) => setLevers({ ...levers, salaryPct: parseInt(e.target.value, 10) })}
            className="w-full accent-primary"
            aria-label="Lønnsendring i prosent"
          />
        </label>

        {/* Lønn flat kr/mnd */}
        <label className="block text-xs text-muted-foreground">
          Lønn (flat) {levers.salaryKr >= 0 ? '+' : ''}{fmtNOK(levers.salaryKr)}/mnd
          <input
            type="range" min={-10000} max={20000} step={500} value={levers.salaryKr}
            onChange={(e) => setLevers({ ...levers, salaryKr: parseInt(e.target.value, 10) })}
            className="w-full accent-primary"
            aria-label="Flat lønnsendring i kroner per måned"
          />
        </label>

        {/* Rente pp */}
        <label className="block text-xs text-muted-foreground">
          Rente {levers.rateDeltaPp >= 0 ? '+' : ''}{levers.rateDeltaPp} pp
          <input
            type="range" min={-3} max={5} step={0.25} value={levers.rateDeltaPp}
            onChange={(e) => setLevers({ ...levers, rateDeltaPp: parseFloat(e.target.value) })}
            className="w-full accent-primary"
            aria-label="Renteendring i prosentpoeng"
          />
        </label>

        {/* Månedssparing kr */}
        <label className="block text-xs text-muted-foreground">
          Månedssparing {levers.monthlySavingsDelta >= 0 ? '+' : ''}{fmtNOK(levers.monthlySavingsDelta)}
          <input
            type="range" min={-5000} max={15000} step={500} value={levers.monthlySavingsDelta}
            onChange={(e) => setLevers({ ...levers, monthlySavingsDelta: parseInt(e.target.value, 10) })}
            className="w-full accent-primary"
            aria-label="Endring i månedssparing"
          />
        </label>

        {/* Forutsetninger — andel av lønnsvekst spart */}
        <details className="group">
          <summary className="text-xs text-muted-foreground cursor-pointer select-none hover:text-foreground">
            Forutsetninger
          </summary>
          <div className="mt-2 space-y-2 pl-1">
            <label className="block text-xs text-muted-foreground">
              Andel av ekstra netto spart: {levers.extraNetToSavingsPct} %
              <input
                type="range" min={0} max={100} step={5} value={levers.extraNetToSavingsPct}
                onChange={(e) => setLevers({ ...levers, extraNetToSavingsPct: parseInt(e.target.value, 10) })}
                className="w-full accent-primary"
                aria-label="Andel av ekstra netto som antas spart"
              />
            </label>
            <p className="text-[10px] text-muted-foreground/60">
              Styrer hvor mye av en lønnsøkning som faktisk ender i sparing (0 % = alt forbrukes, 100 % = alt spares).
            </p>
          </div>
        </details>

        {/* Engangshendelser */}
        <div className="space-y-2 pt-1 border-t border-border/30">
          <p className="text-xs text-muted-foreground font-medium">Engangshendelser</p>
          {levers.oneTimeEvents.length > 0 && (
            <div className="space-y-1.5">
              {levers.oneTimeEvents.map((ev) => (
                <div key={ev.id} className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="text-muted-foreground truncate">{ev.label}</span>
                  <span className={cn('font-mono shrink-0', ev.amount >= 0 ? 'text-green-400' : 'text-red-400')}>
                    {ev.amount >= 0 ? '+' : ''}{fmtNOK(ev.amount)}
                  </span>
                  <span className="text-muted-foreground/50 shrink-0">{ev.date}</span>
                  <button
                    onClick={() => removeOneTimeEvent(ev.id)}
                    className="text-muted-foreground hover:text-red-400 shrink-0"
                    aria-label={`Fjern ${ev.label}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {/* Legg til skjema */}
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-1.5 items-end">
            <input
              type="text"
              placeholder="Beskrivelse"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              className="rounded-md border border-border/50 bg-background px-2 py-1 text-[11px] placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
              aria-label="Beskrivelse av engangsbeløp"
            />
            <input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="rounded-md border border-border/50 bg-background px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-primary"
              aria-label="Dato for engangsbeløp"
            />
            <input
              type="number"
              placeholder="Beløp (kr)"
              value={newAmount}
              onChange={(e) => setNewAmount(e.target.value)}
              className="rounded-md border border-border/50 bg-background px-2 py-1 text-[11px] w-24 placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
              aria-label="Beløp i kroner (negativt for utgift)"
            />
            <button
              onClick={addOneTimeEvent}
              className="flex items-center gap-1 rounded-md bg-primary/20 px-2 py-1 text-[11px] text-primary hover:bg-primary/30"
              aria-label="Legg til engangsbeløp"
            >
              <Plus className="h-3 w-3" /> Legg til
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground/50">Positivt beløp = inntekt (arv, bonus). Negativt = utgift (bil, oppussing).</p>
        </div>
      </div>

      {/* SEKSJON 2: Baseline vs scenario-graf */}
      <div className="rounded-xl border border-border/50 bg-card/60 p-4" style={{ height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(215 20% 22%)" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
            <Tooltip formatter={(v, n) => [fmtNOK(Number(v)), String(n)]} />
            <Line type="monotone" dataKey="baseline" name="Baseline" stroke="#94a3b8" strokeWidth={1.5} dot={false} />
            <Line type="monotone" dataKey="scenario" name="Scenario" stroke="#22c55e" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* SEKSJON 3: Nøkkeltall-delta */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {figs.map((f) => {
          const delta = f.scen - f.base
          const fmt = (n: number) => f.pct ? `${Math.round(n)} %` : fmtNOK(n)
          return (
            <div key={f.label} className="rounded-lg border border-border/50 bg-card/60 p-3">
              <p className="text-[11px] text-muted-foreground">{f.label}</p>
              <p className="text-sm font-mono font-semibold">{fmt(f.scen)}</p>
              <p className={cn('text-[10px] font-mono', delta > 0 ? 'text-green-400' : delta < 0 ? 'text-red-400' : 'text-muted-foreground')}>
                {delta >= 0 ? '+' : ''}{fmt(delta)}
              </p>
            </div>
          )
        })}
      </div>

      {/* SEKSJON 4: Treffsikkerhet-bånd */}
      {hitRate !== null && (
        <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-card/60 px-3 py-2 text-[11px] text-muted-foreground">
          <Target className="h-3.5 w-3.5 text-primary shrink-0" />
          <span>Prognosen din har historisk truffet {hitRate} % — scenariet arver samme usikkerhet.</span>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        Hypotetisk scenario — baseline er dine faktiske tall. Lagres lokalt, deles ikke.
      </p>
    </div>
  )
}
