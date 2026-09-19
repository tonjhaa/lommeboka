import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import * as api from '@/lib/names/api'
import { DEFAULT_FILTERS, type NameFilters } from '@/lib/names/filters'
import { NOTE_MAX_LENGTH, type MatchNote, type MatchRow, type NameRow, type SyncInfo, type Vote } from '@/lib/names/types'

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
  notes: MatchNote[]
  /** Matcher brukeren har sett, per bruker-id (lagres lokalt) */
  seenMatchIds: Record<string, string[]>
  /** Etternavn til navnekombinasjoner — lagres bare i denne nettleseren */
  surname: string
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
  /** Lett innlasting av bare matcher (uten navnelisten), slik at «ny match»-markering virker fra alle sider */
  loadMatchIndicator: (userId: string, partnershipId: string) => Promise<void>
  markMatchesSeen: (ids?: string[]) => void
  refreshNotes: () => Promise<void>
  saveNote: (nameId: string, text: string) => Promise<void>
  setSurname: (surname: string) => void
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

/** Antall matcher brukeren ikke har sett ennå. */
export const selectUnseenMatchCount = (s: Pick<NavnejaktState, 'userId' | 'matches' | 'seenMatchIds'>): number => {
  if (!s.userId) return 0
  const seen = new Set(s.seenMatchIds[s.userId] ?? [])
  return s.matches.filter((m) => !seen.has(m.id)).length
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
        notes: [],
        seenMatchIds: {},
        surname: '',
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
            const [names, votes, matches, favorites, syncInfo, notes] = await Promise.all([
              api.fetchNames(),
              api.fetchMyVotes(),
              partnershipId ? api.fetchMatches() : Promise.resolve([] as MatchRow[]),
              api.fetchFavorites(),
              api.fetchSyncInfo(),
              partnershipId ? api.fetchNotes().catch(() => [] as MatchNote[]) : Promise.resolve([] as MatchNote[]),
            ])
            const latestYear = names.reduce((y, n) => Math.max(y, n.latestYear), syncInfo?.latestYear ?? 0)
            set({
              status: 'ready', names, namesById: new Map(names.map((n) => [n.id, n])), latestYear,
              votes, matches, notes, favorites, syncInfo, history: [],
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
            votes: new Map(), matches: [], notes: [], favorites: new Set(), syncInfo: null, history: [], celebrate: null, _unsubscribe: null,
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

        dismissCelebrate: () => {
          const c = get().celebrate
          set({ celebrate: null })
          const match = c ? get().matches.find((m) => m.nameId === c.id) : undefined
          if (match) get().markMatchesSeen([match.id])
        },

        loadMatchIndicator: async (userId, partnershipId) => {
          const s = get()
          if (s.status === 'ready' || s.status === 'loading') return
          set({ userId, partnershipId })
          try {
            const matches = await api.fetchMatches()
            if (get().status === 'idle') set({ matches })
            if (!get()._unsubscribe && get().status === 'idle') {
              set({ _unsubscribe: api.subscribeToNameMatches(partnershipId, () => { void loadMatches().catch(() => undefined) }) })
            }
          } catch {
            // Indikatoren er valgfri — feil her skal ikke forstyrre resten av appen
          }
        },

        markMatchesSeen: (ids) => set((s) => {
          if (!s.userId) return {}
          const seen = new Set(s.seenMatchIds[s.userId] ?? [])
          const before = seen.size
          for (const id of ids ?? s.matches.map((m) => m.id)) seen.add(id)
          if (seen.size === before) return {}
          const current = new Set(s.matches.map((m) => m.id))
          return { seenMatchIds: { ...s.seenMatchIds, [s.userId]: [...seen].filter((id) => current.has(id)) } }
        }),

        refreshNotes: async () => {
          if (!get().partnershipId) return
          try { set({ notes: await api.fetchNotes() }) } catch { /* notater er sekundære */ }
        },

        saveNote: async (nameId, text) => {
          const { userId, partnershipId, notes } = get()
          if (!userId || !partnershipId) return
          const trimmed = text.trim().slice(0, NOTE_MAX_LENGTH)
          const others = notes.filter((n) => !(n.nameId === nameId && n.userId === userId))
          set({
            notes: trimmed
              ? [...others, { nameId, userId, note: trimmed, updatedAt: new Date().toISOString() }]
              : others,
          })
          try {
            if (trimmed) await api.saveNote(partnershipId, userId, nameId, trimmed)
            else await api.deleteNote(partnershipId, userId, nameId)
          } catch (err) {
            set({ notes, error: `Kunne ikke lagre notatet: ${err instanceof Error ? err.message : String(err)}` })
          }
        },

        setSurname: (surname) => set({ surname: surname.slice(0, 60) }),

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
      partialize: (s) => ({ filters: s.filters, seed: s.seed, seenMatchIds: s.seenMatchIds, surname: s.surname }),
    },
  ),
)
