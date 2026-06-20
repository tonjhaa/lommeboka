# Formue over tid Implementeringsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bygg en "Formue over tid"-graf (netto formue som tidsserie, historikk + projeksjon, Din/Felles) som vises kompakt på dashbordet og i en dedikert side, drevet av én ren kalkulator som alltid er konsistent med resten av verktøyet.

**Architecture:** Ren `computeNetWorthSeries(input)` i `netWorthCalculator.ts` utleder hver måneds formue fra eksisterende data (sparing via `computeEffectiveBalance`/`projectSavingsGrowth`, fond via snapshots, IVF kumulativt, gjeld via interpolasjon bakover + `buildRepaymentPlan` fremover). En hook `useNetWorthSeries` samler store-data og memoiserer. Dashboard + ny `FormuePage` konsumerer samme serie.

**Tech Stack:** React 19 + TypeScript (strict), Zustand, Vitest, recharts (allerede avhengighet), Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-06-19-formue-over-tid-design.md`
**Branch:** `feat/formue-over-tid`

**Konvensjoner:**
- TypeScript-sjekk: bruk **`npm run typecheck`** (= `tsc -b`). `npx tsc --noEmit` fanger IKKE `noUnusedLocals` i dette composite-oppsettet.
- Tester: `npm test` (vitest run); spesifikk fil: `npm test -- <navn>`.
- Conventional commits. Avslutt hver commit-melding med blank linje + `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

**Sentrale eksisterende funksjoner (verifisert):**
- `computeEffectiveBalance(account, asOf: Date): number` — faktisk saldo ved dato.
- `projectSavingsGrowth(account, toMonth: {year,month}): number[]` — månedsserie fra `account.openingDate`.
- `buildRepaymentPlan(debt): { rows: { month, balance, ... }[], ... }` — i-dag-forankret, `rows[i].balance` = saldo måned i+1 fra nå.
- `FormueChart` props: `{ history: {m,v}[]; projected?: {m,v}[]; nettoFormue: number; label?: string }`.

---

### Task 1: Typer

**Files:**
- Modify: `src/types/economy.ts` (legg til i enden; utvid `EconomyTab`)

- [ ] **Step 1: Legg til formue-typer**

Legg til nederst i `src/types/economy.ts`:

```ts
// ------------------------------------------------------------
// FORMUE OVER TID
// ------------------------------------------------------------

export type NetWorthScope = 'din' | 'felles'

export interface NetWorthPoint {
  year: number
  month: number              // 1–12
  sparing: number
  fond: number
  ivf: number                // maks(0, kassesaldo)
  gjeld: number              // positivt tall (trekkes fra)
  total: number              // sparing + fond + ivf − gjeld
  isProjected: boolean       // false = faktisk (≤ nå), true = fremskrevet
}

export type NetWorthSeries = NetWorthPoint[]

export interface NetWorthInput {
  scope: NetWorthScope
  from: { year: number; month: number }
  to: { year: number; month: number }
  now: { year: number; month: number }
  savingsAccounts: SavingsAccount[]
  fondPortfolio: FondPortfolio
  ivfTransactions: IVFTransaction[]
  debts: DebtAccount[]
  partnerVeikart: PartnerVeikart
}
```

- [ ] **Step 2: Legg `'formue'` til EconomyTab**

```ts
export type EconomyTab =
  | 'dashboard' | 'budget' | 'salary' | 'atf' | 'feriepenger'
  | 'savings' | 'fond' | 'debt' | 'absence' | 'tax'
  | 'subscriptions' | 'ivf' | 'vacation' | 'settings' | 'veikart' | 'gaver' | 'partner' | 'permisjon'
  | 'pension' | 'formue'
```

- [ ] **Step 3: Verifiser**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/types/economy.ts
git commit -m "feat(formue): typer for formue over tid

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Måneds-hjelpere + tom serie

**Files:**
- Create: `src/domain/economy/netWorthCalculator.ts`
- Test: `src/domain/economy/__tests__/netWorthCalculator.test.ts`

- [ ] **Step 1: Skriv failing test**

Create `src/domain/economy/__tests__/netWorthCalculator.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { enumerateMonths, monthEndDate, computeNetWorthSeries } from '../netWorthCalculator'
import type { NetWorthInput } from '@/types/economy'

const EMPTY: NetWorthInput = {
  scope: 'din',
  from: { year: 2026, month: 1 },
  to: { year: 2026, month: 3 },
  now: { year: 2026, month: 2 },
  savingsAccounts: [],
  fondPortfolio: { monthlyDeposit: 0, startDate: '2026-01-01', funds: [], snapshots: [] },
  ivfTransactions: [],
  debts: [],
  partnerVeikart: { enabled: false, annualIncome: 0, annualNetIncome: 0, equity: 0, bsu: 0, bsuMonthlyContribution: 0, monthlySavings: 0, accounts: [] },
}

describe('enumerateMonths', () => {
  it('lister alle måneder inklusiv endepunkter', () => {
    expect(enumerateMonths({ year: 2025, month: 11 }, { year: 2026, month: 2 }))
      .toEqual([
        { year: 2025, month: 11 }, { year: 2025, month: 12 },
        { year: 2026, month: 1 }, { year: 2026, month: 2 },
      ])
  })
})

describe('monthEndDate', () => {
  it('gir siste dag i måneden', () => {
    expect(monthEndDate(2026, 2).getDate()).toBe(28)
    expect(monthEndDate(2024, 2).getDate()).toBe(29) // skuddår
  })
})

describe('computeNetWorthSeries — tom', () => {
  it('gir et punkt per måned med total 0', () => {
    const s = computeNetWorthSeries(EMPTY)
    expect(s).toHaveLength(3)
    expect(s.every((p) => p.total === 0)).toBe(true)
    expect(s[0].isProjected).toBe(false) // jan ≤ nå (feb)
    expect(s[2].isProjected).toBe(true)  // mars > nå
  })
})
```

