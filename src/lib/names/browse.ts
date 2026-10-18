import type { Gender, NameRow, Vote } from './types'

export type VoteFilter = 'all' | 'unrated' | Vote

export const VOTE_FILTER_LABEL: Record<VoteFilter, string> = {
  all: 'Alle', unrated: 'Ikke vurdert', yes: 'Ja', maybe: 'Kanskje', no: 'Nei',
}

const norm = (s: string) => s.trim().toLocaleLowerCase('nb')

/** Søk blant alle navn, uavhengig av swipe-filtre. Treff på starten av navnet kommer før treff midt i. */
export function searchNames(
  names: readonly NameRow[],
  votes: ReadonlyMap<string, Vote>,
  opts: { query: string; gender: Gender | 'all'; vote: VoteFilter },
): NameRow[] {
  const q = norm(opts.query)
  const rows = names.filter((n) => {
    if (opts.gender !== 'all' && n.gender !== opts.gender) return false
    const v = votes.get(n.id)
    if (opts.vote === 'unrated' ? v !== undefined : opts.vote !== 'all' && v !== opts.vote) return false
    return q === '' || norm(n.name).includes(q)
  })
  const starts = (n: NameRow) => (q !== '' && norm(n.name).startsWith(q) ? 0 : 1)
  return rows.sort((a, b) => starts(a) - starts(b) || a.name.localeCompare(b.name, 'nb') || Number(a.gender === 'boy') - Number(b.gender === 'boy'))
}
