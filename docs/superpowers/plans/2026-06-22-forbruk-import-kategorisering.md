# Forbruks-import + auto-kategorisering Implementeringsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Importere brukskonto-CSV (forbruk) og auto-kategorisere transaksjonene mot eksisterende `BudgetCategory` (seed-regler + brukerlærte overstyringer), med en synlig «forbruk per kategori vs budsjett»-oversikt.

**Architecture:** Ren parser + ren kategoriseringsmotor i `src/domain/economy/`, seed-data i `src/config/`, transaksjoner + lærte regler i `useEconomyStore` (sky-synket), import/review/oversikt-UI i `src/features/spending/` + `src/pages/economy/`. Kategorisering er deterministisk: `categorize(key, rules)` med tom regel-liste ⇒ `null` (ingen gjetting). C (kalibrering-wiring) er egen oppfølging på `aggregateByCategory`.

**Tech Stack:** React 19 + TypeScript (strict), Zustand, Vitest, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-06-22-forbruk-import-kategorisering-design.md`
**Branch:** `feat/forbruk-import-kategorisering`

**Konvensjoner:**
- TypeScript-sjekk: **`npm run typecheck`** (= `tsc -b`). `npx tsc --noEmit` fanger IKKE `noUnusedLocals`.
- Tester: `npm test -- <navn>`.
- Conventional commits. Avslutt med blank linje + `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

**Verifiserte mønstre:**
- Domene-parser: `src/domain/economy/bankTransactionParser.ts` (`colIdx(headers, ...candidates)`, semikolon-CSV, `toISO`).
- Feature-parser-lag: `src/features/savings/savingsStatementParser.ts` (windows-1252-fallback, kaller domene-parser).
- Importør-UI: `src/features/savings/SavingsImporter.tsx` (`useState<State>`, drag/drop, `accept=".csv"`).
- Side-registrering: `EconomySubPage`-union i `useAppStore.ts`; `EconomyTab`-union (`types/economy.ts:693`); lazy-import + `NAV_ITEMS` + render-gren i `EconomyPage.tsx`; `enabledTabs`-forward-migrering i `useEconomyStore.ts` (~linje 1195, scenario-mønster); `MODULES` i `OnboardingWizard.tsx`.
- `BudgetCategory` forbruks-verdier: `bolig|transport|mat|helse|abonnement|forsikring|klær|fritid|annet_forbruk`.
- `budgetTemplate.lines[]` har `{ category, amount }` (amount negativt = utgift).
- Persist `version: 26` nå → bump til 27.

---

### Task 1: Typer + seed-regler + kategoriseringsmotor

**Files:**
- Modify: `src/types/economy.ts` (legg til typer i enden)
- Create: `src/config/categorySeedRules.ts`
- Create: `src/domain/economy/spendingCategorizer.ts`
- Test: `src/domain/economy/__tests__/spendingCategorizer.test.ts`

- [ ] **Step 1: Legg til typer**

Nederst i `src/types/economy.ts`:

```ts
// ------------------------------------------------------------
// FORBRUKS-IMPORT + KATEGORISERING
// ------------------------------------------------------------

export interface BankSpendingTransaction {
  id: string
  date: string                 // "YYYY-MM-DD"
  counterpartyRaw: string      // "REMA 1000 OSLO 1234"
  counterpartyKey: string      // "rema 1000" (normalisert)
  amount: number               // signert; utgift = negativt
  category: BudgetCategory | null
  categorySource: 'seed' | 'learned' | 'manual' | 'none'
  importBatchId: string
}

export interface CategoryRule {
  id: string
  merchantKey: string          // normalisert motpart (learned: eksakt, seed: substring)
  category: BudgetCategory
  source: 'seed' | 'learned'
}
```

- [ ] **Step 2: Skriv failing test**

