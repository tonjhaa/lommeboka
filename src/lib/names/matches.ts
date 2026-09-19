import type { MatchRow, NameRow } from './types'

export type MatchSort = 'newest' | 'alpha' | 'popular' | 'rare'

export interface MatchEntry {
  match: MatchRow
  name: NameRow
}

export const MATCH_SORT_LABEL: Record<MatchSort, string> = {
  newest: 'Nyeste først', alpha: 'Alfabetisk', popular: 'Mest populære', rare: 'Minst populære',
}

/** Rang siste år; null (ikke registrert siste år) regnes som minst populær. */
function rankOrInfinity(n: NameRow, latestYear: number): number {
  return n.latestYear === latestYear && n.latestRank !== null ? n.latestRank : Number.POSITIVE_INFINITY
}

export function sortMatches(entries: readonly MatchEntry[], sort: MatchSort, latestYear: number): MatchEntry[] {
  const byName = (a: MatchEntry, b: MatchEntry) => a.name.name.localeCompare(b.name.name, 'nb')
  const list = [...entries]
  switch (sort) {
    case 'newest':
      return list.sort((a, b) => b.match.matchedAt.localeCompare(a.match.matchedAt) || byName(a, b))
    case 'alpha':
      return list.sort(byName)
    case 'popular':
      return list.sort((a, b) => rankOrInfinity(a.name, latestYear) - rankOrInfinity(b.name, latestYear) || byName(a, b))
    case 'rare':
      return list.sort((a, b) => rankOrInfinity(b.name, latestYear) - rankOrInfinity(a.name, latestYear) || byName(a, b))
  }
}
