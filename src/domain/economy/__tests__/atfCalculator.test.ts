import { describe, it, expect } from 'vitest'
import {
  calculateATF,
  calculateATFRates,
  beregnTimesatsATab,
  beregnOT50Sats,
  sumATFByYear,
  beregnATFFromDates,
  beregnATFMedPlanstatus,
  applyFørsteDøgnTillegg,
  beregnHTAOvertidFromDates,
  sumATFDatoRader,
} from '../atfCalculator'
import type { ATFEntry, ATFDatoRad } from '@/types/economy'

const ÅRSLØNN = 670_128 // 55 844 × 12

describe('beregnTimesatsATab', () => {
  it('er årslønn / 1850', () => {
    const sats = beregnTimesatsATab(ÅRSLØNN)
    expect(sats).toBeCloseTo(ÅRSLØNN / 1850, 2)
  })
})

describe('beregnOT50Sats', () => {
  it('er timesats × 1.5', () => {
    const timesats = beregnTimesatsATab(ÅRSLØNN)
    const ot50 = beregnOT50Sats(ÅRSLØNN)
    expect(ot50).toBeCloseTo(timesats * 1.5, 2)
  })
})

describe('calculateATF', () => {
  it('beregner dagssats hverdag korrekt', () => {
    const entry: ATFEntry = {
      id: '1',
      year: 2026,
      øvelsesnavn: 'Test',
      perioder: [{ kode: 'ØV_MAN_FRE', antallDager: 4 }],
      beregnetBeløp: 0,
      tidskompensasjonTimer: 0,
    }
    const result = calculateATF(entry, ÅRSLØNN)
    const timesats = ÅRSLØNN / 1850
    const dagssats = timesats * 7.5
    expect(result.totalEconomy).toBeCloseTo(dagssats * 4, 0)
  })

  it('beregner dagssats helg med helgetillegg (+65 kr/t)', () => {
    const entry: ATFEntry = {
      id: '1',
      year: 2026,
      øvelsesnavn: 'Test helg',
      perioder: [{ kode: 'ØV_LØR_SØN', antallDager: 2 }],
      beregnetBeløp: 0,
      tidskompensasjonTimer: 0,
    }
    const result = calculateATF(entry, ÅRSLØNN)
    const timesats = ÅRSLØNN / 1850
    const satsPerTime = timesats + 65 // helgetillegg
    const dagssats = satsPerTime * 8  // HE = 8 timer
    expect(result.totalEconomy).toBeCloseTo(dagssats * 2, 0)
  })

  it('beregner OT 50% korrekt', () => {
    const entry: ATFEntry = {
      id: '1',
      year: 2026,
      øvelsesnavn: 'Test OT',
      perioder: [{ kode: 'ØV_OT_50_MAN_FRE', antallTimer: 6 }],
      beregnetBeløp: 0,
      tidskompensasjonTimer: 0,
    }
    const result = calculateATF(entry, ÅRSLØNN)
    const ot50 = (ÅRSLØNN / 1850) * 1.5
    expect(result.totalEconomy).toBeCloseTo(ot50 * 6, 0)
  })

  it('summerer flere perioder', () => {
    const entry: ATFEntry = {
      id: '1',
      year: 2026,
      øvelsesnavn: 'Kombinert',
      perioder: [
        { kode: 'ØV_MAN_FRE', antallDager: 3 },
        { kode: 'ØV_LØR_SØN', antallDager: 1 },
      ],
      beregnetBeløp: 0,
      tidskompensasjonTimer: 0,
    }
    const result = calculateATF(entry, ÅRSLØNN)
    const timesats = ÅRSLØNN / 1850
    const hverdagSum = timesats * 7.5 * 3
    const helgSum = (timesats + 65) * 8 * 1
    expect(result.totalEconomy).toBeCloseTo(hverdagSum + helgSum, 0)
  })

  it('beregner tidskompensasjonTimer (dager × 7.5)', () => {
    const entry: ATFEntry = {
      id: '1',
      year: 2026,
      øvelsesnavn: 'Test',
      perioder: [{ kode: 'ØV_MAN_FRE', antallDager: 4 }],
      beregnetBeløp: 0,
      tidskompensasjonTimer: 0,
    }
    const result = calculateATF(entry, ÅRSLØNN)
    expect(result.tidskompensasjonTimer).toBe(4 * 7.5)
  })
})

