import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Node har ikke DOM globalt (vitest kjører med environment: 'node' i dette
// prosjektet) — stubber et minimalt document/window med ekte EventTarget
// (tilgjengelig globalt i Node 15+) slik at addEventListener/dispatchEvent
// fungerer som i nettleseren.
type FakeDocument = EventTarget & { visibilityState: 'visible' | 'hidden' }
const fakeDocument = new EventTarget() as FakeDocument
fakeDocument.visibilityState = 'visible'
const fakeWindow = new EventTarget()

const upsertMock = vi.fn(() => Promise.resolve({ error: null }))
const getUserMock = vi.fn(() =>
  Promise.resolve<{ data: { user: { id: string } | null } }>({ data: { user: { id: 'user-1' } } })
)

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: () => getUserMock() },
    from: () => ({ upsert: () => upsertMock() }),
  },
}))

import { useEconomyStore } from '@/application/useEconomyStore'
import { startAutoSync, saveToSupabase, getSyncStatus } from '../syncEconomyData'

describe('startAutoSync', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    upsertMock.mockClear()
    getUserMock.mockClear()
    fakeDocument.visibilityState = 'visible'
    vi.stubGlobal('document', fakeDocument)
    vi.stubGlobal('window', fakeWindow)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('flusher ventende lagring når fanen skjules, i stedet for å vente 3s', async () => {
    const stop = startAutoSync()

    useEconomyStore.getState().setProfile({
      employer: 'forsvaret',
      baseMonthly: 50000,
      fixedAdditions: [],
      lastKnownTaxWithholding: 0,
      extraTaxWithholding: 0,
      housingDeduction: 0,
      pensionPercent: 2,
      unionFee: 0,
      atfEnabled: false,
    })

    // Ingen tid har gått — debounce-timeren (3s) har ikke fyrt ennå.
    expect(upsertMock).not.toHaveBeenCalled()

    // Brukeren bytter fane / lukker den, uten at 3s har gått.
    fakeDocument.visibilityState = 'hidden'
    fakeDocument.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => expect(upsertMock).toHaveBeenCalledTimes(1))

    stop()
  })

  it('lagrer ikke på nytt hvis ingenting var i vente da fanen skjules', async () => {
    const stop = startAutoSync()

    fakeDocument.visibilityState = 'hidden'
    fakeDocument.dispatchEvent(new Event('visibilitychange'))
    await Promise.resolve()

    expect(upsertMock).not.toHaveBeenCalled()
    stop()
  })
})

describe('saveToSupabase', () => {
  beforeEach(() => {
    upsertMock.mockClear()
    getUserMock.mockClear()
    fakeDocument.visibilityState = 'visible'
    vi.stubGlobal('document', fakeDocument)
    vi.stubGlobal('window', fakeWindow)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('kaster feil (i stedet for å stille hoppe over) når økten ikke gir en bruker', async () => {
    // Reproduserer bugen: getUser() kan returnere user:null ved et forbigående
    // nettverksglipp eller en reelt utløpt økt. Før fiksen returnerte funksjonen
    // stille her, og kalleren (startAutoSync) trodde lagringen lyktes.
    getUserMock.mockResolvedValueOnce({ data: { user: null } })
    await expect(saveToSupabase()).rejects.toThrow(/ikke innlogget/i)
    expect(upsertMock).not.toHaveBeenCalled()
  })

  it('viser "error" — ikke "saved" — i synk-status når økten mangler bruker', async () => {
    vi.useFakeTimers()
    getUserMock.mockResolvedValue({ data: { user: null } })
    const stop = startAutoSync()

    useEconomyStore.getState().setProfile({
      employer: 'forsvaret',
      baseMonthly: 50000,
      fixedAdditions: [],
      lastKnownTaxWithholding: 0,
      extraTaxWithholding: 0,
      housingDeduction: 0,
      pensionPercent: 2,
      unionFee: 0,
      atfEnabled: false,
    })

    await vi.advanceTimersByTimeAsync(3000)
    await vi.waitFor(() => expect(getSyncStatus()).toBe('error'))
    expect(upsertMock).not.toHaveBeenCalled()

    stop()
    vi.useRealTimers()
  })
})
