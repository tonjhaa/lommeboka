import { describe, it, expect } from 'vitest'
import { searchNames } from '../browse'
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
})
