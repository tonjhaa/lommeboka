import type { Gender, NameRow } from './types'

/** Faktiske, mekaniske observasjoner — ingen «klang»-vurdering. */
export type ComboFlag = 'sameInitial' | 'repeatedJoin'

export interface Combo {
  first: NameRow
  middle: NameRow | null
  /** «Vilde Ingrid Hansen» */
  text: string
  /** «V.I.H.» */
  initials: string
  letters: number
  flags: ComboFlag[]
}

const letters = (s: string) => [...s].filter((ch) => /\p{L}/u.test(ch))
const firstLetter = (s: string) => letters(s)[0]?.toLowerCase() ?? ''
const lastLetter = (s: string) => letters(s).slice(-1)[0]?.toLowerCase() ?? ''

export const FLAG_LABEL: Record<ComboFlag, string> = {
  sameInitial: 'Samme forbokstav',
  repeatedJoin: 'Samme bokstav i skjøten',
}

/** Setter sammen fornavn, valgfritt mellomnavn og etternavn og flagger to mekaniske mønstre. */
export function buildCombo(first: NameRow, middle: NameRow | null, surname: string): Combo {
  const parts = [first.name, ...(middle ? [middle.name] : []), ...(surname.trim() ? [surname.trim()] : [])]
  const flags: ComboFlag[] = []
  if (middle && firstLetter(first.name) === firstLetter(middle.name)) flags.push('sameInitial')
  let repeated = false
  for (let i = 0; i + 1 < parts.length; i++) {
    if (lastLetter(parts[i]) !== '' && lastLetter(parts[i]) === firstLetter(parts[i + 1])) repeated = true
  }
  if (repeated) flags.push('repeatedJoin')
  return {
    first,
    middle,
    text: parts.join(' '),
    initials: parts.map((p) => `${firstLetter(p).toUpperCase()}.`).join(''),
    letters: parts.reduce((s, p) => s + letters(p).length, 0),
    flags,
  }
}

/** Kjønnene som finnes i poolen, jente først. */
export function gendersIn(pool: readonly NameRow[]): Gender[] {
  return (['girl', 'boy'] as const).filter((g) => pool.some((n) => n.gender === g))
}

/** Alle kombinasjoner for et valgt fornavn: uten mellomnavn, og med hvert av de andre navnene av samme kjønn som mellomnavn. */
export function buildCombos(first: NameRow, pool: readonly NameRow[], surname: string): Combo[] {
  const others = pool
    .filter((n) => n.id !== first.id && n.gender === first.gender)
    .sort((a, b) => a.name.localeCompare(b.name, 'nb'))
  return [buildCombo(first, null, surname), ...others.map((m) => buildCombo(first, m, surname))]
}
