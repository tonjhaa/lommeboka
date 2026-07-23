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

import { subscribeToSharedProject } from '../sharedProject'

describe('subscribeToSharedProject — reconnect ved CHANNEL_ERROR/TIMED_OUT', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    channelInstances.length = 0
    channelMock.mockClear()
    removeChannelMock.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('fjerner død kanal og oppretter en ny automatisk etter CHANNEL_ERROR', () => {
    const unsub = subscribeToSharedProject('p1', vi.fn(), vi.fn(), vi.fn())
    expect(channelMock).toHaveBeenCalledTimes(1)

    const first = channelInstances[0]
    first._statusCb?.('CHANNEL_ERROR')

    expect(removeChannelMock).toHaveBeenCalledWith(first)
    vi.advanceTimersByTime(5000)
    expect(channelMock).toHaveBeenCalledTimes(2)

    unsub()
  })

  it('stopper retry-forsøk etter at unsubscribe er kalt', () => {
    const unsub = subscribeToSharedProject('p1', vi.fn(), vi.fn(), vi.fn())
    const first = channelInstances[0]
    first._statusCb?.('TIMED_OUT')
    unsub()

    vi.advanceTimersByTime(30000)
    expect(channelMock).toHaveBeenCalledTimes(1)
  })
})
