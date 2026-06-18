import type { ATFEntry, ATFPeriode, ATFResult, ATFBreakdown, ATFLønnskode, ATFDatoRad, KnownATFRate, PlanningStatus } from '@/types/economy'
import {
  ATF_HELGE_TILLEGG_PER_TIME,
  ATF_TIMER_PER_DAG,
  ATF_TIMER_HELG,
  ATF_TIDSKOMPENSASJON_PER_DAG,
} from '@/config/economy.config'

// ------------------------------------------------------------
// SATSBEREGNING
// ------------------------------------------------------------

/** Beregner timelønn A-tab fra årslønn */
export function beregnTimesatsATab(aarslonn: number): number {
  return aarslonn / 1850
}

/** Beregner OT 50%-sats */
export function beregnOT50Sats(aarslonn: number): number {
  return beregnTimesatsATab(aarslonn) * 1.5
}

// ------------------------------------------------------------
// PERIODE-BEREGNING
// ------------------------------------------------------------

function beregnPeriode(
  periode: ATFPeriode,
  aarslonn: number,
  _kronetillegg: number
): ATFBreakdown {
  const timesats = beregnTimesatsATab(aarslonn)
  const kode = periode.kode

  switch (kode) {
    case 'ØV_MAN_FRE': {
      const dager = periode.antallDager ?? 0
      const sats = timesats * ATF_TIMER_PER_DAG
      return {
        kode,
        antallDager: dager,
        sats,
        belop: sats * dager,
        beskrivelse: `${dager} dag(er) hverdag (${ATF_TIMER_PER_DAG}t × ${fmt(timesats)}/t)`,
      }
    }

    case 'ØV_LØR_SØN': {
      const dager = periode.antallDager ?? 0
      const satsPerTime = timesats + ATF_HELGE_TILLEGG_PER_TIME
      const sats = satsPerTime * ATF_TIMER_HELG
      return {
        kode,
        antallDager: dager,
        sats,
        belop: sats * dager,
        beskrivelse: `${dager} dag(er) helg (${ATF_TIMER_HELG}t × (${fmt(timesats)} + ${ATF_HELGE_TILLEGG_PER_TIME} kr helgetillegg))`,
      }
    }

    case 'ØV_OT_50_MAN_FRE': {
      const timer = periode.antallTimer ?? 0
      const sats = beregnOT50Sats(aarslonn)
      return {
        kode,
        antallTimer: timer,
        sats,
        belop: sats * timer,
        beskrivelse: `${timer} timer OT 50% (${fmt(timesats)} × 1.5)`,
      }
    }

    case 'ØV_TIME_MAN_FRE': {
      const timer = periode.antallTimer ?? 0
      const sats = timesats
      return {
        kode,
        antallTimer: timer,
        sats,
        belop: sats * timer,
        beskrivelse: `${timer} timer ordinær timesats (${fmt(timesats)}/t)`,
      }
    }

    case 'VAKT': {
      const timer = periode.antallTimer ?? 0
      const sats = timesats
      return {
        kode,
        antallTimer: timer,
        sats,
        belop: sats * timer,
        beskrivelse: `${timer} timer vakt`,
      }
    }

    // FA1, FA2, PK, FØPP: dagssats = full dagsnorm
    case 'FA1':
    case 'FA2':
    case 'PK':
    case 'FØPP': {
      const dager = periode.antallDager ?? 0
      const sats = timesats * ATF_TIMER_PER_DAG
      return {
        kode,
        antallDager: dager,
        sats,
        belop: sats * dager,
        beskrivelse: `${dager} dag(er) ${kode}`,
      }
    }

    default: {
      const exhaustive: never = kode
      return {
        kode: exhaustive,
        sats: 0,
        belop: 0,
        beskrivelse: 'Ukjent kode',
      }
    }
  }
}

// ------------------------------------------------------------
// HOVED-KALKULATOR
// ------------------------------------------------------------

/**
 * Beregner ATF-utbetaling for én øvelse.
 * @param entry ATF-oppføringen
 * @param annualSalary Årslønn (grunnlønn × 12 + faste tillegg)
 * @param kronetillegg Eventuelle kronetillegg (valgfritt)
 */
