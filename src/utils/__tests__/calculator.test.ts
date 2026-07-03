import { describe, it, expect } from 'vitest'
import { calculateScenario, calculateAmortization } from '../calculator'
import { buildAmortizationPlanWithSimulator } from '../amortization'
import { defaultConfig } from '@/config/default.config'
import type { ScenarioInput } from '@/types'

/** Et realistisk testscenario: to søkere, bolig 5M, EK 900k */
const baseScenario: ScenarioInput = {
  id: 'test-1',
  label: 'Testscenario',
  createdAt: Date.now(),
  isBase: true,
  property: {
    price: 5_000_000,
    type: 'leilighet',
    sharedDebt: 0,
    monthlyFee: 4_500,
    propertyTax: 0,
  },
  household: {
    primaryApplicant: {
      grossIncome: 750_000,
      existingDebt: 0,
      label: 'Person A',
    },
    coApplicant: {
      grossIncome: 650_000,
      existingDebt: 0,
      label: 'Person B',
    },
    children: 0,
    adults: 2,
  },
  loanParameters: {
    equity: 900_000,
    interestRate: 5.5,
    loanTermYears: 25,
    loanType: 'annuitet',
    extraMonthlyExpenses: 0,
  },
}

describe('calculateScenario — godkjent scenario', () => {
  const analysis = calculateScenario(baseScenario, defaultConfig)

  it('returnerer korrekt scenarioId', () => {
    expect(analysis.scenarioId).toBe('test-1')
  })

  it('beregner lånebehov korrekt', () => {
    // EK 900k - gebyrer (~125k for 5M bolig) ≈ 775k effektiv EK
    // Lån ≈ 5M - 775k ≈ 4 225 000
    expect(analysis.property.loanAmount).toBeGreaterThan(4_100_000)
    expect(analysis.property.loanAmount).toBeLessThan(4_400_000)
  })

  it('dokumentavgift er 2.5% av kjøpspris', () => {
    expect(analysis.property.stampDuty).toBe(125_000) // 5M × 2.5%
  })

  it('gjeldsgrad er under 5', () => {
    expect(analysis.debtRatio.debtRatio).toBeLessThan(5.0)
    expect(analysis.debtRatio.approved).toBe(true)
  })

  it('betjeningsevne er godkjent', () => {
    expect(analysis.affordability.approved).toBe(true)
    expect(analysis.affordability.disposableAmount).toBeGreaterThan(0)
  })

  it('maks kjøpsbeløp er beregnet', () => {
    expect(analysis.maxPurchase.maxPurchasePrice).toBeGreaterThan(0)
    expect(['equity', 'debtRatio', 'affordability']).toContain(
      analysis.maxPurchase.limitingFactor
    )
  })

  it('status er godkjent (nok EK, gjeldsgrad ok, betjeningsevne ok)', () => {
    expect(analysis.status.approved).toBe(true)
    expect(analysis.status.errorCount).toBe(0)
  })
})

describe('calculateScenario — for lite EK', () => {
  const lowEqScenario: ScenarioInput = {
    ...baseScenario,
    id: 'test-low-eq',
    loanParameters: { ...baseScenario.loanParameters, equity: 500_000 },
  }
  const analysis = calculateScenario(lowEqScenario, defaultConfig)

  it('EK-kravet er ikke oppfylt', () => {
    // 500k - gebyrer ≈ 375k effektiv, 10% av 5M = 500k → for lite
    expect(analysis.equity.approved).toBe(false)
  })

  it('status er ikke godkjent', () => {
    expect(analysis.status.approved).toBe(false)
    expect(analysis.status.errorCount).toBeGreaterThan(0)
  })
})

describe('calculateScenario — høy gjeldsgrad', () => {
  const highDebtScenario: ScenarioInput = {
    ...baseScenario,
    id: 'test-high-debt',
    household: {
      ...baseScenario.household,
      primaryApplicant: { grossIncome: 400_000, existingDebt: 0 },
      coApplicant: undefined,
    },
  }
  const analysis = calculateScenario(highDebtScenario, defaultConfig)

  it('gjeldsgrad er over 5x', () => {
    expect(analysis.debtRatio.debtRatio).toBeGreaterThan(5.0)
    expect(analysis.debtRatio.approved).toBe(false)
  })
})

