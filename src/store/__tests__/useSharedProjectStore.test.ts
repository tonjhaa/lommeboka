import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock supabase-laget: realtime fyrer ALDRI (simulerer forsinket/utilgjengelig realtime).
// addSharedTransaction returnerer den innsatte raden, slik den ekte gjør (.select().single()).
vi.mock('@/lib/sharedProject', () => ({
  loadSharedTransactions: vi.fn(async () => []),
  addSharedTransaction: vi.fn(async (partnershipId: string, tx: Record<string, unknown>) => ({
    ...tx,
    id: 'srv-1',
    partnership_id: partnershipId,
    created_at: '2026-06-16T00:00:00Z',
  })),
  updateSharedTransaction: vi.fn(async () => {}),
  removeSharedTransaction: vi.fn(async () => {}),
  // Returner no-op unsubscribe og kall ALDRI onInsert/onUpdate/onDelete
  subscribeToSharedProject: vi.fn(() => () => {}),
  migratePersonalToShared: vi.fn(async () => 0),
}))

import { useSharedProjectStore } from '../useSharedProjectStore'

describe('useSharedProjectStore — lokal state uten realtime', () => {
  beforeEach(() => {
    useSharedProjectStore.getState().reset()
  })

  it('viser ny transaksjon lokalt umiddelbart selv om realtime ikke fyrer', async () => {
    await useSharedProjectStore.getState().initialize('p1')
    await useSharedProjectStore.getState().addTransaction({
      date: '2026-06-16',
      label: 'Medisin apotek',
      type: 'KJØP',
      amount: -457,
    })

    const txs = useSharedProjectStore.getState().transactions
    expect(txs).toHaveLength(1)
    expect(txs[0].amount).toBe(-457)
    expect(txs[0].label).toBe('Medisin apotek')
  })

  it('fjerner transaksjon lokalt umiddelbart selv om realtime ikke fyrer', async () => {
    await useSharedProjectStore.getState().initialize('p1')
    await useSharedProjectStore.getState().addTransaction({
      date: '2026-06-16', label: 'Medisin apotek', type: 'KJØP', amount: -457,
    })
    const id = useSharedProjectStore.getState().transactions[0].id
    await useSharedProjectStore.getState().removeTransaction(id)
    expect(useSharedProjectStore.getState().transactions).toHaveLength(0)
  })

  it('oppdaterer transaksjon lokalt umiddelbart selv om realtime ikke fyrer', async () => {
    await useSharedProjectStore.getState().initialize('p1')
    await useSharedProjectStore.getState().addTransaction({
      date: '2026-06-16', label: 'Medisin apotek', type: 'KJØP', amount: -457,
    })
    const id = useSharedProjectStore.getState().transactions[0].id
    await useSharedProjectStore.getState().updateTransaction(id, { amount: -500 })
    expect(useSharedProjectStore.getState().transactions[0].amount).toBe(-500)
  })
})
