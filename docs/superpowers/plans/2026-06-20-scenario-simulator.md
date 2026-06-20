# Scenario-simulator Implementeringsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bygg en hva-skjer-hvis-simulator med live-spaker (lønn/rente/sparing/engangsbeløp) som propagerer gjennom de samme projeksjonsmotorene som resten av verktøyet, og viser baseline vs scenario (formuekurve + nøkkeltall + treffsikkerhet-bånd).

**Architecture:** Ren `scenarioSimulator.ts` tar en baseline-input-bundle + spaker, transformerer input (rente på kontoer/gjeld, sparingDelta, engangsoverlay) og kjører eksisterende motorer (`computeNetWorthSeries`, `beregnSkatt`, `calcMaxPurchaseSimple`, `projectPension`) to ganger — nøytralt (baseline) og med spaker (scenario). Hook samler input fra storen; dedikert side viser resultatet. Nøytrale spaker ⇒ scenario ≡ baseline (invariant-test).

**Tech Stack:** React 19 + TypeScript (strict), Zustand, Vitest, recharts, Tailwind v4, lucide-react.

**Spec:** `docs/superpowers/specs/2026-06-20-scenario-simulator-design.md`
**Branch:** `feat/scenario-simulator`

**Konvensjoner:**
- TypeScript-sjekk: **`npm run typecheck`** (= `tsc -b`). `npx tsc --noEmit` fanger IKKE `noUnusedLocals`.
- Tester: `npm test`; spesifikk: `npm test -- <navn>`.
- Conventional commits. Avslutt hver melding med blank linje + `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

**Verifiserte signaturer:**
- `beregnSkatt(input: TaxInput, year?): TaxResult` — `TaxResult.skattInntekt` = inntektsskatt. Netto ≈ brutto − skattInntekt (pensjon/fagforening er konstante → kanselleres i Δ).
- `calcMaxPurchaseSimple(equity, annualIncome, existingDebt, config): number` — bruk `defaultConfig` fra `@/config/default.config`.
- `computeNetWorthSeries(input: NetWorthInput): NetWorthSeries` — tar `savingsAccounts`, `fondPortfolio`, `ivfTransactions`, `debts`, `partnerVeikart`, `from/to/now`, `scope`.
- `projectPension(input: PensionInput): PensionProjection` — `.monthlyTotal`.
- `SavingsAccount.rateHistory: {fromDate, rate}[]`, `monthlyContribution`. `DebtAccount.rateHistory: {fromDate, nominalRate}[]`.

---

### Task 1: Typer

**Files:**
- Modify: `src/types/economy.ts` (legg til i enden; utvid `EconomyTab`)

- [ ] **Step 1: Legg til scenario-typer**

Legg til nederst i `src/types/economy.ts`:

```ts
// ------------------------------------------------------------
// SCENARIO-SIMULATOR (hva-skjer-hvis)
// ------------------------------------------------------------

export interface ScenarioOneTimeEvent {
  id: string
  label: string
  date: string               // "YYYY-MM-DD"
  amount: number             // + arv/bonus, − stor utgift
}

export interface ScenarioLevers {
  salaryPct: number           // ±% på brutto månedslønn
  salaryKr: number            // ±kr flat på brutto månedslønn
  rateDeltaPp: number         // ±prosentpoeng på rente (gjeld + sparing)
  monthlySavingsDelta: number // ±kr/mnd ekstra sparing
  oneTimeEvents: ScenarioOneTimeEvent[]
  extraNetToSavingsPct: number // andel av ekstra netto antatt spart (0–100)
}

export interface ScenarioKeyFigures {
  nettoPerMonth: number
  sparerate: number           // %
  netWorth5y: number
  purchasingPower: number     // maks kjøpesum
  pensionAt67: number         // kr/mnd
}

export interface ScenarioResult {
  baseline: { series: NetWorthSeries; figures: ScenarioKeyFigures }
  scenario: { series: NetWorthSeries; figures: ScenarioKeyFigures }
}
```

- [ ] **Step 2: Legg `'scenario'` til EconomyTab**

```ts
export type EconomyTab =
  | 'dashboard' | 'budget' | 'salary' | 'atf' | 'feriepenger'
  | 'savings' | 'fond' | 'debt' | 'absence' | 'tax'
  | 'subscriptions' | 'ivf' | 'vacation' | 'settings' | 'veikart' | 'gaver' | 'partner' | 'permisjon'
  | 'pension' | 'formue' | 'calibration' | 'scenario'
```

- [ ] **Step 3: Verifiser**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/types/economy.ts
git commit -m "feat(scenario): typer for hva-skjer-hvis-simulator

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Input-transformasjoner (rente + sparing)

**Files:**
- Create: `src/domain/economy/scenarioSimulator.ts`
- Test: `src/domain/economy/__tests__/scenarioSimulator.test.ts`

- [ ] **Step 1: Skriv failing test**

Create `src/domain/economy/__tests__/scenarioSimulator.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { bumpAccountRates, bumpDebtRates, addSavingsDelta } from '../scenarioSimulator'
import type { SavingsAccount, DebtAccount } from '@/types/economy'

