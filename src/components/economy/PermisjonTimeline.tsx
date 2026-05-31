import { Fragment } from 'react'
import type { PermisjonPeriode, PermisjonInput, FerieBlokk } from '@/types/permisjon'
import { beregnBarnehageStart } from '@/domain/economy/foreldrepengerRules'

/* ============================================================================
 *  Kvote-farger — NAV-semantikk: mor = blå, partner = grønn, helg = grå.
 * ========================================================================== */
const PERIODE_FARGER: Record<string, string> = {
  mor_før_termin:    'bg-blue-400',
  mor_obligatorisk:  'bg-blue-800',
  mor_kvote:         'bg-blue-500',
  felles_mor:        'bg-blue-600',
  felles_far:        'bg-green-400',
  far_kvote:         'bg-green-600',
  ferie_pause:       'bg-muted border border-border',
}

const PERIODE_SHORT: Record<string, string> = {
  mor_før_termin:   'Før termin',
  mor_obligatorisk: 'Oblig.',
  mor_kvote:        'Mødrekvote',
  felles_mor:       'Felles',
  felles_far:       'Felles',
  far_kvote:        'Fedrekvote',
  ferie_pause:      'Ferie',
}

const PERIODE_LABEL: Record<string, string> = {
  mor_før_termin:   'Mor — før termin',
  mor_obligatorisk: 'Mor — obligatorisk',
  mor_kvote:        'Mor — mødrekvote',
  felles_mor:       'Fellesperiode (mor)',
  felles_far:       'Fellesperiode (partner)',
  far_kvote:        'Partner — fedrekvote',
  ferie_pause:      'Ferie-pause',
}

function fmtShort(d: string) {
  return new Date(d).toLocaleDateString('no-NO', { day: 'numeric', month: 'short' })
}
function monthsBetween(a: string, b: string): number {
  const da = new Date(a), db = new Date(b)
  return (db.getFullYear() - da.getFullYear()) * 12 + (db.getMonth() - da.getMonth())
}

/* ============================================================================
 *  PermisjonTimeline — bred, vannrett tidslinje (uendret logikk, ny UI).
 * ========================================================================== */
