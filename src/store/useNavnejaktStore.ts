import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import * as api from '@/lib/names/api'
import { DEFAULT_FILTERS, type NameFilters } from '@/lib/names/filters'
import type { MatchRow, NameRow, SyncInfo, Vote } from '@/lib/names/types'

interface HistoryEntry { nameId: string; prev: Vote | null }

interface NavnejaktState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
  userId: string | null
  partnershipId: string | null
  names: NameRow[]
  namesById: Map<string, NameRow>
  /** Siste år i SSB-tabellen (høyeste latestYear blant navnene) */
  latestYear: number
  votes: Map<string, Vote>
  matches: MatchRow[]
  favorites: Set<string>
  syncInfo: SyncInfo | null
  syncing: boolean
  syncMessage: string | null
  history: HistoryEntry[]
  /** Navnet som skal feires i match-visningen */
  celebrate: NameRow | null
  filters: NameFilters
  seed: number
  _unsubscribe: (() => void) | null

  initialize: (userId: string, partnershipId: string | null) => Promise<void>
  reset: () => void
  vote: (nameId: string, vote: Vote) => Promise<void>
  undo: () => Promise<void>
  dismissCelebrate: () => void
  setFilters: (patch: Partial<NameFilters>) => void
  toggleFavorite: (nameId: string) => Promise<void>
  refreshMatches: () => Promise<void>
  syncFromSsb: () => Promise<void>
  clearError: () => void
}

const HISTORY_LIMIT = 50
/** Navn med en lagring underveis — hindrer dobbelttrykk/duplikate requests for samme navn. */
const inflight = new Set<string>()

function withVote(votes: Map<string, Vote>, nameId: string, vote: Vote | null): Map<string, Vote> {
  const next = new Map(votes)
  if (vote === null) next.delete(nameId)
  else next.set(nameId, vote)
  return next
}

