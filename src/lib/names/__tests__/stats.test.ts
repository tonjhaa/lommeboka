import { describe, it, expect } from 'vitest'
import { computeOwnStats } from '../stats'
import type { Vote } from '../types'
import { makeName } from './helpers'

const names = [
  makeName({ id: 'a', gender: 'girl', letters: 4, latestRank: 10 }),
  makeName({ id: 'b', gender: 'boy', letters: 6, latestRank: 200 }),
  makeName({ id: 'c', gender: 'girl', letters: 8, latestRank: null, latestYear: 2015 }),
  makeName({ id: 'd', gender: 'boy', letters: 5, latestRank: 50 }),
]

describe('computeOwnStats', () => {
  it('teller vurderinger, matcher og fordelinger', () => {
    const votes = new Map<string, Vote>([['a', 'yes'], ['b', 'yes'], ['c', 'maybe'], ['d', 'no']])
    const matches = [{ id: 'm1', nameId: 'a', matchedAt: 'x' }, { id: 'm2', nameId: 'c', matchedAt: 'y' }]
    const s = computeOwnStats(names, votes, matches, 2025)
    expect(s).toMatchObject({ rated: 4, yes: 2, maybe: 1, no: 1, matches: 2 })
    expect(s.matchRate).toBe(1)
    expect(s.avgMatchRank).toBe(10) // c mangler rang siste år og telles ikke
    expect(s.matchGender).toEqual({ girl: 2, boy: 0 })
    expect(s.yesLength).toEqual({ short: 1, medium: 1, long: 0 })
    expect(s.yesTop100Share).toBe(0.5)
    expect(s.ratedTop100Share).toBe(0.5)
  })

  it('gir null istedenfor 0/NaN uten grunnlag', () => {
    const s = computeOwnStats(names, new Map(), [], 2025)
    expect(s.matchRate).toBeNull()
    expect(s.avgMatchRank).toBeNull()
    expect(s.yesTop100Share).toBeNull()
  })

  it('ignorerer stemmer på navn som ikke finnes lenger', () => {
    expect(computeOwnStats(names, new Map<string, Vote>([['ukjent', 'yes']]), [], 2025).rated).toBe(0)
  })
})