Create `src/domain/economy/__tests__/spendingCategorizer.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  normalizeCounterparty, categorize, applyCategories, aggregateByCategory, seedCategoryRules,
} from '../spendingCategorizer'
import type { BankSpendingTransaction, CategoryRule } from '@/types/economy'

function tx(p: Partial<BankSpendingTransaction>): BankSpendingTransaction {
  return {
    id: p.id ?? crypto.randomUUID(), date: p.date ?? '2026-03-15',
    counterpartyRaw: p.counterpartyRaw ?? '', counterpartyKey: p.counterpartyKey ?? '',
    amount: p.amount ?? -100, category: p.category ?? null,
    categorySource: p.categorySource ?? 'none', importBatchId: p.importBatchId ?? 'b1',
  }
}

describe('normalizeCounterparty', () => {
  it('kollapser filialer (sted/tall fjernes)', () => {
    expect(normalizeCounterparty('REMA 1000 OSLO 1234')).toBe(normalizeCounterparty('REMA 1000 TRONDHEIM'))
  })
  it('fjerner kort-/dato-prefiks', () => {
    expect(normalizeCounterparty('VISA VARE 22.03 REMA 1000')).toContain('rema 1000')
  })
})

describe('categorize — presedens', () => {
  const seeds = seedCategoryRules()
  it('seed-treff via substring', () => {
    const key = normalizeCounterparty('REMA 1000 OSLO')
    expect(categorize(key, seeds).category).toBe('mat')
  })
  it('lært vinner over seed', () => {
    const key = normalizeCounterparty('REMA 1000 OSLO')
    const learned: CategoryRule = { id: 'r1', merchantKey: key, category: 'fritid', source: 'learned' }
    expect(categorize(key, [learned, ...seeds]).source).toBe('learned')
    expect(categorize(key, [learned, ...seeds]).category).toBe('fritid')
  })
  it('INVARIANT: tom regel-liste ⇒ null (ingen gjetting)', () => {
    expect(categorize(normalizeCounterparty('REMA 1000'), [])).toEqual({ category: null, source: 'none' })
  })
  it('ukjent motpart uten treff ⇒ null', () => {
    expect(categorize('ukjent butikk xyz', seedCategoryRules()).category).toBeNull()
  })
})

describe('applyCategories', () => {
  it('setter kategori + source per transaksjon', () => {
    const t = tx({ counterpartyKey: normalizeCounterparty('KIWI 555') })
    const [out] = applyCategories([t], seedCategoryRules())
    expect(out.category).toBe('mat')
    expect(out.categorySource).toBe('seed')
  })
  it('tomme regler ⇒ alle null', () => {
    const t = tx({ counterpartyKey: normalizeCounterparty('KIWI 555') })
    expect(applyCategories([t], [])[0].category).toBeNull()
  })
})

describe('aggregateByCategory', () => {
  it('summerer utgift per kategori for valgt måned (absoluttverdi)', () => {
    const txs = [
      tx({ date: '2026-03-02', amount: -200, category: 'mat' }),
      tx({ date: '2026-03-20', amount: -50, category: 'mat' }),
      tx({ date: '2026-02-10', amount: -999, category: 'mat' }),   // annen måned
      tx({ date: '2026-03-05', amount: 5000, category: null }),     // inntekt, ignoreres
    ]
    const agg = aggregateByCategory(txs, 2026, 3)
    expect(agg.mat).toBe(250)
  })
})
```

- [ ] **Step 3: Kjør — verifiser feil**

Run: `npm test -- spendingCategorizer`
Expected: FAIL (moduler finnes ikke).

- [ ] **Step 4: Implementer seed-regler**

Create `src/config/categorySeedRules.ts`:

```ts
import type { BudgetCategory } from '@/types/economy'

/** Innebygde motpart→kategori-regler (substring-match mot normalisert nøkkel).
 *  Kort, vedlikeholdbar startliste — de vanligste norske kjedene. Resten lærer brukeren opp. */
export const SEED_CATEGORY_RULES: { match: string; category: BudgetCategory }[] = [
  // Mat / dagligvare
  { match: 'rema', category: 'mat' }, { match: 'kiwi', category: 'mat' },
  { match: 'meny', category: 'mat' }, { match: 'coop', category: 'mat' },
  { match: 'extra', category: 'mat' }, { match: 'spar', category: 'mat' },
  { match: 'bunnpris', category: 'mat' }, { match: 'joker', category: 'mat' },
  { match: 'oda', category: 'mat' }, { match: 'foodora', category: 'mat' },
  // Transport
  { match: 'circle k', category: 'transport' }, { match: 'esso', category: 'transport' },
  { match: 'shell', category: 'transport' }, { match: 'uno-x', category: 'transport' },
  { match: 'vy', category: 'transport' }, { match: 'atb', category: 'transport' },
  { match: 'ruter', category: 'transport' }, { match: 'bolt', category: 'transport' },
  // Abonnement / strømming
  { match: 'netflix', category: 'abonnement' }, { match: 'spotify', category: 'abonnement' },
  { match: 'hbo', category: 'abonnement' }, { match: 'viaplay', category: 'abonnement' },
  { match: 'disney', category: 'abonnement' }, { match: 'storytel', category: 'abonnement' },
  { match: 'telenor', category: 'abonnement' }, { match: 'telia', category: 'abonnement' },
  // Helse
  { match: 'apotek', category: 'helse' }, { match: 'vitusapotek', category: 'helse' },
  { match: 'boots', category: 'helse' }, { match: 'legevakt', category: 'helse' },
  // Klær
  { match: 'h&m', category: 'klær' }, { match: 'zara', category: 'klær' },
  { match: 'cubus', category: 'klær' }, { match: 'zalando', category: 'klær' },
  // Fritid
  { match: 'vinmonopol', category: 'fritid' }, { match: 'sats', category: 'fritid' },
  { match: 'komplett', category: 'fritid' }, { match: 'elkjøp', category: 'fritid' },
]
```