- [ ] **Step 2: Kjør — verifiser feil**

Run: `npm test -- netWorthCalculator`
Expected: FAIL (modul finnes ikke).

- [ ] **Step 3: Implementer skjelett**

Create `src/domain/economy/netWorthCalculator.ts`:

```ts
// ============================================================
// FORMUE OVER TID — ren kalkulator (rekonstruksjon, ingen lagring)
// Utleder netto formue per måned fra eksisterende data.
// ============================================================

import type { NetWorthInput, NetWorthPoint, NetWorthSeries } from '@/types/economy'

/** Siste dag i måneden som Date (lokal tid). */
export function monthEndDate(year: number, month: number): Date {
  return new Date(year, month, 0) // dag 0 i neste måned = siste dag denne
}

/** Alle {year,month} fra `from` til `to` inklusiv. */
export function enumerateMonths(
  from: { year: number; month: number },
  to: { year: number; month: number },
): { year: number; month: number }[] {
  const out: { year: number; month: number }[] = []
  let y = from.year
  let m = from.month
  while (y < to.year || (y === to.year && m <= to.month)) {
    out.push({ year: y, month: m })
    m++
    if (m > 12) { m = 1; y++ }
  }
  return out
}

/** True hvis (year,month) er etter `now`. */
function isAfter(year: number, month: number, now: { year: number; month: number }): boolean {
  return year > now.year || (year === now.year && month > now.month)
}

export function computeNetWorthSeries(input: NetWorthInput): NetWorthSeries {
  return enumerateMonths(input.from, input.to).map(({ year, month }): NetWorthPoint => {
    const sparing = 0
    const fond = 0
    const ivf = 0
    const gjeld = 0
    return {
      year, month, sparing, fond, ivf, gjeld,
      total: sparing + fond + ivf - gjeld,
      isProjected: isAfter(year, month, input.now),
    }
  })
}
```

- [ ] **Step 4: Kjør — verifiser pass**

Run: `npm test -- netWorthCalculator`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/economy/netWorthCalculator.ts src/domain/economy/__tests__/netWorthCalculator.test.ts
git commit -m "feat(formue): måneds-hjelpere og tom serie-skjelett

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Sparing per måned (faktisk + ankret projeksjon)

**Files:**
- Modify: `src/domain/economy/netWorthCalculator.ts`
- Test: `src/domain/economy/__tests__/netWorthCalculator.test.ts`

- [ ] **Step 1: Skriv failing test**

Legg til i testfila (toppen, utvid import):

```ts
import { enumerateMonths, monthEndDate, computeNetWorthSeries, savingsBalanceAt } from '../netWorthCalculator'
import type { SavingsAccount } from '@/types/economy'

function konto(overrides: Partial<SavingsAccount> = {}): SavingsAccount {
  return {
    id: 's1', type: 'sparekonto', label: 'Sparekonto',
    openingBalance: 100_000, openingDate: '2026-01-01',
    monthlyContribution: 1_000, interestCreditFrequency: 'monthly',
    rateHistory: [{ fromDate: '2026-01-01', rate: 0 }],
    balanceHistory: [{ year: 2026, month: 2, balance: 102_000, isManual: false }],
    withdrawals: [], contributions: [],
    ...overrides,
  }
}

describe('savingsBalanceAt', () => {
  const now = { year: 2026, month: 2 }
  it('bruker faktisk saldo (computeEffectiveBalance) for fortid/nå', () => {
    // balanceHistory har 102 000 i feb 2026
    expect(savingsBalanceAt([konto()], 2026, 2, now)).toBeCloseTo(102_000, 0)
  })
  it('projiserer fremtid ankret til faktisk nå (vokser med innskudd)', () => {
    const v = savingsBalanceAt([konto()], 2026, 4, now)
    expect(v).toBeGreaterThan(102_000) // to mnd innskudd lagt til
  })
})
```

- [ ] **Step 2: Kjør — verifiser feil**

Run: `npm test -- netWorthCalculator`
Expected: FAIL (`savingsBalanceAt` finnes ikke).

- [ ] **Step 3: Implementer**

Legg til i `netWorthCalculator.ts` (utvid import):

