import { describe, it, expect, vi } from 'vitest'
import { loadWithRetry } from '../lazyWithRetry'

function fakeStorage() {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v) },
    removeItem: (k: string) => { m.delete(k) },
    _has: (k: string) => m.has(k),
  }
}

describe('loadWithRetry', () => {
  it('suksess → tømmer vakten (så en senere deploy får nytt forsøk), ingen reload', async () => {
    const storage = fakeStorage()
    storage.setItem('k', '1') // som om et tidligere forsøk hadde satt den
    const reload = vi.fn()
    const mod = await loadWithRetry(async () => ({ default: 'X' }), 'k', storage, reload)
    expect(mod).toEqual({ default: 'X' })
    expect(storage._has('k')).toBe(false) // tømt ved suksess
    expect(reload).not.toHaveBeenCalled()
  })

  it('første feil (vakt ikke satt) → setter vakt og laster siden på nytt én gang', async () => {
    const storage = fakeStorage()
    const reload = vi.fn()
    // ikke await — promiset henger med vilje mens siden "lastes på nytt"
    void loadWithRetry(() => Promise.reject(new Error('chunk borte')), 'k', storage, reload)
    await Promise.resolve()
    await Promise.resolve()
    expect(storage.getItem('k')).toBe('1')
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('andre feil (vakt allerede satt) → kaster videre, ingen ny reload', async () => {
    const storage = fakeStorage()
    storage.setItem('k', '1')
    const reload = vi.fn()
    await expect(
      loadWithRetry(() => Promise.reject(new Error('chunk borte')), 'k', storage, reload),
    ).rejects.toThrow('chunk borte')
    expect(reload).not.toHaveBeenCalled()
  })
})
