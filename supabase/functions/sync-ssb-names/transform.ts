// Ren transformasjon av SSB-tabell 10467 («Fødte, etter jente- eller guttenavn») til rader for
// Navnejakten. Ingen Deno-/nettverks-avhengigheter, slik at logikken kan testes med vitest.

export type Gender = 'girl' | 'boy'
export type Trend = 'rising' | 'stable' | 'falling'

export interface JsonStat2 {
  id: string[]
  size: number[]
  dimension: Record<string, { category: { index: Record<string, number> | string[]; label?: Record<string, string> } }>
  value: (number | null)[]
  updated?: string
}

export interface NameRecord {
  name: string
  gender: Gender
  letters: number
  latestYear: number
  latestCount: number
  latestRank: number | null
  latestShare: number | null
  trend: Trend | null
  timeless: boolean
  /** Femårsperioden navnet var mest populært (andel fødte), og toppåret innenfor den. null uten tall. */
  peakFrom: number | null
  peakTo: number | null
  peakYear: number | null
}

export interface StatRecord {
  name: string
  gender: Gender
  year: number
  count: number
  share: number | null
  rank: number
}

export interface TransformResult {
  names: NameRecord[]
  stats: StatRecord[]
  /** Siste år med data i tabellen */
  latestYear: number
  sourceUpdated: string | null
}

/** Trend = snitt av andel fødte (%) siste 2 år mot snitt de 3 årene før (t-4..t-2). */
export const TREND_RISING_RATIO = 1.15
export const TREND_FALLING_RATIO = 0.85
/** Navnet må ha tall alle disse siste årene (og stabil trend) for å regnes som «tidløst». */
export const TIMELESS_YEARS = 20

/** Lengden på perioden som regnes som «mest populær». */
export const PEAK_WINDOW_YEARS = 5

export interface Peak { from: number; to: number; year: number }

/**
 * Femårsperioden med høyest sum av andel fødte (antall hvis SSB ikke gir andel), og året med høyest verdi
 * innenfor den. Perioden ligger alltid innenfor [firstYear, lastYear]. Ved lik sum vinner perioden som
 * ligger mest sentrert rundt toppåret (så toppen ikke havner i kanten), deretter den nyeste.
 * Andel brukes fordi antall fødte varierer mellom årene.
 */
export function findPeak(valueByYear: ReadonlyMap<number, number>, firstYear: number, lastYear: number): Peak | null {
  if (valueByYear.size === 0 || lastYear - firstYear + 1 < PEAK_WINDOW_YEARS) return null
  let topYear = -1
  let top = 0
  for (const [y, v] of valueByYear) {
    if (v > top || (v === top && v > 0 && y > topYear)) { top = v; topYear = y }
  }
  if (topYear < 0) return null

  const half = (PEAK_WINDOW_YEARS - 1) / 2
  let best: { from: number; sum: number; dist: number } | null = null
  for (let from = firstYear; from + PEAK_WINDOW_YEARS - 1 <= lastYear; from++) {
    let sum = 0
    for (let y = from; y < from + PEAK_WINDOW_YEARS; y++) sum += valueByYear.get(y) ?? 0
    const dist = Math.abs(from + half - topYear)
    const better = best === null || sum > best.sum + 1e-9 || (Math.abs(sum - best.sum) <= 1e-9 && dist <= best.dist)
    if (sum > 0 && better) best = { from, sum, dist }
  }
  if (!best) return null
  let year = best.from
  let inWindowTop = -1
  for (let y = best.from; y < best.from + PEAK_WINDOW_YEARS; y++) {
    const v = valueByYear.get(y) ?? 0
    if (v >= inWindowTop) { inWindowTop = v; year = y }
  }
  return { from: best.from, to: best.from + PEAK_WINDOW_YEARS - 1, year }
}

function categoryCodes(index: Record<string, number> | string[]): string[] {
  if (Array.isArray(index)) return index
  return Object.entries(index).sort((a, b) => a[1] - b[1]).map(([code]) => code)
}

function mean(values: number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length
}

/** Deterministisk trendklassifisering. null = for lite data til å si noe. */
export function classifyTrend(shareByYear: ReadonlyMap<number, number>, endYear: number): Trend | null {
  if (!shareByYear.has(endYear)) return null
  const pick = (from: number, to: number) => {
    const out: number[] = []
    for (let y = from; y <= to; y++) {
      const v = shareByYear.get(y)
      if (v !== undefined) out.push(v)
    }
    return out
  }
  const recent = pick(endYear - 1, endYear)
  const base = pick(endYear - 4, endYear - 2)
  if (recent.length < 1 || base.length < 2) return null
  const baseMean = mean(base)
  if (baseMean <= 0) return null
  const ratio = mean(recent) / baseMean
  if (ratio >= TREND_RISING_RATIO) return 'rising'
  if (ratio <= TREND_FALLING_RATIO) return 'falling'
  return 'stable'
}

