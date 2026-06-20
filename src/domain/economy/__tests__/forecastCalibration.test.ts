import { describe, it, expect } from 'vitest'
import { selectNormalSlips, trimmedMean } from '../forecastCalibration'
import type { MonthRecord, ParsetLonnsslipp } from '@/types/economy'

function slip(over: Partial<ParsetLonnsslipp> = {}): ParsetLonnsslipp {
  return {
    periode: { year: 2026, month: 3 }, ansattnummer: '1', loennstrinn: 0,
    maanedslonn: 50_000, fasteTillegg: [], trekk: [], bruttoSum: 50_000,
    nettoUtbetalt: 35_000, feriepengegrunnlag: 0, opptjentFerie: 0,
    skattetrekk: 18_000, ekstraTrekk: 0, husleietrekk: 0, pensjonstrekk: 0,
    fagforeningskontingent: 0, ouFond: 0, gruppelivspremie: 0,
    hittilBrutto: 0, hittilPensjon: 0, hittilForskuddstrekk: 0,
    tabelltrekkGrunnlag: 60_000, tabelltrekkBelop: 18_000, ...over,
  }
}

function rec(year: number, month: number, over: Partial<ParsetLonnsslipp> = {}): MonthRecord {
  return {
    year, month, isLocked: true, source: 'imported_slip', lines: [],
    nettoUtbetalt: 35_000, disposable: 35_000,
    slipData: slip({ periode: { year, month }, ...over }),
  }
}

describe('selectNormalSlips', () => {
  it('tar siste n importerte slipper, ekskl. juni/desember og ferietrekk', () => {
    const hist: MonthRecord[] = [
      rec(2026, 1), rec(2026, 2), rec(2026, 6), // juni ekskluderes
      rec(2026, 4, { ferietrekk: 5_000 }),       // ferietrekk ekskluderes
      rec(2026, 5),
    ]
    const sel = selectNormalSlips(hist, 6)
    const months = sel.map((s) => s.periode.month).sort((a, b) => a - b)
    expect(months).toEqual([1, 2, 5])
  })

  it('begrenser til n nyeste', () => {
    const hist = [rec(2026, 1), rec(2026, 2), rec(2026, 3)]
    expect(selectNormalSlips(hist, 2)).toHaveLength(2)
  })
})

describe('trimmedMean', () => {
  it('tom → 0; én → seg selv', () => {
    expect(trimmedMean([])).toBe(0)
    expect(trimmedMean([42])).toBe(42)
  })
  it('2–3 verdier → vanlig snitt', () => {
    expect(trimmedMean([10, 20])).toBe(15)
  })
  it('n≥4 → dropp høyeste+laveste (blip-demping)', () => {
    // 18000-er med én blip på 40000 og én lav på 5000 → trim fjerner begge
    expect(trimmedMean([18_000, 18_000, 40_000, 5_000])).toBe(18_000)
  })
})
