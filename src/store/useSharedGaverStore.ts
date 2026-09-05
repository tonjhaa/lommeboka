import { createSharedDataStore } from './createSharedDataStore'
import { DEFAULT_WEIGHT_RULES, DEFAULT_GIFT_SETTINGS } from '@/domain/gifts/defaultWeights'
import type { GaverSharedData } from '@/application/useGiftStore'

const FALLBACK: GaverSharedData = {
  settings: DEFAULT_GIFT_SETTINGS,
  weightRules: DEFAULT_WEIGHT_RULES,
  recipients: [],
  events: [],
}

export const useSharedGaverStore = createSharedDataStore<GaverSharedData>('gaver', FALLBACK)
