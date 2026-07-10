import { describe, it, expect } from 'vitest'
import { mapKjoretoyResponse, isValidRegnr } from '../kjoretoyMapper'

// Fixture bygget etter Autosys akfell-datautlevering enkeltoppslag-struktur
const FIXTURE_EL = {
  kjoretoydataListe: [{
    forstegangsregistrering: { registrertForstegangNorgeDato: '2019-03-12' },
    periodiskKjoretoyKontroll: { kontrollfrist: '2027-03-31' },
    godkjenning: {
      tekniskGodkjenning: {
        tekniskeData: {
          generelt: {
            merke: [{ merke: 'NISSAN' }],
            handelsbetegnelse: ['LEAF'],
          },
          motorOgDrivverk: {
            motor: [{ drivstoff: [{ drivstoffKode: { kodeNavn: 'Elektrisk' } }] }],
          },
        },
      },
    },
  }],
}

const FIXTURE_HYBRID = {
  kjoretoydataListe: [{
    godkjenning: {
      forstegangsGodkjenning: { forstegangRegistrertDato: '2021-06-01' },
      tekniskGodkjenning: {
        tekniskeData: {
          generelt: { merke: [{ merke: 'TOYOTA' }], handelsbetegnelse: ['RAV4'] },
          motorOgDrivverk: {
            motor: [
              { drivstoff: [{ drivstoffKode: { kodeNavn: 'Bensin' } }] },
              { drivstoff: [{ drivstoffKode: { kodeNavn: 'Elektrisk' } }] },
            ],
          },
        },
      },
    },
  }],
}

describe('mapKjoretoyResponse', () => {
  it('mapper elbil: modell, år, drivstoff og EU-frist', () => {
    const d = mapKjoretoyResponse(FIXTURE_EL)
    expect(d.modelName).toBe('NISSAN LEAF')
    expect(d.year).toBe(2019)
    expect(d.fuelType).toBe('el')
    expect(d.euControlDeadline).toBe('2027-03-31')
  })

  it('bensin + elektrisk motor mappes til hybrid', () => {
    const d = mapKjoretoyResponse(FIXTURE_HYBRID)
    expect(d.fuelType).toBe('hybrid')
    expect(d.year).toBe(2021) // fallback til forstegangsGodkjenning
  })

  it('tomt/ukjent svar gir null-felt, ingen krasj', () => {
    const d = mapKjoretoyResponse({})
    expect(d.modelName).toBeNull()
    expect(d.year).toBeNull()
    expect(d.fuelType).toBeNull()
    expect(d.euControlDeadline).toBeNull()
  })
})

describe('isValidRegnr', () => {
  it('godtar norske kjennemerker med og uten mellomrom', () => {
    expect(isValidRegnr('EK12345')).toBe(true)
    expect(isValidRegnr('ek 12345')).toBe(true)
    expect(isValidRegnr('AB1234')).toBe(true)
  })

  it('avviser ugyldige formater', () => {
    expect(isValidRegnr('123456')).toBe(false)
    expect(isValidRegnr('ABC123')).toBe(false)
    expect(isValidRegnr('')).toBe(false)
  })
})
