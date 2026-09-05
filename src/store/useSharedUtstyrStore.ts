import { createSharedDataStore } from './createSharedDataStore'
import type { BabyShoppingItem } from '@/pages/economy/BabyShoppingPage'

export const useSharedUtstyrStore = createSharedDataStore<BabyShoppingItem[]>('utstyr', [])
