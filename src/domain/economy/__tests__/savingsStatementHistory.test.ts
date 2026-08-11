import { describe, it, expect } from 'vitest'
import { parseBankStatementFromCSV, parseAmount, tokenizeCSV } from '../bankTransactionParser'
import { buildStatementHistory } from '../savingsStatementHistory'
import { computeAccountHistory, computeEffectiveBalance, computeYTDContributions } from '../savingsCalculator'
import type { SavingsAccount } from '@/types/economy'

const HEADER =
  'Utført dato;Bokført dato;Rentedato;Beskrivelse;Type;Undertype;Fra konto;Avsender;' +
  'Til konto;Mottakernavn;Beløp inn;Beløp ut;Valuta;Status;Melding/KID/Fakt.nr'

function row(opts: {
  date: string
  desc?: string
  type: string
  inn?: string
  ut?: string
  status?: string
  melding?: string
}) {
  return [
    opts.date, opts.date, opts.date,
    opts.desc ?? 'Overføring',
    opts.type, '', '', '', '4345 11 55254', 'BSU',
    opts.inn ?? '', opts.ut ?? '', 'NOK',
    opts.status ?? 'Bokført',
    opts.melding ?? '',
  ].join(';')
}

describe('tokenizeCSV', () => {
  it('holder siterte felt med linjeskift og semikolon samlet', () => {
    const csv = 'a;b;c\n1;2;"linje1\nlinje2;med semikolon"\n'
    const rows = tokenizeCSV(csv)
    expect(rows).toHaveLength(2)
    expect(rows[1]).toEqual(['1', '2', 'linje1\nlinje2;med semikolon'])
  })

  it('tolker escapet hermetegn', () => {
    expect(tokenizeCSV('a\n"si ""hei"""\n')[1]).toEqual(['si "hei"'])
  })
})

describe('parseAmount', () => {
  it.each([
    ['1000', 1000],
    ['1277.27', 1277.27],
    ['160 920,14', 160920.14],
    ['160.920,14', 160920.14],
    ['160,920.14', 160920.14],
    ['', 0],
  ])('%s → %s', (input, expected) => {
    expect(parseAmount(input)).toBe(expected)
  })
})

describe('parseBankStatementFromCSV — startsaldo', () => {
  it('utleder startsaldo når arkivet er kortere enn kontoens levetid', () => {
    // Banken sier inngående saldo = 0, men utgående saldo er 5 000 mens
    // transaksjonene bare forklarer 3 000. Da må 2 000 ha ligget der fra før.
    const csv = [
      HEADER,
      row({ date: '10.03.2024', type: 'Overføring', inn: '1000' }),
      row({ date: '10.04.2024', type: 'Overføring', inn: '2000' }),
      'Inngående saldo pr. 01.01.2014:;;0,00 NOK',
      'Utgående  saldo pr. 10.04.2024:;;5 000,00 NOK',
    ].join('\n')

    const parsed = parseBankStatementFromCSV(csv)
    expect(parsed.openingBalance).toBe(2000)
    expect(parsed.closingBalance).toBe(5000)
    // Startsaldoen gjelder dagen før første transaksjon
    expect(parsed.openingDate).toBe('2024-03-09')
  })

  it('beholder bankens startsaldo når den stemmer med transaksjonene', () => {
    const csv = [
      HEADER,
      row({ date: '10.03.2024', type: 'Overføring', inn: '1000' }),
      'Inngående saldo pr. 01.01.2024:;;500,00 NOK',
      'Utgående  saldo pr. 10.03.2024:;;1 500,00 NOK',
    ].join('\n')
    expect(parseBankStatementFromCSV(csv).openingBalance).toBe(500)
  })

  it('markerer reserverte transaksjoner som ikke bokført', () => {
    const csv = [
      HEADER,
      row({ date: '10.03.2024', type: 'Overføring', inn: '1000', status: 'Reservert' }),
    ].join('\n')
    expect(parseBankStatementFromCSV(csv).transactions[0].booked).toBe(false)
  })
})

