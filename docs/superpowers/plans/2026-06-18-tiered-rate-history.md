# Tidsbevisst trinnvisrente — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Legge til tidsdimensjon på trinnvise rentestrukturer slik at brukeren kan se historikk og registrere fremtidige planlagte endringer.

**Architecture:** Ny type `TieredRateHistoryEntry { fromDate, tiers }` erstatter `tieredRates?: TieredRate[]` på `SavingsAccount`. En ny hjelpefunksjon `getActiveTiersForDate` henter riktig trinnstruktur for en gitt dato. UI-et får en accordion under hvert kontkort med inline mini-editor for hvert historikkinnslag.

**Tech Stack:** React 19, TypeScript (strict), Zustand persist (v21), Vitest

---

## Filstruktur

| Fil | Hva endres |
|---|---|
| `src/types/economy.ts` | Ny `TieredRateHistoryEntry`, nytt felt `tieredRateHistory?` på `SavingsAccount` |
| `src/domain/economy/savingsCalculator.ts` | Ny `getActiveTiersForDate`, oppdater `getEffectiveRate` og `projectSavingsGrowth` |
| `src/domain/economy/__tests__/savingsCalculator.test.ts` | Tester for `getActiveTiersForDate`, oppdater `getEffectiveRate`-tester |
| `src/application/useEconomyStore.ts` | Bump til v21, migreringssteg |
| `src/pages/economy/SavingsPage.tsx` | Oppdater forecast-løkker, `AccountEditForm.handleSave`, ny accordion-UI |

---

## Task 1: Legg til `TieredRateHistoryEntry` i typer

**Files:**
- Modify: `src/types/economy.ts`

- [ ] **Steg 1: Legg til ny type og nytt felt**

I `src/types/economy.ts`, rett etter `TieredRate`-interfacet (linje ~268):

```typescript
export interface TieredRateHistoryEntry {
  fromDate: string    // ISO "YYYY-MM-DD" — når strukturen gjelder fra
  tiers: TieredRate[] // hele trinnstrukturen for denne perioden
}
```

Legg til `tieredRateHistory?: TieredRateHistoryEntry[]` i `SavingsAccount` (rett etter `tieredRates?: TieredRate[]` på linje ~332):

```typescript
/** Tidsbevisst trinnvisrente — erstatter tieredRates */
tieredRateHistory?: TieredRateHistoryEntry[]
```

- [ ] **Steg 2: Verifiser at TypeScript kompilerer**

```bash
npm run typecheck
```

Forventet: ingen feil (nye valgfrie felt bryter ikke eksisterende kode).

- [ ] **Steg 3: Commit**

```bash
git add src/types/economy.ts
git commit -m "feat(types): legg til TieredRateHistoryEntry og tieredRateHistory på SavingsAccount"
```

---

## Task 2: Legg til `getActiveTiersForDate` i savingsCalculator

**Files:**
- Modify: `src/domain/economy/savingsCalculator.ts`
- Test: `src/domain/economy/__tests__/savingsCalculator.test.ts`

- [ ] **Steg 1: Skriv de mislykkede testene**

Legg til i `src/domain/economy/__tests__/savingsCalculator.test.ts` (etter eksisterende `getEffectiveRateFromTiers`-blokk):

