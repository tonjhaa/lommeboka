// ============================================================
// TREFFSIKKERHET / KALIBRERING — rene funksjoner
// Kalibrerer profilens trekk-/lønnsverdier via trimmet glidende snitt.
// ============================================================

import type { MonthRecord, ParsetLonnsslipp } from '@/types/economy'

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
