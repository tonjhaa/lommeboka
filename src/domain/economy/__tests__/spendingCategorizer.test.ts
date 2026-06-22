import { describe, it, expect } from 'vitest'
import {
  normalizeCounterparty, categorize, applyCategories, aggregateByCategory, seedCategoryRules,
} from '../spendingCategorizer'
import type { BankSpendingTransaction, CategoryRule } from '@/types/economy'

function tx(p: Partial<BankSpendingTransaction>): BankSpendingTransaction {
  return {
    id: p.id ?? crypto.randomUUID(), date: p.date ?? '2026-03-15',
    counterpartyRaw: p.counterpartyRaw ?? '', counterpartyKey: p.counterpartyKey ?? '',
    amount: p.amount ?? -100, category: p.category ?? null,
    categorySource: p.categorySource ?? 'none', importBatchId: p.importBatchId ?? 'b1',
  }
}

describe('normalizeCounterparty', () => {
  it('kollapser filialer (sted/tall fjernes)', () => {
    expect(normalizeCounterparty('REMA 1000 OSLO 1234')).toBe(normalizeCounterparty('REMA 1000 TRONDHEIM'))
  })
  it('fjerner kort-/dato-prefiks', () => {
    expect(normalizeCounterparty('VISA VARE 22.03 REMA 1000')).toContain('rema 1000')
  })
})

describe('categorize — presedens', () => {
  const seeds = seedCategoryRules()
  it('seed-treff via substring', () => {
    const key = normalizeCounterparty('REMA 1000 OSLO')
    expect(categorize(key, seeds).category).toBe('mat')
  })
  it('lært vinner over seed', () => {
    const key = normalizeCounterparty('REMA 1000 OSLO')
    const learned: CategoryRule = { id: 'r1', merchantKey: key, category: 'fritid', source: 'learned' }
    expect(categorize(key, [learned, ...seeds]).source).toBe('learned')
    expect(categorize(key, [learned, ...seeds]).category).toBe('fritid')
  })
  it('INVARIANT: tom regel-liste ⇒ null (ingen gjetting)', () => {
    expect(categorize(normalizeCounterparty('REMA 1000'), [])).toEqual({ category: null, source: 'none' })
  })
  it('ukjent motpart uten treff ⇒ null', () => {
    expect(categorize('ukjent butikk xyz', seedCategoryRules()).category).toBeNull()
  })
  it('uno-x matcher (seed-nøkkel normaliseres til "uno x")', () => {
    const key = normalizeCounterparty('UNO-X BERGEN')
    expect(categorize(key, seedCategoryRules()).category).toBe('transport')
  })
  it('ord-grense: «datasats» treffer IKKE seed «sats» (falsk-positiv-vern)', () => {
    expect(categorize(normalizeCounterparty('DATASATS AS'), seedCategoryRules()).category).toBeNull()
  })
})

describe('applyCategories', () => {
  it('setter kategori + source per transaksjon', () => {
    const t = tx({ counterpartyKey: normalizeCounterparty('KIWI 555') })
    const [out] = applyCategories([t], seedCategoryRules())
    expect(out.category).toBe('mat')
    expect(out.categorySource).toBe('seed')
  })
  it('tomme regler ⇒ alle null', () => {
    const t = tx({ counterpartyKey: normalizeCounterparty('KIWI 555') })
    expect(applyCategories([t], [])[0].category).toBeNull()
  })
})

describe('aggregateByCategory', () => {
  it('summerer utgift per kategori for valgt måned (absoluttverdi)', () => {
    const txs = [
      tx({ date: '2026-03-02', amount: -200, category: 'mat' }),
      tx({ date: '2026-03-20', amount: -50, category: 'mat' }),
      tx({ date: '2026-02-10', amount: -999, category: 'mat' }),   // annen måned
      tx({ date: '2026-03-05', amount: 5000, category: null }),     // inntekt, ignoreres
    ]
    const agg = aggregateByCategory(txs, 2026, 3)
    expect(agg.mat).toBe(250)
  })
})
