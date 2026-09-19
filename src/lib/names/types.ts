export type Gender = 'girl' | 'boy'
export type Trend = 'rising' | 'stable' | 'falling'
export type Vote = 'no' | 'maybe' | 'yes'

export interface NameRow {
  id: string
  name: string
  gender: Gender
  letters: number
  /** Siste år navnet har SSB-tall for (kan være eldre enn siste år i tabellen) */
  latestYear: number
  latestCount: number
  /** Rang blant samme kjønn i latestYear */
  latestRank: number | null
  latestShare: number | null
  /** null = for lite data til å beregne trend */
  trend: Trend | null
  timeless: boolean
}

export interface NameStat {
  year: number
  count: number
  share: number | null
  rank: number | null
}

export interface MatchRow {
  id: string
  nameId: string
  matchedAt: string
}

export interface SyncInfo {
  syncedAt: string
  latestYear: number | null
  namesCount: number | null
}

export const GENDER_LABEL: Record<Gender, string> = { girl: 'Jentenavn', boy: 'Guttenavn' }
export const GENDER_LABEL_SHORT: Record<Gender, string> = { girl: 'jenter', boy: 'gutter' }
export const TREND_LABEL: Record<Trend, string> = { rising: 'Økende', stable: 'Stabil', falling: 'Synkende' }

export interface MatchNote {
  nameId: string
  userId: string
  note: string
  updatedAt: string
}

export const NOTE_MAX_LENGTH = 280
