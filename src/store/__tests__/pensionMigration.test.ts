import { describe, it, expect } from 'vitest'
import { DEFAULT_PENSION_SETTINGS } from '@/application/useEconomyStore'

describe('DEFAULT_PENSION_SETTINGS', () => {
  it('har fornuftige standardverdier', () => {
    expect(DEFAULT_PENSION_SETTINGS.særalder.enabled).toBe(false)
    expect(DEFAULT_PENSION_SETTINGS.særalder.age).toBe(60)
    expect(DEFAULT_PENSION_SETTINGS.afpEnabled).toBe(true)
    expect(DEFAULT_PENSION_SETTINGS.assumptions.salaryGrowthPct).toBeGreaterThan(0)
  })
})
