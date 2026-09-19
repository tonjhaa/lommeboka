import { describe, it, expect } from 'vitest'
import { countLine, rankLine, trendLine, formatPercent } from '../format'
import { makeName } from './helpers'

describe('format', () => {
  it('beskriver antall og rang for navn med tall siste år', () => {
    const n = makeName({ id: 'a', latestCount: 247, latestRank: 18, gender: 'girl' })
    expect(countLine(n, 2025)).toContain('barn fikk navnet i 2025')
    expect(rankLine(n, 2025)).toBe('#18 blant jenter')
  })

  it('håndterer navn uten tall siste år: eldre år i teksten og ingen rang', () => {
    const n = makeName({ id: 'a', latestYear: 2015, latestCount: 210, latestRank: 40 })
    expect(countLine(n, 2025)).toMatch(/i 2015 — ingen SSB-tall for 2025/)
    expect(rankLine(n, 2025)).toBeNull()
  })

  it('gir tydelig tekst når trend mangler', () => {
    expect(trendLine(null)).toMatch(/for lite data/i)
    expect(trendLine('rising')).toBe('Økende siste 5 år')
    expect(formatPercent(null)).toBe('–')
    expect(formatPercent(0.5)).toBe('50 %')
  })
})
