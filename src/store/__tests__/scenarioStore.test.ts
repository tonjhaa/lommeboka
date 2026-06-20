import { describe, it, expect } from 'vitest'
import { useAppStore } from '@/store/useAppStore'
import { DEFAULT_SCENARIO_LEVERS } from '@/domain/economy/scenarioSimulator'

describe('scenarioLevers i useAppStore', () => {
  it('starter med default-spaker', () => {
    expect(useAppStore.getState().scenarioLevers).toEqual(DEFAULT_SCENARIO_LEVERS)
  })
  it('setScenarioLevers oppdaterer', () => {
    useAppStore.getState().setScenarioLevers({ ...DEFAULT_SCENARIO_LEVERS, salaryPct: 5 })
    expect(useAppStore.getState().scenarioLevers.salaryPct).toBe(5)
    useAppStore.getState().setScenarioLevers(DEFAULT_SCENARIO_LEVERS)
  })
})
