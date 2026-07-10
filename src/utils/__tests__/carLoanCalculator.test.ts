import { describe, it, expect } from 'vitest'
import {
  calculateCarLoan,
  computeEnergyCostMonthly,
  defaultCarLoanInputs,
  resolveCostAmount,
  type CarLoanInputs,
} from '../carLoanCalculator'

/** Basisscenario: 300 000 kr bil, 50 000 EK, 6 % rente, 5 år annuitet, 12 000 km/år */
function baseInputs(overrides: Partial<CarLoanInputs> = {}): CarLoanInputs {
  const d = defaultCarLoanInputs()
  return {
    ...d,
    price: 300_000,
    equity: 50_000,
    annualRate: 6,
    termYears: 5,
    availableMonthlyBudget: 10_000,
    ...overrides,
  }
}

/** Slår av alt av driftskostnader/verditap for rene lånetester */
function loanOnly(overrides: Partial<CarLoanInputs> = {}): CarLoanInputs {
  const inputs = baseInputs(overrides)
  for (const item of Object.values(inputs.costs)) item.enabled = false
  inputs.fuelType = null
  inputs.toll.enabled = false
  inputs.depreciation.enabled = false
  if (overrides.termingebyr === undefined) inputs.termingebyr = 0
  return inputs
}

describe('calculateCarLoan — lån', () => {
  it('lånebeløp = pris minus egenkapital, aldri negativt', () => {
    expect(calculateCarLoan(baseInputs()).loanAmount).toBe(250_000)
    expect(calculateCarLoan(baseInputs({ equity: 400_000 })).loanAmount).toBe(0)
  })

  it('terminbeløp kommer fra amortiseringsplanen; termingebyr legges på', () => {
    const result = calculateCarLoan(loanOnly({ termingebyr: 65 }))
    expect(result.monthlyInstallment).toBe(result.amortization.rows[0].payment)
    expect(result.monthlyLoanCost).toBe(result.monthlyInstallment + 65)
  })

  it('uten lån (full egenkapital): ingen termin-/etableringsgebyr', () => {
    const result = calculateCarLoan(loanOnly({ equity: 300_000, termingebyr: 65, etableringsgebyr: 2500 }))
    expect(result.loanAmount).toBe(0)
    expect(result.monthlyLoanCost).toBe(0)
    expect(result.firstMonthCost).toBe(result.totalMonthlyCost) // ingen engangsgebyrer
  })

  it('første måned = total månedskostnad + etableringsgebyr + omregistrering', () => {
    const result = calculateCarLoan(loanOnly({ etableringsgebyr: 2500, omregistreringsavgift: 3000 }))
    expect(result.firstMonthCost).toBe(result.totalMonthlyCost + 2500 + 3000)
  })

  it('totalInterestCost hentes fra amortiseringsplanen og er positiv', () => {
    const result = calculateCarLoan(loanOnly())
    expect(result.totalInterestCost).toBe(result.amortization.totalInterestPaid)
    expect(result.totalInterestCost).toBeGreaterThan(0)
  })

  it('total over løpetiden = alle terminer + gebyrer + drift', () => {
    const inputs = loanOnly({ termingebyr: 65, etableringsgebyr: 2500, omregistreringsavgift: 1000 })
    const result = calculateCarLoan(inputs)
    const months = inputs.termYears * 12
    expect(result.totalCostOverLoanTerm).toBe(
      result.amortization.totalPaid + 65 * months + 2500 + 1000 + result.operatingCostMonthly * months
    )
  })
})

describe('computeEnergyCostMonthly — drivlinjer', () => {
  it('bensin: forbruk × literpris × månedlig kjørelengde', () => {
    const inputs = baseInputs({ fuelType: 'bensin', annualKm: 12_000 })
    // 12 000/12/100 = 10 hundrekilometer per mnd × (6.5 l × 22 kr) = 1430
    expect(computeEnergyCostMonthly(inputs)).toBe(1430)
  })

  it('el: blandet hjemme-/offentlig ladepris', () => {
    const inputs = baseInputs({ fuelType: 'el', annualKm: 12_000 })
    // Blandet pris: 1.5×0.8 + 5.5×0.2 = 2.3 kr/kWh; 18 kWh × 2.3 = 41.4 per 100 km; ×10 = 414
    expect(computeEnergyCostMonthly(inputs)).toBe(414)
  })

  it('ladbar hybrid: el-andel elektrisk, resten fossilt', () => {
    const inputs = baseInputs({ fuelType: 'ladbar_hybrid', annualKm: 12_000 })
    // El-del: 20 kWh × 2.3 = 46/100km. Fossil: 6.0 × 22 = 132/100km.
    // 60 % el: 46×0.6 + 132×0.4 = 27.6 + 52.8 = 80.4/100km; ×10 = 804
    expect(computeEnergyCostMonthly(inputs)).toBe(804)
  })

  it('overstyring av forbruk/pris respekteres', () => {
    const inputs = baseInputs({ fuelType: 'bensin', annualKm: 12_000 })
    inputs.fuelEconomy.fossilPer100 = 5
    inputs.fuelEconomy.fossilPricePerLiter = 20
    expect(computeEnergyCostMonthly(inputs)).toBe(1000) // 10 × (5×20)
  })

  it('flat overstyring vinner over detaljmodellen', () => {
    const inputs = baseInputs({ fuelType: 'el', energyOverride: { enabled: true, monthlyAmount: 999 } })
    expect(computeEnergyCostMonthly(inputs)).toBe(999)
  })

  it('ingen drivlinje valgt eller 0 km gir 0', () => {
    expect(computeEnergyCostMonthly(baseInputs({ fuelType: null }))).toBe(0)
    expect(computeEnergyCostMonthly(baseInputs({ fuelType: 'bensin', annualKm: 0 }))).toBe(0)
  })
})