- [ ] **Step 5: Implementer kategoriseringsmotoren**

Create `src/domain/economy/spendingCategorizer.ts`:

```ts
// ============================================================
// FORBRUKS-KATEGORISERING — ren, deterministisk.
// categorize(key, rules): tom regel-liste ⇒ null (ingen gjetting).
// Presedens: lært (eksakt) vinner over seed (substring).
// ============================================================

import type { BudgetCategory, BankSpendingTransaction, CategoryRule } from '@/types/economy'
import { SEED_CATEGORY_RULES } from '@/config/categorySeedRules'

/** Normaliser bankmotpart → matchbar nøkkel. Kollapser filialer, fjerner kort/dato/tall/sted. */
export function normalizeCounterparty(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\b(visa|vare|kjøp|betaling|nok|kr)\b/g, ' ')   // betalings-/valuta-ord
    .replace(/\b\d{2}\.\d{2}(\.\d{2,4})?\b/g, ' ')           // datoer
    .replace(/\*?\d{3,}\*?/g, ' ')                            // kortnummer/lange tall
    .replace(/[^a-zæøå0-9& ]+/g, ' ')                         // tegnstøy (behold &, tall til butikknavn som "rema 1000")
    .replace(/\s+/g, ' ')
    .trim()
}

/** Konverter seed-reglene til CategoryRule[] (source:'seed'). Stabile id-er. */
export function seedCategoryRules(): CategoryRule[] {
  return SEED_CATEGORY_RULES.map((s) => ({
    id: `seed:${s.match}`, merchantKey: s.match, category: s.category, source: 'seed' as const,
  }))
}

export interface CategorizeResult { category: BudgetCategory | null; source: 'learned' | 'seed' | 'none' }

/** Lært (eksakt key-match) vinner over seed (substring). Tom liste ⇒ null. */
export function categorize(key: string, rules: CategoryRule[]): CategorizeResult {
  for (const r of rules) {
    if (r.source === 'learned' && key === r.merchantKey) return { category: r.category, source: 'learned' }
  }
  for (const r of rules) {
    if (r.source === 'seed' && key.includes(r.merchantKey)) return { category: r.category, source: 'seed' }
  }
  return { category: null, source: 'none' }
}

/** Kategoriser et sett transaksjoner. Bevarer eksisterende 'manual'-kategori (brukeroverstyrt). */
export function applyCategories(txs: BankSpendingTransaction[], rules: CategoryRule[]): BankSpendingTransaction[] {
  return txs.map((t) => {
    if (t.categorySource === 'manual') return t   // ikke overstyr en eksplisitt enkelt-overstyring
    const { category, source } = categorize(t.counterpartyKey, rules)
    return { ...t, category, categorySource: category ? source : 'none' }
  })
}

/** Sum utgift (absoluttverdi av negative beløp) per kategori for valgt år+måned. */
export function aggregateByCategory(
  txs: BankSpendingTransaction[], year: number, month: number,
): Partial<Record<BudgetCategory, number>> {
  const out: Partial<Record<BudgetCategory, number>> = {}
  for (const t of txs) {
    if (t.amount >= 0 || !t.category) continue
    const d = new Date(t.date)
    if (d.getFullYear() !== year || d.getMonth() + 1 !== month) continue
    out[t.category] = (out[t.category] ?? 0) + Math.abs(t.amount)
  }
  return out
}
```

- [ ] **Step 6: Kjør — verifiser pass**

Run: `npm test -- spendingCategorizer && npm run typecheck`
Expected: PASS / rent.

- [ ] **Step 7: Commit**

