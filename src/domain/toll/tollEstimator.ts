/**
 * Bompengeestimering for bilkalkulatoren.
 *
 * V1: manuell beregning fra brukerens egne tall (passeringer, pris, dager,
 * rabatt). Strukturen er lagt opp slik at en rutebasert estimator (start-/
 * sluttadresse → distanse og bomkostnad via et eksternt API) kan plugges inn
 * senere uten å endre kalkulatoren — implementer da TollEstimator-interfacet
 * og bytt kilde i UI.
 *
 * TODO(fremtid): RouteBasedTollEstimator mot et egnet og lovlig rute-/bom-API
 * (f.eks. offentlige bompengedata). Krever API-nøkkel og avklart bruksvilkår —
 * ikke hardkod noe eksternt API her uten det.
 */

import { WEEKS_PER_MONTH } from '@/config/carCost.config'

export interface TollInputs {
  enabled: boolean
  /** Antall bompasseringer per kjøredag (tur/retur = typisk 2) */
  passesPerDay: number
  /** Pris per passering i kr */
  pricePerPass: number
  /** Antall kjøredager per uke */
  daysPerWeek: number
  /** Rabatt i prosent (bombrikke gir typisk 20 % på de fleste anlegg) */
  discountPct: number
}

/** Felles interface slik at en rutebasert estimator kan plugges inn senere */
export interface TollEstimator {
  monthlyCost(inputs: TollInputs): number
}

/** Manuell estimator — ren beregning fra brukerens egne tall */
export const manualTollEstimator: TollEstimator = {
  monthlyCost(inputs: TollInputs): number {
    if (!inputs.enabled) return 0
    const perWeek = inputs.passesPerDay * inputs.pricePerPass * inputs.daysPerWeek
    const discounted = perWeek * (1 - Math.min(100, Math.max(0, inputs.discountPct)) / 100)
    return Math.round(discounted * WEEKS_PER_MONTH)
  },
}
