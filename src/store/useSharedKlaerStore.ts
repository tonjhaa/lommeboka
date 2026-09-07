import { createSharedDataStore } from './createSharedDataStore'
import { dedupeClothingItemsByCategory, type ClothingItem } from '@/domain/clothing/clothingTypes'

export const useSharedKlaerStore = createSharedDataStore<ClothingItem[]>(
  'klaer',
  [],
  (items) => dedupeClothingItemsByCategory(items),
)
