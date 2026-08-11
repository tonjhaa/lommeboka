// ----------------------------------------------------------------
// Parser for Trøndelag Sparebank kontoutskrifter
//
// Støtter to formater:
//   1. CSV  (Transaksjonsliste-*.csv)  – anbefalt, mest nøyaktig
//   2. PDF  (Transaksjoner_*.pdf)      – kolonne-major format
// ----------------------------------------------------------------

export type ParsedTxType = 'renter' | 'overføring' | 'betaling' | 'annet'

export interface ParsedTransaction {
  date: string        // "YYYY-MM-DD"
  type: ParsedTxType
  amount: number      // positivt = inn på konto, negativt = ut
  rawLine: string
  /** Fri tekst frå banken ("Overføring fra Brukskonto") — brukes som notat */
  description?: string
  /** false når banken melder transaksjonen som «Reservert» (ikkje bokført enno) */
  booked?: boolean
}

export interface ParsedBankStatement {
  accountNumber: string
  accountLabel: string
  accountType: 'BSU' | 'sparekonto' | 'annet'
  printDate: string          // "YYYY-MM-DD"
  openingBalance: number
  closingBalance: number
  totalIn: number
  totalOut: number
  transactions: ParsedTransaction[]
  estimatedMonthlyContribution: number
  estimatedAnnualInterestRate: number | null
  /**
   * Datoen `openingBalance` gjelder frå. Bankens transaksjonsarkiv går ofte
   * kortare tilbake enn kontoen sjølv, så startsaldoen er den saldoen som
   * må ha ligge der før første kjende transaksjon.
   */
  openingDate?: string
}

// ----------------------------------------------------------------
// Hjelpere
// ----------------------------------------------------------------

/** "9 393,00" eller "176 043,00" → 9393.0 */
function parseNOK(s: string): number {
  return parseFloat(s.replace(/\s/g, '').replace(',', '.')) || 0
}

/** "22.03.2026" → "2026-03-22" */
function toISO(s: string): string {
  const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : s
}

/** Regex for ett NOK-beløp: "9 393,00" eller "30,42" */
const ONE_AMOUNT = /\d{1,3}(?:\s\d{3})*,\d{2}/

/** Regex for en linje som KUN inneholder NOK-beløp (ingen bokstaver) */
const PURE_AMOUNT_LINE = /^(\d{1,3}(?:\s\d{3})*,\d{2})(\s+\d{1,3}(?:\s\d{3})*,\d{2})*$/

/** Hent alle NOK-beløp fra en tekststreng */
function extractAmounts(s: string): number[] {
  return [...s.matchAll(new RegExp(ONE_AMOUNT.source, 'g'))].map((m) => parseNOK(m[0]))
}

// ----------------------------------------------------------------
// Hovudparser
// ----------------------------------------------------------------

