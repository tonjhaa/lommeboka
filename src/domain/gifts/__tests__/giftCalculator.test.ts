import { describe, it, expect } from 'vitest'
import { isEventArchived } from '../giftCalculator'
import type { GiftEvent } from '@/types/gifts'

describe('isEventArchived', () => {
  it('bursdag: ikke arkivert rett før 3-månedersgrensen', () => {
    const event: GiftEvent = {
      id: '1', recipientId: 'r1', occasion: 'bursdag', date: '2026-06-01',
      ownership: 'felles', calculatedAmount: 500, isLocked: false, status: 'kjøpt',
    }
    expect(isEventArchived(event, new Date('2026-08-31'))).toBe(false)
  })

  it('bursdag: arkivert rett etter 3-månedersgrensen', () => {
    const event: GiftEvent = {
      id: '1', recipientId: 'r1', occasion: 'bursdag', date: '2026-06-01',
      ownership: 'felles', calculatedAmount: 500, isLocked: false, status: 'kjøpt',
    }
    expect(isEventArchived(event, new Date('2026-09-02'))).toBe(true)
  })

  it('bursdag: arkiveres uansett status (også planlagt/droppet)', () => {
    const event: GiftEvent = {
      id: '1', recipientId: 'r1', occasion: 'bursdag', date: '2026-06-01',
      ownership: 'felles', calculatedAmount: 500, isLocked: false, status: 'planlagt',
    }
    expect(isEventArchived(event, new Date('2026-09-02'))).toBe(true)
  })

  it('jul: ikke arkivert i desember samme år', () => {
    const event: GiftEvent = {
      id: '1', recipientId: 'r1', occasion: 'jul', month: 12, year: 2026,
      ownership: 'felles', calculatedAmount: 500, isLocked: false, status: 'kjøpt',
    }
    expect(isEventArchived(event, new Date('2026-12-24'))).toBe(false)
  })

  it('jul: arkivert 1. januar året etter', () => {
    const event: GiftEvent = {
      id: '1', recipientId: 'r1', occasion: 'jul', month: 12, year: 2026,
      ownership: 'felles', calculatedAmount: 500, isLocked: false, status: 'kjøpt',
    }
    expect(isEventArchived(event, new Date('2027-01-01'))).toBe(true)
  })

  it('jul uten explisitt year faller tilbake på dagens år', () => {
    const event: GiftEvent = {
      id: '1', recipientId: 'r1', occasion: 'jul', month: 12,
      ownership: 'felles', calculatedAmount: 500, isLocked: false, status: 'planlagt',
    }
    expect(isEventArchived(event, new Date('2026-06-01'))).toBe(false)
  })

  it('andre anledninger arkiveres ikke automatisk', () => {
    const event: GiftEvent = {
      id: '1', recipientId: 'r1', occasion: 'bryllup', date: '2020-01-01',
      ownership: 'felles', calculatedAmount: 500, isLocked: false, status: 'kjøpt',
    }
    expect(isEventArchived(event, new Date('2026-06-01'))).toBe(false)
  })

  it('bursdag uten dato arkiveres aldri automatisk', () => {
    const event: GiftEvent = {
      id: '1', recipientId: 'r1', occasion: 'bursdag',
      ownership: 'felles', calculatedAmount: 500, isLocked: false, status: 'kjøpt',
    }
    expect(isEventArchived(event, new Date('2030-01-01'))).toBe(false)
  })
})
