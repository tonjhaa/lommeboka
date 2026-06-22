import { describe, it, expect, beforeEach } from 'vitest'
import { useEconomyStore } from '@/application/useEconomyStore'
import type { BankSpendingTransaction } from '@/types/economy'

function tx(id: string, key: string): BankSpendingTransaction {
  return { id, date: '2026-03-15', counterpartyRaw: key, counterpartyKey: key, amount: -100,
    category: null, categorySource: 'none', importBatchId: 'b1' }
}

describe('spending-store', () => {
  beforeEach(() => useEconomyStore.setState({ spendingTransactions: [], categoryRules: [] }))

  it('addSpendingTransactions deduper på (dato, key, beløp)', () => {
    const a = tx('1', 'rema 1000'); const b = { ...tx('2', 'rema 1000') }
    useEconomyStore.getState().addSpendingTransactions([a])
    useEconomyStore.getState().addSpendingTransactions([b])   // duplikat (samme dato/key/beløp)
    expect(useEconomyStore.getState().spendingTransactions).toHaveLength(1)
  })

  it('setCategoryRule erstatter per merchantKey', () => {
    useEconomyStore.getState().setCategoryRule({ id: 'r1', merchantKey: 'rema 1000', category: 'mat', source: 'learned' })
    useEconomyStore.getState().setCategoryRule({ id: 'r2', merchantKey: 'rema 1000', category: 'fritid', source: 'learned' })
    const rules = useEconomyStore.getState().categoryRules.filter((r) => r.merchantKey === 'rema 1000')
    expect(rules).toHaveLength(1)
    expect(rules[0].category).toBe('fritid')
  })

  it('setCategoryRule re-appliserer på LAGREDE transaksjoner (retter historikk)', () => {
    useEconomyStore.getState().addSpendingTransactions([tx('1', 'lokal kafe ukjent')])
    expect(useEconomyStore.getState().spendingTransactions[0].category).toBeNull()
    useEconomyStore.getState().setCategoryRule({ id: 'r1', merchantKey: 'lokal kafe ukjent', category: 'fritid', source: 'learned' })
    expect(useEconomyStore.getState().spendingTransactions[0].category).toBe('fritid')
  })

  it('removeCategoryRule re-appliserer (faller tilbake til ingen/seed)', () => {
    useEconomyStore.getState().addSpendingTransactions([tx('1', 'lokal kafe ukjent')])
    useEconomyStore.getState().setCategoryRule({ id: 'r1', merchantKey: 'lokal kafe ukjent', category: 'fritid', source: 'learned' })
    useEconomyStore.getState().removeCategoryRule('lokal kafe ukjent')
    expect(useEconomyStore.getState().spendingTransactions[0].category).toBeNull()
  })
})
