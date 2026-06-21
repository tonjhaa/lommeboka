import { describe, it, expect } from 'vitest'
import { resolveScalar, KEY_FIGURE_META, isStale } from '../keyFigureRegistry'
import {
  GRUNNBELOP_NOK, FERIEPENGER_PROSENT, EGENMELDING_KVOTE,
  FOLKETRYGD_OPPTJENINGSSATS, SPK_PAASLAG_SATS_LAV, SPK_PAASLAG_SATS_HOY,
  AFP_OPPTJENINGSSATS, TAK_FOLKETRYGD_G, TAK_SPK_G,
  BSU_MAX_YEARLY, BSU_MAX_TOTAL,
} from '@/config/economy.config'
import type { KeyFigureOverride } from '@/types/economy'

// Hele poenget med registeret: tom override-liste ⇒ resolver == dagens konstant for
// HVERT skalar-nøkkeltall (også de read-only — de bindes også via SCALAR_DEFAULTS).
describe('resolveScalar — konsistens-invariant (tom override ≡ kode-konstant)', () => {
  it('grunnbelop', () => { expect(resolveScalar('grunnbelop', [], 2026)).toBe(GRUNNBELOP_NOK) })
  it('feriepengerProsent', () => { expect(resolveScalar('feriepengerProsent', [], 2026)).toBe(FERIEPENGER_PROSENT) })
  it('egenmeldingKvote', () => { expect(resolveScalar('egenmeldingKvote', [], 2026)).toBe(EGENMELDING_KVOTE) })
  it('folketrygdOpptjeningssats', () => { expect(resolveScalar('folketrygdOpptjeningssats', [], 2026)).toBe(FOLKETRYGD_OPPTJENINGSSATS) })
  it('spkPaaslagLav', () => { expect(resolveScalar('spkPaaslagLav', [], 2026)).toBe(SPK_PAASLAG_SATS_LAV) })
  it('spkPaaslagHoy', () => { expect(resolveScalar('spkPaaslagHoy', [], 2026)).toBe(SPK_PAASLAG_SATS_HOY) })
  it('afpOpptjeningssats', () => { expect(resolveScalar('afpOpptjeningssats', [], 2026)).toBe(AFP_OPPTJENINGSSATS) })
  it('takFolketrygdG', () => { expect(resolveScalar('takFolketrygdG', [], 2026)).toBe(TAK_FOLKETRYGD_G) })
  it('takSpkG', () => { expect(resolveScalar('takSpkG', [], 2026)).toBe(TAK_SPK_G) })
  it('bsuMaxYearly', () => { expect(resolveScalar('bsuMaxYearly', [], 2026)).toBe(BSU_MAX_YEARLY) })
  it('bsuMaxTotal', () => { expect(resolveScalar('bsuMaxTotal', [], 2026)).toBe(BSU_MAX_TOTAL) })
})

describe('resolveScalar — overrides', () => {
  const ov: KeyFigureOverride[] = [
    { key: 'grunnbelop', year: 2026, value: 140_000, verifiedAt: '2026-05-01' },
    { key: 'grunnbelop', year: 2025, value: 130_160, verifiedAt: '2025-05-01' },
  ]
  it('velger nyeste override med year <= forespurt år', () => {
    expect(resolveScalar('grunnbelop', ov, 2026)).toBe(140_000)
    expect(resolveScalar('grunnbelop', ov, 2025)).toBe(130_160)
  })
  it('faller tilbake på kode-default for år før alle overrides', () => {
    expect(resolveScalar('grunnbelop', ov, 2020)).toBe(GRUNNBELOP_NOK)
  })
})

describe('KEY_FIGURE_META', () => {
  it('grunnbelop er editerbar skalar med kilde', () => {
    expect(KEY_FIGURE_META.grunnbelop.editable).toBe(true)
    expect(KEY_FIGURE_META.grunnbelop.kind).toBe('scalar')
    expect(KEY_FIGURE_META.grunnbelop.sourceUrl).toContain('nav.no')
  })
  it('bsuMaxTotal og taxRules er read-only i v1', () => {
    expect(KEY_FIGURE_META.bsuMaxTotal.editable).toBe(false)
    expect(KEY_FIGURE_META.taxRules.editable).toBe(false)
  })
})

describe('isStale', () => {
  it('utdatert når ingen override i år og default eldre enn 12 mnd', () => {
    expect(isStale('grunnbelop', [], new Date('2099-01-01'))).toBe(true)
  })
  it('ikke utdatert når override for inneværende år finnes', () => {
    const ov: KeyFigureOverride[] = [{ key: 'grunnbelop', year: 2026, value: 140_000, verifiedAt: '2026-05-01' }]
    expect(isStale('grunnbelop', ov, new Date('2026-06-01'))).toBe(false)
  })
})
