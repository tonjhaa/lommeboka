# Månedsoversikt: behold historikk (grået ut) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the "Sparing" tab's `MånedsoversiktTable` (`src/pages/economy/SavingsPage.tsx`), stop dropping past months from the table as time passes. Instead, show them read-only and grayed out, with real historical balances/contributions for own accounts and own fond.

**Architecture:** Two independent calculation paths. The existing forward-looking `monthRows` simulation (anchored at `now`, used for the affordability/goal projections) is left untouched. A new, separate `pastRows` calculation reconstructs real history — via a new pure domain function `computeAccountHistory` for own accounts (real transactions/balance snapshots, no simulation) and a small page-local snapshot+carry-forward routine for the own fond. Partner accounts/fond and the derived debt/kjøpekraft columns have no historical ledger in the data model, so past months show "–" for those, consistent with the table's existing "no data" convention.

**Tech Stack:** React 19 + TypeScript, Zustand, Vitest (domain-layer tests only — this codebase has no component-level tests; verify the UI change manually in the browser).

Spec: `docs/superpowers/specs/2026-07-04-manedsoversikt-historikk-design.md`

---

### Task 1: `computeAccountHistory` — pure historical reconstruction for own accounts

**Files:**
- Modify: `src/domain/economy/savingsCalculator.ts`
- Test: `src/domain/economy/__tests__/savingsCalculator.test.ts`

This function walks month by month from `account.openingDate` up to (but excluding) a given `toMonth`, using only real data: `computeEffectiveBalance` (already in this file) for the balance, and the existing `computeMonthContributions` + `computeMonthWithdrawals` for the net deposit that month. No simulation, no planned/estimated amounts — this is what makes it safe to show as historical fact rather than the same kind of projection the rest of the table already uses.

- [ ] **Step 1: Write the failing tests**

Add to `src/domain/economy/__tests__/savingsCalculator.test.ts` (append after the existing `describe` blocks, using the existing `makeBSUAccount` factory already defined at the top of the file):

```ts
import { computeAccountHistory } from '../savingsCalculator'

describe('computeAccountHistory', () => {
  it('returnerer tom liste når kontoen ble opprettet i toMonth selv', () => {
    const account = makeBSUAccount({ openingDate: '2026-07-01', openingBalance: 50_000 })
    const history = computeAccountHistory(account, { year: 2026, month: 7 })
    expect(history).toEqual([])
  })

  it('returnerer tom liste hvis toMonth er før kontoen ble opprettet', () => {
    const account = makeBSUAccount({ openingDate: '2026-06-01' })
    const history = computeAccountHistory(account, { year: 2026, month: 1 })
    expect(history).toEqual([])
  })

  it('beregner saldo og innskudd måned for måned basert på faktiske innskudd', () => {
    const account = makeBSUAccount({
      openingDate: '2026-01-01',
      openingBalance: 100_000,
      contributions: [
        { id: 'c1', date: '2026-01-15', amount: 2_000 },
        { id: 'c2', date: '2026-02-15', amount: 2_000 },
      ],
    })
    const history = computeAccountHistory(account, { year: 2026, month: 3 })
    expect(history).toHaveLength(2)
    expect(history[0]).toMatchObject({ year: 2026, month: 1, balance: 102_000, contribution: 2_000, interest: 0 })
    expect(history[1]).toMatchObject({ year: 2026, month: 2, balance: 104_000, contribution: 2_000, interest: 0 })
  })

  it('viser rente/avvik som residual når saldoen øker mer enn registrerte innskudd', () => {
    const account = makeBSUAccount({
      openingDate: '2026-01-01',
      openingBalance: 100_000,
      balanceHistory: [{ year: 2026, month: 1, balance: 100_500, isManual: false }],
    })
    const history = computeAccountHistory(account, { year: 2026, month: 2 })
    expect(history).toHaveLength(1)
    expect(history[0]).toMatchObject({ year: 2026, month: 1, balance: 100_500, contribution: 0, interest: 500 })
  })

  it('tar med uttak (negativt beløp) i innskuddstallet', () => {
    const account = makeBSUAccount({
      openingDate: '2026-01-01',
      openingBalance: 100_000,
      withdrawals: [{ id: 'w1', date: '2026-01-10', amount: -10_000 }],
    })
    const history = computeAccountHistory(account, { year: 2026, month: 2 })
    expect(history[0]).toMatchObject({ year: 2026, month: 1, balance: 90_000, contribution: -10_000, interest: 0 })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- savingsCalculator`
Expected: FAIL — `computeAccountHistory` is not exported from `../savingsCalculator`.

- [ ] **Step 3: Implement `computeAccountHistory`**

In `src/domain/economy/savingsCalculator.ts`, add this after `computeMonthWithdrawals` (after line 126, before `getBaseContribForPeriod`):