describe('buildStatementHistory', () => {
  /**
   * To hele år med renteposteringer 31.12, slik BSU faktisk fungerer.
   * Startsaldo 10 000, 1 000 inn hver måned, renter 500 (2023) og 800 (2024).
   */
  function twoYearStatement() {
    const rows = [HEADER]
    for (const year of ['2023', '2024']) {
      for (let m = 1; m <= 12; m++) {
        rows.push(row({ date: `10.${String(m).padStart(2, '0')}.${year}`, type: 'Overføring', inn: '1000' }))
      }
      rows.push(row({ date: `31.12.${year}`, type: 'Renter', inn: year === '2023' ? '500' : '800' }))
    }
    // 10 000 + 24 000 innskudd + 1 300 renter = 35 300
    rows.push('Inngående saldo pr. 01.01.2013:;;0,00 NOK')
    rows.push('Utgående  saldo pr. 31.12.2024:;;35 300,00 NOK')
    return parseBankStatementFromCSV(rows.join('\n'))
  }

  it('skiller renter fra innskudd', () => {
    const h = buildStatementHistory(twoYearStatement())
    expect(h.openingBalance).toBe(10_000)
    // 24 innskudd — rentene er IKKE med
    expect(h.contributions).toHaveLength(24)
    expect(h.contributions.reduce((s, c) => s + c.amount, 0)).toBe(24_000)
    expect(h.withdrawals).toHaveLength(0)
  })

  it('rekonstruerer sluttsaldoen eksakt', () => {
    const h = buildStatementHistory(twoYearStatement())
    expect(h.derivedClosingBalance).toBe(35_300)
  })

  it('legger rentene inn som saldohopp ved årsslutt', () => {
    const h = buildStatementHistory(twoYearStatement())
    // 10 000 + 12 000 + 500 = 22 500 ved utgangen av 2023
    expect(h.balanceHistory).toContainEqual({ year: 2023, month: 12, balance: 22_500, isManual: false })
  })

  it('estimerer årsrente ut fra gjennomsnittlig saldo', () => {
    const h = buildStatementHistory(twoYearStatement())
    const y2023 = h.years.find((y) => y.year === 2023)!
    // Snittsaldo 2023: 11 000..22 000 → 16 500. 500/16 500 = 3,03 %
    expect(y2023.averageBalance).toBe(16_500)
    expect(y2023.rate).toBeCloseTo(3.03, 2)
    expect(h.rateHistory).toContainEqual({ fromDate: '2023-01-01', rate: y2023.rate })
  })

  it('gir stabile id-er slik at reimport ikke dupliserer', () => {
    const a = buildStatementHistory(twoYearStatement())
    const b = buildStatementHistory(twoYearStatement())
    expect(a.contributions.map((c) => c.id)).toEqual(b.contributions.map((c) => c.id))
  })
})

describe('historikk i månedsoversikten', () => {
  function accountFromStatement(): SavingsAccount {
    const rows = [HEADER]
    for (const year of ['2023', '2024']) {
      for (let m = 1; m <= 12; m++) {
        rows.push(row({ date: `10.${String(m).padStart(2, '0')}.${year}`, type: 'Overføring', inn: '1000' }))
      }
      rows.push(row({ date: `31.12.${year}`, type: 'Renter', inn: year === '2023' ? '500' : '800' }))
    }
    rows.push('Utgående  saldo pr. 31.12.2024:;;35 300,00 NOK')
    const h = buildStatementHistory(parseBankStatementFromCSV(rows.join('\n')))
    return {
      id: 'bsu-1',
      type: 'BSU',
      label: 'BSU',
      openingBalance: h.openingBalance,
      openingDate: h.openingDate,
      monthlyContribution: 1000,
      interestCreditFrequency: 'yearly',
      rateHistory: h.rateHistory,
      balanceHistory: h.balanceHistory,
      withdrawals: h.withdrawals,
      contributions: h.contributions,
      maxYearlyContribution: 27_500,
      maxTotalBalance: 300_000,
    }
  }

  it('viser stigende saldo måned for måned, ikke dagens saldo overalt', () => {
    const account = accountFromStatement()
    const history = computeAccountHistory(account, { year: 2025, month: 1 })

    const mars2023 = history.find((h) => h.year === 2023 && h.month === 3)!
    expect(mars2023.balance).toBe(13_000)   // 10 000 + 3 innskudd
    expect(mars2023.contribution).toBe(1000)

    const juni2024 = history.find((h) => h.year === 2024 && h.month === 6)!
    expect(juni2024.balance).toBe(28_500)   // 22 500 ved nyttår + 6 innskudd

    // Saldoen skal aldri være flat på sluttverdien
    expect(new Set(history.map((h) => h.balance)).size).toBeGreaterThan(20)
  })

  it('viser renter som avkastning i desember', () => {
    const history = computeAccountHistory(accountFromStatement(), { year: 2025, month: 1 })
    expect(history.find((h) => h.year === 2023 && h.month === 12)!.interest).toBe(500)
    expect(history.find((h) => h.year === 2023 && h.month === 6)!.interest).toBe(0)
  })

  it('teller ikke renter mot BSU-kvoten', () => {
    expect(computeYTDContributions(accountFromStatement(), 2024)).toBe(12_000)
  })

  it('gir riktig saldo ved slutten av utskriften', () => {
    const account = accountFromStatement()
    expect(computeEffectiveBalance(account, new Date('2024-12-31T12:00:00'))).toBe(35_300)
  })
})