```typescript
import { getActiveTiersForDate } from '../savingsCalculator'
import type { TieredRateHistoryEntry } from '@/types/economy'

describe('getActiveTiersForDate', () => {
  const history: TieredRateHistoryEntry[] = [
    { fromDate: '2025-01-01', tiers: [{ fromBalance: 0, rate: 3.0 }, { fromBalance: 150_000, rate: 3.5 }] },
    { fromDate: '2026-01-01', tiers: [{ fromBalance: 0, rate: 3.4 }, { fromBalance: 100_000, rate: 3.7 }, { fromBalance: 500_000, rate: 4.35 }] },
    { fromDate: '2026-08-01', tiers: [{ fromBalance: 0, rate: 3.5 }, { fromBalance: 150_000, rate: 3.8 }] },
  ]

  it('returnerer riktig struktur for en dato i fortiden', () => {
    const tiers = getActiveTiersForDate(history, '2025-06-15')
    expect(tiers).toEqual([{ fromBalance: 0, rate: 3.0 }, { fromBalance: 150_000, rate: 3.5 }])
  })

  it('returnerer nyeste struktur for en dato etter siste innslag', () => {
    const tiers = getActiveTiersForDate(history, '2026-03-01')
    expect(tiers).toEqual([
      { fromBalance: 0, rate: 3.4 },
      { fromBalance: 100_000, rate: 3.7 },
      { fromBalance: 500_000, rate: 4.35 },
    ])
  })

  it('fremtidige innslag brukes ikke', () => {
    const tiers = getActiveTiersForDate(history, '2026-07-31')
    expect(tiers).toEqual([
      { fromBalance: 0, rate: 3.4 },
      { fromBalance: 100_000, rate: 3.7 },
      { fromBalance: 500_000, rate: 4.35 },
    ])
  })

  it('returnerer undefined for tom historikk', () => {
    expect(getActiveTiersForDate([], '2026-01-01')).toBeUndefined()
  })

  it('returnerer undefined når alle innslag er fremtidige', () => {
    const future: TieredRateHistoryEntry[] = [
      { fromDate: '2099-01-01', tiers: [{ fromBalance: 0, rate: 5.0 }] },
    ]
    expect(getActiveTiersForDate(future, '2026-01-01')).toBeUndefined()
  })

  it('bruker eksakt match på fromDate', () => {
    const tiers = getActiveTiersForDate(history, '2026-01-01')
    expect(tiers?.[0].rate).toBe(3.4)
  })
})
```

- [ ] **Steg 2: Kjør testen og bekreft at den feiler**

```bash
npx vitest run src/domain/economy/__tests__/savingsCalculator.test.ts
```

Forventet: FAIL — `getActiveTiersForDate is not a function`

- [ ] **Steg 3: Implementer `getActiveTiersForDate` i savingsCalculator**

Legg til eksport i `src/domain/economy/savingsCalculator.ts` rett etter `getEffectiveRateFromTiers` (linje ~192):

```typescript
export function getActiveTiersForDate(
  history: TieredRateHistoryEntry[],
  date: string,
): TieredRate[] | undefined {
  return [...history]
    .filter((e) => e.fromDate <= date)
    .sort((a, b) => b.fromDate.localeCompare(a.fromDate))[0]?.tiers
}
```

Legg til `TieredRateHistoryEntry` i importlinjen øverst i filen (den importerer allerede fra `@/types/economy`).

- [ ] **Steg 4: Kjør testen og bekreft at den passerer**

```bash
npx vitest run src/domain/economy/__tests__/savingsCalculator.test.ts
```

Forventet: alle tester PASS

- [ ] **Steg 5: Oppdater `getEffectiveRate` til å bruke `tieredRateHistory`**

Erstatt `getEffectiveRate` i `src/domain/economy/savingsCalculator.ts` (linje ~194–199):

```typescript
export function getEffectiveRate(account: SavingsAccount, balance: number): number {
  const nowISO = new Date().toISOString().slice(0, 10)
  const activeTiers = account.tieredRateHistory?.length
    ? getActiveTiersForDate(account.tieredRateHistory, nowISO)
    : account.tieredRates?.length
      ? account.tieredRates
      : undefined
  if (activeTiers?.length) {
    return getEffectiveRateFromTiers(activeTiers, balance)
  }
  return getCurrentRateForDate(account.rateHistory, new Date())
}
```

- [ ] **Steg 6: Oppdater `projectSavingsGrowth` til å bruke `tieredRateHistory`**

I `src/domain/economy/savingsCalculator.ts` rundt linje ~413–416, erstatt:

```typescript
const rate = account.tieredRates?.length
  ? getEffectiveRateFromTiers(account.tieredRates, balance)
  : getCurrentRateForDate(account.rateHistory, date)
```

