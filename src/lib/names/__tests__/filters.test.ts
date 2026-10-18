import { describe, it, expect } from 'vitest'
import { DEFAULT_FILTERS, matchesFilters, activeFilterCount, toggleIn, lengthBucket, syllableCount, availableLetters, peakBucket, type NameFilters } from '../filters'
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

describe('forbokstav og stavelser', () => {
  it('teller stavelser omtrentlig, med diftonger som én og andre vokalrekker delt', () => {
    const cases: Array<[string, number]> = [
      ['Per', 1], ['Nora', 2], ['Eirik', 2], ['Noah', 2], ['Maria', 3], ['Sofie', 3],
      ['Anne-Lise', 4], ['Øyvind', 2], ['Oliver', 3], ['Emilie', 4], ['Ym', 1],
    ]
    for (const [name, n] of cases) expect([name, syllableCount(name)]).toEqual([name, n])
  })

  it('filtrerer på forbokstav (ELLER) og stavelser', () => {
    const nora = makeName({ id: 'a', name: 'Nora', letters: 4 })
    const emilie = makeName({ id: 'b', name: 'Emilie', letters: 6 })
    expect(matchesFilters(nora, f({ letters: ['n', 'å'] }), Y)).toBe(true)
    expect(matchesFilters(emilie, f({ letters: ['n'] }), Y)).toBe(false)
    expect(matchesFilters(emilie, f({ syllables: ['4plus'] }), Y)).toBe(true)
    expect(matchesFilters(nora, f({ syllables: ['4plus', '3'] }), Y)).toBe(false)
    expect(matchesFilters(nora, f({ letters: ['n'], syllables: ['2'] }), Y)).toBe(true)
  })

  it('teller nye filter i activeFilterCount og lister forbokstaver med æøå sist', () => {
    expect(activeFilterCount(f({ letters: ['a', 'b'], syllables: ['2'] }))).toBe(3)
    expect(availableLetters([{ name: 'Åse' }, { name: 'Anna' }, { name: 'Ole' }, { name: 'Øyvind' }, { name: 'Aksel' }])).toEqual(['a', 'o', 'ø', 'å'])
  })
})

describe('mest populær-periode', () => {
  it('plasserer toppåret i tiår, med alt før 1970 samlet', () => {
    expect([1925, 1969, 1970, 1999, 2000, 2024].map(peakBucket)).toEqual(['to1969', 'to1969', '1970', '1990', '2000', '2020'])
  })

  it('filtrerer på tiåret toppåret ligger i, og skjuler navn uten beregnet toppår', () => {
    const n90 = makeName({ id: 'a', peakFrom: 1992, peakTo: 1996, peakYear: 1994 })
    const none = makeName({ id: 'b', peakFrom: null, peakTo: null, peakYear: null })
    expect(matchesFilters(n90, f({ peak: ['1990'] }), Y)).toBe(true)
    expect(matchesFilters(n90, f({ peak: ['2010', '2020'] }), Y)).toBe(false)
    expect(matchesFilters(none, f({ peak: ['1990'] }), Y)).toBe(false)
    expect(matchesFilters(none, DEFAULT_FILTERS, Y)).toBe(true)
    expect(activeFilterCount(f({ peak: ['1990', '2000'] }))).toBe(2)
  })
})