```ts
import { computeEffectiveBalance, projectSavingsGrowth } from './savingsCalculator'
import type { SavingsAccount } from '@/types/economy'

/** Månedsindeks fra konto-åpning (0-basert). */
function monthIndexFromOpening(account: SavingsAccount, year: number, month: number): number {
  const open = new Date(account.openingDate)
  return (year - open.getFullYear()) * 12 + (month - (open.getMonth() + 1))
}

/**
 * Sparesaldo (sum kontoer) ved (year,month).
 * Fortid/nå: faktisk via computeEffectiveBalance.
 * Fremtid: projectSavingsGrowth, ankret slik at nå-verdien matcher faktisk.
 */
export function savingsBalanceAt(
  accounts: SavingsAccount[],
  year: number,
  month: number,
  now: { year: number; month: number },
): number {
  const future = year > now.year || (year === now.year && month > now.month)
  if (!future) {
    return accounts.reduce((s, a) => s + computeEffectiveBalance(a, monthEndDate(year, month)), 0)
  }
  return accounts.reduce((s, a) => {
    const proj = projectSavingsGrowth(a, { year, month })
    const tIdx = monthIndexFromOpening(a, year, month)
    const nowIdx = monthIndexFromOpening(a, now.year, now.month)
    const projT = proj[tIdx] ?? proj[proj.length - 1] ?? 0
    const projNow = proj[nowIdx] ?? projT
    const actualNow = computeEffectiveBalance(a, monthEndDate(now.year, now.month))
    return s + projT + (actualNow - projNow)
  }, 0)
}
```

- [ ] **Step 4: Kjør — verifiser pass**

Run: `npm test -- netWorthCalculator`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/economy/netWorthCalculator.ts src/domain/economy/__tests__/netWorthCalculator.test.ts
git commit -m "feat(formue): sparesaldo per måned (faktisk + ankret projeksjon)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Fond + IVF per måned

**Files:**
- Modify: `src/domain/economy/netWorthCalculator.ts`
- Test: `src/domain/economy/__tests__/netWorthCalculator.test.ts`

- [ ] **Step 1: Skriv failing test**

Legg til i testfila (utvid import med `fondValueAt, ivfBalanceAt`):

```ts
import type { FondPortfolio, IVFTransaction } from '@/types/economy'

describe('fondValueAt', () => {
  const portfolio: FondPortfolio = {
    monthlyDeposit: 0, startDate: '2026-01-01', funds: [],
    snapshots: [
      { date: '2026-01-15', totalValue: 50_000 },
      { date: '2026-03-15', totalValue: 60_000 },
    ],
  }
  const now = { year: 2026, month: 3 }
  it('bruker nærmeste snapshot ≤ måned', () => {
    expect(fondValueAt(portfolio, 2026, 2, now)).toBe(50_000) // siste ≤ feb
    expect(fondValueAt(portfolio, 2026, 3, now)).toBe(60_000)
  })
  it('gir 0 før første snapshot', () => {
    expect(fondValueAt(portfolio, 2025, 12, now)).toBe(0)
  })
})

describe('ivfBalanceAt', () => {
  const txs: IVFTransaction[] = [
    { id: '1', date: '2026-01-10', label: 'Sparing', type: 'SPARING', amount: 20_000 },
    { id: '2', date: '2026-02-10', label: 'Faktura', type: 'FAKTURA', amount: -5_000 },
  ]
  it('kumulativ sum ≤ måned, gulvet på 0', () => {
    expect(ivfBalanceAt(txs, 2026, 1)).toBe(20_000)
    expect(ivfBalanceAt(txs, 2026, 2)).toBe(15_000)
  })
})
```

- [ ] **Step 2: Kjør — verifiser feil**

Run: `npm test -- netWorthCalculator`
Expected: FAIL.

- [ ] **Step 3: Implementer**

Legg til i `netWorthCalculator.ts` (utvid import med `FondPortfolio, IVFTransaction`):

```ts
import type { FondPortfolio, IVFTransaction } from '@/types/economy'

/** Fondverdi ved (year,month): nærmeste snapshot ≤ månedsslutt, ellers 0. Fremtid framskrives flatt fra siste snapshot. */
export function fondValueAt(
  portfolio: FondPortfolio,
  year: number,
  month: number,
  _now: { year: number; month: number },
): number {
  const cutoff = monthEndDate(year, month).toISOString().split('T')[0]
  const upto = (portfolio.snapshots ?? [])
    .filter((s) => s.date <= cutoff)
    .sort((a, b) => a.date.localeCompare(b.date))
  return upto.length > 0 ? upto[upto.length - 1].totalValue : 0
}

/** IVF-kassesaldo ved (year,month): maks(0, kumulativ sum av transaksjoner ≤ månedsslutt). */
export function ivfBalanceAt(txs: IVFTransaction[], year: number, month: number): number {
  const cutoff = monthEndDate(year, month).toISOString().split('T')[0]
  const sum = txs.filter((t) => t.date <= cutoff).reduce((s, t) => s + t.amount, 0)
  return Math.max(0, sum)
}
```

> Merk: fond-framskriving fremover er bevisst flat (siste snapshot) i v1 — `expectedReturn`-basert framskriving er en mulig senere forbedring (dokumentert i spec).

- [ ] **Step 4: Kjør — verifiser pass**

Run: `npm test -- netWorthCalculator`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/economy/netWorthCalculator.ts src/domain/economy/__tests__/netWorthCalculator.test.ts
git commit -m "feat(formue): fond- og IVF-verdi per måned

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Gjeld per måned (interpolasjon bakover + amortisering fremover)

**Files:**
- Modify: `src/domain/economy/netWorthCalculator.ts`
- Test: `src/domain/economy/__tests__/netWorthCalculator.test.ts`

- [ ] **Step 1: Skriv failing test**

Legg til i testfila (utvid import med `debtBalanceAt`):