med:

```typescript
const dateISO = `${year}-${String(m).padStart(2, '0')}-01`
const activeTiers = account.tieredRateHistory?.length
  ? getActiveTiersForDate(account.tieredRateHistory, dateISO)
  : account.tieredRates?.length
    ? account.tieredRates
    : undefined
const rate = activeTiers?.length
  ? getEffectiveRateFromTiers(activeTiers, balance)
  : getCurrentRateForDate(account.rateHistory, date)
```

- [ ] **Steg 7: Oppdater `getEffectiveRate`-testene**

Oppdater testene i `src/domain/economy/__tests__/savingsCalculator.test.ts` som bruker `tieredRates` til å bruke `tieredRateHistory`:

```typescript
describe('getEffectiveRate', () => {
  it('faller tilbake på rateHistory når tieredRateHistory mangler', () => {
    const acc = makeBSUAccount({
      rateHistory: [{ fromDate: '2025-01-01', rate: 6.3 }],
    })
    expect(getEffectiveRate(acc, 50_000)).toBe(6.3)
  })

  it('bruker tieredRateHistory når tilstede', () => {
    const acc = makeBSUAccount({
      rateHistory: [{ fromDate: '2025-01-01', rate: 6.3 }],
      tieredRateHistory: [
        {
          fromDate: '2025-01-01',
          tiers: [
            { fromBalance: 0,       rate: 3.25 },
            { fromBalance: 100_000, rate: 3.55 },
          ],
        },
      ],
    })
    expect(getEffectiveRate(acc, 150_000)).toBe(3.55)
  })

  it('faller tilbake på tieredRates (gammel data) hvis tieredRateHistory mangler', () => {
    const acc = makeBSUAccount({
      rateHistory: [{ fromDate: '2025-01-01', rate: 6.3 }],
      tieredRates: [
        { fromBalance: 0,       rate: 3.25 },
        { fromBalance: 100_000, rate: 3.55 },
      ],
    })
    expect(getEffectiveRate(acc, 150_000)).toBe(3.55)
  })
})
```

- [ ] **Steg 8: Kjør alle tester**

```bash
npm run test
```

Forventet: alle PASS

- [ ] **Steg 9: Commit**

```bash
git add src/domain/economy/savingsCalculator.ts src/domain/economy/__tests__/savingsCalculator.test.ts
git commit -m "feat(savings): legg til getActiveTiersForDate, oppdater getEffectiveRate og projectSavingsGrowth"
```

---

## Task 3: Store-migrasjon v21

**Files:**
- Modify: `src/application/useEconomyStore.ts`

- [ ] **Steg 1: Bump versjon og legg til migrasjon**

I `src/application/useEconomyStore.ts`, endre `version: 20` til `version: 21` og legg til migreringssteg øverst i `migrate`-funksjonen (rett etter `const state = ...`):

```typescript
// v20 → v21: migrer tieredRates (snapshot) til tieredRateHistory (tidsserie)
if (fromVersion < 21 && Array.isArray(state.savingsAccounts)) {
  state.savingsAccounts = (state.savingsAccounts as SavingsAccount[]).map((acc) => {
    if (acc.tieredRates?.length && !acc.tieredRateHistory?.length) {
      return {
        ...acc,
        tieredRateHistory: [{ fromDate: acc.openingDate, tiers: acc.tieredRates }],
        tieredRates: undefined,
      }
    }
    return acc
  })
}
```

`SavingsAccount` er allerede importert i filen. Sjekk at `TieredRateHistoryEntry` importeres fra `@/types/economy` om typekompilatoren klager.

- [ ] **Steg 2: Verifiser kompilering**

```bash
npm run typecheck
```

Forventet: ingen feil

- [ ] **Steg 3: Commit**

```bash
git add src/application/useEconomyStore.ts
git commit -m "feat(store): v21 — migrer tieredRates til tieredRateHistory"
```