export function parseBankStatement(text: string): ParsedBankStatement {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)

  // ---- Kontonummer (frittstående linje: XXXX XX XXXXX) ----
  const kontoLine = lines.find((l) => /^\d{4} \d{2} \d{5}$/.test(l))
  const accountNumber = kontoLine ?? ''

  // ---- Kontotype ----
  const textUpper = text.toUpperCase()
  const isBSU = /\bBSU\b/.test(textUpper)
  const accountLabel = isBSU ? 'BSU' : 'Sparekonto'
  const accountType: 'BSU' | 'sparekonto' | 'annet' = isBSU ? 'BSU' : 'sparekonto'

  // ---- Utskriftsdato (frittstående DD.MM.YYYY nær "Utskriftsdato:") ----
  let printDate = new Date().toISOString().slice(0, 10)
  const utskriftIdx = lines.findIndex((l) => l.startsWith('Utskriftsdato:'))
  if (utskriftIdx >= 0) {
    const searchRange = lines.slice(Math.max(0, utskriftIdx - 4), utskriftIdx + 4)
    const dateLine = searchRange.find((l) => /^\d{2}\.\d{2}\.\d{4}$/.test(l))
    if (dateLine) printDate = toISO(dateLine)
  }
  // Fallback: siste frittstående dato i teksten
  if (printDate === new Date().toISOString().slice(0, 10)) {
    const standalone = lines.filter((l) => /^\d{2}\.\d{2}\.\d{4}$/.test(l))
    if (standalone.length > 0) printDate = toISO(standalone[standalone.length - 1])
  }

  // ---- Saldoer (linje med "NOK" og to beløp: "143 920,14 NOK 176 043,00 NOK") ----
  let openingBalance = 0
  let closingBalance = 0
  for (const line of lines) {
    if (!line.includes('NOK')) continue
    const amounts = extractAmounts(line)
    if (amounts.length === 2 && amounts[0] + amounts[1] > openingBalance + closingBalance) {
      openingBalance = amounts[0]
      closingBalance = amounts[1]
    }
  }

  // ---- Datoer (linje som starter med "Dato" og inneholder DD.MM.YYYY) ----
  const allDates: string[] = []
  for (const line of lines) {
    if (!line.startsWith('Dato') || !line.match(/\d{2}\.\d{2}\.\d{4}/)) continue
    const found = [...line.matchAll(/(\d{2})\.(\d{2})\.(\d{4})/g)]
      .map((m) => `${m[3]}-${m[2]}-${m[1]}`)
    allDates.push(...found)
  }

  // ---- Transaksjonstyper (linje som starter med "Type") ----
  const allTypes: string[] = []
  for (const line of lines) {
    if (!line.startsWith('Type ')) continue
    const rest = line.replace(/^Type\s+/, '').split(/\s+/)
    for (let i = 0; i < rest.length; i++) {
      const w = rest[i]
      if (/^(Renter|Overf[øo]ring|Betaling)$/i.test(w)) {
        if (w.toLowerCase() === 'betaling' && rest[i + 1]?.toLowerCase() === 'innland') {
          allTypes.push('betaling innland')
          i++ // hopp over "innland"
        } else {
          allTypes.push(w.toLowerCase())
        }
      }
    }
  }

  // ---- Beløp (rene beløps-linjer: kun tall og komma, ingen bokstaver) ----
  // Plukk opp alle linjer som utelukkende inneheld NOK-beløp,
  // ekskludert linjer med "NOK"-suffiks (som er saldobalansen).
  const allAmounts: number[] = []
  for (const line of lines) {
    if (line.includes('NOK')) continue          // saldobalanse-linje
    if (PURE_AMOUNT_LINE.test(line)) {
      allAmounts.push(...extractAmounts(line))
    }
  }

  // ---- Bygg transaksjoner (zip dato + type + beløp) ----
  const transactions: ParsedTransaction[] = []
  const count = Math.min(allDates.length, allTypes.length, allAmounts.length)

  for (let i = 0; i < count; i++) {
    const typeStr = allTypes[i] ?? ''
    let type: ParsedTxType = 'annet'
    if (typeStr.startsWith('renter')) type = 'renter'
    else if (typeStr.startsWith('overf')) type = 'overføring'
    else if (typeStr.startsWith('betaling')) type = 'betaling'

    transactions.push({
      date: allDates[i],
      type,
      amount: allAmounts[i],
      rawLine: `${allDates[i]} ${typeStr} ${allAmounts[i]}`,
    })
  }

  // ---- Totaler ----
  const totalIn = transactions.reduce((s, t) => s + t.amount, 0)
  const totalOut = 0

  // ---- Estimert månedssparing (siste 12 mnd, kun overføringer) ----
  const printDateObj = new Date(printDate)
  const cutoff = new Date(printDate)
  cutoff.setFullYear(cutoff.getFullYear() - 1)

  const recentDeposits = transactions.filter((tx) => {
    const d = new Date(tx.date)
    return (tx.type === 'overføring' || tx.type === 'betaling') &&
      d >= cutoff && d <= printDateObj
  })
  const estimatedMonthlyContribution =
    recentDeposits.length > 0
      ? Math.round(recentDeposits.reduce((s, tx) => s + tx.amount, 0) / 12)
      : 0

  // ---- Estimert rentesats fra siste rente-transaksjon ----
  let estimatedAnnualInterestRate: number | null = null
  const renterTx = transactions
    .filter((tx) => tx.type === 'renter')
    .sort((a, b) => b.date.localeCompare(a.date))

  if (renterTx.length > 0 && closingBalance > 0) {
    const lastRenter = renterTx[0]
    const depositsAfterRenter = transactions
      .filter(
        (tx) =>
          tx.date > lastRenter.date &&
          tx.date <= printDate &&
          tx.type !== 'renter',
      )
      .reduce((s, tx) => s + tx.amount, 0)
    const balanceBeforeRenter = closingBalance - lastRenter.amount - depositsAfterRenter
    if (balanceBeforeRenter > 0) {
      estimatedAnnualInterestRate =
        Math.round((lastRenter.amount / balanceBeforeRenter) * 1000) / 10
    }
  }

  return {
    accountNumber,
    accountLabel,
    accountType,
    printDate,
    openingBalance,
    closingBalance,
    totalIn,
    totalOut,
    transactions,
    estimatedMonthlyContribution,
    estimatedAnnualInterestRate,
  }
}

