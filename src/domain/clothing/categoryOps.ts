import { dedupeClothingItems, totalQty, type ClothingItem, type SizeScaleKey } from './clothingTypes'

/** Kategorier finnes ikke som egen entitet — de er verdien av `category` på klesradene.
 *  Kategoribehandlingen er derfor ren transformasjon av radlisten, slik at lagring (personlig
 *  og delt) fungerer uendret. En tom kategori er én rad uten antall, som i standardlisten. */

export type CategoryResult = { ok: true; items: ClothingItem[] } | { ok: false; error: string }

export interface CategorySummary {
  category: string
  sizeScale: SizeScaleKey
  rows: number
  plagg: number
}

const norm = (s: string) => s.trim().toLowerCase()

export function summarizeCategories(items: ClothingItem[]): CategorySummary[] {
  const map = new Map<string, CategorySummary>()
  for (const item of items) {
    const existing = map.get(item.category)
    if (existing) { existing.rows += 1; existing.plagg += totalQty(item) }
    else map.set(item.category, { category: item.category, sizeScale: item.sizeScale, rows: 1, plagg: totalQty(item) })
  }
  return Array.from(map.values()).sort((a, b) => a.category.localeCompare(b.category, 'nb'))
}

export function addCategory(items: ClothingItem[], name: string, sizeScale: SizeScaleKey, id: string): CategoryResult {
  const trimmed = name.trim()
  if (!trimmed) return { ok: false, error: 'Kategorien må ha et navn.' }
  if (items.some(i => norm(i.category) === norm(trimmed))) return { ok: false, error: 'Kategorien finnes allerede.' }
  return { ok: true, items: [...items, { id, category: trimmed, subcategory: '', sizeScale, note: '', storeUrl: '', sizes: {} }] }
}

/** Gir nytt navn til alle rader i kategorien. Hvis målnavnet allerede finnes, slås kategoriene
 *  sammen (rader med lik underkategori summeres) — men bare når begge bruker samme størrelsesskala,
 *  ellers ville antall havnet i feil størrelseskolonner. */
export function renameCategory(items: ClothingItem[], from: string, to: string): CategoryResult {
  const target = to.trim()
  if (!target) return { ok: false, error: 'Kategorien må ha et navn.' }
  if (target === from) return { ok: true, items }
  const moving = items.filter(i => i.category === from)
  if (moving.length === 0) return { ok: false, error: 'Fant ikke kategorien.' }

  const clash = items.filter(i => i.category !== from && norm(i.category) === norm(target))
  if (clash.length > 0) {
    const scales = new Set([...moving, ...clash].map(i => i.sizeScale))
    if (scales.size > 1) return { ok: false, error: `«${clash[0].category}» bruker en annen størrelsestype og kan ikke slås sammen.` }
    const canonical = clash[0].category
    const renamed = items.map(i => i.category === from ? { ...i, category: canonical } : i)
    return { ok: true, items: dedupeClothingItems(renamed) }
  }
  return { ok: true, items: items.map(i => i.category === from ? { ...i, category: target } : i) }
}

export function removeCategory(items: ClothingItem[], category: string): ClothingItem[] {
  return items.filter(i => i.category !== category)
}
