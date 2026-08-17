export type BoligsokKilde = 'finn' | 'hjem'
export type BoligsokStatus = 'ny' | 'sett' | 'interessant' | 'avslatt'

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
  status: BoligsokStatus
  notat: string | null
  raw_snippet: string | null
  created_at: string
  updated_at: string
}