export function PermisjonTimeline({
  input,
  perioder,
}: {
  input: PermisjonInput
  perioder: PermisjonPeriode[]
}) {
  if (!input.terminDato || perioder.length === 0) return null

  const barnehageStart = beregnBarnehageStart(input.terminDato, input.fodselsDato)

  const tStart = new Date(input.terminDato)
  tStart.setMonth(tStart.getMonth() - 3)
  const timelineStart = tStart.toISOString().split('T')[0]
  const tEnd = new Date(barnehageStart)
  tEnd.setMonth(tEnd.getMonth() + 2)
  const timelineEnd = tEnd.toISOString().split('T')[0]
  const totalMonths = monthsBetween(timelineStart, timelineEnd) || 1

  const posPct = (date: string) =>
    Math.max(0, Math.min(100, (monthsBetween(timelineStart, date) / totalMonths) * 100))
  const widthPct = (fra: string, til: string) => Math.max(0.6, posPct(til) - posPct(fra))

  const months: { label: string; left: number; isYear: boolean }[] = []
  const cur = new Date(timelineStart)
  cur.setDate(1)
  while (cur.toISOString().split('T')[0] < timelineEnd) {
    months.push({
      label: cur.toLocaleDateString('no-NO', { month: 'short' }),
      isYear: cur.getMonth() === 0,
      left: posPct(cur.toISOString().split('T')[0]),
    })
    cur.setMonth(cur.getMonth() + 1)
  }

  const morPerioder = perioder.filter((p) => p.owner === 'meg')
  const farPerioder = perioder.filter((p) => p.owner === 'partner')

  const fodsel = input.fodselsDato ?? input.terminDato
  const fodselYear = new Date(fodsel).getFullYear()
  const sommerBlokker: FerieBlokk[] = input.partnerErLærer
    ? [fodselYear, fodselYear + 1].map((y) => ({
        fra: `${y}-${input.partnerSommerFraManedDag}`,
        til: `${y}-${input.partnerSommerTilManedDag}`,
        label: 'Sommerferie',
      }))
    : []

  const terminLeft = posPct(input.terminDato)
  const bhgLeft = posPct(barnehageStart)

  function renderPerioder(ps: PermisjonPeriode[]) {
    return ps.map((p) => {
      const l = posPct(p.fra)
      const w = widthPct(p.fra, p.til)
      const color = PERIODE_FARGER[p.type] ?? 'bg-muted'
      return (
        <div
          key={p.id}
          className={`absolute top-1 bottom-1 ${color} rounded-lg flex items-center px-2 overflow-hidden shadow-sm`}
          style={{ left: `${l}%`, width: `${w}%` }}
          title={`${PERIODE_LABEL[p.type] ?? p.type}: ${fmtShort(p.fra)} → ${fmtShort(p.til)}`}
        >
          {w > 7 && (
            <span className="text-[11px] font-semibold text-white whitespace-nowrap drop-shadow-sm">
              {PERIODE_SHORT[p.type]}
            </span>
          )}
        </div>
      )
    })
  }

  return (
    <div className="overflow-x-auto pb-1 select-none">
      <div className="min-w-[760px]">
        <div className="flex items-end gap-4">
          <div className="w-32 shrink-0" />
          <div className="relative flex-1 h-6">
            {months.filter((_, i) => i % 2 === 0).map((m, i) => (
              <span key={i} className="absolute -translate-x-1/2 text-[11px] text-muted-foreground flex flex-col items-center" style={{ left: `${m.left}%` }}>
                {m.label}
                <span className="mt-1 w-px h-1.5 bg-border" />
              </span>
            ))}
          </div>
        </div>

        <div className="relative">
          <div className="absolute left-36 right-0 top-0 bottom-0 pointer-events-none z-10">
            <div className="absolute w-0.5 bg-pink-500/80" style={{ left: `${terminLeft}%`, top: -2, bottom: 70 }} />
            <div className="absolute w-0.5 bg-amber-500/80" style={{ left: `${bhgLeft}%`, top: -2, bottom: 70 }} />
          </div>

          {/* Mor */}
          <div className="flex items-center gap-4 mb-3.5">
            <div className="w-32 shrink-0">
              <p className="text-sm font-semibold flex items-center gap-2"><span className="inline-block w-2.5 h-2.5 rounded-[3px] bg-blue-500" /> Meg</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{input.fodselsDato ? 'mor' : 'mor (gravid)'}</p>
            </div>
            <div className="relative flex-1 h-12 rounded-xl bg-muted/20 border border-border overflow-hidden">
              {input.mineFerieblokker.map((f, i) => (
                <div key={i} className="absolute top-0 bottom-0 bg-orange-500/15 border-x border-orange-500/40" style={{ left: `${posPct(f.fra)}%`, width: `${widthPct(f.fra, f.til)}%` }} title={`Ferie: ${fmtShort(f.fra)} → ${fmtShort(f.til)}`} />
              ))}
              {renderPerioder(morPerioder)}
            </div>
          </div>

          {/* Partner */}
          <div className="flex items-center gap-4">
            <div className="w-32 shrink-0">
              <p className="text-sm font-semibold flex items-center gap-2"><span className="inline-block w-2.5 h-2.5 rounded-[3px] bg-green-600" /> Partner</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{input.partnerErLærer ? 'lærer' : 'far / medmor'}</p>
            </div>
            <div className="relative flex-1 h-12 rounded-xl bg-muted/20 border border-border overflow-hidden">
              {sommerBlokker.map((f, i) => (
                <div key={i} className="absolute top-0 bottom-0 bg-yellow-500/15 border-x border-yellow-500/40" style={{ left: `${posPct(f.fra)}%`, width: `${widthPct(f.fra, f.til)}%` }} title={`Sommerferie: ${fmtShort(f.fra)} → ${fmtShort(f.til)}`} />
              ))}
              {renderPerioder(farPerioder)}
            </div>
          </div>

          {/* Markører */}
          <div className="flex items-start gap-4 mt-3">
            <div className="w-32 shrink-0" />
            <div className="relative flex-1 h-11">
              <div className="absolute -translate-x-1/2 flex flex-col items-center gap-1" style={{ left: `${terminLeft}%` }}>
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-pink-500/15 text-pink-300 border border-pink-500/40 whitespace-nowrap">
                  <span className="w-1.5 h-1.5 rounded-full bg-pink-500" /> Termin
                </span>
                <span className="text-[10.5px] text-muted-foreground">{fmtShort(input.terminDato)}</span>
              </div>
              <div className="absolute -translate-x-1/2 flex flex-col items-center gap-1" style={{ left: `${bhgLeft}%` }}>
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/40 whitespace-nowrap">🎒 Barnehage</span>
                <span className="text-[10.5px] text-muted-foreground">{fmtShort(barnehageStart)}</span>
              </div>
            </div>
          </div>
        </div>

        <PlanLegend partnerErLærer={input.partnerErLærer} />
      </div>
    </div>
  )
}

