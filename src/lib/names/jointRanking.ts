import type { FinalRank } from './tournament'

export interface JointEntry {
  id: string
  rankA: number
  rankB: number
  /** Gjennomsnittsplass (midrank) hos hver bruker — delte plasseringer regnes som snittet av plassene de deler */
  posA: number
  posB: number
  /** Sum av posisjonene; lavere er bedre. Begge brukere veier likt. */
  score: number
  jointRank: number
  /** true når minst ett annet navn har nøyaktig samme score (delt plassering — ingen tie-breaker) */
  tied: boolean
}

/** Delte plasseringer (rank 4 delt av 3 navn) tar plassene 4,5,6 → midrank 5. */
function midranks(ranking: readonly FinalRank[]): Map<string, { rank: number; pos: number }> {
  const sizeByRank = new Map<number, number>()
  for (const r of ranking) sizeByRank.set(r.rank, (sizeByRank.get(r.rank) ?? 0) + 1)
  return new Map(ranking.map((r) => [r.id, { rank: r.rank, pos: r.rank + ((sizeByRank.get(r.rank) as number) - 1) / 2 }]))
}

/**
 * Felles resultatliste (Borda/midrank): hvert navn får sum av begge brukeres posisjon. Ingen bruker
 * veier tyngre, og navn med lik sum står likt (samme felles plassering) i stedet for å avgjøres vilkårlig.
 * Rekkefølgen innenfor en delt plassering er alfabetisk KUN for visning — `tied` flagger at de står likt.
 */
export function combineRankings(a: readonly FinalRank[], b: readonly FinalRank[], nameOf?: (id: string) => string): JointEntry[] {
  const ma = midranks(a)
  const mb = midranks(b)
  const ids = [...ma.keys()].filter((id) => mb.has(id))
  const rows = ids.map((id) => {
    const ra = ma.get(id)!
    const rb = mb.get(id)!
    return { id, rankA: ra.rank, rankB: rb.rank, posA: ra.pos, posB: rb.pos, score: ra.pos + rb.pos }
  })
  const label = (id: string) => (nameOf ? nameOf(id) : id)
  rows.sort((x, y) => x.score - y.score || label(x.id).localeCompare(label(y.id), 'nb'))

  const scoreCount = new Map<number, number>()
  for (const r of rows) scoreCount.set(r.score, (scoreCount.get(r.score) ?? 0) + 1)

  let prevScore: number | null = null
  let prevRank = 0
  return rows.map((r, i) => {
    const jointRank = prevScore !== null && r.score === prevScore ? prevRank : i + 1
    prevScore = r.score
    prevRank = jointRank
    return { ...r, jointRank, tied: (scoreCount.get(r.score) as number) > 1 }
  })
}