// ----------------------------------------------------------------
// CSV-parser (Trøndelag Sparebank «Transaksjonsliste» CSV-eksport)
//
// Kolonner (semikolon-separert, Windows-1252 eller UTF-8):
//   0  Utført dato   1  Bokført dato   2  Rentedato
//   3  Beskrivelse   4  Type           5  Undertype
//   6  Fra konto     7  Avsender       8  Til konto
//   9  Mottakernavn  10 Beløp inn      11 Beløp ut
//   12 Valuta        13 Status         14 Melding/KID/Fakt.nr
// ----------------------------------------------------------------

/** Finn kolonneindeks fra headerliste (case- og diakritika-tolerant) */
function colIdx(headers: string[], ...candidates: string[]): number {
  for (const cand of candidates) {
    const idx = headers.findIndex((h) =>
      h.toLowerCase().replace(/[æøå]/g, (c) =>
        c === 'æ' ? 'ae' : c === 'ø' ? 'o' : 'a'
      ).includes(
        cand.toLowerCase().replace(/[æøå]/g, (c) =>
          c === 'æ' ? 'ae' : c === 'ø' ? 'o' : 'a'
        )
      )
    )
    if (idx >= 0) return idx
  }
  return -1
}

/**
 * Deler CSV-tekst i rader og kolonner. Meldingsfeltet fr\u00E5 banken er sitert og
 * kan innehalde b\u00E5de semikolon og linjeskift, s\u00E5 naiv `split` held ikkje.
 */
export function tokenizeCSV(text: string, sep = ';'): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }  // escapet hermeteikn
        else inQuotes = false
      } else field += ch
      continue
    }
    if (ch === '"') inQuotes = true
    else if (ch === sep) { row.push(field); field = '' }
    else if (ch === '\n') { row.push(field); field = ''; rows.push(row); row = [] }
    else if (ch !== '\r') field += ch
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row) }

  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

/**
 * Tolkar eit bel\u00F8p fr\u00E5 banken. Handterer "1000", "1277.27", "160 920,14"
 * og "160.920,14" \u2014 skiljeteiknet lengst til h\u00F8gre er desimalseparatoren.
 */
export function parseAmount(raw: string): number {
  const s = (raw ?? '').replace(/[\s\u00A0]/g, '')
  if (!s) return 0

  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  let normalized: string

  if (lastComma >= 0 && lastDot >= 0) {
    // Begge finst: den siste er desimalseparator, den andre er tusenskilje
    normalized = lastComma > lastDot
      ? s.replace(/\./g, '').replace(',', '.')
      : s.replace(/,/g, '')
  } else if (lastComma >= 0) {
    normalized = s.replace(',', '.')
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    normalized = s.replace(/\./g, '')  // rein tusengruppering: "160.920"
  } else {
    normalized = s
  }

  return parseFloat(normalized) || 0
}

