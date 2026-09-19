import { describe, it, expect } from 'vitest'
import { classifyTrend, rankByCount, transformSsbNames, type JsonStat2 } from './transform'

function stat(names: Array<{ code: string; label: string; counts: (number | null)[]; shares?: (number | null)[] }>, years: string[]): JsonStat2 {
  const value: (number | null)[] = []
  for (const n of names) {
    value.push(...n.counts)
    value.push(...(n.shares ?? n.counts.map((c) => (c === null ? null : c / 10))))
  }
  return {
    id: ['Fornavn', 'ContentsCode', 'Tid'],
    size: [names.length, 2, years.length],
    dimension: {
      Fornavn: { category: { index: Object.fromEntries(names.map((n, i) => [n.code, i])), label: Object.fromEntries(names.map((n) => [n.code, n.label])) } },
      ContentsCode: { category: { index: { Personer: 0, PersonerProsent: 1 } } },
      Tid: { category: { index: Object.fromEntries(years.map((y, i) => [y, i])) } },
    },
    value,
    updated: '2026-01-28T07:00:00Z',
  }
}

describe('rankByCount', () => {
  it('gir delt plassering ved likt antall (1,2,2,4)', () => {
    const r = rankByCount([{ key: 'a', count: 10 }, { key: 'b', count: 8 }, { key: 'c', count: 8 }, { key: 'd', count: 1 }])
    expect([r.get('a'), r.get('b'), r.get('c'), r.get('d')]).toEqual([1, 2, 2, 4])
  })
})

describe('classifyTrend', () => {
  const years = (vals: Record<number, number>) => new Map(Object.entries(vals).map(([y, v]) => [Number(y), v]))

  it('økende når siste 2 år er ≥ 15 % over de tre årene før', () => {
    expect(classifyTrend(years({ 2021: 1, 2022: 1, 2023: 1, 2024: 1.2, 2025: 1.2 }), 2025)).toBe('rising')
  })
  it('synkende når ≤ 85 %', () => {
    expect(classifyTrend(years({ 2021: 1, 2022: 1, 2023: 1, 2024: 0.8, 2025: 0.8 }), 2025)).toBe('falling')
  })
  it('stabil innenfor grensene', () => {
    expect(classifyTrend(years({ 2021: 1, 2022: 1, 2023: 1, 2024: 1.05, 2025: 0.95 }), 2025)).toBe('stable')
  })
  it('null uten tall for siste år eller for få basisår', () => {
    expect(classifyTrend(years({ 2021: 1, 2022: 1, 2023: 1, 2024: 1 }), 2025)).toBeNull()
    expect(classifyTrend(years({ 2022: 1, 2025: 2 }), 2025)).toBeNull()
  })
})

describe('transformSsbNames', () => {
  const years = ['2020', '2021', '2022', '2023', '2024', '2025']
  const data = stat([
    { code: '1VILDE', label: 'Vilde', counts: [100, 100, 100, 100, 130, 130] },
    { code: '1INGRID', label: 'Ingrid', counts: [90, 90, 90, 90, 90, 90] },
    { code: '2VILDE', label: 'Vilde', counts: [null, null, null, null, null, 5] },
    { code: '2OLAV', label: 'Olav', counts: [50, 50, 50, null, null, null] },
    { code: '3UKJENT', label: 'Ukjent', counts: [1, 1, 1, 1, 1, 1] },
  ], years)

  const res = transformSsbNames(data)
  const find = (name: string, gender: string) => res.names.find((n) => n.name === name && n.gender === gender)!

  it('skiller kjønn på koden og beholder samme navn i begge kjønn', () => {
    expect(find('Vilde', 'girl').latestCount).toBe(130)
    expect(find('Vilde', 'boy').latestCount).toBe(5)
    expect(res.names.some((n) => n.name === 'Ukjent')).toBe(false)
  })

  it('finner siste år og rangerer per kjønn og år', () => {
    expect(res.latestYear).toBe(2025)
    expect(find('Vilde', 'girl').latestRank).toBe(1)
    expect(find('Ingrid', 'girl').latestRank).toBe(2)
    expect(find('Vilde', 'boy').latestRank).toBe(1)
  })

  it('håndterer navn uten data siste år: bruker siste registrerte år og gir ingen trend', () => {
    const olav = find('Olav', 'boy')
    expect(olav.latestYear).toBe(2022)
    expect(olav.trend).toBeNull()
    expect(olav.timeless).toBe(false)
  })

  it('utleder trend fra andel og hopper over null-verdier i statistikken', () => {
    expect(find('Vilde', 'girl').trend).toBe('rising')
    expect(find('Ingrid', 'girl').trend).toBe('stable')
    expect(res.stats.filter((s) => s.name === 'Olav')).toHaveLength(3)
  })

  it('teller bare bokstaver i navnelengde', () => {
    const d = stat([{ code: '1ANNE_MARI', label: 'Anne-Mari', counts: [10, 10, 10, 10, 10, 10] }], years)
    expect(transformSsbNames(d).names[0].letters).toBe(8)
  })

  it('feiler tydelig på uventet struktur og tomt svar', () => {
    expect(() => transformSsbNames({ ...data, id: ['A', 'B', 'C'] })).toThrow(/Uventet SSB-struktur/)
    const empty = stat([{ code: '1X', label: 'X', counts: [null, null, null, null, null, null] }], years)
    expect(() => transformSsbNames(empty)).toThrow(/ingen navnedata/)
  })
})