describe('kostnadsposter — estimat, nivå og overstyring', () => {
  it('estimat skaleres med kostnadsnivå', () => {
    const normal = resolveCostAmount('insurance', baseInputs({ costLevel: 'normal' }))
    const lav = resolveCostAmount('insurance', baseInputs({ costLevel: 'lav' }))
    const hoy = resolveCostAmount('insurance', baseInputs({ costLevel: 'hoy' }))
    expect(lav).toBeLessThan(normal)
    expect(hoy).toBeGreaterThan(normal)
  })

  it('overstyring vinner over nivåskalert estimat', () => {
    const inputs = baseInputs({ costLevel: 'hoy' })
    inputs.costs.insurance.overriddenAmount = 555
    expect(resolveCostAmount('insurance', inputs)).toBe(555)
  })

  it('avslåtte poster teller ikke i summen', () => {
    const inputs = baseInputs()
    const withInsurance = calculateCarLoan(inputs).fixedCostsMonthly
    inputs.costs.insurance.enabled = false
    const without = calculateCarLoan(inputs).fixedCostsMonthly
    expect(without).toBe(withInsurance - resolveCostAmount('insurance', inputs))
  })
})

describe('bompenger', () => {
  it('beregner månedskostnad med rabatt', () => {
    const inputs = loanOnly()
    inputs.toll = { enabled: true, passesPerDay: 2, pricePerPass: 30, daysPerWeek: 5, discountPct: 20 }
    // 2×30×5 = 300/uke; −20 % = 240; ×4.345 ≈ 1043
    expect(calculateCarLoan(inputs).tollCostMonthly).toBe(1043)
  })

  it('avslått bom gir 0', () => {
    expect(calculateCarLoan(loanOnly()).tollCostMonthly).toBe(0)
  })
})

describe('verditap', () => {
  it('holdes utenfor kontantkostnaden men med i inkl.-totalen og per km', () => {
    const inputs = loanOnly()
    inputs.depreciation = { enabled: true, annualPct: 12 }
    const result = calculateCarLoan(inputs)
    expect(result.depreciationMonthly).toBe(3000) // 300 000 × 12 % / 12
    expect(result.totalMonthlyCostInclDepreciation).toBe(result.totalMonthlyCost + 3000)
  })

  it('avslått verditap gir 0', () => {
    expect(calculateCarLoan(loanOnly()).depreciationMonthly).toBe(0)
  })
})

describe('partnerdeling', () => {
  it('50/50 deler kontantkostnaden likt', () => {
    const inputs = loanOnly({ sharing: { mode: 'femtifemti', myPct: 50, myFixedAmount: 0 } })
    const result = calculateCarLoan(inputs)
    expect(result.myShareMonthly).toBeCloseTo(result.totalMonthlyCost / 2, 5)
    expect(result.partnerShareMonthly).toBeCloseTo(result.totalMonthlyCost / 2, 5)
  })

  it('prosentvis deling', () => {
    const inputs = loanOnly({ sharing: { mode: 'prosent', myPct: 30, myFixedAmount: 0 } })
    const result = calculateCarLoan(inputs)
    expect(result.myShareMonthly).toBeCloseTo(result.totalMonthlyCost * 0.3, 5)
  })

  it('fast beløp begrenses til totalkostnaden', () => {
    const inputs = loanOnly({ sharing: { mode: 'fastbelop', myPct: 50, myFixedAmount: 999_999 } })
    const result = calculateCarLoan(inputs)
    expect(result.myShareMonthly).toBe(result.totalMonthlyCost)
    expect(result.partnerShareMonthly).toBe(0)
  })

  it('råd-vurdering gjøres mot MIN andel, ikke totalen', () => {
    const alone = calculateCarLoan(loanOnly({ availableMonthlyBudget: 3000 }))
    expect(alone.affordability).toBe('ikke-rad') // ~4800 termin > 3000
    const shared = calculateCarLoan(loanOnly({
      availableMonthlyBudget: 3000,
      sharing: { mode: 'femtifemti', myPct: 50, myFixedAmount: 0 },
    }))
    expect(shared.affordability).toBe('ok') // ~2400 < 3000
  })
})

describe('nøkkeltall', () => {
  it('kost per km bruker inkl. verditap; kost per dag bruker kontantkostnad', () => {
    const inputs = loanOnly({ annualKm: 12_000 })
    inputs.depreciation = { enabled: true, annualPct: 12 }
    const result = calculateCarLoan(inputs)
    expect(result.costPerKm).toBeCloseTo((result.totalMonthlyCostInclDepreciation * 12) / 12_000, 5)
    expect(result.costPerDay).toBeCloseTo((result.totalMonthlyCost * 12) / 365, 5)
  })

  it('0 km gir 0 i kost per km (ingen divisjon på null)', () => {
    expect(calculateCarLoan(loanOnly({ annualKm: 0 })).costPerKm).toBe(0)
  })

  it('topCostDrivers er sortert synkende og maks 4', () => {
    const result = calculateCarLoan(baseInputs({ fuelType: 'bensin' }))
    expect(result.topCostDrivers.length).toBeLessThanOrEqual(4)
    for (let i = 1; i < result.topCostDrivers.length; i++) {
      expect(result.topCostDrivers[i - 1].monthly).toBeGreaterThanOrEqual(result.topCostDrivers[i].monthly)
    }
  })

  it('krasjer ikke på tomme input (alt 0/null)', () => {
    const result = calculateCarLoan(defaultCarLoanInputs())
    expect(result.loanAmount).toBe(0)
    expect(Number.isFinite(result.totalMonthlyCost)).toBe(true)
  })
})
