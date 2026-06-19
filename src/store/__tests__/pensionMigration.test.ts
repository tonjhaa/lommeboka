import { describe, it, expect } from 'vitest'
import { useEconomyStore, DEFAULT_PENSION_SETTINGS } from '@/application/useEconomyStore'

describe('DEFAULT_PENSION_SETTINGS', () => {
  it('har fornuftige standardverdier', () => {
    expect(DEFAULT_PENSION_SETTINGS.særalder.enabled).toBe(false)
    expect(DEFAULT_PENSION_SETTINGS.særalder.age).toBe(60)
    expect(DEFAULT_PENSION_SETTINGS.afpEnabled).toBe(true)
    expect(DEFAULT_PENSION_SETTINGS.assumptions.salaryGrowthPct).toBeGreaterThan(0)
  })
})

// importData er stien sky-/backup-lasting bruker, og gjør samme forward-migrering
// av enabledTabs som persist-migreringen (v22). Dekker den brukervendte garantien.
describe('importData — pensjons-migrering av enabledTabs', () => {
  it('legger til "pension" når den mangler i lagret data', () => {
    useEconomyStore.getState().importData(JSON.stringify({
      userPreferences: { enabledTabs: ['dashboard', 'salary'], onboardingCompleted: true },
    }))
    expect(useEconomyStore.getState().userPreferences?.enabledTabs).toContain('pension')
  })

  it('er idempotent — dupliserer ikke "pension"', () => {
    useEconomyStore.getState().importData(JSON.stringify({
      userPreferences: { enabledTabs: ['dashboard', 'pension'], onboardingCompleted: true },
    }))
    const tabs = useEconomyStore.getState().userPreferences?.enabledTabs ?? []
    expect(tabs.filter((t) => t === 'pension')).toHaveLength(1)
  })

  it('krasjer ikke når userPreferences er null', () => {
    expect(() =>
      useEconomyStore.getState().importData(JSON.stringify({ userPreferences: null })),
    ).not.toThrow()
    expect(useEconomyStore.getState().userPreferences).toBeNull()
  })

  it('laster pensionSettings fra importert data, faller tilbake på null', () => {
    useEconomyStore.getState().importData(JSON.stringify({
      pensionSettings: { ...DEFAULT_PENSION_SETTINGS, birthYear: 1995 },
    }))
    expect(useEconomyStore.getState().pensionSettings?.birthYear).toBe(1995)

    useEconomyStore.getState().importData(JSON.stringify({ profile: null }))
    expect(useEconomyStore.getState().pensionSettings).toBeNull()
  })
})
