import type { NameRow, Trend } from './types'

export type PopularityBucket = 'top10' | 'top50' | 'top100' | 'outside100' | 'rare'
export type LengthBucket = 'short' | 'medium' | 'long'
export type TrendFilter = Trend | 'timeless'

export interface NameFilters {
  gender: 'all' | 'girl' | 'boy'
  /** Flervalg innen gruppen = ELLER; tom = ingen begrensning */
  popularity: PopularityBucket[]
  length: LengthBucket[]
  trend: TrendFilter[]
  /** Uten dette vises bare navn med SSB-tall for siste år i tabellen */
  includeOlder: boolean
}

export const DEFAULT_FILTERS: NameFilters = {
  gender: 'all', popularity: [], length: [], trend: [], includeOlder: false,
}

/** «Sjeldne» = rang 250 eller lavere blant samme kjønn siste år, eller ingen registrering siste år. */
export const RARE_RANK_FROM = 250

export const POPULARITY_LABEL: Record<PopularityBucket, string> = {
  top10: 'Topp 10', top50: 'Topp 50', top100: 'Topp 100', outside100: 'Utenfor topp 100', rare: 'Sjeldnere navn',
}
export const LENGTH_LABEL: Record<LengthBucket, string> = {
  short: 'Opptil 4 bokstaver', medium: '5–6 bokstaver', long: '7+ bokstaver',
}
export const TREND_FILTER_LABEL: Record<TrendFilter, string> = {
  rising: 'Økende', falling: 'Synkende', stable: 'Stabile', timeless: 'Tidløse',
}

export function lengthBucket(letters: number): LengthBucket {
  if (letters <= 4) return 'short'
  if (letters <= 6) return 'medium'
  return 'long'
}

function activeRank(n: NameRow, latestYear: number): number | null {
  return n.latestYear === latestYear ? n.latestRank : null
}

function inPopularityBucket(n: NameRow, b: PopularityBucket, latestYear: number): boolean {
  const rank = activeRank(n, latestYear)
  switch (b) {
    case 'top10': return rank !== null && rank <= 10
    case 'top50': return rank !== null && rank <= 50
    case 'top100': return rank !== null && rank <= 100
    case 'outside100': return rank === null || rank > 100
    case 'rare': return rank === null || rank >= RARE_RANK_FROM
  }
}

export function matchesFilters(n: NameRow, f: NameFilters, latestYear: number): boolean {
  if (f.gender !== 'all' && n.gender !== f.gender) return false
  if (!f.includeOlder && n.latestYear !== latestYear) return false
  if (f.popularity.length > 0 && !f.popularity.some((b) => inPopularityBucket(n, b, latestYear))) return false
  if (f.length.length > 0 && !f.length.includes(lengthBucket(n.letters))) return false
  if (f.trend.length > 0 && !f.trend.some((t) => (t === 'timeless' ? n.timeless : n.trend === t))) return false
  return true
}

export function activeFilterCount(f: NameFilters): number {
  return (f.gender !== 'all' ? 1 : 0) + f.popularity.length + f.length.length + f.trend.length + (f.includeOlder ? 1 : 0)
}

export function toggleIn<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}
