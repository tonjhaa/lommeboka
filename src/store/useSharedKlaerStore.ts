import { createSharedDataStore } from './createSharedDataStore'
import type { ClothingItem } from '@/pages/economy/ClothingPage'

export const useSharedKlaerStore = createSharedDataStore<ClothingItem[]>('klaer', [])