/* Felles forklaring (legend) — NAV-vokabular. */
function PlanLegend({ partnerErLærer }: { partnerErLærer: boolean }) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2 mt-5 pt-4 border-t border-border">
      <span className="flex items-center gap-2 text-xs text-muted-foreground"><span className="inline-block w-3 h-3 rounded-[4px] bg-blue-500" />Mors periode</span>
      <span className="flex items-center gap-2 text-xs text-muted-foreground"><span className="inline-block w-3 h-3 rounded-[4px] bg-green-600" />Partners periode</span>
      <span className="flex items-center gap-2 text-xs text-muted-foreground"><span className="inline-block w-3 h-3 rounded-[4px] bg-muted" />Helg</span>
      <span className="flex items-center gap-2 text-xs text-muted-foreground"><span className="inline-block w-3 h-3 rounded-full bg-orange-500/60" />Min ferie</span>
      {partnerErLærer && <span className="flex items-center gap-2 text-xs text-muted-foreground"><span className="inline-block w-3 h-3 rounded-[4px] bg-yellow-500/50" />Sommerferie</span>}
      <span className="flex items-center gap-2 text-xs text-muted-foreground"><span className="inline-block w-3 h-3 rounded-[4px] border-2 border-pink-500" />Termin</span>
      <span className="flex items-center gap-2 text-xs text-muted-foreground">🎒 Barnehageplass</span>
    </div>
  )
}

/* ============================================================================
 *  PermisjonKalender — NAV-stil månedskalender. Dager farges etter hvem som
 *  er hjemme; helg = grå; termin- og barnehage-markør.
 * ========================================================================== */
const UKEDAGER = ['ma', 'ti', 'on', 'to', 'fr', 'lø', 'sø']
const MND_NAVN = ['Januar','Februar','Mars','April','Mai','Juni','Juli','August','September','Oktober','November','Desember']

function isoWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = (date.getUTCDay() + 6) % 7
  date.setUTCDate(date.getUTCDate() - day + 3)
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4))
  const fday = (firstThursday.getUTCDay() + 6) % 7
  firstThursday.setUTCDate(firstThursday.getUTCDate() - fday + 3)
  return 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000))
}
function ymd(d: Date) { return d.toISOString().split('T')[0] }
function ownerOf(type: string): 'meg' | 'partner' {
  return type === 'far_kvote' || type === 'felles_far' ? 'partner' : 'meg'
}

