import { GENDER_LABEL_SHORT, type NameRow, type Trend } from './types'

export const isActive = (n: NameRow, latestYear: number) => n.latestYear === latestYear

const nb = new Intl.NumberFormat('nb-NO')

/** «247 barn fikk navnet i 2025» — eller, uten tall for siste år, siste registrerte år. */
export function countLine(n: NameRow, latestYear: number): string {
  const count = nb.format(n.latestCount)
  return isActive(n, latestYear)
    ? `${count} barn fikk navnet i ${n.latestYear}`
    : `${count} barn fikk navnet i ${n.latestYear} — ingen SSB-tall for ${latestYear}`
}

/** «#18 blant jenter» — null uten rang siste år. */
export function rankLine(n: NameRow, latestYear: number): string | null {
  if (!isActive(n, latestYear) || n.latestRank === null) return null
  return `#${n.latestRank} blant ${GENDER_LABEL_SHORT[n.gender]}`
}

export function trendLine(trend: Trend | null): string {
  switch (trend) {
    case 'rising': return 'Økende siste 5 år'
    case 'stable': return 'Stabil siste 5 år'
    case 'falling': return 'Synkende siste 5 år'
    default: return 'For lite data til å vise trend'
  }
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso))
}

export function formatPercent(v: number | null, digits = 0): string {
  return v === null ? '–' : `${(v * 100).toFixed(digits)} %`
}
