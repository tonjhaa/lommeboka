export type BoligsokKilde = 'finn' | 'hjem'
export type BoligsokStatus = 'ny' | 'sett' | 'interessant' | 'avslatt'
export type AiAnbefaling = 'anbefales' | 'vurder' | 'neppe'

export interface BoligAnnonse {
  id: string
  user_id: string
  kilde: BoligsokKilde
  ekstern_id: string
  url: string
  tittel: string | null
  adresse: string | null
  bydel: string | null
  prisantydning: number | null
  totalpris: number | null
  fellesutgifter: number | null
  fellesgjeld: number | null
  in_ordning: boolean
  soverom: number | null
  primaerrom_m2: number | null
  bruksareal_m2: number | null
  balkong: boolean
  garasje: boolean
  boligtype: string | null
  byggeaar: number | null
  oppfyller_krav: boolean
  ai_anbefaling: AiAnbefaling
  ai_vurdering: string | null
  aktiv: boolean
  annonsert_dato: string | null
  prisnedgang: boolean
  /** true = kjøkken adskilt/avskjermet fra stue, false = åpent kjøkken-i-stue, null = ikke nevnt/ukjent */
  kjokken_adskilt: boolean | null
  status: BoligsokStatus
  notat: string | null
  raw_snippet: string | null
  created_at: string
  updated_at: string
}

export type BoligsokVisfilter = 'alle' | 'anbefales' | 'vurder'
export type BoligsokKjokkenFilter = 'alle' | 'adskilt' | 'apent'
export type BoligsokKildeFilter = 'alle' | BoligsokKilde
export type BoligsokSortBy =
  | 'anbefaling' | 'nyest' | 'pris_lav' | 'pris_hoy' | 'areal_stor' | 'soverom_mange' | 'fellesutgift_lav'