function konto(over: Partial<SavingsAccount> = {}): SavingsAccount {
  return {
    id: 's1', type: 'sparekonto', label: 'Sparekonto',
    openingBalance: 100_000, openingDate: '2025-01-01',
    monthlyContribution: 2_000, interestCreditFrequency: 'monthly',
    rateHistory: [{ fromDate: '2025-01-01', rate: 3 }],
    balanceHistory: [], withdrawals: [], contributions: [], ...over,
  }
}
function laan(over: Partial<DebtAccount> = {}): DebtAccount {
  return {
    id: 'd1', creditor: 'Lån', type: 'annet', originalAmount: 100_000, currentBalance: 80_000,
    rateHistory: [{ fromDate: '2025-01-01', nominalRate: 5 }],
    monthlyPayment: 2_000, termFee: 0, startDate: '2025-01-01', ...over,
  }
}

describe('bumpAccountRates', () => {
  it('legger prosentpoeng på alle rate-historikkpunkter', () => {
    const bumped = bumpAccountRates([konto()], 2)
    expect(bumped[0].rateHistory[0].rate).toBe(5)
  })
  it('0 pp = uendret', () => {
    expect(bumpAccountRates([konto()], 0)[0].rateHistory[0].rate).toBe(3)
  })
})

describe('bumpDebtRates', () => {
  it('legger prosentpoeng på nominalRate', () => {
    expect(bumpDebtRates([laan()], 2)[0].rateHistory[0].nominalRate).toBe(7)
  })
})

describe('addSavingsDelta', () => {
  it('legger delta på første ikke-BSU sparekontos månedsbidrag', () => {
    const out = addSavingsDelta([konto()], 1_500)
    expect(out[0].monthlyContribution).toBe(3_500)
  })
  it('0 delta = uendret referanse-likt innhold', () => {
    expect(addSavingsDelta([konto()], 0)[0].monthlyContribution).toBe(2_000)
  })
  it('syntetiserer en konto hvis ingen sparekonto finnes', () => {
    const out = addSavingsDelta([], 1_000)
    expect(out).toHaveLength(1)
    expect(out[0].monthlyContribution).toBe(1_000)
  })
})
```

- [ ] **Step 2: Kjør — verifiser feil**

Run: `npm test -- scenarioSimulator`
Expected: FAIL (modul finnes ikke).

- [ ] **Step 3: Implementer**

Create `src/domain/economy/scenarioSimulator.ts`:

```ts
// ============================================================
// SCENARIO-SIMULATOR — hva-skjer-hvis via eksisterende motorer
// Rene funksjoner. Transformerer input og kjører motorene to ganger.
// ============================================================

import type { SavingsAccount, DebtAccount } from '@/types/economy'

/** Legg prosentpoeng på alle rentepunkter for hver sparekonto. */
export function bumpAccountRates(accounts: SavingsAccount[], deltaPp: number): SavingsAccount[] {
  if (deltaPp === 0) return accounts
  return accounts.map((a) => ({
    ...a,
    rateHistory: a.rateHistory.map((r) => ({ ...r, rate: r.rate + deltaPp })),
    tieredRates: a.tieredRates?.map((t) => ({ ...t, rate: t.rate + deltaPp })),
    tieredRateHistory: a.tieredRateHistory?.map((h) => ({ ...h, tiers: h.tiers.map((t) => ({ ...t, rate: t.rate + deltaPp })) })),
  }))
}

/** Legg prosentpoeng på nominalRate for hver gjeld. */
export function bumpDebtRates(debts: DebtAccount[], deltaPp: number): DebtAccount[] {
  if (deltaPp === 0) return debts
  return debts.map((d) => ({
    ...d,
    rateHistory: d.rateHistory.map((r) => ({ ...r, nominalRate: r.nominalRate + deltaPp })),
  }))
}

/** Legg månedlig sparingDelta på første ikke-BSU sparekonto; syntetiser om ingen finnes. */
export function addSavingsDelta(accounts: SavingsAccount[], deltaPerMonth: number): SavingsAccount[] {
  if (deltaPerMonth === 0) return accounts
  const idx = accounts.findIndex((a) => a.type !== 'BSU')
  if (idx === -1) {
    const synthetic: SavingsAccount = {
      id: 'scenario-savings', type: 'sparekonto', label: 'Scenario-sparing',
      openingBalance: 0, openingDate: new Date().toISOString().split('T')[0],
      monthlyContribution: deltaPerMonth, interestCreditFrequency: 'monthly',
      rateHistory: [{ fromDate: new Date().toISOString().split('T')[0], rate: 0 }],
      balanceHistory: [], withdrawals: [], contributions: [],
    }
    return [...accounts, synthetic]
  }
  return accounts.map((a, i) => i === idx ? { ...a, monthlyContribution: a.monthlyContribution + deltaPerMonth } : a)
}
```

- [ ] **Step 4: Kjør — verifiser pass**

Run: `npm test -- scenarioSimulator`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/economy/scenarioSimulator.ts src/domain/economy/__tests__/scenarioSimulator.test.ts
git commit -m "feat(scenario): rente- og sparing-input-transformasjoner

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Netto-delta via skattemotoren + engangsoverlay

**Files:**
- Modify: `src/domain/economy/scenarioSimulator.ts`
- Test: `src/domain/economy/__tests__/scenarioSimulator.test.ts`

- [ ] **Step 1: Skriv failing test**

Legg til i testfila (utvid import med `netMonthlyFromGross`, `applyOneTimeEvents`):

```ts
import { netMonthlyFromGross, applyOneTimeEvents } from '../scenarioSimulator'
import type { NetWorthPoint } from '@/types/economy'

