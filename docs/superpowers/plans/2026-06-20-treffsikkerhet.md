# Treffsikkerhet Implementeringsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mål budsjett-prognose vs faktisk og kalibrer profilens trekk-/lønnsverdier automatisk via trimmet glidende snitt av slipper — robust, transparent og reversibel — som erstatter dagens skjulte «siste-verdi»-oppdatering i `importSlip`.

**Architecture:** Ren `forecastCalibration.ts` beregner kalibrerte verdier (`calibrateProfile`) og treffsikkerhet (`computeAccuracy`). Storen lar `importSlip` hente verdier fra kalibreringen i stedet for rå slipp-felt, med samme merge-struktur som i dag. Når auto er av, gir kalibreringen siste-verdi (identisk dagens oppførsel — låst av en konsistens-invariant-test). `restoreProfileFromSlips` (kun null-profil-gjenoppretting) beholdes som siste-verdi — kalibrering kjører uansett ved neste slipp-import.

**Tech Stack:** React 19 + TypeScript (strict), Zustand, Vitest, Tailwind v4, lucide-react.

**Spec:** `docs/superpowers/specs/2026-06-20-treffsikkerhet-design.md`
**Branch:** `feat/treffsikkerhet`

**Konvensjoner:**
- TypeScript-sjekk: **`npm run typecheck`** (= `tsc -b`). `npx tsc --noEmit` fanger IKKE `noUnusedLocals`.
- Tester: `npm test`; spesifikk: `npm test -- <navn>`.
- Conventional commits. Avslutt hver melding med blank linje + `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

**Sentral kontekst (verifisert):**
- `importSlip` setter i dag (kun for nyeste slipp) `baseMonthly`, `lastKnownTaxWithholding`, `extraTaxWithholding`, `housingDeduction`, `unionFee`, faste tillegg; pluss `lastKnownTableTaxPercent` (kun når ikke ferietrekk), `tabellnummer`, og merger `knownATFRates` (siste sats per artskode). Dette er v1-kalibreringssettet.
- `ParsetLonnsslipp`-felt: `periode {year,month}`, `maanedslonn`, `skattetrekk`, `ekstraTrekk`, `husleietrekk`, `fagforeningskontingent`, `tabelltrekkGrunnlag`, `tabelltrekkBelop`, `ferietrekk?`, `atfRater?: Record<string,number>`, `fasteTillegg: {artskode,navn,belop}[]`.
- v1 kalibrerer **skalare trekk-/lønnsverdier + ATF-satser**. Faste tillegg-beløp og sparing/gjeld er sekundære (spec) — ikke i denne planen.

---

### Task 1: Typer

**Files:**
- Modify: `src/types/economy.ts` (legg til i enden; utvid `EconomyTab`)

- [ ] **Step 1: Legg til kalibreringstyper**

Legg til nederst i `src/types/economy.ts`:

```ts
// ------------------------------------------------------------
// TREFFSIKKERHET / KALIBRERING
// ------------------------------------------------------------

export type CalibrationKey =
  | 'skattetrekk' | 'tabelltrekkProsent' | 'baseMonthly'
  | 'extraTaxWithholding' | 'housingDeduction' | 'unionFee'
  | `atf:${string}`

export interface CalibrationEntry {
  key: CalibrationKey
  label: string
  previous: number
  calibrated: number
  sampleCount: number
  asOf: string               // "YYYY-MM-DD"
  locked: boolean
}

/** Kalibrerte verdier som storen merger inn i profilen. */
export interface CalibratedValues {
  baseMonthly: number
  skattetrekk: number
  extraTaxWithholding: number
  housingDeduction: number
  unionFee: number
  tabelltrekkProsent: number | null
  atfRates: Record<string, number>   // artskode → snittet sats
}

export interface CalibrationResult {
  values: CalibratedValues
  entries: CalibrationEntry[]
}

export interface AccuracyReport {
  rows: {
    key: string
    label: string
    avgBudget: number
    avgActual: number
    deviation: number
    deviationPct: number
    sampleCount: number
  }[]
  overallHitRate: number     // 0–100: andel innenfor toleranse
  monthsWithData: number
}

export interface CalibrationSettings {
  enabled: boolean
  horizonSlips: number
}
```

- [ ] **Step 2: Legg `'calibration'` til EconomyTab**

```ts
export type EconomyTab =
  | 'dashboard' | 'budget' | 'salary' | 'atf' | 'feriepenger'
  | 'savings' | 'fond' | 'debt' | 'absence' | 'tax'
  | 'subscriptions' | 'ivf' | 'vacation' | 'settings' | 'veikart' | 'gaver' | 'partner' | 'permisjon'
  | 'pension' | 'formue' | 'calibration'
```

- [ ] **Step 3: Verifiser**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/types/economy.ts
git commit -m "feat(treffsikkerhet): typer for kalibrering og treffsikkerhet

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `selectNormalSlips` + `trimmedMean`

**Files:**
- Create: `src/domain/economy/forecastCalibration.ts`
- Test: `src/domain/economy/__tests__/forecastCalibration.test.ts`

- [ ] **Step 1: Skriv failing test**

Create `src/domain/economy/__tests__/forecastCalibration.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { selectNormalSlips, trimmedMean } from '../forecastCalibration'
import type { MonthRecord, ParsetLonnsslipp } from '@/types/economy'

function slip(over: Partial<ParsetLonnsslipp> = {}): ParsetLonnsslipp {
  return {
    periode: { year: 2026, month: 3 }, ansattnummer: '1', loennstrinn: 0,
    maanedslonn: 50_000, fasteTillegg: [], trekk: [], bruttoSum: 50_000,
    nettoUtbetalt: 35_000, feriepengegrunnlag: 0, opptjentFerie: 0,
    skattetrekk: 18_000, ekstraTrekk: 0, husleietrekk: 0, pensjonstrekk: 0,
    fagforeningskontingent: 0, ouFond: 0, gruppelivspremie: 0,
    hittilBrutto: 0, hittilPensjon: 0, hittilForskuddstrekk: 0,
    tabelltrekkGrunnlag: 60_000, tabelltrekkBelop: 18_000, ...over,
  }
}