---

## Task 4: Oppdater forecast-løkker i SavingsPage

**Files:**
- Modify: `src/pages/economy/SavingsPage.tsx`

- [ ] **Steg 1: Oppdater bruker-forecast-løkken (linje ~876)**

Finn blokken i `SavingsPage.tsx` (brukerens egne kontoer, BSU-løkken):

```typescript
const effectiveRate = (acc.tieredRates?.length && !(`rate-${acc.id}` in contribOverrides))
  ? getEffectiveRateFromTiers(acc.tieredRates, effectiveBal)
  : acc.rate
```

Erstatt med:

```typescript
const activeTiersNow = acc.tieredRateHistory?.length
  ? getActiveTiersForDate(acc.tieredRateHistory, nowISO)
  : acc.tieredRates?.length ? acc.tieredRates : undefined
const effectiveRate = (activeTiersNow?.length && !(`rate-${acc.id}` in contribOverrides))
  ? getEffectiveRateFromTiers(activeTiersNow, effectiveBal)
  : acc.rate
```

- [ ] **Steg 2: Oppdater partner-forecast-løkken (linje ~949)**

Finn blokken:

```typescript
const rate = (acc.tieredRates?.length && !(`rate-p-${acc.id}` in contribOverrides))
  ? getEffectiveRateFromTiers(acc.tieredRates, acc.runningBal)
  : (acc.rate || SAVINGS_RATE_TABLE)
```

Erstatt med:

```typescript
const activeTiersPartner = acc.tieredRateHistory?.length
  ? getActiveTiersForDate(acc.tieredRateHistory, nowISO)
  : acc.tieredRates?.length ? acc.tieredRates : undefined
const rate = (activeTiersPartner?.length && !(`rate-p-${acc.id}` in contribOverrides))
  ? getEffectiveRateFromTiers(activeTiersPartner, acc.runningBal)
  : (acc.rate || SAVINGS_RATE_TABLE)
```

- [ ] **Steg 3: Legg til `getActiveTiersForDate` i importlinjen**

`SavingsPage.tsx` importerer allerede `getEffectiveRateFromTiers` fra `@/domain/economy/savingsCalculator`. Legg til `getActiveTiersForDate` i samme import.

- [ ] **Steg 4: Typesjekk**

```bash
npm run typecheck
```

Forventet: ingen feil

- [ ] **Steg 5: Commit**

```bash
git add src/pages/economy/SavingsPage.tsx
git commit -m "feat(savings): bruk getActiveTiersForDate i forecast-løkker"
```

---

## Task 5: Oppdater `AccountEditForm` til å lese/skrive `tieredRateHistory`

**Files:**
- Modify: `src/pages/economy/SavingsPage.tsx` (`AccountEditForm`-komponenten)

- [ ] **Steg 1: Oppdater initialisering av `tieredRates`-state**

Finn `useState`-initialiseringen (linje ~2758–2762):

```typescript
const [tieredRates, setTieredRates] = useState<TieredRate[]>(
  initialPreset?.tieredRates
    ? [...initialPreset.tieredRates]
    : (initial?.tieredRates ?? [{ fromBalance: 0, rate: initial?.rateHistory?.slice().sort((a, b) => b.fromDate.localeCompare(a.fromDate))[0]?.rate ?? 3.5 }])
)
```

Erstatt med:

```typescript
const todayISO = new Date().toISOString().slice(0, 10)
const activeTiersFromHistory = initial?.tieredRateHistory?.length
  ? getActiveTiersForDate(initial.tieredRateHistory, todayISO)
  : undefined
const [tieredRates, setTieredRates] = useState<TieredRate[]>(
  initialPreset?.tieredRates
    ? [...initialPreset.tieredRates]
    : activeTiersFromHistory
      ?? initial?.tieredRates
      ?? [{ fromBalance: 0, rate: initial?.rateHistory?.slice().sort((a, b) => b.fromDate.localeCompare(a.fromDate))[0]?.rate ?? 3.5 }]
)
```

