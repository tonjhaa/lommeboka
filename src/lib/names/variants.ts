import type { Gender, MatchRow, NameRow, Vote, YearStat } from './types'

// Skrivemåter av samme navn (Pål/Paal, Aleksander/Alexander) slås sammen til én rad. Gruppene beregnes i
// klienten ut fra navnet alene; databasen har fortsatt én rad per skrivemåte. Rader med flere skrivemåter har
// `variants`, og vurderinger/favoritter skrives på alle skrivemåtene, så partnere matcher selv om de velger ulikt.

const ACCENTS: Record<string, string> = {
  é: 'e', è: 'e', ê: 'e', ë: 'e', á: 'a', à: 'a', â: 'a', ä: 'æ', ö: 'ø', ô: 'o', ü: 'y', û: 'u',
  í: 'i', ì: 'i', î: 'i', ó: 'o', ò: 'o', ú: 'u', ù: 'u', ñ: 'n',
}

/**
 * Nøkkel som er lik for skrivemåter som uttales likt: aa=å, ph=f, th=t, ck/c/q=k, x=ks, w=v, y=i, z=s
 * (ikke først i navnet), dobbel bokstav = enkel, og stum h til slutt (Sarah = Sara).
 */
export function variantKey(name: string): string {
  let s = [...name.toLocaleLowerCase('nb')].map((c) => ACCENTS[c] ?? c).join('')
  s = s.replace(/[^\p{L}]/gu, '')
  s = s
    .replace(/chr/g, 'kr')
    .replace(/aa/g, 'å')
    .replace(/ph/g, 'f')
    .replace(/th/g, 't')
    .replace(/ck/g, 'k')
    .replace(/[cq]/g, 'k')
    .replace(/x/g, 'ks')
    .replace(/w/g, 'v')
    .replace(/y/g, 'i')
    .replace(/(?<!^)z/g, 's')
    .replace(/(\p{L})\1/gu, '$1')
    .replace(/([aeiouyæøå])h$/, '$1')
  return s
}

/** Skrivemåtene raden dekker — alltid inkludert raden selv. */
export const variantsOf = (n: NameRow): readonly NameRow[] => n.variants ?? [n]

/** «Også skrevet Paal, Pal» — null når navnet bare har én skrivemåte. */
export function variantLine(n: NameRow): string | null {
  const others = variantsOf(n).filter((v) => v.id !== n.id)
  return others.length > 0 ? `Også skrevet ${others.map((v) => v.name).join(', ')}` : null
}

/** Konkurranse-rangering (1,2,2,4) på antall, høyest først, innenfor hvert kjønn. */
function rankWithinGender(items: ReadonlyArray<{ id: string; name: string; gender: Gender; count: number }>): Map<string, number> {
  const ranks = new Map<string, number>()
  for (const gender of ['girl', 'boy'] as const) {
    const sorted = items.filter((i) => i.gender === gender)
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'nb'))
    let prevCount: number | null = null
    let prevRank = 0
    sorted.forEach((row, i) => {
      const rank = prevCount !== null && row.count === prevCount ? prevRank : i + 1
      ranks.set(row.id, rank)
      prevCount = row.count
      prevRank = rank
    })
  }
  return ranks
}

/**
 * Slår sammen skrivemåter. Gruppens rad får hovedvarianten (mest brukt siste år) sitt navn og id, summert antall
 * og andel, og rang beregnet på nytt blant gruppene. Trend og toppår følger hovedvarianten.
 * `namesById` peker fra alle skrivemåtenes id-er til gruppens rad.
 */
export function groupVariants(rows: readonly NameRow[], latestYear: number): { names: NameRow[]; namesById: Map<string, NameRow> } {
  const byKey = new Map<string, NameRow[]>()
  for (const r of rows) {
    const key = `${r.gender}|${variantKey(r.name)}`
    const list = byKey.get(key)
    if (list) list.push(r)
    else byKey.set(key, [r])
  }

  const groups: NameRow[] = []
  for (const members of byKey.values()) {
    if (members.length === 1) { groups.push(members[0]); continue }
    const sorted = [...members].sort((a, b) =>
      Number(b.latestYear === latestYear) - Number(a.latestYear === latestYear)
      || b.latestCount - a.latestCount || a.name.localeCompare(b.name, 'nb'))
    const primary = sorted[0]
    const current = sorted.filter((m) => m.latestYear === primary.latestYear)
    const shares = current.map((m) => m.latestShare)
    groups.push({
      ...primary,
      latestCount: current.reduce((s, m) => s + m.latestCount, 0),
      latestShare: shares.some((s) => s === null) ? null : shares.reduce<number>((s, v) => s + (v ?? 0), 0),
      variants: sorted,
    })
  }

  // Rang blant gruppene for siste år (andre navn beholder sin gamle rang, som ikke vises)
  const ranks = rankWithinGender(groups.filter((g) => g.latestYear === latestYear)
    .map((g) => ({ id: g.id, name: g.name, gender: g.gender, count: g.latestCount })))
  const names = groups.map((g) => (ranks.has(g.id) ? { ...g, latestRank: ranks.get(g.id)! } : g))

  const namesById = new Map<string, NameRow>()
  for (const g of names) for (const v of variantsOf(g)) namesById.set(v.id, g)
  return { names, namesById }
}

/** Rang og antall i ett år for hver gruppe, ut fra tallene per skrivemåte. Grupper uten tall det året utelates. */
export function groupYearStats(names: readonly NameRow[], stats: ReadonlyMap<string, YearStat>): Map<string, YearStat> {
  const counts: Array<{ id: string; name: string; gender: Gender; count: number }> = []
  for (const n of names) {
    const count = variantsOf(n).reduce((s, v) => s + (stats.get(v.id)?.count ?? 0), 0)
    if (count > 0) counts.push({ id: n.id, name: n.name, gender: n.gender, count })
  }
  const ranks = rankWithinGender(counts)
  return new Map(counts.map((c) => [c.id, { count: c.count, rank: ranks.get(c.id)! }]))
}

/** Gruppens vurdering = hovedvariantens, ellers første skrivemåte som er vurdert. */
export function groupVotes(names: readonly NameRow[], votes: ReadonlyMap<string, Vote>): Map<string, Vote> {
  const out = new Map<string, Vote>()
  for (const n of names) {
    for (const v of variantsOf(n)) {
      const vote = votes.get(v.id)
      if (vote) { out.set(n.id, vote); break }
    }
  }
  return out
}

/** Gruppen er favoritt hvis en av skrivemåtene er det. */
export function groupFavorites(names: readonly NameRow[], favorites: ReadonlySet<string>): Set<string> {
  const out = new Set<string>()
  for (const n of names) if (variantsOf(n).some((v) => favorites.has(v.id))) out.add(n.id)
  return out
}

/** Én match per gruppe: den eldste, så raden (og notatene på den) ikke bytter når en annen skrivemåte matcher senere. */
export function dedupeMatches(matches: readonly MatchRow[], namesById: ReadonlyMap<string, NameRow>): MatchRow[] {
  const oldest = new Map<string, MatchRow>()
  for (const m of matches) {
    const key = namesById.get(m.nameId)?.id ?? m.nameId
    const cur = oldest.get(key)
    if (!cur || m.matchedAt < cur.matchedAt) oldest.set(key, m)
  }
  const keep = new Set([...oldest.values()].map((m) => m.id))
  return matches.filter((m) => keep.has(m.id))
}