function rec(year: number, month: number, over: Partial<ParsetLonnsslipp> = {}): MonthRecord {
  return {
    year, month, isLocked: true, source: 'imported_slip', lines: [],
    nettoUtbetalt: 35_000, disposable: 35_000,
    slipData: slip({ periode: { year, month }, ...over }),
  }
}

describe('selectNormalSlips', () => {
  it('tar siste n importerte slipper, ekskl. juni/desember og ferietrekk', () => {
    const hist: MonthRecord[] = [
      rec(2026, 1), rec(2026, 2), rec(2026, 6), // juni ekskluderes
      rec(2026, 4, { ferietrekk: 5_000 }),       // ferietrekk ekskluderes
      rec(2026, 5),
    ]
    const sel = selectNormalSlips(hist, 6)
    const months = sel.map((s) => s.periode.month).sort((a, b) => a - b)
    expect(months).toEqual([1, 2, 5])
  })

  it('begrenser til n nyeste', () => {
    const hist = [rec(2026, 1), rec(2026, 2), rec(2026, 3)]
    expect(selectNormalSlips(hist, 2)).toHaveLength(2)
  })
})

describe('trimmedMean', () => {
  it('tom → 0; én → seg selv', () => {
    expect(trimmedMean([])).toBe(0)
    expect(trimmedMean([42])).toBe(42)
  })
  it('2–3 verdier → vanlig snitt', () => {
    expect(trimmedMean([10, 20])).toBe(15)
  })
  it('n≥4 → dropp høyeste+laveste (blip-demping)', () => {
    // 18000-er med én blip på 40000 og én lav på 5000 → trim fjerner begge
    expect(trimmedMean([18_000, 18_000, 40_000, 5_000])).toBe(18_000)
  })
})
```

- [ ] **Step 2: Kjør — verifiser feil**

Run: `npm test -- forecastCalibration`
Expected: FAIL (modul finnes ikke).

- [ ] **Step 3: Implementer**

Create `src/domain/economy/forecastCalibration.ts`:

```ts
// ============================================================
// TREFFSIKKERHET / KALIBRERING — rene funksjoner
// Kalibrerer profilens trekk-/lønnsverdier via trimmet glidende snitt.
// ============================================================

import type { MonthRecord, ParsetLonnsslipp } from '@/types/economy'

/** Siste n importerte slipper, ekskl. juni/desember og slipper med ferietrekk. */
export function selectNormalSlips(monthHistory: MonthRecord[], n: number): ParsetLonnsslipp[] {
  return monthHistory
    .filter((m) => m.source === 'imported_slip' && m.slipData && (m.slipData.maanedslonn ?? 0) > 0)
    .filter((m) => m.month !== 6 && m.month !== 12 && (m.slipData!.ferietrekk ?? 0) === 0)
    .sort((a, b) => (b.year !== a.year ? b.year - a.year : b.month - a.month))
    .slice(0, n)
    .map((m) => m.slipData!)
}

/** Snitt; dropper høyeste+laveste når n≥4 (blip-demping); verdien selv for n=1; 0 for tom. */
export function trimmedMean(values: number[]): number {
  if (values.length === 0) return 0
  if (values.length === 1) return values[0]
  let arr = values
  if (values.length >= 4) {
    const sorted = [...values].sort((a, b) => a - b)
    arr = sorted.slice(1, sorted.length - 1)
  }
  return Math.round(arr.reduce((s, v) => s + v, 0) / arr.length)
}
```

- [ ] **Step 4: Kjør — verifiser pass**

Run: `npm test -- forecastCalibration`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/economy/forecastCalibration.ts src/domain/economy/__tests__/forecastCalibration.test.ts
git commit -m "feat(treffsikkerhet): selectNormalSlips + trimmedMean

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `calibrateProfile`

**Files:**
- Modify: `src/domain/economy/forecastCalibration.ts`
- Test: `src/domain/economy/__tests__/forecastCalibration.test.ts`

- [ ] **Step 1: Skriv failing test**

Legg til i testfila (utvid import med `calibrateProfile` og typer):

```ts
import { calibrateProfile } from '../forecastCalibration'
import type { CalibrationSettings, EmploymentProfile } from '@/types/economy'

const SETTINGS_ON: CalibrationSettings = { enabled: true, horizonSlips: 6 }
const SETTINGS_OFF: CalibrationSettings = { enabled: false, horizonSlips: 6 }

function profile(over: Partial<EmploymentProfile> = {}): EmploymentProfile {
  return {
    employer: 'forsvaret', baseMonthly: 50_000, fixedAdditions: [],
    lastKnownTaxWithholding: 18_000, extraTaxWithholding: 0, housingDeduction: 0,
    pensionPercent: 2, unionFee: 0, atfEnabled: false, ...over,
  }
}

