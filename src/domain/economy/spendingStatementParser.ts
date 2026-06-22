// ============================================================
// Parser for brukskonto-CSV (samme bank som spareimporten).
// Kolonne-tolerant: auto-detekterer tekst-/motpart-kolonnen.
// Returnerer signerte beløp (utgift negativt) med normalisert motpart.
// ============================================================

import type { BankSpendingTransaction } from '@/types/economy'
import { normalizeCounterparty } from './spendingCategorizer'

/** Finn kolonneindeks fra kandidat-navn (case-insensitiv substring). */
function colIdx(headers: string[], ...candidates: string[]): number {
  const lower = headers.map((h) => h.toLowerCase().trim())
  for (const c of candidates) {
    const i = lower.findIndex((h) => h.includes(c))
    if (i >= 0) return i
  }
  return -1
}

function toISO(s: string): string {
  const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : s
}

export function parseSpendingCSV(csvText: string): BankSpendingTransaction[] {
  const text = csvText.replace(/^﻿/, '')
  const rawLines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (rawLines.length < 2) throw new Error('CSV-filen er tom eller ugyldig')

  const headers = rawLines[0].split(';')
  const iDate = colIdx(headers, 'utf', 'dato')
  const iText = colIdx(headers, 'tekst', 'beskrivelse', 'melding', 'motpart')
  const iInn  = colIdx(headers, 'beløp inn', 'belop inn', 'inn')
  const iUt   = colIdx(headers, 'beløp ut', 'belop ut', 'ut')

  if (iText < 0) throw new Error('Ukjent CSV-format: finner ingen tekst-/motpart-kolonne')
  if (iDate < 0 || (iInn < 0 && iUt < 0)) throw new Error('Ukjent CSV-format: finner ikke dato-/beløp-kolonner')

  const batchId = `spend-${Date.now()}`
  const out: BankSpendingTransaction[] = []

  for (const line of rawLines.slice(1)) {
    const row = line.split(';')
    const dateStr = row[iDate]?.trim() ?? ''
    if (!/^\d{2}\.\d{2}\.\d{4}$/.test(dateStr)) continue

    const innStr = (iInn >= 0 ? row[iInn] : '')?.trim().replace(/\s/g, '').replace(',', '.') ?? ''
    const utStr  = (iUt  >= 0 ? row[iUt]  : '')?.trim().replace(/\s/g, '').replace(',', '.').replace('-', '') ?? ''
    const inn = parseFloat(innStr) || 0
    const ut  = parseFloat(utStr) || 0
    const amount = inn > 0 ? inn : -ut
    if (amount === 0) continue

    const raw = row[iText]?.trim() ?? ''
    out.push({
      id: crypto.randomUUID(),
      date: toISO(dateStr),
      counterpartyRaw: raw,
      counterpartyKey: normalizeCounterparty(raw),
      amount,
      category: null,
      categorySource: 'none',
      importBatchId: batchId,
    })
  }
  return out
}