export function calculateATF(
  entry: ATFEntry,
  annualSalary: number,
  kronetillegg = 0
): ATFResult {
  const timesatsATab = beregnTimesatsATab(annualSalary)

  const breakdown: ATFBreakdown[] = entry.perioder.map((p) =>
    beregnPeriode(p, annualSalary, kronetillegg)
  )

  const totalEconomy = breakdown.reduce((s, b) => s + b.belop, 0)

  // Tidskompensasjon = summen av dager × 7.5t
  const tidskompensasjonTimer = entry.perioder.reduce((s, p) => {
    if (p.antallDager) return s + p.antallDager * ATF_TIDSKOMPENSASJON_PER_DAG
    return s
  }, 0)

  return { totalEconomy, breakdown, tidskompensasjonTimer, timesatsATab }
}

/**
 * Summerer ATF-utbetalinger for ett år.
 */
export function sumATFByYear(entries: ATFEntry[], year: number): number {
  return entries
    .filter((e) => (e.payoutYear ?? e.year) === year)
    .reduce((s, e) => s + e.beregnetBeløp, 0)
}

// ------------------------------------------------------------
// HJELPERE
// ------------------------------------------------------------

function fmt(n: number): string {
  return n.toFixed(2).replace('.', ',')
}

/** Returnerer gjeldende timesats basert på årslønn */
export function getTimesatsInfo(annualSalary: number) {
  const aTab = beregnTimesatsATab(annualSalary)
  return {
    aTab,
    ot50: aTab * 1.5,
    helgDagssats: (aTab + ATF_HELGE_TILLEGG_PER_TIME) * ATF_TIMER_HELG,
    hverdagDagssats: aTab * ATF_TIMER_PER_DAG,
  }
}

export const ATF_LØNNSKODE_LABELS: Record<ATFLønnskode, string> = {
  ØV_MAN_FRE: 'Øvelse hverdag (dagssats)',
  ØV_LØR_SØN: 'Øvelse helg (dagssats + helgetillegg)',
  ØV_OT_50_MAN_FRE: 'Overtid 50% hverdag',
  ØV_TIME_MAN_FRE: 'Ordinære timer hverdag',
  VAKT: 'Vakt',
  FA1: 'FA1',
  FA2: 'FA2',
  PK: 'PK',
  FØPP: 'FØPP',
}

// ------------------------------------------------------------
// NORSK HELLIGDAG-KALKULATOR
// ------------------------------------------------------------

function getEasterDate(year: number): Date {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day)
}

export function isNorwegianHoliday(date: Date): boolean {
  const y = date.getFullYear()
  const m = date.getMonth() + 1
  const d = date.getDate()
  const mmdd = `${m}-${d}`
  if (['1-1', '5-1', '5-17', '12-25', '12-26'].includes(mmdd)) return true
  const easter = getEasterDate(y)
  for (const offset of [-3, -2, 0, 1, 39, 49, 50]) {
    const h = new Date(easter)
    h.setDate(h.getDate() + offset)
    if (h.getMonth() === date.getMonth() && h.getDate() === date.getDate()) return true
  }
  return false
}

export function getDayType(date: Date): 'hverdag' | 'helg' | 'helligdag' {
  if (isNorwegianHoliday(date)) return 'helligdag'
  const dow = date.getDay()
  return (dow === 0 || dow === 6) ? 'helg' : 'hverdag'
}

// ------------------------------------------------------------
// SKALERTE SATSER (base fra ATF-kalkulator 1/5-2023, ltr 72)
// ------------------------------------------------------------

export const ATF_BASE_ANNUAL = 720100

export const ATF_BASE_RATES = {
  ovingHverdag: 6348.16,
  ovingHelg: 9832.67,
  ovingHelligdag: 13046.66,
  ovingPrTimeHverdag: 396.76,
  ovingPrTimeHelg: 409.69,
  ovingPrTimeHelligdag: 543.61,
  ovingInntil7t50Hverdag: 486.55,
  ovingInntil7t100Hverdag: 681.18,
  ovingInntil7tHelg: 746.18,
} as const

export type ATFRates = { [K in keyof typeof ATF_BASE_RATES]: number }