describe('calibrateProfile', () => {
  it('enabled: skattetrekk = trimmet snitt over normale slipper', () => {
    const hist = [
      rec(2026, 1, { skattetrekk: 17_000 }),
      rec(2026, 2, { skattetrekk: 18_000 }),
      rec(2026, 3, { skattetrekk: 19_000 }),
    ]
    const res = calibrateProfile(hist, profile(), SETTINGS_ON, [])
    expect(res.values.skattetrekk).toBe(18_000) // snitt 17/18/19
    const entry = res.entries.find((e) => e.key === 'skattetrekk')!
    expect(entry.calibrated).toBe(18_000)
    expect(entry.sampleCount).toBe(3)
  })

  it('disabled: bruker nyeste slipps verdi (siste-verdi-fallback)', () => {
    const hist = [
      rec(2026, 1, { skattetrekk: 17_000 }),
      rec(2026, 3, { skattetrekk: 19_000 }),
    ]
    const res = calibrateProfile(hist, profile(), SETTINGS_OFF, [])
    expect(res.values.skattetrekk).toBe(19_000) // nyeste
  })

  it('locked-nøkkel beholder current-verdi og hoppes over', () => {
    const hist = [rec(2026, 1, { skattetrekk: 17_000 }), rec(2026, 2, { skattetrekk: 19_000 })]
    const res = calibrateProfile(hist, profile({ lastKnownTaxWithholding: 99_000 }), SETTINGS_ON, ['skattetrekk'])
    expect(res.values.skattetrekk).toBe(99_000)
    expect(res.entries.find((e) => e.key === 'skattetrekk')?.locked).toBe(true)
  })

  it('ATF-satser snittes per artskode', () => {
    const hist = [
      rec(2026, 1, { atfRater: { '2230': 4_000 } }),
      rec(2026, 2, { atfRater: { '2230': 4_200 } }),
    ]
    const res = calibrateProfile(hist, profile(), SETTINGS_ON, [])
    expect(res.values.atfRates['2230']).toBe(4_100)
  })

  it('tabelltrekkProsent fra grunnlag/beløp; null når ingen gyldige', () => {
    const hist = [rec(2026, 2, { tabelltrekkGrunnlag: 60_000, tabelltrekkBelop: 18_000 })]
    const res = calibrateProfile(hist, profile(), SETTINGS_ON, [])
    expect(res.values.tabelltrekkProsent).toBeCloseTo(30, 1)
  })

  it('ingen slipper → verdier faller tilbake på current profil', () => {
    const res = calibrateProfile([], profile({ lastKnownTaxWithholding: 12_345 }), SETTINGS_ON, [])
    expect(res.values.skattetrekk).toBe(12_345)
    expect(res.entries).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Kjør — verifiser feil**

Run: `npm test -- forecastCalibration`
Expected: FAIL.

- [ ] **Step 3: Implementer**

Legg til i `forecastCalibration.ts` (utvid import med typene):

```ts
import type {
  CalibrationSettings, CalibrationResult, CalibrationEntry,
  CalibratedValues, CalibrationKey, EmploymentProfile,
} from '@/types/economy'

const LABELS: Record<string, string> = {
  skattetrekk: 'Skattetrekk',
  tabelltrekkProsent: 'Tabelltrekk-prosent',
  baseMonthly: 'Grunnlønn',
  extraTaxWithholding: 'Ekstra forskuddstrekk',
  housingDeduction: 'Husleietrekk',
  unionFee: 'Fagforeningskontingent',
}

const today = (): string => new Date().toISOString().split('T')[0]

/**
 * Kalibrerte verdier for profilen. enabled → trimmet snitt over normale slipper;
 * disabled → nyeste slipps verdi (= dagens siste-verdi-oppførsel). locked-nøkler
 * beholder current. Tom slipp-liste → current-verdier, ingen entries.
 */
export function calibrateProfile(
  monthHistory: MonthRecord[],
  current: EmploymentProfile,
  settings: CalibrationSettings,
  lockedKeys: string[],
): CalibrationResult {
  const slips = selectNormalSlips(monthHistory, settings.enabled ? settings.horizonSlips : 1)
  const locked = new Set(lockedKeys)
  const entries: CalibrationEntry[] = []

  // Hjelper: kalibrer én skalar nøkkel fra en verdivelger.
  function scalar(key: CalibrationKey, pick: (s: ParsetLonnsslipp) => number, prev: number): number {
    if (locked.has(key)) {
      entries.push({ key, label: LABELS[key] ?? key, previous: prev, calibrated: prev, sampleCount: 0, asOf: today(), locked: true })
      return prev
    }
    const values = slips.map(pick).filter((v) => v > 0)
    if (values.length === 0) return prev
    const calibrated = settings.enabled ? trimmedMean(values) : values[0]
    if (calibrated !== prev) {
      entries.push({ key, label: LABELS[key] ?? key, previous: prev, calibrated, sampleCount: values.length, asOf: today(), locked: false })
    }
    return calibrated
  }

  const baseMonthly = scalar('baseMonthly', (s) => s.maanedslonn, current.baseMonthly)
  const skattetrekk = scalar('skattetrekk', (s) => s.skattetrekk, current.lastKnownTaxWithholding)
  const extraTaxWithholding = scalar('extraTaxWithholding', (s) => s.ekstraTrekk, current.extraTaxWithholding)
  const housingDeduction = scalar('housingDeduction', (s) => s.husleietrekk, current.housingDeduction)
  const unionFee = scalar('unionFee', (s) => s.fagforeningskontingent, current.unionFee)

  // Tabelltrekk-prosent: kun slipper med gyldig grunnlag/beløp.
  const pctValues = slips
    .filter((s) => s.tabelltrekkGrunnlag > 0 && s.tabelltrekkBelop > 0)
    .map((s) => (s.tabelltrekkBelop / s.tabelltrekkGrunnlag) * 100)
  let tabelltrekkProsent: number | null = current.lastKnownTableTaxPercent ?? null
  if (!locked.has('tabelltrekkProsent') && pctValues.length > 0) {
    tabelltrekkProsent = Math.round((settings.enabled ? trimmedMean(pctValues) : pctValues[0]) * 100) / 100
  }

  // ATF-satser: snitt av sats per artskode.
  const atfRates: Record<string, number> = {}
  const byKode = new Map<string, number[]>()
  for (const s of slips) {
    for (const [kode, sats] of Object.entries(s.atfRater ?? {})) {
      if (!byKode.has(kode)) byKode.set(kode, [])
      byKode.get(kode)!.push(sats)
    }
  }
  for (const [kode, satser] of byKode) {
    atfRates[kode] = settings.enabled ? trimmedMean(satser) : satser[0]
  }

  const values: CalibratedValues = {
    baseMonthly, skattetrekk, extraTaxWithholding, housingDeduction, unionFee,
    tabelltrekkProsent, atfRates,
  }
  return { values, entries }
}
```

- [ ] **Step 4: Kjør — verifiser pass**

Run: `npm test -- forecastCalibration && npm run typecheck`
Expected: PASS / rent.

- [ ] **Step 5: Commit**

```bash
git add src/domain/economy/forecastCalibration.ts src/domain/economy/__tests__/forecastCalibration.test.ts
git commit -m "feat(treffsikkerhet): calibrateProfile (trimmet snitt + locked + av/på)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `computeAccuracy`

**Files:**
- Modify: `src/domain/economy/forecastCalibration.ts`
- Test: `src/domain/economy/__tests__/forecastCalibration.test.ts`

- [ ] **Step 1: Skriv failing test**

Legg til i testfila (utvid import med `computeAccuracy`):

```ts
import { computeAccuracy } from '../forecastCalibration'

describe('computeAccuracy', () => {
  // Minimal budsjettabell-lignende input: rader med budget/actual-celler.
  const rows = [
    { id: 'netto', label: 'Netto', cells: Array.from({ length: 12 }, (_, i) =>
      ({ budget: 35_000, actual: i < 3 ? 36_000 : null })) },
    { id: 'skatt', label: 'Skatt', cells: Array.from({ length: 12 }, (_, i) =>
      ({ budget: 18_000, actual: i < 3 ? 18_100 : null })) },
  ]

  it('regner avvik per rad og treff-% kun for måneder med actual', () => {
    const rep = computeAccuracy(rows)
    const netto = rep.rows.find((r) => r.key === 'netto')!
    expect(netto.avgActual).toBe(36_000)
    expect(netto.avgBudget).toBe(35_000)
    expect(netto.deviation).toBe(1_000)
    expect(rep.monthsWithData).toBe(3)
    // 36000 vs 35000 = +2.86 % → innenfor ±5 %; skatt 18100 vs 18000 = +0.56 % → begge treff
    expect(rep.overallHitRate).toBe(100)
  })

  it('tom (ingen actual) → 0 treff, 0 måneder', () => {
    const empty = [{ id: 'x', label: 'X', cells: Array.from({ length: 12 }, () => ({ budget: 100, actual: null })) }]
    const rep = computeAccuracy(empty)
    expect(rep.monthsWithData).toBe(0)
    expect(rep.rows).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Kjør — verifiser feil**

Run: `npm test -- forecastCalibration`
Expected: FAIL.

- [ ] **Step 3: Implementer**

Legg til i `forecastCalibration.ts` (utvid import med `AccuracyReport`). `AccuracyRowInput` defineres lokalt for å unngå avhengighet til budgetTableComputer-typene:

```ts
import type { AccuracyReport } from '@/types/economy'

/** Toleranse for «treff» (innenfor ±5 %). */
export const HIT_TOLERANCE_PCT = 5

interface AccuracyRowInput {
  id: string
  label: string
  cells: { budget: number; actual: number | null }[]
}

/** Måler hvor godt budsjettet traff faktiske tall (kun celler med actual ≠ null). */
export function computeAccuracy(rows: AccuracyRowInput[]): AccuracyReport {
  const monthsWithData = new Set<number>()
  const out: AccuracyReport['rows'] = []
  let hits = 0
  let total = 0

  for (const row of rows) {
    const withActual = row.cells
      .map((c, i) => ({ ...c, i }))
      .filter((c) => c.actual !== null)
    if (withActual.length === 0) continue
    withActual.forEach((c) => monthsWithData.add(c.i))
    const avgBudget = Math.round(withActual.reduce((s, c) => s + c.budget, 0) / withActual.length)
    const avgActual = Math.round(withActual.reduce((s, c) => s + (c.actual ?? 0), 0) / withActual.length)
    const deviation = avgActual - avgBudget
    const deviationPct = avgBudget !== 0 ? (deviation / Math.abs(avgBudget)) * 100 : 0
    out.push({ key: row.id, label: row.label, avgBudget, avgActual, deviation, deviationPct, sampleCount: withActual.length })
    total++
    if (Math.abs(deviationPct) <= HIT_TOLERANCE_PCT) hits++
  }

  return {
    rows: out.sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation)),
    overallHitRate: total > 0 ? Math.round((hits / total) * 100) : 0,
    monthsWithData: monthsWithData.size,
  }
}
```

- [ ] **Step 4: Kjør — verifiser pass**

Run: `npm test -- forecastCalibration && npm run typecheck`
Expected: PASS / rent.

- [ ] **Step 5: Commit**

```bash
git add src/domain/economy/forecastCalibration.ts src/domain/economy/__tests__/forecastCalibration.test.ts
git commit -m "feat(treffsikkerhet): computeAccuracy (avvik + treff-%)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Store-felt + persist v24 + synk

**Files:**
- Modify: `src/application/useEconomyStore.ts`
- Modify: `src/lib/syncEconomyData.ts`
- Test: `src/store/__tests__/calibrationStore.test.ts`

- [ ] **Step 1: Skriv failing test**

Create `src/store/__tests__/calibrationStore.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { DEFAULT_CALIBRATION_SETTINGS } from '@/application/useEconomyStore'

describe('DEFAULT_CALIBRATION_SETTINGS', () => {
  it('auto er på som default, horisont 6', () => {
    expect(DEFAULT_CALIBRATION_SETTINGS.enabled).toBe(true)
    expect(DEFAULT_CALIBRATION_SETTINGS.horizonSlips).toBe(6)
  })
})
```

- [ ] **Step 2: Kjør — verifiser feil**

Run: `npm test -- calibrationStore`
Expected: FAIL (`DEFAULT_CALIBRATION_SETTINGS` ikke eksportert).

- [ ] **Step 3: Implementer store-felt**

I `src/application/useEconomyStore.ts`:

a) Importer typene (legg til i eksisterende `@/types/economy`-import): `CalibrationSettings`, `CalibrationEntry`.

b) Eksporter default nær de andre DEFAULT-konstantene:

```ts
export const DEFAULT_CALIBRATION_SETTINGS: CalibrationSettings = { enabled: true, horizonSlips: 6 }
```

c) I `EconomyState`-interfacet (nær `pensionSettings`):

```ts
  calibrationSettings: CalibrationSettings
  calibrationLog: CalibrationEntry[]
  lockedCalibrationKeys: string[]
  setCalibrationSettings: (s: CalibrationSettings) => void
  lockCalibration: (key: string) => void
  unlockCalibration: (key: string) => void
```

d) Initial state (ved `pensionSettings: null`):

```ts
      calibrationSettings: DEFAULT_CALIBRATION_SETTINGS,
      calibrationLog: [],
      lockedCalibrationKeys: [],
```

e) Actions (ved `setPensionSettings`):

```ts
      setCalibrationSettings: (s) => set({ calibrationSettings: s }),
      lockCalibration: (key) => set((st) => ({
        lockedCalibrationKeys: st.lockedCalibrationKeys.includes(key)
          ? st.lockedCalibrationKeys : [...st.lockedCalibrationKeys, key],
      })),
      unlockCalibration: (key) => set((st) => ({
        lockedCalibrationKeys: st.lockedCalibrationKeys.filter((k) => k !== key),
      })),
```

f) Bump `version: 23` → `version: 24`; legg til migrering (etter v23-blokken):

```ts
        // v23 → v24: legg til 'calibration' i enabledTabs for eksisterende brukere
        if (fromVersion < 24 && state.userPreferences) {
          const prefs = state.userPreferences as { enabledTabs?: string[] }
          if (Array.isArray(prefs.enabledTabs) && !prefs.enabledTabs.includes('calibration')) {
            prefs.enabledTabs = [...prefs.enabledTabs, 'calibration']
          }
        }
```

g) `partialize` (ved `pensionSettings: state.pensionSettings`):

```ts
        calibrationSettings: state.calibrationSettings,
        calibrationLog: state.calibrationLog,
        lockedCalibrationKeys: state.lockedCalibrationKeys,
```

h) `importData` (ved `pensionSettings: data.pensionSettings ?? null`):

```ts
            calibrationSettings: data.calibrationSettings ?? DEFAULT_CALIBRATION_SETTINGS,
            calibrationLog: data.calibrationLog ?? [],
            lockedCalibrationKeys: data.lockedCalibrationKeys ?? [],
```

Og i `importData` sin enabledTabs forward-migrering (der `'formue'`/`'pension'` legges til):

```ts
          if (prefs?.enabledTabs && !prefs.enabledTabs.includes('calibration')) {
            prefs.enabledTabs = [...prefs.enabledTabs, 'calibration']
          }
```

i) I `src/lib/syncEconomyData.ts`, legg i `saveToSupabase`-payloaden (ved `pensionSettings: state.pensionSettings`):

```ts
    calibrationSettings: state.calibrationSettings,
    calibrationLog: state.calibrationLog,
    lockedCalibrationKeys: state.lockedCalibrationKeys,
```

- [ ] **Step 4: Kjør test + typecheck**

Run: `npm test -- calibrationStore && npm run typecheck`
Expected: PASS / rent.

> Merk: `usePartnerStore.ts` implementerer `EconomyState` — legg til stub-felt der (`calibrationSettings: DEFAULT_CALIBRATION_SETTINGS` importert, `calibrationLog: []`, `lockedCalibrationKeys: []`, og no-op settere) hvis typecheck klager.

- [ ] **Step 5: Commit**

```bash
git add src/application/useEconomyStore.ts src/lib/syncEconomyData.ts src/store/__tests__/calibrationStore.test.ts src/application/usePartnerStore.ts
git commit -m "feat(treffsikkerhet): store-felt + persist v24 + Supabase-synk

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Koble `calibrateProfile` inn i `importSlip`

**Files:**
- Modify: `src/application/useEconomyStore.ts`
- Test: `src/store/__tests__/calibrationStore.test.ts`

- [ ] **Step 1: Skriv konsistens-invariant-test**

Legg til i `calibrationStore.test.ts` (utvid import):

```ts
import { calibrateProfile } from '@/domain/economy/forecastCalibration'
import type { MonthRecord, ParsetLonnsslipp, EmploymentProfile } from '@/types/economy'

function slip2(over: Partial<ParsetLonnsslipp> = {}): ParsetLonnsslipp {
  return {
    periode: { year: 2026, month: 3 }, ansattnummer: '1', loennstrinn: 0,
    maanedslonn: 50_000, fasteTillegg: [], trekk: [], bruttoSum: 50_000,
    nettoUtbetalt: 35_000, feriepengegrunnlag: 0, opptjentFerie: 0,
    skattetrekk: 18_000, ekstraTrekk: 0, husleietrekk: 0, pensjonstrekk: 0,
    fagforeningskontingent: 0, ouFond: 0, gruppelivspremie: 0,
    hittilBrutto: 0, hittilPensjon: 0, hittilForskuddstrekk: 0,
    tabelltrekkGrunnlag: 60_000, tabelltrekkBelop: 18_000, ...over,
  }
}
function rec2(year: number, month: number, over: Partial<ParsetLonnsslipp> = {}): MonthRecord {
  return { year, month, isLocked: true, source: 'imported_slip', lines: [],
    nettoUtbetalt: 35_000, disposable: 35_000, slipData: slip2({ periode: { year, month }, ...over }) }
}
function prof(over: Partial<EmploymentProfile> = {}): EmploymentProfile {
  return { employer: 'forsvaret', baseMonthly: 50_000, fixedAdditions: [],
    lastKnownTaxWithholding: 18_000, extraTaxWithholding: 0, housingDeduction: 0,
    pensionPercent: 2, unionFee: 0, atfEnabled: false, ...over }
}

describe('konsistens-invariant: auto av ≡ siste-verdi', () => {
  it('disabled gir nyeste slipps verdier (som dagens oppførsel)', () => {
    const hist = [rec2(2026, 1, { skattetrekk: 17_000, maanedslonn: 49_000 }),
                  rec2(2026, 3, { skattetrekk: 19_000, maanedslonn: 51_000 })]
    const res = calibrateProfile(hist, prof(), { enabled: false, horizonSlips: 6 }, [])
    expect(res.values.skattetrekk).toBe(19_000)
    expect(res.values.baseMonthly).toBe(51_000)
  })
})
```

- [ ] **Step 2: Kjør — verifiser pass (test passerer allerede, dette låser kontrakten)**

Run: `npm test -- calibrationStore`
Expected: PASS.

- [ ] **Step 3: Wire inn i `importSlip`**

I `importSlip` (useEconomyStore.ts ~471–522): etter at `updated` (ny monthHistory) er bygget, kall kalibreringen og bruk verdiene der `slip.X` brukes i dag. Importer `calibrateProfile` øverst i fila.

Erstatt blokken som setter `baseMonthly`/`lastKnownTaxWithholding`/`extraTaxWithholding`/`housingDeduction`/`unionFee` (linjene under `...(isLatestSlip ? {`) slik at de henter fra kalibrering:

```ts
          const { calibrationSettings, lockedCalibrationKeys } = get()
          const cal = calibrateProfile(updated, baseProfile, calibrationSettings, lockedCalibrationKeys)
          let updatedProfile: EmploymentProfile = {
            ...baseProfile,
            ...(isLatestSlip ? {
              baseMonthly: cal.values.baseMonthly || baseProfile.baseMonthly,
              lastKnownTaxWithholding: cal.values.skattetrekk || baseProfile.lastKnownTaxWithholding,
              extraTaxWithholding: cal.values.extraTaxWithholding || baseProfile.extraTaxWithholding,
              housingDeduction: cal.values.housingDeduction || baseProfile.housingDeduction,
              unionFee: cal.values.unionFee || baseProfile.unionFee,
              fixedAdditions: (() => {
                const fromSlip = slip.fasteTillegg
                  .filter((t) => t.artskode !== '3209' && t.artskode !== 'OF11')
                  .map((t) => ({ kode: t.artskode, label: t.navn, amount: t.belop }))
                const fromSlipKoder = new Set(fromSlip.map((t) => t.kode))
                const kept = (baseProfile.fixedAdditions ?? []).filter((t) => !fromSlipKoder.has(t.kode))
                return [...kept, ...fromSlip]
              })(),
            } : {}),
          }
```

Erstatt `lastKnownTableTaxPercent`-blokken (linje ~499–503) med kalibrert verdi:

```ts
          if (cal.values.tabelltrekkProsent !== null) {
            updatedProfile = { ...updatedProfile, lastKnownTableTaxPercent: cal.values.tabelltrekkProsent }
          }
```

Erstatt `knownATFRates`-mergen (linje ~510–522) slik at satsene kommer fra kalibrering (behold dato/fraAarslonn-strukturen):

```ts
          if (Object.keys(cal.values.atfRates).length > 0) {
            const slipDato = `${slip.periode.year}-${String(slip.periode.month).padStart(2, '0')}`
            const fraAarslonn = cal.values.baseMonthly * 12
            const mergedRates: Record<string, KnownATFRate> = { ...updatedProfile.knownATFRates }
            for (const [artskode, sats] of Object.entries(cal.values.atfRates)) {
              mergedRates[artskode] = { sats, fraAarslonn, dato: slipDato }
            }
            updatedProfile = { ...updatedProfile, knownATFRates: mergedRates }
          }
```

Etter at `updatedProfile` er ferdig, oppdater kalibreringsloggen (behold maks 50 nyeste):

```ts
          const newLog = cal.entries.length > 0
            ? [...cal.entries, ...get().calibrationLog].slice(0, 50)
            : get().calibrationLog
```

Og returner `calibrationLog: newLog` i samme `set`-retur (ved siden av `monthHistory`/`profile`). (`tabellnummer`-blokken beholdes uendret.)

- [ ] **Step 4: Verifiser bygg + tester**

Run: `npm run build && npm test`
Expected: PASS / alle grønne.

- [ ] **Step 5: Commit**

```bash
git add src/application/useEconomyStore.ts src/store/__tests__/calibrationStore.test.ts
git commit -m "feat(treffsikkerhet): importSlip bruker calibrateProfile + logg

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Navigasjon + ForecastAccuracyPage

**Files:**
- Modify: `src/store/useAppStore.ts` (utvid `EconomySubPage` med `'calibration'`)
- Create: `src/pages/economy/ForecastAccuracyPage.tsx`
- Modify: `src/pages/economy/EconomyPage.tsx` (lazy-import, NAV_ITEMS, render-gren)

- [ ] **Step 1: Utvid `EconomySubPage`**

I `src/store/useAppStore.ts`, legg `'calibration'` til `EconomySubPage`-unionen (linje 13).

- [ ] **Step 2: Opprett ForecastAccuracyPage**

Create `src/pages/economy/ForecastAccuracyPage.tsx`:

```tsx
import { useMemo } from 'react'
import { Target, Lock, Unlock } from 'lucide-react'
import { useEconomyStore } from '@/application/useEconomyStore'
import { computeAccuracy } from '@/domain/economy/forecastCalibration'
import { computeBudgetTable } from '@/domain/economy/budgetTableComputer'
import { cn } from '@/lib/utils'

function fmtNOK(n: number): string { return Math.round(n).toLocaleString('no-NO') + ' kr' }

export function ForecastAccuracyPage() {
  const profile = useEconomyStore((s) => s.profile)
  const monthHistory = useEconomyStore((s) => s.monthHistory)
  const budgetTemplate = useEconomyStore((s) => s.budgetTemplate)
  const calibrationLog = useEconomyStore((s) => s.calibrationLog)
  const settings = useEconomyStore((s) => s.calibrationSettings)
  const setCalibrationSettings = useEconomyStore((s) => s.setCalibrationSettings)
  const lockedKeys = useEconomyStore((s) => s.lockedCalibrationKeys)
  const lockCalibration = useEconomyStore((s) => s.lockCalibration)
  const unlockCalibration = useEconomyStore((s) => s.unlockCalibration)

  const slipCount = monthHistory.filter((m) => m.source === 'imported_slip').length

  const report = useMemo(() => {
    if (!profile) return null
    const year = new Date().getFullYear()
    const table = computeBudgetTable(
      year, profile, budgetTemplate, monthHistory, [], [], [], [], [], {}, [], undefined, false, [],
      { monthlyDeposit: 0, startDate: `${year}-01-01`, funds: [], snapshots: [] },
    )
    const rows = table.sections.flatMap((s) => s.rows).map((r) => ({
      id: r.id, label: r.label, cells: r.cells.map((c) => ({ budget: c.budget, actual: c.actual })),
    }))
    return computeAccuracy(rows)
  }, [profile, budgetTemplate, monthHistory])

  if (!profile || slipCount < 2) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
        Importer flere lønnsslipper for å måle treffsikkerhet.
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 space-y-4">
      {/* Treff-% topp */}
      {report && (
        <div className="rounded-xl border border-border/50 bg-card/60 p-4 flex items-center gap-4">
          <Target className="h-6 w-6 text-primary" />
          <div>
            <p className="text-3xl font-bold font-mono tabular-nums">{report.overallHitRate} %</p>
            <p className="text-xs text-muted-foreground">treffsikkerhet · {report.monthsWithData} måneder med data</p>
          </div>
        </div>
      )}

      {/* Innstillinger */}
      <div className="rounded-xl border border-border/50 bg-card/60 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Auto-kalibrer prognoser</span>
          <button
            role="switch" aria-checked={settings.enabled}
            onClick={() => setCalibrationSettings({ ...settings, enabled: !settings.enabled })}
            className={cn('h-6 w-11 rounded-full transition-colors', settings.enabled ? 'bg-primary' : 'bg-muted')}
          >
            <span className={cn('block h-5 w-5 rounded-full bg-white transition-transform', settings.enabled ? 'translate-x-5' : 'translate-x-0.5')} />
          </button>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Horisont</span>
          <input type="range" min={3} max={12} step={1} value={settings.horizonSlips}
            onChange={(e) => setCalibrationSettings({ ...settings, horizonSlips: parseInt(e.target.value) })}
            className="flex-1 accent-primary" />
          <span className="font-mono">{settings.horizonSlips} slipper</span>
        </div>
      </div>

      {/* Avvikstabell */}
      {report && report.rows.length > 0 && (
        <div className="rounded-xl border border-border/50 bg-card/60 p-4">
          <h3 className="text-sm font-medium mb-2">Avvik (budsjett vs faktisk)</h3>
          <div className="space-y-1.5">
            {report.rows.map((r) => (
              <div key={r.key} className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">{r.label}</span>
                <span className={cn('font-mono', Math.abs(r.deviationPct) <= 5 ? 'text-green-400' : Math.abs(r.deviationPct) <= 15 ? 'text-yellow-400' : 'text-red-400')}>
                  {r.deviation >= 0 ? '+' : ''}{fmtNOK(r.deviation)} ({r.deviationPct >= 0 ? '+' : ''}{Math.round(r.deviationPct)} %)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Kalibreringslogg */}
      <div className="rounded-xl border border-border/50 bg-card/60 p-4">
        <h3 className="text-sm font-medium mb-2">Kalibreringslogg</h3>
        {calibrationLog.length === 0 ? (
          <p className="text-xs text-muted-foreground">Ingen kalibreringer ennå.</p>
        ) : (
          <div className="space-y-1.5">
            {calibrationLog.slice(0, 20).map((e, i) => {
              const isLocked = lockedKeys.includes(e.key)
              return (
                <div key={`${e.key}-${i}`} className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">
                    {e.label}: {fmtNOK(e.previous)} → <span className="text-foreground font-mono">{fmtNOK(e.calibrated)}</span>
                    {e.sampleCount > 0 && <span className="text-muted-foreground/60"> (snitt {e.sampleCount})</span>}
                  </span>
                  <button onClick={() => isLocked ? unlockCalibration(e.key) : lockCalibration(e.key)}
                    className="text-muted-foreground hover:text-foreground" title={isLocked ? 'Lås opp' : 'Lås (auto rører den ikke)'}>
                    {isLocked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
```

> **Implementeringsnotat:** `computeBudgetTable`-signaturen har mange parametre — verifiser eksakt rekkefølge mot `src/domain/economy/budgetTableComputer.ts` og dashbordets kall i `EconomyDashboard.tsx`, og kopier argumentrekkefølgen derfra (bruk tomme arrays/standardverdier for det som ikke trengs for accuracy). Målet er kun å hente `sections[].rows[].cells[].{budget,actual}`.

- [ ] **Step 3: Lazy-import + nav i EconomyPage**

I `src/pages/economy/EconomyPage.tsx`:
- Importer `Target` fra lucide.
- Lazy: `const ForecastAccuracyPage = lazyWithRetry(() => import('./ForecastAccuracyPage').then((m) => ({ default: m.ForecastAccuracyPage })))`
- `NAV_ITEMS`: `{ page: 'calibration', label: 'Treffsikkerhet', Icon: Target }` (etter `tax` er naturlig).
- Render-gren: `{currentPage === 'calibration' && <ForecastAccuracyPage />}`.

- [ ] **Step 4: Verifiser bygg**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/store/useAppStore.ts src/pages/economy/ForecastAccuracyPage.tsx src/pages/economy/EconomyPage.tsx
git commit -m "feat(treffsikkerhet): side med treff-%, avvik, logg og innstillinger

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Synliggjør fanen (MODULES + onboarding)

**Files:**
- Modify: `src/pages/economy/OnboardingWizard.tsx`

- [ ] **Step 1: Legg `'calibration'` i MODULES**

I `src/pages/economy/OnboardingWizard.tsx`, importer `Target` fra lucide og legg til en `MODULES`-oppføring (etter `tax`):

```ts
  {
    tab: 'calibration',
    label: 'Treffsikkerhet',
    desc: 'Auto-kalibrer prognoser mot faktiske slipper',
    icon: Target,
    defaultFor: ['forsvaret', 'custom'],
  },
```

(persist v24-migreringen fra Task 5 dekker eksisterende brukere; importData-migreringen dekker sky-stien.)

- [ ] **Step 2: Verifiser**

Run: `npm run build && npm test`
Expected: PASS / alle grønne.

- [ ] **Step 3: Commit**

```bash
git add src/pages/economy/OnboardingWizard.tsx
git commit -m "feat(treffsikkerhet): synliggjør fanen i MODULES

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: Dashboard-chip

**Files:**
- Modify: `src/pages/economy/EconomyDashboard.tsx`

- [ ] **Step 1: Legg til pengepuls-chip ved nylig kalibrering**

I `EconomyDashboard.tsx`:

a) Hent `calibrationLog` fra `useActiveEconomyStore()`-destruktureringen.

b) Etter de andre chip-blokkene (før `// ── Render ──`):

```ts
  // Treffsikkerhet-chip: vis nyeste vesentlige kalibrering (≥ 300 kr endring)
  const recentCal = calibrationLog.find((e) => Math.abs(e.calibrated - e.previous) >= 300)
  if (recentCal) {
    const diff = recentCal.calibrated - recentCal.previous
    chips.push({
      icon: '🎯',
      text: `${recentCal.label}-estimat justert ${diff >= 0 ? '+' : ''}${Math.round(diff).toLocaleString('no-NO')} kr`,
    })
  }
```

- [ ] **Step 2: Verifiser bygg**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/pages/economy/EconomyDashboard.tsx
git commit -m "feat(treffsikkerhet): dashbord-chip ved vesentlig kalibrering

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 10: Sluttverifisering

**Files:** ingen kodeendring med mindre noe feiler.

- [ ] **Step 1: Full verifisering**

Run: `npm test && npm run typecheck && npm run build`
Expected: Alle PASS. forecastCalibration- og calibrationStore-testene grønne.

- [ ] **Step 2: Manuell konsistens-sjekk**

Run: `npm run dev`. Sjekk at:
- Treffsikkerhet-fanen viser treff-%, avvik og (etter ny slipp-import) en kalibreringslogg.
- Slå AV auto-kalibrering → ny slipp-import setter siste-verdi (som før). Slå PÅ → snitt brukes.
- Lås en logg-rad → den endres ikke ved neste import.
- Kalibrert skattetrekk forplanter seg til budsjett/lønn/pensjon (samme `profile`-kilde).

---

## Self-Review (utført av planforfatter)

- **Spec-dekning:** Kalibreringsmodell trimmet snitt (Task 2–3), treff-% (Task 4), store + persist + synk (Task 5), importSlip/restore deler calibrateProfile + konsistens-invariant (Task 6), UI treff-%/avvik/logg/innstillinger (Task 7), nav + MODULES + migrering (Task 7–8), dashboard-chip (Task 9), feilhåndtering/tomtilstand (Task 3, 7), testing inkl. blip + locked + av/på + invariant (Task 2–6). Faste tillegg-beløp og sparing/gjeld er bevisst utelatt (spec: sekundært).
- **Placeholders:** Domene-/store-tasks har komplett kode + tester. UI-tasken (7) har komplett komponentkode med eksplisitt implementeringsnotat om å verifisere `computeBudgetTable`-argumentrekkefølgen mot dashbordet (bevisst — signaturen er lang og verifiseres ved bygg).
- **Typekonsistens:** `CalibrationKey/Entry/Result/Settings`, `CalibratedValues`, `AccuracyReport`, `DEFAULT_CALIBRATION_SETTINGS`, og funksjonsnavn (`selectNormalSlips`, `trimmedMean`, `calibrateProfile`, `computeAccuracy`, `HIT_TOLERANCE_PCT`) er konsistente på tvers av tasks.
- **Rekkefølge:** Task 6 forutsetter calibrateProfile (Task 3) + store-felt (Task 5). Task 7 nav forutsetter `'calibration'` i `EconomySubPage` (Task 7 selv) og `EconomyTab` (Task 1).
- **Konsistens-regel:** Kalibrering skriver kun til `profile` (Task 6) → propagerer til budsjett/Veikart/pensjon/formue; settings/log/locked i persist + Supabase (Task 5). Konsistens-invariant-test (Task 6) låser at av-tilstand ≡ dagens oppførsel. `restoreProfileFromSlips` (null-profil-fallback) beholdes som siste-verdi — kalibrering kjører ved neste import.
