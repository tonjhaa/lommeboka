import { useRef, useState } from 'react'

interface DataPoint {
  m: string
  v: number
}

interface FormueChartProps {
  history: DataPoint[]
  projected?: DataPoint[]
  nettoFormue: number
  label?: string
}

export function FormueChart({ history, projected = [], nettoFormue, label = 'Nettoinntekt' }: FormueChartProps) {
  const allPoints = [...history, ...projected]

  if (allPoints.length < 1) {
    return (
      <div className="rounded-xl border border-border/50 bg-card/60 flex flex-col items-center justify-center gap-1 p-4">
        <p className="text-xs text-muted-foreground">Last opp lønnsslipper for å se trend</p>
      </div>
    )
  }

  const W = 300
  const H = 100
  const pad = { top: 14, right: 10, bottom: 22, left: 10 }
  const innerW = W - pad.left - pad.right
  const innerH = H - pad.top - pad.bottom

  const totalLen = allPoints.length
  const min = Math.min(...allPoints.map((d) => d.v)) * 0.97
  const max = Math.max(...allPoints.map((d) => d.v)) * 1.03
  const range = max - min || 1

  function xOf(i: number) { return pad.left + (i / Math.max(totalLen - 1, 1)) * innerW }
  function yOf(v: number) { return pad.top + (1 - (v - min) / range) * innerH }

  const histPts = history.map((d, i) => ({ x: xOf(i), y: yOf(d.v), ...d }))
  const projOffset = history.length - 1
  const projPts = projected.map((d, i) => ({ x: xOf(projOffset + i + 1), y: yOf(d.v), ...d }))

  const svgRef = useRef<SVGSVGElement>(null)
  const [hoverInfo, setHoverInfo] = useState<{ m: string; v: number; proj: boolean } | null>(null)

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const svgX = ((e.clientX - rect.left) / rect.width) * W
    const combined = [...histPts, ...projPts]
    let closest = combined[0]
    let minDist = Infinity
    combined.forEach((p) => {
      const d = Math.abs(p.x - svgX)
      if (d < minDist) { minDist = d; closest = p }
    })
    const isProj = projPts.some(p => p.x === closest.x && p.y === closest.y)
    setHoverInfo({ m: closest.m, v: closest.v, proj: isProj })
  }

  // Aktuelle linjer
  const histLine = histPts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const histArea = histPts.length > 1
    ? `${histLine} L${histPts[histPts.length-1].x.toFixed(1)},${(H-pad.bottom).toFixed(1)} L${histPts[0].x.toFixed(1)},${(H-pad.bottom).toFixed(1)} Z`
    : ''

  // Projeksjonslinje starter fra siste faktiske punkt
  const lastHist = histPts[histPts.length - 1]
  const projLine = lastHist && projPts.length > 0
    ? [`M${lastHist.x.toFixed(1)},${lastHist.y.toFixed(1)}`, ...projPts.map(p => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`)].join(' ')
    : ''

  const trendUp = history.length >= 2 && history[history.length-1].v > history[history.length-2].v * 1.01
  const trendDown = history.length >= 2 && history[history.length-1].v < history[history.length-2].v * 0.99

  return (
    <div className="rounded-xl border border-border/50 bg-card/60 px-4 pt-3 pb-2 flex flex-col">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
        <span className="text-[10px] text-muted-foreground font-mono tabular-nums">
          {hoverInfo ? (
            <>
              <span className="text-foreground font-semibold">{hoverInfo.m}</span>{' '}
              {Math.round(hoverInfo.v).toLocaleString('no-NO')} kr
              {hoverInfo.proj && <span className="text-muted-foreground/60"> (est.)</span>}
            </>
          ) : (
            <>{trendUp ? '↑' : trendDown ? '↓' : '→'}{' '}
            {Math.round(nettoFormue).toLocaleString('no-NO')} kr netto formue</>
          )}
        </span>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full flex-1 cursor-crosshair"
        style={{ minHeight: 64 }}
        preserveAspectRatio="none"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverInfo(null)}
      >
        <defs>
          <linearGradient id="fg-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22c55e" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
          </linearGradient>
        </defs>

        {histArea && <path d={histArea} fill="url(#fg-grad)" />}

        {/* Faktisk linje */}
        {histLine && (
          <path d={histLine} fill="none" stroke="#22c55e" strokeWidth="1.8"
            strokeLinecap="round" strokeLinejoin="round" />
        )}

        {/* Projeksjonslinje — stiplet */}
        {projLine && (
          <path d={projLine} fill="none" stroke="#22c55e" strokeWidth="1.4"
            strokeLinecap="round" strokeLinejoin="round"
            strokeDasharray="4 3" opacity="0.5" />
        )}

        {/* Skillelinje faktisk/proj */}
        {lastHist && projPts.length > 0 && (
          <line x1={lastHist.x} y1={pad.top} x2={lastHist.x} y2={H - pad.bottom}
            stroke="hsl(215 20.2% 28%)" strokeWidth="0.8" strokeDasharray="2 2" />
        )}

        {/* X-labels — tynnes så de holder seg lesbare uansett antall punkter (maks ~8 synlige) */}
        {(() => {
          const all = [...histPts, ...projPts]
          const step = Math.max(1, Math.ceil(all.length / 8))
          return all.map((p, i) => (
            (i % step === 0 || i === all.length - 1) ? (
              <text key={i} x={p.x} y={H - pad.bottom + 10} textAnchor="middle" fontSize="6"
                fill={i >= histPts.length ? 'hsl(215 20.2% 38%)' : 'hsl(215 20.2% 50%)'}>
                {p.m}
              </text>
            ) : null
          ))
        })()}

        {/* Hover dot */}
        {hoverInfo && (() => {
          const combined = [...histPts, ...projPts]
          const pt = combined.find(p => p.m === hoverInfo.m)
          return pt ? (
            <>
              <circle cx={pt.x} cy={pt.y} r="3.5" fill="#22c55e" opacity="0.2" />
              <circle cx={pt.x} cy={pt.y} r="2" fill="#22c55e" />
            </>
          ) : null
        })()}

        {/* Siste faktiske punkt */}
        {!hoverInfo && lastHist && (
          <circle cx={lastHist.x} cy={lastHist.y} r="2.5" fill="#22c55e" />
        )}
      </svg>

      {projected.length > 0 && (
        <div className="flex items-center gap-1 mt-0.5">
          <div className="flex items-center gap-1">
            <svg width="14" height="6"><line x1="0" y1="3" x2="14" y2="3" stroke="#22c55e" strokeWidth="1.5" /></svg>
            <span className="text-[8px] text-muted-foreground/60">Faktisk</span>
          </div>
          <div className="flex items-center gap-1 ml-2">
            <svg width="14" height="6"><line x1="0" y1="3" x2="14" y2="3" stroke="#22c55e" strokeWidth="1.5" strokeDasharray="3 2" opacity="0.5" /></svg>
            <span className="text-[8px] text-muted-foreground/60">Estimert</span>
          </div>
        </div>
      )}
    </div>
  )
}