```ts
import type { DebtAccount } from '@/types/economy'

function laan(overrides: Partial<DebtAccount> = {}): DebtAccount {
  return {
    id: 'd1', creditor: 'Lånekassen', type: 'studielaan',
    originalAmount: 200_000, currentBalance: 120_000,
    rateHistory: [{ fromDate: '2020-01-01', nominalRate: 4 }],
    monthlyPayment: 3_000, termFee: 0, startDate: '2020-01-01',
    ...overrides,
  }
}

describe('debtBalanceAt', () => {
  const now = { year: 2026, month: 6 }
  it('gir currentBalance ved nå', () => {
    expect(debtBalanceAt([laan()], 2026, 6, now)).toBeCloseTo(120_000, 0)
  })
  it('interpolerer bakover mellom originalAmount (startdato) og currentBalance (nå)', () => {
    // et punkt mellom start og nå skal ligge mellom 120k og 200k
    const v = debtBalanceAt([laan()], 2023, 1, now)
    expect(v).toBeGreaterThan(120_000)
    expect(v).toBeLessThanOrEqual(200_000)
  })
  it('reduseres fremover (amortisering)', () => {
    const v = debtBalanceAt([laan()], 2026, 12, now)
    expect(v).toBeLessThan(120_000)
  })
})
```

- [ ] **Step 2: Kjør — verifiser feil**

Run: `npm test -- netWorthCalculator`
Expected: FAIL.

- [ ] **Step 3: Implementer**

Legg til i `netWorthCalculator.ts` (utvid import med `buildRepaymentPlan` og `DebtAccount`):

```ts
import { buildRepaymentPlan } from './debtCalculator'
import type { DebtAccount } from '@/types/economy'

/** Antall måneder fra (ay,am) til (by,bm). */
function monthsDiff(ay: number, am: number, by: number, bm: number): number {
  return (by - ay) * 12 + (bm - am)
}

/**
 * Gjeldssaldo (sum, positivt) ved (year,month).
 * Nå: currentBalance. Fremtid: buildRepaymentPlan. Fortid: lineær interpolasjon
 * mellom originalAmount (startDate) og currentBalance (nå) — tilnærming, lander
 * eksakt på currentBalance ved nå. Gjeld uten gyldig startDate: flat på currentBalance bakover.
 */
export function debtBalanceAt(
  debts: DebtAccount[],
  year: number,
  month: number,
  now: { year: number; month: number },
): number {
  const future = year > now.year || (year === now.year && month > now.month)
  return debts.reduce((sum, d) => {
    if (year === now.year && month === now.month) return sum + d.currentBalance
    if (future) {
      const plan = buildRepaymentPlan(d)
      const idx = monthsDiff(now.year, now.month, year, month) - 1
      const bal = idx >= 0 && idx < plan.rows.length ? plan.rows[idx].balance : 0
      return sum + bal
    }
    // fortid: interpoler start→nå
    const start = new Date(d.startDate)
    if (isNaN(start.getTime()) || !d.originalAmount) return sum + d.currentBalance
    const startY = start.getFullYear()
    const startM = start.getMonth() + 1
    const totalMonths = monthsDiff(startY, startM, now.year, now.month)
    if (totalMonths <= 0) return sum + d.currentBalance
    const elapsed = monthsDiff(startY, startM, year, month)
    const frac = Math.min(1, Math.max(0, elapsed / totalMonths))
    return sum + (d.originalAmount + (d.currentBalance - d.originalAmount) * frac)
  }, 0)
}
```

- [ ] **Step 4: Kjør — verifiser pass**

Run: `npm test -- netWorthCalculator`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/economy/netWorthCalculator.ts src/domain/economy/__tests__/netWorthCalculator.test.ts
git commit -m "feat(formue): gjeldssaldo per måned (interpolasjon + amortisering)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Sett sammen serien (Din) + konsistens-invariant

**Files:**
- Modify: `src/domain/economy/netWorthCalculator.ts`
- Test: `src/domain/economy/__tests__/netWorthCalculator.test.ts`

- [ ] **Step 1: Skriv failing test**

Legg til i testfila:

```ts
describe('computeNetWorthSeries — konsistens-invariant (din)', () => {
  it('nå-punkt.total == Σ faktisk sparing + fond + maks(0,ivf) − Σ currentBalance', () => {
    const input: NetWorthInput = {
      ...EMPTY,
      from: { year: 2026, month: 1 }, to: { year: 2026, month: 3 }, now: { year: 2026, month: 2 },
      savingsAccounts: [konto()],
      debts: [laan()],
    }
    const s = computeNetWorthSeries(input)
    const naa = s.find((p) => p.year === 2026 && p.month === 2)!
    const forventet = savingsBalanceAt([konto()], 2026, 2, input.now)
      + 0 /* fond */ + 0 /* ivf */ - 120_000 /* gjeld currentBalance */
    expect(naa.total).toBeCloseTo(forventet, 0)
    expect(naa.gjeld).toBeCloseTo(120_000, 0)
  })
})
```

- [ ] **Step 2: Kjør — verifiser feil**

Run: `npm test -- netWorthCalculator`
Expected: FAIL (nå-punkt har fortsatt total 0 fra skjelettet).

- [ ] **Step 3: Implementer — koble komponentene inn**

Erstatt `computeNetWorthSeries`-kroppen i `netWorthCalculator.ts`:

