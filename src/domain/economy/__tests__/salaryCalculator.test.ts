import { describe, it, expect } from 'vitest'
import { parseForsvarsSlipp, calculateHolidayPay } from '../salaryCalculator'

// Representativt utdrag fra en ekte Forsvaret januar 2026-lønnsslippe.
// Norsk tallformat: punktum = tusenskille, komma = desimal, etterfølgende "-" = negativt.
const JAN_2026_SLIP = `
Lønnsavregning for Januar 2026
LTR  AB  61 SPENN
Ansattnr: 123456
1S01 Månedslønn 01.26 670.132 55.844,40
1501 Særtillegg 01.26 1.700,00
/440 Tabelltrekk 01.26 61.278,00 8010 18.478,00-
7000 Pensjonstrekk 01.26 1.150,80-
3020 Fagforeningskontingent 01.26 723,00-
3209 Husleie - Fam.bolig 01.26 7.315,93-
1620 Ekstra forskuddstrekk 01.26 1.000,00-
63.078,83 28.701,06- 34.377,77
57.544,40 6.905,33
`

describe('parseForsvarsSlipp — januar 2026', () => {
  const slip = parseForsvarsSlipp(JAN_2026_SLIP)

  it('parser periode korrekt', () => {
    expect(slip.periode.year).toBe(2026)
    expect(slip.periode.month).toBe(1)
  })

  it('parser ansattnummer', () => {
    expect(slip.ansattnummer).toBe('123456')
  })

  it('parser lønnstrinn fra LTR...SPENN', () => {
    expect(slip.loennstrinn).toBe(61)
  })

  it('parser månedslønn (1S01 — siste beløp)', () => {
    expect(slip.maanedslonn).toBeCloseTo(55844.40, 2)
  })

  it('parser skattetrekk (/440 — siste beløp, ikke tabellnummer)', () => {
    expect(slip.skattetrekk).toBeCloseTo(18478.00, 2)
  })

  it('parser pensjonstrekk (7000)', () => {
    expect(slip.pensjonstrekk).toBeCloseTo(1150.80, 2)
  })

  it('parser fagforeningskontingent (3020)', () => {
    expect(slip.fagforeningskontingent).toBeCloseTo(723.00, 2)
  })

  it('parser husleietrekk (3209)', () => {
    expect(slip.husleietrekk).toBeCloseTo(7315.93, 2)
  })

  it('parser ekstra forskuddstrekk (1620)', () => {
    expect(slip.ekstraTrekk).toBeCloseTo(1000.00, 2)
  })

  it('leser netto utbetalt fra netto-linjen (3. beløp)', () => {
    expect(slip.nettoUtbetalt).toBeCloseTo(34377.77, 2)
  })

  it('leser feriepengegrunnlag fra linjen etter netto (1. beløp)', () => {
    expect(slip.feriepengegrunnlag).toBeCloseTo(57544.40, 2)
  })

  it('alle beløp er positive (abs-verdier)', () => {
    expect(slip.maanedslonn).toBeGreaterThan(0)
    expect(slip.skattetrekk).toBeGreaterThan(0)
    expect(slip.pensjonstrekk).toBeGreaterThan(0)
    expect(slip.husleietrekk).toBeGreaterThan(0)
  })
})

describe('parseForsvarsSlipp — edge cases', () => {
  it('returnerer nullverdier ved tomt dokument', () => {
    const slip = parseForsvarsSlipp('')
    expect(slip.maanedslonn).toBe(0)
    expect(slip.skattetrekk).toBe(0)
    expect(slip.nettoUtbetalt).toBe(0)
    expect(slip.loennstrinn).toBe(0)
  })

  it('stopper ikke ved ukjente artskoder', () => {
    const text = `
Lønnsavregning for Februar 2026
1S01 Månedslønn 02.26 600.000 50.000,00
XXXX Ukjent tillegg 02.26 1.000,00
/440 Tabelltrekk 02.26 50.000,00 8010 15.000,00-
`
    expect(() => parseForsvarsSlipp(text)).not.toThrow()
  })

  it('netto beregnes fra artskoder dersom netto-linje mangler', () => {
    const text = `
Lønnsavregning for Mars 2026
1S01 Månedslønn 03.26 600.000 50.000,00
/440 Tabelltrekk 03.26 50.000,00 8010 15.000,00-
7000 Pensjonstrekk 03.26 1.000,00-
`
    const slip = parseForsvarsSlipp(text)
    // Netto = 50000 - 15000 - 1000 = 34000
    expect(slip.nettoUtbetalt).toBeCloseTo(34000, 0)
  })

  it('håndterer /441 som alternativt skattetrekk', () => {
    const text = `
Lønnsavregning for April 2026
1S01 Månedslønn 04.26 600.000 50.000,00
/441 Prosenttrekk 04.26 10.000,00-
`
    const slip = parseForsvarsSlipp(text)
    expect(slip.skattetrekk).toBeCloseTo(10000, 0)
  })
})