describe('netMonthlyFromGross', () => {
  it('høyere brutto gir høyere netto (marginalskatt)', () => {
    const lav = netMonthlyFromGross(50_000)
    const hoy = netMonthlyFromGross(60_000)
    expect(hoy).toBeGreaterThan(lav)
    // men netto-økningen er mindre enn brutto-økningen (skatt)
    expect(hoy - lav).toBeLessThan(10_000)
  })
})

describe('applyOneTimeEvents', () => {
  const series: NetWorthPoint[] = [
    { year: 2026, month: 1, sparing: 0, fond: 0, ivf: 0, gjeld: 0, total: 100_000, isProjected: false },
    { year: 2026, month: 2, sparing: 0, fond: 0, ivf: 0, gjeld: 0, total: 100_000, isProjected: true },
    { year: 2026, month: 3, sparing: 0, fond: 0, ivf: 0, gjeld: 0, total: 100_000, isProjected: true },
  ]
  it('legger engangsbeløp til total fra hendelsesdato og framover', () => {
    const out = applyOneTimeEvents(series, [{ id: '1', label: 'Arv', date: '2026-02-15', amount: 50_000 }])
    expect(out[0].total).toBe(100_000) // før hendelsen
    expect(out[1].total).toBe(150_000) // feb (≥ 2026-02)
    expect(out[2].total).toBe(150_000) // mars
  })
  it('negativt beløp trekker fra', () => {
    const out = applyOneTimeEvents(series, [{ id: '1', label: 'Bil', date: '2026-03-01', amount: -30_000 }])
    expect(out[2].total).toBe(70_000)
  })
})
```

- [ ] **Step 2: Kjør — verifiser feil**

Run: `npm test -- scenarioSimulator`
Expected: FAIL.

- [ ] **Step 3: Implementer**

Legg til i `scenarioSimulator.ts` (utvid import):

```ts
import type { NetWorthPoint } from '@/types/economy'
import { beregnSkatt } from './norwegianTaxCalc'

/**
 * Netto per måned etter inntektsskatt for en gitt brutto månedslønn.
 * Brukes for Δnetto: kalles for baseline- og scenario-brutto med samme motor,
 * så pensjon/fagforening (konstante) kanselleres i differansen.
 */
export function netMonthlyFromGross(grossMonthly: number): number {
  const grossAnnual = grossMonthly * 12
  const res = beregnSkatt({
    lonnsInntekt: grossAnnual, pensjonsinntekt: 0, næringsInntekt: 0, kapitalInntekt: 0,
    andreFradrag: 0, renteutgifter: 0, arbeidsreiseFradrag: 0, fagforeningskontingent: 0,
    pensjonspremie: 0, utgiftsgodtgjørelse: 0, bsuSkattefradrag: 0,
    primaerboligVerdi: 0, sekundaerboligVerdi: 0, bankinnskudd: 0, aksjerFondVerdi: 0,
    annenFormue: 0, gjeld: 0,
  })
  return (grossAnnual - res.skattInntekt) / 12
}

/** Legg engangsbeløp på series.total fra hver hendelses (year,month) og framover. */
export function applyOneTimeEvents(series: NetWorthPoint[], events: { date: string; amount: number }[]): NetWorthPoint[] {
  if (events.length === 0) return series
  return series.map((p) => {
    const ym = `${p.year}-${String(p.month).padStart(2, '0')}`
    const overlay = events
      .filter((e) => e.date.slice(0, 7) <= ym)
      .reduce((s, e) => s + e.amount, 0)
    return overlay !== 0 ? { ...p, total: p.total + overlay } : p
  })
}
```

- [ ] **Step 4: Kjør — verifiser pass**

Run: `npm test -- scenarioSimulator`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/economy/scenarioSimulator.ts src/domain/economy/__tests__/scenarioSimulator.test.ts
git commit -m "feat(scenario): netto-delta via skattemotor + engangsoverlay

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `simulateScenario` + nøkkeltall + konsistens-invariant

**Files:**
- Modify: `src/domain/economy/scenarioSimulator.ts`
- Test: `src/domain/economy/__tests__/scenarioSimulator.test.ts`

- [ ] **Step 1: Skriv failing test**

Legg til i testfila (utvid import med `simulateScenario, DEFAULT_SCENARIO_LEVERS, type ScenarioBaseline`):

```ts
import { simulateScenario, DEFAULT_SCENARIO_LEVERS, type ScenarioBaseline } from '../scenarioSimulator'
import type { ScenarioLevers } from '@/types/economy'

function baseline(): ScenarioBaseline {
  return {
    now: { year: 2026, month: 6 },
    historyMonths: 12, projectionMonths: 60,
    grossMonthly: 55_000,
    baseMonthlyForPension: 50_000,
    pensionBirthYear: 1995, pensionServiceStartYear: 2016, currentG: 136_549,
    equity: 200_000, existingDebt: 300_000,
    savingsAccounts: [konto({ openingBalance: 200_000, monthlyContribution: 5_000 })],
    fondPortfolio: { monthlyDeposit: 0, startDate: '2025-01-01', funds: [], snapshots: [] },
    ivfTransactions: [],
    debts: [laan({ currentBalance: 300_000 })],
    partnerVeikart: { enabled: false, annualIncome: 0, annualNetIncome: 0, equity: 0, bsu: 0, bsuMonthlyContribution: 0, monthlySavings: 0, accounts: [] },
  }
}

describe('simulateScenario — konsistens-invariant', () => {
  it('nøytrale spaker ⇒ scenario.series identisk med baseline.series', () => {
    const res = simulateScenario(baseline(), DEFAULT_SCENARIO_LEVERS)
    expect(res.scenario.series).toEqual(res.baseline.series)
    expect(res.scenario.figures).toEqual(res.baseline.figures)
  })
})

