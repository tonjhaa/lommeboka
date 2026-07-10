import { describe, it, expect } from 'vitest'
import { parseFlexibleNumber } from '../parseFlexibleNumber'

describe('parseFlexibleNumber', () => {
  it('rene tall', () => {
    expect(parseFlexibleNumber('350000')).toBe(350_000)
    expect(parseFlexibleNumber('0')).toBe(0)
  })

  it('mellomrom som tusenskille (inkl. nbsp)', () => {
    expect(parseFlexibleNumber('350 000')).toBe(350_000)
    expect(parseFlexibleNumber('1 234 567')).toBe(1_234_567)
  })

  it('punktum som tusenskille', () => {
    expect(parseFlexibleNumber('350.000')).toBe(350_000)
    expect(parseFlexibleNumber('1.234.567')).toBe(1_234_567)
  })

  it('valutaprefiks og suffiks', () => {
    expect(parseFlexibleNumber('kr 350 000')).toBe(350_000)
    expect(parseFlexibleNumber('350 000 kr')).toBe(350_000)
    expect(parseFlexibleNumber('350 000,-')).toBe(350_000)
  })

  it('desimaltall med komma og punktum', () => {
    expect(parseFlexibleNumber('4,5')).toBe(4.5)
    expect(parseFlexibleNumber('4.5')).toBe(4.5)
    expect(parseFlexibleNumber('4,5 %')).toBe(4.5)
    expect(parseFlexibleNumber('4.5%')).toBe(4.5)
    expect(parseFlexibleNumber('4.25')).toBe(4.25)
  })

  it('blandet tusenskille og desimal — siste skilletegn er desimal', () => {
    expect(parseFlexibleNumber('1.234,56')).toBe(1234.56)
    expect(parseFlexibleNumber('1,234.56')).toBe(1234.56)
  })

  it('negative tall', () => {
    expect(parseFlexibleNumber('-500')).toBe(-500)
    expect(parseFlexibleNumber('-1 500,50')).toBe(-1500.5)
  })

  it('punktum + 3 sifre = tusenskille, komma = norsk desimal', () => {
    expect(parseFlexibleNumber('4.500')).toBe(4500)      // pengestil
    expect(parseFlexibleNumber('4,500')).toBe(4.5)       // norsk desimalkomma
    expect(parseFlexibleNumber('6,125')).toBe(6.125)     // rente med tre desimaler
    expect(parseFlexibleNumber('1,234,567')).toBe(1_234_567) // engelsk tusenskille
  })

  it('ugyldig input gir null', () => {
    expect(parseFlexibleNumber('')).toBeNull()
    expect(parseFlexibleNumber('abc')).toBeNull()
    expect(parseFlexibleNumber('kr')).toBeNull()
  })
})