describe('calculateAmortization', () => {
  const plan = calculateAmortization(baseScenario, defaultConfig)

  it('har 300 rader (25 år × 12)', () => {
    expect(plan.rows.length).toBe(300)
  })

  it('saldo starter på lånebeløpet og ender nær 0', () => {
    expect(plan.rows[0].balance).toBeLessThan(plan.loanAmount)
    expect(plan.rows[299].balance).toBeLessThan(1_000)
  })

  it('totalt betalt er mer enn lånebeløpet (pga renter)', () => {
    expect(plan.totalPaid).toBeGreaterThan(plan.loanAmount)
  })

  it('har 25 årstotaler', () => {
    expect(plan.yearlyTotals.length).toBe(25)
  })

  it('kumulativ rente øker monotont', () => {
    const r1 = plan.rows[11].cumulativeInterest
    const r2 = plan.rows[59].cumulativeInterest
    const r3 = plan.rows[119].cumulativeInterest
    expect(r2).toBeGreaterThan(r1)
    expect(r3).toBeGreaterThan(r2)
  })
})

// ------------------------------------------------------------
// Regresjon: maks kjøpesum bruker scenarioets forutsetninger
// ------------------------------------------------------------

describe('analyzeMaxPurchase via calculateScenario — scenarioforutsetninger', () => {
  it('lavere rente gir høyere maks (betjeningsevne)', () => {
    const lowRate = calculateScenario(
      { ...baseScenario, loanParameters: { ...baseScenario.loanParameters, interestRate: 3.0 } },
      defaultConfig
    )
    const highRate = calculateScenario(
      { ...baseScenario, loanParameters: { ...baseScenario.loanParameters, interestRate: 6.5 } },
      defaultConfig
    )
    expect(lowRate.maxPurchase.maxByAffordability).toBeGreaterThan(
      highRate.maxPurchase.maxByAffordability
    )
  })

  it('andel (uten dokumentavgift) gir høyere maks (egenkapital) enn selveier', () => {
    const selveier = calculateScenario(
      { ...baseScenario, property: { ...baseScenario.property, ownershipType: 'selveier' } },
      defaultConfig
    )
    const andel = calculateScenario(
      { ...baseScenario, property: { ...baseScenario.property, ownershipType: 'andel' } },
      defaultConfig
    )
    expect(andel.maxPurchase.maxByEquity).toBeGreaterThan(selveier.maxPurchase.maxByEquity)
  })
})

describe('betjeningsevne — eksisterende gjeld stresstestes', () => {
  it('eksisterende gjeld reduserer disponibelt med beregnet betjening', () => {
    const withDebt = calculateScenario(
      {
        ...baseScenario,
        household: {
          ...baseScenario.household,
          primaryApplicant: { ...baseScenario.household.primaryApplicant, existingDebt: 500_000 },
        },
      },
      defaultConfig
    )
    expect(withDebt.affordability.existingDebtServicing).toBeGreaterThan(0)
    const noDebt = calculateScenario(baseScenario, defaultConfig)
    expect(withDebt.affordability.disposableAmount).toBeLessThan(
      noDebt.affordability.disposableAmount
    )
    expect(noDebt.affordability.existingDebtServicing).toBe(0)
  })
})

describe('calculateScenario — guarantorFreeCollateral i maxPurchase', () => {
  it('ingen kausjonist-bolig ⇒ guarantorFreeCollateral er undefined', () => {
    const analysis = calculateScenario(baseScenario, defaultConfig)
    expect(analysis.maxPurchase.guarantorFreeCollateral).toBeUndefined()
  })

  it('kausjonist-bolig oppgitt ⇒ guarantorFreeCollateral satt korrekt (homeValue×0.9 − mortgage)', () => {
    const scenarioWithGuarantor: ScenarioInput = {
      ...baseScenario,
      loanParameters: {
        ...baseScenario.loanParameters,
        kausjon: 500_000,
        guarantorHomeValue: 4_000_000,
        guarantorMortgage: 1_000_000,
      },
    }
    const analysis = calculateScenario(scenarioWithGuarantor, defaultConfig)
    // 4_000_000 × 0.9 − 1_000_000 = 2_600_000
    expect(analysis.maxPurchase.guarantorFreeCollateral).toBe(2_600_000)
  })

  it('kausjonist-bolig uten restgjeld ⇒ guarantorFreeCollateral = homeValue × 0.9', () => {
    const scenarioWithGuarantor: ScenarioInput = {
      ...baseScenario,
      loanParameters: {
        ...baseScenario.loanParameters,
        kausjon: 300_000,
        guarantorHomeValue: 3_000_000,
      },
    }
    const analysis = calculateScenario(scenarioWithGuarantor, defaultConfig)
    // 3_000_000 × 0.9 − 0 = 2_700_000
    expect(analysis.maxPurchase.guarantorFreeCollateral).toBe(2_700_000)
  })
})

// ------------------------------------------------------------
// Regresjon: fellesgjeld er borettslagets lån — ikke ditt eget
// ------------------------------------------------------------