```ts
export interface HistoricalAccountMonth {
  year: number
  month: number
  balance: number
  contribution: number
  interest: number
}

/**
 * Faktisk saldo/innskudd måned for måned fra kontoens openingDate til
 * (eksklusiv) `toMonth` — ingen simulering, kun ekte transaksjonsdata.
 * Brukes til å vise historikk i månedsoversikten, i motsetning til
 * projectSavingsGrowth som projiserer fremover med planlagt innskudd/rente.
 */
export function computeAccountHistory(
  account: SavingsAccount,
  toMonth: { year: number; month: number }
): HistoricalAccountMonth[] {
  const opening = new Date(account.openingDate)
  let y = opening.getFullYear()
  let m = opening.getMonth() + 1
  const result: HistoricalAccountMonth[] = []
  let prevBalance = account.openingBalance

  while (y < toMonth.year || (y === toMonth.year && m < toMonth.month)) {
    const monthEnd = new Date(y, m, 0, 12)
    const balance = computeEffectiveBalance(account, monthEnd)
    const contribution = computeMonthContributions(account, y, m) + computeMonthWithdrawals(account, y, m)
    const interest = Math.round(balance - prevBalance - contribution)
    result.push({
      year: y,
      month: m,
      balance: Math.round(balance),
      contribution: Math.round(contribution),
      interest,
    })
    prevBalance = balance
    m++
    if (m > 12) { m = 1; y++ }
  }
  return result
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- savingsCalculator`
Expected: PASS (all `computeAccountHistory` cases plus the pre-existing ones in the file).

- [ ] **Step 5: Commit**

```bash
git add src/domain/economy/savingsCalculator.ts src/domain/economy/__tests__/savingsCalculator.test.ts
git commit -m "$(cat <<'EOF'
feat(sparing): legg til computeAccountHistory for faktisk kontohistorikk

Ren funksjon som rekonstruerer ekte saldo/innskudd måned for måned fra
kontoens openingDate, uten simulering. Grunnlaget for å vise historikk
i månedsoversikten i stedet for at passerte måneder forsvinner.
EOF
)"
```

---

### Task 2: Tag existing `monthRows` with `isPast: false`

**Files:**
- Modify: `src/pages/economy/SavingsPage.tsx:1035-1057`

Before adding the parallel `pastRows` array, every row needs an explicit `isPast` flag so rendering code can branch on it and so the two arrays share an identical TypeScript shape (required for `[...pastRows, ...monthRows]` to type-check cleanly later).

- [ ] **Step 1: Add the field to the `monthRows` return object**

In the `monthRows` map callback, the `return { ... }` statement currently ends with (lines 1054-1057):

```ts
        debtBalance: Math.round(debtBalance),
        myDebtBalance,
        partnerDebtBalance: Math.round(partnerDebt),
      }
    })
```

Change to:

```ts
        debtBalance: Math.round(debtBalance),
        myDebtBalance,
        partnerDebtBalance: Math.round(partnerDebt),
        isPast: false,
      }
    })
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS — this is an additive field, nothing consumes `monthRows` in a way that would break from an extra property.

- [ ] **Step 3: Commit**

```bash
git add src/pages/economy/SavingsPage.tsx
git commit -m "$(cat <<'EOF'
refactor(sparing): merk monthRows med isPast: false