```bash
git add src/types/economy.ts src/config/categorySeedRules.ts src/domain/economy/spendingCategorizer.ts src/domain/economy/__tests__/spendingCategorizer.test.ts
git commit -m "feat(forbruk): kategoriseringsmotor + seed-regler + invariant

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Brukskonto-CSV-parser

**Files:**
- Create: `src/domain/economy/spendingStatementParser.ts`
- Create: `src/features/spending/spendingStatementReader.ts`
- Test: `src/domain/economy/__tests__/spendingStatementParser.test.ts`

- [ ] **Step 1: Skriv failing test**

Create `src/domain/economy/__tests__/spendingStatementParser.test.ts`:

```ts
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
```

- [ ] **Step 2: Kjør — verifiser feil**

Run: `npm test -- spendingStatementParser`
Expected: FAIL (modul finnes ikke).

- [ ] **Step 3: Implementer domene-parseren**

Create `src/domain/economy/spendingStatementParser.ts`:

```ts
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
  const iInn  = colIdx(headers, 'inn')
  const iUt   = colIdx(headers, 'ut')

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
```

- [ ] **Step 4: Implementer feature-lag fil-leser**

Create `src/features/spending/spendingStatementReader.ts` (windows-1252-fallback, som savings):

```ts
import { parseSpendingCSV } from '@/domain/economy/spendingStatementParser'
import type { BankSpendingTransaction } from '@/types/economy'

export async function parseSpendingFile(file: File): Promise<BankSpendingTransaction[]> {
  let text: string
  try {
    const buf = await file.arrayBuffer()
    text = new TextDecoder('windows-1252').decode(buf)
    if (!text.includes(';')) throw new Error('ikke CSV')
  } catch {
    text = await file.text()
  }
  return parseSpendingCSV(text)
}
```

- [ ] **Step 5: Kjør — verifiser pass**

Run: `npm test -- spendingStatementParser && npm run typecheck`
Expected: PASS / rent.

> **Implementeringsnotat (kolonnenavn):** parseren auto-detekterer tekst-kolonnen via kandidater (`tekst`/`beskrivelse`/`melding`/`motpart`). Hvis brukerens faktiske brukskonto-CSV bruker et annet navn, legg det til i `colIdx(headers, ...)`-kandidatlisten. Be om EN anonymisert header-rad ved tvil.

- [ ] **Step 6: Commit**

```bash
git add src/domain/economy/spendingStatementParser.ts src/features/spending/spendingStatementReader.ts src/domain/economy/__tests__/spendingStatementParser.test.ts
git commit -m "feat(forbruk): brukskonto-CSV-parser (kolonne-tolerant, signert beløp)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Store — transaksjoner + lærte regler + synk

**Files:**
- Modify: `src/application/useEconomyStore.ts`
- Modify: `src/lib/syncEconomyData.ts`
- Modify: `src/application/usePartnerStore.ts` (stub)
- Test: `src/store/__tests__/spendingStore.test.ts`

- [ ] **Step 1: Skriv failing test**

Create `src/store/__tests__/spendingStore.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useEconomyStore } from '@/application/useEconomyStore'
import type { BankSpendingTransaction } from '@/types/economy'

function tx(id: string, key: string): BankSpendingTransaction {
  return { id, date: '2026-03-15', counterpartyRaw: key, counterpartyKey: key, amount: -100,
    category: null, categorySource: 'none', importBatchId: 'b1' }
}

describe('spending-store', () => {
  beforeEach(() => useEconomyStore.setState({ spendingTransactions: [], categoryRules: [] }))

  it('addSpendingTransactions deduper på (dato, key, beløp)', () => {
    const a = tx('1', 'rema 1000'); const b = { ...tx('2', 'rema 1000') }
    useEconomyStore.getState().addSpendingTransactions([a])
    useEconomyStore.getState().addSpendingTransactions([b])   // duplikat (samme dato/key/beløp)
    expect(useEconomyStore.getState().spendingTransactions).toHaveLength(1)
  })

  it('setCategoryRule erstatter per merchantKey', () => {
    useEconomyStore.getState().setCategoryRule({ id: 'r1', merchantKey: 'rema 1000', category: 'mat', source: 'learned' })
    useEconomyStore.getState().setCategoryRule({ id: 'r2', merchantKey: 'rema 1000', category: 'fritid', source: 'learned' })
    const rules = useEconomyStore.getState().categoryRules.filter((r) => r.merchantKey === 'rema 1000')
    expect(rules).toHaveLength(1)
    expect(rules[0].category).toBe('fritid')
  })
})
```