describe('simulateScenario — spaker', () => {
  it('lønn +10 % gir høyere netto og pensjon', () => {
    const levers: ScenarioLevers = { ...DEFAULT_SCENARIO_LEVERS, salaryPct: 10 }
    const res = simulateScenario(baseline(), levers)
    expect(res.scenario.figures.nettoPerMonth).toBeGreaterThan(res.baseline.figures.nettoPerMonth)
    expect(res.scenario.figures.pensionAt67).toBeGreaterThan(res.baseline.figures.pensionAt67)
  })

  it('extraNetToSavingsPct=0 ⇒ lønn endrer ikke formue om 5 år', () => {
    const levers: ScenarioLevers = { ...DEFAULT_SCENARIO_LEVERS, salaryPct: 10, extraNetToSavingsPct: 0 }
    const res = simulateScenario(baseline(), levers)
    expect(res.scenario.figures.netWorth5y).toBeCloseTo(res.baseline.figures.netWorth5y, 0)
  })

  it('månedssparing +3000 øker formue om 5 år', () => {
    const levers: ScenarioLevers = { ...DEFAULT_SCENARIO_LEVERS, monthlySavingsDelta: 3_000 }
    const res = simulateScenario(baseline(), levers)
    expect(res.scenario.figures.netWorth5y).toBeGreaterThan(res.baseline.figures.netWorth5y)
  })

  it('engangsbeløp -100k senker formue om 5 år', () => {
    const levers: ScenarioLevers = { ...DEFAULT_SCENARIO_LEVERS, oneTimeEvents: [{ id: '1', label: 'Bil', date: '2026-07-01', amount: -100_000 }] }
    const res = simulateScenario(baseline(), levers)
    expect(res.scenario.figures.netWorth5y).toBeLessThan(res.baseline.figures.netWorth5y)
  })
})
```

- [ ] **Step 2: Kjør — verifiser feil**

Run: `npm test -- scenarioSimulator`
Expected: FAIL.

- [ ] **Step 3: Implementer**

Legg til i `scenarioSimulator.ts` (utvid import):

```ts
import type {
  ScenarioLevers, ScenarioKeyFigures, ScenarioResult, NetWorthSeries,
  FondPortfolio, IVFTransaction, PartnerVeikart,
} from '@/types/economy'
import { computeNetWorthSeries } from './netWorthCalculator'
import { projectPension } from './pensionCalculator'
import { calcMaxPurchaseSimple } from '@/utils/maxPurchase'
import { defaultConfig } from '@/config/default.config'

export const DEFAULT_SCENARIO_LEVERS: ScenarioLevers = {
  salaryPct: 0, salaryKr: 0, rateDeltaPp: 0, monthlySavingsDelta: 0,
  oneTimeEvents: [], extraNetToSavingsPct: 60,
}

/** Baseline-input som hooken samler fra storen. */
export interface ScenarioBaseline {
  now: { year: number; month: number }
  historyMonths: number
  projectionMonths: number
  grossMonthly: number
  baseMonthlyForPension: number
  pensionBirthYear: number
  pensionServiceStartYear: number
  currentG: number
  equity: number
  existingDebt: number
  savingsAccounts: SavingsAccount[]
  fondPortfolio: FondPortfolio
  ivfTransactions: IVFTransaction[]
  debts: DebtAccount[]
  partnerVeikart: PartnerVeikart
}

const NETWORTH_5Y_MONTHS = 60

function seriesValueAt(series: NetWorthSeries, monthsFromNow: number, now: { year: number; month: number }): number {
  const target = new Date(now.year, now.month - 1 + monthsFromNow, 1)
  const ty = target.getFullYear(), tm = target.getMonth() + 1
  const pt = series.find((p) => p.year === ty && p.month === tm)
  return pt?.total ?? series[series.length - 1]?.total ?? 0
}

/** Kjør motorene én gang for et gitt sett input + spaker. */
function runOnce(b: ScenarioBaseline, levers: ScenarioLevers): { series: NetWorthSeries; figures: ScenarioKeyFigures } {
  const grossMonthly = b.grossMonthly * (1 + levers.salaryPct / 100) + levers.salaryKr
  const baselineNet = netMonthlyFromGross(b.grossMonthly)
  const scenarioNet = netMonthlyFromGross(grossMonthly)
  const deltaNet = scenarioNet - baselineNet
  const savingsFromSalary = Math.max(0, deltaNet) * (levers.extraNetToSavingsPct / 100)
  const totalSavingsDelta = savingsFromSalary + levers.monthlySavingsDelta

  // Transformer input
  const accounts = addSavingsDelta(bumpAccountRates(b.savingsAccounts, levers.rateDeltaPp), totalSavingsDelta)
  const debts = bumpDebtRates(b.debts, levers.rateDeltaPp)

  const from = new Date(b.now.year, b.now.month - 1 - b.historyMonths, 1)
  const to = new Date(b.now.year, b.now.month - 1 + b.projectionMonths, 1)
  let series = computeNetWorthSeries({
    scope: 'din',
    from: { year: from.getFullYear(), month: from.getMonth() + 1 },
    to: { year: to.getFullYear(), month: to.getMonth() + 1 },
    now: b.now,
    savingsAccounts: accounts, fondPortfolio: b.fondPortfolio,
    ivfTransactions: b.ivfTransactions, debts, partnerVeikart: b.partnerVeikart,
  })
  series = applyOneTimeEvents(series, levers.oneTimeEvents)

  const annualIncome = grossMonthly * 12
  const pension = projectPension({
    birthYear: b.pensionBirthYear, serviceStartYear: b.pensionServiceStartYear,
    currentYear: b.now.year, currentG: b.currentG,
    folketrygdAnnualIncome: annualIncome, spkAnnualGrunnlag: (b.baseMonthlyForPension * (1 + levers.salaryPct / 100) + levers.salaryKr) * 12,
    uttaksalder: 67, salaryGrowthPct: 3, gGrowthPct: 3.5,
    afpEnabled: true, særalder: { enabled: false, age: 60 },
  })

  const netWorth5y = seriesValueAt(series, NETWORTH_5Y_MONTHS, b.now)
  const figures: ScenarioKeyFigures = {
    nettoPerMonth: scenarioNet,
    sparerate: scenarioNet > 0 ? Math.round((totalSavingsDelta + 0) / scenarioNet * 100) : 0,
    netWorth5y,
    purchasingPower: calcMaxPurchaseSimple(b.equity, annualIncome, b.existingDebt, defaultConfig),
    pensionAt67: pension.monthlyTotal,
  }
  return { series, figures }
}

