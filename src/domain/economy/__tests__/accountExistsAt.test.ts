import { describe, it, expect } from 'vitest'
import { accountExistsAt, existsAt } from '../savingsCalculator'

describe('accountExistsAt', () => {
  const acc = { openingDate: '2026-03-25' }

  it('er false for måneder før kontoen ble opprettet', () => {
    expect(accountExistsAt(acc, 2016, 1)).toBe(false)
    expect(accountExistsAt(acc, 2025, 12)).toBe(false)
    expect(accountExistsAt(acc, 2026, 2)).toBe(false)
  })

  it('er true fra og med opprettelsesmåneden', () => {
    expect(accountExistsAt(acc, 2026, 3)).toBe(true)
    expect(accountExistsAt(acc, 2026, 4)).toBe(true)
    expect(accountExistsAt(acc, 2027, 1)).toBe(true)
  })

  it('sammenligner måned, ikke dag — en konto opprettet 25. mars finnes i mars', () => {
    expect(accountExistsAt({ openingDate: '2026-03-01' }, 2026, 3)).toBe(true)
    expect(accountExistsAt({ openingDate: '2026-03-31' }, 2026, 3)).toBe(true)
  })

  it('håndterer ensifrede måneder riktig', () => {
    // Uten padding ville '2026-09' <= '2026-9' gitt feil svar
    expect(accountExistsAt({ openingDate: '2026-09-01' }, 2026, 9)).toBe(true)
    expect(accountExistsAt({ openingDate: '2026-09-01' }, 2026, 8)).toBe(false)
  })
})

describe('existsAt', () => {
  it('uten startdato antas alltid å eksistere', () => {
    expect(existsAt(undefined, 2016, 1)).toBe(true)
  })

  it('respekterer startdato når den finnes', () => {
    expect(existsAt('2026-04-01', 2017, 6)).toBe(false)
    expect(existsAt('2026-04-01', 2026, 4)).toBe(true)
  })
})
