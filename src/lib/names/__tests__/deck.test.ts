import { describe, it, expect } from 'vitest'
import { buildDeck } from '../deck'
import { DEFAULT_FILTERS } from '../filters'
import type { Vote } from '../types'
import { makeName } from './helpers'

const names = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => makeName({ id }))

describe('buildDeck', () => {
  it('utelater navn brukeren allerede har vurdert (ingen gjentakelser)', () => {
    const votes = new Map<string, Vote>([['a', 'no'], ['b', 'maybe'], ['c', 'yes']])
    const ids = buildDeck(names, votes, DEFAULT_FILTERS, 2025, 1).map((n) => n.id)
    expect(ids.sort()).toEqual(['d', 'e', 'f'])
  })

  it('er deterministisk for samme seed og stabil når navn forsvinner', () => {
    const full = buildDeck(names, new Map(), DEFAULT_FILTERS, 2025, 7).map((n) => n.id)
    expect(buildDeck(names, new Map(), DEFAULT_FILTERS, 2025, 7).map((n) => n.id)).toEqual(full)
    const without = buildDeck(names, new Map<string, Vote>([[full[0], 'no']]), DEFAULT_FILTERS, 2025, 7).map((n) => n.id)
    expect(without).toEqual(full.slice(1))
  })

  it('gir ulik rekkefølge for ulik seed', () => {
    const a = buildDeck(names, new Map(), DEFAULT_FILTERS, 2025, 1).map((n) => n.id).join()
    const b = buildDeck(names, new Map(), DEFAULT_FILTERS, 2025, 2).map((n) => n.id).join()
    expect(a).not.toEqual(b)
  })

  it('returnerer tom bunke når filtrene ikke gir treff', () => {
    expect(buildDeck(names, new Map(), { ...DEFAULT_FILTERS, gender: 'boy' }, 2025, 1)).toEqual([])
  })
})
