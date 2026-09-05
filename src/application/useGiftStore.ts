import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  GiftRecipient, GiftEvent, GiftSettings, WeightRules,
} from '@/types/gifts'
import { DEFAULT_WEIGHT_RULES, DEFAULT_GIFT_SETTINGS } from '@/domain/gifts/defaultWeights'
import {
  calculateGiftAmount, calculateNormalizedAmounts, calculateGiftResult,
  calculateActualVsPlanned, roundGiftAmount,
} from '@/domain/gifts/giftCalculator'
import type { GiftCalculationResult } from '@/types/gifts'

// ── State-interface ─────────────────────────────────────────────

interface GiftState {
  settings: GiftSettings
  weightRules: WeightRules
  recipients: GiftRecipient[]
  events: GiftEvent[]

  // Actions — innstillinger
  updateSettings: (updates: Partial<GiftSettings>) => void
  updateWeightRules: (updates: Partial<WeightRules>) => void

  // Actions — mottakere
  addRecipient: (recipient: GiftRecipient) => void
  updateRecipient: (id: string, updates: Partial<GiftRecipient>) => void
  removeRecipient: (id: string) => void

  // Actions — hendelser
  addEvent: (event: GiftEvent) => void
  updateEvent: (id: string, updates: Partial<GiftEvent>) => void
  removeEvent: (id: string) => void
  recalculateAllAmounts: () => void

  // Selectors (rene beregninger)
  getResult: () => GiftCalculationResult
  getActualVsPlanned: () => ReturnType<typeof calculateActualVsPlanned>
  getUpcomingEvents: (days?: number) => GiftEvent[]
}

// ── Store ───────────────────────────────────────────────────────

export const useGiftStore = create<GiftState>()(
  persist(
    (set, get) => ({
      settings: DEFAULT_GIFT_SETTINGS,
      weightRules: DEFAULT_WEIGHT_RULES,
      recipients: [],
      events: [],

      // --- Innstillinger ---
      updateSettings: (updates) =>
        set((s) => ({ settings: { ...s.settings, ...updates } })),

      updateWeightRules: (updates) =>
        set((s) => ({ weightRules: { ...s.weightRules, ...updates } })),

      // --- Mottakere ---
      addRecipient: (recipient) =>
        set((s) => ({ recipients: [...s.recipients, recipient] })),

      updateRecipient: (id, updates) =>
        set((s) => ({
          recipients: s.recipients.map((r) => r.id === id ? { ...r, ...updates } : r),
        })),

      removeRecipient: (id) =>
        set((s) => ({
          recipients: s.recipients.filter((r) => r.id !== id),
          events: s.events.filter((e) => e.recipientId !== id),
        })),

      // --- Hendelser ---
      addEvent: (event) =>
        set((s) => ({ events: [...s.events, event] })),

      updateEvent: (id, updates) =>
        set((s) => ({
          events: s.events.map((e) => e.id === id ? { ...e, ...updates } : e),
        })),

      removeEvent: (id) =>
        set((s) => ({ events: s.events.filter((e) => e.id !== id) })),

      recalculateAllAmounts: () => {
        const { events, recipients, settings, weightRules } = get()
        const recalculated = calculateNormalizedAmounts(events, recipients, settings, weightRules)
        set({ events: recalculated })
      },

      // --- Selectors ---
      getResult: () => {
        const { events, settings, recipients } = get()
        return calculateGiftResult(events, settings, recipients)
      },

      getActualVsPlanned: () => {
        const { events } = get()
        return calculateActualVsPlanned(events)
      },

      getUpcomingEvents: (days = 60) => {
        const { events } = get()
        const today = new Date()
        const future = new Date(today.getTime() + days * 24 * 60 * 60 * 1000)
        return events
          .filter((e) => e.status === 'planlagt' && e.date)
          .filter((e) => {
            const d = new Date(e.date!)
            return d >= today && d <= future
          })
          .sort((a, b) => a.date!.localeCompare(b.date!))
      },
    }),
    {
      name: 'lommeboka-gaver-v1',
      version: 3,
      migrate: (persistedState: unknown, version: number) => {
        const state = persistedState as Record<string, unknown>
        if (version < 2) {
          // Ny beregningsmodell: flat takst per relasjon — nullstill weightRules
          return { ...state, weightRules: DEFAULT_WEIGHT_RULES }
        }
        if (version < 3) {
          // Fiks hendelser med tom id (skapt av bug i spesiell-hendelse-modal)
          const events = (state.events as GiftEvent[] | undefined) ?? []
          return { ...state, events: events.map((e) => e.id ? e : { ...e, id: crypto.randomUUID() }) }
        }
        return state
      },
      partialize: (state) => ({
        settings: state.settings,
        weightRules: state.weightRules,
        recipients: state.recipients,
        events: state.events,
      }),
    }
  )
)

// ── Delt gaveplanlegger (partnerskap) ────────────────────────────
// Selve delingen skjer via en toveis speiling (src/lib/giftSync.ts) mot
// useSharedGaverStore istedenfor å bytte lesekilde i hvert av GiftPage sine
// mange lesepunkter — se den filen for hvorfor.

export interface GaverSharedData {
  settings: GiftSettings
  weightRules: WeightRules
  recipients: GiftRecipient[]
  events: GiftEvent[]
}

export function giftSharedSlice(): GaverSharedData {
  const s = useGiftStore.getState()
  return { settings: s.settings, weightRules: s.weightRules, recipients: s.recipients, events: s.events }
}

export function giftSliceIsEmpty(d: GaverSharedData): boolean {
  return d.recipients.length === 0 && d.events.length === 0
}

// ── Hjelpefunksjon for nytt event med beregnet beløp ─────────────

export function createGiftEvent(
  params: Omit<GiftEvent, 'id' | 'calculatedAmount'> & { calculatedAmount?: number },
  recipient: GiftRecipient,
  weightRules: WeightRules,
  roundingNearest: 1 | 50 | 100,
): GiftEvent {
  const event: GiftEvent = {
    ...params,
    id: crypto.randomUUID(),
    calculatedAmount: params.calculatedAmount ?? 0,
  }
  if (!event.manualAmount) {
    const raw = calculateGiftAmount(event, recipient, weightRules)
    event.calculatedAmount = roundGiftAmount(raw, roundingNearest)
  }
  return event
}
