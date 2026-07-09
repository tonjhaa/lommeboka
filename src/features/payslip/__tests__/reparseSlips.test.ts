import { describe, it, expect, vi, beforeEach } from 'vitest'

const getUserMock = vi.fn(() => Promise.resolve({ data: { user: { id: 'user-1' } } }))
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getUser: () => getUserMock() } },
}))

const downloadSlipPDFMock = vi.fn((_path: string) => Promise.resolve('data:application/pdf;base64,AAAA'))
vi.mock('@/lib/slipStorage', () => ({
  downloadSlipPDF: (path: string) => downloadSlipPDFMock(path),
  slipPath: (userId: string, year: number, month: number) => `${userId}/${year}-${month}.pdf`,
}))

const parseSlipFromBase64Mock = vi.fn()
vi.mock('../slipParser', () => ({
  parseSlipFromBase64: (b64: string) => parseSlipFromBase64Mock(b64),
}))

import { useEconomyStore } from '@/application/useEconomyStore'
import { reparseAllSlips, SLIP_PARSER_VERSION } from '../reparseSlips'

function slipDataFor(year: number, month: number) {
  return {
    periode: { year, month },
    ansattnummer: '', loennstrinn: 0, maanedslonn: 50000,
    fasteTillegg: [], trekk: [], bruttoSum: 50000, nettoUtbetalt: 40000,
    feriepengegrunnlag: 0, opptjentFerie: 0, skattetrekk: 0, ekstraTrekk: 0,
    husleietrekk: 0, pensjonstrekk: 0, fagforeningskontingent: 0, ouFond: 0,
    gruppelivspremie: 0, hittilBrutto: 0, hittilPensjon: 0, hittilForskuddstrekk: 0,
    tabelltrekkGrunnlag: 0, tabelltrekkBelop: 0,
  }
}

describe('reparseAllSlips — versjonsflagg skal ikke settes ved feil', () => {
  beforeEach(() => {
    getUserMock.mockClear()
    downloadSlipPDFMock.mockClear()
    parseSlipFromBase64Mock.mockReset()
    useEconomyStore.setState({ slipParserVersion: 1, monthHistory: [] })
  })

  it('setter versjonsflagget når alle slipper re-parses uten feil', async () => {
    useEconomyStore.setState({
      monthHistory: [
        { year: 2026, month: 6, source: 'imported_slip', isLocked: true, lines: [], nettoUtbetalt: 0, disposable: 0, slipData: slipDataFor(2026, 6) },
      ],
    })
    parseSlipFromBase64Mock.mockResolvedValue(slipDataFor(2026, 6))

    const result = await reparseAllSlips()

    expect(result.failed).toBe(0)
    expect(result.completed).toBe(true)
    expect(useEconomyStore.getState().slipParserVersion).toBe(SLIP_PARSER_VERSION)
  })

  it('lar versjonsflagget stå IKKE-oppdatert når én slipp feiler å parses — så den prøves på nytt neste økt', async () => {
    // To måneder: juni feiler (f.eks. forbigående nettverksfeil under nedlasting/parsing
    // av PDF-en), juli lykkes. Dette reproduserer bugen: juni-2026-slippen i produksjon
    // manglet feriepenger/ferietrekk/ATF fordi nettopp dette skjedde — og siden brukeren
    // var innlogget ble flagget likevel satt, så juni ble aldri prøvd på nytt.
    useEconomyStore.setState({
      monthHistory: [
        { year: 2026, month: 6, source: 'imported_slip', isLocked: true, lines: [], nettoUtbetalt: 0, disposable: 0, slipData: slipDataFor(2026, 6) },
        { year: 2026, month: 7, source: 'imported_slip', isLocked: true, lines: [], nettoUtbetalt: 0, disposable: 0, slipData: slipDataFor(2026, 7) },
      ],
    })
    parseSlipFromBase64Mock.mockImplementation(async () => {
      throw new Error('nettverksfeil')
    })

    const result = await reparseAllSlips()

    expect(result.failed).toBe(2)
    expect(result.completed).toBe(false)
    expect(useEconomyStore.getState().slipParserVersion).toBe(1) // uendret — prøves på nytt
  })
})