describe('parseForsvarsSlipp — tabelltrekk-grunnlag', () => {
  it('ekstraherer /440-grunnlag og -beløp korrekt', () => {
    const slip = parseForsvarsSlipp(JAN_2026_SLIP)
    // /440 Tabelltrekk 01.26 61.278,00 8010 18.478,00-
    expect(slip.tabelltrekkGrunnlag).toBeCloseTo(61278, 0)
    expect(slip.tabelltrekkBelop).toBeCloseTo(18478, 0)
  })

  it('effektiv trekkprosent = belop / grunnlag', () => {
    const slip = parseForsvarsSlipp(JAN_2026_SLIP)
    const pct = (slip.tabelltrekkBelop / slip.tabelltrekkGrunnlag) * 100
    expect(pct).toBeCloseTo(30.15, 1)
  })

  it('returnerer 0 ved manglende /440-linje', () => {
    const text = `
Lønnsavregning for Februar 2026
1S01 Månedslønn 02.26 600.000 50.000,00
7000 Pensjonstrekk 02.26 1.000,00-
`
    const slip = parseForsvarsSlipp(text)
    expect(slip.tabelltrekkGrunnlag).toBe(0)
    expect(slip.tabelltrekkBelop).toBe(0)
  })
})

describe('parseForsvarsSlipp — ATF-satser', () => {
  it('ekstraherer sats for 2230 når antall=1 (NOK-format: 1,00)', () => {
    const text = `
Lønnsavregning for April 2025
1S01 Månedslønn 04.25 627.110 52.259,17
2230 Øvelse døgn Ma-Fr 04.25 1,00 5.709,40 5.709,40
63.968,57 28.000,00- 35.968,57
181.974,45 21.836,94
`
    const slip = parseForsvarsSlipp(text)
    expect(slip.atfRater?.['2230']).toBeCloseTo(5709.40, 2)
  })

  it('ekstraherer sats korrekt når antall=2 (NOK-format: 2,00)', () => {
    const text = `
Lønnsavregning for April 2025
1S01 Månedslønn 04.25 627.110 52.259,17
2230 Øvelse døgn Ma-Fr 04.25 2,00 5.709,40 11.418,80
63.968,57 28.000,00- 35.968,57
181.974,45 21.836,94
`
    const slip = parseForsvarsSlipp(text)
    expect(slip.atfRater?.['2230']).toBeCloseTo(5709.40, 2)
  })

  it('beholder høyeste sats ved to forekomster av 2230 (lønnsoppgjør)', () => {
    const text = `
Lønnsavregning for Desember 2025
1S01 Månedslønn 12.25 670.132 55.844,40
2230 Øvelse døgn Ma-Fr 11.25 1,00 6.476,20 6.476,20
2230 Øvelse døgn Ma-Fr 12.25 1,00 6.764,20 6.764,20
63.078,83 28.000,00- 35.078,83
688.548,00 82.625,76
`
    const slip = parseForsvarsSlipp(text)
    expect(slip.atfRater?.['2230']).toBeCloseTo(6764.20, 2)
  })

  it('returnerer undefined atfRater når ingen øvelse-artskoder finnes', () => {
    const text = `
Lønnsavregning for Januar 2026
1S01 Månedslønn 01.26 670.132 55.844,40
/440 Tabelltrekk 01.26 61.278,00 8010 18.478,00-
63.078,83 28.000,00- 35.078,83
57.544,40 6.905,33
`
    const slip = parseForsvarsSlipp(text)
    expect(slip.atfRater).toBeUndefined()
  })

  it('ekstraherer 2236 timesats korrekt (NOK-format: 4,00)', () => {
    const text = `
Lønnsavregning for April 2025
1S01 Månedslønn 04.25 627.110 52.259,17
2236 Øvelse pr t Ma-Fr 04.25 4,00 356,80 1.427,20
63.968,57 28.000,00- 35.968,57
181.974,45 21.836,94
`
    const slip = parseForsvarsSlipp(text)
    expect(slip.atfRater?.['2236']).toBeCloseTo(356.80, 2)
  })

  it('ekstraherer atfBeløp som sum av alle ATF-linjer', () => {
    const text = `
Lønnsavregning for April 2026
1S01 Månedslønn 04.26 670.132 55.844,40
2230 Øvelse døgn Ma-Fr 03.26 7,00 6.088,00 42.616,00
2232 Øvelse døgn Lø-Sø 03.26 2,00 9.498,10 18.996,20
2236 Øvelse pr t Ma-Fr 03.26 16,00 380,50 6.088,00
10P2 Fungering pensgj 04.26 100,00 6.406,62
/440 Tabelltrekk 04.26 135.466,00 8010 57.683,00-
69.694,04 68.370,69- 67.700,20 69.023,55
313.625,67 37.635,08
336.047,25 4.731,30- 121.337,00-
`
    const slip = parseForsvarsSlipp(text)
    expect(slip.atfBeløp).toBeCloseTo(42616 + 18996.20 + 6088, 0)
    expect(slip.fungeringBeløp).toBeCloseTo(6406.62, 2)
    expect(slip.atfRater?.['2230']).toBeCloseTo(6088, 0)
    expect(slip.atfRater?.['2232']).toBeCloseTo(9498.10, 2)
    expect(slip.atfRater?.['2236']).toBeCloseTo(380.50, 2)
  })
})

