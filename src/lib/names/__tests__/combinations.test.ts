import { describe, it, expect } from 'vitest'
import { buildCombo, buildCombos } from '../combinations'
import { makeName } from './helpers'

const n = (name: string) => makeName({ id: name, name })

describe('buildCombo', () => {
  it('setter sammen fornavn, mellomnavn og etternavn med forbokstaver og bokstavtall', () => {
    const c = buildCombo(n('Vilde'), n('Ingrid'), 'Hansen')
    expect(c.text).toBe('Vilde Ingrid Hansen')
    expect(c.initials).toBe('V.I.H.')
    expect(c.letters).toBe(5 + 6 + 6)
    expect(c.flags).toEqual([])
  })

  it('flagger samme forbokstav uavhengig av store/små bokstaver', () => {
    expect(buildCombo(n('Nora'), n('nils'), 'Berg').flags).toContain('sameInitial')
  })

  it('flagger samme bokstav i skjøten (slutt + begynnelse), også mot etternavnet', () => {
    expect(buildCombo(n('Anna'), n('Astrid'), 'Berg').flags).toContain('repeatedJoin') // a|A
    expect(buildCombo(n('Vilde'), null, 'Eriksen').flags).toEqual(['repeatedJoin']) // e|E
    expect(buildCombo(n('Vilde'), null, 'Hansen').flags).toEqual([])
  })

  it('fungerer uten etternavn og uten mellomnavn, og ignorerer bindestrek i bokstavtelling', () => {
    const c = buildCombo(n('Anne-Lise'), null, '  ')
    expect(c.text).toBe('Anne-Lise')
    expect(c.initials).toBe('A.')
    expect(c.letters).toBe(8)
  })
})

describe('buildCombos', () => {
  it('gir «uten mellomnavn» først, deretter alle andre alfabetisk, uten fornavnet selv', () => {
    const list = buildCombos(n('Vilde'), [n('Vilde'), n('Ingrid'), n('Emma')], 'Berg')
    expect(list.map((c) => c.middle?.name ?? null)).toEqual([null, 'Emma', 'Ingrid'])
  })
})