(`getActiveTiersForDate` er allerede importert etter Task 4.)

- [ ] **Steg 2: Oppdater `handleSave` til å skrive `tieredRateHistory`**

I `handleSave` (linje ~2839), finn beregningen av `effectiveTieredRates` og linjen som setter `tieredRates:`:

```typescript
const hasMultipleTiers = tieredRates.length > 1 ||
  (tieredRates.length === 1 && tieredRates[0].fromBalance > 0)
const effectiveTieredRates = hasMultipleTiers ? tieredRates : undefined
const flatRate = tieredRates[0]?.rate ?? 3.5

const account: SavingsAccount = {
  ...
  tieredRates: effectiveTieredRates,
  ...
}
```

Erstatt med:

```typescript
const hasMultipleTiers = tieredRates.length > 1 ||
  (tieredRates.length === 1 && tieredRates[0].fromBalance > 0)
const flatRate = tieredRates[0]?.rate ?? 3.5

// Bygg oppdatert tieredRateHistory: oppdater det aktive innslaget, behold resten
const existingHistory = initial?.tieredRateHistory ?? []
const activeEntry = [...existingHistory]
  .filter((e) => e.fromDate <= todayISO)
  .sort((a, b) => b.fromDate.localeCompare(a.fromDate))[0]
  ?? existingHistory[0]

const updatedHistory: TieredRateHistoryEntry[] = hasMultipleTiers
  ? activeEntry
    ? existingHistory.map((e) =>
        e.fromDate === activeEntry.fromDate ? { ...e, tiers: tieredRates } : e
      )
    : [{ fromDate: openingDate, tiers: tieredRates }]
  : []

const account: SavingsAccount = {
  ...
  tieredRates: undefined,
  tieredRateHistory: updatedHistory.length > 0 ? updatedHistory : undefined,
  ...
}
```

Legg til `TieredRateHistoryEntry` i importlinjen for typer øverst i filen.

- [ ] **Steg 3: Typesjekk**

```bash
npm run typecheck
```

Forventet: ingen feil

- [ ] **Steg 4: Commit**

```bash
git add src/pages/economy/SavingsPage.tsx
git commit -m "feat(savings): AccountEditForm leser/skriver tieredRateHistory"
```

---

## Task 6: Accordion-UI med historikk og inline-editor

**Files:**
- Modify: `src/pages/economy/SavingsPage.tsx`

- [ ] **Steg 1: Legg til state for åpen accordion og redigering**

I `AccountCard`-komponenten (ikke `SavingsPage`), legg til nye state-variabler rett etter `editingAccount`-state (linje ~1968):

```typescript
const [openRateHistory, setOpenRateHistory] = useState(false)
const [editingRateEntry, setEditingRateEntry] = useState<string | null>(null) // fromDate eller '__new__'
const [rateEntryDraft, setRateEntryDraft] = useState<{ fromDate: string; tiers: TieredRate[] } | null>(null)
```

- [ ] **Steg 2: Legg til "Administrer"-knapp i tieredRates-displayet**

I det eksisterende `account.tieredRates && account.tieredRates.length > 1`-displayet i stats-griden (linje ~2070–2088), legg til en knapp etter listen med trinn:

