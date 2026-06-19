import { describe, it, expect } from 'vitest'
import { buildIncomeProjection, buildGProjection, accrueFolketrygdBeholdning, annualFromBeholdning, accrueSpkPaaslagBeholdning, sumLivsinntektUnder7_1G, annualAfp, projectPension, buildPensionInputFromProfile, type PensionInput } from '../pensionCalculator'
import { FOLKETRYGD_OPPTJENINGSSATS, TAK_FOLKETRYGD_G, SPK_PAASLAG_SATS_LAV, SPK_PAASLAG_SATS_HOY, TAK_SPK_G, AFP_OPPTJENINGSSATS, GRUNNBELOP_NOK } from '@/config/economy.config'
import type { EmploymentProfile, PensionSettings } from '@/types/economy'

describe('buildIncomeProjection', () => {
  it('holder inntekt konstant når vekst = 0', () => {
    const inc = buildIncomeProjection({ currentYear: 2026, currentAnnualIncome: 600_000, fromYear: 2024, toYear: 2028, growthPct: 0 })
    expect(inc[2026]).toBe(600_000)
    expect(inc[2024]).toBe(600_000)
    expect(inc[2028]).toBe(600_000)
  })

  it('skalerer framover og bakover med vekst relativt til currentYear', () => {
    const inc = buildIncomeProjection({ currentYear: 2026, currentAnnualIncome: 100_000, fromYear: 2025, toYear: 2027, growthPct: 10 })
    expect(inc[2027]).toBeCloseTo(110_000, 0)
    expect(inc[2025]).toBeCloseTo(100_000 / 1.1, 0)
  })
})

describe('buildGProjection', () => {
  it('framskriver G med gGrowthPct fra currentYear', () => {
    const g = buildGProjection({ currentYear: 2026, currentG: 130_000, fromYear: 2026, toYear: 2027, gGrowthPct: 5 })
    expect(g[2026]).toBe(130_000)
    expect(g[2027]).toBeCloseTo(136_500, 0)
  })
})

describe('accrueFolketrygdBeholdning', () => {
  it('legger 18,1 % av inntekt ≤ 7,1G i beholdningen per år', () => {
    const G = 100_000
    const income = { 2030: 500_000 } // 500k < 7,1G (710k) → hele teller
    const beholdning = accrueFolketrygdBeholdning(income, { 2030: G })
    expect(beholdning).toBeCloseTo(500_000 * FOLKETRYGD_OPPTJENINGSSATS, 2)
  })

  it('kapper inntekt ved 7,1G', () => {
    const G = 100_000
    const tak = TAK_FOLKETRYGD_G * G // 710 000
    const income = { 2030: 900_000 } // over taket
    const beholdning = accrueFolketrygdBeholdning(income, { 2030: G })
    expect(beholdning).toBeCloseTo(tak * FOLKETRYGD_OPPTJENINGSSATS, 2)
  })

  it('summerer over flere år', () => {
    const income = { 2030: 300_000, 2031: 300_000 }
    const g = { 2030: 100_000, 2031: 100_000 }
    const beholdning = accrueFolketrygdBeholdning(income, g)
    expect(beholdning).toBeCloseTo(2 * 300_000 * FOLKETRYGD_OPPTJENINGSSATS, 2)
  })
})

describe('annualFromBeholdning', () => {
  it('deler beholdning på delingstall', () => {
    expect(annualFromBeholdning(1_600_000, 16)).toBeCloseTo(100_000, 6)
  })

  it('returnerer 0 ved delingstall = 0 (defensiv guard)', () => {
    expect(annualFromBeholdning(100_000, 0)).toBe(0)
  })
})

describe('accrueSpkPaaslagBeholdning', () => {
  it('gir kun lav sats når grunnlag ≤ 7,1G', () => {
    const G = 100_000
    const grunnlag = { 2030: 500_000 } // < 7,1G
    const beholdning = accrueSpkPaaslagBeholdning(grunnlag, { 2030: G })
    expect(beholdning).toBeCloseTo(500_000 * SPK_PAASLAG_SATS_LAV, 2)
  })

  it('legger høy sats på båndet 7,1G–12G', () => {
    const G = 100_000
    const grunnlag = { 2030: 800_000 } // 7,1G=710k, 12G=1,2M → bånd = 90k
    const beholdning = accrueSpkPaaslagBeholdning(grunnlag, { 2030: G })
    const forventet = 800_000 * SPK_PAASLAG_SATS_LAV + (800_000 - 7.1 * G) * SPK_PAASLAG_SATS_HOY
    expect(beholdning).toBeCloseTo(forventet, 2)
  })

  it('kapper grunnlaget ved 12G', () => {
    const G = 100_000
    const grunnlag = { 2030: 2_000_000 } // over 12G
    const beholdning = accrueSpkPaaslagBeholdning(grunnlag, { 2030: G })
    const cap = TAK_SPK_G * G // 1,2M
    const forventet = cap * SPK_PAASLAG_SATS_LAV + (cap - 7.1 * G) * SPK_PAASLAG_SATS_HOY
    expect(beholdning).toBeCloseTo(forventet, 2)
  })
})

