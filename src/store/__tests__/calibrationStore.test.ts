import { describe, it, expect, beforeEach } from 'vitest'
import { DEFAULT_CALIBRATION_SETTINGS, useEconomyStore } from '@/application/useEconomyStore'
import { calibrateProfile } from '@/domain/economy/forecastCalibration'
import type { MonthRecord, ParsetLonnsslipp, EmploymentProfile } from '@/types/economy'

function slip2(over: Partial<ParsetLonnsslipp> = {}): ParsetLonnsslipp {
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
function rec2(year: number, month: number, over: Partial<ParsetLonnsslipp> = {}): MonthRecord {
  return { year, month, isLocked: true, source: 'imported_slip', lines: [],
    nettoUtbetalt: 35_000, disposable: 35_000, slipData: slip2({ periode: { year, month }, ...over }) }
}
function prof(over: Partial<EmploymentProfile> = {}): EmploymentProfile {
  return { employer: 'forsvaret', baseMonthly: 50_000, fixedAdditions: [],
    lastKnownTaxWithholding: 18_000, extraTaxWithholding: 0, housingDeduction: 0,
    pensionPercent: 2, unionFee: 0, atfEnabled: false, ...over }
}

describe('DEFAULT_CALIBRATION_SETTINGS', () => {
  it('auto er på som default, horisont 6', () => {
    expect(DEFAULT_CALIBRATION_SETTINGS.enabled).toBe(true)
    expect(DEFAULT_CALIBRATION_SETTINGS.horizonSlips).toBe(6)
  })
})

describe('kalibrerings-actions', () => {
  beforeEach(() => {
    useEconomyStore.setState({ lockedCalibrationKeys: [], calibrationSettings: DEFAULT_CALIBRATION_SETTINGS })
  })

  it('lockCalibration er idempotent (ingen duplikat)', () => {
    useEconomyStore.getState().lockCalibration('skattetrekk')
    useEconomyStore.getState().lockCalibration('skattetrekk')
    expect(useEconomyStore.getState().lockedCalibrationKeys).toEqual(['skattetrekk'])
  })

  it('unlockCalibration fjerner nøkkelen', () => {
    useEconomyStore.getState().lockCalibration('skattetrekk')
    useEconomyStore.getState().unlockCalibration('skattetrekk')
    expect(useEconomyStore.getState().lockedCalibrationKeys).toEqual([])
  })

  it('setCalibrationSettings oppdaterer horisont', () => {
    useEconomyStore.getState().setCalibrationSettings({ enabled: false, horizonSlips: 9 })
    expect(useEconomyStore.getState().calibrationSettings).toEqual({ enabled: false, horizonSlips: 9 })
  })
})

describe('konsistens-invariant: auto av ≡ siste-verdi', () => {
  it('disabled gir nyeste slipps verdier (som dagens oppførsel)', () => {
    const hist = [rec2(2026, 1, { skattetrekk: 17_000, maanedslonn: 49_000 }),
                  rec2(2026, 3, { skattetrekk: 19_000, maanedslonn: 51_000 })]
    const res = calibrateProfile(hist, prof(), { enabled: false, horizonSlips: 6 }, [])
    expect(res.values.skattetrekk).toBe(19_000)
    expect(res.values.baseMonthly).toBe(51_000)
  })

  it('enabled: baseMonthly er ALLTID nyeste (steg-funksjon, ikke snitt) — lagger ikke lønnsøkning', () => {
    // 6 slipper: 50k → ny lønn 55k på nyeste. Snitt ville gitt ~50.8k; baseMonthly skal være 55k.
    const hist = [
      rec2(2026, 1, { maanedslonn: 50_000 }), rec2(2026, 2, { maanedslonn: 50_000 }),
      rec2(2026, 3, { maanedslonn: 50_000 }), rec2(2026, 4, { maanedslonn: 50_000 }),
      rec2(2026, 5, { maanedslonn: 50_000 }), rec2(2026, 7, { maanedslonn: 55_000 }),
    ]
    const res = calibrateProfile(hist, prof(), { enabled: true, horizonSlips: 6 }, [])
    expect(res.values.baseMonthly).toBe(55_000)
    // skattetrekk derimot snittes (varierende måling)
    expect(res.values.skattetrekk).toBe(18_000)
  })

  it('enabled på/av gir SAMME baseMonthly (nyeste) — invariant for grunnlønn', () => {
    const hist = [rec2(2026, 1, { maanedslonn: 50_000 }), rec2(2026, 3, { maanedslonn: 55_000 })]
    const on = calibrateProfile(hist, prof(), { enabled: true, horizonSlips: 6 }, [])
    const off = calibrateProfile(hist, prof(), { enabled: false, horizonSlips: 6 }, [])
    expect(on.values.baseMonthly).toBe(off.values.baseMonthly)
    expect(on.values.baseMonthly).toBe(55_000)
  })
})
