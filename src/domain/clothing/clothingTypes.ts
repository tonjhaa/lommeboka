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
  /** Plaggtype/navn, f.eks. "Body" — én rad per kategori, håndheves som unik (se ClothingPage) */
  category: string
  /** Hvilken størrelsesskala denne kategorien bruker (høyde/sko/alder) */
  sizeScale: SizeScaleKey
  /** Frie beskrivende merkelapper, f.eks. ["Hvit", "Langermet"] — ren informasjon, teller
   *  ikke separat. Bevisst ikke faste dropdown-felt (farge/lengde), siden plagget kan være
   *  flere ting samtidig (hvit OG langermet) uten at det er egne rader å holde styr på. */
  tags: string[]
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

/** Formen ClothingItem hadde før kategori/tag-modellen (2026-09-07) — én rad per plagg
 *  med et sammensatt fritekstnavn som "Body, kortermet". Se useEconomyStore v31→v32. */
interface LegacyClothingItem {
  id: string
  name: string
  note?: string
  storeUrl?: string
  sizes?: Partial<Record<string, number>>
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

function hasSizeScale(item: ClothingItem): item is ClothingItem & { sizeScale: SizeScaleKey } {
  return typeof item.sizeScale === 'string' && item.sizeScale in SIZE_SCALES
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

/** Tar imot både dagens form og eldre former (rå JSON fra localStorage/Supabase kan i
 *  praksis være hva som helst) — `unknown` er bevisst, ikke en avlatsseddel. Setter/
 *  migrerer `sizeScale` og flytter antall som ikke passer inn i den nye skalaen. */
export function normalizeClothingItem(raw: unknown): ClothingItem {
  const item = raw as ClothingItem | LegacyClothingItem
  if (isCurrentShape(item) && hasSizeScale(item)) return item

  let category: string, tags: string[], note: string, storeUrl: string | undefined, sizes: Partial<Record<string, number>>
  if (isCurrentShape(item)) {
    category = item.category; tags = item.tags; note = item.note; storeUrl = item.storeUrl; sizes = item.sizes
  } else {
    const split = splitLegacyName(item.name)
    category = split.category; tags = split.tags; note = item.note ?? ''; storeUrl = item.storeUrl; sizes = item.sizes ?? {}
  }

  const sizeScale = inferSizeScale(category)
  const { sizes: remapped, flagged } = remapSizes(sizes, sizeScale)
  return {
    id: item.id,
    category,
    sizeScale,
    tags,
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
      sizeScale: existing.sizeScale,
      tags: Array.from(new Set([...existing.tags, ...item.tags])),
      note: existing.note || item.note,
      storeUrl: existing.storeUrl || item.storeUrl,
      sizes: mergeSizes(existing.sizes, item.sizes),
    })
  }
  return Array.from(merged.values())
}
