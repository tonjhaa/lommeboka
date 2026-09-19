import type { NameRow } from '../types'

export function makeName(over: Partial<NameRow> & { id: string }): NameRow {
  return {
    name: over.id, gender: 'girl', letters: 5, latestYear: 2025, latestCount: 100, latestRank: 50,
    latestShare: 0.4, trend: 'stable', timeless: false, ...over,
  }
}