Forberedelse for å legge til en parallell pastRows-liste med samme
radform — isPast skiller fremtidsprognose fra historikk ved rendering.
EOF
)"
```

---

### Task 3: `pastRows` — the historical rows array

**Files:**
- Modify: `src/pages/economy/SavingsPage.tsx`

Adds a new `useMemo` right after the existing `monthRows` memo (after line 1061, before `const years = [...new Set(monthRows.map(r => r.year))]`). Reuses `(typeof monthRows)[number]` as the row type so both arrays are structurally identical.

- [ ] **Step 1: Import `computeAccountHistory`**

In `src/pages/economy/SavingsPage.tsx`, the import block at lines 20-31 currently reads:

```ts
import {
  checkBSULimits,
  calculateGoalProgress,
  projectSavingsGrowth,
  computeMonthlyContributionEstimate,
  computeYTDContributions,
  computeYearlyInterestIncome,
  computeBSUForecast,
  computeEffectiveBalance,
  getEffectiveRateFromTiers,
  getActiveTiersForDate,
} from '@/domain/economy/savingsCalculator'
```

Add `computeAccountHistory`:

```ts
import {
  checkBSULimits,
  calculateGoalProgress,
  projectSavingsGrowth,
  computeMonthlyContributionEstimate,
  computeYTDContributions,
  computeYearlyInterestIncome,
  computeBSUForecast,
  computeEffectiveBalance,
  computeAccountHistory,
  getEffectiveRateFromTiers,
  getActiveTiersForDate,
} from '@/domain/economy/savingsCalculator'
```

- [ ] **Step 2: Add the `pastRows` useMemo**

Directly after the closing of the `monthRows` useMemo (line 1061: `}, [accounts, fondCurrentValue, fondPortfolio, ... horizonMonths])`), insert:

```ts

  const pastRows = useMemo(() => {
    type MonthRow = (typeof monthRows)[number]
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth() + 1

    const accountStarts = accounts.map(a => new Date(a.openingDate))
    const fondStart = fondPortfolio?.startDate ? new Date(fondPortfolio.startDate) : null
    const allStarts = fondStart ? [...accountStarts, fondStart] : accountStarts
    if (allStarts.length === 0) return [] as MonthRow[]
    const earliest = allStarts.reduce((min, d) => (d < min ? d : min), allStarts[0])

    // Ingen reell fortid å vise (konto(er)/fond opprettet denne måneden eller senere)
    if (earliest.getFullYear() > currentYear || (earliest.getFullYear() === currentYear && earliest.getMonth() + 1 >= currentMonth)) {
      return [] as MonthRow[]
    }

    // Hent hele historikken per konto én gang (ikke per måned i loopen)
    const accountHistories = accounts.map(acc =>
      computeAccountHistory(acc, { year: currentYear, month: currentMonth })
    )

    const rows: MonthRow[] = []
    let y = earliest.getFullYear()
    let m = earliest.getMonth() + 1
    // Fond: siste kjente verdi (snapshot eller 0 før første snapshot) — ingen
    // antatt vekst bakover i tid mellom snapshots, kun ekte datapunkter.
    let fondCarry = 0

    while (y < currentYear || (y === currentYear && m < currentMonth)) {
      const accountBalances = accounts.map((acc, idx) => {
        const entry = accountHistories[idx].find(h => h.year === y && h.month === m)
        return {
          id: acc.id,
          balance: entry?.balance ?? 0,
          contribution: entry?.contribution ?? 0,
          overrideKey: `${acc.id}-${y}-${m}`,
          interest: entry?.interest ?? 0,
        }
      })

      let fondBalance = 0
      let fondContrib = 0
      let fondInterest = 0
      if (fondPortfolio) {
        const ym = `${y}-${String(m).padStart(2, '0')}`
        const snapshot = fondPortfolio.snapshots?.find(s => s.date.slice(0, 7) === ym)
        fondContrib = getFondContribForMonth(fondPortfolio, y, m)
        if (snapshot) {
          fondInterest = Math.round(snapshot.totalValue - fondCarry - fondContrib)
          fondCarry = snapshot.totalValue
        }
        fondBalance = fondCarry
      }

      rows.push({
        year: y,
        month: m,
        accountBalances,
        fondBalance,
        fondContrib,
        fondInterest,
        fondPeriod: null,
        partnerAccBalances: partnerAccMeta.map(acc => ({
          id: acc.id, balance: 0, contribution: 0, overrideKey: `p-${acc.id}-${y}-${m}`, interest: 0,
        })),
        partnerBsuBalance: 0,
        partnerBsuContrib: 0,
        partnerBsuInterest: 0,
        partnerFondBalance: 0,
        partnerFondContrib: 0,
        totalEK: 0,
        myEK: 0,
        partnerEK: 0,
        maxKjøpesum: 0,
        maxKjøpesumMeg: 0,
        maxKjøpesumPartner: 0,
        debtBalance: 0,
        myDebtBalance: 0,
        partnerDebtBalance: 0,
        isPast: true,
      })

      m++
      if (m > 12) { m = 1; y++ }
    }
    return rows
  }, [accounts, fondPortfolio, partnerAccMeta, now, monthRows])
```

Note: `monthRows` is listed as a dependency purely so `type MonthRow = (typeof monthRows)[number]` doesn't trigger an exhaustive-deps lint warning — it isn't read at runtime inside the memo body (the type alias is erased at compile time), so this has no effect on when the memo recomputes.

Deliberate simplification: if accounts have different `openingDate`s, a younger account will have no `computeAccountHistory` entry for months before it existed, so its cell falls back to `balance: 0, contribution: 0` for those months (via the `entry?.balance ?? 0` fallback) rather than a dedicated "–". Task 5's rendering shows whatever number is in the cell unconditionally (matching how the existing forward-simulation rendering already behaves — it never shows "–" for an own account's own balance/contribution, only for the derived partner/debt/kjøpekraft columns). Showing "0" for a not-yet-existing account is accurate (it really did have 0 kr before it existed) and low-risk; a true "–" treatment would require threading an `exists: boolean` flag through every own-account cell for a rare multi-account-different-ages edge case — skip it (YAGNI) unless real usage shows it's confusing.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS. If TS complains about the `partnerAccBalances` shape not matching (e.g. missing fields present on the forward-sim version), compare against the exact object built at `SavingsPage.tsx:927-973` (`partnerAccBalances = partnerAccMeta.map(...)`) and align field names.

- [ ] **Step 4: Manual smoke check**

Run: `npm run dev`, open the app, go to Sparing → Månedsoversikt. The table should render exactly as before at this point (pastRows is computed but not yet merged into `years`/rendering — that's Task 4). No crash, no visual change yet.

- [ ] **Step 5: Commit**

```bash
git add src/pages/economy/SavingsPage.tsx
git commit -m "$(cat <<'EOF'
feat(sparing): beregn pastRows med faktisk historikk

