import type { Gender, NameRow, Vote, YearStat } from './types'

export type VoteFilter = 'all' | 'unrated' | Vote

export const VOTE_FILTER_LABEL: Record<VoteFilter, string> = {
  all: 'Alle', unrated: 'Ikke vurdert', yes: 'Ja', maybe: 'Kanskje', no: 'Nei',
}

export type SortKey = 'alpha' | 'alphaDesc' | 'popular' | 'shortest' | 'longest'

export const SORT_LABEL: Record<SortKey, string> = {
  alpha: 'A–Å', alphaDesc: 'Å–A', popular: 'Mest populære', shortest: 'Kortest først', longest: 'Lengst først',
}

const norm = (s: string) => s.trim().toLocaleLowerCase('nb')

/**
 * Søk blant alle navn, uavhengig av swipe-filtre. Ved A–Å kommer treff på starten av navnet før treff midt i.
 * «Mest populære» sorterer på rang siste år, eller i `yearStats` (valgt år) når den er gitt;
 * navn uten tall for året havner sist.
 */
export function searchNames(
  names: readonly NameRow[],
  votes: ReadonlyMap<string, Vote>,
  opts: { query: string; gender: Gender | 'all'; vote: VoteFilter; sort?: SortKey; latestYear?: number; yearStats?: ReadonlyMap<string, YearStat> },
): NameRow[] {
  const q = norm(opts.query)
  const rows = names.filter((n) => {
    if (opts.gender !== 'all' && n.gender !== opts.gender) return false
    const v = votes.get(n.id)
    if (opts.vote === 'unrated' ? v !== undefined : opts.vote !== 'all' && v !== opts.vote) return false
    return q === '' || norm(n.name).includes(q)
  })
  const alpha = (a: NameRow, b: NameRow) =>
    a.name.localeCompare(b.name, 'nb') || Number(a.gender === 'boy') - Number(b.gender === 'boy')
  const rank = (n: NameRow) => {
    if (opts.yearStats) return opts.yearStats.get(n.id)?.rank ?? Infinity
    return n.latestYear === opts.latestYear && n.latestRank !== null ? n.latestRank : Infinity
  }
  switch (opts.sort ?? 'alpha') {
    case 'alphaDesc': return rows.sort((a, b) => alpha(b, a))
    case 'popular': return rows.sort((a, b) => (rank(a) === rank(b) ? alpha(a, b) : rank(a) - rank(b)))
    case 'shortest': return rows.sort((a, b) => a.letters - b.letters || alpha(a, b))
    case 'longest': return rows.sort((a, b) => b.letters - a.letters || alpha(a, b))
    default: {
      const starts = (n: NameRow) => (q !== '' && norm(n.name).startsWith(q) ? 0 : 1)
      return rows.sort((a, b) => starts(a) - starts(b) || alpha(a, b))
    }
  }
}