```ts
export function computeNetWorthSeries(input: NetWorthInput): NetWorthSeries {
  return enumerateMonths(input.from, input.to).map(({ year, month }): NetWorthPoint => {
    const sparing = savingsBalanceAt(input.savingsAccounts, year, month, input.now)
    const fond = fondValueAt(input.fondPortfolio, year, month, input.now)
    const ivf = ivfBalanceAt(input.ivfTransactions, year, month)
    const gjeld = debtBalanceAt(input.debts, year, month, input.now)
    const partner = input.scope === 'felles'
      ? partnerNetWorthAt(input.partnerVeikart, year, month, input.now)
      : { sparing: 0, fond: 0, gjeld: 0 }
    const totalSparing = sparing + partner.sparing
    const totalFond = fond + partner.fond
    const totalGjeld = gjeld + partner.gjeld
    return {
      year, month,
      sparing: totalSparing, fond: totalFond, ivf, gjeld: totalGjeld,
      total: totalSparing + totalFond + ivf - totalGjeld,
      isProjected: isAfter(year, month, input.now),
    }
  })
}
```

Legg til en midlertidig stub for partner (erstattes i Task 7) øverst i fila:

```ts
import type { PartnerVeikart } from '@/types/economy'

function partnerNetWorthAt(
  _partner: PartnerVeikart, _year: number, _month: number, _now: { year: number; month: number },
): { sparing: number; fond: number; gjeld: number } {
  return { sparing: 0, fond: 0, gjeld: 0 }
}
```

- [ ] **Step 4: Kjør — verifiser pass**

Run: `npm test -- netWorthCalculator && npm run typecheck`
Expected: PASS / rent.

- [ ] **Step 5: Commit**

```bash
git add src/domain/economy/netWorthCalculator.ts src/domain/economy/__tests__/netWorthCalculator.test.ts
git commit -m "feat(formue): sett sammen serien + konsistens-invariant

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Felles (partner-simulering)

**Files:**
- Modify: `src/domain/economy/netWorthCalculator.ts`
- Test: `src/domain/economy/__tests__/netWorthCalculator.test.ts`

- [ ] **Step 1: Skriv failing test**

Legg til i testfila:

```ts
describe('computeNetWorthSeries — felles', () => {
  const base: NetWorthInput = {
    ...EMPTY,
    from: { year: 2026, month: 2 }, to: { year: 2026, month: 2 }, now: { year: 2026, month: 2 },
    savingsAccounts: [konto()],
  }
  it('felles legger partnerformue oppå din', () => {
    const partner = {
      ...base.partnerVeikart,
      enabled: true,
      accounts: [{ id: 'p1', label: 'Partner sparekonto', balance: 80_000, monthlyContribution: 0, rate: 0 }],
      debts: [{ id: 'pd', label: 'Partner billån', currentBalance: 30_000, interestRate: 5, monthlyPayment: 2000 }],
    }
    const din = computeNetWorthSeries({ ...base, scope: 'din', partnerVeikart: partner })
    const felles = computeNetWorthSeries({ ...base, scope: 'felles', partnerVeikart: partner })
    const naaDin = din[0].total
    const naaFelles = felles[0].total
    // Partner bidrar netto 80 000 − 30 000 = 50 000
    expect(naaFelles - naaDin).toBeCloseTo(50_000, 0)
  })
})
```

- [ ] **Step 2: Kjør — verifiser feil**

Run: `npm test -- netWorthCalculator`
Expected: FAIL (partner-stub gir 0).

- [ ] **Step 3: Implementer partner-simulering**

Erstatt `partnerNetWorthAt`-stubben i `netWorthCalculator.ts`:

```ts
import { partnerNonBsuEquity, partnerMonthlySavingsTotal } from '@/types/economy'

/**
 * Partners netto formue ved (year,month) — SIMULERT (partner har ingen balanceHistory).
 * Sparing: nåverdi (accounts + BSU) ± månedssparing × antall måneder fra nå.
 * Fond: flat (fondCurrentValue). Gjeld: nåverdi ± terminbeløp.
 */
function partnerNetWorthAt(
  partner: PartnerVeikart,
  year: number,
  month: number,
  now: { year: number; month: number },
): { sparing: number; fond: number; gjeld: number } {
  if (!partner.enabled) return { sparing: 0, fond: 0, gjeld: 0 }
  const dM = (year - now.year) * 12 + (month - now.month) // negativ = fortid
  const nowSparing = partnerNonBsuEquity(partner) + (partner.bsu ?? 0)
  const monthlySave = partnerMonthlySavingsTotal(partner) + (partner.bsuMonthlyContribution ?? 0)
  const sparing = Math.max(0, nowSparing + monthlySave * dM)
  const fond = partner.fondCurrentValue ?? 0
  const nowGjeld = (partner.debts ?? []).reduce((s, d) => s + (d.currentBalance ?? 0), 0)
  const monthlyPay = (partner.debts ?? []).reduce((s, d) => s + (d.monthlyPayment ?? 0), 0)
  const gjeld = Math.max(0, nowGjeld - monthlyPay * dM)
  return { sparing, fond, gjeld }
}
```

- [ ] **Step 4: Kjør — verifiser pass**

Run: `npm test -- netWorthCalculator && npm run typecheck`
Expected: PASS / rent.

- [ ] **Step 5: Commit**

```bash
git add src/domain/economy/netWorthCalculator.ts src/domain/economy/__tests__/netWorthCalculator.test.ts
git commit -m "feat(formue): felles husholdning med simulert partnerformue

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Hook `useNetWorthSeries`

**Files:**
- Create: `src/hooks/useNetWorthSeries.ts`

- [ ] **Step 1: Implementer hooken**

