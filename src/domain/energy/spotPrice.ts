/**
 * Dagens spotpris fra hvakosterstrommen.no — gratis, åpent API uten nøkkel.
 * Attribusjonskravet deres («Strømpriser levert av Hva koster strømmen.no»)
 * oppfylles i UI der prisen brukes.
 *
 * Kalles fra nettleseren (API-et støtter CORS); domenet må stå i CSP
 * connect-src (vercel.json).
 */

export const SPOT_ZONES = ['NO1', 'NO2', 'NO3', 'NO4', 'NO5'] as const
export type SpotZone = (typeof SPOT_ZONES)[number]

export const SPOT_ZONE_LABELS: Record<SpotZone, string> = {
  NO1: 'NO1 Østlandet',
  NO2: 'NO2 Sørlandet',
  NO3: 'NO3 Midt-Norge',
  NO4: 'NO4 Nord-Norge',
  NO5: 'NO5 Vestlandet',
}

/**
 * Grovt estimat for nettleiens energiledd + påslag oppå spot (kr/kWh).
 * Reell hjemmepris = spot + nettleie + påslag − ev. strømstøtte; dette er
 * et forenklet påslag, merket som estimat i UI.
 */
export const GRID_FEE_ESTIMATE = 0.5

interface HourPrice {
  NOK_per_kWh: number
}

/** Snittet av dagens timepriser (spot, uten nettleie) i kr/kWh, eller null ved feil */
export async function fetchTodaysAverageSpotPrice(zone: SpotZone): Promise<number | null> {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  try {
    const res = await fetch(
      `https://www.hvakosterstrommen.no/api/v1/prices/${year}/${month}-${day}_${zone}.json`
    )
    if (!res.ok) return null
    const hours = (await res.json()) as HourPrice[]
    if (!Array.isArray(hours) || hours.length === 0) return null
    const avg = hours.reduce((s, h) => s + h.NOK_per_kWh, 0) / hours.length
    return Number.isFinite(avg) ? avg : null
  } catch {
    return null
  }
}