/** Simuler baseline (nøytralt) og scenario (med spaker) over samme motorer. */
export function simulateScenario(b: ScenarioBaseline, levers: ScenarioLevers): ScenarioResult {
  return {
    baseline: runOnce(b, DEFAULT_SCENARIO_LEVERS),
    scenario: runOnce(b, levers),
  }
}
```

> **Merknad om sparerate-nøkkeltall:** `sparerate` her bruker spak-sparingsdelta som teller. Baseline (nøytrale spaker) gir `totalSavingsDelta = 0` → sparerate 0 for baseline. Dette er en kjent forenkling; nøkkeltallet viser scenario-ekstrasparingens andel av netto. Hvis du vil ha faktisk total sparerate, må baseline-sparingen (sum `monthlyContribution`) legges til — gjør det i Task 4 hvis ønsket, ellers dokumenter som forenkling. (For invarianten holder det at baseline≡scenario ved nøytrale spaker.)

- [ ] **Step 4: Kjør — verifiser pass**

Run: `npm test -- scenarioSimulator && npm run typecheck`
Expected: PASS / rent.

- [ ] **Step 5: Commit**

```bash
git add src/domain/economy/scenarioSimulator.ts src/domain/economy/__tests__/scenarioSimulator.test.ts
git commit -m "feat(scenario): simulateScenario + nøkkeltall + konsistens-invariant

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Store — scenarioLevers (lokal) + EconomyTab-migrering

**Files:**
- Modify: `src/store/useAppStore.ts` (scenarioLevers + EconomySubPage)
- Modify: `src/application/useEconomyStore.ts` (persist v25-migrering for 'scenario'-tab + importData)
- Test: `src/store/__tests__/scenarioStore.test.ts`

- [ ] **Step 1: Skriv failing test**

Create `src/store/__tests__/scenarioStore.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { useAppStore } from '@/store/useAppStore'
import { DEFAULT_SCENARIO_LEVERS } from '@/domain/economy/scenarioSimulator'

describe('scenarioLevers i useAppStore', () => {
  it('starter med default-spaker', () => {
    expect(useAppStore.getState().scenarioLevers).toEqual(DEFAULT_SCENARIO_LEVERS)
  })
  it('setScenarioLevers oppdaterer', () => {
    useAppStore.getState().setScenarioLevers({ ...DEFAULT_SCENARIO_LEVERS, salaryPct: 5 })
    expect(useAppStore.getState().scenarioLevers.salaryPct).toBe(5)
    useAppStore.getState().setScenarioLevers(DEFAULT_SCENARIO_LEVERS)
  })
})
```

- [ ] **Step 2: Kjør — verifiser feil**

Run: `npm test -- scenarioStore`
Expected: FAIL.

- [ ] **Step 3: Implementer**

I `src/store/useAppStore.ts`:

a) Importer typen + default:

```ts
import type { ScenarioLevers } from '@/types/economy'
import { DEFAULT_SCENARIO_LEVERS } from '@/domain/economy/scenarioSimulator'
```

b) Utvid `EconomySubPage`-unionen (linje 13) med `'scenario'`.

c) Legg i `AppState`-interfacet:

```ts
  scenarioLevers: ScenarioLevers
  setScenarioLevers: (levers: ScenarioLevers) => void
```

d) Initial state (ved `prosjektTab: 'behandling'`):

```ts
      scenarioLevers: DEFAULT_SCENARIO_LEVERS,
```

e) Action (ved `setProsjektTab`):

```ts
      setScenarioLevers: (levers) => set({ scenarioLevers: levers }),
```

f) Legg `scenarioLevers` i `partialize` (lokal persist — useAppStore synkes IKKE til Supabase):

```ts
        scenarioLevers: state.scenarioLevers,
```

I `src/application/useEconomyStore.ts`:

g) Bump persist `version: 24` → `version: 25`; legg til migrering (etter v24-blokken):

```ts
        // v24 → v25: legg til 'scenario' i enabledTabs for eksisterende brukere
        if (fromVersion < 25 && state.userPreferences) {
          const prefs = state.userPreferences as { enabledTabs?: string[] }
          if (Array.isArray(prefs.enabledTabs) && !prefs.enabledTabs.includes('scenario')) {
            prefs.enabledTabs = [...prefs.enabledTabs, 'scenario']
          }
        }
```

