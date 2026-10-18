import { describe, it, expect } from 'vitest'
import { dedupeMatches, groupFavorites, groupVariants, groupVotes, groupYearStats, variantKey, variantLine, variantsOf } from '../variants'
import { makeName } from './helpers'

const same = (...names: string[]) => expect(new Set(names.map(variantKey)).size).toBe(1)
const differ = (a: string, b: string) => expect(variantKey(a)).not.toBe(variantKey(b))

describe('variantKey', () => {
  it('slår sammen skrivemåter som uttales likt', () => {
    same('Pål', 'Paal')
    same('Aleksander', 'Alexander')
    same('Håkon', 'Haakon')
    same('Kristian', 'Christian', 'Cristian')
    same('Mathias', 'Matias', 'Matthias', 'Mattias')
    same('Filip', 'Philip', 'Phillip')
    same('Sofie', 'Sophie')
    same('Sara', 'Sarah')
    same('Viktor', 'Victor', 'Wiktor')
    same('Aksel', 'Axel')
    same('Zofia', 'Zofia')
  })
  it('ignorerer store/små bokstaver, mellomrom og bindestrek', () => {
    same('Ann-Mari', 'ANNMARI', 'Ann Mari')
  })
  it('holder ulike navn fra hverandre', () => {
    differ('Sara', 'Zara')
    differ('Sara', 'Yara')
    differ('Anna', 'Anne')
    differ('Emil', 'Emilie')
    differ('Jon', 'Jonas')
  })
})

describe('groupVariants', () => {
  const rows = [
    makeName({ id: 'p1', name: 'Pål', gender: 'boy', latestCount: 40, latestRank: 100 }),
    makeName({ id: 'p2', name: 'Paal', gender: 'boy', latestCount: 12, latestRank: 200 }),
    makeName({ id: 'o', name: 'Ola', gender: 'boy', latestCount: 30, latestRank: 120 }),
    makeName({ id: 'old', name: 'Paall', gender: 'boy', latestYear: 2010, latestCount: 99, latestRank: 3 }),
    makeName({ id: 'g', name: 'Paal', gender: 'girl', latestCount: 5, latestRank: 10 }),
  ]
  const { names, namesById } = groupVariants(rows, 2025)

  it('lager én rad per gruppe, innenfor samme kjønn, med mest brukte skrivemåte som hovednavn', () => {
    expect(names.map((n) => n.name).sort()).toEqual(['Ola', 'Paal', 'Pål'].sort())
    const group = namesById.get('p2')!
    expect(group.id).toBe('p1')
    expect(variantsOf(group).map((v) => v.id)).toEqual(['p1', 'p2', 'old'])
    expect(namesById.get('p1')).toBe(group)
    expect(namesById.get('g')!.name).toBe('Paal')
    expect(namesById.get('g')).not.toBe(group)
  })
  it('summerer antall siste år og regner rang på nytt blant gruppene', () => {
    const group = namesById.get('p1')!
    expect(group.latestCount).toBe(52)
    expect(group.latestRank).toBe(1) // 52 > Ola 30
    expect(namesById.get('o')!.latestRank).toBe(2)
  })
  it('lar navn uten tall for siste år stå utenfor rangeringen og summen', () => {
    // «Paall» (2010) har samme nøkkel som Pål, men bidrar ikke til antallet
    expect(namesById.get('old')).toBe(namesById.get('p1'))
    expect(namesById.get('p1')!.latestCount).toBe(52)
  })
  it('gir enkeltnavn uendret tilbake, uten variants', () => {
    expect(namesById.get('o')!.variants).toBeUndefined()
    expect(variantLine(namesById.get('o')!)).toBeNull()
    expect(variantLine(namesById.get('p1')!)).toBe('Også skrevet Paal, Paall')
  })
})

describe('gruppehjelpere', () => {
  const rows = [
    makeName({ id: 'a', name: 'Aksel', gender: 'boy', latestCount: 50 }),
    makeName({ id: 'b', name: 'Axel', gender: 'boy', latestCount: 20 }),
    makeName({ id: 'c', name: 'Ola', gender: 'boy', latestCount: 30 }),
  ]
  const { names, namesById } = groupVariants(rows, 2025)

  it('groupYearStats summerer per gruppe og rangerer', () => {
    const stats = new Map([['a', { count: 5, rank: 9 }], ['b', { count: 4, rank: 10 }], ['c', { count: 7, rank: 6 }]])
    const r = groupYearStats(names, stats)
    expect(r.get('a')).toEqual({ count: 9, rank: 1 })
    expect(r.get('c')).toEqual({ count: 7, rank: 2 })
  })
  it('groupYearStats utelater grupper uten tall det året', () => {
    expect(groupYearStats(names, new Map([['c', { count: 7, rank: 1 }]])).has('a')).toBe(false)
  })
  it('groupVotes og groupFavorites bruker første skrivemåte som har verdi', () => {
    expect(groupVotes(names, new Map([['b', 'yes' as const]])).get('a')).toBe('yes')
    expect(groupFavorites(names, new Set(['b'])).has('a')).toBe(true)
    expect(groupFavorites(names, new Set(['c'])).has('a')).toBe(false)
  })
  it('dedupeMatches beholder eldste match per gruppe', () => {
    const matches = [
      { id: 'm2', nameId: 'b', matchedAt: '2026-10-02' },
      { id: 'm1', nameId: 'a', matchedAt: '2026-10-01' },
      { id: 'm3', nameId: 'c', matchedAt: '2026-10-03' },
    ]
    expect(dedupeMatches(matches, namesById).map((m) => m.id)).toEqual(['m1', 'm3'])
  })
})
