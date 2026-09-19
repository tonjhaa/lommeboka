import { describe, it, expect } from 'vitest'
import { combineRankings } from '../jointRanking'

const r = (...pairs: Array<[string, number]>) => pairs.map(([id, rank]) => ({ id, rank }))

describe('combineRankings', () => {
  it('summerer begge brukeres posisjon uten å favorisere noen', () => {
    const a = r(['x', 1], ['y', 2], ['z', 3])
    const b = r(['z', 1], ['y', 2], ['x', 3])
    const joint = combineRankings(a, b)
    // x: 1+3, y: 2+2, z: 3+1 → alle 4: helt likt
    expect(joint.map((e) => e.score)).toEqual([4, 4, 4])
    expect(joint.every((e) => e.jointRank === 1 && e.tied)).toBe(true)
    // symmetri: bytter vi A og B skal resultatet være identisk
    expect(combineRankings(b, a).map((e) => [e.id, e.jointRank])).toEqual(joint.map((e) => [e.id, e.jointRank]))
  })

  it('rangerer etter laveste sum og markerer bare faktiske likhet som delt', () => {
    const a = r(['x', 1], ['y', 2], ['z', 3])
    const b = r(['x', 1], ['z', 2], ['y', 3])
    const joint = combineRankings(a, b)
    expect(joint.map((e) => [e.id, e.jointRank, e.tied])).toEqual([['x', 1, false], ['y', 2, true], ['z', 2, true]])
  })

  it('bruker midrank for delte plasseringer i en persons finale', () => {
    // A: x=1, y og z delt 2 (plasser 2 og 3 → 2,5); B: x=1, y=2, z=3
    const joint = combineRankings(r(['x', 1], ['y', 2], ['z', 2]), r(['x', 1], ['y', 2], ['z', 3]))
    const y = joint.find((e) => e.id === 'y')!
    const z = joint.find((e) => e.id === 'z')!
    expect(y.posA).toBe(2.5)
    expect(y.score).toBe(4.5)
    expect(z.score).toBe(5.5)
    expect(joint.map((e) => e.id)).toEqual(['x', 'y', 'z'])
  })

  it('ser bort fra navn som bare finnes hos én av dem', () => {
    expect(combineRankings(r(['x', 1], ['y', 2]), r(['x', 1])).map((e) => e.id)).toEqual(['x'])
  })

  it('bruker navnene bare til visningsrekkefølge, ikke til å bryte likhet', () => {
    const joint = combineRankings(r(['b', 1], ['a', 2]), r(['a', 1], ['b', 2]), (id) => id)
    expect(joint.map((e) => e.id)).toEqual(['a', 'b'])
    expect(joint.every((e) => e.tied && e.jointRank === 1)).toBe(true)
  })
})
