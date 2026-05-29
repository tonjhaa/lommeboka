import type { LonnsoppgjorRecord } from '@/types/economy'

interface Props {
  records: LonnsoppgjorRecord[]
  cagr: number | null
}

const MONTH_SHORT = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Des']

function dateMs(iso: string) {
  return new Date(iso).getTime()
}

export function SalaryGrowthChart({ records, cagr }: Props) {
  const sorted = [...records]
    .filter((r) => r.maanedslonn > 0)
    .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate))

  if (sorted.length === 0) {
    return (
      <div className="rounded-xl border border-border/50 bg-card/60 px-4 py-4">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Lønnsutvikling</p>
        <p className="text-xs text-muted-foreground">
          Ingen lønnsoppgjør registrert. Bruk "Hent fra slipper"-knappen eller legg til manuelt.
        </p>
      </div>
    )
  }

  const W = 400
  const H = 110
  const pad = { top: 16, right: 16, bottom: 30, left: 12 }
  const innerW = W - pad.left - pad.right
  const innerH = H - pad.top - pad.bottom

  const todayIso = new Date().toISOString().split('T')[0]
  const todayMs = dateMs(todayIso)

  const firstMs = dateMs(sorted[0].effectiveDate)
  const lastRecordMs = dateMs(sorted[sorted.length - 1].effectiveDate)
  // X range: from first record to max(today, last record) + 3 months padding if future exists
  const hasFuture = lastRecordMs > todayMs
  const endMs = hasFuture ? lastRecordMs + 1000 * 60 * 60 * 24 * 30 : Math.max(todayMs + 1000 * 60 * 60 * 24 * 60, lastRecordMs + 1000 * 60 * 60 * 24 * 30)
  const timeRange = endMs - firstMs || 1

  function xForMs(ms: number) {
    return pad.left + ((ms - firstMs) / timeRange) * innerW
  }

  const minV = Math.min(...sorted.map((r) => r.maanedslonn)) * 0.96
  const maxV = Math.max(...sorted.map((r) => r.maanedslonn)) * 1.04
  const range = maxV - minV || 1

  function yForV(v: number) {
    return pad.top + (1 - (v - minV) / range) * innerH
  }

  const pts = sorted.map((r) => ({
    x: xForMs(dateMs(r.effectiveDate)),
    y: yForV(r.maanedslonn),
    r,
  }))

  const todayX = xForMs(todayMs)

  // Split into historical (up to and including today) and future segments
  const histPts = pts.filter((p) => dateMs(p.r.effectiveDate) <= todayMs)
  const futurePts = pts.filter((p) => dateMs(p.r.effectiveDate) > todayMs)

  // Today's salary = last historical record's salary
  const currentSalary = histPts.length > 0
    ? histPts[histPts.length - 1].r.maanedslonn
    : sorted[0].maanedslonn
  const todayY = yForV(currentSalary)

  // Line paths
  const histLine = histPts.length > 1
    ? histPts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
    : null

  // Future line: from today's position → future pts
  const futurePtsFull = futurePts.length > 0
    ? [{ x: todayX, y: todayY }, ...futurePts]
    : []
  const futureLine = futurePtsFull.length > 1
    ? futurePtsFull.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
    : null

  const allLinePts = [...(histPts.length > 0 ? histPts : []), ...futurePts]
  const fullLine = allLinePts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')

  const areaBottom = H - pad.bottom

  return (
    <div className="rounded-xl border border-border/50 bg-card/60 px-4 pt-3 pb-2">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
          Lønnsutvikling
        </span>
        {cagr !== null && (
          <span className="text-[10px] text-muted-foreground font-mono">
            CAGR: {(cagr * 100).toFixed(1)}% / år
          </span>
        )}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minHeight: 85 }} preserveAspectRatio="none">
        <defs>
          <linearGradient id="salary-grad-hist" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="salary-grad-future" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Historical area */}
        {histPts.length > 1 && (
          <path
            d={`${histLine} L${histPts[histPts.length - 1].x.toFixed(1)},${areaBottom} L${histPts[0].x.toFixed(1)},${areaBottom} Z`}
            fill="url(#salary-grad-hist)"
          />
        )}

        {/* Future area */}
        {futureLine && (
          <path
            d={`${futureLine} L${futurePtsFull[futurePtsFull.length - 1].x.toFixed(1)},${areaBottom} L${todayX.toFixed(1)},${areaBottom} Z`}
            fill="url(#salary-grad-future)"
          />
        )}

        {/* Historical line */}
        {histLine && (
          <path d={histLine} fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        )}

        {/* Future dashed line */}
        {futureLine && (
          <path d={futureLine} fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="4 3" strokeLinecap="round" />
        )}

        {/* Single line if no split needed */}
        {!histLine && !futureLine && allLinePts.length > 1 && (
          <path d={fullLine} fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" />
        )}

        {/* Today vertical line */}
        <line
          x1={todayX} y1={pad.top - 4}
          x2={todayX} y2={areaBottom}
          stroke="hsl(215 20.2% 40%)"
          strokeWidth="0.8"
          strokeDasharray="3 2"
        />
        <text x={todayX + 2} y={pad.top + 2} fontSize="5.5" fill="hsl(215 20.2% 55%)">I dag</text>

        {/* Today dot */}
        <circle cx={todayX} cy={todayY} r="2.5" fill="hsl(215 20.2% 55%)" stroke="hsl(240 10% 3.9%)" strokeWidth="1" />

        {/* Historical dots */}
        {histPts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="3" fill="#3b82f6" stroke="hsl(240 10% 3.9%)" strokeWidth="1" />
        ))}

        {/* Future dots */}
        {futurePts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="3" fill="#f59e0b" stroke="hsl(240 10% 3.9%)" strokeWidth="1" />
        ))}

        {/* X-axis labels — spread based on actual date positions */}
        {pts.map((p, i) => {
          const show = sorted.length <= 5 || i === 0 || i === sorted.length - 1 || i % Math.ceil(sorted.length / 4) === 0
          const month = Number(p.r.effectiveDate?.slice(5, 7) ?? 1)
          const label = `${MONTH_SHORT[month] ?? ''} ${p.r.year}`
          return show ? (
            <text key={i} x={p.x} y={H - pad.bottom + 10} textAnchor="middle" fontSize="6" fill="hsl(215 20.2% 50%)">
              {label}
            </text>
          ) : null
        })}

        {/* Today label on X-axis */}
        <text x={todayX} y={H - pad.bottom + 10} textAnchor="middle" fontSize="5.5" fill="hsl(215 20.2% 45%)">
          {new Date().toLocaleDateString('no-NO', { month: 'short', year: '2-digit' })}
        </text>

        {/* Salary labels: first, today, last */}
        {pts.length > 0 && (
          <text x={pts[0].x} y={pts[0].y - 5} textAnchor="middle" fontSize="6" fill="hsl(215 20.2% 65%)">
            {Math.round(sorted[0].maanedslonn / 1000)}k
          </text>
        )}
        <text x={todayX + 3} y={todayY - 4} textAnchor="start" fontSize="6" fill="hsl(215 20.2% 65%)">
          {Math.round(currentSalary / 1000)}k
        </text>
        {futurePts.length > 0 && (
          <text x={futurePts[futurePts.length - 1].x} y={futurePts[futurePts.length - 1].y - 5} textAnchor="middle" fontSize="6" fill="#f59e0b">
            {Math.round(futurePts[futurePts.length - 1].r.maanedslonn / 1000)}k
          </text>
        )}
      </svg>

      <div className="flex items-center gap-3 mt-1">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-blue-400" />
          <span className="text-[10px] text-muted-foreground">Historisk</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-amber-400" />
          <span className="text-[10px] text-muted-foreground">Forventet</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-0.5 bg-muted-foreground/40" style={{ borderTop: '1px dashed' }} />
          <span className="text-[10px] text-muted-foreground">I dag</span>
        </div>
      </div>
    </div>
  )
}
