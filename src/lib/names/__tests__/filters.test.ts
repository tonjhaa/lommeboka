import { describe, it, expect } from 'vitest'
import { DEFAULT_FILTERS, matchesFilters, activeFilterCount, toggleIn, lengthBucket, type NameFilters } from '../filters'
import { makeName } from './helpers'

const Y = 2025
const f = (over: Partial<NameFilters>): NameFilters => ({ ...DEFAULT_FILTERS, ...over })

describe('matchesFilters', () => {
  it('skjuler navn uten tall for siste år som standard, og viser dem med includeOlder', () => {
    const old = makeName({ id: 'a', latestYear: 2015, latestRank: 10 })
    expect(matchesFilters(old, DEFAULT_FILTERS, Y)).toBe(false)
    expect(matchesFilters(old, f({ includeOlder: true }), Y)).toBe(true)
  })

  it('filtrerer på kjønn', () => {
    const boy = makeName({ id: 'b', gender: 'boy' })
    expect(matchesFilters(boy, f({ gender: 'girl' }), Y)).toBe(false)
    expect(matchesFilters(boy, f({ gender: 'boy' }), Y)).toBe(true)
  })

  it('popularitet: topp-grupper bruker rang siste år, «utenfor topp 100» og «sjeldne» inkluderer uten registrering', () => {
    const top5 = makeName({ id: 'a', latestRank: 5 })
    const r100 = makeName({ id: 'b', latestRank: 100 })
    const r101 = makeName({ id: 'c', latestRank: 101 })
    const r300 = makeName({ id: 'd', latestRank: 300 })
    const noRank = makeName({ id: 'e', latestRank: null })
    expect(matchesFilters(top5, f({ popularity: ['top10'] }), Y)).toBe(true)
    expect(matchesFilters(r100, f({ popularity: ['top10'] }), Y)).toBe(false)
    expect(matchesFilters(r100, f({ popularity: ['top100'] }), Y)).toBe(true)
    expect(matchesFilters(r101, f({ popularity: ['outside100'] }), Y)).toBe(true)
    expect(matchesFilters(r100, f({ popularity: ['outside100'] }), Y)).toBe(false)
    expect(matchesFilters(r101, f({ popularity: ['rare'] }), Y)).toBe(false)
    expect(matchesFilters(r300, f({ popularity: ['rare'] }), Y)).toBe(true)
    expect(matchesFilters(noRank, f({ popularity: ['outside100', 'rare'] }), Y)).toBe(true)
    expect(matchesFilters(noRank, f({ popularity: ['top100'] }), Y)).toBe(false)
  })

  it('lengde-buckets og trend/tidløse kombineres med OG mellom gruppene og ELLER innenfor', () => {
    const n = makeName({ id: 'a', letters: 5, trend: 'rising' })
    expect(lengthBucket(4)).toBe('short')
    expect(lengthBucket(6)).toBe('medium')
    expect(lengthBucket(7)).toBe('long')
    expect(matchesFilters(n, f({ length: ['medium', 'long'], trend: ['rising'] }), Y)).toBe(true)
    expect(matchesFilters(n, f({ length: ['short'], trend: ['rising'] }), Y)).toBe(false)
    expect(matchesFilters(n, f({ trend: ['falling', 'stable'] }), Y)).toBe(false)
    expect(matchesFilters(makeName({ id: 'z', timeless: true }), f({ trend: ['timeless'] }), Y)).toBe(true)
  })

  it('teller aktive filtre og togler verdier', () => {
    expect(activeFilterCount(DEFAULT_FILTERS)).toBe(0)
    expect(activeFilterCount(f({ gender: 'girl', popularity: ['top10'], includeOlder: true }))).toBe(3)
    expect(toggleIn(['a'], 'b')).toEqual(['a', 'b'])
    expect(toggleIn(['a', 'b'], 'a')).toEqual(['b'])
  })
})
