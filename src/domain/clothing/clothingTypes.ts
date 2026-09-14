/** Ulike plaggtyper måles ikke i samme enhet — sko i skostørrelse, luer/votter/sokker
 *  ofte bare i alder, mens vanlige klær (body, sparkebukse osv.) måles i høyde (cm).
 *  Hver kategori har derfor sin egen skala (`sizeScale`) i stedet for ett globalt
 *  kolonnesett — se ClothingPage.tsx som grupperer tabellen per skala. */
export const SIZE_SCALES = {
  hoyde: { label: 'Høyde (cm)', sizes: ['50', '56', '62', '68', '74', '80', '86', '92'] },
  sko: { label: 'Skostørrelse', sizes: ['18', '19', '20', '21', '22', '23', '24', '25'] },
  alder: { label: 'Alder', sizes: ['0-3 mnd', '3-6 mnd', '6-12 mnd', '1-2 år', '2-4 år'] },
} as const

export type SizeScaleKey = keyof typeof SIZE_SCALES
export const DEFAULT_SIZE_SCALE: SizeScaleKey = 'hoyde'

/** Beholdt for bakoverkompatibilitet — høyde-skalaen var tidligere den eneste. */
export const CLOTHING_SIZES = SIZE_SCALES.hoyde.sizes
export type ClothingSize = string

export interface ClothingItem {
  id: string
  /** Hovedkategori, f.eks. "Body" — rader med samme kategori grupperes i tabellen */
  category: string
  /** Underkategori innenfor kategorien, f.eks. "Langermet" eller "Ull" — én rad per
   *  kombinasjon av kategori+underkategori (tomstreng hvis kategorien ikke har varianter) */
  subcategory: string
  /** Hvilken størrelsesskala denne kategorien bruker (høyde/sko/alder) */
  sizeScale: SizeScaleKey
  note: string
  storeUrl?: string
  sizes: Partial<Record<string, number>>
}

/** Gjetter riktig skala fra kategorinavn — brukt til migrering av eksisterende data og som
 *  standardforslag når man lager en ny kategori. Sko/sokker/luer/votter måles ikke i høyde. */
const CATEGORY_SIZE_SCALE: Record<string, SizeScaleKey> = {
  'sko': 'sko', 'sko, myke': 'sko',
  'sokker': 'alder', 'ullsokker': 'alder',
  'lue': 'alder', 'luer': 'alder', 'lue, bomull': 'alder', 'lue, ull': 'alder',
  'votter': 'alder',
}

export function inferSizeScale(category: string): SizeScaleKey {
  return CATEGORY_SIZE_SCALE[category.trim().toLowerCase()] ?? DEFAULT_SIZE_SCALE
}

/** Eldre former ClothingItem har hatt — rå JSON fra localStorage/Supabase kan i praksis
 *  være hvilken som helst av disse. `unknown` i normalizeClothingItem er bevisst, ikke en
 *  avlatsseddel; disse typene finnes bare for å gi feltuthentingen under litt struktur. */
interface LegacyNameShape {
  id: string
  name: string
  note?: string
  storeUrl?: string
  sizes?: Partial<Record<string, number>>
}
interface LegacyTagShape {
  id: string
  category: string
  tags: string[]
  note: string
  storeUrl?: string
  sizes: Partial<Record<string, number>>
  sizeScale?: SizeScaleKey
}

/** Kun "Body"-klyngen hadde et navnemønster vi faktisk vet betydningen av
 *  ("Body, kortermet" / "Body, langermet" / "Bodyer") — alt annet blir sin egen
 *  kategori uten underkategori, som gir samme enkeltrad som før. */
function splitLegacyName(name: string): { category: string; subcategory: string } {
  const bodyMatch = name.match(/^Body(?:er)?(?:,\s*(.+))?$/i)
  if (bodyMatch) {
    const rest = bodyMatch[1]?.trim()
    return { category: 'Body', subcategory: rest ? rest[0].toUpperCase() + rest.slice(1) : '' }
  }
  return { category: name, subcategory: '' }
}

