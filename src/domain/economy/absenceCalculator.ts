import type { AbsenceRecord, AbsenceEvent, AbsenceStatus, AbsenceEligibility } from '@/types/economy'
import {
  EGENMELDING_KVOTE,
  ABSENCE_WARNING_THRESHOLD,
  ABSENCE_CRITICAL_THRESHOLD,
} from '@/config/economy.config'

// ============================================================
// DATO-HJELPERE
// ============================================================

function dateToKey(d: Date): number {
  return Math.floor(d.getTime() / 86400000)
}

function keyToDate(k: number): Date {
  return new Date(k * 86400000)
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86400000)
}

function sameDayMMDD(a: Date, b: Date): boolean {
  return a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() === b.getUTCDate()
}

function formatISO(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatNO(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${d.getUTCFullYear()}`
}

// ============================================================
// NORSKE HELLIGDAGER (Gauss-algoritme for påske)
// ============================================================

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
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(Date.UTC(year, month - 1, day))
}

export function isNorwegianPublicHoliday(d: Date): boolean {
  const year = d.getUTCFullYear()
  const easter = easterSunday(year)
  const m = d.getUTCMonth() + 1
  const day = d.getUTCDate()

  if (m === 1 && day === 1) return true   // Nyttårsdag
  if (m === 5 && day === 1) return true   // Arbeidernes dag
  if (m === 5 && day === 17) return true  // Grunnlovsdag
  if (m === 12 && day === 25) return true // 1. juledag
  if (m === 12 && day === 26) return true // 2. juledag

  if (sameDayMMDD(d, addDays(easter, -3))) return true  // Skjærtorsdag
  if (sameDayMMDD(d, addDays(easter, -2))) return true  // Langfredag
  if (sameDayMMDD(d, addDays(easter, 1))) return true   // 2. påskedag
  if (sameDayMMDD(d, addDays(easter, 39))) return true  // Kristi himmelfartsdag
  if (sameDayMMDD(d, addDays(easter, 50))) return true  // 2. pinsedag

  return false
}

export function isNonWorkday(d: Date): boolean {
  const utcDate = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const dow = utcDate.getUTCDay() // 0=Sun, 6=Sat
  return dow === 0 || dow === 6 || isNorwegianPublicHoliday(utcDate)
}

// ============================================================
// DAGLIG BITMASK-KART
// Bitmask: 1 = egenmelding, 2 = sykemelding
// ============================================================

function buildDailyMap(events: AbsenceEvent[]): Map<number, number> {
  const daily = new Map<number, number>()
  for (const ev of events) {
    const start = new Date(ev.startDate + 'T00:00:00Z')
    const end = new Date(ev.endDate + 'T00:00:00Z')
    const mask = ev.type === 'egenmelding' ? 1 : 2
    const endKey = dateToKey(end)
    let d = new Date(start)
    while (dateToKey(d) <= endKey) {
      const k = dateToKey(d)
      daily.set(k, (daily.get(k) ?? 0) | mask)
      d = addDays(d, 1)
    }
  }
  return daily
}

/**
 * Brubyggingsregel: hvis to egenmeldingsdager kun er adskilt av helger/helligdager,
 * regnes de som sammenhengende (hullene merkes som egenmelding).
 */
function applyBridging(daily: Map<number, number>): void {
  const egenKeys = [...daily.entries()]
    .filter(([, v]) => (v & 1) === 1)
    .map(([k]) => k)
    .sort((a, b) => a - b)

  if (egenKeys.length < 2) return

  for (let i = 0; i < egenKeys.length - 1; i++) {
    const d1 = egenKeys[i]
    const d2 = egenKeys[i + 1]
    if (d2 <= d1 + 1) continue

    let allNonWorkdays = true
    for (let d = d1 + 1; d < d2; d++) {
      if (!isNonWorkday(keyToDate(d))) { allNonWorkdays = false; break }
    }
    if (allNonWorkdays) {
      for (let d = d1 + 1; d < d2; d++) {
        daily.set(d, (daily.get(d) ?? 0) | 1)
      }
    }
  }
}

function countEgenInRange(daily: Map<number, number>, startKey: number, endKey: number): number {
  let count = 0
  for (const [k, v] of daily) {
    if (k >= startKey && k <= endKey && (v & 1) === 1) count++
  }
  return count
}

// ============================================================
// PERIODEBYGGING (for arbeidsgiverperiode)
// Sammenhengende fravær eller fravær med ≤15 dagers gap
// slås sammen til én periode.
// ============================================================

interface AbsencePeriod {
  start: number
  end: number
  sickDays: number
}

function buildMergedPeriods(daily: Map<number, number>): AbsencePeriod[] {
  const allKeys = [...daily.keys()].sort((a, b) => a - b)
  if (allKeys.length === 0) return []

  // Bygg sammenhengende segmenter
  const segs: Array<{ start: number; end: number }> = []
  let s = allKeys[0]
  let prev = allKeys[0]
  for (let i = 1; i < allKeys.length; i++) {
    const cur = allKeys[i]
    if (cur === prev + 1) { prev = cur }
    else { segs.push({ start: s, end: prev }); s = cur; prev = cur }
  }
  segs.push({ start: s, end: prev })

  const countSick = (from: number, to: number): number => {
    let c = 0
    for (let d = from; d <= to; d++) {
      if (((daily.get(d) ?? 0) & 2) === 2) c++
    }
    return c
  }

  // Slå sammen segmenter med gap ≤15
  const periods: AbsencePeriod[] = []
  let cur: AbsencePeriod = { start: segs[0].start, end: segs[0].end, sickDays: countSick(segs[0].start, segs[0].end) }

  for (let i = 1; i < segs.length; i++) {
    const gap = segs[i].start - cur.end - 1
    if (gap <= 15) {
      cur.end = segs[i].end
      cur.sickDays += countSick(segs[i].start, segs[i].end)
    } else {
      periods.push(cur)
      cur = { start: segs[i].start, end: segs[i].end, sickDays: countSick(segs[i].start, segs[i].end) }
    }
  }
  periods.push(cur)
  return periods
}

// ============================================================
// LÅSEBEREGNINGER (portert fra VBA)
// ============================================================

/**
 * 8-klyngelås: hvis 8+ egenmeldingsdager der mellomrom mellom
 * tilstøtende dager er ≤15, er siste dag klyngeslutt.
 * Lås = klyngeslutt + 17 dager.
 */
function compute8ClusterLock(egenKeys: number[]): Date | null {
  if (egenKeys.length < 2) return null
  const sorted = [...egenKeys].sort((a, b) => a - b)

  let best: Date | null = null
  let clusterCount = 1
  let clusterEnd = sorted[0]
  let prev = sorted[0]

  const tryUpdate = (end: number) => {
    const candidate = addDays(keyToDate(end), 17)
    best = best ? (candidate > best ? candidate : best) : candidate
  }

  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i]
    if (cur - prev <= 15) {
      clusterCount++
      clusterEnd = cur
    } else {
      if (clusterCount >= 8) tryUpdate(clusterEnd)
      clusterCount = 1
      clusterEnd = cur
    }
    prev = cur
  }
  if (clusterCount >= 8) tryUpdate(clusterEnd)
  return best
}

/**
 * 24-dagerslås: hvis 24+ egenmeldingsdager brukt de siste 12 månedene,
 * returneres dato da den eldste dagen i vinduet faller ut + 1 dag.
 */
function compute24DayLimitLock(egenKeys: number[], checkDate: Date): Date | null {
  if (egenKeys.length === 0) return null
  const cutoffDate = new Date(Date.UTC(checkDate.getUTCFullYear(), checkDate.getUTCMonth() - 12, checkDate.getUTCDate()))
  const cutoffKey = dateToKey(cutoffDate)
  const checkKey = dateToKey(checkDate)

  const inWindow = egenKeys.filter(k => k >= cutoffKey && k <= checkKey).sort((a, b) => a - b)
  if (inWindow.length < 24) return null

  const oldest = keyToDate(inWindow[0])
  const lock = new Date(Date.UTC(oldest.getUTCFullYear(), oldest.getUTCMonth() + 12, oldest.getUTCDate() + 1))
  return lock
}

/** Arbeidsgiverperiodelås: ≥16 sykedager i siste periode → lås til periodelutt + 17 */
function computeEmployerLock(lastPeriod: AbsencePeriod | null): Date | null {
  if (!lastPeriod) return null
  if (lastPeriod.sickDays >= 16) return addDays(keyToDate(lastPeriod.end), 17)
  return null
}

// ============================================================
// OFFENTLIG API
// ============================================================

/**
 * Beregner egenmeldingsdager brukt siste 12 måneder fra AbsenceEvent[].
 * Inkluderer brubyggingsregel.
 */
export function getDaysUsedFromEvents(events: AbsenceEvent[], referenceDate: Date = new Date()): number {
  if (events.length === 0) return 0
  const daily = buildDailyMap(events)
  applyBridging(daily)
  const cutoffDate = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth() - 12, referenceDate.getUTCDate()))
  return countEgenInRange(daily, dateToKey(cutoffDate), dateToKey(referenceDate))
}

/**
 * Beholder gammel signatur for bakoverkompatibilitet (brukes i EconomyDashboard).
 */
export function getDaysUsedLast12Months(
  records: AbsenceRecord[],
  referenceDate: Date = new Date()
): number {
  const cutoff = new Date(referenceDate)
  cutoff.setMonth(cutoff.getMonth() - 12)
  return records
    .filter((r) => { const d = new Date(r.period); return d > cutoff && d <= referenceDate })
    .reduce((s, r) => s + r.selfCertDays, 0)
}

export function getAbsenceStatus(
  records: AbsenceRecord[],
  referenceDate: Date = new Date(),
  kvote: number = EGENMELDING_KVOTE,
): AbsenceStatus {
  return daysToStatus(getDaysUsedLast12Months(records, referenceDate), kvote)
}

export function getAbsenceStatusFromEvents(
  events: AbsenceEvent[],
  referenceDate: Date = new Date(),
  kvote: number = EGENMELDING_KVOTE,
): AbsenceStatus {
  return daysToStatus(getDaysUsedFromEvents(events, referenceDate), kvote)
}

export function forecastAbsenceStatus(records: AbsenceRecord[], toDate: Date): AbsenceStatus {
  return getAbsenceStatus(records, toDate)
}

export function getRemainingQuota(
  records: AbsenceRecord[],
  referenceDate: Date = new Date(),
  kvote: number = EGENMELDING_KVOTE,
): number {
  return Math.max(0, kvote - getDaysUsedLast12Months(records, referenceDate))
}

export function getRemainingQuotaFromEvents(
  events: AbsenceEvent[],
  referenceDate: Date = new Date(),
  kvote: number = EGENMELDING_KVOTE,
): number {
  return Math.max(0, kvote - getDaysUsedFromEvents(events, referenceDate))
}

function daysToStatus(days: number, kvote: number = EGENMELDING_KVOTE): AbsenceStatus {
  if (days >= kvote + 1) return 'over'
  if (days >= ABSENCE_CRITICAL_THRESHOLD) return 'critical'
  if (days >= ABSENCE_WARNING_THRESHOLD) return 'warning'
  return 'ok'
}

export function getStatusColor(status: AbsenceStatus): string {
  switch (status) {
    case 'ok':       return 'text-green-500'
    case 'warning':  return 'text-yellow-500'
    case 'critical': return 'text-red-400'
    case 'over':     return 'text-red-600'
  }
}

export function getStatusLabel(status: AbsenceStatus): string {
  switch (status) {
    case 'ok':       return 'OK'
    case 'warning':  return 'Advarsel'
    case 'critical': return 'Kritisk'
    case 'over':     return 'Overskredet'
  }
}

/**
 * Hovedfunksjon: vurderer om egenmelding kan brukes på checkDate.
 * Portert fra VBA-funksjonen EvaluateEligibility.
 *
 * @param isSickNow    Brukeren er (delvis) sykemeldt på sjekkdatoen
 * @param hasAAP       Brukeren er delvis i jobb med AAP/ufør
 */
export function evaluateEligibility(
  events: AbsenceEvent[],
  checkDate: Date,
  hireDate: Date | null,
  isSickNow = false,
  hasAAP = false,
): AbsenceEligibility {
  const utcCheck = new Date(Date.UTC(checkDate.getUTCFullYear(), checkDate.getUTCMonth(), checkDate.getUTCDate()))
  const checkKey = dateToKey(utcCheck)

  const daily = buildDailyMap(events)
  applyBridging(daily)

  // KPI-er
  const cutoff12m = new Date(Date.UTC(utcCheck.getUTCFullYear(), utcCheck.getUTCMonth() - 12, utcCheck.getUTCDate()))
  const cutoff16d = addDays(utcCheck, -15)
  const kpiEgen12m = countEgenInRange(daily, dateToKey(cutoff12m), checkKey)
  const kpiEgen16d = countEgenInRange(daily, dateToKey(cutoff16d), checkKey)

  // Perioder og arbeidsgiverperiode
  const periods = buildMergedPeriods(daily)
  const lastPeriod = periods.length > 0 ? periods[periods.length - 1] : null
  const lastPeriodSickDays = lastPeriod?.sickDays ?? 0
  let employerLeft = 16
  if (lastPeriod) {
    const daysSinceLast = checkKey - lastPeriod.end
    if (daysSinceLast <= 16) employerLeft = Math.max(0, 16 - lastPeriod.sickDays)
  }

  // AAP/ufør – egenmelding ikke mulig
  if (hasAAP) {
    return {
      canUse: false,
      earliest: null,
      explain: 'Du er delvis i jobb med AAP/ufør. Egenmelding kan ikke benyttes – fravær må dokumenteres med sykmelding.',
      kpiEgen12m, kpiEgen16d, lastPeriodSickDays, employerLeft,
    }
  }

  // Delvis sykemeldt nå – må tilbake 100% og ha 16 dager frisk
  if (isSickNow) {
    const earliest = addDays(utcCheck, 16)
    return {
      canUse: false,
      earliest: formatISO(earliest),
      explain: `Du er sykemeldt på sjekkdatoen. Egenmelding kan først brukes etter at du er 100% tilbake i jobb og har hatt 16 sammenhengende kalenderdager uten fravær. Tidligste mulige dato (regnet fra i dag): ${formatNO(earliest)}.`,
      kpiEgen12m, kpiEgen16d, lastPeriodSickDays, employerLeft,
    }
  }

  // Sjekk: er checkDate allerede innenfor registrert fravær?
  if (daily.has(checkKey)) {
    return {
      canUse: false,
      earliest: formatISO(addDays(utcCheck, 1)),
      explain: 'Datoen du sjekker mot er allerede innenfor registrert fravær i loggen.',
      kpiEgen12m, kpiEgen16d, lastPeriodSickDays, employerLeft,
    }
  }

  // 2-månederskrav
  if (!hireDate) {
    return {
      canUse: false,
      earliest: null,
      explain: 'Tilsettingsdato mangler. Legg inn tilsettingsdato for å vurdere 2-månederskravet.',
      kpiEgen12m, kpiEgen16d, lastPeriodSickDays, employerLeft,
    }
  }

  const utcHire = new Date(Date.UTC(hireDate.getUTCFullYear(), hireDate.getUTCMonth(), hireDate.getUTCDate()))
  const twoMonths = new Date(Date.UTC(utcHire.getUTCFullYear(), utcHire.getUTCMonth() + 2, utcHire.getUTCDate()))
  if (utcCheck < twoMonths) {
    return {
      canUse: false,
      earliest: formatISO(twoMonths),
      explain: 'Du må ha vært i arbeid i 2 måneder før du kan bruke egenmelding.',
      kpiEgen12m, kpiEgen16d, lastPeriodSickDays, employerLeft,
    }
  }

  // Låseberegninger
  const egenKeys = [...daily.entries()].filter(([, v]) => (v & 1) === 1).map(([k]) => k)
  const locks: { date: Date; reason: string }[] = []

  const lock24 = compute24DayLimitLock(egenKeys, utcCheck)
  if (lock24 && utcCheck < lock24) {
    locks.push({ date: lock24, reason: 'Du har nådd grensen på 24 egenmeldingsdager de siste 12 månedene.' })
  }

  const lock8 = compute8ClusterLock(egenKeys)
  if (lock8 && utcCheck < lock8) {
    locks.push({ date: lock8, reason: 'Du har brukt 8 egenmeldingsdager med ≤15 dagers mellomrom. Du må ha 16 kalenderdager friskmelding.' })
  }

  const lockEmp = computeEmployerLock(lastPeriod)
  if (lockEmp && utcCheck < lockEmp) {
    locks.push({ date: lockEmp, reason: 'Arbeidsgiverperioden (16 sykedager) er brukt opp i siste fraværsperiode. Du må ha 16 kalenderdager friskmelding.' })
  }

  if (locks.length === 0) {
    let extra = ''
    if (employerLeft > 0 && employerLeft < 16) extra = ` Du har ${employerLeft} dag(er) igjen i arbeidsgiverperioden.`
    return {
      canUse: true,
      earliest: formatISO(utcCheck),
      explain: 'Ja – egenmelding kan brukes på valgt dato.' + extra,
      kpiEgen12m, kpiEgen16d, lastPeriodSickDays, employerLeft,
    }
  }

  const earliest = locks.reduce((max, l) => l.date > max.date ? l : max).date
  return {
    canUse: false,
    earliest: formatISO(earliest),
    explain: locks.map(l => l.reason).join(' ') + ` Tidligste mulige dato: ${formatNO(earliest)}.`,
    kpiEgen12m, kpiEgen16d, lastPeriodSickDays, employerLeft,
  }
}
