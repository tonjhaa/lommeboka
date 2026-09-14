import { createSharedDataStore } from './createSharedDataStore'
import { dedupeClothingItems, type ClothingItem } from '@/domain/clothing/clothingTypes'

export const useSharedKlaerStore = createSharedDataStore<ClothingItem[]>(
  'klaer',
  [],
  (items) => dedupeClothingItems(items),
)