export function parseBankStatementFromCSV(csvText: string): ParsedBankStatement {
  // Fjern BOM om tilstede
  const text = csvText.replace(/^\uFEFF/, '')
  const allRows = tokenizeCSV(text)
  if (allRows.length < 2) throw new Error('CSV-filen er tom eller ugyldig')

  const headers = allRows[0].map((h) => h.trim())

  const iDate     = colIdx(headers, 'utf', 'dato')           // Utført dato
  const iType     = colIdx(headers, 'type')
  const iFraKonto = colIdx(headers, 'fra konto')
  const iTilKonto = colIdx(headers, 'til konto')
  const iInn      = colIdx(headers, 'bel', 'inn')            // Beløp inn
  const iUt       = iInn >= 0 ? iInn + 1 : colIdx(headers, 'ut') // Beløp ut

  if (iDate < 0 || iInn < 0) {
    throw new Error('Ukjent CSV-format: finner ikke Dato- eller Beløp-kolonner')
  }

  const iDesc     = colIdx(headers, 'beskrivelse')
  const iStatus   = colIdx(headers, 'status')

  const dataRows = allRows.slice(1)

  // ---- Kontonummer: finn kontoen som flest transaksjoner tilhører ----
  const kontoCount = new Map<string, number>()
  for (const row of dataRows) {
    const fra = row[iFraKonto]?.trim().replace(/\./g, ' ')
    const til = row[iTilKonto]?.trim().replace(/\./g, ' ')
    if (fra) kontoCount.set(fra, (kontoCount.get(fra) ?? 0) + 1)
    if (til) kontoCount.set(til, (kontoCount.get(til) ?? 0) + 1)
  }
  const accountNumber = [...kontoCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''

  // ---- Kontotype ----
  const allText = allRows.map((r) => r.join(' ')).join(' ').toUpperCase()
  const isBSU = /\bBSU\b/.test(allText)
  const accountLabel = isBSU ? 'BSU' : 'Sparekonto'
  const accountType: 'BSU' | 'sparekonto' | 'annet' = isBSU ? 'BSU' : 'sparekonto'

  // ---- Utskriftsdato: siste dato i settet ----
  let printDate = new Date().toISOString().slice(0, 10)
  const allDates = dataRows
    .map((r) => r[iDate]?.trim())
    .filter((d): d is string => !!d && /^\d{2}\.\d{2}\.\d{4}$/.test(d))
    .map(toISO)
    .sort()
  if (allDates.length > 0) printDate = allDates[allDates.length - 1]

  // ---- Transaksjoner ----
  const transactions: ParsedTransaction[] = []
  let runningBalance = 0

  for (const row of dataRows) {
    const dateStr = row[iDate]?.trim() ?? ''
    if (!/^\d{2}\.\d{2}\.\d{4}$/.test(dateStr)) continue

    const date = toISO(dateStr)
    const typeRaw = row[iType]?.trim().toLowerCase() ?? ''
    const belopInn = parseAmount(row[iInn] ?? '')
    const belopUt  = Math.abs(parseAmount(row[iUt] ?? ''))

    // Bestem transaksjonstype
    let type: ParsedTxType = 'annet'
    if (typeRaw.startsWith('renter')) type = 'renter'
    else if (typeRaw.startsWith('overf')) type = 'overføring'
    else if (typeRaw.startsWith('betaling')) type = 'betaling'

    // Beløp: positivt = inn, negativt = ut
    const amount = belopInn > 0 ? belopInn : -belopUt
    runningBalance += amount

    const statusRaw = iStatus >= 0 ? (row[iStatus]?.trim().toLowerCase() ?? '') : ''

    // Vi lagrer alle transaksjoner (inn og ut) med signed amount
    transactions.push({
      date,
      type,
      amount,
      rawLine: `${dateStr} ${row[iType]?.trim()} ${amount}`,
      description: iDesc >= 0 ? row[iDesc]?.trim() || undefined : undefined,
      booked: statusRaw ? !statusRaw.startsWith('reservert') : true,
    })
  }

  // ---- Saldo: hent fra summary-rader nederst i CSV ----
  // Format: "Utgående  saldo pr. DD.MM.YYYY:;;176 043,00 NOK;..."
  // og:     "Inngående saldo pr. DD.MM.YYYY:;;0,00 NOK;..."
  let closingBalance = runningBalance
  let openingBalance = 0

  for (const cols of allRows) {
    const label = cols[0]?.trim().toLowerCase() ?? ''
    if (/utg.*saldo/.test(label)) {
      const val = extractAmounts(cols.join(' '))
      if (val.length > 0) closingBalance = val[0]
    } else if (/inng.*saldo/.test(label)) {
      const val = extractAmounts(cols.join(' '))
      if (val.length > 0) openingBalance = val[0]
    }
  }

  // ---- Startsaldo: utled frå fasit ----
  // Banken oppgir «inngående saldo» pr. den datoen eksporten ble bestilt fra,
  // men transaksjonsarkivet går ofte kortere tilbake (typisk 10 år). Da blir
  // den oppgitte startsaldoen 0 selv om kontoen hadde penger på seg.
  // Utgående saldo er fasit, så det som ikke kan forklares av transaksjonene
  // MÅ ha ligget på kontoen før første kjente transaksjon.
  const sortedByDate = [...transactions].sort((a, b) => a.date.localeCompare(b.date))
  const firstTxDate = sortedByDate[0]?.date
  const impliedOpening = Math.round((closingBalance - runningBalance) * 100) / 100
  if (firstTxDate && Math.abs(impliedOpening - openingBalance) >= 1) {
    openingBalance = impliedOpening
  }
  // Startsaldoen gjelder dagen før første transaksjon
  let openingDate = firstTxDate
  if (firstTxDate) {
    const d = new Date(`${firstTxDate}T12:00:00`)
    d.setDate(d.getDate() - 1)
    openingDate = d.toISOString().slice(0, 10)
  }

  const totalIn  = transactions.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0)
  const totalOut = transactions.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)

  // ---- Estimert månedssparing (siste 12 mnd, kun innskudd) ----
  const printDateObj = new Date(printDate)
  const cutoff = new Date(printDate)
  cutoff.setFullYear(cutoff.getFullYear() - 1)

  const recentDeposits = transactions.filter((tx) => {
    const d = new Date(tx.date)
    return tx.amount > 0 && tx.type !== 'renter' && d >= cutoff && d <= printDateObj
  })
  const estimatedMonthlyContribution =
    recentDeposits.length > 0
      ? Math.round(recentDeposits.reduce((s, tx) => s + tx.amount, 0) / 12)
      : 0

  // ---- Estimert rentesats ----
  let estimatedAnnualInterestRate: number | null = null
  const renterTx = transactions
    .filter((tx) => tx.type === 'renter' && tx.amount > 0)
    .sort((a, b) => b.date.localeCompare(a.date))

  if (renterTx.length > 0 && closingBalance > 0) {
    const lastRenter = renterTx[0]
    const netAfterRenter = transactions
      .filter((tx) => tx.date > lastRenter.date && tx.date <= printDate && tx.type !== 'renter')
      .reduce((s, tx) => s + tx.amount, 0)
    const balanceBeforeRenter = closingBalance - lastRenter.amount - netAfterRenter
    if (balanceBeforeRenter > 0) {
      estimatedAnnualInterestRate =
        Math.round((lastRenter.amount / balanceBeforeRenter) * 1000) / 10
    }
  }

  return {
    accountNumber,
    accountLabel,
    accountType,
    printDate,
    openingBalance,
    closingBalance,
    totalIn,
    totalOut,
    transactions,
    estimatedMonthlyContribution,
    estimatedAnnualInterestRate,
    openingDate,
  }
}