/** Konkurranse-rangering (1,2,2,4) på antall, høyest først. */
export function rankByCount(counts: ReadonlyArray<{ key: string; count: number }>): Map<string, number> {
  const sorted = [...counts].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key, 'nb'))
  const ranks = new Map<string, number>()
  let prevCount: number | null = null
  let prevRank = 0
  sorted.forEach((row, i) => {
    const rank = prevCount !== null && row.count === prevCount ? prevRank : i + 1
    ranks.set(row.key, rank)
    prevCount = row.count
    prevRank = rank
  })
  return ranks
}

export function transformSsbNames(data: JsonStat2): TransformResult {
  const dimIds = data.id
  const fIdx = dimIds.indexOf('Fornavn')
  const cIdx = dimIds.indexOf('ContentsCode')
  const tIdx = dimIds.indexOf('Tid')
  if (fIdx < 0 || cIdx < 0 || tIdx < 0) throw new Error('Uventet SSB-struktur: mangler Fornavn/ContentsCode/Tid')

  const nameCodes = categoryCodes(data.dimension.Fornavn.category.index)
  const contentCodes = categoryCodes(data.dimension.ContentsCode.category.index)
  const yearCodes = categoryCodes(data.dimension.Tid.category.index)
  const labels = data.dimension.Fornavn.category.label ?? {}
  const countPos = contentCodes.indexOf('Personer')
  const sharePos = contentCodes.indexOf('PersonerProsent')
  if (countPos < 0) throw new Error('Uventet SSB-struktur: mangler «Personer»')

  const sizes = data.size
  // Verdier ligger i rekkefølgen gitt av `id` (siste dimensjon varierer raskest)
  const stride = new Array<number>(sizes.length)
  let acc = 1
  for (let d = sizes.length - 1; d >= 0; d--) {
    stride[d] = acc
    acc *= sizes[d]
  }
  const at = (f: number, c: number, t: number) => {
    const pos = new Array<number>(sizes.length)
    pos[fIdx] = f
    pos[cIdx] = c
    pos[tIdx] = t
    return data.value[pos.reduce((s, p, d) => s + p * stride[d], 0)]
  }

  interface Raw { key: string; name: string; gender: Gender; year: number; count: number; share: number | null }
  const raws: Raw[] = []
  nameCodes.forEach((code, f) => {
    const gender: Gender | null = code.startsWith('1') ? 'girl' : code.startsWith('2') ? 'boy' : null
    if (!gender) return
    const name = (labels[code] ?? code.slice(1)).trim()
    yearCodes.forEach((yearCode, t) => {
      const count = at(f, countPos, t)
      if (count === null || count === undefined) return
      const share = sharePos >= 0 ? at(f, sharePos, t) ?? null : null
      raws.push({ key: `${gender}|${name}`, name, gender, year: Number(yearCode), count, share })
    })
  })

  if (raws.length === 0) throw new Error('SSB-svaret inneholdt ingen navnedata')
  const latestYear = Math.max(...raws.map((r) => r.year))
  const firstYear = Math.min(...raws.map((r) => r.year))

  // Rang per (kjønn, år)
  const rankByGroup = new Map<string, Map<string, number>>()
  const groups = new Map<string, Array<{ key: string; count: number }>>()
  for (const r of raws) {
    const g = `${r.gender}|${r.year}`
    if (!groups.has(g)) groups.set(g, [])
    groups.get(g)!.push({ key: r.key, count: r.count })
  }
  for (const [g, rows] of groups) rankByGroup.set(g, rankByCount(rows))

  const stats: StatRecord[] = raws.map((r) => ({
    name: r.name, gender: r.gender, year: r.year, count: r.count, share: r.share,
    rank: rankByGroup.get(`${r.gender}|${r.year}`)!.get(r.key)!,
  }))

  const byName = new Map<string, Raw[]>()
  for (const r of raws) {
    if (!byName.has(r.key)) byName.set(r.key, [])
    byName.get(r.key)!.push(r)
  }

  const names: NameRecord[] = []
  for (const [key, rows] of byName) {
    rows.sort((a, b) => a.year - b.year)
    const last = rows[rows.length - 1]
    const shares = new Map<number, number>()
    const presentYears = new Set<number>()
    for (const r of rows) {
      presentYears.add(r.year)
      if (r.share !== null) shares.set(r.year, r.share)
    }
    const trend = classifyTrend(shares, latestYear)
    let timeless = trend === 'stable'
    for (let y = latestYear - TIMELESS_YEARS + 1; timeless && y <= latestYear; y++) {
      if (!presentYears.has(y)) timeless = false
    }
    const useShare = rows.some((r) => r.share !== null)
    const peak = findPeak(new Map(rows.map((r) => [r.year, useShare ? r.share ?? 0 : r.count])), firstYear, latestYear)
    names.push({
      name: last.name,
      gender: last.gender,
      letters: [...last.name].filter((ch) => /\p{L}/u.test(ch)).length,
      latestYear: last.year,
      latestCount: last.count,
      latestRank: rankByGroup.get(`${last.gender}|${last.year}`)!.get(key) ?? null,
      latestShare: last.share,
      trend,
      timeless,
      peakFrom: peak?.from ?? null,
      peakTo: peak?.to ?? null,
      peakYear: peak?.year ?? null,
    })
  }

  return { names, stats, latestYear, sourceUpdated: data.updated ?? null }
}
