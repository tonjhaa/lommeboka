import { describe, it, expect } from 'vitest'
import { parseSpendingCSV } from '../spendingStatementParser'

// Trøndelag Sparebank brukskonto-CSV: semikolon, Inn/Ut-kolonner + tekst-kolonne.
const CSV = [
  'Utført dato;Type;Tekst;Til konto;Beløp inn;Beløp ut',
  '15.03.2026;Betaling;REMA 1000 OSLO 1234;;;245,50',
  '16.03.2026;Betaling;NETFLIX.COM;;;129,00',
  '25.03.2026;Overføring;Lønn ACME AS;;42000,00;',
  '28.03.2026;Betaling;UKJENT BUTIKK XYZ;;;88,00',
].join('\n')

describe('parseSpendingCSV', () => {
  it('parser utgift som negativt signert beløp + motpart', () => {
    const txs = parseSpendingCSV(CSV)
    const rema = txs.find((t) => t.counterpartyRaw.includes('REMA'))!
    expect(rema.date).toBe('2026-03-15')
    expect(rema.amount).toBe(-245.5)
    expect(rema.counterpartyKey).toContain('rema 1000')
  })
  it('inntekt/innbetaling blir positivt beløp', () => {
    const lonn = parseSpendingCSV(CSV).find((t) => t.counterpartyRaw.includes('Lønn'))!
    expect(lonn.amount).toBe(42000)
  })
  it('alle rader får importBatchId og normalisert key', () => {
    const txs = parseSpendingCSV(CSV)
    expect(txs.length).toBe(4)
    expect(txs.every((t) => t.importBatchId && t.counterpartyKey.length > 0)).toBe(true)
  })
  it('mangler tekst-kolonne ⇒ kaster tydelig feil', () => {
    const bad = 'Utført dato;Beløp inn;Beløp ut\n15.03.2026;;245,50'
    expect(() => parseSpendingCSV(bad)).toThrow(/tekst|motpart|kolonne/i)
  })
})
