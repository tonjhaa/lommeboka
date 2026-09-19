import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

interface FakeChannel {
  on: (...args: unknown[]) => FakeChannel
  subscribe: (cb: (status: string) => void) => FakeChannel
  _statusCb?: (status: string) => void
  _onPayload?: (payload: unknown) => void
}

const channelInstances: FakeChannel[] = []

function makeFakeChannel(): FakeChannel {
  const fake: FakeChannel = {
    on: vi.fn((...args: unknown[]) => { fake._onPayload = args[2] as (payload: unknown) => void; return fake }),
    subscribe: vi.fn((cb: (status: string) => void) => { fake._statusCb = cb; return fake }),
  }
  channelInstances.push(fake)
  return fake
}

const channelMock = vi.fn((..._args: unknown[]) => makeFakeChannel())
const removeChannelMock = vi.fn()
const captureMessageMock = vi.fn()
const addBreadcrumbMock = vi.fn()

vi.mock('@/lib/supabase', () => ({
  supabase: {
    channel: (...args: unknown[]) => channelMock(...args),
    removeChannel: (...args: unknown[]) => removeChannelMock(...args),
  },
}))

vi.mock('@sentry/react', () => ({
  captureMessage: (...args: unknown[]) => captureMessageMock(...args),
  addBreadcrumb: (...args: unknown[]) => addBreadcrumbMock(...args),
}))

import { subscribeToSharedData } from '../sharedData'

describe('subscribeToSharedData — delt kanal per partnerskap', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    channelInstances.length = 0
    channelMock.mockClear()
    removeChannelMock.mockClear()
    captureMessageMock.mockClear()
    addBreadcrumbMock.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('bruker én kanal for flere nøkler i samme partnerskap', () => {
    const unsubA = subscribeToSharedData('p1', 'gaver', vi.fn())
    const unsubB = subscribeToSharedData('p1', 'utstyr', vi.fn())
    expect(channelMock).toHaveBeenCalledTimes(1)
    unsubA()
    unsubB()
  })

  it('ruter realtime-rader til riktig nøkkel', () => {
    const gaver = vi.fn()
    const utstyr = vi.fn()
    const unsubA = subscribeToSharedData('p1', 'gaver', gaver)
    const unsubB = subscribeToSharedData('p1', 'utstyr', utstyr)

    channelInstances[0]._onPayload?.({ new: { key: 'gaver', data: { a: 1 } } })
    expect(gaver).toHaveBeenCalledWith({ a: 1 })
    expect(utstyr).not.toHaveBeenCalled()

    unsubA()
    unsubB()
  })

  it('river kanalen først når siste nøkkel avsluttes', () => {
    const unsubA = subscribeToSharedData('p1', 'gaver', vi.fn())
    const unsubB = subscribeToSharedData('p1', 'utstyr', vi.fn())

    unsubA()
    expect(removeChannelMock).not.toHaveBeenCalled()
    unsubB()
    expect(removeChannelMock).toHaveBeenCalledWith(channelInstances[0])
  })

  it('kobler til på nytt etter CHANNEL_ERROR og rapporterer kun første feil i rekken', () => {
    const unsub = subscribeToSharedData('p1', 'gaver', vi.fn())

    channelInstances[0]._statusCb?.('CHANNEL_ERROR')
    vi.advanceTimersByTime(1000)
    expect(channelMock).toHaveBeenCalledTimes(2)

    channelInstances[1]._statusCb?.('TIMED_OUT')
    vi.advanceTimersByTime(2000)
    expect(channelMock).toHaveBeenCalledTimes(3)
    expect(captureMessageMock).toHaveBeenCalledTimes(1)

    // Ny feilrekke etter vellykket tilkobling rapporteres igjen
    channelInstances[2]._statusCb?.('SUBSCRIBED')
    channelInstances[2]._statusCb?.('CHANNEL_ERROR')
    expect(captureMessageMock).toHaveBeenCalledTimes(2)

    unsub()
  })

  it('legger inn breadcrumb ved gjenoppkobling, men ikke ved første tilkobling', () => {
    const unsub = subscribeToSharedData('p1', 'gaver', vi.fn())
    channelInstances[0]._statusCb?.('SUBSCRIBED')
    expect(addBreadcrumbMock).not.toHaveBeenCalled()

    channelInstances[0]._statusCb?.('CHANNEL_ERROR')
    vi.advanceTimersByTime(1000)
    channelInstances[1]._statusCb?.('SUBSCRIBED')

    expect(addBreadcrumbMock).toHaveBeenCalledTimes(1)
    expect(addBreadcrumbMock.mock.calls[0][0]).toMatchObject({
      category: 'realtime',
      data: { attempts: 1, downMs: 1000 },
    })
    unsub()
  })

  it('stopper retry etter unsubscribe', () => {
    const unsub = subscribeToSharedData('p1', 'gaver', vi.fn())
    channelInstances[0]._statusCb?.('TIMED_OUT')
    unsub()
    vi.advanceTimersByTime(30000)
    expect(channelMock).toHaveBeenCalledTimes(1)
  })
})
