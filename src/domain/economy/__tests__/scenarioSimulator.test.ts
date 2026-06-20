import { describe, it, expect } from 'vitest'
import { bumpAccountRates, bumpDebtRates, addSavingsDelta, netMonthlyFromGross, applyOneTimeEvents, simulateScenario, DEFAULT_SCENARIO_LEVERS, type ScenarioBaseline } from '../scenarioSimulator'
import type { SavingsAccount, DebtAccount, NetWorthPoint, ScenarioLevers } from '@/types/economy'

function konto(over: Partial<SavingsAccount> = {}): SavingsAccount {
  return {
    id: 's1', type: 'sparekonto', label: 'Sparekonto',
    openingBalance: 100_000, openingDate: '2025-01-01',
    monthlyContribution: 2_000, interestCreditFrequency: 'monthly',
    rateHistory: [{ fromDate: '2025-01-01', rate: 3 }],
    balanceHistory: [], withdrawals: [], contributions: [], ...over,
  }
}
function laan(over: Partial<DebtAccount> = {}): DebtAccount {
  return {
    id: 'd1', creditor: 'Lån', type: 'annet', originalAmount: 100_000, currentBalance: 80_000,
    rateHistory: [{ fromDate: '2025-01-01', nominalRate: 5 }],
    monthlyPayment: 2_000, termFee: 0, startDate: '2025-01-01', ...over,
  }
}

describe('bumpAccountRates', () => {
  it('legger prosentpoeng på alle rate-historikkpunkter', () => {
    const bumped = bumpAccountRates([konto()], 2)
    expect(bumped[0].rateHistory[0].rate).toBe(5)
  })
  it('0 pp = uendret', () => {
    expect(bumpAccountRates([konto()], 0)[0].rateHistory[0].rate).toBe(3)
  })
})

describe('bumpDebtRates', () => {
  it('legger prosentpoeng på nominalRate', () => {
    expect(bumpDebtRates([laan()], 2)[0].rateHistory[0].nominalRate).toBe(7)
  })
})

describe('addSavingsDelta', () => {
  it('legger delta på første ikke-BSU sparekontos månedsbidrag', () => {
    const out = addSavingsDelta([konto()], 1_500)
    expect(out[0].monthlyContribution).toBe(3_500)
  })
  it('0 delta = uendret referanse-likt innhold', () => {
    expect(addSavingsDelta([konto()], 0)[0].monthlyContribution).toBe(2_000)
  })
  it('syntetiserer en konto hvis ingen sparekonto finnes', () => {
    const out = addSavingsDelta([], 1_000)
    expect(out).toHaveLength(1)
    expect(out[0].monthlyContribution).toBe(1_000)
  })
})

describe('netMonthlyFromGross', () => {
  it('høyere brutto gir høyere netto (marginalskatt)', () => {
    const lav = netMonthlyFromGross(50_000)
    const hoy = netMonthlyFromGross(60_000)
    expect(hoy).toBeGreaterThan(lav)
    // men netto-økningen er mindre enn brutto-økningen (skatt)
    expect(hoy - lav).toBeLessThan(10_000)
  })
})

describe('applyOneTimeEvents', () => {
  const series: NetWorthPoint[] = [
    { year: 2026, month: 1, sparing: 0, fond: 0, ivf: 0, gjeld: 0, total: 100_000, isProjected: false },
    { year: 2026, month: 2, sparing: 0, fond: 0, ivf: 0, gjeld: 0, total: 100_000, isProjected: true },
    { year: 2026, month: 3, sparing: 0, fond: 0, ivf: 0, gjeld: 0, total: 100_000, isProjected: true },
  ]
  it('legger engangsbeløp til total fra hendelsesdato og framover', () => {
    const out = applyOneTimeEvents(series, [{ id: '1', label: 'Arv', date: '2026-02-15', amount: 50_000 }])
    expect(out[0].total).toBe(100_000) // før hendelsen
    expect(out[1].total).toBe(150_000) // feb (≥ 2026-02)
    expect(out[2].total).toBe(150_000) // mars
  })
  it('negativt beløp trekker fra', () => {
    const out = applyOneTimeEvents(series, [{ id: '1', label: 'Bil', date: '2026-03-01', amount: -30_000 }])
    expect(out[2].total).toBe(70_000)
  })
})

function baseline(): ScenarioBaseline {
  return {
    now: { year: 2026, month: 6 },
    historyMonths: 12, projectionMonths: 60,
    grossMonthly: 55_000,
    baseMonthlyForPension: 50_000,
    pensionBirthYear: 1995, pensionServiceStartYear: 2016, currentG: 136_549,
    equity: 200_000, existingDebt: 300_000,
    savingsAccounts: [konto({ openingBalance: 200_000, monthlyContribution: 5_000 })],
    fondPortfolio: { monthlyDeposit: 0, startDate: '2025-01-01', funds: [], snapshots: [] },
    ivfTransactions: [],
    debts: [laan({ currentBalance: 300_000 })],
    partnerVeikart: { enabled: false, annualIncome: 0, annualNetIncome: 0, equity: 0, bsu: 0, bsuMonthlyContribution: 0, monthlySavings: 0, accounts: [] },
  }
}

describe('simulateScenario — konsistens-invariant', () => {
  it('nøytrale spaker ⇒ scenario.series identisk med baseline.series', () => {
    const res = simulateScenario(baseline(), DEFAULT_SCENARIO_LEVERS)
    expect(res.scenario.series).toEqual(res.baseline.series)
    expect(res.scenario.figures).toEqual(res.baseline.figures)
  })
})

describe('simulateScenario — spaker', () => {
  it('lønn +10 % gir høyere netto og pensjon', () => {
    const levers: ScenarioLevers = { ...DEFAULT_SCENARIO_LEVERS, salaryPct: 10 }
    const res = simulateScenario(baseline(), levers)
    expect(res.scenario.figures.nettoPerMonth).toBeGreaterThan(res.baseline.figures.nettoPerMonth)
    expect(res.scenario.figures.pensionAt67).toBeGreaterThan(res.baseline.figures.pensionAt67)
  })

  it('extraNetToSavingsPct=0 ⇒ lønn endrer ikke formue om 5 år', () => {
    const levers: ScenarioLevers = { ...DEFAULT_SCENARIO_LEVERS, salaryPct: 10, extraNetToSavingsPct: 0 }
    const res = simulateScenario(baseline(), levers)
    expect(res.scenario.figures.netWorth5y).toBeCloseTo(res.baseline.figures.netWorth5y, 0)
  })

  it('månedssparing +3000 øker formue om 5 år', () => {
    const levers: ScenarioLevers = { ...DEFAULT_SCENARIO_LEVERS, monthlySavingsDelta: 3_000 }
    const res = simulateScenario(baseline(), levers)
    expect(res.scenario.figures.netWorth5y).toBeGreaterThan(res.baseline.figures.netWorth5y)
  })

  it('engangsbeløp -100k senker formue om 5 år', () => {
    const levers: ScenarioLevers = { ...DEFAULT_SCENARIO_LEVERS, oneTimeEvents: [{ id: '1', label: 'Bil', date: '2026-07-01', amount: -100_000 }] }
    const res = simulateScenario(baseline(), levers)
    expect(res.scenario.figures.netWorth5y).toBeLessThan(res.baseline.figures.netWorth5y)
  })
})
