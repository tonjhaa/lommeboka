import { describe, it, expect } from 'vitest'
import { selectNormalSlips, trimmedMean, calibrateProfile } from '../forecastCalibration'
import type { MonthRecord, ParsetLonnsslipp, CalibrationSettings, EmploymentProfile } from '@/types/economy'

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

const SETTINGS_ON: CalibrationSettings = { enabled: true, horizonSlips: 6 }
const SETTINGS_OFF: CalibrationSettings = { enabled: false, horizonSlips: 6 }

function profile(over: Partial<EmploymentProfile> = {}): EmploymentProfile {
  return {
    employer: 'forsvaret', baseMonthly: 50_000, fixedAdditions: [],
    lastKnownTaxWithholding: 18_000, extraTaxWithholding: 0, housingDeduction: 0,
    pensionPercent: 2, unionFee: 0, atfEnabled: false, ...over,
  }
}

describe('calibrateProfile', () => {
  it('enabled: skattetrekk = trimmet snitt over normale slipper', () => {
    const hist = [
      rec(2026, 1, { skattetrekk: 17_000 }),
      rec(2026, 2, { skattetrekk: 18_000 }),
      rec(2026, 3, { skattetrekk: 19_000 }),
    ]
    const res = calibrateProfile(hist, profile(), SETTINGS_ON, [])
    expect(res.values.skattetrekk).toBe(18_000) // snitt 17/18/19
    const entry = res.entries.find((e) => e.key === 'skattetrekk')!
    expect(entry.calibrated).toBe(18_000)
    expect(entry.sampleCount).toBe(3)
  })

  it('disabled: bruker nyeste slipps verdi (siste-verdi-fallback)', () => {
    const hist = [
      rec(2026, 1, { skattetrekk: 17_000 }),
      rec(2026, 3, { skattetrekk: 19_000 }),
    ]
    const res = calibrateProfile(hist, profile(), SETTINGS_OFF, [])
    expect(res.values.skattetrekk).toBe(19_000) // nyeste
  })

  it('locked-nøkkel beholder current-verdi og hoppes over', () => {
    const hist = [rec(2026, 1, { skattetrekk: 17_000 }), rec(2026, 2, { skattetrekk: 19_000 })]
    const res = calibrateProfile(hist, profile({ lastKnownTaxWithholding: 99_000 }), SETTINGS_ON, ['skattetrekk'])
    expect(res.values.skattetrekk).toBe(99_000)
    expect(res.entries.find((e) => e.key === 'skattetrekk')?.locked).toBe(true)
  })

  it('ATF-satser snittes per artskode', () => {
    const hist = [
      rec(2026, 1, { atfRater: { '2230': 4_000 } }),
      rec(2026, 2, { atfRater: { '2230': 4_200 } }),
    ]
    const res = calibrateProfile(hist, profile(), SETTINGS_ON, [])
    expect(res.values.atfRates['2230']).toBe(4_100)
  })

  it('tabelltrekkProsent fra grunnlag/beløp; null når ingen gyldige', () => {
    const hist = [rec(2026, 2, { tabelltrekkGrunnlag: 60_000, tabelltrekkBelop: 18_000 })]
    const res = calibrateProfile(hist, profile(), SETTINGS_ON, [])
    expect(res.values.tabelltrekkProsent).toBeCloseTo(30, 1)
  })

  it('ingen slipper → verdier faller tilbake på current profil', () => {
    const res = calibrateProfile([], profile({ lastKnownTaxWithholding: 12_345 }), SETTINGS_ON, [])
    expect(res.values.skattetrekk).toBe(12_345)
    expect(res.entries).toHaveLength(0)
  })
})