- [ ] **Step 2: Kjør — verifiser feil**

Run: `npm test -- spendingStore`
Expected: FAIL.

- [ ] **Step 3: Implementer store-endringer**

I `src/application/useEconomyStore.ts`:

a) Importer typene (i eksisterende `@/types/economy`-import): `BankSpendingTransaction, CategoryRule`.

b) I `EconomyState`-interfacet (nær `keyFigureOverrides`):

```ts
  spendingTransactions: BankSpendingTransaction[]
  categoryRules: CategoryRule[]
  addSpendingTransactions: (txs: BankSpendingTransaction[]) => void
  setSpendingTransactions: (txs: BankSpendingTransaction[]) => void
  setCategoryRule: (rule: CategoryRule) => void
  removeCategoryRule: (merchantKey: string) => void
```

c) Initial state (ved `keyFigureOverrides: []`):

```ts
      spendingTransactions: [],
      categoryRules: [],
```

d) Actions (ved `setKeyFigureOverride`):

```ts
      addSpendingTransactions: (txs) => set((s) => {
        const seen = new Set(s.spendingTransactions.map((t) => `${t.date}|${t.counterpartyKey}|${t.amount}`))
        const fresh = txs.filter((t) => !seen.has(`${t.date}|${t.counterpartyKey}|${t.amount}`))
        return { spendingTransactions: [...s.spendingTransactions, ...fresh] }
      }),
      setSpendingTransactions: (txs) => set({ spendingTransactions: txs }),
      setCategoryRule: (rule) => set((s) => ({
        categoryRules: [...s.categoryRules.filter((r) => r.merchantKey !== rule.merchantKey), rule],
      })),
      removeCategoryRule: (merchantKey) => set((s) => ({
        categoryRules: s.categoryRules.filter((r) => r.merchantKey !== merchantKey),
      })),
```

e) Bump persist `version: 26` → `version: 27`. I migreringsblokken, legg til guard (samme mønster som keyFigureOverrides v26):

```ts
          if (fromVersion < 27) {
            if (!Array.isArray(state.spendingTransactions)) state.spendingTransactions = []
            if (!Array.isArray(state.categoryRules)) state.categoryRules = []
          }
```

f) `partialize` (ved `keyFigureOverrides: state.keyFigureOverrides`):

```ts
        spendingTransactions: state.spendingTransactions,
        categoryRules: state.categoryRules,
```

g) `importData` (ved `keyFigureOverrides: data.keyFigureOverrides ?? []`):

```ts
            spendingTransactions: data.spendingTransactions ?? [],
            categoryRules: data.categoryRules ?? [],
```

I `src/lib/syncEconomyData.ts`, i `saveToSupabase`-payload (ved `keyFigureOverrides: state.keyFigureOverrides`):

```ts
    spendingTransactions: state.spendingTransactions,
    categoryRules: state.categoryRules,
```

I `src/application/usePartnerStore.ts`: legg til stub-felt (`spendingTransactions: []`, `categoryRules: []`, no-op `addSpendingTransactions`/`setSpendingTransactions`/`setCategoryRule`/`removeCategoryRule`).

- [ ] **Step 4: Kjør test + typecheck**

Run: `npm test -- spendingStore && npm run typecheck`
Expected: PASS / rent.

- [ ] **Step 5: Commit**

```bash
git add src/application/useEconomyStore.ts src/lib/syncEconomyData.ts src/application/usePartnerStore.ts src/store/__tests__/spendingStore.test.ts
git commit -m "feat(forbruk): store for transaksjoner + lærte regler + persist v27 + synk

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Import + review-UI

**Files:**
- Create: `src/features/spending/SpendingImporter.tsx`

- [ ] **Step 1: Implementer importør + review**

Create `src/features/spending/SpendingImporter.tsx`. Speiler `SavingsImporter`-mønsteret (drag/drop + `accept=".csv"`), men med kategorisert review-tabell:

```tsx
import { useRef, useState } from 'react'
import { Upload, Check } from 'lucide-react'
import { parseSpendingFile } from './spendingStatementReader'
import { applyCategories, seedCategoryRules, normalizeCounterparty } from '@/domain/economy/spendingCategorizer'
import { useEconomyStore } from '@/application/useEconomyStore'
import type { BankSpendingTransaction, BudgetCategory, CategoryRule } from '@/types/economy'

