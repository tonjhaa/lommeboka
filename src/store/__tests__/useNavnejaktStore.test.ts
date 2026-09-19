import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { MatchRow, NameRow, Vote } from '@/lib/names/types'

const api = vi.hoisted(() => ({
  fetchNames: vi.fn(), fetchMyVotes: vi.fn(), fetchMatches: vi.fn(), fetchFavorites: vi.fn(), fetchSyncInfo: vi.fn(),
  upsertVote: vi.fn(), deleteVote: vi.fn(), setFavorite: vi.fn(), invokeSsbSync: vi.fn(), subscribeToNameMatches: vi.fn(),
}))
vi.mock('@/lib/names/api', () => api)

import { useNavnejaktStore } from '../useNavnejaktStore'

const name = (id: string): NameRow => ({
  id, name: id, gender: 'girl', letters: 5, latestYear: 2025, latestCount: 100, latestRank: 10, latestShare: 0.4, trend: 'stable', timeless: false,
})

async function init(opts: { votes?: Array<[string, Vote]>; matches?: MatchRow[]; partnershipId?: string | null } = {}) {
  useNavnejaktStore.getState().reset()
  api.fetchNames.mockResolvedValue([name('a'), name('b'), name('c')])
  api.fetchMyVotes.mockResolvedValue(new Map(opts.votes ?? []))
  api.fetchMatches.mockResolvedValue(opts.matches ?? [])
  api.fetchFavorites.mockResolvedValue(new Set())
  api.fetchSyncInfo.mockResolvedValue({ syncedAt: '2026-01-01', latestYear: 2025, namesCount: 3 })
  api.subscribeToNameMatches.mockReturnValue(() => undefined)
  await useNavnejaktStore.getState().initialize('u1', opts.partnershipId === undefined ? 'p1' : opts.partnershipId)
}

const s = () => useNavnejaktStore.getState()

describe('useNavnejaktStore', () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset())
    api.upsertVote.mockResolvedValue(undefined)
    api.deleteVote.mockResolvedValue(undefined)
  })

  it('laster egne stemmer fra serveren slik at et refresh midt i swipe fortsetter der man slapp', async () => {
    await init({ votes: [['a', 'yes'], ['b', 'no']] })
    expect(s().status).toBe('ready')
    expect(s().votes.get('a')).toBe('yes')
    expect(s().latestYear).toBe(2025)
  })

  it('lagrer vurderingen optimistisk og sender den til databasen', async () => {
    await init()
    await s().vote('a', 'no')
    expect(s().votes.get('a')).toBe('no')
    expect(api.upsertVote).toHaveBeenCalledWith('u1', 'a', 'no')
  })

  it('ruller tilbake og viser feil hvis lagringen feiler', async () => {
    await init()
    api.upsertVote.mockRejectedValueOnce(new Error('nettverk'))
    await s().vote('a', 'yes')
    expect(s().votes.has('a')).toBe(false)
    expect(s().history).toHaveLength(0)
    expect(s().error).toMatch(/nettverk/)
  })

  it('ignorerer duplikate stemmer på samme navn mens en lagring pågår, og lik verdi', async () => {
    await init()
    let release!: () => void
    api.upsertVote.mockImplementationOnce(() => new Promise<void>((r) => { release = r }))
    const first = s().vote('a', 'yes')
    await s().vote('a', 'no') // ignoreres: a er allerede under lagring
    release()
    await first
    expect(api.upsertVote).toHaveBeenCalledTimes(1)
    expect(s().votes.get('a')).toBe('yes')
    await s().vote('a', 'yes') // samme verdi: ingen ny request
    expect(api.upsertVote).toHaveBeenCalledTimes(1)
  })

  it('viser match når databasen har opprettet en etter «ja»', async () => {
    await init()
    api.fetchMatches.mockResolvedValueOnce([{ id: 'm1', nameId: 'a', matchedAt: '2026-09-19' }])
    await s().vote('a', 'yes')
    expect(s().matches).toHaveLength(1)
    expect(s().celebrate?.id).toBe('a')
  })

  it('viser ingen match (og ikke partnerens stemme) når partneren ikke har sagt ja', async () => {
    await init()
    api.fetchMatches.mockResolvedValue([])
    await s().vote('a', 'yes')
    expect(s().matches).toHaveLength(0)
    expect(s().celebrate).toBeNull()
  })

  it('kanskje → ja kan utløse match på vanlig måte', async () => {
    await init({ votes: [['a', 'maybe']] })
    api.fetchMatches.mockResolvedValueOnce([{ id: 'm1', nameId: 'a', matchedAt: '2026-09-19' }])
    await s().vote('a', 'yes')
    expect(s().votes.get('a')).toBe('yes')
    expect(s().celebrate?.id).toBe('a')
  })

  it('henter matcher på nytt når «ja» trekkes tilbake, så matchen forsvinner', async () => {
    await init({ votes: [['a', 'yes']], matches: [{ id: 'm1', nameId: 'a', matchedAt: '2026-09-19' }] })
    api.fetchMatches.mockResolvedValueOnce([])
    await s().vote('a', 'no')
    expect(s().matches).toHaveLength(0)
  })

  it('spør ikke etter matcher uten partnerskap', async () => {
    await init({ partnershipId: null })
    api.fetchMatches.mockClear()
    await s().vote('a', 'yes')
    expect(api.fetchMatches).not.toHaveBeenCalled()
  })

  it('angre gjenoppretter forrige verdi, og sletter stemmen hvis navnet ikke var vurdert før', async () => {
    await init({ votes: [['b', 'maybe']] })
    await s().vote('a', 'no')
    await s().undo()
    expect(s().votes.has('a')).toBe(false)
    expect(api.deleteVote).toHaveBeenCalledWith('u1', 'a')

    await s().vote('b', 'yes')
    await s().undo()
    expect(s().votes.get('b')).toBe('maybe')
    expect(api.upsertVote).toHaveBeenLastCalledWith('u1', 'b', 'maybe')
  })

  it('oppdaterer navnedata etter vellykket SSB-synk uten å røre stemmer', async () => {
    await init({ votes: [['a', 'yes']] })
    api.invokeSsbSync.mockResolvedValue({ ok: true, message: 'Hentet' })
    api.fetchNames.mockResolvedValue([name('a'), name('b'), name('c'), name('d')])
    await s().syncFromSsb()
    expect(s().names).toHaveLength(4)
    expect(s().votes.get('a')).toBe('yes')
    expect(s().syncMessage).toBe('Hentet')
  })

  it('beholder navnedata og viser melding når SSB-synk feiler', async () => {
    await init()
    api.invokeSsbSync.mockResolvedValue({ ok: false, message: 'SSB svarte 500' })
    await s().syncFromSsb()
    expect(s().names).toHaveLength(3)
    expect(s().syncMessage).toBe('SSB svarte 500')
    expect(s().syncing).toBe(false)
  })
})
