import type { NameRow, Trend } from './types'

export type PopularityBucket = 'top10' | 'top50' | 'top100' | 'outside100' | 'rare'
export type LengthBucket = 'short' | 'medium' | 'long'
/** Tiåret toppåret ligger i; 1960 = «før 1970», 2020 = «2020-tallet» */
export type PeakBucket = 'to1969' | '1970' | '1980' | '1990' | '2000' | '2010' | '2020'
export type SyllableBucket = '1' | '2' | '3' | '4plus'
export type TrendFilter = Trend | 'timeless'

/** Filtre som bare avhenger av selve navnet (ikke av SSB-tall), og som også brukes i «Alle navn». */
export interface AttributeFilters {
  /** Forbokstaver (små bokstaver); flervalg = ELLER, tom = ingen begrensning */
  letters: string[]
  length: LengthBucket[]
  syllables: SyllableBucket[]
}

export interface NameFilters extends AttributeFilters {
  gender: 'all' | 'girl' | 'boy'
  /** Flervalg innen gruppen = ELLER; tom = ingen begrensning */
  popularity: PopularityBucket[]
  trend: TrendFilter[]
  /** Tiåret navnet var mest populært i */
  peak: PeakBucket[]
  /** Uten dette vises bare navn med SSB-tall for siste år i tabellen */
  includeOlder: boolean
}

export const DEFAULT_ATTRIBUTE_FILTERS: AttributeFilters = { letters: [], length: [], syllables: [] }

export const DEFAULT_FILTERS: NameFilters = {
  gender: 'all', popularity: [], trend: [], peak: [], includeOlder: false, ...DEFAULT_ATTRIBUTE_FILTERS,
}

/** «Sjeldne» = rang 250 eller lavere blant samme kjønn siste år, eller ingen registrering siste år. */
export const RARE_RANK_FROM = 250

export const POPULARITY_LABEL: Record<PopularityBucket, string> = {
  top10: 'Topp 10', top50: 'Topp 50', top100: 'Topp 100', outside100: 'Utenfor topp 100', rare: 'Sjeldnere navn',
}
export const LENGTH_LABEL: Record<LengthBucket, string> = {
  short: 'Opptil 4 bokstaver', medium: '5–6 bokstaver', long: '7+ bokstaver',
}
export const SYLLABLE_LABEL: Record<SyllableBucket, string> = {
  '1': '1 stavelse', '2': '2 stavelser', '3': '3 stavelser', '4plus': '4 eller flere',
}
export const TREND_FILTER_LABEL: Record<TrendFilter, string> = {
  rising: 'På vei opp', falling: 'Dalende', stable: 'Stabile', timeless: 'Tidløse',
}
export const PEAK_LABEL: Record<PeakBucket, string> = {
  to1969: 'Før 1970', '1970': '1970-tallet', '1980': '1980-tallet', '1990': '1990-tallet',
  '2000': '2000-tallet', '2010': '2010-tallet', '2020': '2020-tallet',
}

export function peakBucket(peakYear: number): PeakBucket {
  return peakYear < 1970 ? 'to1969' : (String(Math.floor(peakYear / 10) * 10) as PeakBucket)
}

export function lengthBucket(letters: number): LengthBucket {
  if (letters <= 4) return 'short'
  if (letters <= 6) return 'medium'
  return 'long'
}

const VOWELS = /[aeiouyæøåáàäéèêëíóòôöúü]/
/** Vokalgrupper som uttales som én lyd. */
const DIPHTHONGS = new Set(['ei', 'øy', 'au', 'ey', 'ai', 'oi', 'ui'])

/**
 * Omtrentlig antall stavelser: hver vokalgruppe er én stavelse, bortsett fra diftonger (Eirik = 2);
 * andre vokalrekker deles (Noah = 2, Maria = 3). Heuristikk — ikke fasit for sjeldne navn.
 */
export function syllableCount(name: string): number {
  const runs = name.toLocaleLowerCase('nb').split(/[^\p{L}]+/u).flatMap((word) => {
    const out: string[] = []
    let run = ''
    for (const ch of word) {
      if (VOWELS.test(ch)) run += ch
      else if (run) { out.push(run); run = '' }
    }
    if (run) out.push(run)
    return out
  })
  const count = runs.reduce((sum, r) => sum + (r.length === 1 || DIPHTHONGS.has(r) ? 1 : r.length), 0)
  return Math.max(1, count)
}

export function syllableBucket(name: string): SyllableBucket {
  const n = syllableCount(name)
  return n >= 4 ? '4plus' : (String(n) as SyllableBucket)
}

export function firstLetter(name: string): string {
  return [...name.trim().toLocaleLowerCase('nb')][0] ?? ''
}

/** Forbokstavene som finnes i listen, alfabetisk på norsk (æ, ø, å sist). */
export function availableLetters(names: readonly { name: string }[]): string[] {
  return [...new Set(names.map((n) => firstLetter(n.name)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'nb'))
}

export function matchesAttributes(n: { name: string; letters: number }, f: AttributeFilters): boolean {
  if (f.letters.length > 0 && !f.letters.includes(firstLetter(n.name))) return false
  if (f.length.length > 0 && !f.length.includes(lengthBucket(n.letters))) return false
  if (f.syllables.length > 0 && !f.syllables.includes(syllableBucket(n.name))) return false
  return true
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
  if (!matchesAttributes(n, f)) return false
  if (f.peak.length > 0 && (n.peakYear === null || !f.peak.includes(peakBucket(n.peakYear)))) return false
  if (f.trend.length > 0 && !f.trend.some((t) => (t === 'timeless' ? n.timeless : n.trend === t))) return false
  return true
}

export function activeFilterCount(f: NameFilters): number {
  return (f.gender !== 'all' ? 1 : 0) + f.popularity.length + f.length.length + f.letters.length + f.syllables.length
    + f.trend.length + f.peak.length + (f.includeOlder ? 1 : 0)
}

export function toggleIn<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}
