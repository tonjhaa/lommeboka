import { lengthBucket, type LengthBucket } from './filters'
import type { MatchRow, NameRow, Vote } from './types'

export interface OwnStats {
  rated: number
  yes: number
  maybe: number
  no: number
  matches: number
  /** matcher / egne ja — null uten ja-stemmer */
  matchRate: number | null
  /** Snitt av SSB-rang (siste år) for matchene; null hvis ingen har rang */
  avgMatchRank: number | null
  matchGender: { girl: number; boy: number }
  /** Egne ja fordelt på navnelengde */
  yesLength: Record<LengthBucket, number>
  /** Andel av egne ja / egne vurderte som er topp 100 siste år — null uten grunnlag */
  yesTop100Share: number | null
  ratedTop100Share: number | null
}

const isTop100 = (n: NameRow, latestYear: number) => n.latestYear === latestYear && n.latestRank !== null && n.latestRank <= 100

export function computeOwnStats(
  names: readonly NameRow[],
  votes: ReadonlyMap<string, Vote>,
  matches: readonly MatchRow[],
  latestYear: number,
): OwnStats {
  const byId = new Map(names.map((n) => [n.id, n]))
  const s: OwnStats = {
    rated: 0, yes: 0, maybe: 0, no: 0, matches: 0, matchRate: null, avgMatchRank: null,
    matchGender: { girl: 0, boy: 0 }, yesLength: { short: 0, medium: 0, long: 0 },
    yesTop100Share: null, ratedTop100Share: null,
  }
  let yesTop = 0
  let ratedTop = 0
  for (const [id, vote] of votes) {
    const n = byId.get(id)
    if (!n) continue
    s.rated++
    s[vote]++
    const top = isTop100(n, latestYear)
    if (top) ratedTop++
    if (vote === 'yes') {
      s.yesLength[lengthBucket(n.letters)]++
      if (top) yesTop++
    }
  }
  const ranks: number[] = []
  for (const m of matches) {
    const n = byId.get(m.nameId)
    if (!n) continue
    s.matches++
    s.matchGender[n.gender]++
    if (n.latestYear === latestYear && n.latestRank !== null) ranks.push(n.latestRank)
  }
  s.matchRate = s.yes > 0 ? s.matches / s.yes : null
  s.avgMatchRank = ranks.length > 0 ? ranks.reduce((a, b) => a + b, 0) / ranks.length : null
  s.yesTop100Share = s.yes > 0 ? yesTop / s.yes : null
  s.ratedTop100Share = s.rated > 0 ? ratedTop / s.rated : null
  return s
}
