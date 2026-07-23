import { describe, it, expect } from 'vitest'
import { isInsuranceExpired } from '../SubscriptionsPage'
import type { InsuranceEntry } from '@/types/economy'

function makeIns(overrides: Partial<InsuranceEntry> = {}): InsuranceEntry {
  return {
    id: 'ins-1',
    provider: 'Gjensidige',
    type: 'MC',
    yearlyAmounts: {},
    isActive: true,
    ...overrides,
  }
}

describe('isInsuranceExpired', () => {
  it('er false når activeUntil ikke er satt', () => {
    expect(isInsuranceExpired(makeIns(), '2026-07')).toBe(false)
  })

  it('er false når activeUntil er inneværende eller fremtidig måned', () => {
    expect(isInsuranceExpired(makeIns({ activeUntil: '2026-07' }), '2026-07')).toBe(false)
    expect(isInsuranceExpired(makeIns({ activeUntil: '2026-12' }), '2026-07')).toBe(false)
  })

  it('er true når activeUntil er en tidligere måned', () => {
    expect(isInsuranceExpired(makeIns({ activeUntil: '2026-06' }), '2026-07')).toBe(true)
  })
})