h) I `importData` sin enabledTabs forward-migrering (der 'calibration'/'formue' legges til):

```ts
          if (prefs?.enabledTabs && !prefs.enabledTabs.includes('scenario')) {
            prefs.enabledTabs = [...prefs.enabledTabs, 'scenario']
          }
```

- [ ] **Step 4: Kjør test + typecheck**

Run: `npm test -- scenarioStore && npm run typecheck`
Expected: PASS / rent.

> Merk: `scenarioLevers` legges IKKE i `saveToSupabase` (syncEconomyData.ts) — scenariet er lokalt/hypotetisk per spec.

- [ ] **Step 5: Commit**

```bash
git add src/store/useAppStore.ts src/application/useEconomyStore.ts src/store/__tests__/scenarioStore.test.ts
git commit -m "feat(scenario): scenarioLevers lokalt + persist v25-migrering

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Hook `useScenario`

**Files:**
- Create: `src/hooks/useScenario.ts`

- [ ] **Step 1: Implementer hooken**

Create `src/hooks/useScenario.ts`:

```ts
import { useMemo } from 'react'
import { useActiveEconomyStore } from '@/contexts/EconomyStoreContext'
import { useAppStore } from '@/store/useAppStore'
import { simulateScenario, type ScenarioBaseline } from '@/domain/economy/scenarioSimulator'
import { GRUNNBELOP_NOK } from '@/config/economy.config'
import type { ScenarioResult } from '@/types/economy'