/**
 * Beregner ATF-satser fra Excel-formler (ATF kalkulator 1.mai 2023, ltr 72).
 * Alle satser beregnes direkte fra ATF-lønnsgrunnlaget = grunnlønn + HTA-tillegg.
 *
 * @param annualSalary    Grunnlønn × 12
 * @param fixedAdditions  HTA-kronetillegg × 12 (1162 og tilsvarende koder) — øker ATF-grunnlaget
 * @param _knownATFRates  Ubrukt
 */
export function calculateATFRates(
  annualSalary: number,
  fixedAdditions = 0,
  _knownATFRates?: Record<string, KnownATFRate>,
): ATFRates {
  // ATF-lønnsgrunnlag = grunnlønn + HTA-kronetillegg (ATF særavtale pkt 1.3)
  const basis = annualSalary + fixedAdditions
  // A-tabell timesats og overtidssatser
  const timesats = basis / 1850
  const OT50  = timesats * 1.5
  const OT100 = timesats * 2
  const OTA50 = OT50 / 3        // = timesats * 0.5

  // Natttillegg (45% av timesats) og faste tillegg (fast kr/t uavhengig av lønn)
  const natt        = timesats * 0.45
  const ettermiddag = 25   // kr/t
  const lordag      = 65   // kr/t
  const sondag      = 65   // kr/t

  // Øving Ma-Fr døgn: 8,67t OT + 6t OT50 + ettermiddag 4t + natt 10t
  const ovingHverdag = ((OT100 * 10 + OT50 * 6) * (8.67 / 16))
                     + ((ettermiddag * 4 + natt * 10) * 2 / 16)

  // Øving Lø-Sø døgn: 11,33t OT100 + lørdag hele døgnet + søndag + natt
  const ovingHelg = ((OT100 * 24 + lordag * 24) * (11.33 / 24))
                  + ((sondag * 24 + natt * 10) * 2 / 24)

  // Timesatser = dagssats / antall timer
  const ovingPrTimeHverdag = ovingHverdag / 16
  const ovingPrTimeHelg    = ovingHelg / 24

  // Inntil 7t hverdag: 50% OT (75% OT50 + 25% OTA50)
  const ovingInntil7t50Hverdag  = (OT50 * 0.75) + (OTA50 * 0.25)
  // Inntil 7t hverdag: 100% OT (gjennomsnitt OT50 og OT100)
  const ovingInntil7t100Hverdag = (OT50 + OT100) / 2
  // Inntil 7t helg: 100% OT + lørdag-tillegg
  const ovingInntil7tHelg = (OT50 + OT100) / 2 + lordag

  // Helligdag: skaler fra base-sats (formler ikke tilgjengelig fra Excel)
  const scale = basis / ATF_BASE_ANNUAL
  const ovingHelligdag       = ATF_BASE_RATES.ovingHelligdag * scale
  const ovingPrTimeHelligdag = ATF_BASE_RATES.ovingPrTimeHelligdag * scale

  return {
    ovingHverdag:           r2(ovingHverdag),
    ovingHelg:              r2(ovingHelg),
    ovingHelligdag:         r2(ovingHelligdag),
    ovingPrTimeHverdag:     r2(ovingPrTimeHverdag),
    ovingPrTimeHelg:        r2(ovingPrTimeHelg),
    ovingPrTimeHelligdag:   r2(ovingPrTimeHelligdag),
    ovingInntil7t50Hverdag: r2(ovingInntil7t50Hverdag),
    ovingInntil7t100Hverdag:r2(ovingInntil7t100Hverdag),
    ovingInntil7tHelg:      r2(ovingInntil7tHelg),
  }
}

/**
 * Returnerer en lesbar kilde-label for ATF-satsene.
 * Vises i UI under sats-kortet.
 */
export function getATFRatesSourceLabel(_knownATFRates?: Record<string, KnownATFRate>): string {
  return 'Satser beregnet fra grunnlønn + HTA-tillegg (ATF-kalkulator 1. mai 2023)'
}

// ------------------------------------------------------------
// DATOBASERT ATF-BEREGNING
// ------------------------------------------------------------

// Normal working hours in minutes from midnight
const ARBEIDSSTART_MIN = 7 * 60 + 30   // 07:30
const ARBEIDSSLUTT_MIN = 15 * 60 + 30  // 15:30

