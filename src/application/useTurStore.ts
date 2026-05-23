import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ── Typer ────────────────────────────────────────────────────────

export type TurItemType = 'gjøremål' | 'handleliste'

export interface TurItem {
  id: string
  type: TurItemType
  text: string
  lat: number
  lng: number
  done: boolean
}

export interface TurPlan {
  id: string
  name: string
  items: TurItem[]
}

// Standard startposisjon: Norges geografiske midtpunkt
export const DEFAULT_LAT = 65.0
export const DEFAULT_LNG = 14.5

interface TurState {
  plans: TurPlan[]
  activePlanId: string | null

  // Actions
  createPlan: (name: string) => string
  updatePlanName: (id: string, name: string) => void
  deletePlan: (id: string) => void
  setActivePlan: (id: string) => void

  addItem: (planId: string, type: TurItemType, text: string, lat: number, lng: number) => string
  updateItem: (planId: string, itemId: string, updates: Partial<Omit<TurItem, 'id'>>) => void
  removeItem: (planId: string, itemId: string) => void
  toggleDone: (planId: string, itemId: string) => void
}

// ── Store ────────────────────────────────────────────────────────

export const useTurStore = create<TurState>()(
  persist(
    (set) => ({
      plans: [],
      activePlanId: null,

      createPlan: (name) => {
        const id = crypto.randomUUID()
        set((s) => ({
          plans: [...s.plans, { id, name, items: [] }],
          activePlanId: id,
        }))
        return id
      },

      updatePlanName: (id, name) =>
        set((s) => ({ plans: s.plans.map((p) => p.id === id ? { ...p, name } : p) })),

      deletePlan: (id) =>
        set((s) => {
          const plans = s.plans.filter((p) => p.id !== id)
          return {
            plans,
            activePlanId: s.activePlanId === id ? (plans[0]?.id ?? null) : s.activePlanId,
          }
        }),

      setActivePlan: (id) => set({ activePlanId: id }),

      addItem: (planId, type, text, lat, lng) => {
        const id = crypto.randomUUID()
        set((s) => ({
          plans: s.plans.map((p) =>
            p.id === planId
              ? { ...p, items: [...p.items, { id, type, text, lat, lng, done: false }] }
              : p,
          ),
        }))
        return id
      },

      updateItem: (planId, itemId, updates) =>
        set((s) => ({
          plans: s.plans.map((p) =>
            p.id === planId
              ? { ...p, items: p.items.map((it) => it.id === itemId ? { ...it, ...updates } : it) }
              : p,
          ),
        })),

      removeItem: (planId, itemId) =>
        set((s) => ({
          plans: s.plans.map((p) =>
            p.id === planId
              ? { ...p, items: p.items.filter((it) => it.id !== itemId) }
              : p,
          ),
        })),

      toggleDone: (planId, itemId) =>
        set((s) => ({
          plans: s.plans.map((p) =>
            p.id === planId
              ? { ...p, items: p.items.map((it) => it.id === itemId ? { ...it, done: !it.done } : it) }
              : p,
          ),
        })),
    }),
    {
      name: 'lommeboka-tur-v1',
      version: 1,
    }
  )
)
