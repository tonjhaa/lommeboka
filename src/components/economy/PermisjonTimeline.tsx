import { Fragment, useState, useEffect, useRef } from 'react'
import type { PermisjonPeriode, PermisjonInput, FerieBlokk } from '@/types/permisjon'
import { beregnBarnehageStart } from '@/domain/economy/foreldrepengerRules'

/* ============================================================================
 *  Kvote-farger — NAV-semantikk: mor = blå, partner = grønn.
 * ========================================================================== */
const PERIODE_FARGER: Record<string, string> = {
  mor_før_termin:    'bg-blue-400',
  mor_obligatorisk:  'bg-blue-800',
  mor_kvote:         'bg-blue-500',
  felles_mor:        'bg-blue-600',
  felles_far:        'bg-green-400',
  far_kvote:         'bg-green-600',
  ferie_pause:       'bg-orange-500/20 border border-orange-500/40',
}

const PERIODE_SHORT: Record<string, string> = {
  mor_før_termin:   'Før termin',
  mor_obligatorisk: 'Oblig.',
  mor_kvote:        'Mødrekvote',
  felles_mor:       'Felles',
  felles_far:       'Felles',
  far_kvote:        'Medmorkvote',
  ferie_pause:      'Ferie-pause',
}

const PERIODE_LABEL: Record<string, string> = {
  mor_før_termin:   'Mor — før termin',
  mor_obligatorisk: 'Mor — obligatorisk',
  mor_kvote:        'Mor — mødrekvote',
  felles_mor:       'Fellesperiode (mor)',
  felles_far:       'Fellesperiode (partner)',
  far_kvote:        'Partner — medmorkvote',
  ferie_pause:      'Ferie-pause',
}

function fmtShort(d: string) {
  return new Date(d).toLocaleDateString('no-NO', { day: 'numeric', month: 'short' })
}
function fmtLong(d: string) {
  return new Date(d).toLocaleDateString('no-NO', { day: 'numeric', month: 'long' })
}
function monthsBetween(a: string, b: string): number {
  const da = new Date(a), db = new Date(b)
  return (db.getFullYear() - da.getFullYear()) * 12 + (db.getMonth() - da.getMonth())
}

/* Legg til/trekk fra dager fra en YYYY-MM-DD-streng */
function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

/* Sett inn ferie-pause og forskyv etterfølgende perioder for owner */
function insertFeriePause(
  perioder: PermisjonPeriode[],
  owner: 'meg' | 'partner',
  ferieFra: string,
  ferieTil: string,
): PermisjonPeriode[] {
  const fFra = new Date(ferieFra)
  const fTil = new Date(ferieTil)
  const shiftDays = Math.round((fTil.getTime() - fFra.getTime()) / 86400000) + 1

  const result: PermisjonPeriode[] = []

  for (const p of perioder) {
    // Perioder for den andre forelderen berøres ikke
    if (p.owner !== owner || p.erPause) {
      result.push(p)
      continue
    }
    const pFra = new Date(p.fra)
    const pTil = new Date(p.til)

    if (pTil < fFra) {
      // Perioden slutter før ferien begynner: uendret
      result.push(p)
    } else if (pFra >= fFra) {
      // Perioden starter etter eller på feriedagen: forskyv
      result.push({ ...p, fra: addDaysStr(p.fra, shiftDays), til: addDaysStr(p.til, shiftDays) })
    } else {
      // Perioden overlapper med feriestart: splitt
      result.push({ ...p, til: addDaysStr(ferieFra, -1) })
      result.push({
        ...p,
        id: crypto.randomUUID(),
        fra: addDaysStr(ferieTil, 1),
        til: addDaysStr(p.til, shiftDays),
      })
    }
  }

  // Sett inn ferieblokken
  result.push({
    id: crypto.randomUUID(),
    type: 'ferie_pause',
    owner,
    fra: ferieFra,
    til: ferieTil,
    erPause: true,
  })

  return result.sort((a, b) => a.fra.localeCompare(b.fra))
}