function startOfDay(d: Date): Date {
  const r = new Date(d); r.setHours(0, 0, 0, 0); return r
}

// Use local date components to avoid UTC offset issues (Norway UTC+1/+2)
function dateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function minsInDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes()
}

function r1(n: number): number { return Math.round(n * 10) / 10 }
function r2(n: number): number { return Math.round(n * 100) / 100 }

export function beregnATFFromDates(
  fra: Date,
  til: Date,
  annualSalary: number,
  fixedAdditions = 0,
  type: 'døgn' | 'time' = 'døgn',
  knownATFRates?: Record<string, KnownATFRate>,
): ATFDatoRad[] {
  const rows: ATFDatoRad[] = []
  const rates = calculateATFRates(annualSalary, fixedAdditions, knownATFRates)
  const fraDay = startOfDay(fra)
  const tilDay = startOfDay(til)
  const fraMin = minsInDay(fra)
  const tilMin = minsInDay(til)

  // --- Øving pr time (simple hourly mode) ---
  if (type === 'time') {
    const cur = new Date(fraDay)
    while (cur.getTime() <= tilDay.getTime()) {
      const isFirst = cur.getTime() === fraDay.getTime()
      const isLast = cur.getTime() === tilDay.getTime()
      const dayType = getDayType(cur)
      let hours: number
      if (isFirst && isLast) hours = (tilMin - fraMin) / 60
      else if (isFirst) hours = Math.min((24 * 60 - fraMin) / 60, 7)
      else if (isLast) hours = Math.min(tilMin / 60, 7)
      else hours = 7
      hours = Math.min(hours, 7)
      if (hours > 0.01) {
        const [artskode, beskrivelse, sats] =
          dayType === 'helligdag'
            ? ['2238', 'Øvelse pr t helligdag', rates.ovingPrTimeHelligdag]
            : dayType === 'helg'
            ? ['2243', 'Øvelse pr t (inntil 7t) Lø-Sø', rates.ovingInntil7tHelg]
            : ['2242', 'Øvelse inntil 7t 50% Ma-Fr', rates.ovingInntil7t50Hverdag]
        rows.push({ dato: dateStr(cur), dagType: dayType, artskode, beskrivelse, antall: r1(hours), enhet: 'timer', sats, belop: r2(sats * hours) })
      }
      cur.setDate(cur.getDate() + 1)
    }
    return rows
  }

  // --- Øving døgn ---

  // Same day (short exercise): just a few hours after work
  if (fraDay.getTime() === tilDay.getTime()) {
    const dayType = getDayType(fraDay)
    const startMin = dayType === 'hverdag' ? Math.max(fraMin, ARBEIDSSLUTT_MIN) : fraMin
    const hours = (tilMin - startMin) / 60
    if (hours > 0.01) {
      const [artskode, beskrivelse, sats] =
        dayType === 'helligdag'
          ? ['2238', 'Øvelse pr t helligdag', rates.ovingPrTimeHelligdag]
          : dayType === 'helg'
          ? ['2237', 'Øvelse pr t Lø-Sø', rates.ovingPrTimeHelg]
          : ['2236', 'Øvelse pr t Ma-Fr', rates.ovingPrTimeHverdag]
      rows.push({ dato: dateStr(fraDay), dagType: dayType, artskode, beskrivelse, antall: r1(hours), enhet: 'timer', sats, belop: r2(sats * hours) })
    }
    return rows
  }

  // Start day
  const startDayType = getDayType(fraDay)
  const startMin = startDayType === 'hverdag' ? Math.max(fraMin, ARBEIDSSLUTT_MIN) : fraMin
  const startHours = (24 * 60 - startMin) / 60

  if (startDayType === 'hverdag') {
    const first7 = Math.min(startHours, 7)
    const rest = startHours - first7
    if (first7 > 0.01)
      rows.push({ dato: dateStr(fraDay), dagType: 'hverdag', artskode: '2242', beskrivelse: 'Øvelse inntil 7t 50% Ma-Fr', antall: r1(first7), enhet: 'timer', sats: rates.ovingInntil7t50Hverdag, belop: r2(rates.ovingInntil7t50Hverdag * first7) })
    if (rest > 0.01)
      rows.push({ dato: dateStr(fraDay), dagType: 'hverdag', artskode: '2236', beskrivelse: 'Øvelse pr t Ma-Fr', antall: r1(rest), enhet: 'timer', sats: rates.ovingPrTimeHverdag, belop: r2(rates.ovingPrTimeHverdag * rest) })
  } else if (startDayType === 'helg') {
    const first7 = Math.min(startHours, 7)
    const rest = startHours - first7
    if (first7 > 0.01)
      rows.push({ dato: dateStr(fraDay), dagType: 'helg', artskode: '2243', beskrivelse: 'Øvelse pr t (inntil 7t) Lø-Sø', antall: r1(first7), enhet: 'timer', sats: rates.ovingInntil7tHelg, belop: r2(rates.ovingInntil7tHelg * first7) })
    if (rest > 0.01)
      rows.push({ dato: dateStr(fraDay), dagType: 'helg', artskode: '2237', beskrivelse: 'Øvelse pr t Lø-Sø', antall: r1(rest), enhet: 'timer', sats: rates.ovingPrTimeHelg, belop: r2(rates.ovingPrTimeHelg * rest) })
  } else {
    rows.push({ dato: dateStr(fraDay), dagType: 'helligdag', artskode: '2238', beskrivelse: 'Øvelse pr t helligdag', antall: r1(startHours), enhet: 'timer', sats: rates.ovingPrTimeHelligdag, belop: r2(rates.ovingPrTimeHelligdag * startHours) })
  }

  // Middle days (full døgn)
  const cur = new Date(fraDay)
  cur.setDate(cur.getDate() + 1)
  while (cur.getTime() < tilDay.getTime()) {
    const dayType = getDayType(cur)
    const [artskode, beskrivelse, sats] =
      dayType === 'helligdag'
        ? ['2233', 'Øvelse døgn helligdag', rates.ovingHelligdag]
        : dayType === 'helg'
        ? ['2232', 'Øvelse døgn Lø-Sø', rates.ovingHelg]
        : ['2230', 'Øvelse døgn Ma-Fr', rates.ovingHverdag]
    rows.push({ dato: dateStr(cur), dagType: dayType, artskode, beskrivelse, antall: 1, enhet: 'døgn', sats, belop: r2(sats) })
    cur.setDate(cur.getDate() + 1)
  }

  // End day: timer fra 00:00 til min(tilTid, 07:30)
  // Timer etter arbeidsstart (07:30) regnes som normal arbeidstid og teller ikke.
  const endHours = Math.min(tilMin, ARBEIDSSTART_MIN) / 60
  if (endHours > 0.01) {
    const endDayType = getDayType(tilDay)
    const [artskode, beskrivelse, sats] =
      endDayType === 'helligdag'
        ? ['2238', 'Øvelse pr t helligdag', rates.ovingPrTimeHelligdag]
        : endDayType === 'helg'
        ? ['2237', 'Øvelse pr t Lø-Sø', rates.ovingPrTimeHelg]
        : ['2236', 'Øvelse pr t Ma-Fr', rates.ovingPrTimeHverdag]
    rows.push({ dato: dateStr(tilDay), dagType: endDayType, artskode, beskrivelse, antall: r1(endHours), enhet: 'timer', sats, belop: r2(sats * endHours) })
  }

  return rows
}