Create `src/hooks/useNetWorthSeries.ts`:

```ts
import { useMemo } from 'react'
import { useActiveEconomyStore } from '@/contexts/EconomyStoreContext'
import { useSharedProjectStore } from '@/store/useSharedProjectStore'
import { computeNetWorthSeries } from '@/domain/economy/netWorthCalculator'
import type { NetWorthScope, NetWorthSeries } from '@/types/economy'

/** Antall måneder historikk og projeksjon som standard. */
const HISTORY_MONTHS = 36
const PROJECTION_MONTHS = 60

export function useNetWorthSeries(
  scope: NetWorthScope,
  opts?: { historyMonths?: number; projectionMonths?: number },
): NetWorthSeries {
  const { savingsAccounts, fondPortfolio, ivfTransactions, debts, partnerVeikart } = useActiveEconomyStore()
  const sharedIvf = useSharedProjectStore((s) => s.transactions)

  const historyMonths = opts?.historyMonths ?? HISTORY_MONTHS
  const projectionMonths = opts?.projectionMonths ?? PROJECTION_MONTHS

  return useMemo(() => {
    const d = new Date()
    const now = { year: d.getFullYear(), month: d.getMonth() + 1 }
    const back = new Date(d.getFullYear(), d.getMonth() - historyMonths, 1)
    const fwd = new Date(d.getFullYear(), d.getMonth() + projectionMonths, 1)
    const ivf = sharedIvf.length > 0
      ? sharedIvf.map((t) => ({ id: t.id, date: t.date, label: t.label, type: t.type, amount: t.amount, merknad: t.merknad }))
      : ivfTransactions
    return computeNetWorthSeries({
      scope,
      from: { year: back.getFullYear(), month: back.getMonth() + 1 },
      to: { year: fwd.getFullYear(), month: fwd.getMonth() + 1 },
      now,
      savingsAccounts, fondPortfolio, ivfTransactions: ivf, debts, partnerVeikart,
    })
  }, [scope, historyMonths, projectionMonths, savingsAccounts, fondPortfolio, ivfTransactions, sharedIvf, debts, partnerVeikart])
}
```

- [ ] **Step 2: Verifiser**

Run: `npm run typecheck`
Expected: PASS.

> Merk: `SharedProjectTransaction.type` er `IVFTransactionType`, så mappingen til `IVFTransaction` er typekompatibel. Hvis typecheck klager på manglende felt, bruk `as IVFTransaction[]` på den mappede lista.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useNetWorthSeries.ts
git commit -m "feat(formue): useNetWorthSeries-hook (memoisert, delt IVF)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: Dashboard-integrasjon (FormueChart + Din/Felles + nå-tall fra kalkulator)

**Files:**
- Modify: `src/pages/economy/EconomyDashboard.tsx`

- [ ] **Step 1: Mat FormueChart med formue-serien**

I `EconomyDashboard.tsx`:

a) Importer øverst:

```ts
import { useNetWorthSeries } from '@/hooks/useNetWorthSeries'
import { useState } from 'react'
```

(Hvis `useState` allerede importeres via `react`, legg den til der i stedet.)

b) Inne i komponenten, legg til scope-state og serier (ved de andre `useMemo`/hooks):

```ts
  const [formueScope, setFormueScope] = useState<'din' | 'felles'>('din')
  const formueSerie = useNetWorthSeries(formueScope)
  const dinSerieNaa = useNetWorthSeries('din')
```

c) Bygg `history`/`projected` for `FormueChart` fra serien (erstatt bruken av `trendData`/`projectedTrend` i FormueChart-kallet):

```ts
  const MONTH_SHORT2 = ['Jan','Feb','Mar','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Des']
  const formueHistory = formueSerie.filter((p) => !p.isProjected).map((p) => ({ m: MONTH_SHORT2[p.month - 1], v: p.total }))
  const formueProjected = formueSerie.filter((p) => p.isProjected).map((p) => ({ m: MONTH_SHORT2[p.month - 1], v: p.total }))
  const nettoFormueNaa = dinSerieNaa.find((p) => !p.isProjected && p === [...dinSerieNaa].reverse().find((q) => !q.isProjected)) // siste faktiske
```

Forenkle nå-tallet:

```ts
  const sisteFaktiske = [...dinSerieNaa].reverse().find((p) => !p.isProjected)
  const nettoFormueFraSerie = sisteFaktiske?.total ?? 0
```

d) Erstatt FormueChart-kallet (linje ~445) med scope-toggle over grafen:

```tsx
        <div className="flex flex-col gap-1">
          {partnerVeikart.enabled && (
            <div className="flex gap-1 self-end">
              {(['din','felles'] as const).map((sc) => (
                <button key={sc} onClick={() => setFormueScope(sc)}
                  className={cn('rounded px-2 py-0.5 text-[10px] font-medium border',
                    formueScope === sc ? 'border-primary text-primary' : 'border-border/40 text-muted-foreground')}>
                  {sc === 'din' ? 'Din' : 'Felles'}
                </button>
              ))}
            </div>
          )}
          <FormueChart
            history={formueHistory}
            projected={formueProjected}
            nettoFormue={nettoFormueFraSerie}
            label="Netto formue"
          />
        </div>
```

e) **Konsistens-refaktor:** der `nettoFormue` (det inline-beregnede) sendes til `HeroBand`, bruk `nettoFormueFraSerie` i stedet, slik at hero og graf har samme kilde. (Behold de øvrige hero-feltene; kun nettoFormue byttes til serie-kilden.)