export const useNavnejaktStore = create<NavnejaktState>()(
  persist(
    (set, get) => {
      /** Henter matcher på nytt. Returnerer navn-id-er som er nye siden sist. */
      async function loadMatches(): Promise<string[]> {
        const { partnershipId } = get()
        if (!partnershipId) return []
        const fresh = await api.fetchMatches()
        const known = new Set(get().matches.map((m) => m.nameId))
        const added = fresh.filter((m) => !known.has(m.nameId)).map((m) => m.nameId)
        set({ matches: fresh })
        if (added.length > 0 && get().celebrate === null) {
          const name = get().namesById.get(added[0])
          if (name) set({ celebrate: name })
        }
        return added
      }

      return {
        status: 'idle',
        error: null,
        userId: null,
        partnershipId: null,
        names: [],
        namesById: new Map(),
        latestYear: 0,
        votes: new Map(),
        matches: [],
        favorites: new Set(),
        syncInfo: null,
        syncing: false,
        syncMessage: null,
        history: [],
        celebrate: null,
        filters: DEFAULT_FILTERS,
        seed: 0,
        _unsubscribe: null,

        initialize: async (userId, partnershipId) => {
          const s = get()
          if (s.status === 'ready' && s.userId === userId && s.partnershipId === partnershipId) return
          if (s.status === 'loading') return
          s._unsubscribe?.()
          set({ status: 'loading', error: null, userId, partnershipId, _unsubscribe: null })
          try {
            const [names, votes, matches, favorites, syncInfo] = await Promise.all([
              api.fetchNames(),
              api.fetchMyVotes(),
              partnershipId ? api.fetchMatches() : Promise.resolve([] as MatchRow[]),
              api.fetchFavorites(),
              api.fetchSyncInfo(),
            ])
            const latestYear = names.reduce((y, n) => Math.max(y, n.latestYear), syncInfo?.latestYear ?? 0)
            set({
              status: 'ready', names, namesById: new Map(names.map((n) => [n.id, n])), latestYear,
              votes, matches, favorites, syncInfo, history: [],
              seed: get().seed || Math.floor(Math.random() * 2 ** 31),
            })
            if (partnershipId) {
              set({ _unsubscribe: api.subscribeToNameMatches(partnershipId, () => { void loadMatches().catch(() => undefined) }) })
            }
          } catch (err) {
            set({ status: 'error', error: err instanceof Error ? err.message : String(err) })
          }
        },

        reset: () => {
          get()._unsubscribe?.()
          set({
            status: 'idle', error: null, userId: null, partnershipId: null, names: [], namesById: new Map(), latestYear: 0,
            votes: new Map(), matches: [], favorites: new Set(), syncInfo: null, history: [], celebrate: null, _unsubscribe: null,
          })
        },

        vote: async (nameId, vote) => {
          const { userId, votes, partnershipId } = get()
          if (!userId || inflight.has(nameId)) return
          const prev = votes.get(nameId) ?? null
          if (prev === vote) return
          inflight.add(nameId)
          set((s) => ({
            votes: withVote(s.votes, nameId, vote),
            history: [...s.history, { nameId, prev }].slice(-HISTORY_LIMIT),
          }))
          try {
            await api.upsertVote(userId, nameId, vote)
            if (partnershipId && (vote === 'yes' || prev === 'yes')) await loadMatches()
          } catch (err) {
            set((s) => ({
              votes: withVote(s.votes, nameId, prev),
              history: s.history.filter((h, i) => !(i === s.history.length - 1 && h.nameId === nameId)),
              error: `Kunne ikke lagre vurderingen: ${err instanceof Error ? err.message : String(err)}`,
            }))
          } finally {
            inflight.delete(nameId)
          }
        },

        undo: async () => {
          const { userId, history } = get()
          const last = history[history.length - 1]
          if (!userId || !last || inflight.has(last.nameId)) return
          inflight.add(last.nameId)
          const current = get().votes.get(last.nameId) ?? null
          set((s) => ({ votes: withVote(s.votes, last.nameId, last.prev), history: s.history.slice(0, -1) }))
          try {
            if (last.prev === null) await api.deleteVote(userId, last.nameId)
            else await api.upsertVote(userId, last.nameId, last.prev)
            if (get().partnershipId && (current === 'yes' || last.prev === 'yes')) await loadMatches()
          } catch (err) {
            set((s) => ({
              votes: withVote(s.votes, last.nameId, current),
              history: [...s.history, last],
              error: `Kunne ikke angre: ${err instanceof Error ? err.message : String(err)}`,
            }))
          } finally {
            inflight.delete(last.nameId)
          }
        },

        dismissCelebrate: () => set({ celebrate: null }),

        setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),

        toggleFavorite: async (nameId) => {
          const { userId, favorites } = get()
          if (!userId) return
          const makeFavorite = !favorites.has(nameId)
          const next = new Set(favorites)
          if (makeFavorite) next.add(nameId)
          else next.delete(nameId)
          set({ favorites: next })
          try {
            await api.setFavorite(userId, nameId, makeFavorite)
          } catch (err) {
            set({ favorites, error: `Kunne ikke lagre favoritt: ${err instanceof Error ? err.message : String(err)}` })
          }
        },

        refreshMatches: async () => { await loadMatches() },

        syncFromSsb: async () => {
          if (get().syncing) return
          set({ syncing: true, syncMessage: null })
          try {
            const res = await api.invokeSsbSync()
            set({ syncMessage: res.message })
            if (res.ok) {
              // Last navnedata på nytt uten å røre stemmer/matcher
              const [names, syncInfo] = await Promise.all([api.fetchNames(), api.fetchSyncInfo()])
              const latestYear = names.reduce((y, n) => Math.max(y, n.latestYear), syncInfo?.latestYear ?? 0)
              set({ names, namesById: new Map(names.map((n) => [n.id, n])), latestYear, syncInfo })
            }
          } catch (err) {
            set({ syncMessage: `Synkronisering feilet: ${err instanceof Error ? err.message : String(err)}` })
          } finally {
            set({ syncing: false })
          }
        },

        clearError: () => set({ error: null }),
      }
    },
    {
      name: 'lommeboka-navnejakt-v1',
      version: 1,
      partialize: (s) => ({ filters: s.filters, seed: s.seed }),
    },
  ),
)
