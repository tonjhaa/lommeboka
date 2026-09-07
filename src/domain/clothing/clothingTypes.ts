export const CLOTHING_SIZES = ['50', '56', '62', '68', '74', '80', '86', '92'] as const
export type ClothingSize = (typeof CLOTHING_SIZES)[number]

export interface ClothingItem {
  id: string
  /** Hovedkategori, f.eks. "Body" — rader med samme kategori grupperes og summeres i tabellen */
  category: string
  /** Frie merkelapper for denne varianten innenfor kategorien, f.eks. ["Hvit", "Langermet"].
   *  Bevisst ikke faste dropdown-felt (farge/lengde) — en variant kan være flere ting samtidig
   *  (hvit OG langermet), og hvilke egenskaper som er relevante varierer med plaggtypen. */
  tags: string[]
  note: string
  storeUrl?: string
  sizes: Partial<Record<ClothingSize, number>>
}

/** Formen ClothingItem hadde før kategori/tag-modellen (2026-09-07) — én rad per plagg
 *  med et sammensatt fritekstnavn som "Body, kortermet". Se useEconomyStore v31→v32. */
interface LegacyClothingItem {
  id: string
  name: string
  note?: string
  storeUrl?: string
  sizes?: Partial<Record<ClothingSize, number>>
}

/** Kun "Body"-klyngen hadde et navnemønster vi faktisk vet betydningen av
 *  ("Body, kortermet" / "Body, langermet" / "Bodyer") — alt annet blir sin egen
 *  kategori uten tagger, som gir samme enkeltrad som før (ingen visuell endring). */
function splitLegacyName(name: string): { category: string; tags: string[] } {
  const bodyMatch = name.match(/^Body(?:er)?(?:,\s*(.+))?$/i)
  if (bodyMatch) {
    const rest = bodyMatch[1]?.trim()
    return { category: 'Body', tags: rest ? [rest[0].toUpperCase() + rest.slice(1)] : [] }
  }
  return { category: name, tags: [] }
}

function isCurrentShape(raw: ClothingItem | LegacyClothingItem): raw is ClothingItem {
  return typeof (raw as ClothingItem).category === 'string' && Array.isArray((raw as ClothingItem).tags)
}

/** Tar imot både dagens form og den eldre navnebaserte formen (rå JSON fra localStorage/
 *  Supabase kan i praksis være hva som helst) — `unknown` er bevisst, ikke en avlatsseddel. */
export function normalizeClothingItem(raw: unknown): ClothingItem {
  const item = raw as ClothingItem | LegacyClothingItem
  if (isCurrentShape(item)) return item
  const { category, tags } = splitLegacyName(item.name)
  return {
    id: item.id,
    category,
    tags,
    note: item.note ?? '',
    storeUrl: item.storeUrl,
    sizes: item.sizes ?? {},
  }
}

export function totalQty(item: ClothingItem): number {
  return CLOTHING_SIZES.reduce((s, sz) => s + (item.sizes[sz] ?? 0), 0)
}