```tsx
{account.tieredRates && account.tieredRates.length > 1 ? (
  <div className="rounded-lg border border-border bg-muted/10 p-2 space-y-0.5">
    <p className="text-xs text-muted-foreground">Rentesats (trinnvis)</p>
    {[...account.tieredRates]
      .sort((a, b) => a.fromBalance - b.fromBalance)
      .map((t, i, arr) => {
        const isActive = currentBalance >= t.fromBalance &&
          (i === arr.length - 1 || currentBalance < arr[i + 1].fromBalance)
        return (
          <div key={t.fromBalance} className={`flex justify-between text-xs ${isActive ? 'text-primary font-semibold' : 'text-muted-foreground'}`}>
            <span>
              {t.fromBalance === 0 ? '0' : `${(t.fromBalance / 1000).toFixed(0)}k`}
              {i < arr.length - 1 ? `–${(arr[i + 1].fromBalance / 1000).toFixed(0)}k` : '+'}
            </span>
            <span>{t.rate.toFixed(2)} %{isActive ? ' ◀' : ''}</span>
          </div>
        )
      })}
    <button
      onClick={() => setOpenRateHistory((v) => !v)}
      className="text-[10px] text-muted-foreground hover:text-foreground transition-colors pt-0.5"
    >
      {openRateHistory ? 'Skjul historikk ▲' : 'Administrer rentestruktur ▾'}
    </button>
  </div>
) : (
  /* eksisterende MiniStat */
)}
```

Merk: displayet bruker `account.tieredRates` (gammel data). Når migreringen er kjørt vil alle kontoer bruke `tieredRateHistory`. Erstatt også `account.tieredRates` i visningen med aktive tiers fra history:

```typescript
const displayTiers = account.tieredRateHistory?.length
  ? getActiveTiersForDate(account.tieredRateHistory, nowISO)
  : account.tieredRates
```

Bruk `displayTiers` i displayet i stedet for `account.tieredRates`.

- [ ] **Steg 3: Legg til accordion-seksjonen under account-kortet**

Rett etter avslutningstaggen til account-kortet (den store `<div>`-en som wrapper hele kortet), legg til. `nowISO` er allerede deklarert i `AccountCard` rundt linje 1978 — ikke redeklarer den.

