import { describe, it, expect, beforeEach } from 'vitest'
import { DEFAULT_CALIBRATION_SETTINGS, useEconomyStore } from '@/application/useEconomyStore'

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
