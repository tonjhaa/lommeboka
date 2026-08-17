import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { BoligAnnonse, BoligsokStatus } from '@/types/boligsok'

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
}

export const useBoligsokStore = create<BoligsokState>((set, get) => ({
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
}))
