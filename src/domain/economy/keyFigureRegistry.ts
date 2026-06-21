// ============================================================
// NØKKELTALL-REGISTER — defaults i kode, override-overlay, ren resolver
// Tom override ⇒ resolver returnerer eksakt dagens kode-konstant.
// ============================================================

import type { KeyFigureKey, KeyFigureMeta, KeyFigureOverride } from '@/types/economy'
import {
  GRUNNBELOP_NOK, FERIEPENGER_PROSENT, EGENMELDING_KVOTE,
  FOLKETRYGD_OPPTJENINGSSATS, SPK_PAASLAG_SATS_LAV, SPK_PAASLAG_SATS_HOY,
  AFP_OPPTJENINGSSATS, TAK_FOLKETRYGD_G, TAK_SPK_G,
  BSU_MAX_YEARLY, BSU_MAX_TOTAL, DELINGSTALL_BASELINE,
} from '@/config/economy.config'

/** Kode-default per skalar nøkkeltall (samme verdi som resten av appen bruker i dag). */
const SCALAR_DEFAULTS: Record<string, number> = {
  grunnbelop: GRUNNBELOP_NOK,
  feriepengerProsent: FERIEPENGER_PROSENT,
  egenmeldingKvote: EGENMELDING_KVOTE,
  folketrygdOpptjeningssats: FOLKETRYGD_OPPTJENINGSSATS,
  spkPaaslagLav: SPK_PAASLAG_SATS_LAV,
  spkPaaslagHoy: SPK_PAASLAG_SATS_HOY,
  afpOpptjeningssats: AFP_OPPTJENINGSSATS,
  takFolketrygdG: TAK_FOLKETRYGD_G,
  takSpkG: TAK_SPK_G,
  bsuMaxYearly: BSU_MAX_YEARLY,
  bsuMaxTotal: BSU_MAX_TOTAL,
}

export const KEY_FIGURE_META: Record<KeyFigureKey, KeyFigureMeta> = {
  grunnbelop: { key: 'grunnbelop', label: 'Grunnbeløp (G)', group: 'pensjon', unit: 'kr', kind: 'scalar', editable: true, sourceUrl: 'https://www.nav.no/grunnbelopet', defaultVerifiedAt: '2026-06-20' },
  feriepengerProsent: { key: 'feriepengerProsent', label: 'Feriepengesats', group: 'feriepenger', unit: 'pst', kind: 'scalar', editable: true, sourceUrl: 'https://www.skatteetaten.no', defaultVerifiedAt: '2026-06-16' },
  egenmeldingKvote: { key: 'egenmeldingKvote', label: 'Egenmeldingsdager (kvote)', group: 'fravaer', unit: 'antall', kind: 'scalar', editable: true, sourceUrl: 'https://www.nav.no', defaultVerifiedAt: '2026-06-16' },
  folketrygdOpptjeningssats: { key: 'folketrygdOpptjeningssats', label: 'Folketrygd opptjeningssats', group: 'pensjon', unit: 'pst', kind: 'scalar', editable: true, sourceUrl: 'https://www.nav.no/alderspensjon', defaultVerifiedAt: '2026-06-18' },
  spkPaaslagLav: { key: 'spkPaaslagLav', label: 'SPK påslag (grunnsats)', group: 'pensjon', unit: 'pst', kind: 'scalar', editable: true, sourceUrl: 'https://www.spk.no', defaultVerifiedAt: '2026-06-18' },
  spkPaaslagHoy: { key: 'spkPaaslagHoy', label: 'SPK påslag (tilleggssats)', group: 'pensjon', unit: 'pst', kind: 'scalar', editable: true, sourceUrl: 'https://www.spk.no', defaultVerifiedAt: '2026-06-18' },
  afpOpptjeningssats: { key: 'afpOpptjeningssats', label: 'AFP opptjeningssats', group: 'pensjon', unit: 'pst', kind: 'scalar', editable: true, sourceUrl: 'https://www.nav.no/afp', defaultVerifiedAt: '2026-06-18' },
  takFolketrygdG: { key: 'takFolketrygdG', label: 'Inntektstak folketrygd (G)', group: 'pensjon', unit: 'G', kind: 'scalar', editable: true, sourceUrl: 'https://www.nav.no/alderspensjon', defaultVerifiedAt: '2026-06-18' },
  takSpkG: { key: 'takSpkG', label: 'Inntektstak SPK (G)', group: 'pensjon', unit: 'G', kind: 'scalar', editable: true, sourceUrl: 'https://www.spk.no', defaultVerifiedAt: '2026-06-18' },
  delingstall: { key: 'delingstall', label: 'Delingstall (per uttaksalder)', group: 'pensjon', unit: 'tabell', kind: 'table', editable: true, sourceUrl: 'https://www.nav.no/alderspensjon', defaultVerifiedAt: '2026-06-19' },
  bsuMaxYearly: { key: 'bsuMaxYearly', label: 'BSU maks/år', group: 'sparing', unit: 'kr', kind: 'scalar', editable: false, sourceUrl: 'https://www.skatteetaten.no', defaultVerifiedAt: '2026-06-16' },
  bsuMaxTotal: { key: 'bsuMaxTotal', label: 'BSU maks totalt', group: 'sparing', unit: 'kr', kind: 'scalar', editable: false, sourceUrl: 'https://www.skatteetaten.no', defaultVerifiedAt: '2026-06-16' },
  taxRules: { key: 'taxRules', label: 'Skattetrinn & satser', group: 'skatt', unit: 'tabell', kind: 'table', editable: false, sourceUrl: 'https://www.skatteetaten.no', defaultVerifiedAt: '2026-06-16' },
}

/** Nyeste override med year <= forespurt år, ellers kode-default. */
export function resolveScalar(key: KeyFigureKey, overrides: KeyFigureOverride[], year: number): number {
  const candidates = overrides
    .filter((o) => o.key === key && o.year <= year && typeof o.value === 'number')
    .sort((a, b) => b.year - a.year)
  if (candidates.length > 0) return candidates[0].value as number
  return SCALAR_DEFAULTS[key] ?? 0
}

/** Delingstall-tabell: nyeste override <= år, ellers kode-default. */
export function resolveDelingstall(overrides: KeyFigureOverride[], year: number): Record<number, number> {
  const candidates = overrides
    .filter((o) => o.key === 'delingstall' && o.year <= year && typeof o.value === 'object')
    .sort((a, b) => b.year - a.year)
  if (candidates.length > 0) return candidates[0].value as Record<number, number>
  return DELINGSTALL_BASELINE
}

const STALE_MONTHS = 12

/** Utdatert: ingen override for inneværende år OG default eldre enn STALE_MONTHS. */
export function isStale(key: KeyFigureKey, overrides: KeyFigureOverride[], now: Date = new Date()): boolean {
  const year = now.getFullYear()
  const hasCurrent = overrides.some((o) => o.key === key && o.year === year)
  if (hasCurrent) return false
  const verified = new Date(KEY_FIGURE_META[key].defaultVerifiedAt)
  const ageMonths = (now.getTime() - verified.getTime()) / (1000 * 60 * 60 * 24 * 30)
  return ageMonths > STALE_MONTHS
}