export function PermisjonKalender({
  input,
  perioder,
}: {
  input: PermisjonInput
  perioder: PermisjonPeriode[]
}) {
  if (!input.terminDato || perioder.length === 0) return null

  const barnehageStart = beregnBarnehageStart(input.terminDato, input.fodselsDato)

  const dayMap: Record<string, { type: string; owner: 'meg' | 'partner' }> = {}
  perioder.forEach((p) => {
    const owner = ownerOf(p.type)
    const cur = new Date(p.fra), end = new Date(p.til)
    while (cur <= end) { dayMap[ymd(cur)] = { type: p.type, owner }; cur.setDate(cur.getDate() + 1) }
  })
  const ferieDays: Record<string, boolean> = {}
  input.mineFerieblokker.forEach((f) => {
    const cur = new Date(f.fra), end = new Date(f.til)
    while (cur <= end) { ferieDays[ymd(cur)] = true; cur.setDate(cur.getDate() + 1) }
  })

  const allStarts = perioder.map((p) => p.fra).sort()
  const firstDate = new Date(allStarts[0])
  const lastDate = new Date(barnehageStart)
  const months: Date[] = []
  const m = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1)
  const stop = new Date(lastDate.getFullYear(), lastDate.getMonth(), 1)
  while (m <= stop && months.length < 18) { months.push(new Date(m)); m.setMonth(m.getMonth() + 1) }

  function dayClass(info: { type: string; owner: string } | undefined, isWeekend: boolean): string {
    if (!info) return 'bg-muted/20 text-muted-foreground/60'
    if (isWeekend) return 'bg-muted text-muted-foreground'
    if (info.owner === 'partner') return `${info.type === 'felles_far' ? 'bg-green-500' : 'bg-green-600'} text-white`
    const map: Record<string, string> = { mor_obligatorisk: 'bg-blue-800', mor_før_termin: 'bg-blue-700', felles_mor: 'bg-blue-600', mor_kvote: 'bg-blue-500' }
    return `${map[info.type] ?? 'bg-blue-500'} text-white`
  }

  function renderMonth(monthDate: Date) {
    const year = monthDate.getFullYear(), mon = monthDate.getMonth()
    const startDow = (new Date(year, mon, 1).getDay() + 6) % 7
    const daysInMonth = new Date(year, mon + 1, 0).getDate()
    const cells: (Date | null)[] = []
    for (let i = 0; i < startDow; i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, mon, d))
    while (cells.length % 7 !== 0) cells.push(null)
    const rows: (Date | null)[][] = []
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7))

    return (
      <div key={`${year}-${mon}`}>
        <p className="mb-2.5 text-sm font-semibold tracking-tight">{MND_NAVN[mon]} {year}</p>
        <div className="grid grid-cols-[22px_repeat(7,1fr)] gap-1 items-center">
          <span className="text-[10px] text-muted-foreground/60 text-center">uke</span>
          {UKEDAGER.map((u) => <span key={u} className="text-[11px] font-medium text-muted-foreground text-center pb-0.5">{u}</span>)}
          {rows.map((row, ri) => {
            const firstReal = row.find(Boolean) as Date | undefined
            return (
              <Fragment key={ri}>
                <span className="text-[10.5px] text-muted-foreground/60 text-center">{firstReal ? isoWeek(firstReal) : ''}</span>
                {row.map((cell, ci) => {
                  if (!cell) return <span key={ci} className="aspect-square" />
                  const ds = ymd(cell)
                  const info = dayMap[ds]
                  const isWeekend = ci === 5 || ci === 6
                  const isTermin = ds === input.terminDato
                  const isBhg = ds === barnehageStart
                  return (
                    <span
                      key={ci}
                      className={`relative aspect-square grid place-items-center text-[12.5px] font-medium rounded-lg ${dayClass(info, isWeekend)} ${isTermin ? 'ring-2 ring-pink-500 ring-inset !text-pink-200 font-bold' : ''} ${isBhg ? 'ring-2 ring-amber-500 ring-inset' : ''}`}
                      title={info ? (info.owner === 'partner' ? 'Partners periode' : 'Mors periode') : ''}
                    >
                      {cell.getDate()}
                      {ferieDays[ds] && <span className="absolute bottom-[3px] left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-orange-500" />}
                      {isBhg && <span className="absolute -top-1.5 -right-1 text-[11px]">🎒</span>}
                    </span>
                  )
                })}
              </Fragment>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(248px, 1fr))' }}>
        {months.map(renderMonth)}
      </div>
      <PlanLegend partnerErLærer={input.partnerErLærer} />
    </div>
  )
}