/* ============================================================================
 *  PermisjonTimeline — bred, vannrett tidslinje
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

  const months: { label: string; left: number }[] = []
  const cur = new Date(timelineStart)
  cur.setDate(1)
  while (cur.toISOString().split('T')[0] < timelineEnd) {
    months.push({ label: cur.toLocaleDateString('no-NO', { month: 'short' }), left: posPct(cur.toISOString().split('T')[0]) })
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

          <div className="flex items-center gap-4 mb-3.5">
            <div className="w-32 shrink-0">
              <p className="text-sm font-semibold flex items-center gap-2"><span className="inline-block w-2.5 h-2.5 rounded-[3px] bg-blue-500" /> Meg</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{input.morErMeg ? (input.fodselsDato ? 'mor' : 'mor (gravid)') : 'medmor / far'}</p>
            </div>
            <div className="relative flex-1 h-12 rounded-xl bg-muted/20 border border-border overflow-hidden">
              {renderPerioder(morPerioder)}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="w-32 shrink-0">
              <p className="text-sm font-semibold flex items-center gap-2"><span className="inline-block w-2.5 h-2.5 rounded-[3px] bg-green-600" /> Partner</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{input.morErMeg ? (input.partnerErLærer ? 'medmor/far · lærer' : 'medmor / far') : (input.fodselsDato ? 'mor' : 'mor (gravid)')}</p>
            </div>
            <div className="relative flex-1 h-12 rounded-xl bg-muted/20 border border-border overflow-hidden">
              {sommerBlokker.map((f, i) => (
                <div key={i} className="absolute top-0 bottom-0 bg-yellow-500/15 border-x border-yellow-500/40" style={{ left: `${posPct(f.fra)}%`, width: `${widthPct(f.fra, f.til)}%` }} title={`Sommerferie: ${fmtShort(f.fra)} → ${fmtShort(f.til)}`} />
              ))}
              {renderPerioder(farPerioder)}
            </div>
          </div>

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

/* Forklaring (legend) */
function PlanLegend({ partnerErLærer }: { partnerErLærer: boolean }) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2 mt-5 pt-4 border-t border-border">
      <span className="flex items-center gap-2 text-xs text-muted-foreground"><span className="inline-block w-3 h-3 rounded-[4px] bg-blue-500" />Mors periode</span>
      <span className="flex items-center gap-2 text-xs text-muted-foreground"><span className="inline-block w-3 h-3 rounded-[4px] bg-green-600" />Partners periode</span>
      <span className="flex items-center gap-2 text-xs text-muted-foreground"><span className="inline-block w-3 h-3 rounded-[4px] bg-orange-500/30 border border-orange-500/50" />Ferie-pause</span>
      {partnerErLærer && <span className="flex items-center gap-2 text-xs text-muted-foreground"><span className="inline-block w-3 h-3 rounded-[4px] bg-yellow-500/50" />Sommerferie</span>}
      <span className="flex items-center gap-2 text-xs text-muted-foreground"><span className="inline-block w-3 h-3 rounded-[4px] border-2 border-pink-500" />Termin</span>
      <span className="flex items-center gap-2 text-xs text-muted-foreground">🎒 Barnehageplass</span>
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="relative inline-block w-3 h-3 rounded-[4px] bg-muted ring-1 ring-red-500/50"><span className="absolute top-[1px] right-[1px] w-1 h-1 rounded-full bg-red-500" /></span>
        Helligdag
      </span>
    </div>
  )
}

/* ============================================================================
 *  Norske helligdager — Meeus/Jones/Butcher-algoritme for påsken + faste dager
 * ========================================================================== */
function easterSunday(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month, day)
}

function addDaysToDate(d: Date, days: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + days)
  return r
}

