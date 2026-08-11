import { describe, it, expect, beforeEach } from 'vitest'
import { useEconomyStore } from '../useEconomyStore'
import { parseBankStatementFromCSV } from '@/domain/economy/bankTransactionParser'
import { computeEffectiveBalance, computeYTDContributions } from '@/domain/economy/savingsCalculator'
import type { SavingsAccount } from '@/types/economy'

const HEADER =
  'Utført dato;Bokført dato;Rentedato;Beskrivelse;Type;Undertype;Fra konto;Avsender;' +
  'Til konto;Mottakernavn;Beløp inn;Beløp ut;Valuta;Status;Melding/KID/Fakt.nr'

function txRow(date: string, type: string, inn: string, status = 'Bokført') {
  return [date, date, date, 'Overføring fra Brukskonto', type, '', '', '',
    '4345 11 55254', 'BSU', inn, '', 'NOK', status, ''].join(';')
}

/** Utskrift: startsaldo 100 000 (2025), innskudd i 2026, renter 31.12.2025 */
function statement() {
  return parseBankStatementFromCSV([
    HEADER,
    txRow('31.12.2025', 'Renter', '5000'),
    txRow('09.04.2026', 'Overføring', '10000'),
    txRow('11.06.2026', 'Overføring', '5000'),
    txRow('09.07.2026', 'Overføring', '1000'),
    txRow('11.08.2026', 'Overføring', '1000', 'Reservert'),
    'Utgående  saldo pr. 11.08.2026:;;122 000,00 NOK',
  ].join('\n'))
}

function bsuAccount(overrides: Partial<SavingsAccount> = {}): SavingsAccount {
  return {
    id: 'min-bsu',
    type: 'BSU',
    label: 'BSU',
    // Ingen accountNumber — slik kontoer opprettet for hånd faktisk ser ut
    openingBalance: 105_000,
    openingDate: '2026-03-25',
    monthlyContribution: 0,
    interestCreditFrequency: 'yearly',
    rateHistory: [{ fromDate: '2026-03-25', rate: 6.05 }],
    balanceHistory: [],
    withdrawals: [],
    contributions: [
      // De samme pengene som i utskriften, tastet inn for hånd
      { id: 'manuell-1', date: '2026-04-09', amount: 10_000, note: 'Lønn' },
      { id: 'manuell-2', date: '2026-06-11', amount: 5_000 },
      // Planlagt innskudd fram i tid — skal overleve importen
      { id: 'planlagt', date: '2026-12-11', amount: 7_500 },
    ],
    maxYearlyContribution: 27_500,
    maxTotalBalance: 300_000,
    ...overrides,
  }
}

describe('importSavingsStatement mot eksisterende konto', () => {
  beforeEach(() => {
    useEconomyStore.setState({ savingsAccounts: [bsuAccount()] })
  })

  const imported = () => useEconomyStore.getState().savingsAccounts

  it('treffer kontoen selv uten kontonummer, og lager ikke en duplikat', () => {
    useEconomyStore.getState().importSavingsStatement(statement())
    expect(imported()).toHaveLength(1)
    expect(imported()[0].id).toBe('min-bsu')
  })

  it('dobbelteller ikke innskudd som fantes både manuelt og i utskriften', () => {
    useEconomyStore.getState().importSavingsStatement(statement())
    const acc = imported()[0]
    // 10 000 + 5 000 + 1 000 + 1 000 fra utskriften — ikke de manuelle i tillegg
    expect(computeYTDContributions(acc, 2026)).toBe(24_500)  // inkl. planlagt 7 500
    expect(acc.contributions.filter((c) => c.date === '2026-04-09')).toHaveLength(1)
  })

  it('beholder planlagte innskudd etter utskriftens sluttdato', () => {
    useEconomyStore.getState().importSavingsStatement(statement())
    expect(imported()[0].contributions.find((c) => c.id === 'planlagt')?.amount).toBe(7_500)
  })

  it('lander på bankens saldo', () => {
    useEconomyStore.getState().importSavingsStatement(statement())
    expect(computeEffectiveBalance(imported()[0], new Date('2026-08-11T12:00:00'))).toBe(122_000)
  })

  it('rører ikke brukerens egen rentesats og månedssparing', () => {
    useEconomyStore.getState().importSavingsStatement(statement())
    const acc = imported()[0]
    expect(acc.rateHistory).toContainEqual({ fromDate: '2026-03-25', rate: 6.05 })
    expect(acc.label).toBe('BSU')
    expect(acc.maxTotalBalance).toBe(300_000)
  })

  it('låser kontonummeret slik at neste import treffer direkte', () => {
    useEconomyStore.getState().importSavingsStatement(statement())
    expect(imported()[0].accountNumber).toBe('4345 11 55254')
  })

  it('er idempotent — reimport endrer ingenting', () => {
    useEconomyStore.getState().importSavingsStatement(statement())
    const first = JSON.stringify(imported())
    useEconomyStore.getState().importSavingsStatement(statement())
    expect(JSON.stringify(imported())).toBe(first)
  })

  it('skriver ikke inn på feil konto når flere kandidater mangler kontonummer', () => {
    useEconomyStore.setState({
      savingsAccounts: [bsuAccount(), bsuAccount({ id: 'annen-bsu', contributions: [] })],
    })
    useEconomyStore.getState().importSavingsStatement(statement())
    // Ingen entydig kandidat → ny konto i stedet for å gjette
    expect(imported()).toHaveLength(3)
  })
})
