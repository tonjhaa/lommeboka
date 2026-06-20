// ============================================================
// TREFFSIKKERHET / KALIBRERING — rene funksjoner
// Kalibrerer profilens trekk-/lønnsverdier via trimmet glidende snitt.
// ============================================================

import type {
  MonthRecord, ParsetLonnsslipp,
  CalibrationSettings, CalibrationResult, CalibrationEntry,
  CalibratedValues, CalibrationKey, EmploymentProfile,
  AccuracyReport,
} from '@/types/economy'

/** Siste n importerte slipper, ekskl. juni/desember og slipper med ferietrekk. */
export function selectNormalSlips(monthHistory: MonthRecord[], n: number): ParsetLonnsslipp[] {
  return monthHistory
    .filter((m) => m.source === 'imported_slip' && m.slipData && (m.slipData.maanedslonn ?? 0) > 0)
    .filter((m) => m.month !== 6 && m.month !== 12 && (m.slipData!.ferietrekk ?? 0) === 0)
    .sort((a, b) => (b.year !== a.year ? b.year - a.year : b.month - a.month))
    .slice(0, n)
    .map((m) => m.slipData!)
}

/** Snitt; dropper høyeste+laveste når n≥4 (blip-demping); verdien selv for n=1; 0 for tom. */
export function trimmedMean(values: number[]): number {
  if (values.length === 0) return 0
  if (values.length === 1) return values[0]
  let arr = values
  if (values.length >= 4) {
    const sorted = [...values].sort((a, b) => a - b)
    arr = sorted.slice(1, sorted.length - 1)
  }
  return Math.round(arr.reduce((s, v) => s + v, 0) / arr.length)
}

const LABELS: Record<string, string> = {
  skattetrekk: 'Skattetrekk',
  tabelltrekkProsent: 'Tabelltrekk-prosent',
  baseMonthly: 'Grunnlønn',
  extraTaxWithholding: 'Ekstra forskuddstrekk',
  housingDeduction: 'Husleietrekk',
  unionFee: 'Fagforeningskontingent',
}

const today = (): string => new Date().toISOString().split('T')[0]

/**
 * Kalibrerte verdier for profilen. enabled → trimmet snitt over normale slipper;
 * disabled → nyeste slipps verdi (= dagens siste-verdi-oppførsel). locked-nøkler
 * beholder current. Tom slipp-liste → current-verdier, ingen entries.
 */
export function calibrateProfile(
  monthHistory: MonthRecord[],
  current: EmploymentProfile,
  settings: CalibrationSettings,
  lockedKeys: string[],
): CalibrationResult {
  const slips = selectNormalSlips(monthHistory, settings.enabled ? settings.horizonSlips : 1)
  const locked = new Set(lockedKeys)
  const entries: CalibrationEntry[] = []

  // Hjelper: kalibrer én skalar nøkkel fra en verdivelger.
  function scalar(key: CalibrationKey, pick: (s: ParsetLonnsslipp) => number, prev: number): number {
    if (locked.has(key)) {
      entries.push({ key, label: LABELS[key] ?? key, previous: prev, calibrated: prev, sampleCount: 0, asOf: today(), locked: true })
      return prev
    }
    const values = slips.map(pick).filter((v) => v > 0)
    if (values.length === 0) return prev
    const calibrated = settings.enabled ? trimmedMean(values) : values[0]
    // Logg kun reelle endringer — unngår «18000 → 18000»-støy i kalibreringsloggen.
    if (calibrated !== prev) {
      entries.push({ key, label: LABELS[key] ?? key, previous: prev, calibrated, sampleCount: values.length, asOf: today(), locked: false })
    }
    return calibrated
  }

  const baseMonthly = scalar('baseMonthly', (s) => s.maanedslonn, current.baseMonthly)
  const skattetrekk = scalar('skattetrekk', (s) => s.skattetrekk, current.lastKnownTaxWithholding)
  const extraTaxWithholding = scalar('extraTaxWithholding', (s) => s.ekstraTrekk, current.extraTaxWithholding)
  const housingDeduction = scalar('housingDeduction', (s) => s.husleietrekk, current.housingDeduction)
  const unionFee = scalar('unionFee', (s) => s.fagforeningskontingent, current.unionFee)

  // Tabelltrekk-prosent: kun slipper med gyldig grunnlag/beløp.
  const pctValues = slips
    .filter((s) => s.tabelltrekkGrunnlag > 0 && s.tabelltrekkBelop > 0)
    .map((s) => (s.tabelltrekkBelop / s.tabelltrekkGrunnlag) * 100)
  let tabelltrekkProsent: number | null = current.lastKnownTableTaxPercent ?? null
  if (!locked.has('tabelltrekkProsent') && pctValues.length > 0) {
    tabelltrekkProsent = Math.round((settings.enabled ? trimmedMean(pctValues) : pctValues[0]) * 100) / 100
  }

  // ATF-satser: snitt av sats per artskode.
  const atfRates: Record<string, number> = {}
  const byKode = new Map<string, number[]>()
  for (const s of slips) {
    for (const [kode, sats] of Object.entries(s.atfRater ?? {})) {
      if (!byKode.has(kode)) byKode.set(kode, [])
      byKode.get(kode)!.push(sats)
    }
  }
  for (const [kode, satser] of byKode) {
    atfRates[kode] = settings.enabled ? trimmedMean(satser) : satser[0]
  }

  const values: CalibratedValues = {
    baseMonthly, skattetrekk, extraTaxWithholding, housingDeduction, unionFee,
    tabelltrekkProsent, atfRates,
  }
  return { values, entries }
}

/** Toleranse for «treff» (innenfor ±5 %). */
export const HIT_TOLERANCE_PCT = 5

interface AccuracyRowInput {
  id: string
  label: string
  cells: { budget: number; actual: number | null }[]
}

/** Måler hvor godt budsjettet traff faktiske tall (kun celler med actual ≠ null). */
export function computeAccuracy(rows: AccuracyRowInput[]): AccuracyReport {
  const monthsWithData = new Set<number>()
  const out: AccuracyReport['rows'] = []
  let hits = 0
  let total = 0

  for (const row of rows) {
    const withActual = row.cells
      .map((c, i) => ({ ...c, i }))
      .filter((c) => c.actual !== null)
    if (withActual.length === 0) continue
    withActual.forEach((c) => monthsWithData.add(c.i))
    const avgBudget = Math.round(withActual.reduce((s, c) => s + c.budget, 0) / withActual.length)
    const avgActual = Math.round(withActual.reduce((s, c) => s + (c.actual ?? 0), 0) / withActual.length)
    const deviation = avgActual - avgBudget
    const deviationPct = avgBudget !== 0 ? (deviation / Math.abs(avgBudget)) * 100 : 0
    out.push({ key: row.id, label: row.label, avgBudget, avgActual, deviation, deviationPct, sampleCount: withActual.length })
    total++
    if (Math.abs(deviationPct) <= HIT_TOLERANCE_PCT) hits++
  }

  return {
    rows: out.sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation)),
    overallHitRate: total > 0 ? Math.round((hits / total) * 100) : 0,
    monthsWithData: monthsWithData.size,
  }
}
