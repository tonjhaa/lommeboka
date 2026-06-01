import type { PermisjonPeriode, PermisjonInput, FerieBlokk } from '@/types/permisjon'
import { beregnBarnehageStart } from '@/domain/economy/foreldrepengerRules'

const PERIODE_FARGER: Record<string, string> = {
  mor_før_termin:    'bg-purple-600',
  mor_obligatorisk:  'bg-purple-800',
  mor_kvote:         'bg-purple-500',
  felles_mor:        'bg-indigo-500',
  felles_far:        'bg-blue-500',
  far_kvote:         'bg-blue-600',
  ferie_pause:       'bg-muted border border-border',
}

const PERIODE_LABEL: Record<string, string> = {
  mor_før_termin:   'Mor (før termin)',
  mor_obligatorisk: 'Mor (obligatorisk)',
  mor_kvote:        'Mor (kvote)',
  felles_mor:       'Felles (mor)',
  felles_far:       'Felles (far)',
  far_kvote:        'Partner (kvote)',
  ferie_pause:      'Ferie-pause',
}

function monthsBetween(a: string, b: string): number {
  const da = new Date(a), db = new Date(b)
  return (db.getFullYear() - da.getFullYear()) * 12 + (db.getMonth() - da.getMonth())
}

function pct(date: string, startDate: string, totalMonths: number): number {
  return (monthsBetween(startDate, date) / totalMonths) * 100
}

export function PermisjonTimeline({
  input,
  perioder,
}: {
  input: PermisjonInput
  perioder: PermisjonPeriode[]
}) {
  if (!input.terminDato || perioder.length === 0) return null

  const barnehageStart = beregnBarnehageStart(input.terminDato, input.fodselsDato)
  const fodsel = input.fodselsDato ?? input.terminDato

  const tStart = new Date(input.terminDato)
  tStart.setMonth(tStart.getMonth() - 3)
  const timelineStart = tStart.toISOString().split('T')[0]

  const tEnd = new Date(barnehageStart)
  tEnd.setMonth(tEnd.getMonth() + 2)
  const timelineEnd = tEnd.toISOString().split('T')[0]

  const totalMonths = monthsBetween(timelineStart, timelineEnd) || 1

  function posPct(date: string) {
    return Math.max(0, Math.min(100, pct(date, timelineStart, totalMonths)))
  }
  function widthPct(fra: string, til: string) {
    return Math.max(0.5, posPct(til) - posPct(fra))
  }

  const months: { label: string; left: number }[] = []
  const cur = new Date(timelineStart)
  cur.setDate(1)
  while (cur.toISOString().split('T')[0] < timelineEnd) {
    months.push({
      label: cur.toLocaleDateString('no-NO', { month: 'short', year: '2-digit' }),
      left: posPct(cur.toISOString().split('T')[0]),
    })
    cur.setMonth(cur.getMonth() + 1)
  }

  const morPerioder = perioder.filter((p) => p.owner === 'meg')
  const farPerioder = perioder.filter((p) => p.owner === 'partner')

  const fodselYear = new Date(fodsel).getFullYear()
  const sommerBlokker: FerieBlokk[] = input.partnerErLærer
    ? [fodselYear, fodselYear + 1].map((y) => ({
        fra: `${y}-${input.partnerSommerFraManedDag}`,
        til: `${y}-${input.partnerSommerTilManedDag}`,
        label: 'Sommerferie',
      }))
    : []

  function renderPerioder(ps: PermisjonPeriode[]) {
    return ps.map((p) => {
      const l = posPct(p.fra)
      const w = widthPct(p.fra, p.til)
      const color = PERIODE_FARGER[p.type] ?? 'bg-muted'
      return (
        <div
          key={p.id}
          className={`absolute h-full ${color} rounded opacity-90 flex items-center justify-center overflow-hidden`}
          style={{ left: `${l}%`, width: `${w}%` }}
          title={`${PERIODE_LABEL[p.type] ?? p.type}: ${p.fra} → ${p.til}`}
        >
          <span className="text-[9px] text-white font-medium px-0.5 truncate hidden sm:block">
            {PERIODE_LABEL[p.type]}
          </span>
        </div>
      )
    })
  }

  return (
    <div className="space-y-3 select-none">
      <div className="relative h-5 text-[10px] text-muted-foreground">
        {months.map((m) => (
          <span key={m.label} className="absolute -translate-x-1/2" style={{ left: `${m.left}%` }}>
            {m.label}
          </span>
        ))}
      </div>

      <div>
        <p className="text-[10px] text-purple-400 mb-1 font-medium">Meg</p>
        <div className="relative h-8 bg-muted/20 rounded overflow-hidden border border-border/30">
          {input.mineFerieblokker.map((f, i) => (
            <div
              key={i}
              className="absolute h-full bg-orange-500/15 border-l border-r border-orange-500/30"
              style={{ left: `${posPct(f.fra)}%`, width: `${widthPct(f.fra, f.til)}%` }}
              title={`Ferie: ${f.fra} → ${f.til}`}
            />
          ))}
          {renderPerioder(morPerioder)}
        </div>
      </div>

      <div>
        <p className="text-[10px] text-blue-400 mb-1 font-medium">Partner{input.partnerErLærer ? ' (lærer)' : ''}</p>
        <div className="relative h-8 bg-muted/20 rounded overflow-hidden border border-border/30">
          {sommerBlokker.map((f, i) => (
            <div
              key={i}
              className="absolute h-full bg-yellow-500/15 border-l border-r border-yellow-500/30"
              style={{ left: `${posPct(f.fra)}%`, width: `${widthPct(f.fra, f.til)}%` }}
              title={`Sommerferie: ${f.fra} → ${f.til}`}
            />
          ))}
          {renderPerioder(farPerioder)}
        </div>
      </div>

      <div className="relative h-4">
        <div
          className="absolute w-px h-4 bg-pink-500"
          style={{ left: `${posPct(input.terminDato)}%` }}
          title={`Termin: ${input.terminDato}`}
        />
        <div
          className="absolute w-px h-4 bg-green-500"
          style={{ left: `${posPct(barnehageStart)}%` }}
          title={`Barnehagestart: ${barnehageStart}`}
        />
        <span
          className="absolute text-[9px] text-green-400 -translate-x-1/2"
          style={{ left: `${posPct(barnehageStart)}%`, top: 0 }}
        >🎒</span>
      </div>

      <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
        {Object.entries(PERIODE_LABEL).map(([k, v]) => (
          <span key={k} className="flex items-center gap-1">
            <span className={`inline-block w-3 h-3 rounded-sm ${PERIODE_FARGER[k]}`} />
            {v}
          </span>
        ))}
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm bg-yellow-500/30 border border-yellow-500/30" />
          Sommerferie
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-px h-3 bg-pink-500" />
          Termin
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-px h-3 bg-green-500" />
          Barnehagestart
        </span>
      </div>
    </div>
  )
}