// ------------------------------------------------------------
// ATF pkt 5.2.1 — Ikke-planlagt aktivitet
// ------------------------------------------------------------

describe('applyFørsteDøgnTillegg', () => {
  it('tom liste returneres uendret', () => {
    expect(applyFørsteDøgnTillegg([])).toEqual([])
  })

  it('første dag-rader får sats/beløp × 1.5 og isFirstDayBonus=true', () => {
    const rows: ATFDatoRad[] = [
      { dato: '2026-03-02', dagType: 'hverdag', artskode: '2242', beskrivelse: 'Test', antall: 4, enhet: 'timer', sats: 100, belop: 400 },
      { dato: '2026-03-03', dagType: 'hverdag', artskode: '2230', beskrivelse: 'Test2', antall: 1, enhet: 'døgn', sats: 500, belop: 500 },
    ]
    const result = applyFørsteDøgnTillegg(rows)
    expect(result[0].sats).toBeCloseTo(150, 2)
    expect(result[0].belop).toBeCloseTo(600, 2)
    expect(result[0].isFirstDayBonus).toBe(true)
    expect(result[0].beskrivelse).toContain('+50 %')
    // Andre dag uendret
    expect(result[1].sats).toBe(500)
    expect(result[1].belop).toBe(500)
    expect(result[1].isFirstDayBonus).toBeUndefined()
  })

  it('alle rader på første dato merkes — ikke bare den første raden', () => {
    const rows: ATFDatoRad[] = [
      { dato: '2026-03-02', dagType: 'hverdag', artskode: '2242', beskrivelse: 'A', antall: 7, enhet: 'timer', sats: 100, belop: 700 },
      { dato: '2026-03-02', dagType: 'hverdag', artskode: '2236', beskrivelse: 'B', antall: 2, enhet: 'timer', sats: 60, belop: 120 },
      { dato: '2026-03-03', dagType: 'hverdag', artskode: '2230', beskrivelse: 'C', antall: 1, enhet: 'døgn', sats: 500, belop: 500 },
    ]
    const result = applyFørsteDøgnTillegg(rows)
    expect(result[0].isFirstDayBonus).toBe(true)
    expect(result[1].isFirstDayBonus).toBe(true)
    expect(result[2].isFirstDayBonus).toBeUndefined()
  })
})

describe('beregnHTAOvertidFromDates', () => {
  const SALARY = 720_100

  it('bruker OT 100 % (timesats × 2)', () => {
    const fra = new Date(2026, 2, 2, 8, 0)  // Man 08:00
    const til = new Date(2026, 2, 2, 12, 0) // Man 12:00 — 4 timer
    const rows = beregnHTAOvertidFromDates(fra, til, SALARY)
    expect(rows).toHaveLength(1)
    const ot100 = (SALARY / 1850) * 2
    expect(rows[0].sats).toBeCloseTo(ot100, 2)
    expect(rows[0].antall).toBe(4)
    expect(rows[0].artskode).toBe('HTA-OT')
    expect(rows[0].enhet).toBe('timer')
  })

  it('spanner over to dager', () => {
    const fra = new Date(2026, 2, 2, 20, 0) // Man 20:00
    const til = new Date(2026, 2, 3, 6, 0)  // Tir 06:00
    const rows = beregnHTAOvertidFromDates(fra, til, SALARY)
    expect(rows).toHaveLength(2)
    expect(rows[0].dato).toBe('2026-03-02')
    expect(rows[1].dato).toBe('2026-03-03')
  })
})

