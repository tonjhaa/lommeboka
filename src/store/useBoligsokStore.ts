import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase } from '@/lib/supabase'
import type {
  BoligAnnonse, BoligsokStatus,
  BoligsokVisfilter, BoligsokKjokkenFilter, BoligsokKildeFilter, BoligsokSortBy,
} from '@/types/boligsok'

interface BoligsokState {
  annonser: BoligAnnonse[]
  loading: boolean
  error: string | null
  _unsubscribe: (() => void) | null

  fetchAnnonser: () => Promise<void>
  subscribe: () => void
  unsubscribe: () => void
  setStatus: (id: string, status: BoligsokStatus) => Promise<void>
  setNotat: (id: string, notat: string) => Promise<void>
  /** Setter status til 'sett' KUN hvis den fortsatt er 'ny' — overskriver aldri en bevisst brukersatt status */
  markerSett: (id: string) => void

  // UI-filter/sortering — persisteres slik at de overlever fane-bytte/reload
  visFilter: BoligsokVisfilter
  minSoverom: number
  minAreal: number
  maksTotalpris: number
  maksFellesutgift: number
  kjokkenFilter: BoligsokKjokkenFilter
  kildeFilter: BoligsokKildeFilter
  kunGarasje: boolean
  kunBalkong: boolean
  kunPrisnedgang: boolean
  visSolgte: boolean
  sortBy: BoligsokSortBy
  setVisFilter: (v: BoligsokVisfilter) => void
  setMinSoverom: (v: number) => void
  setMinAreal: (v: number) => void
  setMaksTotalpris: (v: number) => void
  setMaksFellesutgift: (v: number) => void
  setKjokkenFilter: (v: BoligsokKjokkenFilter) => void
  setKildeFilter: (v: BoligsokKildeFilter) => void
  setKunGarasje: (v: boolean) => void
  setKunBalkong: (v: boolean) => void
  setKunPrisnedgang: (v: boolean) => void
  setVisSolgte: (v: boolean) => void
  setSortBy: (v: BoligsokSortBy) => void
}

export const useBoligsokStore = create<BoligsokState>()(
  persist(
    (set, get) => ({
      annonser: [],
      loading: false,
      error: null,
      _unsubscribe: null,

      fetchAnnonser: async () => {
        set({ loading: true, error: null })
        const { data, error } = await supabase
          .from('boligsok_annonser')
          .select('*')
          .order('created_at', { ascending: false })

        if (error) {
          set({ loading: false, error: error.message })
          return
        }
        set({ annonser: (data ?? []) as BoligAnnonse[], loading: false })
      },

      subscribe: () => {
        get()._unsubscribe?.()
        const channel = supabase
          .channel('boligsok_annonser_changes')
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'boligsok_annonser' },
            () => { void get().fetchAnnonser() }
          )
          .subscribe()
        set({ _unsubscribe: () => { supabase.removeChannel(channel) } })
      },

      unsubscribe: () => {
        get()._unsubscribe?.()
        set({ _unsubscribe: null })
      },

      setStatus: async (id, status) => {
        const prev = get().annonser
        set({ annonser: prev.map((a) => (a.id === id ? { ...a, status } : a)) })
        const { error } = await supabase.from('boligsok_annonser').update({ status }).eq('id', id)
        if (error) set({ annonser: prev, error: error.message })
      },

      setNotat: async (id, notat) => {
        const prev = get().annonser
        set({ annonser: prev.map((a) => (a.id === id ? { ...a, notat } : a)) })
        const { error } = await supabase.from('boligsok_annonser').update({ notat }).eq('id', id)
        if (error) set({ annonser: prev, error: error.message })
      },

      markerSett: (id) => {
        const annonse = get().annonser.find((a) => a.id === id)
        if (annonse?.status === 'ny') void get().setStatus(id, 'sett')
      },

      visFilter: 'alle',
      minSoverom: 0,
      minAreal: 0,
      maksTotalpris: 0,
      maksFellesutgift: 0,
      kjokkenFilter: 'alle',
      kildeFilter: 'alle',
      kunGarasje: false,
      kunBalkong: false,
      kunPrisnedgang: false,
      visSolgte: false,
      sortBy: 'anbefaling',
      setVisFilter: (v) => set({ visFilter: v }),
      setMinSoverom: (v) => set({ minSoverom: v }),
      setMinAreal: (v) => set({ minAreal: v }),
      setMaksTotalpris: (v) => set({ maksTotalpris: v }),
      setMaksFellesutgift: (v) => set({ maksFellesutgift: v }),
      setKjokkenFilter: (v) => set({ kjokkenFilter: v }),
      setKildeFilter: (v) => set({ kildeFilter: v }),
      setKunGarasje: (v) => set({ kunGarasje: v }),
      setKunBalkong: (v) => set({ kunBalkong: v }),
      setKunPrisnedgang: (v) => set({ kunPrisnedgang: v }),
      setVisSolgte: (v) => set({ visSolgte: v }),
      setSortBy: (v) => set({ sortBy: v }),
    }),
    {
      name: 'boligsok-filter-v1',
      partialize: (state) => ({
        visFilter: state.visFilter,
        minSoverom: state.minSoverom,
        minAreal: state.minAreal,
        maksTotalpris: state.maksTotalpris,
        maksFellesutgift: state.maksFellesutgift,
        kjokkenFilter: state.kjokkenFilter,
        kildeFilter: state.kildeFilter,
        kunGarasje: state.kunGarasje,
        kunBalkong: state.kunBalkong,
        kunPrisnedgang: state.kunPrisnedgang,
        visSolgte: state.visSolgte,
        sortBy: state.sortBy,
      }),
    }
  )
)