```tsx
{/* Rentestruktur-accordion */}
{openRateHistory && (
  <div className="rounded-md border border-border/50 overflow-hidden -mt-1">
    <div className="bg-muted/20 px-3 py-1.5 text-xs font-medium text-muted-foreground">
      Rentestrukturhistorikk
    </div>
    {(() => {
      const history = account.tieredRateHistory ?? []
      const sorted = [...history].sort((a, b) => b.fromDate.localeCompare(a.fromDate))
      const activeFromDate = sorted.find((e) => e.fromDate <= nowISO)?.fromDate

      return (
        <>
          {sorted.map((entry) => {
            const isFuture = entry.fromDate > nowISO
            const isActive = entry.fromDate === activeFromDate
            const isEditing = editingRateEntry === entry.fromDate
            const colorClass = isFuture
              ? 'text-amber-400/80'
              : isActive ? 'text-green-400' : 'text-muted-foreground'
            const rateSummary = [...entry.tiers]
              .sort((a, b) => a.fromBalance - b.fromBalance)
              .map((t) => `${t.rate.toFixed(2)}`)
              .join(' / ')

            return (
              <div key={entry.fromDate} className="border-t border-border/30">
                {!isEditing ? (
                  <div className="flex items-center justify-between px-3 py-1.5 text-xs">
                    <div className="flex items-center gap-2">
                      <span className={colorClass}>
                        {isFuture && '▶ '}Fra {fmtDate(entry.fromDate)}
                      </span>
                      {isActive && <span className="text-[10px] bg-green-400/10 text-green-400 rounded px-1 py-0.5">Aktiv</span>}
                      {isFuture && <span className="text-[10px] bg-amber-400/10 text-amber-400/80 rounded px-1 py-0.5">Kommende</span>}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`${colorClass} font-mono`}>{rateSummary} %</span>
                      <button
                        onClick={() => {
                          setEditingRateEntry(entry.fromDate)
                          setRateEntryDraft({ fromDate: entry.fromDate, tiers: [...entry.tiers] })
                        }}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      {history.length > 1 && (
                        <button
                          onClick={() => onUpdate({
                            tieredRateHistory: history.filter((e) => e.fromDate !== entry.fromDate),
                          })}
                          className="text-muted-foreground hover:text-red-400 transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Inline mini-editor */
                  <div className="px-3 py-2 space-y-2 bg-muted/10">
                    <div className="flex items-center gap-2">
                      <Label className="text-xs w-20">Fra dato</Label>
                      <Input
                        type="date"
                        value={rateEntryDraft!.fromDate}
                        onChange={(e) => setRateEntryDraft((d) => d ? { ...d, fromDate: e.target.value } : d)}
                        className="h-7 text-xs w-36"
                      />
                    </div>
                    {rateEntryDraft!.tiers.map((tier, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-20">Fra saldo</span>
                        <Input
                          type="number"
                          step={10000}
                          disabled={idx === 0}
                          value={tier.fromBalance || ''}
                          placeholder="0"
                          onChange={(e) => setRateEntryDraft((d) => d ? {
                            ...d,
                            tiers: d.tiers.map((t, i) => i === idx ? { ...t, fromBalance: parseFloat(e.target.value) || 0 } : t),
                          } : d)}
                          className="h-7 text-xs w-28"
                        />
                        <span className="text-xs text-muted-foreground">kr →</span>
                        <Input
                          type="number"
                          step={0.05}
                          value={tier.rate || ''}
                          placeholder="0.00"
                          onChange={(e) => setRateEntryDraft((d) => d ? {
                            ...d,
                            tiers: d.tiers.map((t, i) => i === idx ? { ...t, rate: parseFloat(e.target.value) || 0 } : t),
                          } : d)}
                          className="h-7 text-xs w-20"
                        />
                        <span className="text-xs text-muted-foreground">%</span>
                        {idx > 0 && (
                          <button
                            onClick={() => setRateEntryDraft((d) => d ? {
                              ...d,
                              tiers: d.tiers.filter((_, i) => i !== idx),
                            } : d)}
                            className="text-muted-foreground hover:text-red-400 transition-colors"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                    {rateEntryDraft!.tiers.length < 6 && (
                      <button
                        onClick={() => {
                          const lastBal = rateEntryDraft!.tiers.at(-1)?.fromBalance ?? 0
                          setRateEntryDraft((d) => d ? {
                            ...d,
                            tiers: [...d.tiers, { fromBalance: lastBal + 100_000, rate: 0 }],
                          } : d)
                        }}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Plus className="h-3 w-3" /> Legg til trinn
                      </button>
                    )}
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => {
                          if (!rateEntryDraft) return
                          const newHistory = history.map((e) =>
                            e.fromDate === entry.fromDate
                              ? { fromDate: rateEntryDraft.fromDate, tiers: rateEntryDraft.tiers }
                              : e
                          )
                          onUpdate({ tieredRateHistory: newHistory })
                          setEditingRateEntry(null)
                          setRateEntryDraft(null)
                        }}
                        className="text-xs bg-primary text-primary-foreground rounded px-2 py-1"
                      >
                        Lagre
                      </button>
                      <button
                        onClick={() => { setEditingRateEntry(null); setRateEntryDraft(null) }}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Avbryt
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
          {/* Ny periode-knapp */}
          <div className="px-3 py-2 border-t border-border/30">
            {editingRateEntry === '__new__' ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label className="text-xs w-20">Fra dato</Label>
                  <Input
                    type="date"
                    value={rateEntryDraft!.fromDate}
                    onChange={(e) => setRateEntryDraft((d) => d ? { ...d, fromDate: e.target.value } : d)}
                    className="h-7 text-xs w-36"
                  />
                </div>
                {rateEntryDraft!.tiers.map((tier, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-20">Fra saldo</span>
                    <Input
                      type="number"
                      step={10000}
                      disabled={idx === 0}
                      value={tier.fromBalance || ''}
                      placeholder="0"
                      onChange={(e) => setRateEntryDraft((d) => d ? {
                        ...d,
                        tiers: d.tiers.map((t, i) => i === idx ? { ...t, fromBalance: parseFloat(e.target.value) || 0 } : t),
                      } : d)}
                      className="h-7 text-xs w-28"
                    />
                    <span className="text-xs text-muted-foreground">kr →</span>
                    <Input
                      type="number"
                      step={0.05}
                      value={tier.rate || ''}
                      placeholder="0.00"
                      onChange={(e) => setRateEntryDraft((d) => d ? {
                        ...d,
                        tiers: d.tiers.map((t, i) => i === idx ? { ...t, rate: parseFloat(e.target.value) || 0 } : t),
                      } : d)}
                      className="h-7 text-xs w-20"
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                    {idx > 0 && (
                      <button
                        onClick={() => setRateEntryDraft((d) => d ? {
                          ...d,
                          tiers: d.tiers.filter((_, i) => i !== idx),
                        } : d)}
                        className="text-muted-foreground hover:text-red-400 transition-colors"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
                {rateEntryDraft!.tiers.length < 6 && (
                  <button
                    onClick={() => {
                      const lastBal = rateEntryDraft!.tiers.at(-1)?.fromBalance ?? 0
                      setRateEntryDraft((d) => d ? {
                        ...d,
                        tiers: [...d.tiers, { fromBalance: lastBal + 100_000, rate: 0 }],
                      } : d)
                    }}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Plus className="h-3 w-3" /> Legg til trinn
                  </button>
                )}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => {
                      if (!rateEntryDraft?.fromDate) return
                      onUpdate({
                        tieredRateHistory: [
                          ...history.filter((e) => e.fromDate !== rateEntryDraft.fromDate),
                          { fromDate: rateEntryDraft.fromDate, tiers: rateEntryDraft.tiers },
                        ],
                      })
                      setEditingRateEntry(null)
                      setRateEntryDraft(null)
                    }}
                    className="text-xs bg-primary text-primary-foreground rounded px-2 py-1"
                  >
                    Lagre
                  </button>
                  <button
                    onClick={() => { setEditingRateEntry(null); setRateEntryDraft(null) }}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Avbryt
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => {
                  const activeTiers = activeFromDate
                    ? history.find((e) => e.fromDate === activeFromDate)?.tiers ?? []
                    : []
                  setEditingRateEntry('__new__')
                  setRateEntryDraft({ fromDate: '', tiers: [...activeTiers] })
                }}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Plus className="h-3 w-3" /> Ny periode fra dato
              </button>
            )}
          </div>
        </>
      )
    })()}
  </div>
)}
```