export function useScenario(): ScenarioResult | null {
  const { profile, savingsAccounts, fondPortfolio, ivfTransactions, debts, partnerVeikart, userPreferences } = useActiveEconomyStore()
  const levers = useAppStore((s) => s.scenarioLevers)

  return useMemo(() => {
    if (!profile) return null
    const d = new Date()
    const now = { year: d.getFullYear(), month: d.getMonth() + 1 }
    const fasteTillegg = (profile.fixedAdditions ?? []).reduce((s, t) => s + t.amount, 0)
    const grossMonthly = profile.baseMonthly + fasteTillegg
    const equity = savingsAccounts.reduce((s, a) => s + a.openingBalance, 0)
    const existingDebt = debts.filter((dd) => dd.status !== 'nedbetalt').reduce((s, dd) => s + dd.currentBalance, 0)

    const baseline: ScenarioBaseline = {
      now, historyMonths: 36, projectionMonths: 60,
      grossMonthly, baseMonthlyForPension: profile.baseMonthly,
      pensionBirthYear: userPreferences?.birthYear ?? 1995,
      pensionServiceStartYear: now.year - 5, currentG: GRUNNBELOP_NOK,
      equity, existingDebt,
      savingsAccounts, fondPortfolio, ivfTransactions, debts, partnerVeikart,
    }
    return simulateScenario(baseline, levers)
  }, [profile, savingsAccounts, fondPortfolio, ivfTransactions, debts, partnerVeikart, userPreferences, levers])
}
```

- [ ] **Step 2: Verifiser**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useScenario.ts
git commit -m "feat(scenario): useScenario-hook samler baseline fra storen

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Navigasjon + ScenarioPage

**Files:**
- Modify: `src/pages/economy/EconomyPage.tsx` (lazy-import, NAV_ITEMS, render-gren)
- Create: `src/pages/economy/ScenarioPage.tsx`

- [ ] **Step 1: Opprett ScenarioPage**

Create `src/pages/economy/ScenarioPage.tsx`:

```tsx
import { ComposedChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { SlidersHorizontal } from 'lucide-react'
import { useScenario } from '@/hooks/useScenario'
import { useAppStore } from '@/store/useAppStore'
import { DEFAULT_SCENARIO_LEVERS } from '@/domain/economy/scenarioSimulator'
import { cn } from '@/lib/utils'

const MONTHS = ['Jan','Feb','Mar','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Des']
function fmtNOK(n: number): string { return Math.round(n).toLocaleString('no-NO') + ' kr' }

export function ScenarioPage() {
  const result = useScenario()
  const levers = useAppStore((s) => s.scenarioLevers)
  const setLevers = useAppStore((s) => s.setScenarioLevers)

  if (!result) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
        Importer en lønnsslipp for å simulere scenarier.
      </div>
    )
  }

  const data = result.baseline.series.map((p, i) => ({
    label: `${MONTHS[p.month - 1]} ${String(p.year).slice(2)}`,
    baseline: p.total, scenario: result.scenario.series[i]?.total ?? p.total,
  }))

  const figs: { label: string; base: number; scen: number; pct?: boolean }[] = [
    { label: 'Netto/mnd', base: result.baseline.figures.nettoPerMonth, scen: result.scenario.figures.nettoPerMonth },
    { label: 'Formue om 5 år', base: result.baseline.figures.netWorth5y, scen: result.scenario.figures.netWorth5y },
    { label: 'Kjøpekraft', base: result.baseline.figures.purchasingPower, scen: result.scenario.figures.purchasingPower },
    { label: 'Pensjon v/67', base: result.baseline.figures.pensionAt67, scen: result.scenario.figures.pensionAt67 },
  ]

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 space-y-4">
      {/* SEKSJON 1: Spak-panel — fire spaker (range-input) + engangshendelser + Nullstill +
          extraNetToSavingsPct under «Forutsetninger». Bruk setLevers({ ...levers, X }). */}
      <div className="rounded-xl border border-border/50 bg-card/60 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium flex items-center gap-2"><SlidersHorizontal className="h-4 w-4" /> Spaker</span>
          <button onClick={() => setLevers(DEFAULT_SCENARIO_LEVERS)} className="text-xs text-muted-foreground hover:text-foreground">Nullstill</button>
        </div>
        {/* Lønn % */}
        <label className="block text-xs text-muted-foreground">
          Lønn {levers.salaryPct >= 0 ? '+' : ''}{levers.salaryPct} %
          <input type="range" min={-20} max={30} step={1} value={levers.salaryPct}
            onChange={(e) => setLevers({ ...levers, salaryPct: parseInt(e.target.value, 10) })}
            className="w-full accent-primary" aria-label="Lønnsendring i prosent" />
        </label>
        {/* Rente pp */}
        <label className="block text-xs text-muted-foreground">
          Rente {levers.rateDeltaPp >= 0 ? '+' : ''}{levers.rateDeltaPp} pp
          <input type="range" min={-3} max={5} step={0.25} value={levers.rateDeltaPp}
            onChange={(e) => setLevers({ ...levers, rateDeltaPp: parseFloat(e.target.value) })}
            className="w-full accent-primary" aria-label="Renteendring i prosentpoeng" />
        </label>
        {/* Månedssparing kr */}
        <label className="block text-xs text-muted-foreground">
          Månedssparing {levers.monthlySavingsDelta >= 0 ? '+' : ''}{fmtNOK(levers.monthlySavingsDelta)}
          <input type="range" min={-5000} max={15000} step={500} value={levers.monthlySavingsDelta}
            onChange={(e) => setLevers({ ...levers, monthlySavingsDelta: parseInt(e.target.value, 10) })}
            className="w-full accent-primary" aria-label="Endring i månedssparing" />
        </label>
      </div>

      {/* SEKSJON 2: Baseline vs scenario-graf */}
      <div className="rounded-xl border border-border/50 bg-card/60 p-4" style={{ height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(215 20% 22%)" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
            <Tooltip formatter={(v: number, n) => [fmtNOK(Number(v)), String(n)]} />
            <Line type="monotone" dataKey="baseline" name="Baseline" stroke="#94a3b8" strokeWidth={1.5} dot={false} />
            <Line type="monotone" dataKey="scenario" name="Scenario" stroke="#22c55e" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* SEKSJON 3: Nøkkeltall-delta */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {figs.map((f) => {
          const delta = f.scen - f.base
          return (
            <div key={f.label} className="rounded-lg border border-border/50 bg-card/60 p-3">
              <p className="text-[11px] text-muted-foreground">{f.label}</p>
              <p className="text-sm font-mono font-semibold">{fmtNOK(f.scen)}</p>
              <p className={cn('text-[10px] font-mono', delta > 0 ? 'text-green-400' : delta < 0 ? 'text-red-400' : 'text-muted-foreground')}>
                {delta >= 0 ? '+' : ''}{fmtNOK(delta)}
              </p>
            </div>
          )
        })}
      </div>

      <p className="text-[11px] text-muted-foreground">
        Hypotetisk scenario — baseline er dine faktiske tall. Lagres lokalt, deles ikke.
      </p>
    </div>
  )
}
```

> **Implementeringsnotat:** Fyll inn engangshendelse-liste (legg til/fjern: label/dato/beløp via `setLevers({ ...levers, oneTimeEvents: [...] })`) og «Forutsetninger»-utvid med `extraNetToSavingsPct`-slider i Seksjon 1. Treffsikkerhet-båndet (Seksjon 4) legges til i Task 8.

- [ ] **Step 2: Lazy-import + nav i EconomyPage**

I `src/pages/economy/EconomyPage.tsx`:
- Importer `SlidersHorizontal` fra lucide.
- Lazy: `const ScenarioPage = lazyWithRetry(() => import('./ScenarioPage').then((m) => ({ default: m.ScenarioPage })))`
- `NAV_ITEMS`: `{ page: 'scenario', label: 'Simulator', Icon: SlidersHorizontal }` (etter `veikart` er naturlig).
- Render-gren: `{currentPage === 'scenario' && <ScenarioPage />}`.

- [ ] **Step 3: Verifiser bygg**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/pages/economy/ScenarioPage.tsx src/pages/economy/EconomyPage.tsx
git commit -m "feat(scenario): simulator-side med spaker, baseline/scenario-graf og nøkkeltall

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Engangshendelser + forutsetninger + treffsikkerhet-bånd

**Files:**
- Modify: `src/pages/economy/ScenarioPage.tsx`

- [ ] **Step 1: Engangshendelse-UI + extraNetToSavingsPct + treffsikkerhet-bånd**

I `ScenarioPage.tsx`:

a) Legg til engangshendelse-liste i spak-panelet (Seksjon 1): inputfelter for label/dato/beløp + «Legg til»-knapp som gjør `setLevers({ ...levers, oneTimeEvents: [...levers.oneTimeEvents, { id: crypto.randomUUID(), label, date, amount }] })`, og fjern-knapp per rad.

b) Under «Forutsetninger»-utvid: slider for `extraNetToSavingsPct` (0–100, default 60) med `aria-label`.

c) Treffsikkerhet-bånd (Seksjon 4, før mikrocopy) — gjenbruk `computeAccuracy` fra #6:

```tsx
import { useMemo } from 'react'
import { useEconomyStore } from '@/application/useEconomyStore'
import { computeAccuracy } from '@/domain/economy/forecastCalibration'
import { computeBudgetTable } from '@/domain/economy/budgetTableComputer'
import { forecastJune } from '@/domain/economy/holidayPayCalculator'
import { Target } from 'lucide-react'
```

Hent samme store-felt og bygg `hitRate` med SAMME `computeBudgetTable`-kall + radfilter som `ForecastAccuracyPage` (granulære rader + netto, ekskl. isBold/isCumulative). Vis et bånd:

```tsx
{hitRate !== null && (
  <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-card/60 px-3 py-2 text-[11px] text-muted-foreground">
    <Target className="h-3.5 w-3.5 text-primary shrink-0" />
    <span>Prognosen din har historisk truffet {hitRate} % — scenariet arver samme usikkerhet.</span>
  </div>
)}
```

> **Implementeringsnotat:** Treffsikkerhet-beregningen er identisk med `ForecastAccuracyPage.tsx` — vurder å trekke ut en delt `useForecastAccuracy()`-hook hvis duplikatet blir påtrengende (DRY), men kopier inline for v1 hvis enklere. Filtrer rader: `(!r.isBold || r.id === 'netto') && !r.isCumulative`.

- [ ] **Step 2: Verifiser bygg**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Manuell røyktest**

Run: `npm run dev`, åpne Simulator-fanen.
Expected: spaker oppdaterer scenario-linjen live; nøkkeltall-delta endres; engangshendelse senker kurven fra datoen; treffsikkerhet-bånd vises.

- [ ] **Step 4: Commit**

```bash
git add src/pages/economy/ScenarioPage.tsx
git commit -m "feat(scenario): engangshendelser, forutsetninger og treffsikkerhet-bånd

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: Synliggjør fanen (MODULES)

