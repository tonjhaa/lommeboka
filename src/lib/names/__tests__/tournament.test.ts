import { describe, it, expect } from 'vitest'
import { startTournament, currentPair, pick, isDone, finalRanking, progress, type Tournament } from '../tournament'

/** Spiller turneringen ferdig; `prefer` avgjør vinneren (lavest indeks i rekkefølgen vinner). */
function play(t: Tournament, order: string[]): Tournament {
  let cur = t
  let guard = 0
  while (!isDone(cur)) {
    const pair = currentPair(cur)!
    cur = pick(cur, order.indexOf(pair[0]) < order.indexOf(pair[1]) ? pair[0] : pair[1])
    if (++guard > 1000) throw new Error('uendelig løkke')
  }
  return cur
}

const ids = (n: number) => Array.from({ length: n }, (_, i) => `n${i + 1}`)

describe('Finalen', () => {
  it('rangerer alle navn nøyaktig én gang, med best i førsteplass', () => {
    for (const n of [2, 3, 4, 5, 7, 8, 12, 13]) {
      const order = ids(n)
      const done = play(startTournament(order, 42), order)
      const ranking = finalRanking(done)
      expect(ranking.map((r) => r.id).sort()).toEqual([...order].sort())
      expect(ranking[0]).toEqual({ id: 'n1', rank: 1 })
      expect(done.champion).toBe('n1')
    }
  })

  it('gir delt plassering til de som taper i samme runde (12 navn → 1,2,3,4×3,7×6)', () => {
    const order = ids(12)
    const ranks = finalRanking(play(startTournament(order, 3), order)).map((r) => r.rank)
    expect(ranks).toEqual([1, 2, 3, 4, 4, 4, 7, 7, 7, 7, 7, 7])
  })

  it('spiller n-1 oppgjør (walkover teller ikke)', () => {
    const order = ids(9)
    let t = startTournament(order, 5)
    let played = 0
    while (!isDone(t)) {
      const pair = currentPair(t)!
      t = pick(t, order.indexOf(pair[0]) < order.indexOf(pair[1]) ? pair[0] : pair[1])
      played++
    }
    expect(played).toBe(8)
    expect(progress(t, 9)).toEqual({ played: 8, total: 8 })
  })

  it('er deterministisk gitt seed og valg', () => {
    const order = ids(6)
    expect(startTournament(order, 9)).toEqual(startTournament(order, 9))
    expect(currentPair(startTournament(order, 1))).not.toEqual(currentPair(startTournament(order, 2)))
  })

  it('walkover ved oddetall: ingen faller ut uten å ha tapt', () => {
    const t = startTournament(ids(5), 1)
    expect(t.pairs).toHaveLength(2)
    expect(t.winners).toHaveLength(1)
  })

  it('avviser ugyldige valg og valg etter ferdig turnering', () => {
    const t = startTournament(ids(4), 1)
    expect(() => pick(t, 'finnes-ikke')).toThrow(/ikke med/)
    const done = play(t, ids(4))
    expect(() => pick(done, 'n1')).toThrow(/ferdig/)
    expect(() => finalRanking(startTournament(ids(4), 1))).toThrow(/ikke ferdig/)
  })

  it('håndterer ett navn og fjerner duplikater', () => {
    const one = startTournament(['x', 'x'], 1)
    expect(isDone(one)).toBe(true)
    expect(finalRanking(one)).toEqual([{ id: 'x', rank: 1 }])
    expect(() => startTournament([], 1)).toThrow()
  })
})
