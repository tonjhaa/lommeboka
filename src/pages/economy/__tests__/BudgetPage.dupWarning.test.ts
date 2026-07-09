import { describe, it, expect } from 'vitest'
import { budgetLineDupWarning } from '../BudgetPage'
import type { BudgetLine } from '@/types/economy'

function line(overrides: Partial<BudgetLine>): BudgetLine {
  return {
    id: 'existing-id',
    label: 'Klarna',
    category: 'annen_gjeld',
    amount: -3900,
    isRecurring: false,
    source: 'manual',
    isLocked: false,
    isVariable: false,
    specificMonth: 5,
    specificYear: 2026,
    ...overrides,
  }
}

describe('budgetLineDupWarning', () => {
  it('varsler ved samme navn, kategori og måned (den faktiske Klarna-bugen)', () => {
    const warning = budgetLineDupWarning('Klarna', 'annen_gjeld', false, 5, 2026, [line({})])
    expect(warning).toMatch(/Klarna/)
  })

  it('varsler ikke ved ulik måned', () => {
    const warning = budgetLineDupWarning('Klarna', 'annen_gjeld', false, 6, 2026, [line({})])
    expect(warning).toBeNull()
  })

  it('varsler ikke ved ulik kategori', () => {
    const warning = budgetLineDupWarning('Klarna', 'kredittkort', false, 5, 2026, [line({})])
    expect(warning).toBeNull()
  })

  it('er ufølsom for store/små bokstaver og mellomrom', () => {
    const warning = budgetLineDupWarning('  klarna  ', 'annen_gjeld', false, 5, 2026, [line({})])
    expect(warning).toMatch(/klarna/i)
  })

  it('ekskluderer linjen som redigeres (unngår falskt varsel mot seg selv)', () => {
    const warning = budgetLineDupWarning('Klarna', 'annen_gjeld', false, 5, 2026, [line({})], 'existing-id')
    expect(warning).toBeNull()
  })

  it('varsler alltid for to gjentakende linjer med samme navn+kategori, uavhengig av måned', () => {
    const warning = budgetLineDupWarning('Klarna', 'annen_gjeld', true, undefined, undefined, [
      line({ isRecurring: true, specificMonth: undefined, specificYear: undefined }),
    ])
    expect(warning).toMatch(/Klarna/)
  })

  it('varsler ikke når én er gjentakende og den andre er engangs (ulik semantikk)', () => {
    const warning = budgetLineDupWarning('Klarna', 'annen_gjeld', true, undefined, undefined, [line({ isRecurring: false })])
    expect(warning).toBeNull()
  })
})
