import { describe, it, expect } from 'vitest'
import { isFiniteNumber } from '../number-input'

describe('isFiniteNumber', () => {
  it('godtar vanlige tall, inkludert 0 og negative', () => {
    expect(isFiniteNumber(0)).toBe(true)
    expect(isFiniteNumber(42)).toBe(true)
    expect(isFiniteNumber(-3.5)).toBe(true)
  })

  it('avviser undefined, null, NaN og Infinity — hindrer krasj i .toString()', () => {
    expect(isFiniteNumber(undefined)).toBe(false)
    expect(isFiniteNumber(null)).toBe(false)
    expect(isFiniteNumber(NaN)).toBe(false)
    expect(isFiniteNumber(Infinity)).toBe(false)
  })
})
