import { describe, it, expect } from 'vitest'
import { DEFAULT_CALIBRATION_SETTINGS } from '@/application/useEconomyStore'

describe('DEFAULT_CALIBRATION_SETTINGS', () => {
  it('auto er på som default, horisont 6', () => {
    expect(DEFAULT_CALIBRATION_SETTINGS.enabled).toBe(true)
    expect(DEFAULT_CALIBRATION_SETTINGS.horizonSlips).toBe(6)
  })
})