function extractFields(raw: unknown): { category: string; subcategory: string; note: string; storeUrl?: string; sizes: Partial<Record<string, number>> } {
  const item = raw as ClothingItem | LegacyTagShape | LegacyNameShape
  if (typeof (item as ClothingItem).subcategory === 'string') {
    const i = item as ClothingItem
    return { category: i.category, subcategory: i.subcategory, note: i.note, storeUrl: i.storeUrl, sizes: i.sizes }
  }
  if (typeof (item as LegacyTagShape).category === 'string' && Array.isArray((item as LegacyTagShape).tags)) {
    const i = item as LegacyTagShape
    return { category: i.category, subcategory: i.tags.join(', '), note: i.note, storeUrl: i.storeUrl, sizes: i.sizes }
  }
  const i = item as LegacyNameShape
  const split = splitLegacyName(i.name)
  return { category: split.category, subcategory: split.subcategory, note: i.note ?? '', storeUrl: i.storeUrl, sizes: i.sizes ?? {} }
}

function hasSizeScale(raw: unknown): raw is { sizeScale: SizeScaleKey } {
  const scale = (raw as { sizeScale?: unknown }).sizeScale
  return typeof scale === 'string' && scale in SIZE_SCALES
}

/** Flytter eksisterende antall til riktig skala når kategorien får en ny (eller sin første)
 *  størrelsesskala — gamle nøkler som ikke finnes i den nye skalaen (f.eks. "50" for Sokker,
 *  som brukte høyde-cm før den fikk en egen aldersskala) summeres og legges i skalaens første
 *  bøtte, flagget med en merknad slik at det er synlig at det bør sjekkes. Ingen tap av antall. */
function remapSizes(
  sizes: Partial<Record<string, number>>,
  scale: SizeScaleKey,
): { sizes: Partial<Record<string, number>>; flagged: number } {
  const validLabels = new Set<string>(SIZE_SCALES[scale].sizes)
  const kept: Partial<Record<string, number>> = {}
  let orphaned = 0
  for (const [label, qty] of Object.entries(sizes)) {
    if (qty === undefined) continue
    if (validLabels.has(label)) kept[label] = qty
    else orphaned += qty
  }
  if (orphaned > 0) {
    const firstLabel = SIZE_SCALES[scale].sizes[0]
    kept[firstLabel] = (kept[firstLabel] ?? 0) + orphaned
  }
  return { sizes: kept, flagged: orphaned }
}

/** Tar imot alle tidligere lagrede former (navnebasert, tag-basert, dagens
 *  kategori/underkategori-form) og normaliserer til dagens ClothingItem — idempotent. */
export function normalizeClothingItem(raw: unknown): ClothingItem {
  const { category, subcategory, note, storeUrl, sizes } = extractFields(raw)
  const sizeScale = hasSizeScale(raw) ? raw.sizeScale : inferSizeScale(category)
  const { sizes: remapped, flagged } = remapSizes(sizes, sizeScale)
  return {
    id: (raw as { id: string }).id,
    category,
    subcategory,
    sizeScale,
    note: flagged > 0 ? `${note} (${flagged} flyttet fra gammel størrelsesskala — sjekk at størrelsen er riktig)`.trim() : note,
    storeUrl,
    sizes: remapped,
  }
}

export function totalQty(item: ClothingItem): number {
  return Object.values(item.sizes).reduce((s: number, n) => s + (n ?? 0), 0)
}

function mergeSizes(
  a: Partial<Record<string, number>>,
  b: Partial<Record<string, number>>,
): Partial<Record<string, number>> {
  const out: Partial<Record<string, number>> = { ...a }
  for (const [label, qty] of Object.entries(b)) {
    if (qty === undefined) continue
    const sum = (a[label] ?? 0) + qty
    if (sum > 0) out[label] = sum
  }
  return out
}

/** Slår sammen rader med samme kategori+underkategori (case-insensitivt) — idempotent,
 *  rydder opp i dubletter fra tidligere datamodeller (navn-baserte, tag-baserte). Antall
 *  per størrelse summeres. */
export function dedupeClothingItems(raw: unknown[]): ClothingItem[] {
  const merged = new Map<string, ClothingItem>()
  for (const r of raw) {
    const item = normalizeClothingItem(r)
    const key = `${item.category.trim().toLowerCase()}|${item.subcategory.trim().toLowerCase()}`
    const existing = merged.get(key)
    if (!existing) { merged.set(key, item); continue }
    merged.set(key, {
      id: existing.id,
      category: existing.category,
      subcategory: existing.subcategory,
      sizeScale: existing.sizeScale,
      note: existing.note || item.note,
      storeUrl: existing.storeUrl || item.storeUrl,
      sizes: mergeSizes(existing.sizes, item.sizes),
    })
  }
  return Array.from(merged.values())
}