export function sumATFDatoRader(rows: ATFDatoRad[]): number {
  return Math.round(rows.reduce((s, r) => s + r.belop, 0) * 100) / 100
}

// Tidskompensasjon: full days × 7.5h
export function beregnTidskompensasjonFromRows(rows: ATFDatoRad[]): number {
  return rows.filter(r => r.enhet === 'døgn').length * ATF_TIDSKOMPENSASJON_PER_DAG
}

// ------------------------------------------------------------
// IKKE-PLANLAGT AKTIVITET (ATF pkt 5.2.1)
// ------------------------------------------------------------

/**
 * Brukes på rader fra beregnATFFromDates for ikke-planlagt DØGNBASERT aktivitet.
 * Første kalenderdag (alle rader med same dato som rows[0]) får 50 % forhøyet
 * økonomisk kompensasjon. Avspas/tidskompensasjon er uendret.
 *
 * ATF pkt 5.2.1: "for det første døgnet av aktiviteten forhøyes den
 * økonomiske kompensasjonen med 50 %."
 */
export function applyFørsteDøgnTillegg(rows: ATFDatoRad[]): ATFDatoRad[] {
  if (rows.length === 0) return rows
  const firstDate = rows[0].dato
  return rows.map(row => {
    if (row.dato !== firstDate) return row
    const newSats = r2(row.sats * 1.5)
    const newBelop = r2(row.belop * 1.5)
    return {
      ...row,
      sats: newSats,
      belop: newBelop,
      beskrivelse: row.beskrivelse + ' (+50 % ikke-planlagt)',
      isFirstDayBonus: true,
    }
  })
}

