import { describe, it, expect } from 'vitest'
import { calculateCarLoan, defaultCarLoanInputs, type CarLoanInputs } from '../carLoanCalculator'
import { generateInsights } from '../carLoanInsights'

function inputs(overrides: Partial<CarLoanInputs> = {}): CarLoanInputs {
  return {
    ...defaultCarLoanInputs(),
    price: 300_000,
    equity: 30_000, // 10 % EK → 8 %-trinnet, neste trinn er 20 %
    termYears: 5,
    availableMonthlyBudget: 15_000,
    ...overrides,
  }
}

function insightsFor(i: CarLoanInputs, surplus = 15_000) {
  return generateInsights(i, calculateCarLoan(i), surplus)
}

describe('generateInsights', () => {
  it('foreslår neste EK-rentetrinn med kvantifisert besparelse', () => {
    const list = insightsFor(inputs())
    const ek = list.find((x) => x.id === 'ek-trinn')
    expect(ek).toBeDefined()
    // toLocaleString('no-NO') bruker NBSP som tusenskille — normaliser før sammenligning
    const title = ek!.title.replace(/ /g, ' ')
    expect(title).toContain('30 000 kr') // 20 % av 300k = 60k − 30k = 30k mer
    expect(title).toContain('7 %')
  })

  it('foreslår ikke EK-trinn når renten er manuelt overstyrt', () => {
    const list = insightsFor(inputs({ annualRateOverride: 5.5 }))
    expect(list.find((x) => x.id === 'ek-trinn')).toBeUndefined()
  })

  it('varsler om manglende buffer', () => {
    const i = inputs()
    i.costs.buffer.enabled = false
    expect(insightsFor(i).find((x) => x.id === 'buffer')).toBeDefined()
  })

  it('varsler når bilen spiser mer enn halve overskuddet', () => {
    const list = insightsFor(inputs(), 8_000) // termin ~5 300 + drift > 4 000 av 8 000
    const o = list.find((x) => x.id === 'overskudd')
    expect(o).toBeDefined()
    expect(o!.severity).toBe('advarsel')
  })

  it('elbil-tips vises for bensinbil med normal kjørelengde', () => {
    const list = insightsFor(inputs({ fuelType: 'bensin', annualKm: 15_000 }))
    const el = list.find((x) => x.id === 'elbil')
    expect(el).toBeDefined()
    expect(el!.title).toContain('lavere energikostnad')
  })

  it('elbil-tips vises ikke for elbil', () => {
    const list = insightsFor(inputs({ fuelType: 'el' }))
    expect(list.find((x) => x.id === 'elbil')).toBeUndefined()
  })

  it('maks 4 innsikter, advarsler først', () => {
    const i = inputs({ fuelType: 'bensin', annualKm: 20_000, termYears: 10, equity: 0 })
    i.costs.buffer.enabled = false
    i.depreciation = { enabled: true, annualPct: 15 }
    const list = insightsFor(i, 6_000)
    expect(list.length).toBeLessThanOrEqual(4)
    expect(list[0].severity).toBe('advarsel')
  })

  it('tom kalkulator gir ingen krasj og ingen støy', () => {
    const empty = defaultCarLoanInputs()
    const list = generateInsights(empty, calculateCarLoan(empty), 0)
    expect(Array.isArray(list)).toBe(true)
  })
})