const SPENDING_CATEGORIES: BudgetCategory[] = ['mat', 'transport', 'bolig', 'helse', 'abonnement', 'forsikring', 'klær', 'fritid', 'annet_forbruk']
const catLabel = (c: BudgetCategory) => c.replace('_', ' ')

export function SpendingImporter({ onDone }: { onDone?: () => void }) {
  const learnedRules = useEconomyStore((s) => s.categoryRules)
  const addTxs = useEconomyStore((s) => s.addSpendingTransactions)
  const setRule = useEconomyStore((s) => s.setCategoryRule)
  const fileRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<BankSpendingTransaction[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [newRules, setNewRules] = useState<CategoryRule[]>([])

  async function handleFile(file: File) {
    setError(null)
    try {
      const parsed = await parseSpendingFile(file)
      const allRules = [...learnedRules, ...newRules, ...seedCategoryRules()]
      setRows(applyCategories(parsed, allRules))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kunne ikke lese filen')
    }
  }

  function setRowCategory(idx: number, category: BudgetCategory, applyToAll: boolean) {
    setRows((prev) => {
      if (!prev) return prev
      const row = prev[idx]
      if (applyToAll) {
        const rule: CategoryRule = { id: crypto.randomUUID(), merchantKey: row.counterpartyKey, category, source: 'learned' }
        setNewRules((r) => [...r.filter((x) => x.merchantKey !== rule.merchantKey), rule])
        return prev.map((t) => t.counterpartyKey === row.counterpartyKey ? { ...t, category, categorySource: 'learned' } : t)
      }
      return prev.map((t, i) => i === idx ? { ...t, category, categorySource: 'manual' } : t)
    })
  }

  function save() {
    if (!rows) return
    newRules.forEach(setRule)
    addTxs(rows)
    setRows(null); setNewRules([])
    onDone?.()
  }

  if (!rows) {
    return (
      <div className="space-y-3">
        <button onClick={() => fileRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border/60 py-8 text-sm text-muted-foreground hover:border-primary hover:text-foreground">
          <Upload className="h-5 w-5" /> Velg brukskonto-CSV
        </button>
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
        {error && <p className="text-[11px] text-red-400">{error}</p>}
      </div>
    )
  }

  // Ukategoriserte først
  const sorted = [...rows].sort((a, b) => (a.category ? 1 : 0) - (b.category ? 1 : 0))
  const uncategorized = rows.filter((r) => !r.category).length

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span>{rows.length} transaksjoner · <span className={uncategorized ? 'text-yellow-400' : 'text-green-400'}>{uncategorized} ukategorisert</span></span>
        <button onClick={save} className="flex items-center gap-1 rounded bg-primary/20 px-3 py-1 text-primary"><Check className="h-4 w-4" /> Lagre</button>
      </div>
      <div className="max-h-96 space-y-1 overflow-y-auto">
        {sorted.map((r) => {
          const idx = rows.indexOf(r)
          return (
            <div key={r.id} className="flex items-center gap-2 rounded-md border border-border/40 px-2 py-1 text-[11px]">
              <span className="w-20 shrink-0 text-muted-foreground">{r.date}</span>
              <span className="min-w-0 flex-1 truncate">{r.counterpartyRaw || normalizeCounterparty(r.counterpartyKey)}</span>
              <span className="w-20 shrink-0 text-right font-mono">{r.amount.toLocaleString('no-NO')}</span>
              <select value={r.category ?? ''} onChange={(e) => setRowCategory(idx, e.target.value as BudgetCategory, true)}
                className="shrink-0 rounded border border-border/50 bg-background px-1 py-0.5 text-[11px]"
                aria-label={`Kategori for ${r.counterpartyRaw}`}>
                <option value="" disabled>Velg…</option>
                {SPENDING_CATEGORIES.map((c) => <option key={c} value={c}>{catLabel(c)}</option>)}
              </select>
            </div>
          )
        })}
      </div>
      <p className="text-[10px] text-muted-foreground/60">Endring av kategori lærer regelen for motparten (brukes neste gang). Lagre for å bekrefte.</p>
    </div>
  )
}
```

> **Implementeringsnotat:** Det finnes ingen sentral `BUDGET_CATEGORY_LABELS`-konstant; bruk derfor `catLabel(c)` (kategori-nøkkel med understrek→mellomrom) som vist. «Bare denne»-varianten (manual, ingen regel) kan legges til som en sekundær handling senere; v1 bruker «lær regel» som standard ved endring.

- [ ] **Step 2: Verifiser bygg**

Run: `npm run build && npm run typecheck`
Expected: PASS / rent. Pass på `noUnusedLocals`.

- [ ] **Step 3: Commit**

```bash
git add src/features/spending/SpendingImporter.tsx
git commit -m "feat(forbruk): import + kategorisert review med lær-regel-flyt

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Oversiktsside + nav-registrering

**Files:**
- Create: `src/pages/economy/SpendingPage.tsx`
- Modify: `src/store/useAppStore.ts` (EconomySubPage)
- Modify: `src/types/economy.ts` (EconomyTab)
- Modify: `src/pages/economy/EconomyPage.tsx` (lazy + nav + render)
- Modify: `src/application/useEconomyStore.ts` (enabledTabs-migrering v27)
- Modify: `src/pages/economy/OnboardingWizard.tsx` (MODULES)

- [ ] **Step 1: Opprett oversiktssiden**

Create `src/pages/economy/SpendingPage.tsx`:

```tsx
import { useState, useMemo } from 'react'
import { useEconomyStore } from '@/application/useEconomyStore'
import { aggregateByCategory } from '@/domain/economy/spendingCategorizer'
import { SpendingImporter } from '@/features/spending/SpendingImporter'
import type { BudgetCategory } from '@/types/economy'

const SPENDING_CATEGORIES: BudgetCategory[] = ['mat', 'transport', 'bolig', 'helse', 'abonnement', 'forsikring', 'klær', 'fritid', 'annet_forbruk']
const fmt = (n: number) => Math.round(n).toLocaleString('no-NO') + ' kr'

export function SpendingPage() {
  const txs = useEconomyStore((s) => s.spendingTransactions)
  const budgetTemplate = useEconomyStore((s) => s.budgetTemplate)
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

  const actual = useMemo(() => aggregateByCategory(txs, year, month), [txs, year, month])
  const budgetByCat = useMemo(() => {
    const out: Partial<Record<BudgetCategory, number>> = {}
    for (const l of budgetTemplate.lines) {
      if (l.amount < 0) out[l.category] = (out[l.category] ?? 0) + Math.abs(l.amount)
    }
    return out
  }, [budgetTemplate])

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Forbruk</h2>
        <div className="flex items-center gap-2 text-sm">
          <select value={month} onChange={(e) => setMonth(parseInt(e.target.value, 10))} className="rounded border border-border/50 bg-background px-2 py-1" aria-label="Måned">
            {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
          </select>
          <select value={year} onChange={(e) => setYear(parseInt(e.target.value, 10))} className="rounded border border-border/50 bg-background px-2 py-1" aria-label="År">
            {[now.getFullYear(), now.getFullYear() - 1].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      <div className="rounded-xl border border-border/50 bg-card/60 p-4">
        <h3 className="mb-2 text-sm font-medium">Importer brukskonto</h3>
        <SpendingImporter />
      </div>

      <div className="rounded-xl border border-border/50 bg-card/60 p-4">
        <h3 className="mb-2 text-sm font-medium">Forbruk vs budsjett — {month}/{year}</h3>
        <div className="space-y-1.5">
          {SPENDING_CATEGORIES.map((c) => {
            const a = actual[c] ?? 0
            const b = budgetByCat[c] ?? 0
            if (a === 0 && b === 0) return null
            const diff = a - b
            return (
              <div key={c} className="flex items-center justify-between text-[12px]">
                <span className="capitalize">{c.replace('_', ' ')}</span>
                <span className="flex items-center gap-3 font-mono">
                  <span className="text-muted-foreground">{fmt(b)}</span>
                  <span>{fmt(a)}</span>
                  <span className={diff > 0 ? 'text-red-400' : 'text-green-400'}>{diff > 0 ? '+' : ''}{fmt(diff)}</span>
                </span>
              </div>
            )
          })}
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground/60">Budsjett · faktisk · avvik. Kalibrering av prognosen mot dette kommer senere.</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Registrer siden (union-typer)**

- `src/store/useAppStore.ts`: legg `'forbruk'` i `EconomySubPage`-unionen (linje 15).
- `src/types/economy.ts`: legg `'forbruk'` i `EconomyTab`-unionen (linje ~693).

- [ ] **Step 3: Wire i EconomyPage**

I `src/pages/economy/EconomyPage.tsx`: legg til lazy-import (følg eksisterende `lazyWithRetry`-mønster), `NAV_ITEMS`-oppføring (ikon: `Wallet` fra lucide-react — IKKE `Receipt`, som alt er i bruk for «Lønn»; importer `Wallet` i ikon-importblokken hvis ikke til stede; label 'Forbruk', plasser etter `budget`), og render-gren `{currentPage === 'forbruk' && <SpendingPage />}`:

```tsx
const SpendingPage = lazyWithRetry(() => import('./SpendingPage').then((m) => ({ default: m.SpendingPage })))
```

- [ ] **Step 4: enabledTabs-migrering + MODULES**

I `src/application/useEconomyStore.ts`, i `importData` enabledTabs-forward-migreringen (samme sted som 'scenario'/'calibration'):

```ts
          if (prefs?.enabledTabs && !prefs.enabledTabs.includes('forbruk')) {
            prefs.enabledTabs = [...prefs.enabledTabs, 'forbruk']
          }
```

I `src/pages/economy/OnboardingWizard.tsx`, legg til i `MODULES` (etter budget-relaterte):

```ts
  { tab: 'forbruk', label: 'Forbruk', desc: 'Importer brukskonto, auto-kategoriser, se forbruk vs budsjett', icon: Wallet, defaultFor: ['forsvaret', 'custom'] },
```

(Importer `Wallet` fra lucide-react i OnboardingWizard hvis ikke allerede importert. `ModuleOption`-formen er verifisert: `{ tab: EconomyTab; label: string; desc: string; icon: React.FC<{ className?: string }>; defaultFor: ('forsvaret'|'custom')[] }`.)

- [ ] **Step 5: Verifiser bygg + full test + manuell røyktest**

Run: `npm run build && npm run typecheck && npm test`
Expected: PASS / rent / alle grønne.

Manuell: `npm run dev` → ny «Forbruk»-fane. Importer en CSV → kategorisert review (ukategoriserte øverst) → endre kategori (lærer) → Lagre → oversikt viser forbruk vs budsjett for måneden.

- [ ] **Step 6: Commit**

```bash
git add src/pages/economy/SpendingPage.tsx src/store/useAppStore.ts src/types/economy.ts src/pages/economy/EconomyPage.tsx src/application/useEconomyStore.ts src/pages/economy/OnboardingWizard.tsx
git commit -m "feat(forbruk): oversiktsside + nav/tab/MODULES-registrering

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Sluttverifisering

- [ ] **Step 1: Full verifisering**

Run: `npm test && npm run typecheck && npm run build`
Expected: Alle PASS. Nye tester (spendingCategorizer, spendingStatementParser, spendingStore) grønne; ingen eksisterende brutt.

- [ ] **Step 2: Konsistens-sjekk (manuell)**

Run: `npm run dev`. Bekreft:
- Uten importerte transaksjoner: oversikten er tom, ingen krasj.
- Importer → kategoriser → samme motpart kategoriseres automatisk neste import (lært regel).
- Forbruk-oversikten bruker SAMME `BudgetCategory` som budsjettet (mat/transport/…).
- Reload (+ partner om koblet): transaksjoner + regler bevart (sky-synk).

---

## Self-Review (utført av planforfatter)

- **Spec-dekning:** parser (Task 2), kategoriseringsmotor m/seed+lært presedens + invariant (Task 1), store + persist v27 + 3-stis synk + stub (Task 3), import/review m/lær-flyt (Task 4), forbruk-vs-budsjett-oversikt + nav (Task 5), feilhåndtering (mangler kolonne → kast i Task 2; dedup i Task 3; ukategorisert synlig i Task 4). C eksplisitt utenfor scope (bygger på `aggregateByCategory`).
- **Placeholders:** domene/motor/store har komplett kode + tester. UI-tasks har komplett komponentkode; implementeringsnotater dekker BUDGET_CATEGORY_LABELS-fallback, kolonnenavn-verifisering og ModuleOption-feltnavn.
- **Typekonsistens:** `BankSpendingTransaction`/`CategoryRule`, `normalizeCounterparty`/`categorize`/`applyCategories`/`aggregateByCategory`/`seedCategoryRules`, `addSpendingTransactions`/`setCategoryRule`, `parseSpendingCSV`/`parseSpendingFile`, `'forbruk'` (EconomySubPage + EconomyTab) konsistente på tvers.
- **Konsistens-regel:** kategori-målet er eksisterende `BudgetCategory` (samme som budsjett); tom regel-liste ⇒ ingen gjetting (invariant); transaksjoner + lærte regler synkes (3 stier + stub); C bygger på samme aggregeringsmotor.