Egen useMemo som rekonstruerer ekte saldo/innskudd for egne kontoer
(computeAccountHistory) og eget fond (snapshot + flat carry-forward)
tilbake til opprettelsesdato. Ikke koblet inn i rendering ennå.
EOF
)"
```

---

### Task 4: Merge `pastRows` into the rendered table + decouple year-header editability from array order

**Files:**
- Modify: `src/pages/economy/SavingsPage.tsx:1063-1066` (years/goalRow)
- Modify: `src/pages/economy/SavingsPage.tsx:1411-1633` (year-header row, 5 column blocks)

This is the task that actually makes history visible. Two changes:
1. `years`/`yearData`/`prevYearRows` are built from `[...pastRows, ...monthRows]` instead of `monthRows` alone.
2. The "is this the year whose header shows an editable starting balance" check moves from `isFirstYear` (array order — breaks once a past year becomes `years[0]`) to an explicit `isCurrentYear = year === now.getFullYear()`. `isFirstYear` is kept, but now only guards "is there a previous year in our displayed range at all" (needed so `prevYearRows`-based rollups don't crash on the earliest displayed year).

- [ ] **Step 1: Build `allRows` and update `years`/`goalRow`**

Lines 1063-1066 currently read:

```ts
  const years = [...new Set(monthRows.map(r => r.year))]

  // Første måned der sparemålet nås (🎯-markør i Total EK-kolonnen)
  const goalRow = savingsPlanTarget > 0 ? monthRows.find(r => r.totalEK >= savingsPlanTarget) : undefined
```

Change to:

```ts
  const allRows = [...pastRows, ...monthRows]
  const years = [...new Set(allRows.map(r => r.year))]

  // Første måned der sparemålet nås (🎯-markør i Total EK-kolonnen) — kun i
  // fremtidsprognosen, aldri en passert måned
  const goalRow = savingsPlanTarget > 0 ? monthRows.find(r => r.totalEK >= savingsPlanTarget) : undefined
