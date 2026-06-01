// src/types/permisjon.ts

export type Dekningsgrad = 80 | 100

export interface FerieBlokk {
  fra: string   // "YYYY-MM-DD"
  til: string   // "YYYY-MM-DD"
  label?: string
}

export type PeriodeType =
  | 'mor_før_termin'        // obligatorisk 3 uker
  | 'mor_obligatorisk'      // obligatorisk 6 uker etter fødsel
  | 'mor_kvote'             // resterende mødrekvote (fleksibel)
  | 'far_kvote'             // fedrekvote / medmorkvote
  | 'felles_mor'            // fellesperiode tatt av mor
  | 'felles_far'            // fellesperiode tatt av far (krever mor i aktivitet)
  | 'ferie_pause'           // ferie-pause (forskyver perioden)

export interface PermisjonPeriode {
  id: string
  type: PeriodeType
  owner: 'meg' | 'partner'
  fra: string               // "YYYY-MM-DD"
  til: string               // "YYYY-MM-DD"
  gradertProsent?: number   // 0–100, 0 = ikke gradert
  erPause?: boolean         // ferie-pause, telles ikke mot kvoten
}

export interface PermisjonInput {
  morErMeg: boolean               // true = jeg er mor (fødende), false = jeg er medmor/far
  terminDato: string              // "YYYY-MM-DD"
  fodselsDato?: string            // settes hvis allerede født
  dekningsgrad: Dekningsgrad
  tvillinger: boolean
  forTidligFodsel: boolean        // født < uke 33
  mineFerieblokker: FerieBlokk[] // ferie for den som bruker appen
  partnerErLærer: boolean
  partnerFerieblokker: FerieBlokk[]  // typisk sommer-ferie
  partnerSommerFraManedDag: string   // default "06-22"
  partnerSommerTilManedDag: string   // default "08-14"
  fellesTilMor?: number | null       // antall uker av fellesperioden mor tar (null = 50/50)
  minMaanedslonn?: number            // brutto månedslønn (meg) — brukes til 6G-beregning
  partnerMaanedslonn?: number        // brutto månedslønn (partner)
}

export interface TilgjengeligeUker {
  forTermin: number       // FORELDREPENGER_FØR_FØDSEL — separat konto (ikke del av mødrekvote)
  mødrekvote: number      // MØDREKVOTE_DAGER etter fødsel (15 uker ved 100%)
  fedrekvote: number      // FEDREKVOTE_DAGER (15 uker ved 100%)
  farRundtFodsel: number  // FAR_DAGER_RUNDT_FØDSEL = 2 uker (delpott av fedrekvote)
  fellesperiode: number   // FELLESPERIODE_DAGER (16 uker ved 100%)
  total: number           // sum av alle kontoer inkl. forTermin
  totalMor: number        // forTermin + mødrekvote + fellesperiode
  totalPartner: number    // fedrekvote + fellesperiode
  obligatorisk: { forTermin: number; etterFodsel: number }
  ekstraFlerbarns: number
  ekstraForTidlig: number
}

export interface PlanValidering {
  ok: boolean
  advarsler: string[]
  feil: string[]
}

export interface PermisjonOppsummering {
  barnehageStart: string
  dekkerTilBarnehageStart: boolean
  sluttdatoMeg: string | null
  sluttdatoPartner: string | null
  ukerdBruktMeg: number
  ukerBruktPartner: number
  ukerIgjenMeg: number
  ukerIgjenPartner: number
  partnerUkerISommerFerie: number
  validering: PlanValidering
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}
