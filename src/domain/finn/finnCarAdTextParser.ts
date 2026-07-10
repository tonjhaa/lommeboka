/**
 * Parser for TEKST brukeren selv limer inn fra en FINN-bilannonse.
 *
 * INGEN scraping — brukeren kopierer annonsetekst (hele eller deler) og
 * limer inn. Kopiering fra FINN gir typisk label og verdi på separate
 * linjer («Modellår⏎2025»), så mønstrene tåler linjeskift mellom label og
 * verdi. Parseren er bevisst forsiktig: felt som ikke gjenkjennes trygt
 * blir null, og UI viser hva som ble funnet slik at brukeren godkjenner
 * eller retter før tallene brukes.
 */

import { parseFlexibleNumber } from '@/utils/parseFlexibleNumber'
import type { FuelType } from '@/utils/carLoanCalculator'

export interface FinnCarAdTextResult {
  modelName: string | null
  price: number | null
  year: number | null
  mileageKm: number | null
  fuelType: FuelType | null
  gearbox: 'automat' | 'manuell' | null
  powerHp: number | null
  omregistreringsavgift: number | null
  /** Hvilke felt som faktisk ble gjenkjent — for «fant disse verdiene»-visning */
  foundFields: (keyof Omit<FinnCarAdTextResult, 'foundFields'>)[]
}

/** Verdi på samme linje som label, eller på neste linje (typisk FINN-kopiering) */
function labeledValue(text: string, labelPattern: string): string | null {
  const re = new RegExp(`(?:^|\\n)\\s*(?:${labelPattern})\\s*:?[ \\t]*\\n?[ \\t]*([^\\n]+)`, 'i')
  const m = text.match(re)
  return m ? m[1].trim() : null
}

function parseYear(text: string): number | null {
  const candidates = [
    labeledValue(text, 'Modellår|Årsmodell'),
    text.match(/1\.\s*gang\s*registrert\s*:?[\s\n]*\d{1,2}\.\d{1,2}\.(\d{4})/i)?.[1] ?? null,
  ]
  for (const c of candidates) {
    if (!c) continue
    const y = parseInt(c.match(/\d{4}/)?.[0] ?? '', 10)
    if (y >= 1950 && y <= 2040) return y
  }
  return null
}

function parseMileage(text: string): number | null {
  const raw = labeledValue(text, 'Kilometerstand|Km\\.?[- ]?stand|Kilometer')
  if (!raw) return null
  const n = parseFlexibleNumber(raw)
  return n !== null && n >= 0 && n < 2_000_000 ? Math.round(n) : null
}

function parsePrice(text: string): number | null {
  // Prioriter Totalpris > Prisantydning > Pris. Krev ≥ 5 000 kr for å unngå
  // å plukke opp gebyrer eller månedsbeløp fra annonseteksten.
  for (const label of ['Totalpris', 'Prisantydning', 'Pris']) {
    const raw = labeledValue(text, label)
    if (!raw) continue
    const n = parseFlexibleNumber(raw)
    if (n !== null && n >= 5_000) return Math.round(n)
  }
  return null
}

function parseFuelType(text: string): FuelType | null {
  // Ladbar hybrid gjenkjennes også i fritekst (modellbeskrivelser)
  if (/ladbar\s*hybrid|plug[\s-]?in/i.test(text)) return 'ladbar_hybrid'
  const raw = labeledValue(text, 'Drivstoff')
  if (!raw) return null
  const t = raw.toLowerCase()
  if (t.includes('hybrid')) return 'hybrid'
  if (t.includes('diesel')) return 'diesel'
  if (t.includes('bensin')) return 'bensin'
  if (t.includes('el')) return 'el'
  return null
}

function parseGearbox(text: string): 'automat' | 'manuell' | null {
  const raw = labeledValue(text, 'Girkasse|Girtype|Gir')
  if (!raw) return null
  const t = raw.toLowerCase()
  if (t.includes('automat')) return 'automat'
  if (t.includes('manuell')) return 'manuell'
  return null
}

function parsePowerHp(text: string): number | null {
  const m = text.match(/(\d{2,4})\s*(?:hk|hp)\b/i)
  if (!m) return null
  const hp = parseInt(m[1], 10)
  return hp >= 20 && hp <= 2500 ? hp : null
}

function parseOmreg(text: string): number | null {
  const m = text.match(/omregistrering(?:savgift)?\s*:?[ \t]*\n?[ \t]*([^\n]+)/i)
  if (!m) return null
  const n = parseFlexibleNumber(m[1])
  return n !== null && n > 0 && n < 100_000 ? Math.round(n) : null
}

const LABEL_LINE = /^(Totalpris|Pris|Kilometerstand|Modellår|Årsmodell|Drivstoff|Girkasse|Til salgs|Omregistrering|Effekt|Rekkevidde|Selger|FINN-kode)/i

function parseModelName(text: string): string | null {
  const firstLine = text.split('\n').map((l) => l.trim()).find((l) => l.length > 0)
  if (!firstLine) return null
  if (firstLine.length < 2 || firstLine.length > 60) return null
  if (LABEL_LINE.test(firstLine)) return null
  return firstLine
}

export function parseFinnCarAdText(text: string): FinnCarAdTextResult {
  const result: FinnCarAdTextResult = {
    modelName: parseModelName(text),
    price: parsePrice(text),
    year: parseYear(text),
    mileageKm: parseMileage(text),
    fuelType: parseFuelType(text),
    gearbox: parseGearbox(text),
    powerHp: parsePowerHp(text),
    omregistreringsavgift: parseOmreg(text),
    foundFields: [],
  }
  result.foundFields = (Object.keys(result) as (keyof FinnCarAdTextResult)[])
    .filter((k): k is FinnCarAdTextResult['foundFields'][number] =>
      k !== 'foundFields' && result[k] !== null)
  return result
}
