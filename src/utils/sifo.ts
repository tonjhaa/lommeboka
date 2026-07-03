import type { HouseholdInput, SIFOConfig } from '@/types'

/**
 * Beregner SIFO-referansebudsjettet for en husholdning.
 *
 * SIFO (Statens institutt for forbruksforskning) utgir hvert år et
 * referansebudsjett som dekker mat, klær, hygiene, fritid og kommunikasjon
 * for ulike husstandssammensetninger.
 *
 * MERK: Boutgifter, transport og barnehage er IKKE inkludert i SIFO-budsjettet
 * og legges til separat i betjeningsevneanalysen.
 *
 * Kilde: SIFO rapport 5-2024
 */

/**
 * Estimerer antall barn per aldersgruppe basert på oppgitte inputs.
 * Brukes når detaljert aldersfordeling ikke er oppgitt.
 */
function distributeChildren(household: HouseholdInput): {
  infants: number      // 0-3 år
  age4to6: number      // 4-6 år
  age7to10: number     // 7-10 år
  age11to13: number    // 11-13 år
  age14to17: number    // 14-17 år
} {
  const total = household.children
  if (total === 0) {
    return { infants: 0, age4to6: 0, age7to10: 0, age11to13: 0, age14to17: 0 }
  }

  // Bruk detaljerte data hvis oppgitt
  const infants = household.infantsUnder4 ?? 0
  const mid = household.childrenAge4to10 ?? 0
  const remaining = Math.max(0, total - infants - mid)

  // Fordel mellom 4-6 og 7-10 etter mid-gruppen
  const age4to6 = Math.round(mid * 0.4)
  const age7to10 = mid - age4to6

  // Fordel resten likt mellom 11-13 og 14-17
  const age11to13 = Math.round(remaining * 0.5)
  const age14to17 = remaining - age11to13

  return { infants, age4to6, age7to10, age11to13, age14to17 }
}

/**
 * Beregner månedlige SIFO-utgifter for husstanden.
 * Returnerer NOK per måned.
 */
export function calcSIFOExpenses(household: HouseholdInput, config: SIFOConfig): number {
  const adults = household.adults
  const dist = distributeChildren(household)

  const adultCost = adults * config.adultMonthly
  const childCost =
    dist.infants * config.infantMonthly +
    dist.age4to6 * config.child4to6Monthly +
    dist.age7to10 * config.child7to10Monthly +
    dist.age11to13 * config.child11to13Monthly +
    dist.age14to17 * config.child14to17Monthly

  // Ingen «stordriftsrabatt»: SIFO-satsene er allerede per person, og bankene
  // regner full SIFO i betjeningsevnen. En rabatt her ville gitt et mer
  // optimistisk svar enn banken faktisk gir.
  return Math.round(adultCost + childCost)
}

/**
 * Bryter ned SIFO-utgiftene for visning.
 */
export function calcSIFOBreakdown(
  household: HouseholdInput,
  config: SIFOConfig
): {
  adults: number
  children: number
  discount: number
  total: number
} {
  const adultsCost = household.adults * config.adultMonthly
  const dist = distributeChildren(household)

  const childrenCost =
    dist.infants * config.infantMonthly +
    dist.age4to6 * config.child4to6Monthly +
    dist.age7to10 * config.child7to10Monthly +
    dist.age11to13 * config.child11to13Monthly +
    dist.age14to17 * config.child14to17Monthly

  return {
    adults: adultsCost,
    children: childrenCost,
    // Beholdt i API-et for bakoverkompatibilitet — alltid 0 (se calcSIFOExpenses)
    discount: 0,
    total: Math.round(adultsCost + childrenCost),
  }
}
