import { describe, it, expect, vi, beforeEach } from 'vitest'

type AuthCb = (event: string, session: { user: { id: string; tag: string } } | null) => void

const onAuthStateChange = vi.fn((_cb: AuthCb) => ({ data: { subscription: { unsubscribe: vi.fn() } } }))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: { user: { id: 'u1', tag: 'a' } } } })),
      onAuthStateChange: (cb: AuthCb) => onAuthStateChange(cb),
    },
  },
}))

async function freshStore() {
  vi.resetModules()
  onAuthStateChange.mockClear()
  return (await import('../useAuthStore')).useAuthStore
}

describe('useAuthStore.initialize', () => {
  beforeEach(() => {
    onAuthStateChange.mockClear()
  })

  it('registrerer onAuthStateChange bare én gang selv om initialize kalles flere ganger', async () => {
    const store = await freshStore()
    await store.getState().initialize()
    await store.getState().initialize()
    expect(onAuthStateChange).toHaveBeenCalledTimes(1)
  })

  it('beholder user-referansen når samme bruker får ny session (token-refresh)', async () => {
    const store = await freshStore()
    await store.getState().initialize()
    const before = store.getState().user
    const cb = onAuthStateChange.mock.calls[0][0]

    cb('TOKEN_REFRESHED', { user: { id: 'u1', tag: 'b' } })
    expect(store.getState().user).toBe(before)
    expect(store.getState().session).not.toBeNull()
  })

  it('oppdaterer user ved USER_UPDATED og ved brukerbytte/utlogging', async () => {
    const store = await freshStore()
    await store.getState().initialize()
    const cb = onAuthStateChange.mock.calls[0][0]

    cb('USER_UPDATED', { user: { id: 'u1', tag: 'c' } })
    expect((store.getState().user as unknown as { tag: string }).tag).toBe('c')

    cb('SIGNED_IN', { user: { id: 'u2', tag: 'd' } })
    expect(store.getState().user?.id).toBe('u2')

    cb('SIGNED_OUT', null)
    expect(store.getState().user).toBeNull()
  })
})
