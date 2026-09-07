import { createSharedDataStore } from './createSharedDataStore'
import { normalizeClothingItem, type ClothingItem } from '@/domain/clothing/clothingTypes'

export const useSharedKlaerStore = createSharedDataStore<ClothingItem[]>(
  'klaer',
  [],
  (items) => items.map(normalizeClothingItem),
)
