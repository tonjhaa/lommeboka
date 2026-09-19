import { describe, it, expect } from 'vitest'
import { sortMatches, type MatchEntry } from '../matches'
import { makeName } from './helpers'

const entry = (id: string, rank: number | null, matchedAt: string, latestYear = 2025): MatchEntry => ({
  match: { id: `m-${id}`, nameId: id, matchedAt },
  name: makeName({ id, name: id, latestRank: rank, latestYear }),
})
const list = [
  entry('Vilde', 31, '2026-09-10T10:00:00Z'),
  entry('Ingrid', 12, '2026-09-12T10:00:00Z'),
  entry('Aagot', null, '2026-09-11T10:00:00Z', 2010),
]
const ids = (s: ReturnType<typeof sortMatches>) => s.map((e) => e.name.id)

describe('sortMatches', () => {
  it('nyeste først', () => expect(ids(sortMatches(list, 'newest', 2025))).toEqual(['Ingrid', 'Aagot', 'Vilde']))
  // Norsk sortering: «Aa» sorteres som «Å», altså sist
  it('alfabetisk (norsk)', () => expect(ids(sortMatches(list, 'alpha', 2025))).toEqual(['Ingrid', 'Vilde', 'Aagot']))
  it('mest populære: lav rang først, uten registrering sist', () =>
    expect(ids(sortMatches(list, 'popular', 2025))).toEqual(['Ingrid', 'Vilde', 'Aagot']))
  it('minst populære: uten registrering først', () =>
    expect(ids(sortMatches(list, 'rare', 2025))).toEqual(['Aagot', 'Vilde', 'Ingrid']))
  it('muterer ikke inputlisten', () => {
    const copy = [...list]
    sortMatches(list, 'alpha', 2025)
    expect(list).toEqual(copy)
  })
})