**Files:**
- Modify: `src/pages/economy/OnboardingWizard.tsx`

- [ ] **Step 1: Legg `'scenario'` i MODULES**

I `src/pages/economy/OnboardingWizard.tsx`, importer `SlidersHorizontal` fra lucide og legg til en `MODULES`-oppføring (etter `veikart`):

```ts
  {
    tab: 'scenario',
    label: 'Simulator',
    desc: 'Hva-skjer-hvis: lønn, rente, sparing, engangsbeløp',
    icon: SlidersHorizontal,
    defaultFor: ['forsvaret', 'custom'],
  },
```

(persist v25-migreringen fra Task 5 dekker eksisterende brukere; importData dekker sky-stien.)

- [ ] **Step 2: Verifiser**

Run: `npm run build && npm test`
Expected: PASS / alle grønne.

- [ ] **Step 3: Commit**

```bash
git add src/pages/economy/OnboardingWizard.tsx
git commit -m "feat(scenario): synliggjør Simulator-fanen i MODULES

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 10: Sluttverifisering

**Files:** ingen kodeendring med mindre noe feiler.

- [ ] **Step 1: Full verifisering**

Run: `npm test && npm run typecheck && npm run build`
Expected: Alle PASS. scenarioSimulator- og scenarioStore-testene grønne.

- [ ] **Step 2: Manuell konsistens-sjekk**

Run: `npm run dev`. Sjekk at:
- Med alle spaker nøytrale: scenario-linjen ligger oppå baseline-linjen (invariant), og nøkkeltall-delta er 0.
- Baseline-formue om 5 år == Formue-sidens projeksjon (samme motor).
- Lønn +10 % løfter netto, pensjon og (med extraNetToSavingsPct>0) formue.
- Spak-state overlever reload (lokal persist), men vises ikke hos partner.

---

## Self-Review (utført av planforfatter)

- **Spec-dekning:** Fire spaker (Task 2–4), propageringskontrakt via eksisterende motorer (Task 3–4), baseline vs scenario + konsistens-invariant (Task 4), hook (Task 6), dedikert side med graf + nøkkeltall-delta (Task 7) + engangshendelser/forutsetninger/treffsikkerhet-bånd (Task 8), nav + MODULES + persist v25 (Task 5, 7, 9), lokal-ikke-synket lagring (Task 5), feilhåndtering/tomtilstand (Task 7), testing inkl. invariant + per-spak (Task 2–4).
- **Placeholders:** Domene-/hook-/store-tasks har komplett kode + tester. UI-tasks (7, 8) har komplett kode med eksplisitte implementeringsnotater for engangshendelse-liste og treffsikkerhet-bånd (følger kodebasens domenetest-konvensjon; UI verifiseres via build + røyktest).
- **Typekonsistens:** `ScenarioLevers/OneTimeEvent/KeyFigures/Result`, `ScenarioBaseline`, `DEFAULT_SCENARIO_LEVERS`, og funksjonsnavn (`bumpAccountRates`, `bumpDebtRates`, `addSavingsDelta`, `netMonthlyFromGross`, `applyOneTimeEvents`, `simulateScenario`, `useScenario`) konsistente på tvers.
- **Kjent forenkling (dokumentert i Task 4):** `sparerate`-nøkkeltallet bruker spak-sparingsdelta som teller, ikke total sparing. Invarianten holder uansett (baseline≡scenario ved nøytrale spaker).
- **Konsistens-regel:** simulatoren kjører `computeNetWorthSeries`/`projectPension`/`buildRepaymentPlan`(via netWorth)/`beregnSkatt`/`calcMaxPurchaseSimple` — samme motorer som resten; baseline kan ikke divergere (invariant-test Task 4). Spak-state lokalt (ikke Supabase), per spec.