/**
 * Beregner HTA-overtid (OT 100 %) for ikke-planlagt timebasert aktivitet.
 * Brukes i stedet for ATF-timesatser når aktiviteten ikke fremgår av arbeidsplanen.
 * ATF pkt 5.2.1: ikke-planlagt, ikke-døgnbasert → beregn som overtid etter HTA.
 */
export function beregnHTAOvertidFromDates(
  fra: Date,
  til: Date,
  annualSalary: number,
): ATFDatoRad[] {
  const rows: ATFDatoRad[] = []
  const timesats = annualSalary / 1850
  const ot100 = timesats * 2.0
  const fraDay = startOfDay(fra)
  const tilDay = startOfDay(til)
  const fraMin = minsInDay(fra)
  const tilMin = minsInDay(til)

  const cur = new Date(fraDay)
  while (cur.getTime() <= tilDay.getTime()) {
    const isFirst = cur.getTime() === fraDay.getTime()
    const isLast = cur.getTime() === tilDay.getTime()
    let hours: number
    if (isFirst && isLast) hours = (tilMin - fraMin) / 60
    else if (isFirst) hours = (24 * 60 - fraMin) / 60
    else if (isLast) hours = tilMin / 60
    else hours = 7
    hours = Math.max(0, Math.min(hours, 24))
    if (hours > 0.01) {
      const dayType = getDayType(cur)
      rows.push({
        dato: dateStr(cur),
        dagType: dayType,
        artskode: 'HTA-OT',
        beskrivelse: `HTA-overtid (OT 100 %) ${dayType}`,
        antall: r1(hours),
        enhet: 'timer',
        sats: r2(ot100),
        belop: r2(ot100 * hours),
      })
    }
    cur.setDate(cur.getDate() + 1)
  }
  return rows
}

export type AppliedATFRule =
  | 'planned_atf'
  | 'unplanned_daily_atf_first50'
  | 'unplanned_hourly_hta_ot'

/**
 * Hoved-inngang for datobasert ATF-beregning med planleggingsstatus.
 * Delegerer til beregnATFFromDates for planlagte aktiviteter,
 * og til spesialiserte funksjoner for ikke-planlagte.
 */
export function beregnATFMedPlanstatus(
  fra: Date,
  til: Date,
  annualSalary: number,
  fixedAdditions = 0,
  type: 'døgn' | 'time' = 'døgn',
  knownATFRates?: Record<string, KnownATFRate>,
  planningStatus: PlanningStatus = 'planned',
): { rows: ATFDatoRad[]; appliedRule: AppliedATFRule } {
  // Ikke-planlagt + timebasert → HTA-overtid
  if (planningStatus === 'unplanned' && type === 'time') {
    return {
      rows: beregnHTAOvertidFromDates(fra, til, annualSalary),
      appliedRule: 'unplanned_hourly_hta_ot',
    }
  }

  // Ikke-planlagt + døgnbasert → ATF med 50 % bonus første døgn
  if (planningStatus === 'unplanned' && type === 'døgn') {
    const baseRows = beregnATFFromDates(fra, til, annualSalary, fixedAdditions, type, knownATFRates)
    return {
      rows: applyFørsteDøgnTillegg(baseRows),
      appliedRule: 'unplanned_daily_atf_first50',
    }
  }

  // Planlagt → normal ATF
  return {
    rows: beregnATFFromDates(fra, til, annualSalary, fixedAdditions, type, knownATFRates),
    appliedRule: 'planned_atf',
  }
}