describe('beregnATFMedPlanstatus', () => {
  const SALARY = 720_100
  // Man 2026-03-02 15:30 → Fre 2026-03-06 07:30
  // Gir startdag (man) + 3 midtdager (tir/ons/tor) + sluttdag (fre)
  const FRA = new Date(2026, 2, 2, 15, 30)
  const TIL = new Date(2026, 2, 6, 7, 30)

  it('Scenario 1 — Planlagt + døgn: normal ATF, rule=planned_atf, ingen bonus', () => {
    const { rows, appliedRule } = beregnATFMedPlanstatus(FRA, TIL, SALARY, 0, 'døgn', undefined, 'planned')
    expect(appliedRule).toBe('planned_atf')
    // Identisk med beregnATFFromDates
    const expected = beregnATFFromDates(FRA, TIL, SALARY, 0, 'døgn')
    expect(sumATFDatoRader(rows)).toBeCloseTo(sumATFDatoRader(expected), 2)
    expect(rows.every(r => !r.isFirstDayBonus)).toBe(true)
  })

  it('Scenario 2 — Ikke-planlagt + døgn, ingen midtdager (samme dag): kun startdag med +50 %', () => {
    const fra = new Date(2026, 2, 2, 15, 30) // Man 15:30
    const til = new Date(2026, 2, 2, 23, 30) // Man 23:30 (samme dag)
    const { rows, appliedRule } = beregnATFMedPlanstatus(fra, til, SALARY, 0, 'døgn', undefined, 'unplanned')
    expect(appliedRule).toBe('unplanned_daily_atf_first50')
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every(r => r.isFirstDayBonus)).toBe(true)
  })

  it('Scenario 3 — Ikke-planlagt + døgn, 1 midtdag: første dato +50 %, midtdag normal', () => {
    const fra = new Date(2026, 2, 2, 15, 30) // Man 15:30
    const til = new Date(2026, 2, 4, 7, 30)  // Ons 07:30 — 1 midtdag (tir)
    const { rows, appliedRule } = beregnATFMedPlanstatus(fra, til, SALARY, 0, 'døgn', undefined, 'unplanned')
    expect(appliedRule).toBe('unplanned_daily_atf_first50')
    const firstDate = rows[0].dato
    expect(rows.filter(r => r.dato === firstDate).every(r => r.isFirstDayBonus)).toBe(true)
    expect(rows.filter(r => r.dato !== firstDate).every(r => !r.isFirstDayBonus)).toBe(true)
  })

  it('Scenario 4 — Ikke-planlagt + døgn, 4 dager: totalbeløp er større enn planlagt', () => {
    const { rows: unplanned } = beregnATFMedPlanstatus(FRA, TIL, SALARY, 0, 'døgn', undefined, 'unplanned')
    const { rows: planned } = beregnATFMedPlanstatus(FRA, TIL, SALARY, 0, 'døgn', undefined, 'planned')
    expect(sumATFDatoRader(unplanned)).toBeGreaterThan(sumATFDatoRader(planned))
    // Kun første dato har bonus
    const firstDate = unplanned[0].dato
    expect(unplanned.filter(r => r.dato === firstDate).every(r => r.isFirstDayBonus)).toBe(true)
    expect(unplanned.filter(r => r.dato !== firstDate).every(r => !r.isFirstDayBonus)).toBe(true)
  })

  it('Scenario 5 — Ikke-planlagt + time: HTA-overtid OT 100 %, rule=unplanned_hourly_hta_ot', () => {
    const fra = new Date(2026, 2, 2, 9, 0)  // Man 09:00
    const til = new Date(2026, 2, 2, 14, 0) // Man 14:00 — 5 timer
    const { rows, appliedRule } = beregnATFMedPlanstatus(fra, til, SALARY, 0, 'time', undefined, 'unplanned')
    expect(appliedRule).toBe('unplanned_hourly_hta_ot')
    expect(rows.every(r => r.artskode === 'HTA-OT')).toBe(true)
    const ot100 = (SALARY / 1850) * 2
    expect(rows[0].sats).toBeCloseTo(ot100, 2)
    expect(rows[0].antall).toBe(5)
  })

  it('Scenario 6 — Planlagt + time: vanlige ATF-timesatser, ikke HTA-OT', () => {
    const fra = new Date(2026, 2, 2, 9, 0)
    const til = new Date(2026, 2, 2, 14, 0)
    const { rows, appliedRule } = beregnATFMedPlanstatus(fra, til, SALARY, 0, 'time', undefined, 'planned')
    expect(appliedRule).toBe('planned_atf')
    expect(rows.every(r => r.artskode !== 'HTA-OT')).toBe(true)
    // Planlagt time skal gi lavere beløp enn HTA-OT
    const { rows: unplannedRows } = beregnATFMedPlanstatus(fra, til, SALARY, 0, 'time', undefined, 'unplanned')
    expect(sumATFDatoRader(unplannedRows)).toBeGreaterThan(sumATFDatoRader(rows))
  })
})

