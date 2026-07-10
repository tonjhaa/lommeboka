import { describe, it, expect } from 'vitest'
import { calculateCarLoan, estimateFuelCost, type CarLoanInputs } from '../carLoanCalculator'

function baseInputs(overrides: Partial<CarLoanInputs> = {}): CarLoanInputs {
  return {
    price: 300_000,
    equity: 50_000,
    annualRate: 6,
    termYears: 5,
    loanType: 'annuitet',
    fuelType: null,
    year: null,
    mileageKm: null,
    runningCosts: {
      insurance: { enabled: false, monthlyAmount: 0 },
      fuel: { enabled: false, monthlyAmount: 0 },
      maintenance: { enabled: false, yearlyAmount: 0 },
    },
    availableMonthlyBudget: 10_000,
    ...overrides,
  }
}

describe('calculateCarLoan', () => {
  it('lånebeløp = pris minus egenkapital', () => {
    const result = calculateCarLoan(baseInputs({ price: 300_000, equity: 50_000 }))
    expect(result.loanAmount).toBe(250_000)
  })

  it('terminbeløp kommer fra amortiseringsplanens første rad', () => {
    const result = calculateCarLoan(baseInputs())
    expect(result.monthlyInstallment).toBe(result.amortization.rows[0].payment)
    expect(result.monthlyInstallment).toBeGreaterThan(0)
  })

  it('driftskostnader som er avslått teller ikke med', () => {
    const result = calculateCarLoan(baseInputs({
      runningCosts: {
        insurance: { enabled: false, monthlyAmount: 1000 },
        fuel: { enabled: false, monthlyAmount: 1500 },
        maintenance: { enabled: false, yearlyAmount: 12_000 },
      },
    }))
    expect(result.totalRunningCostMonthly).toBe(0)
    expect(result.totalMonthlyCost).toBe(result.monthlyInstallment)
  })

  it('påslåtte driftskostnader summeres — årlig service deles på 12', () => {
    const result = calculateCarLoan(baseInputs({
      runningCosts: {
        insurance: { enabled: true, monthlyAmount: 1000 },
        fuel: { enabled: true, monthlyAmount: 1500 },
        maintenance: { enabled: true, yearlyAmount: 12_000 },
      },
    }))
    expect(result.totalRunningCostMonthly).toBe(1000 + 1500 + 1000) // 12000/12 = 1000
    expect(result.totalMonthlyCost).toBe(result.monthlyInstallment + 3500)
  })

  it('affordability = ok når totalkostnad er innenfor budsjett', () => {
    const result = calculateCarLoan(baseInputs({ price: 60_000, equity: 60_000, availableMonthlyBudget: 5000 }))
    expect(result.loanAmount).toBe(0)
    expect(result.affordability).toBe('ok')
  })

  it('affordability = stramt når totalkostnad er inntil 10% over budsjett', () => {
    // Lånebeløp gir terminbeløp rett over budsjett, men innenfor 10%-margin
    const result = calculateCarLoan(baseInputs({
      price: 300_000, equity: 0, annualRate: 6, termYears: 5,
      availableMonthlyBudget: 5300, // terminbeløp for 300k/6%/5år er ca 5800
    }))
    expect(result.totalMonthlyCost).toBeGreaterThan(5300)
    expect(result.totalMonthlyCost).toBeLessThanOrEqual(5300 * 1.1)
    expect(result.affordability).toBe('stramt')
  })

  it('affordability = ikke-rad når totalkostnad er over 10% over budsjett', () => {
    const result = calculateCarLoan(baseInputs({
      price: 300_000, equity: 0, annualRate: 6, termYears: 5,
      availableMonthlyBudget: 1000,
    }))
    expect(result.affordability).toBe('ikke-rad')
  })

  it('totalInterestCost kommer fra amortiseringsplanens totalInterestPaid', () => {
    const result = calculateCarLoan(baseInputs())
    expect(result.totalInterestCost).toBe(result.amortization.totalInterestPaid)
    expect(result.totalInterestCost).toBeGreaterThan(0)
  })
})

describe('estimateFuelCost', () => {
  it('bruker km/år estimert fra kilometerstand delt på bilens alder', () => {
    const nowYear = new Date().getFullYear()
    // Bil kjøpt/registrert 5 år siden med 100 000 km => 20 000 km/år
    const cost = estimateFuelCost('bensin', 100_000, nowYear - 5)
    // 20 000 km/år * 1.8 kr/km / 12 mnd = 3000 kr/mnd
    expect(cost).toBe(3000)
  })

  it('faller tilbake på 15 000 km/år når år eller km mangler', () => {
    const withoutYear = estimateFuelCost('bensin', 100_000, null)
    const withoutKm = estimateFuelCost('bensin', null, 2020)
    // 15 000 km/år * 1.8 / 12 = 2250 kr/mnd
    expect(withoutYear).toBe(2250)
    expect(withoutKm).toBe(2250)
  })

  it('el er billigere per km enn bensin', () => {
    const bensin = estimateFuelCost('bensin', 100_000, new Date().getFullYear() - 5)
    const el = estimateFuelCost('el', 100_000, new Date().getFullYear() - 5)
    expect(el).toBeLessThan(bensin)
  })

  it('ukjent/manglende drivstofftype bruker fallback-sats', () => {
    const cost = estimateFuelCost(null, 100_000, new Date().getFullYear() - 5)
    // 20 000 km/år * 1.5 (fallback) / 12 = 2500 kr/mnd
    expect(cost).toBe(2500)
  })
})