describe('parseForsvarsSlipp — korreksjonsslipper (lønnsoppgjør/etterbetaling)', () => {
  // Utdrag fra ekte februar 2026-slipp: gammel ATF-postering reversert (negativt antall),
  // ny postering med oppjustert sats. Netto ATF-effekt = 27.056,80 − 25.904,80 = 1.152,00.
  it('atfBeløp = signert nettosum når reverseringspar finnes', () => {
    const text = `
Lønnsavregning for Februar 2026
2230 Øvelse døgn Ma-Fr 11.25 4,00- 6.476,20 25.904,80-
2230 Øvelse døgn Ma-Fr 11.25 4,00 6.764,20 27.056,80
1S01 Månedslønn 02.26 670.132 55.844,40
/440 Tabelltrekk 02.26 61.278,00 8010 18.478,00-
63.078,83 32.738,06- 9.177,75 39.518,52
124.430,05 14.931,61
`
    const slip = parseForsvarsSlipp(text)
    expect(slip.atfBeløp).toBeCloseTo(1152.00, 2)
    expect(slip.atfRater?.['2230']).toBeCloseTo(6764.20, 2)
  })

  // Utdrag fra ekte november 2025-slipp: OF19-korreksjoner for juni etter lønnsoppgjør.
  // Netto = +60.146,00 − 64.145,50 − 2.212,00 + 2.074,00 = −4.137,50 (ekstra trekk).
  it('ferietrekk = netto av OF19-korreksjonslinjer, ikke abs-sum', () => {
    const text = `
Lønnsavregning for November 2025
OF19 Ferietrekk ordinært 06.25 2.405,84 60.146,00
OF19 Ferietrekk ordinært 06.25 2.565,82 64.145,50-
OF19 Ferietrekk ordinært 06.25 25,00- 88,48 2.212,00-
OF19 Ferietrekk ordinært 06.25 25,00 82,96 2.074,00
1S01 Månedslønn 11.25 670.132 55.844,40
/440 Tabelltrekk 11.25 61.278,00 8030 18.672,00-
63.078,83 35.413,06- 17.164,50 44.830,27
594.068,00 71.288,19
`
    const slip = parseForsvarsSlipp(text)
    expect(slip.ferietrekk).toBeCloseTo(4137.50, 2)
    const of19 = slip.trekk.find((t) => t.artskode === 'OF19')
    expect(of19?.belop).toBeCloseTo(-4137.50, 2)
  })

  // Vanlig junislipp: begge OF19-linjer er trekk — netto skal fortsatt bli summen.
  it('ferietrekk i ordinær juni summeres som før (begge linjer negative)', () => {
    const text = `
Lønnsavregning for Juni 2026
OF19 Ferietrekk ordinært 06.26 25,00- 88,48 2.212,00-
OF19 Ferietrekk ordinært 06.26 2.565,82 64.145,50-
1S01 Månedslønn 06.26 670.132 55.844,40
OF11 Utbet.FP ord. i ferieår 06.26 82.625,79
/440 Tabelltrekk 06.26 11.566,00 8010 960,00-
85.962,33 11.647,69- 10.157,60 84.472,24
385.327,81 46.239,33
`
    const slip = parseForsvarsSlipp(text)
    expect(slip.ferietrekk).toBeCloseTo(66357.50, 2)
    expect(slip.feriepenger).toBeCloseTo(82625.79, 2)
  })

  // Utdrag fra ekte februar 2026-slipp: tre etterbetalte 10P2-linjer (okt–des),
  // ingen fungering i inneværende måned. Faktisk utbetalt = 3 × 2.729,75.
  it('fungeringBeløp = sum av alle 10P2-linjer, ikke bare siste', () => {
    const text = `
Lønnsavregning for Februar 2026
10P2 Fungering pensgj 10.25 2.729,75
10P2 Fungering pensgj 11.25 2.729,75
10P2 Fungering pensgj 12.25 2.729,75
1S01 Månedslønn 02.26 670.132 55.844,40
/440 Tabelltrekk 02.26 61.278,00 8010 18.478,00-
63.078,83 32.738,06- 9.177,75 39.518,52
124.430,05 14.931,61
`
    const slip = parseForsvarsSlipp(text)
    expect(slip.fungeringBeløp).toBeCloseTo(3 * 2729.75, 2)
  })

  // Utdrag fra ekte desember 2021-slipp: ulønnet fravær (2713/2700) reduserer brutto.
  // Slippens "Brutto denne måned" = 45.291,70 − 2.088,80 − 6.266,40 = 36.936,50.
  it('trekker ulønnet fravær (2700/2713) fra bruttoSum', () => {
    const text = `
Lønnsavregning for Desember 2021
1001 Månedslønn 12.21 45.291,70
2713 Annet fravær u/lønn < 1mn12.21 1,00- 2.088,80 2.088,80-
2700 Ferie u/lønn 12.21 3,00- 2.088,80 6.266,40-
7000 Pensjonstrekk 12.21 738,70-
/441 Trukket %-trekk 12.21 36.271,00 22 % 3.989,00-
36.936,50 5.706,03- 31.230,47
172.811,60 20.737,38
`
    const slip = parseForsvarsSlipp(text)
    expect(slip.fravaerstrekk).toBeCloseTo(2088.80 + 6266.40, 2)
    expect(slip.bruttoSum).toBeCloseTo(36936.50, 2)
  })

  // Fra ekte juni 2026-slipp: artskode 2250 (Øvelse døgn IP) manglet i ATF-settet.
  it('teller 2250 Øvelse døgn IP som ATF', () => {
    const text = `
Lønnsavregning for Juni 2026
2250 Øvelse døgn IP Ma-Fr 05.26 1,00 10.157,60 10.157,60
1S01 Månedslønn 06.26 670.132 55.844,40
/440 Tabelltrekk 06.26 11.566,00 8010 960,00-
85.962,33 11.647,69- 10.157,60 84.472,24
385.327,81 46.239,33
`
    const slip = parseForsvarsSlipp(text)
    expect(slip.atfBeløp).toBeCloseTo(10157.60, 2)
    expect(slip.atfRater?.['2250']).toBeCloseTo(10157.60, 2)
  })
})

describe('calculateHolidayPay', () => {
  it('beregner korrekt feriepengeprosent (12%)', () => {
    const basis = 670_128
    const result = calculateHolidayPay(basis, 670_128)
    expect(result.holidayPay).toBeCloseTo(basis * 0.12, 0)
  })

  it('beregner ferietrekk = årslønn / 260 × 25', () => {
    const annualSalary = 600_000
    const result = calculateHolidayPay(annualSalary, annualSalary)
    expect(result.holidayLeaveDeduction).toBeCloseTo((annualSalary / 260) * 25, 0)
  })

  it('netto juni = månedslønn + feriepenger − ferietrekk', () => {
    const annualSalary = 600_000
    const result = calculateHolidayPay(annualSalary, annualSalary)
    const expected = annualSalary / 12 + result.holidayPay - result.holidayLeaveDeduction
    expect(result.netJune).toBeCloseTo(expected, 0)
  })

  it('netto juni er positiv for normalarbeidstaker', () => {
    const result = calculateHolidayPay(700_000, 700_000)
    expect(result.netJune).toBeGreaterThan(0)
  })
})