describe('fellesgjeld-modellen (andel med fellesgjeld)', () => {
  const andelScenario: ScenarioInput = {
    ...baseScenario,
    id: 'test-andel',
    property: {
      ...baseScenario.property,
      ownershipType: 'andel',
      price: 3_000_000,
      sharedDebt: 1_000_000,
      monthlyFee: 6_000, // inkluderer betjening av fellesgjelden
    },
  }
  const analysis = calculateScenario(andelScenario, defaultConfig)
  const utenFellesgjeld = calculateScenario(
    {
      ...andelScenario,
      id: 'test-andel-uten',
      property: { ...andelScenario.property, sharedDebt: 0 },
    },
    defaultConfig
  )

  it('eget lånebeløp er kjøpspris − effektiv EK (fellesgjeld holdes utenfor)', () => {
    // Andel: ingen dokumentavgift → gebyrer = 3 000 kr. EK 900k − 3k = 897k.
    // Eget lån = 3 000 000 − 897 000 = 2 103 000 — IKKE 3 103 000.
    expect(analysis.property.loanAmount).toBe(2_103_000)
  })

  it('gjeldsgraden teller fellesgjelden med i samlet gjeld', () => {
    expect(analysis.debtRatio.totalDebt).toBe(
      utenFellesgjeld.debtRatio.totalDebt + 1_000_000
    )
  })

  it('belåningsgraden inkluderer fellesgjeld i både lån og verdi', () => {
    // (2 103 000 + 1 000 000) / 4 000 000 = 77,6 %
    expect(analysis.property.ltvRatio).toBeCloseTo(77.575, 1)
  })

  it('terminbeløpet dekker kun eget lån — fellesgjelden betjenes via felleskost', () => {
    // Samme eget lån ⇒ samme terminbeløp, uavhengig av fellesgjeld
    expect(analysis.affordability.monthlyPaymentStress).toBe(
      utenFellesgjeld.affordability.monthlyPaymentStress
    )
  })

  it('betjeningsevnen stresser fellesgjelden med rentepåslaget (ikke full annuitet)', () => {
    // 1 000 000 × 3 % / 12 = 2 500 kr/mnd
    expect(analysis.affordability.sharedDebtStress).toBe(2_500)
    expect(analysis.affordability.disposableAmount).toBe(
      utenFellesgjeld.affordability.disposableAmount - 2_500
    )
  })

  it('EK-kravet beregnes fortsatt av pris + fellesgjeld', () => {
    // 10 % av 4 000 000 = 400 000 (pluss kontantgebyrer)
    expect(analysis.equity.requiredEquity).toBe(400_000 + 3_000)
  })
})

describe('betjeningsevne — annen inntekt teller med (samme grunnlag som gjeldsgrad)', () => {
  it('otherIncome øker disponibelt beløp', () => {
    const withOther = calculateScenario(
      {
        ...baseScenario,
        household: {
          ...baseScenario.household,
          primaryApplicant: { ...baseScenario.household.primaryApplicant, otherIncome: 120_000 },
        },
      },
      defaultConfig
    )
    const without = calculateScenario(baseScenario, defaultConfig)
    expect(withOther.affordability.monthlyNetIncome).toBeGreaterThan(
      without.affordability.monthlyNetIncome
    )
    expect(withOther.maxPurchase.maxByAffordability).toBeGreaterThan(
      without.maxPurchase.maxByAffordability
    )
  })
})

describe('amortisering — nye simulatorer', () => {
  it('avdragsfrihet gir null avdrag i perioden og samme totale løpetid', () => {
    const plan = buildAmortizationPlanWithSimulator(
      's', 3_000_000, 5.0, 25, 'annuitet', undefined, undefined, 2
    )
    const base = buildAmortizationPlanWithSimulator('s', 3_000_000, 5.0, 25, 'annuitet')
    expect(plan.rows.slice(0, 24).every((r) => r.principal === 0)).toBe(true)
    expect(plan.rows[24].principal).toBeGreaterThan(0)
    expect(plan.termMonths).toBe(base.termMonths)
    expect(plan.totalInterestPaid).toBeGreaterThan(base.totalInterestPaid)
  })

  it('fast månedlig ekstra innbetaling forkorter løpetiden', () => {
    const plan = buildAmortizationPlanWithSimulator(
      's', 3_000_000, 5.0, 25, 'annuitet', undefined,
      { fromMonth: 1, amount: 2_000, strategy: 'shorten', recurring: true }
    )
    const base = buildAmortizationPlanWithSimulator('s', 3_000_000, 5.0, 25, 'annuitet')
    expect(plan.termMonths).toBeLessThan(base.termMonths)
    expect(plan.totalInterestPaid).toBeLessThan(base.totalInterestPaid)
  })
})