```

- [ ] **Step 2: Point year grouping at `allRows`**

Lines 1411-1415 currently read:

```ts
          {years.map(year => {
            const yearData = monthRows.filter(r => r.year === year)
            const isFirstYear = year === years[0]
            const prevYearRows = isFirstYear ? [] : monthRows.filter(r => r.year === year - 1)
            const prevYearLast = prevYearRows[prevYearRows.length - 1]
```

Change to:

```ts
          {years.map(year => {
            const yearData = allRows.filter(r => r.year === year)
            const isFirstYear = year === years[0]
            const isCurrentYear = year === now.getFullYear()
            const prevYearRows = isFirstYear ? [] : allRows.filter(r => r.year === year - 1)
            const prevYearLast = prevYearRows[prevYearRows.length - 1]
```

- [ ] **Step 3: Own accounts header cell — switch to `isCurrentYear`, synthesize opening balance for the earliest past year**

Lines 1437-1472 currently read:

```ts
                  {accMeta.map(acc => {
                    if (isFirstYear) {
                      return (
                        <td key={acc.id} colSpan={2} className="border-r border-border p-0">
                          <div className="grid grid-cols-[6rem_1fr] items-center">
                            <span className="flex-1" />
                            <span className="flex-1 px-3 py-2 text-right font-semibold">
                              <InnskuddCell
                                value={acc.startBalance}
                                isOverridden={`start-${acc.id}` in contribOverrides}
                                onChange={v => setContribOverrides(prev => ({ ...prev, [`start-${acc.id}`]: v }))}
                              />
                            </span>
                          </div>
                        </td>
                      )
                    }
                    const openingBal = prevYearLast?.accountBalances.find(a => a.id === acc.id)?.balance ?? 0
                    const prevRente = Math.round(prevYearRows.reduce((s, r) => s + (r.accountBalances.find(a => a.id === acc.id)?.interest ?? 0), 0))
                    const prevInnskudd = Math.round(prevYearRows.reduce((s, r) => s + (r.accountBalances.find(a => a.id === acc.id)?.contribution ?? 0), 0))
                    return (
                      <td key={acc.id} colSpan={2} className="border-r border-border p-0">
                        <div className="grid grid-cols-[6rem_1fr] items-baseline">
                          <span className="flex-1 px-3 py-2 text-right tabular-nums text-muted-foreground">
                            {prevInnskudd > 0 ? prevInnskudd.toLocaleString('no-NO') : '—'}
                          </span>
                          <span className="flex-1 px-3 py-2 text-right font-semibold whitespace-nowrap flex items-baseline justify-end">
                            <span>{fmtNOK(openingBal)}</span>
                            <span className="text-[10px] text-green-400/80 ml-1 min-w-[3.5rem] text-right shrink-0">
                              {prevRente > 0 ? `(+${prevRente.toLocaleString('no-NO')})` : ''}
                            </span>
                          </span>
                        </div>
                      </td>
                    )
                  })}
```

Change to:

```ts
                  {accMeta.map(acc => {
                    if (isCurrentYear) {
                      return (
                        <td key={acc.id} colSpan={2} className="border-r border-border p-0">
                          <div className="grid grid-cols-[6rem_1fr] items-center">
                            <span className="flex-1" />
                            <span className="flex-1 px-3 py-2 text-right font-semibold">
                              <InnskuddCell
                                value={acc.startBalance}
                                isOverridden={`start-${acc.id}` in contribOverrides}
                                onChange={v => setContribOverrides(prev => ({ ...prev, [`start-${acc.id}`]: v }))}
                              />
                            </span>
                          </div>
                        </td>
                      )
                    }
                    const rawAcc = accounts.find(a => a.id === acc.id)
                    const openingBal = isFirstYear
                      ? (rawAcc ? Math.round(computeEffectiveBalance(rawAcc, new Date(year - 1, 11, 31, 12))) : 0)
                      : prevYearLast?.accountBalances.find(a => a.id === acc.id)?.balance ?? 0
                    const prevRente = isFirstYear ? 0 : Math.round(prevYearRows.reduce((s, r) => s + (r.accountBalances.find(a => a.id === acc.id)?.interest ?? 0), 0))
                    const prevInnskudd = isFirstYear ? 0 : Math.round(prevYearRows.reduce((s, r) => s + (r.accountBalances.find(a => a.id === acc.id)?.contribution ?? 0), 0))
                    return (
                      <td key={acc.id} colSpan={2} className="border-r border-border p-0">
                        <div className="grid grid-cols-[6rem_1fr] items-baseline">
                          <span className="flex-1 px-3 py-2 text-right tabular-nums text-muted-foreground">
                            {prevInnskudd > 0 ? prevInnskudd.toLocaleString('no-NO') : '—'}
                          </span>
                          <span className="flex-1 px-3 py-2 text-right font-semibold whitespace-nowrap flex items-baseline justify-end">
                            <span>{fmtNOK(openingBal)}</span>
                            <span className="text-[10px] text-green-400/80 ml-1 min-w-[3.5rem] text-right shrink-0">
                              {prevRente > 0 ? `(+${prevRente.toLocaleString('no-NO')})` : ''}
                            </span>
                          </span>
                        </div>
                      </td>
                    )
                  })}
```

- [ ] **Step 4: Fond header cell — same `isCurrentYear` switch, no synthetic pre-history**

Lines 1473-1508 currently read (the `hasFond` IIFE):

```ts
                  {hasFond && (() => {
                    if (isFirstYear) {
                      return (
                        <td colSpan={2} className="border-r border-border p-0">
                          <div className="grid grid-cols-[6rem_1fr] items-center">
                            <span className="flex-1" />
                            <span className="flex-1 px-3 py-2 text-right font-semibold text-teal-400">
                              <InnskuddCell
                                value={contribOverrides['start-fond'] ?? fondCurrentValue}
                                isOverridden={'start-fond' in contribOverrides}
                                onChange={v => setContribOverrides(prev => ({ ...prev, 'start-fond': v }))}
                              />
                            </span>
                          </div>
                        </td>
                      )
                    }
                    const fondOpening = prevYearLast?.fondBalance ?? 0
```

Change the `if (isFirstYear)` on that block to `if (isCurrentYear)`, and change `const fondOpening = prevYearLast?.fondBalance ?? 0` to:

```ts
                    const fondOpening = isFirstYear ? 0 : prevYearLast?.fondBalance ?? 0
```

(No synthetic fond pre-history: fond's own history already starts exactly at `fondPortfolio.startDate`, i.e. `pastRows` already covers everything reconstructable — there's nothing further back to synthesize, unlike accounts where `computeEffectiveBalance` can reach past `openingDate` via balanceHistory entries dated later. If `isFirstYear` is true here, `year` already contains the first fond data point, so its opening balance is genuinely 0.)

The two `prevFondRente`/`prevFondInnskudd` lines directly below stay driven by `prevYearRows` unchanged — `prevYearRows` is already `[]` when `isFirstYear`, so `.reduce` naturally yields `0`.

- [ ] **Step 5: Partner BSU, partner fond, partner accounts header cells — same `isCurrentYear` switch, opening balance 0 for the earliest past year**

These three blocks (lines 1520-1621) have no historical ledger at all (per the design doc), so for the earliest displayed year, when it's not the current year, the opening balance is always `0` — there is no data to synthesize.

For **partner BSU** (lines 1520-1555), change `if (isFirstYear)` to `if (isCurrentYear)`, and change:

```ts
                    const bsuOpening = prevYearLast?.partnerBsuBalance ?? 0
```

to:

```ts
                    const bsuOpening = isFirstYear ? 0 : prevYearLast?.partnerBsuBalance ?? 0
```

For **partner fond** (lines 1556-1585), change `if (isFirstYear)` to `if (isCurrentYear)`, and change:

```ts
                    const fondOpening = prevYearLast?.partnerFondBalance ?? 0
```

to:

```ts
                    const fondOpening = isFirstYear ? 0 : prevYearLast?.partnerFondBalance ?? 0
```

For **partner accounts** (lines 1586-1621), change `if (isFirstYear)` to `if (isCurrentYear)`, and change:

```ts
                    const openingBal = prevYearLast?.partnerAccBalances.find(a => a.id === acc.id)?.balance ?? 0
```

to:

```ts
                    const openingBal = isFirstYear ? 0 : prevYearLast?.partnerAccBalances.find(a => a.id === acc.id)?.balance ?? 0
```

In all three blocks, the `prevInnskudd`/`prevRente`-style reduces below stay unchanged (they already read `0` from an empty `prevYearRows` when `isFirstYear` is true).

- [ ] **Step 6: Sum-column and summary-column header cells — replace remaining `isFirstYear` checks with `isCurrentYear`**

Line 1511 (`Sum innskudd` column) currently:

```ts
                    if (isFirstYear) return <td className="border-r-2 border-r-primary/30 px-3 py-2" />
```

Change to:

```ts
                    if (isCurrentYear) return <td className="border-r-2 border-r-primary/30 px-3 py-2" />
```

The debt/kjøpekraft/EK summary cells at lines 1622-1632 (`prevYearLast?.myDebtBalance`, etc.) need no change — they already read from `prevYearLast`, which is `undefined` for the earliest displayed year regardless of whether that year is past or current, and every one of those expressions already falls back to `'—'` via `?? '—'`/ternaries. Leave as-is.

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 8: Manual check in the browser**

Run: `npm run dev`, open Sparing → Månedsoversikt. Expected at this point:
- Years before the current year now appear (previously invisible), still rendered with the same styling as today (no gray-out yet — that's Task 5) and still using the old `InnskuddCell` for every row (they'll look editable, which is wrong — Task 5 fixes this).
- The current year's header still shows the editable starting-balance cell as before.
- No crash, no `NaN`/`undefined` rendered anywhere in the header rows for past years.

- [ ] **Step 9: Commit**

```bash
git add src/pages/economy/SavingsPage.tsx
git commit -m "$(cat <<'EOF'
feat(sparing): vis historiske år i månedsoversikten

allRows (pastRows + monthRows) erstatter monthRows som datakilde for
år-grupperingen. Redigerbar startsaldo i år-headeren styres nå av
isCurrentYear i stedet for isFirstYear (array-rekkefølge), som brøt
sammen når et historisk år ble years[0].
EOF
)"
```

---

### Task 5: Read-only, grayed-out rendering for past month rows

**Files:**
- Modify: `src/pages/economy/SavingsPage.tsx:1635-1776`

Past month rows must not use the editable `InnskuddCell`, and should read visually distinct (muted). This task also fixes the one cell that doesn't already fall back to `'—'` on missing data: the sticky `Total EK` cell.

- [ ] **Step 1: Add muted row styling**

Line 1636 currently:

```tsx
                  <tr key={`${row.year}-${row.month}`} className="[&>td]:border-b [&>td]:border-border/20 hover:bg-muted/10 group/mrow">
```

Change to:

```tsx
                  <tr
                    key={`${row.year}-${row.month}`}
                    className={cn(
                      '[&>td]:border-b [&>td]:border-border/20 hover:bg-muted/10 group/mrow',
                      row.isPast && 'opacity-60',
                    )}
                  >
```

(`cn` is already imported and used elsewhere in this file, e.g. the `InnskuddCell` component at line 650.)

- [ ] **Step 2: Own accounts — read-only for past rows**

Lines 1651-1673 currently:

```tsx
                    {accMeta.map(acc => {
                      const ab = row.accountBalances.find(a => a.id === acc.id)!
                      return (
                        <td key={acc.id} colSpan={2} className="border-r border-border p-0">
                          <div className="grid grid-cols-[6rem_1fr] items-center">
                            <span className="flex-1 px-3 py-1 flex items-center justify-end">
                              <InnskuddCell
                                value={ab.contribution}
                                isOverridden={ab.overrideKey in contribOverrides}
                                onChange={v => setMonthOverride(acc.id, row.year, row.month, v)}
                                onFillDown={v => fillDown(acc.id, row.year, row.month, v)}
                              />
                            </span>
                            <span className="flex-1 px-3 py-1 flex items-baseline justify-end font-mono whitespace-nowrap">
                              <span>{fmtNOK(ab.balance)}</span>
                              <span className="text-[10px] text-green-400/60 ml-1 inline-block min-w-[3.5rem] text-right shrink-0">
                                {ab.interest > 0 ? `(+${Math.round(ab.interest).toLocaleString('no-NO')})` : ''}
                              </span>
                            </span>
                          </div>
                        </td>
                      )
                    })}
```

Change to:

```tsx
                    {accMeta.map(acc => {
                      const ab = row.accountBalances.find(a => a.id === acc.id)!
                      return (
                        <td key={acc.id} colSpan={2} className="border-r border-border p-0">
                          <div className="grid grid-cols-[6rem_1fr] items-center">
                            <span className="flex-1 px-3 py-1 flex items-center justify-end">
                              {row.isPast ? (
                                <span className="tabular-nums text-right text-muted-foreground">
                                  {Math.round(ab.contribution).toLocaleString('no-NO')}
                                </span>
                              ) : (
                                <InnskuddCell
                                  value={ab.contribution}
                                  isOverridden={ab.overrideKey in contribOverrides}
                                  onChange={v => setMonthOverride(acc.id, row.year, row.month, v)}
                                  onFillDown={v => fillDown(acc.id, row.year, row.month, v)}
                                />
                              )}
                            </span>
                            <span className="flex-1 px-3 py-1 flex items-baseline justify-end font-mono whitespace-nowrap">
                              <span>{fmtNOK(ab.balance)}</span>
                              <span className="text-[10px] text-green-400/60 ml-1 inline-block min-w-[3.5rem] text-right shrink-0">
                                {ab.interest > 0 ? `(+${Math.round(ab.interest).toLocaleString('no-NO')})` : ''}
                              </span>
                            </span>
                          </div>
                        </td>
                      )
                    })}
```

- [ ] **Step 3: Fond — read-only for past rows**

Lines 1674-1708 currently read in full:

```tsx
                    {hasFond && (
                      <td colSpan={2} className="border-r border-border p-0">
                        <div className="grid grid-cols-[6rem_1fr] items-center">
                          <span className="flex-1 px-3 py-1 flex items-center justify-end">
                            {row.fondPeriod && !(`fond-${row.year}-${row.month}` in contribOverrides) ? (
                              <span
                                className="relative w-full flex items-center justify-end"
                                title={`Spareperiode: ${Math.round(row.fondPeriod.amount).toLocaleString('no-NO')} kr/mnd${row.fondPeriod.fromDate ? ` · fra ${row.fondPeriod.fromDate.slice(0, 7)}` : ''}${row.fondPeriod.toDate ? ` → ${row.fondPeriod.toDate.slice(0, 7)}` : ''}`}
                              >
                                <span className="absolute left-0 rounded px-1 py-0.5 text-[9px] font-medium bg-teal-900/40 text-teal-400 leading-none">P</span>
                                <InnskuddCell
                                  value={row.fondContrib}
                                  isOverridden={false}
                                  onChange={v => setMonthOverride('fond', row.year, row.month, v)}
                                  onFillDown={v => fillDown('fond', row.year, row.month, v)}
                                />
                              </span>
                            ) : (
                            <InnskuddCell
                              value={row.fondContrib}
                              isOverridden={`fond-${row.year}-${row.month}` in contribOverrides}
                              onChange={v => setMonthOverride('fond', row.year, row.month, v)}
                              onFillDown={v => fillDown('fond', row.year, row.month, v)}
                            />
                            )}
                          </span>
                          <span className="flex-1 px-3 py-1 flex items-baseline justify-end font-mono text-teal-400 whitespace-nowrap">
                            <span>{fmtNOK(row.fondBalance)}</span>
                            <span className="text-[10px] text-green-400/60 ml-1 inline-block min-w-[3.5rem] text-right shrink-0">
                              {row.fondInterest > 0 ? `(+${row.fondInterest.toLocaleString('no-NO')})` : ''}
                            </span>
                          </span>
                        </div>
                      </td>
                    )}
```

Replace the whole block with:

```tsx
                    {hasFond && (
                      <td colSpan={2} className="border-r border-border p-0">
                        <div className="grid grid-cols-[6rem_1fr] items-center">
                          <span className="flex-1 px-3 py-1 flex items-center justify-end">
                            {row.isPast ? (
                              <span className="tabular-nums text-right text-muted-foreground">
                                {Math.round(row.fondContrib).toLocaleString('no-NO')}
                              </span>
                            ) : row.fondPeriod && !(`fond-${row.year}-${row.month}` in contribOverrides) ? (
                              <span
                                className="relative w-full flex items-center justify-end"
                                title={`Spareperiode: ${Math.round(row.fondPeriod.amount).toLocaleString('no-NO')} kr/mnd${row.fondPeriod.fromDate ? ` · fra ${row.fondPeriod.fromDate.slice(0, 7)}` : ''}${row.fondPeriod.toDate ? ` → ${row.fondPeriod.toDate.slice(0, 7)}` : ''}`}
                              >
                                <span className="absolute left-0 rounded px-1 py-0.5 text-[9px] font-medium bg-teal-900/40 text-teal-400 leading-none">P</span>
                                <InnskuddCell
                                  value={row.fondContrib}
                                  isOverridden={false}
                                  onChange={v => setMonthOverride('fond', row.year, row.month, v)}
                                  onFillDown={v => fillDown('fond', row.year, row.month, v)}
                                />
                              </span>
                            ) : (
                            <InnskuddCell
                              value={row.fondContrib}
                              isOverridden={`fond-${row.year}-${row.month}` in contribOverrides}
                              onChange={v => setMonthOverride('fond', row.year, row.month, v)}
                              onFillDown={v => fillDown('fond', row.year, row.month, v)}
                            />
                            )}
                          </span>
                          <span className="flex-1 px-3 py-1 flex items-baseline justify-end font-mono text-teal-400 whitespace-nowrap">
                            <span>{fmtNOK(row.fondBalance)}</span>
                            <span className="text-[10px] text-green-400/60 ml-1 inline-block min-w-[3.5rem] text-right shrink-0">
                              {row.fondInterest > 0 ? `(+${row.fondInterest.toLocaleString('no-NO')})` : ''}
                            </span>
                          </span>
                        </div>
                      </td>
                    )}
```

- [ ] **Step 4: Fix the `Total EK` cell to show "–" for past rows**

Line 1773 currently:

```tsx
                      {fmtNOK(row.totalEK)}
```

Change to:

```tsx
                      {row.isPast ? '—' : fmtNOK(row.totalEK)}
```

(Past rows deliberately don't compute a `totalEK`, per the spec — partner data isn't reconstructable, so a partial total would misrepresent the "Total EK" column's meaning for every other row.)

Partner accounts, partner BSU, partner fond, and the debt/kjøpekraft cells (lines 1710-1765) need **no changes** — they already render `'—'` whenever the underlying value is `0` (e.g. `row.myDebtBalance > 0 ? ... : '—'`, `row.maxKjøpesum > 0 ? ... : '—'`), and `pastRows` (Task 3) already sets all of those fields to `0`.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Manual verification in the browser**

Run: `npm run dev` (if not already running), open Sparing → Månedsoversikt:
- Expand a past year. Every monthly row should look visually muted (`opacity-60`) and show plain numbers for own-account/fond contribution cells — not the dashed-underline clickable `InnskuddCell` style.
- Partner/debt/kjøpekraft cells in past rows should show "–".
- The `Total EK` cell for past rows should show "–", not a partial number.
- Expand the current year: its rows should look exactly as they did before this change (full opacity, editable cells).
- Confirm no console errors.

- [ ] **Step 7: Commit**

```bash
git add src/pages/economy/SavingsPage.tsx
git commit -m "$(cat <<'EOF'
feat(sparing): grå ut og skrivebeskytt passerte måneder

Historiske rader (isPast) vises nå som ren tekst i stedet for
redigerbare InnskuddCell-er, med redusert opacity på hele raden.
Total EK vises som "–" for fortiden siden partnerdata ikke er
rekonstruerbart og en delvis sum ville villede.
EOF
)"
```

---

### Task 6: Collapse past years by default

**Files:**
- Modify: `src/pages/economy/SavingsPage.tsx:699`

**Files (test consideration):** none — this is UI-only state initialization, no domain logic to unit test.

- [ ] **Step 1: Change the initial `collapsedYears` state**

Line 699 currently:

```ts
  const [collapsedYears, setCollapsedYears] = useState<Set<number>>(new Set())
```

This runs before `pastRows`/`years` exist (it's declared near the top of the component, `years` is computed later at line ~1063), so it can't read `years` directly at initialization. Use a lazy initializer that derives the default from `now` and `accounts`/`fondPortfolio` opening dates directly, mirroring the same "earliest" logic as `pastRows` (Task 3) but only for the initial collapse set — this only needs to run once on mount, not react to later changes, matching today's behavior (`collapsedYears` never resets itself once the user starts toggling).

Change to:

```ts
  const [collapsedYears, setCollapsedYears] = useState<Set<number>>(() => {
    const currentYear = now.getFullYear()
    const accountStarts = accounts.map(a => new Date(a.openingDate).getFullYear())
    const fondStartYear = fondPortfolio?.startDate ? new Date(fondPortfolio.startDate).getFullYear() : currentYear
    const earliestYear = Math.min(currentYear, ...accountStarts, fondStartYear)
    const initiallyCollapsed = new Set<number>()
    for (let y = earliestYear; y < currentYear; y++) initiallyCollapsed.add(y)
    return initiallyCollapsed
  })
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Manual verification in the browser**

Run: `npm run dev` (if not already running), open Sparing → Månedsoversikt (fresh reload, no cached toggle state):
- Every year before the current one should load collapsed (only the year-header row visible, chevron pointing right).
- The current year (and any future years) should load expanded, exactly as before this change.
- Clicking a collapsed past year's header still expands it (existing toggle logic, untouched).

- [ ] **Step 4: Commit**

```bash
git add src/pages/economy/SavingsPage.tsx
git commit -m "$(cat <<'EOF'
feat(sparing): kollaps tidligere år som standard i månedsoversikten

Nå som historiske år vises permanent, kollapses de ved første last for
å holde tabellen kompakt — inneværende og fremtidige år er fortsatt
utvidet som før.
EOF
)"
```

---

### Task 7: Full verification pass

**Files:** none — verification only.

- [ ] **Step 1: Full typecheck (catches `noUnusedLocals`/`noUnusedParameters`, which `tsc --noEmit` alone misses in this project's composite setup)**

Run: `npm run build`
Expected: PASS, no TypeScript errors.

- [ ] **Step 2: Full test suite**

Run: `npm run test`
Expected: PASS, including the new `computeAccountHistory` cases from Task 1 and all pre-existing tests (this task touches shared domain code — `savingsCalculator.ts` — so a full run, not just the one file, is warranted).

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 4: End-to-end manual walkthrough in the browser**

Run: `npm run dev`, open Sparing → Månedsoversikt, and check:
- An account created several years ago shows real historical monthly balances going back to its opening date, grayed out, collapsed by year.
- An account created this month shows no past rows (pastRows correctly empty for it) — no empty/broken past year appears.
- Toggling "Inkluder rente" (`includeInterest`) still only affects the forward projection — past rows are unaffected (they never read `includeInterest`).
- Editing the current month's contribution for an own account still works exactly as before (InnskuddCell still live for `!row.isPast` rows).
- No visual regression in the "Åpne som scenario" (Home icon) button — it should still only appear on forward rows with `maxKjøpesum > 0` (past rows have `maxKjøpesum: 0`, so the icon correctly never appears there).

- [ ] **Step 5: Commit (only if any fixes were needed in this task)**

If everything passed with no changes, there is nothing to commit for this task — it's a verification checkpoint, not a code change.