describe('sumATFByYear', () => {
  it('summerer beregnetBeløp for riktig år', () => {
    const entries: ATFEntry[] = [
      { id: '1', year: 2026, øvelsesnavn: 'Ø1', perioder: [], beregnetBeløp: 5000, tidskompensasjonTimer: 0 },
      { id: '2', year: 2026, øvelsesnavn: 'Ø2', perioder: [], beregnetBeløp: 3000, tidskompensasjonTimer: 0 },
      { id: '3', year: 2025, øvelsesnavn: 'Ø3', perioder: [], beregnetBeløp: 7000, tidskompensasjonTimer: 0 },
    ]
    expect(sumATFByYear(entries, 2026)).toBe(8000)
    expect(sumATFByYear(entries, 2025)).toBe(7000)
    expect(sumATFByYear(entries, 2024)).toBe(0)
  })
})

describe('calculateATFRates — HTA-tillegg i lønnsgrunnlag', () => {
  // Grunnlønn 670 132 kr/år (55 844,40/mnd), HTA 1 700/mnd = 20 400/år.
  // Basis = 690 532. ts = 690 532 / 1850 = 373,26. Hverdag-dagssats = 6 088 kr.
  // Bekreftet fra ekte Cold Response-slipp april 2026.
  const GRUNNLONN = 670_132
  const HTA_AARLIG = 20_400 // 1 700/mnd × 12

  it('uten HTA: hverdag-dagssats ca 5 909 kr', () => {
    const rates = calculateATFRates(GRUNNLONN, 0)
    expect(rates.ovingHverdag).toBeCloseTo(5909, 0)
  })

  it('med HTA 20 400 kr/år: hverdag-dagssats matcher slipp (6 088 kr)', () => {
    const rates = calculateATFRates(GRUNNLONN, HTA_AARLIG)
    expect(rates.ovingHverdag).toBeCloseTo(6088, 0)
  })

  it('med HTA: pr t hverdag-sats matcher slipp (380,50 kr/t)', () => {
    const rates = calculateATFRates(GRUNNLONN, HTA_AARLIG)
    expect(rates.ovingPrTimeHverdag).toBeCloseTo(380.50, 1)
  })

  it('med HTA + fungering 6 406,62/mnd: ovingHverdag × 1,5 ≈ 2250-sats fra slipp (10 157,60)', () => {
    // U19 (mai 2026): grunnlønn + HTA + fungering = 767 412 kr/år
    const FUNGERING_AARLIG = 6_406.62 * 12
    const rates = calculateATFRates(GRUNNLONN + FUNGERING_AARLIG, HTA_AARLIG)
    const sats2250 = rates.ovingHverdag * 1.5 // IP-type: hverdag-dagssats × 1,5
    // Avrundingsavvik < 20 kr (formelkonstanters presisjon)
    expect(Math.abs(sats2250 - 10_157.60)).toBeLessThan(20)
  })

  it('fixedAdditions=0 er bakoverkompatibelt', () => {
    const ratesOld = calculateATFRates(GRUNNLONN)
    const ratesNew = calculateATFRates(GRUNNLONN, 0)
    expect(ratesOld.ovingHverdag).toBeCloseTo(ratesNew.ovingHverdag, 2)
  })
})