function getNorskHelligdager(year: number): Map<string, string> {
  const map = new Map<string, string>()
  const fmt = (d: Date) => d.toISOString().split('T')[0]
  map.set(`${year}-01-01`, 'Nyttårsdag')
  map.set(`${year}-05-01`, 'Arbeidernes dag')
  map.set(`${year}-05-17`, 'Grunnlovsdag')
  map.set(`${year}-12-25`, '1. juledag')
  map.set(`${year}-12-26`, '2. juledag')
  const påske = easterSunday(year)
  map.set(fmt(addDaysToDate(påske, -3)), 'Skjærtorsdag')
  map.set(fmt(addDaysToDate(påske, -2)), 'Langfredag')
  map.set(fmt(påske),                   '1. påskedag')
  map.set(fmt(addDaysToDate(påske,  1)), '2. påskedag')
  map.set(fmt(addDaysToDate(påske, 39)), 'Kristi himmelfartsdag')
  map.set(fmt(addDaysToDate(påske, 49)), '1. pinsedag')
  map.set(fmt(addDaysToDate(påske, 50)), '2. pinsedag')
  return map
}

/* ============================================================================
 *  PermisjonKalender — interaktiv månedskalender med ferie-velger
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

export function PermisjonKalender({
  input,
  perioder,
  setPerioder,
  setInput,
}: {
  input: PermisjonInput
  perioder: PermisjonPeriode[]
  setPerioder: (p: PermisjonPeriode[]) => void
  setInput: (updates: Partial<PermisjonInput>) => void
}) {
  if (!input.terminDato || perioder.length === 0) return null

  const barnehageStart = beregnBarnehageStart(input.terminDato, input.fodselsDato)

  // --- Dra-og-velg-tilstand ---
  const [selStart, setSelStart] = useState<string | null>(null)
  const [selHover, setSelHover] = useState<string | null>(null)
  const isDragging = useRef(false)
  // Panel-steg: 'idle' → 'selected' → 'confirm'
  const [panelStep, setPanelStep] = useState<'idle' | 'selected' | 'confirm'>('idle')
  const [forskyv, setForskyv] = useState(true)

  // Normalisert valg (alltid fra < til)
  const selRange = selStart && selHover
    ? { fra: [selStart, selHover].sort()[0], til: [selStart, selHover].sort()[1] }
    : selStart
    ? { fra: selStart, til: selStart }
    : null

  // Frigjør dragging om musknappen slippes utenfor kalenderen
  useEffect(() => {
    function handleGlobalUp() { isDragging.current = false }
    document.addEventListener('mouseup', handleGlobalUp)
    return () => document.removeEventListener('mouseup', handleGlobalUp)
  }, [])

  // --- Dags-kart: hvilken periode + eier tilhører en gitt dag? ---
  const dayMap: Record<string, { type: string; owner: 'meg' | 'partner' }> = {}
  perioder.forEach((p) => {
    const cur = new Date(p.fra), end = new Date(p.til)
    while (cur <= end) { dayMap[ymd(cur)] = { type: p.type, owner: p.owner }; cur.setDate(cur.getDate() + 1) }
  })

  // Ferie-blokker for visuell overlay (simultant ferie vises som prikker)
  const ferieDaysMeg: Record<string, boolean> = {}
  input.mineFerieblokker.forEach((f) => {
    const cur = new Date(f.fra), end = new Date(f.til)
    while (cur <= end) { ferieDaysMeg[ymd(cur)] = true; cur.setDate(cur.getDate() + 1) }
  })
  const ferieDaysPartner: Record<string, boolean> = {}
  input.partnerFerieblokker.forEach((f) => {
    const cur = new Date(f.fra), end = new Date(f.til)
    while (cur <= end) { ferieDaysPartner[ymd(cur)] = true; cur.setDate(cur.getDate() + 1) }
  })

  // --- Måneder å vise ---
  const allStarts = perioder.map((p) => p.fra).sort()
  const firstDate = new Date(allStarts[0])
  const lastDate = new Date(barnehageStart)
  const months: Date[] = []
  const m = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1)
  const stop = new Date(lastDate.getFullYear(), lastDate.getMonth(), 1)
  while (m <= stop && months.length < 20) { months.push(new Date(m)); m.setMonth(m.getMonth() + 1) }

  // Helligdager
  const helligdagÅr = new Set(months.map((mo) => mo.getFullYear()))
  const helligdager = new Map<string, string>()
  helligdagÅr.forEach((yr) => getNorskHelligdager(yr).forEach((navn, dato) => helligdager.set(dato, navn)))

  // --- Avled eier fra valgt område ---
  function getSelectionOwner(): 'meg' | 'partner' {
    if (!selRange) return 'meg'
    let meg = 0, partner = 0
    const cur = new Date(selRange.fra), end = new Date(selRange.til)
    while (cur <= end) {
      const info = dayMap[ymd(cur)]
      if (info?.owner === 'meg') meg++
      else if (info?.owner === 'partner') partner++
      cur.setDate(cur.getDate() + 1)
    }
    return partner > meg ? 'partner' : 'meg'
  }

  // --- Overlappende perioder i valgt område ---
  const overlappingPerioder = selRange
    ? perioder.filter((p) => !p.erPause && p.fra <= selRange.til && p.til >= selRange.fra)
    : []

  // --- Antall dager valgt ---
  const selDays = selRange
    ? Math.round((new Date(selRange.til).getTime() - new Date(selRange.fra).getTime()) / 86400000) + 1
    : 0
  const selWeeks = Math.floor(selDays / 7)
  const selRem = selDays % 7
  const selLabel = selWeeks > 0
    ? `${selWeeks} uke${selWeeks !== 1 ? 'r' : ''}${selRem > 0 ? ` og ${selRem} dag${selRem !== 1 ? 'er' : ''}` : ''}`
    : `${selDays} dag${selDays !== 1 ? 'er' : ''}`

  function reset() {
    setSelStart(null)
    setSelHover(null)
    setPanelStep('idle')
    setForskyv(true)
  }

  function applyFerie() {
    if (!selRange) return
    const owner = getSelectionOwner()

    if (!forskyv) {
      // Simultant: kun visuell markering, ingen endring i perioder
      const blokk: FerieBlokk = { fra: selRange.fra, til: selRange.til, label: 'Ferie' }
      if (owner === 'meg') {
        setInput({ mineFerieblokker: [...input.mineFerieblokker, blokk] })
      } else {
        setInput({ partnerFerieblokker: [...input.partnerFerieblokker, blokk] })
      }
    } else {
      // Ferie-pause: sett inn og forskyv etterfølgende perioder
      setPerioder(insertFeriePause(perioder, owner, selRange.fra, selRange.til))
    }
    reset()
  }

  // --- Dag-farging ---
  function dayClass(
    info: { type: string; owner: string } | undefined,
    isWeekend: boolean,
    isHelligdag: boolean,
    isSelected: boolean,
  ): string {
    if (isSelected) return 'bg-orange-400/40 text-foreground ring-1 ring-orange-400'
    if (isHelligdag) return 'bg-muted text-muted-foreground'
    if (!info) return 'bg-muted/20 text-muted-foreground/60'
    if (isWeekend) return 'bg-muted text-muted-foreground'
    if (info.type === 'ferie_pause') return 'bg-orange-500/20 text-orange-200 ring-1 ring-orange-500/40'
    if (info.owner === 'partner') return `${info.type === 'felles_far' ? 'bg-green-500' : 'bg-green-600'} text-white`
    const map: Record<string, string> = {
      mor_obligatorisk: 'bg-blue-800',
      mor_før_termin: 'bg-blue-700',
      felles_mor: 'bg-blue-600',
      mor_kvote: 'bg-blue-500',
    }
    return `${map[info.type] ?? 'bg-blue-500'} text-white`
  }

  // --- Render én måned ---
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
                  const helligdagNavn = helligdager.get(ds)
                  const isHelligdag = !!helligdagNavn && !isWeekend
                  const isTermin = ds === input.terminDato
                  const isBhg = ds === barnehageStart
                  const isSelected = !!(selRange && ds >= selRange.fra && ds <= selRange.til)
                  const isSelectable = !isWeekend && !isHelligdag

                  const tooltip = helligdagNavn
                    ? `${helligdagNavn} — foreldrepenger kan fortsette eller pauses`
                    : isSelected ? `${fmtShort(ds)} — valgt`
                    : info ? (info.owner === 'partner' ? 'Partners periode' : 'Mors/medmors periode') : ''

                  return (
                    <span
                      key={ci}
                      className={`relative aspect-square grid place-items-center text-[12.5px] font-medium rounded-lg select-none
                        ${dayClass(info, isWeekend, isHelligdag, isSelected)}
                        ${isTermin ? 'ring-2 ring-pink-500 ring-inset !text-pink-200 font-bold' : ''}
                        ${isBhg ? 'ring-2 ring-amber-500 ring-inset' : ''}
                        ${isHelligdag && !isSelected ? 'ring-1 ring-red-500/50' : ''}
                        ${isSelectable ? 'cursor-pointer' : ''}
                      `}
                      title={tooltip}
                      onMouseDown={isSelectable ? () => {
                        isDragging.current = true
                        setSelStart(ds)
                        setSelHover(ds)
                        setPanelStep('selected')
                      } : undefined}
                      onMouseEnter={isSelectable ? () => {
                        if (isDragging.current) setSelHover(ds)
                      } : undefined}
                      onMouseUp={isSelectable ? () => {
                        isDragging.current = false
                      } : undefined}
                    >
                      {cell.getDate()}
                      {isHelligdag && <span className="absolute top-[2px] right-[2px] w-1 h-1 rounded-full bg-red-500" />}
                      {ferieDaysMeg[ds] && !isHelligdag && !isSelected && (
                        <span className="absolute bottom-[3px] left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-orange-500" />
                      )}
                      {ferieDaysPartner[ds] && !isHelligdag && !isSelected && (
                        <span className="absolute bottom-[3px] left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-yellow-400" />
                      )}
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

  // --- Panel på høyre side ---
  function renderPanel() {
    if (panelStep === 'idle') {
      return (
        <div className="rounded-2xl border border-border bg-muted/10 px-5 py-5 space-y-4">
          <p className="text-sm font-semibold">Legg til ferie</p>
          <p className="text-[13px] text-muted-foreground leading-relaxed">
            Klikk og dra i kalenderen for å velge dager du ønsker å markere som ferie.
          </p>
          <div className="space-y-2 pt-1">
            <LegendRow color="bg-orange-400/40 ring-1 ring-orange-400" label="Valgte dager" />
            <LegendRow color="bg-orange-500/20 ring-1 ring-orange-500/40" label="Ferie-pause (forskyver plan)" />
            <LegendRow color="bg-blue-500" label="Mors periode" />
            <LegendRow color="bg-green-600" label="Partners periode" />
            <LegendRow color="bg-muted ring-1 ring-red-500/40" label="Helligdag" dot="bg-red-500" />
          </div>
        </div>
      )
    }

    if (panelStep === 'selected') {
      const owner = getSelectionOwner()
      return (
        <div className="rounded-2xl border border-border bg-muted/10 px-5 py-5 space-y-4">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-500/20 border border-orange-500/40 px-3 py-1 text-[13px] font-semibold text-orange-200">
              {selLabel} valgt
            </span>
            {selRange && (
              <p className="mt-2 text-[12px] text-muted-foreground">
                {fmtLong(selRange.fra)} – {fmtLong(selRange.til)}
              </p>
            )}
          </div>

          {overlappingPerioder.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[12px] font-medium text-muted-foreground">Valgte datoer inneholder:</p>
              {overlappingPerioder.map((p) => (
                <div key={p.id} className="flex items-center gap-2 text-[12.5px]">
                  <span className={`h-2 w-2 rounded-[3px] shrink-0 ${p.owner === 'partner' ? 'bg-green-600' : 'bg-blue-500'}`} />
                  <span>{p.owner === 'meg' ? 'Meg' : 'Partner'} — {PERIODE_LABEL[p.type] ?? p.type}</span>
                </div>
              ))}
            </div>
          )}

          <p className="text-[12.5px] text-muted-foreground">
            Ferien registreres for: <span className="font-semibold text-foreground">{owner === 'meg' ? 'deg' : 'partner'}</span>
          </p>

          <div className="space-y-2 pt-1">
            <button
              className="w-full rounded-xl bg-primary text-primary-foreground text-[13.5px] font-semibold py-2.5 hover:bg-primary/90 transition-colors"
              onClick={() => setPanelStep('confirm')}
            >
              Legg til som ferie
            </button>
            <button
              className="w-full rounded-xl border border-border text-[13.5px] font-medium py-2.5 text-muted-foreground hover:text-foreground transition-colors"
              onClick={reset}
            >
              Avbryt
            </button>
          </div>
        </div>
      )
    }

    // panelStep === 'confirm'
    return (
      <div className="rounded-2xl border border-border bg-muted/10 px-5 py-5 space-y-4">
        <div>
          <p className="text-sm font-semibold">Hva skal skje med resten av planen?</p>
          <p className="text-[12.5px] text-muted-foreground mt-1 leading-relaxed">
            Når du legger inn ferie, kan planen justeres på to måter.
          </p>
        </div>

        <div className="space-y-2.5">
          {[
            {
              v: true,
              label: 'Forskyv resten av planen',
              desc: 'Ferien pauses permisjonen. Resterende uker forskyves og planen forlenges tilsvarende.',
            },
            {
              v: false,
              label: 'Simultant — ingen forskyving',
              desc: 'Ferie avvikles mens foreldrepenger løper parallelt. Permisjonstiden forkortes ikke.',
            },
          ].map((o) => (
            <button
              key={String(o.v)}
              type="button"
              onClick={() => setForskyv(o.v)}
              className={`w-full text-left rounded-xl border px-4 py-3 transition-colors ${
                forskyv === o.v ? 'border-primary/60 bg-primary/10' : 'border-border bg-muted/10 hover:border-border/80'
              }`}
            >
              <span className="flex items-start gap-3">
                <span className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center ${forskyv === o.v ? 'border-primary' : 'border-border'}`}>
                  {forskyv === o.v && <span className="h-2 w-2 rounded-full bg-primary" />}
                </span>
                <span>
                  <span className="block text-[13px] font-semibold">{o.label}</span>
                  <span className="block mt-0.5 text-[12px] text-muted-foreground leading-snug">{o.desc}</span>
                </span>
              </span>
            </button>
          ))}
        </div>

        <div className="space-y-2 pt-1">
          <button
            className="w-full rounded-xl bg-primary text-primary-foreground text-[13.5px] font-semibold py-2.5 hover:bg-primary/90 transition-colors"
            onClick={applyFerie}
          >
            Bekreft
          </button>
          <button
            className="w-full rounded-xl border border-border text-[13.5px] font-medium py-2.5 text-muted-foreground hover:text-foreground transition-colors"
            onClick={reset}
          >
            Avbryt
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-6 items-start" onMouseLeave={() => { if (isDragging.current) isDragging.current = false }}>
      {/* Kalender-grid */}
      <div className="flex-1 min-w-0">
        <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>
          {months.map(renderMonth)}
        </div>
        <PlanLegend partnerErLærer={input.partnerErLærer} />
      </div>

      {/* Interaktivt panel (høyre kolonne) */}
      <div className="w-64 shrink-0 sticky top-4 self-start">
        {renderPanel()}
      </div>
    </div>
  )
}

/* Liten hjelpefunksjon for legend-rader i panel */
function LegendRow({ color, label, dot }: { color: string; label: string; dot?: string }) {
  return (
    <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
      <span className={`relative h-3 w-3 shrink-0 rounded-[3px] ${color}`}>
        {dot && <span className={`absolute top-[1px] right-[1px] w-[5px] h-[5px] rounded-full ${dot}`} />}
      </span>
      {label}
    </div>
  )
}
