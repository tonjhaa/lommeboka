import { Target, Lock, Unlock } from 'lucide-react'
import { useEconomyStore } from '@/application/useEconomyStore'
import { useForecastAccuracy } from '@/hooks/useForecastAccuracy'
import { cn } from '@/lib/utils'

function fmtNOK(n: number): string { return Math.round(n).toLocaleString('no-NO') + ' kr' }

export function ForecastAccuracyPage() {
  const profile = useEconomyStore((s) => s.profile)
  const calibrationLog = useEconomyStore((s) => s.calibrationLog)
  const settings = useEconomyStore((s) => s.calibrationSettings)
  const setCalibrationSettings = useEconomyStore((s) => s.setCalibrationSettings)
  const lockedKeys = useEconomyStore((s) => s.lockedCalibrationKeys)
  const lockCalibration = useEconomyStore((s) => s.lockCalibration)
  const unlockCalibration = useEconomyStore((s) => s.unlockCalibration)

  // Kanonisk treffsikkerhet — samme motor (useBudgetTable) som Budsjett-fanen,
  // så skattetrekk-treff ikke lenger avviker fra budsjettabellen.
  const { report, slipCount } = useForecastAccuracy()

  if (!profile || slipCount < 2) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
        Importer flere lønnsslipper for å måle treffsikkerhet.
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 space-y-4">
      {/* Treff-% topp */}
      {report && (
        <div className="rounded-xl border border-border/50 bg-card/60 p-4 flex items-center gap-4">
          <Target className="h-6 w-6 text-primary" />
          <div>
            <p className="text-3xl font-bold font-mono tabular-nums">{report.overallHitRate} %</p>
            <p className="text-xs text-muted-foreground">treffsikkerhet · {report.monthsWithData} måneder med data</p>
          </div>
        </div>
      )}

      {/* Innstillinger */}
      <div className="rounded-xl border border-border/50 bg-card/60 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Auto-kalibrer prognoser</span>
          <button
            role="switch" aria-checked={settings.enabled} aria-label="Auto-kalibrer prognoser"
            onClick={() => setCalibrationSettings({ ...settings, enabled: !settings.enabled })}
            className={cn('h-6 w-11 rounded-full transition-colors', settings.enabled ? 'bg-primary' : 'bg-muted')}
          >
            <span className={cn('block h-5 w-5 rounded-full bg-white transition-transform', settings.enabled ? 'translate-x-5' : 'translate-x-0.5')} />
          </button>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Horisont</span>
          <input type="range" min={3} max={12} step={1} value={settings.horizonSlips}
            aria-label="Antall slipper i kalibreringshorisont"
            onChange={(e) => setCalibrationSettings({ ...settings, horizonSlips: parseInt(e.target.value, 10) })}
            className="flex-1 accent-primary" />
          <span className="font-mono">{settings.horizonSlips} slipper</span>
        </div>
      </div>

      {/* Avvikstabell */}
      {report && report.rows.length > 0 && (
        <div className="rounded-xl border border-border/50 bg-card/60 p-4">
          <h3 className="text-sm font-medium mb-2">Avvik (budsjett vs faktisk)</h3>
          <div className="space-y-1.5">
            {report.rows.map((r) => (
              <div key={r.key} className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">{r.label}</span>
                <span className={cn('font-mono', Math.abs(r.deviationPct) <= 5 ? 'text-green-400' : Math.abs(r.deviationPct) <= 15 ? 'text-yellow-400' : 'text-red-400')}>
                  {r.deviation >= 0 ? '+' : ''}{fmtNOK(r.deviation)} ({r.deviationPct >= 0 ? '+' : ''}{Math.round(r.deviationPct)} %)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Kalibreringslogg */}
      <div className="rounded-xl border border-border/50 bg-card/60 p-4">
        <h3 className="text-sm font-medium mb-2">Kalibreringslogg</h3>
        {calibrationLog.length === 0 ? (
          <p className="text-xs text-muted-foreground">Ingen kalibreringer ennå.</p>
        ) : (
          <div className="space-y-1.5">
            {calibrationLog.slice(0, 20).map((e, i) => {
              const isLocked = lockedKeys.includes(e.key)
              // tabelltrekkProsent er en prosent, ikke kroner.
              const fmt = (n: number) => e.key === 'tabelltrekkProsent' ? `${n.toFixed(1)} %` : fmtNOK(n)
              return (
                <div key={`${e.key}-${i}`} className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">
                    {e.label}: {fmt(e.previous)} → <span className="text-foreground font-mono">{fmt(e.calibrated)}</span>
                    {e.sampleCount > 1 && <span className="text-muted-foreground/60"> (snitt {e.sampleCount})</span>}
                    <span className="text-muted-foreground/40 ml-1">{e.asOf}</span>
                  </span>
                  <button onClick={() => isLocked ? unlockCalibration(e.key) : lockCalibration(e.key)}
                    className="text-muted-foreground hover:text-foreground" title={isLocked ? 'Lås opp' : 'Lås (auto rører den ikke)'}>
                    {isLocked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
