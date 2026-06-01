import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PermisjonInput, PermisjonPeriode, ChatMessage } from '@/types/permisjon'
import { genererPlanFordelt } from '@/domain/economy/foreldrepengerRules'

const DEFAULT_INPUT: PermisjonInput = {
  morErMeg: true,
  terminDato: '',
  fodselsDato: undefined,
  dekningsgrad: 100,
  tvillinger: false,
  forTidligFodsel: false,
  mineFerieblokker: [],
  partnerErLærer: true,
  partnerFerieblokker: [],
  partnerSommerFraManedDag: '06-22',
  partnerSommerTilManedDag: '08-14',
  fellesTilMor: null,
}

interface PermisjonStoreState {
  input: PermisjonInput
  perioder: PermisjonPeriode[]
  chatHistory: ChatMessage[]

  setInput: (updates: Partial<PermisjonInput>) => void
  setPerioder: (perioder: PermisjonPeriode[]) => void
  genererPlan: () => void
  addChatMessage: (msg: ChatMessage) => void
  clearChat: () => void
  reset: () => void
}

export const usePermisjonStore = create<PermisjonStoreState>()(
  persist(
    (set, get) => ({
      input: DEFAULT_INPUT,
      perioder: [],
      chatHistory: [],

      setInput: (updates) =>
        set((s) => ({ input: { ...s.input, ...updates } })),

      setPerioder: (perioder) => set({ perioder }),

      genererPlan: () => {
        const { input } = get()
        if (!input.terminDato) return
        set({ perioder: genererPlanFordelt(input) })
      },

      addChatMessage: (msg) =>
        set((s) => ({ chatHistory: [...s.chatHistory, msg] })),

      clearChat: () => set({ chatHistory: [] }),

      reset: () => set({ input: DEFAULT_INPUT, perioder: [], chatHistory: [] }),
    }),
    {
      name: 'lommeboka-permisjon-v1',
      version: 1,
    }
  )
)
