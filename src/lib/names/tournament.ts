// Finalen: utslagsturnering per bruker.
// Hver runde parres navnene to og to (oddetall: siste navn får walkover). Vinnerne går videre; de som
// taper i samme runde får SAMME plassering (delt) — vi finner aldri på en rangering mellom navn som
// ikke har møtt hverandre. Plassering for en gruppe = antall som gikk videre + 1.

export interface Tournament {
  seed: number
  /** Navn som fortsatt er med i denne runden */
  remaining: string[]
  round: number
  pairs: Array<[string, string]>
  pairIndex: number
  /** Går videre til neste runde (inkl. walkover) */
  winners: string[]
  losers: string[]
  /** Ferdig avgjorte grupper: plassering delt av alle i gruppen */
  placed: Array<{ rank: number; ids: string[] }>
  champion: string | null
}

export interface FinalRank { id: string; rank: number }

function hash(seed: number, id: string): number {
  let h = 2166136261 ^ seed
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function beginRound(remaining: string[], round: number, seed: number, placed: Tournament['placed']): Tournament {
  // Ny parring per runde, men deterministisk gitt (seed, runde, id)
  const order = [...remaining].sort((a, b) => hash(seed + round, a) - hash(seed + round, b) || a.localeCompare(b))
  const pairs: Array<[string, string]> = []
  for (let i = 0; i + 1 < order.length; i += 2) pairs.push([order[i], order[i + 1]])
  const bye = order.length % 2 === 1 ? [order[order.length - 1]] : []
  return { seed, remaining: order, round, pairs, pairIndex: 0, winners: [...bye], losers: [], placed, champion: null }
}

export function startTournament(ids: readonly string[], seed: number): Tournament {
  const unique = [...new Set(ids)]
  if (unique.length === 0) throw new Error('Finalen trenger minst ett navn')
  if (unique.length === 1) {
    return { seed, remaining: unique, round: 1, pairs: [], pairIndex: 0, winners: [], losers: [], placed: [], champion: unique[0] }
  }
  return beginRound(unique, 1, seed, [])
}

export function isDone(t: Tournament): boolean {
  return t.champion !== null
}

export function currentPair(t: Tournament): [string, string] | null {
  return isDone(t) ? null : t.pairs[t.pairIndex] ?? null
}

/** Antall avgjorte oppgjør / totalt antall oppgjør (n - 1). */
export function progress(t: Tournament, totalNames: number): { played: number; total: number } {
  const total = Math.max(totalNames - 1, 0)
  const eliminated = t.placed.reduce((s, g) => s + g.ids.length, 0) + t.losers.length
  return { played: Math.min(eliminated, total), total }
}

/** Registrerer valget i gjeldende oppgjør. Returnerer ny tilstand (ren funksjon). */
export function pick(t: Tournament, winnerId: string): Tournament {
  const pair = currentPair(t)
  if (!pair) throw new Error('Finalen er allerede ferdig')
  if (winnerId !== pair[0] && winnerId !== pair[1]) throw new Error('Valgt navn er ikke med i dette oppgjøret')
  const loser = winnerId === pair[0] ? pair[1] : pair[0]
  const next: Tournament = { ...t, winners: [...t.winners, winnerId], losers: [...t.losers, loser], pairIndex: t.pairIndex + 1 }
  if (next.pairIndex < next.pairs.length) return next

  // Runden er ferdig: taperne får delt plassering rett etter de som går videre
  const placed = next.losers.length > 0
    ? [...next.placed, { rank: next.winners.length + 1, ids: next.losers }]
    : next.placed
  if (next.winners.length === 1) return { ...next, placed, remaining: next.winners, pairs: [], winners: [], losers: [], champion: next.winners[0] }
  return beginRound(next.winners, next.round + 1, next.seed, placed)
}

/** Endelig rangering; bare gyldig når turneringen er ferdig. */
export function finalRanking(t: Tournament): FinalRank[] {
  if (!isDone(t)) throw new Error('Finalen er ikke ferdig')
  const out: FinalRank[] = [{ id: t.champion as string, rank: 1 }]
  for (const g of t.placed) for (const id of g.ids) out.push({ id, rank: g.rank })
  return out.sort((a, b) => a.rank - b.rank)
}
