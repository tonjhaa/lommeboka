export const CLOTHING_SIZES = ['50', '56', '62', '68', '74', '80', '86', '92'] as const
export type ClothingSize = (typeof CLOTHING_SIZES)[number]

export interface ClothingItem {
  id: string
  /** Plaggtype/navn, f.eks. "Body" — én rad per kategori, håndheves som unik (se ClothingPage) */
  category: string
  /** Frie beskrivende merkelapper, f.eks. ["Hvit", "Langermet"] — ren informasjon, teller
   *  ikke separat. Bevisst ikke faste dropdown-felt (farge/lengde), siden plagget kan være
   *  flere ting samtidig (hvit OG langermet) uten at det er egne rader å holde styr på. */
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

function mergeSizes(
  a: Partial<Record<ClothingSize, number>>,
  b: Partial<Record<ClothingSize, number>>,
): Partial<Record<ClothingSize, number>> {
  const out: Partial<Record<ClothingSize, number>> = { ...a }
  for (const sz of CLOTHING_SIZES) {
    const sum = (a[sz] ?? 0) + (b[sz] ?? 0)
    if (sum > 0) out[sz] = sum
  }
  return out
}

/** Slår sammen rader med samme kategori (case-insensitivt) — brukt til å rydde opp i data fra
 *  variant-modellen (2026-09-07–2026-09-08, forkastet: risikerte dobbelttelling når samme
 *  plagg fikk flere overlappende tag-rader). Tagger unioneres, antall per størrelse summeres.
 *  Idempotent: kjøres på allerede-slått-sammen data uten å endre noe. */
export function dedupeClothingItemsByCategory(raw: unknown[]): ClothingItem[] {
  const merged = new Map<string, ClothingItem>()
  for (const r of raw) {
    const item = normalizeClothingItem(r)
    const key = item.category.trim().toLowerCase()
    const existing = merged.get(key)
    if (!existing) { merged.set(key, item); continue }
    merged.set(key, {
      id: existing.id,
      category: existing.category,
      tags: Array.from(new Set([...existing.tags, ...item.tags])),
      note: existing.note || item.note,
      storeUrl: existing.storeUrl || item.storeUrl,
      sizes: mergeSizes(existing.sizes, item.sizes),
    })
  }
  return Array.from(merged.values())
}