- [ ] **Step 2: Verifiser bygg**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Manuell røyktest**

Run: `npm run dev`, åpne dashbordet.
Expected: «Netto formue»-grafen viser formue over tid; Din/Felles-toggle vises når partner er aktivert og endrer kurven; hero-formue matcher grafens nå-punkt.

- [ ] **Step 4: Commit**

```bash
git add src/pages/economy/EconomyDashboard.tsx
git commit -m "feat(formue): dashbord viser netto formue over tid + Din/Felles

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 10: Navigasjon + FormuePage (dedikert side)

**Files:**
- Modify: `src/store/useAppStore.ts` (utvid `EconomySubPage`)
- Create: `src/pages/economy/FormuePage.tsx`
- Modify: `src/pages/economy/EconomyPage.tsx` (lazy-import, NAV_ITEMS, render-gren)

- [ ] **Step 1: Utvid `EconomySubPage`**

I `src/store/useAppStore.ts`, legg `'formue'` til `EconomySubPage`-unionen (linje 13).

- [ ] **Step 2: Opprett FormuePage**

Create `src/pages/economy/FormuePage.tsx`:

```tsx
import { useState, useMemo } from 'react'
import { ComposedChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { useNetWorthSeries } from '@/hooks/useNetWorthSeries'
import { useActiveEconomyStore } from '@/contexts/EconomyStoreContext'
import { cn } from '@/lib/utils'

const MONTHS = ['Jan','Feb','Mar','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Des']
function fmtNOK(n: number): string { return Math.round(n).toLocaleString('no-NO') + ' kr' }
const RANGES = [{ label: '1 år', m: 12 }, { label: '3 år', m: 36 }, { label: '5 år', m: 60 }, { label: 'Alt', m: 240 }]

export function FormuePage() {
  const { partnerVeikart } = useActiveEconomyStore()
  const [scope, setScope] = useState<'din' | 'felles'>('din')
  const [historyMonths, setHistoryMonths] = useState(36)
  const serie = useNetWorthSeries(scope, { historyMonths, projectionMonths: 60 })

  const data = useMemo(() => serie.map((p) => ({
    label: `${MONTHS[p.month - 1]} ${String(p.year).slice(2)}`,
    sparing: p.sparing, fond: p.fond, ivf: p.ivf,
    gjeld: -p.gjeld, total: p.total, isProjected: p.isProjected,
  })), [serie])

  const sisteFaktiske = [...serie].reverse().find((p) => !p.isProjected)
  const naa = sisteFaktiske?.total ?? 0

  if (serie.every((p) => p.total === 0)) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
        Legg til sparing eller gjeld for å se formue over tid.
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 space-y-4">
      {/* Topp: nå-tall + Din/Felles + tidsspenn */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">Netto formue nå</p>
          <p className="text-3xl font-bold font-mono tabular-nums">{fmtNOK(naa)}</p>
        </div>
        <div className="flex gap-2">
          {partnerVeikart.enabled && (
            <div className="flex gap-1">
              {(['din','felles'] as const).map((sc) => (
                <button key={sc} onClick={() => setScope(sc)}
                  className={cn('rounded px-2.5 py-1 text-xs border', scope === sc ? 'border-primary text-primary' : 'border-border/40 text-muted-foreground')}>
                  {sc === 'din' ? 'Din' : 'Felles'}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-1">
            {RANGES.map((r) => (
              <button key={r.label} onClick={() => setHistoryMonths(r.m)}
                className={cn('rounded px-2.5 py-1 text-xs border', historyMonths === r.m ? 'border-primary text-primary' : 'border-border/40 text-muted-foreground')}>
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Stablet nedbrytning + total-linje */}
      <div className="rounded-xl border border-border/50 bg-card/60 p-4" style={{ height: 360 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(215 20% 22%)" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
            <Tooltip formatter={(v: number, n) => [fmtNOK(Math.abs(v)), n]} />
            <Area type="monotone" dataKey="sparing" stackId="a" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} />
            <Area type="monotone" dataKey="fond" stackId="a" stroke="#22c55e" fill="#22c55e" fillOpacity={0.3} />
            <Area type="monotone" dataKey="ivf" stackId="a" stroke="#a855f7" fill="#a855f7" fillOpacity={0.3} />
            <Area type="monotone" dataKey="gjeld" stackId="b" stroke="#ef4444" fill="#ef4444" fillOpacity={0.25} />
            <Line type="monotone" dataKey="total" stroke="#e5e7eb" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Sammensetningspanel: dagens fordeling */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {sisteFaktiske && ([
          ['Sparing', sisteFaktiske.sparing, 'text-blue-400'],
          ['Fond', sisteFaktiske.fond, 'text-green-400'],
          ['Prosjekt', sisteFaktiske.ivf, 'text-purple-400'],
          ['Gjeld', -sisteFaktiske.gjeld, 'text-red-400'],
        ] as const).map(([navn, verdi, farge]) => (
          <div key={navn} className="rounded-lg border border-border/50 bg-card/60 p-3">
            <p className="text-[11px] text-muted-foreground">{navn}</p>
            <p className={cn('text-sm font-mono font-semibold', farge)}>{fmtNOK(verdi)}</p>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-muted-foreground">
        Faktisk formue bakover (gjeld bakover er rekonstruert), projisert fremover. Felles-visning simulerer partners formue.
      </p>
    </div>
  )
}
```

- [ ] **Step 3: Lazy-import + nav i EconomyPage**

I `src/pages/economy/EconomyPage.tsx`:
- Importer `TrendingUp`... bruk et passende ikon, f.eks. `LineChart` fra lucide (legg til i import-blokka).
- Lazy-komponent:
```ts
const FormuePage = lazyWithRetry(() =>
  import('./FormuePage').then((m) => ({ default: m.FormuePage }))
)
```
- `NAV_ITEMS`: `{ page: 'formue', label: 'Formue', Icon: LineChart }` (etter `dashboard`/før `budget` er naturlig).
- Render-gren: `{currentPage === 'formue' && <FormuePage />}`.

- [ ] **Step 4: Verifiser bygg**

Run: `npm run build`
Expected: PASS (typecheck + vite).

- [ ] **Step 5: Commit**

```bash
git add src/store/useAppStore.ts src/pages/economy/FormuePage.tsx src/pages/economy/EconomyPage.tsx
git commit -m "feat(formue): dedikert Formue-side med stablet nedbrytning

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 11: Synliggjør Formue-fanen (MODULES + migrering)

**Files:**
- Modify: `src/pages/economy/OnboardingWizard.tsx` (MODULES)
- Modify: `src/application/useEconomyStore.ts` (persist v23 + importData forward-migrering)

- [ ] **Step 1: Legg `'formue'` i MODULES**

I `src/pages/economy/OnboardingWizard.tsx`, importer `LineChart` fra lucide og legg til en oppføring i `MODULES`-arrayet (etter `veikart`):

```ts
  {
    tab: 'formue',
    label: 'Formue over tid',
    desc: 'Netto formue (sparing/fond/gjeld) som tidsserie',
    icon: LineChart,
    defaultFor: ['forsvaret', 'custom'],
  },
```

- [ ] **Step 2: Persist v23-migrering + importData**

I `src/application/useEconomyStore.ts`:

a) Bump `version: 22` → `version: 23`.

b) Legg til i `migrate` (etter v22-blokken):

```ts
        // v22 → v23: legg til 'formue' i enabledTabs for eksisterende brukere
        if (fromVersion < 23 && state.userPreferences) {
          const prefs = state.userPreferences as { enabledTabs?: string[] }
          if (Array.isArray(prefs.enabledTabs) && !prefs.enabledTabs.includes('formue')) {
            prefs.enabledTabs = [...prefs.enabledTabs, 'formue']
          }
        }
```

c) I `importData`, ved de andre forward-migreringene av `enabledTabs` (der `'partner'` og `'pension'` legges til):

```ts
          if (prefs?.enabledTabs && !prefs.enabledTabs.includes('formue')) {
            prefs.enabledTabs = [...prefs.enabledTabs, 'formue']
          }
```

- [ ] **Step 3: Verifiser**

Run: `npm run build && npm test`
Expected: PASS / alle grønne.

- [ ] **Step 4: Commit**

```bash
git add src/pages/economy/OnboardingWizard.tsx src/application/useEconomyStore.ts
git commit -m "feat(formue): synliggjør Formue-fanen (MODULES + persist v23)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 12: Sluttverifisering

**Files:** ingen kodeendring med mindre noe feiler.

- [ ] **Step 1: Full verifisering**

Run: `npm test && npm run typecheck && npm run build`
Expected: Alle PASS. Bekreft at netWorthCalculator-testene (inkl. konsistens-invariant og felles) er grønne.

- [ ] **Step 2: Manuell konsistens-sjekk**

Run: `npm run dev`. Sjekk at:
- Formue-tallet på dashbordet (hero) == nå-punktet i grafen == Formue-sidens «Netto formue nå».
- Endrer du en sparekonto-saldo eller gjeld, oppdateres BÅDE dashbordgrafen og Formue-siden (én kilde).
- Din/Felles bytter konsistent begge steder.

---

## Self-Review (utført av planforfatter)

- **Spec-dekning:** Ren rekonstruksjon (Task 2–7), Din/Felles (Task 7,9,10), dashbord (Task 9) + dedikert side (Task 10), historikk+projeksjon (Task 3–5), nedbrytning per aktivaklasse (Task 10), konsistens-invariant (Task 6), konsistens-refaktor av hero (Task 9), navigasjon/MODULES/migrering (Task 10–11), feilhåndtering/tomtilstand (Task 2, 10), testing (Task 2–7). Fond-`expectedReturn`-projeksjon er bevisst flat i v1 (notert i Task 4 og spec).
- **Placeholders:** Domene- og hook-tasks har komplett kode + tester. UI-tasks (9, 10) har komplett kode verifisert via `npm run build` + manuell røyktest (følger kodebasens konvensjon om domenetester, ikke komponenttester).
- **Typekonsistens:** `NetWorthInput/Point/Series/Scope`, og funksjonsnavnene (`enumerateMonths`, `monthEndDate`, `savingsBalanceAt`, `fondValueAt`, `ivfBalanceAt`, `debtBalanceAt`, `partnerNetWorthAt`, `computeNetWorthSeries`, `useNetWorthSeries`) er konsistente på tvers av tasks.
- **Rekkefølge:** Task 10 (nav) avhenger av FormuePage som opprettes i samme task. Task 11 forutsetter `'formue'` i `EconomySubPage` (Task 10) og `EconomyTab` (Task 1).
