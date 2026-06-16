import { describe, it, expect } from 'vitest'
import { computeBudgetTable } from '../budgetTableComputer'
import type { EmploymentProfile, BudgetTemplate, BudgetLine, LonnsoppgjorRecord } from '@/types/economy'

const profile: EmploymentProfile = {
  employer: 'forsvaret',
  baseMonthly: 50_000,
  fixedAdditions: [{ kode: '1162', label: 'HTA 2.5.1 - Beløp - MND 06.26', amount: 1_700 }],
  lastKnownTaxWithholding: 15_000,
  extraTaxWithholding: 0,
  housingDeduction: 7_000,
  pensionPercent: 2,
  unionFee: 700,
  atfEnabled: false,
}

const emptyTemplate: BudgetTemplate = { lines: [], lastUpdated: '2026-01-01' }

function mkLine(partial: Partial<BudgetLine> & Pick<BudgetLine, 'id' | 'label' | 'category' | 'amount'>): BudgetLine {
  return {
    isRecurring: true,
    source: 'manual',
    isLocked: false,
    isVariable: false,
    ...partial,
  }
}

function compute(opts: {
  year?: number
  template?: BudgetTemplate
  employmentStartDate?: string | null
  lonnsoppgjor?: LonnsoppgjorRecord[]
} = {}) {
  return computeBudgetTable(
    opts.year ?? 2026,
    profile,
    opts.template ?? emptyTemplate,
    [], // monthHistory
    [], // atfEntries
    [], // savingsAccounts
    [], // debts
    [], // subscriptions
    [], // insurances
    {}, // overrides
    [], // temporaryPayEntries
    undefined, // juneForecast
    false, // hideTemporary
    [], // ivfTransactions
    undefined, // fondPortfolio
    undefined, // ivfSelfLabel
    undefined, // trekktabellLookup
    opts.employmentStartDate,
    opts.lonnsoppgjor,
  )
}

function mkOppgjor(partial: Partial<LonnsoppgjorRecord> & Pick<LonnsoppgjorRecord, 'effectiveDate' | 'maanedslonn'>): LonnsoppgjorRecord {
  return {
    id: crypto.randomUUID(),
    year: Number(partial.effectiveDate.slice(0, 4)),
    forrigeMaanedslonn: 0,
    htaTillegg: 0,
    notes: '',
    source: 'slip',
    ...partial,
  }
}

describe('computeBudgetTable — BRUTTO-rad', () => {
  it('har nøyaktig én bruttorad og ingen referanserader', () => {
    const data = compute()
    const inntekter = data.sections.find((s) => s.key === 'INNTEKTER')!
    const ids = inntekter.rows.map((r) => r.id)
    expect(ids).toContain('brutto')
    expect(ids).not.toContain('brutto-inntekt')
    expect(ids).not.toContain('skattepliktig')
    expect(ids.filter((id) => id === 'brutto')).toHaveLength(1)
  })

  it('BRUTTO-budsjett = sum av inntektsradene', () => {
    const data = compute()
    const inntekter = data.sections.find((s) => s.key === 'INNTEKTER')!
    const brutto = inntekter.rows.find((r) => r.id === 'brutto')!
    const memberSum = inntekter.rows
      .filter((r) => !r.isBold)
      .reduce((s, r) => s + r.cells[0].budget, 0)
    expect(brutto.cells[0].budget).toBe(memberSum)
    expect(brutto.cells[0].budget).toBe(50_000 + 1_700)
  })

  it('oppsummeringen har ikke duplikatraden SUM INN', () => {
    const data = compute()
    const bunn = data.sections.find((s) => s.key === 'BUNN')!
    expect(bunn.rows.map((r) => r.id)).toEqual(['sum-ut', 'overskudd'])
  })
})

describe('computeBudgetTable — ansettelsesdato', () => {
  it('nuller lønn, tillegg og trekk for måneder før ansettelse', () => {
    const data = compute({ year: 2021, employmentStartDate: '2021-09-15' })
    const inntekter = data.sections.find((s) => s.key === 'INNTEKTER')!
    const lonn = inntekter.rows.find((r) => r.id === 'lonn')!
    const trekk = data.sections.find((s) => s.key === 'TREKK')!

    for (let m = 1; m <= 8; m++) {
      expect(lonn.cells[m - 1].budget).toBe(0)
      for (const row of trekk.rows) {
        expect(row.cells[m - 1].budget).toBe(0)
      }
    }
    expect(lonn.cells[8].budget).toBe(50_000)  // september
    expect(lonn.cells[11].budget).toBe(50_000)
  })

  it('påvirker ikke måneder etter ansettelse i senere år', () => {
    const data = compute({ year: 2026, employmentStartDate: '2021-09-15' })
    const lonn = data.sections.find((s) => s.key === 'INNTEKTER')!.rows.find((r) => r.id === 'lonn')!
    expect(lonn.cells.every((c) => c.budget === 50_000)).toBe(true)
  })
})

