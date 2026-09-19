import { matchesFilters, type NameFilters } from './filters'
import type { NameRow, Vote } from './types'

/** Rask deterministisk 32-bit-hash (FNV-1a) — gir stabil «tilfeldig» rekkefølge per seed. */
function hash(seed: number, id: string): number {
  let h = 2166136261 ^ seed
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * Bunken brukeren skal swipe: filtrerte navn brukeren ikke har vurdert ennå.
 * Rekkefølgen avhenger av (seed, navn-id), ikke av posisjon — så den forblir stabil når
 * vurderte navn forsvinner fra bunken eller siden lastes på nytt.
 */
export function buildDeck(
  names: readonly NameRow[],
  votes: ReadonlyMap<string, Vote>,
  filters: NameFilters,
  latestYear: number,
  seed: number,
): NameRow[] {
  return names
    .filter((n) => !votes.has(n.id) && matchesFilters(n, filters, latestYear))
    .sort((a, b) => hash(seed, a.id) - hash(seed, b.id) || a.id.localeCompare(b.id))
}
