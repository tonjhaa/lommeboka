import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchKeyFigure, isFetchable } from '../keyFigureFetchService'

function mockFetchOnce(status: number, body: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }))
}

afterEach(() => { vi.unstubAllGlobals() })

describe('isFetchable', () => {
  it('grunnbelop har auto-hent-kilde', () => { expect(isFetchable('grunnbelop')).toBe(true) })
  it('feriepengerProsent har ikke', () => { expect(isFetchable('feriepengerProsent')).toBe(false) })
})

describe('fetchKeyFigure(grunnbelop)', () => {
  it('gyldig NAV-respons → normalisert med år utledet fra dato', async () => {
    mockFetchOnce(200, { grunnbeloep: 136549, dato: '2026-05-01' })
    const r = await fetchKeyFigure('grunnbelop')
    expect(r).toEqual({
      key: 'grunnbelop', value: 136549, effectiveDate: '2026-05-01',
      effectiveYear: 2026, source: 'g.nav.no/api/v1/grunnbeloep',
    })
  })

  it('manglende grunnbeloep → error, ingen verdi', async () => {
    mockFetchOnce(200, { dato: '2026-05-01' })
    const r = await fetchKeyFigure('grunnbelop')
    expect('error' in r).toBe(true)
  })

  it('feil type grunnbeloep → error', async () => {
    mockFetchOnce(200, { grunnbeloep: 'mye', dato: '2026-05-01' })
    expect('error' in (await fetchKeyFigure('grunnbelop'))).toBe(true)
  })

  it('ugyldig dato-form → error', async () => {
    mockFetchOnce(200, { grunnbeloep: 136549, dato: '01.05.2026' })
    expect('error' in (await fetchKeyFigure('grunnbelop'))).toBe(true)
  })

  it('ikke-200 → error', async () => {
    mockFetchOnce(502, {})
    expect('error' in (await fetchKeyFigure('grunnbelop'))).toBe(true)
  })

  it('fetch kaster (nettverk/timeout) → error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))
    expect('error' in (await fetchKeyFigure('grunnbelop'))).toBe(true)
  })

  it('ukjent key → error uten å kalle fetch', async () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    // @ts-expect-error bevisst ugyldig key
    const r = await fetchKeyFigure('finnesikke')
    expect('error' in r).toBe(true)
    expect(f).not.toHaveBeenCalled()
  })
})
