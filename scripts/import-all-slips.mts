/**
 * Batch-parser alle lønnsslipper fra Lønnslipper/-mappen og skriver
 * public/_slips.json + public/_slips-import.js.
 *
 * Kjøres med:
 *   node_modules/.bin/tsx --tsconfig tsconfig.app.json scripts/import-all-slips.mts
 *
 * Deretter kjøres _slips-import.js i nettleserens konsoll (http://localhost:5173).
 */

import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { readdirSync, readFileSync, writeFileSync } from 'fs'
import { resolve, join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

GlobalWorkerOptions.workerSrc = new URL(
  join(ROOT, 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'),
  'file://'
).href

// Lazy-import etter at workerSrc er satt
const { parseForsvarsSlipp } = await import('../src/domain/economy/salaryCalculator.js')

const SLIPS_DIR = resolve(ROOT, 'Lønnslipper')
const files = readdirSync(SLIPS_DIR)
  .filter((f) => f.endsWith('.pdf'))
  .sort()

interface TextItem { str: string; transform: number[] }

async function extractText(pdfPath: string): Promise<string> {
  const data = new Uint8Array(readFileSync(pdfPath))
  const pdf = await getDocument({
    data,
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  }).promise
  const allLines: string[] = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const content = await page.getTextContent()
    // Grupper items per Y-koordinat (avrundet 2pt) — identisk med slipParser.ts
    const lineMap = new Map<number, string[]>()
    for (const item of content.items) {
      const ti = item as TextItem
      if (!ti.str?.trim()) continue
      const y = Math.round(ti.transform[5] / 2) * 2
      if (!lineMap.has(y)) lineMap.set(y, [])
      lineMap.get(y)!.push(ti.str.trim())
    }
    const sortedYs = [...lineMap.keys()].sort((a, b) => b - a)
    for (const y of sortedYs) allLines.push(lineMap.get(y)!.join(' '))
  }
  return allLines.join('\n')
}

console.log(`Fant ${files.length} PDF-er. Starter parsing...`)

const parsed: Array<{ file: string; slip: ReturnType<typeof parseForsvarsSlipp> }> = []
const errors: Array<{ file: string; error: string }> = []

for (let i = 0; i < files.length; i++) {
  const file = files[i]
  const path = join(SLIPS_DIR, file)
  process.stdout.write(`  [${i + 1}/${files.length}] ${file} ... `)
  try {
    const text = await extractText(path)
    const slip = parseForsvarsSlipp(text)
    parsed.push({ file, slip })
    console.log(`ok (${slip.periode.year}-${String(slip.periode.month).padStart(2, '0')}, netto ${slip.nettoUtbetalt.toLocaleString('no-NO')} kr)`)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    errors.push({ file, error: msg })
    console.log(`FEIL: ${msg}`)
  }
}

console.log(`\nParsing ferdig: ${parsed.length} ok, ${errors.length} feil`)

// Skriv rå JSON
const jsonPath = resolve(ROOT, 'public/_slips.json')
writeFileSync(jsonPath, JSON.stringify(parsed.map((p) => p.slip), null, 2))
console.log(`Lagret: public/_slips.json`)

// Generer browser-snippet
const snippet = `
// ============================================================
// Lommeboka — batch-import av lønnsslipper
// Kjør dette i nettleserens konsoll på http://localhost:5173
// ============================================================
(async () => {
  const STATE_KEY = 'min-okonomi-v1'
  const slips = await fetch('/_slips.json').then(r => r.json())
  console.log('Importerer', slips.length, 'slipper...')

  const raw = localStorage.getItem(STATE_KEY)
  const state = raw ? JSON.parse(raw) : {}
  const stateData = state.state ?? state

  // Behold alt som IKKE er importerte slipper
  const kept = (stateData.monthHistory ?? []).filter(m => m.source !== 'imported_slip')

  // Sorter slipper eldst → nyest slik at profil-data fra nyeste slipp vinner
  slips.sort((a, b) => {
    const ay = a.periode.year * 100 + a.periode.month
    const by = b.periode.year * 100 + b.periode.month
    return ay - by
  })

  // Finn hvilken slipp som er nyest med lønn (for profil-oppdatering)
  const withLonn = slips.filter(s => (s.maanedslonn ?? 0) > 0)
  const latestSlip = withLonn[withLonn.length - 1]

  // Bygg nye month-records (uten PDF-base64 for å spare localStorage-plass)
  const newRecords = slips.map(slip => ({
    year: slip.periode.year,
    month: slip.periode.month,
    isLocked: true,
    source: 'imported_slip',
    lines: [],
    nettoUtbetalt: slip.nettoUtbetalt,
    disposable: slip.nettoUtbetalt,
    slipData: slip,
  }))

  const monthHistory = [...kept, ...newRecords]

  // Oppdater profil fra nyeste slipp
  const baseProfile = stateData.profile ?? {
    employer: 'forsvaret',
    baseMonthly: 0,
    fixedAdditions: [],
    lastKnownTaxWithholding: 0,
    extraTaxWithholding: 0,
    housingDeduction: 0,
    pensionPercent: 2,
    unionFee: 0,
    atfEnabled: false,
  }

  let updatedProfile = { ...baseProfile }

  if (latestSlip) {
    // Bygg fixedAdditions ved å merge alle slipper (nyeste vinner per artskode)
    const additionsMap = new Map(
      (baseProfile.fixedAdditions ?? []).map(a => [a.kode, a])
    )
    for (const slip of slips) {
      for (const t of (slip.fasteTillegg ?? [])) {
        if (t.artskode === '3209' || t.artskode === 'OF11') continue
        additionsMap.set(t.artskode, { kode: t.artskode, label: t.navn, amount: t.belop })
      }
    }

    updatedProfile = {
      ...baseProfile,
      baseMonthly: latestSlip.maanedslonn || baseProfile.baseMonthly,
      lastKnownTaxWithholding: latestSlip.skattetrekk || baseProfile.lastKnownTaxWithholding,
      extraTaxWithholding: latestSlip.ekstraTrekk > 0 ? latestSlip.ekstraTrekk : baseProfile.extraTaxWithholding,
      housingDeduction: latestSlip.husleietrekk > 0 ? latestSlip.husleietrekk : baseProfile.housingDeduction,
      unionFee: latestSlip.fagforeningskontingent > 0 ? latestSlip.fagforeningskontingent : baseProfile.unionFee,
      fixedAdditions: [...additionsMap.values()],
    }
    if (latestSlip.tabellnummer) updatedProfile.tabellnummer = latestSlip.tabellnummer
  }

  // Beregn lastKnownTableTaxPercent fra nyeste ikke-ferietrekk-slipp
  const forTableTax = [...slips]
    .reverse()
    .find(s => (s.ferietrekk ?? 0) === 0 && s.tabelltrekkGrunnlag > 0 && s.tabelltrekkBelop > 0)
  if (forTableTax) {
    const pct = (forTableTax.tabelltrekkBelop / forTableTax.tabelltrekkGrunnlag) * 100
    updatedProfile.lastKnownTableTaxPercent = Math.round(pct * 100) / 100
  }

  // Merge ATF-satser fra alle slipper
  const mergedRates = { ...(baseProfile.knownATFRates ?? {}) }
  for (const slip of slips) {
    if (!slip.atfRater) continue
    const slipDato = \`\${slip.periode.year}-\${String(slip.periode.month).padStart(2, '0')}\`
    const fraAarslonn = slip.maanedslonn * 12
    for (const [artskode, sats] of Object.entries(slip.atfRater)) {
      const existing = mergedRates[artskode]
      if (!existing || slipDato >= existing.dato) {
        mergedRates[artskode] = { sats, fraAarslonn, dato: slipDato }
      }
    }
  }
  updatedProfile.knownATFRates = mergedRates

  // Lagre oppdatert state
  const newState = {
    ...state,
    state: {
      ...stateData,
      monthHistory,
      profile: updatedProfile,
    },
    version: state.version ?? 0,
  }
  localStorage.setItem(STATE_KEY, JSON.stringify(newState))
  console.log('Import ferdig! Laster siden på nytt...')
  setTimeout(() => location.reload(), 500)
})()
`

const snippetPath = resolve(ROOT, 'public/_slips-import.js')
writeFileSync(snippetPath, snippet.trim())
console.log(`Lagret: public/_slips-import.js`)

if (errors.length > 0) {
  console.log(`\nFeil (${errors.length}):`)
  for (const e of errors) console.log(`  ${e.file}: ${e.error}`)
}

console.log(`\nKjør dette i nettleserens konsoll (F12) på http://localhost:5173:`)
console.log(`  fetch('/_slips-import.js').then(r=>r.text()).then(eval)`)
