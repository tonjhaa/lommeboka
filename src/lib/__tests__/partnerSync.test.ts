import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

interface FakeChannel {
  on: (...args: unknown[]) => FakeChannel
  subscribe: (cb: (status: string) => void) => FakeChannel
  _statusCb?: (status: string) => void
}

const channelInstances: FakeChannel[] = []

function makeFakeChannel(): FakeChannel {
  const fake: FakeChannel = {
    on: vi.fn(() => fake),
    subscribe: vi.fn((cb: (status: string) => void) => { fake._statusCb = cb; return fake }),
  }
  channelInstances.push(fake)
  return fake
}

const channelMock = vi.fn((..._args: unknown[]) => makeFakeChannel())
const removeChannelMock = vi.fn()

vi.mock('@/lib/supabase', () => ({
  supabase: {
    channel: (...args: unknown[]) => channelMock(...args),
    removeChannel: (...args: unknown[]) => removeChannelMock(...args),
  },
}))

vi.mock('@sentry/react', () => ({
  captureMessage: vi.fn(),
}))

import { subscribeToPartnerData } from '../partnerSync'

describe('subscribeToPartnerData — reconnect ved CHANNEL_ERROR/TIMED_OUT', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    channelInstances.length = 0
    channelMock.mockClear()
    removeChannelMock.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('oppretter en ny kanal automatisk etter CHANNEL_ERROR', () => {
    const unsub = subscribeToPartnerData('partner-1', vi.fn())
    expect(channelMock).toHaveBeenCalledTimes(1)

    const first = channelInstances[0]
    first._statusCb?.('CHANNEL_ERROR')

    // Gammel kanal fjernes, ny opprettes etter en kort backoff
    expect(removeChannelMock).toHaveBeenCalledWith(first)
    vi.advanceTimersByTime(5000)
    expect(channelMock).toHaveBeenCalledTimes(2)

    unsub()
  })

  it('stopper retry-forsøk etter at unsubscribe er kalt', () => {
    const unsub = subscribeToPartnerData('partner-1', vi.fn())
    const first = channelInstances[0]
    first._statusCb?.('TIMED_OUT')
    unsub()

    vi.advanceTimersByTime(30000)
    expect(channelMock).toHaveBeenCalledTimes(1) // ingen nytt forsøk etter unsubscribe
  })
})
