// ============================================================
// AUTO-HENT — henter ferske nøkkeltall fra offentlig kilde via serverless-proxy.
// All validering/normalisering (robusthet mot formatendring) ligger her og er
// enhetstestet. Ved enhver tvil returneres { error } — aldri en upålitelig verdi.
// ============================================================

import type { KeyFigureKey } from '@/types/economy'

export interface FetchedKeyFigure {
  key: KeyFigureKey
  value: number
  effectiveDate: string   // "YYYY-MM-DD" fra kilden
  effectiveYear: number   // utledet av effectiveDate (virkningsår)
  source: string
}

export type FetchKeyFigureResult = FetchedKeyFigure | { error: string }

/** Per-key normalisering av rå kilde-JSON. null = uventet form (ikke skriv). */
const FETCH_SOURCES: Partial<Record<KeyFigureKey, {
  sourceLabel: string
  normalize: (json: unknown) => { value: number; effectiveDate: string } | null
}>> = {
  grunnbelop: {
    sourceLabel: 'g.nav.no/api/v1/grunnbeloep',
    normalize: (j) => {
      const o = j as { grunnbeloep?: unknown; dato?: unknown }
      if (typeof o.grunnbeloep !== 'number' || !isFinite(o.grunnbeloep) || o.grunnbeloep <= 0) return null
      if (typeof o.dato !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.dato)) return null
      return { value: o.grunnbeloep, effectiveDate: o.dato }
    },
  },
}

export function isFetchable(key: KeyFigureKey): boolean {
  return key in FETCH_SOURCES
}

export async function fetchKeyFigure(key: KeyFigureKey): Promise<FetchKeyFigureResult> {
  const src = FETCH_SOURCES[key]
  if (!src) return { error: 'Ukjent kilde' }
  try {
    const res = await fetch(`/api/key-figure-source?source=${encodeURIComponent(key)}`, {
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return { error: 'Kunne ikke hente fra NAV nå — prøv igjen senere' }
    const json = await res.json()
    const norm = src.normalize(json)
    if (!norm) return { error: 'Uventet svar fra NAV — sjekk verdien manuelt på nav.no' }
    return {
      key,
      value: norm.value,
      effectiveDate: norm.effectiveDate,
      effectiveYear: parseInt(norm.effectiveDate.slice(0, 4), 10),
      source: src.sourceLabel,
    }
  } catch {
    return { error: 'Kunne ikke hente fra NAV nå — prøv igjen senere' }
  }
}
