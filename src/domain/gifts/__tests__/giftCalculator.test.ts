import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { isEventArchived, deriveAutoEvents } from '../giftCalculator'
import { DEFAULT_WEIGHT_RULES, DEFAULT_GIFT_SETTINGS } from '@/domain/gifts/defaultWeights'
import type { GiftEvent, GiftRecipient } from '@/types/gifts'

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

describe('deriveAutoEvents — årlig gjenbruk etter arkivering', () => {
  const recipient: GiftRecipient = {
    id: 'r1', name: 'Per', relationshipType: 'venn', lifePhase: 'voksen',
    ownership: 'felles', receivesBirthdayGift: true, receivesChristmasGift: false,
    birthDate: '1990-06-01',
  }

  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('genererer ikke ny bursdagshendelse når det finnes en aktiv lagret en', () => {
    vi.setSystemTime(new Date('2026-08-01')) // før 3-månedersgrensen for 2026-06-01
    const stored: GiftEvent = {
      id: 's1', recipientId: 'r1', occasion: 'bursdag', date: '2026-06-01',
      ownership: 'felles', calculatedAmount: 500, isLocked: false, status: 'kjøpt',
    }
    const auto = deriveAutoEvents([recipient], [stored], DEFAULT_WEIGHT_RULES, DEFAULT_GIFT_SETTINGS)
    expect(auto).toHaveLength(0)
  })

  it('genererer en fersk bursdagshendelse når den lagrede har blitt arkivert', () => {
    vi.setSystemTime(new Date('2026-09-05')) // etter 3-månedersgrensen for 2026-06-01
    const stored: GiftEvent = {
      id: 's1', recipientId: 'r1', occasion: 'bursdag', date: '2026-06-01',
      ownership: 'felles', calculatedAmount: 500, isLocked: false, status: 'kjøpt',
    }
    const auto = deriveAutoEvents([recipient], [stored], DEFAULT_WEIGHT_RULES, DEFAULT_GIFT_SETTINGS)
    expect(auto).toHaveLength(1)
    expect(auto[0].date).toBe('2027-06-01')
  })

  it('jul-auto-hendelser får explisitt year satt til inneværende år', () => {
    vi.setSystemTime(new Date('2026-03-01'))
    const julRecipient: GiftRecipient = { ...recipient, receivesBirthdayGift: false, receivesChristmasGift: true }
    const auto = deriveAutoEvents([julRecipient], [], DEFAULT_WEIGHT_RULES, DEFAULT_GIFT_SETTINGS)
    expect(auto).toHaveLength(1)
    expect(auto[0].year).toBe(2026)
  })
})