describe('computeBudgetTable — manuelle trekk- og gjeldslinjer', () => {
  it('viser template-linjer med trekk-kategori i TREKK-seksjonen', () => {
    const template: BudgetTemplate = {
      lines: [mkLine({ id: 'l1', label: 'Kantinetrekk', category: 'skatt', amount: -450 })],
      lastUpdated: '2026-01-01',
    }
    const data = compute({ template })
    const trekk = data.sections.find((s) => s.key === 'TREKK')!
    const row = trekk.rows.find((r) => r.id === 'trekk-l1')
    expect(row).toBeDefined()
    expect(row!.cells[0].budget).toBe(-450)
  })

  it('viser template-linjer med gjeld-kategori i GJELD-seksjonen', () => {
    const template: BudgetTemplate = {
      lines: [mkLine({ id: 'l2', label: 'Klarna', category: 'annen_gjeld', amount: -1_200 })],
      lastUpdated: '2026-01-01',
    }
    const data = compute({ template })
    const gjeld = data.sections.find((s) => s.key === 'GJELD')!
    const row = gjeld.rows.find((r) => r.id === 'debt-t-l2')
    expect(row).toBeDefined()
    expect(row!.cells[0].budget).toBe(-1_200)
  })
})

describe('computeBudgetTable — lønnsoppgjør som prognosekilde', () => {
  const oppgjor = [
    mkOppgjor({ effectiveDate: '2025-11-01', maanedslonn: 55_844 }),
    mkOppgjor({ effectiveDate: '2026-05-01', maanedslonn: 57_352, source: 'forventet', activeInProjection: true }),
  ]

  it('bruker gjeldende oppgjør per måned, inkl. forventet oppgjør fremover', () => {
    const data = compute({ year: 2026, lonnsoppgjor: oppgjor })
    const lonn = data.sections.find((s) => s.key === 'INNTEKTER')!.rows.find((r) => r.id === 'lonn')!
    for (let m = 1; m <= 4; m++) expect(lonn.cells[m - 1].budget).toBe(55_844)
    for (let m = 5; m <= 12; m++) expect(lonn.cells[m - 1].budget).toBe(57_352)
  })

  it('faller tilbake på profil-grunnlønn for måneder før første oppgjør', () => {
    const data = compute({ year: 2024, lonnsoppgjor: oppgjor })
    const lonn = data.sections.find((s) => s.key === 'INNTEKTER')!.rows.find((r) => r.id === 'lonn')!
    expect(lonn.cells[0].budget).toBe(50_000) // profile.baseMonthly
  })

  it('historiske år bruker datidens oppgjørslønn, ikke dagens', () => {
    const historisk = [
      mkOppgjor({ effectiveDate: '2022-07-01', maanedslonn: 46_125 }),
      ...oppgjor,
    ]
    const data = compute({ year: 2023, lonnsoppgjor: historisk })
    const lonn = data.sections.find((s) => s.key === 'INNTEKTER')!.rows.find((r) => r.id === 'lonn')!
    expect(lonn.cells[0].budget).toBe(46_125)
  })
})

describe('computeBudgetTable — delsummer', () => {
  it('utgiftsseksjoner har egen sumrad i fet', () => {
    const template: BudgetTemplate = {
      lines: [
        mkLine({ id: 'f1', label: 'Husleie', category: 'bolig', amount: -9_000 }),
        mkLine({ id: 'v1', label: 'Mat', category: 'mat', amount: -4_000, isVariable: true }),
      ],
      lastUpdated: '2026-01-01',
    }
    const data = compute({ template })
    const faste = data.sections.find((s) => s.key === 'FASTE')!
    const variable = data.sections.find((s) => s.key === 'VARIABLE')!
    const fasteSum = faste.rows.find((r) => r.id === 'sum-faste')!
    const varSum = variable.rows.find((r) => r.id === 'sum-variable')!
    expect(fasteSum.isBold).toBe(true)
    expect(fasteSum.cells[0].budget).toBe(-9_000)
    expect(varSum.cells[0].budget).toBe(-4_000)
  })
})

describe('computeBudgetTable — forventet lønnsoppgjør toggle', () => {
  it('forventet med activeInProjection=true brukes i prognosen', () => {
    const data = compute({ lonnsoppgjor: [mkOppgjor({ effectiveDate: '2026-05-01', maanedslonn: 55_000, source: 'forventet', activeInProjection: true })] })
    const lonn = data.sections.find((s) => s.key === 'INNTEKTER')!.rows.find((r) => r.id === 'lonn')!
    expect(lonn.cells[5].budget).toBe(55_000) // juni
  })

  it('forventet med activeInProjection=false ekskluderes (faller til grunnlønn)', () => {
    const data = compute({ lonnsoppgjor: [mkOppgjor({ effectiveDate: '2026-05-01', maanedslonn: 55_000, source: 'forventet', activeInProjection: false })] })
    const lonn = data.sections.find((s) => s.key === 'INNTEKTER')!.rows.find((r) => r.id === 'lonn')!
    expect(lonn.cells[5].budget).toBe(50_000) // profile.baseMonthly
  })

  it('forventet uten activeInProjection (undefined) ekskluderes', () => {
    const data = compute({ lonnsoppgjor: [mkOppgjor({ effectiveDate: '2026-05-01', maanedslonn: 55_000, source: 'forventet' })] })
    const lonn = data.sections.find((s) => s.key === 'INNTEKTER')!.rows.find((r) => r.id === 'lonn')!
    expect(lonn.cells[5].budget).toBe(50_000)
  })

  it('slip/manual brukes alltid uavhengig av flagget', () => {
    const data = compute({ lonnsoppgjor: [mkOppgjor({ effectiveDate: '2026-05-01', maanedslonn: 55_000, source: 'manual' })] })
    const lonn = data.sections.find((s) => s.key === 'INNTEKTER')!.rows.find((r) => r.id === 'lonn')!
    expect(lonn.cells[5].budget).toBe(55_000)
  })
})