`Pencil` er allerede importert fra lucide-react (linje 7 i filen).

- [ ] **Steg 4: Typesjekk**

```bash
npm run typecheck
```

Forventet: ingen feil

- [ ] **Steg 5: Kjør alle tester**

```bash
npm run test
```

Forventet: alle PASS

- [ ] **Steg 6: Commit**

```bash
git add src/pages/economy/SavingsPage.tsx
git commit -m "feat(savings): accordion med tidsbevisst trinnvisrente-historikk og inline-editor"
```

---

## Task 7: Bygg og verifiser

- [ ] **Steg 1: Full bygg**

```bash
npm run build
```

Forventet: ingen TypeScript-feil, ingen Vite-buildfeil

- [ ] **Steg 2: Manuell test i browser**

Start dev-serveren og gå til Sparing-fanen. Bekreft:
- En konto med trinnvisrente viser "Administrer rentestruktur ▾"-knapp
- Klikk på knappen: accordion vises under kortet
- Eksisterende trinnstruktur vises med riktig fargekoding (grønn = aktiv)
- Klikk ✎: inline-editor viser datofelt + trinnrader, kan redigeres og lagres
- Klikk "Ny periode fra dato": ny rad med tom datofelt og kopierte trinn fra aktiv struktur
- Registrer en fremtidig dato (f.eks. 2026-08-01): vises i gult med "Kommende"-badge
- Klikk ✗: slett en historisk rad, bekreftes umiddelbart
- Åpne edit-modal: trinnvisrenteditoren viser riktige satser fra aktiv historikkpost

- [ ] **Steg 3: Commit (om nødvendig)**

```bash
git add -p
git commit -m "fix(savings): justeringer etter manuell test"
```
