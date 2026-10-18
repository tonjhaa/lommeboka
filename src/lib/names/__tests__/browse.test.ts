import { describe, it, expect } from 'vitest'
import { searchNames, type SortKey } from '../browse'
import { makeName } from './helpers'
import type { Vote } from '../types'

const names = [
  makeName({ id: 'a', name: 'Aksel', gender: 'boy' }),
  makeName({ id: 'b', name: 'Maksim', gender: 'boy' }),
  makeName({ id: 'c', name: 'Alma', gender: 'girl' }),
  makeName({ id: 'd', name: 'Robin', gender: 'girl' }),
  makeName({ id: 'e', name: 'Robin', gender: 'boy' }),
]
const votes = new Map<string, Vote>([['a', 'yes'], ['c', 'no']])
const ids = (r: { id: string }[]) => r.map((n) => n.id)

describe('searchNames', () => {
  it('søker uavhengig av store/små bokstaver og legger treff på starten først', () => {
    expect(ids(searchNames(names, votes, { query: 'AKS', gender: 'all', vote: 'all' }))).toEqual(['a', 'b'])
  })
  it('filtrerer på kjønn og beholder begge kjønn av samme navn når kjønn er «all»', () => {
    expect(ids(searchNames(names, votes, { query: 'robin', gender: 'all', vote: 'all' }))).toEqual(['d', 'e'])
    expect(ids(searchNames(names, votes, { query: 'robin', gender: 'boy', vote: 'all' }))).toEqual(['e'])
  })
  it('filtrerer på egen vurdering, inkludert ikke vurdert', () => {
    expect(ids(searchNames(names, votes, { query: '', gender: 'all', vote: 'yes' }))).toEqual(['a'])
    expect(ids(searchNames(names, votes, { query: '', gender: 'all', vote: 'unrated' }))).toEqual(['b', 'd', 'e'])
  })
  it('sorterer på alfabet baklengs, rang (uten tall sist) og lengde', () => {
    const rows = [
      makeName({ id: 'x', name: 'Ola', gender: 'boy', letters: 3, latestYear: 2025, latestRank: 50 }),
      makeName({ id: 'y', name: 'Emil', gender: 'boy', letters: 4, latestYear: 2025, latestRank: 5 }),
      makeName({ id: 'z', name: 'Abel', gender: 'boy', letters: 4, latestYear: 2015, latestRank: 1 }),
    ]
    const sorted = (sort: SortKey) => ids(searchNames(rows, new Map(), { query: '', gender: 'all', vote: 'all', sort, latestYear: 2025 }))
    expect(sorted('alpha')).toEqual(['z', 'y', 'x'])
    expect(sorted('alphaDesc')).toEqual(['x', 'y', 'z'])
    expect(sorted('popular')).toEqual(['y', 'x', 'z'])
    expect(sorted('shortest')).toEqual(['x', 'z', 'y'])
    expect(sorted('longest')).toEqual(['z', 'y', 'x'])
  })
})
