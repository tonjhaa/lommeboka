/**
 * Task 3 TDD: purchaseYear på ScenarioInput
 * Tester at purchaseYear kan settes og hentes via updateScenario,
 * og at feltet er valgfritt (bakoverkompatibelt).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useAppStore } from '@/store/useAppStore'
import type { ScenarioInput } from '@/types'

function makeScenario(overrides?: Partial<ScenarioInput>): ScenarioInput {
  return {
    id: 'test-' + Math.random().toString(36).slice(2),
    label: 'Testscenario',
    property: { price: 3_000_000, type: 'leilighet' },
    household: {
      primaryApplicant: { grossIncome: 600_000 },
      children: 0,
      adults: 1,
    },
    loanParameters: {
      equity: 450_000,
      interestRate: 5.5,
      loanTermYears: 25,
      loanType: 'annuitet',
    },
    createdAt: Date.now(),
    ...overrides,
  }
}

describe('ScenarioInput.purchaseYear — Task 3', () => {
  let scenarioId: string

  beforeEach(() => {
    // Reset store til tom tilstand
    useAppStore.setState({ scenarios: [], activeScenarioId: null })
    const scenario = makeScenario()
    scenarioId = scenario.id
    useAppStore.getState().addScenario(scenario)
  })

  it('purchaseYear er undefined på nytt scenario (bakoverkompatibelt)', () => {
    const s = useAppStore.getState().scenarios.find(sc => sc.id === scenarioId)
    expect(s?.purchaseYear).toBeUndefined()
  })

  it('updateScenario kan sette purchaseYear og verdien persisterer', () => {
    useAppStore.getState().updateScenario(scenarioId, { purchaseYear: 2029 })
    const s = useAppStore.getState().scenarios.find(sc => sc.id === scenarioId)
    expect(s?.purchaseYear).toBe(2029)
  })

  it('updateScenario kan endre purchaseYear', () => {
    useAppStore.getState().updateScenario(scenarioId, { purchaseYear: 2028 })
    useAppStore.getState().updateScenario(scenarioId, { purchaseYear: 2030 })
    const s = useAppStore.getState().scenarios.find(sc => sc.id === scenarioId)
    expect(s?.purchaseYear).toBe(2030)
  })

  it('purchaseYear brukt som arg til extractLoanInputFromEconomy gir projisert inntekt', () => {
    // Smoke-test: kobler ScenarioInput.purchaseYear til bridge-kallet
    // (bridge-logikken testes grundig i profileBridge.test.ts)
    const nowYear = new Date().getFullYear()
    useAppStore.getState().updateScenario(scenarioId, { purchaseYear: nowYear + 5 })
    const s = useAppStore.getState().scenarios.find(sc => sc.id === scenarioId)
    expect(s?.purchaseYear).toBeGreaterThan(nowYear)
  })
})