describe('AFP (ny livsvarig)', () => {
  it('summerer livsinntekt kappet ved 7,1G', () => {
    const G = 100_000
    const income = { 2030: 500_000, 2031: 900_000 } // år 2: kappes til 710k
    const sum = sumLivsinntektUnder7_1G(income, { 2030: G, 2031: G })
    expect(sum).toBeCloseTo(500_000 + 710_000, 2)
  })

  it('beregner AFP = livsinntekt × 4,21 % / delingstall', () => {
    const livsinntekt = 20_000_000
    const delingstall = 16
    expect(annualAfp(livsinntekt, delingstall)).toBeCloseTo(
      livsinntekt * AFP_OPPTJENINGSSATS / delingstall, 4,
    )
  })
})

function makeInput(overrides: Partial<PensionInput> = {}): PensionInput {
  return {
    birthYear: 1995,
    serviceStartYear: 2016,
    currentYear: 2026,
    currentG: 130_000,
    folketrygdAnnualIncome: 600_000, // inkl. ATF/tillegg
    spkAnnualGrunnlag: 550_000,      // fast lønn + faste tillegg
    uttaksalder: 67,
    salaryGrowthPct: 0,
    gGrowthPct: 0,
    afpEnabled: true,
    særalder: { enabled: false, age: 60 },
    ...overrides,
  }
}

describe('projectPension', () => {
  it('returnerer positive beløp for alle aktive pilarer', () => {
    const p = projectPension(makeInput())
    expect(p.perPilar.folketrygd).toBeGreaterThan(0)
    expect(p.perPilar.spk).toBeGreaterThan(0)
    expect(p.perPilar.afp).toBeGreaterThan(0)
    expect(p.perPilar.særalder).toBe(0)
    expect(p.monthlyTotal).toBeCloseTo(
      p.perPilar.folketrygd + p.perPilar.spk + p.perPilar.afp + p.perPilar.særalder, 4,
    )
    // Fornuftig intervall: en heltidskarriere skal gi en månedspensjon av betydning.
    expect(p.monthlyTotal).toBeGreaterThan(10_000)
    expect(p.confidence).toBe('middels')
  })

  it('gir en kompensasjonsgrad mellom 0 og 2', () => {
    const p = projectPension(makeInput())
    expect(p.replacementRate).toBeGreaterThan(0)
    expect(p.replacementRate).toBeLessThan(2) // >200 % ville vært en feil
  })

  it('kaster når yrkesstart er etter uttaksår', () => {
    expect(() => projectPension(makeInput({ serviceStartYear: 2099, uttaksalder: 62 }))).toThrow()
  })

  it('gir 0 AFP når afpEnabled = false', () => {
    const p = projectPension(makeInput({ afpEnabled: false }))
    expect(p.perPilar.afp).toBe(0)
  })

  it('gir særalderbeløp > 0 når særalder er på', () => {
    const p = projectPension(makeInput({ særalder: { enabled: true, age: 60 }, uttaksalder: 60 }))
    expect(p.perPilar.særalder).toBeGreaterThan(0)
  })

  it('kaster for årskull før 1963', () => {
    expect(() => projectPension(makeInput({ birthYear: 1960 }))).toThrow()
  })

  it('senere uttaksalder gir høyere folketrygd', () => {
    const tidlig = projectPension(makeInput({ uttaksalder: 62 }))
    const sen = projectPension(makeInput({ uttaksalder: 70 }))
    expect(sen.perPilar.folketrygd).toBeGreaterThan(tidlig.perPilar.folketrygd)
  })
})

describe('buildPensionInputFromProfile', () => {
  const settings: PensionSettings = {
    birthYear: 1995,
    serviceStartYear: 2016,
    særalder: { enabled: false, age: 60 },
    afpEnabled: true,
    assumptions: { salaryGrowthPct: 3, gGrowthPct: 3.5 },
  }

  it('utleder SPK-grunnlag fra grunnlønn + faste tillegg og folketrygd med ATF-faktor', () => {
    const profile = { baseMonthly: 50_000, fixedAdditions: [{ amount: 5_000 }] } as unknown as EmploymentProfile
    const input = buildPensionInputFromProfile(profile, settings, 2026)
    expect(input.spkAnnualGrunnlag).toBe((50_000 + 5_000) * 12)
    expect(input.folketrygdAnnualIncome).toBeCloseTo((50_000 + 5_000) * 12 * 1.05, 2)
    expect(input.currentG).toBe(GRUNNBELOP_NOK)
    expect(input.særalder).toEqual(settings.særalder)
    expect(input.currentYear).toBe(2026)
  })

  it('takler manglende faste tillegg', () => {
    const profile = { baseMonthly: 40_000 } as unknown as EmploymentProfile
    const input = buildPensionInputFromProfile(profile, settings, 2026)
    expect(input.spkAnnualGrunnlag).toBe(40_000 * 12)
  })
})
