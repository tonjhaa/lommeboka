# Fremtidig lønnsoppgjør med etterbetaling — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gjøre det mulig å registrere et forventet lønnsoppgjør (f.eks. statens ramme fra 1. mai), se estimert etterbetaling, og valgfritt bokføre etterbetalingen som en engangspost i budsjettet.

**Architecture:** Utvid `LonnsoppgjorRecord` med to felt (`etterbetalingDate` og `etterbetalingBudgetLineId`). Beregn etterbetaling som `(ny lønn − gammel lønn) × antall måneder fra ikrafttredelse til utbetaling`. Bokføring skjer ved å legge til en `BudgetLine` med `isRecurring: false`, `specificMonth` og `specificYear` i `budgetTemplate.lines` — det eksisterende budsjettsystemet håndterer visning uten endringer i `budgetTableComputer`.

**Tech Stack:** TypeScript, React, Zustand, eksisterende typer i `src/types/economy.ts`

---

### Task 1: Utvid `LonnsoppgjorRecord`-typen

**Files:**
- Modify: `src/types/economy.ts:396-405`

- [ ] **Steg 1: Legg til to valgfrie felt på `LonnsoppgjorRecord`**

```ts
// src/types/economy.ts — erstatt eksisterende LonnsoppgjorRecord
export interface LonnsoppgjorRecord {
  id: string
  year: number
  effectiveDate: string         // "YYYY-MM-DD", typisk 1. mai
  maanedslonn: number           // ny grunnlønn etter oppgjør
  forrigeMaanedslonn: number    // grunnlønn før oppgjøret (0 = ukjent/første registrerte)
  htaTillegg: number            // HTA-tillegg inkludert i økningen (0 = ukjent)
  notes: string
  source: 'slip' | 'manual' | 'forventet'
  /** Forventet utbetalingsdato for etterbetaling (ISO "YYYY-MM-DD") */
  etterbetalingDate?: string
  /** ID til BudgetLine i budgetTemplate hvis etterbetalingen er bokført */
  etterbetalingBudgetLineId?: string
}
```

- [ ] **Steg 2: Typecheck**

```bash
npm run typecheck
```

Forventet: ingen feil (nye felt er valgfrie, bryter ingenting).

- [ ] **Steg 3: Commit**

```bash
git add src/types/economy.ts
git commit -m "feat(salary): utvid LonnsoppgjorRecord med etterbetalingDate og etterbetalingBudgetLineId"
```

---

### Task 2: Legg til store-handlinger for etterbetaling

**Files:**
- Modify: `src/application/useEconomyStore.ts`

- [ ] **Steg 1: Legg til `bookEtterbetaling`-handling i store-interfacet**

Finn der de andre `lonnsoppgjor`-handlingene er definert (rundt linje 160) og legg til:

```ts
bookEtterbetaling: (recordId: string, etterbetalingDate: string) => void
removeEtterbetalingBooking: (recordId: string) => void
```

- [ ] **Steg 2: Implementer `bookEtterbetaling`**

Finn der `addLonnsoppgjor` er implementert (rundt linje 671) og legg til etter:

```ts
bookEtterbetaling: (recordId, etterbetalingDate) =>
  set((s) => {
    const record = s.lonnsoppgjor.find((r) => r.id === recordId)
    if (!record || record.forrigeMaanedslonn <= 0) return s

    const effDate = new Date(record.effectiveDate)
    const payDate = new Date(etterbetalingDate)
    const months =
      (payDate.getFullYear() * 12 + payDate.getMonth()) -
      (effDate.getFullYear() * 12 + effDate.getMonth())
    if (months <= 0) return s

    const diff = record.maanedslonn - record.forrigeMaanedslonn
    const amount = Math.round(diff * months)

    const payMonth = payDate.getMonth() + 1   // 1-12
    const payYear = payDate.getFullYear()

    const budgetLineId = crypto.randomUUID()
    const newLine: import('@/types/economy').BudgetLine = {
      id: budgetLineId,
      label: `Etterbetaling lønn ${payYear}`,
      category: 'annen_inntekt',
      amount,
      isRecurring: false,
      source: 'manual',
      isLocked: false,
      isVariable: false,
      specificMonth: payMonth,
      specificYear: payYear,
    }

    return {
      budgetTemplate: {
        ...s.budgetTemplate,
        lines: [...s.budgetTemplate.lines, newLine],
      },
      lonnsoppgjor: s.lonnsoppgjor.map((r) =>
        r.id === recordId
          ? { ...r, etterbetalingDate, etterbetalingBudgetLineId: budgetLineId }
          : r
      ),
    }
  }),

removeEtterbetalingBooking: (recordId) =>
  set((s) => {
    const record = s.lonnsoppgjor.find((r) => r.id === recordId)
    if (!record?.etterbetalingBudgetLineId) return s

    return {
      budgetTemplate: {
        ...s.budgetTemplate,
        lines: s.budgetTemplate.lines.filter(
          (l) => l.id !== record.etterbetalingBudgetLineId
        ),
      },
      lonnsoppgjor: s.lonnsoppgjor.map((r) =>
        r.id === recordId
          ? { ...r, etterbetalingDate: undefined, etterbetalingBudgetLineId: undefined }
          : r
      ),
    }
  }),
```

- [ ] **Steg 3: Eksporter handlingene fra `useActiveEconomyStore`**

Sjekk at `bookEtterbetaling` og `removeEtterbetalingBooking` er tilgjengelige via `useActiveEconomyStore` (følg mønsteret til `addLonnsoppgjor`).

- [ ] **Steg 4: Typecheck**

```bash
npm run typecheck
```

Forventet: ingen feil.

- [ ] **Steg 5: Commit**

```bash
git add src/application/useEconomyStore.ts
git commit -m "feat(salary): legg til bookEtterbetaling og removeEtterbetalingBooking i store"
```

---

### Task 3: Ren beregningsfunksjon for etterbetaling

**Files:**
- Modify: `src/pages/economy/SalaryPage.tsx` (legg til øverst i filen, ikke i domain)

Beregningen er enkel nok til å ligge som en hjelpefunksjon i SalaryPage.

- [ ] **Steg 1: Legg til `calcEtterbetaling`-funksjonen øverst i `SalaryPage.tsx`**

Legg til etter importene:

```ts
/** Beregner etterbetaling i kroner.
 *  months = antall måneder fra ikrafttredelse (inkl.) til utbetaling (ekskl.)
 *  Returnerer null hvis data mangler eller er ugyldig. */
function calcEtterbetaling(
  record: LonnsoppgjorRecord,
  etterbetalingDate: string,
): { months: number; amount: number } | null {
  if (record.forrigeMaanedslonn <= 0 || record.maanedslonn <= record.forrigeMaanedslonn) return null
  const effDate = new Date(record.effectiveDate)
  const payDate = new Date(etterbetalingDate)
  const months =
    (payDate.getFullYear() * 12 + payDate.getMonth()) -
    (effDate.getFullYear() * 12 + effDate.getMonth())
  if (months <= 0) return null
  const amount = Math.round((record.maanedslonn - record.forrigeMaanedslonn) * months)
  return { months, amount }
}
```

- [ ] **Steg 2: Typecheck**

```bash
npm run typecheck
```

- [ ] **Steg 3: Commit**

```bash
git add src/pages/economy/SalaryPage.tsx
git commit -m "feat(salary): legg til calcEtterbetaling-hjelpefunksjon"
```

---

### Task 4: UI — Etterbetaling-panel i `LonnsoppgjorSection`

**Files:**
- Modify: `src/pages/economy/SalaryPage.tsx` — `LonnsoppgjorSection`-komponenten og props

- [ ] **Steg 1: Legg til `onBookEtterbetaling` og `onRemoveEtterbetalingBooking` i props**

```ts
// Oppdater props-interfacet til LonnsoppgjorSection
{
  records: LonnsoppgjorRecord[]
  hasSlips: boolean
  onAdd: (r: LonnsoppgjorRecord) => void
  onUpdate: (id: string, updates: Partial<LonnsoppgjorRecord>) => void
  onRemove: (id: string) => void
  onDerive: () => void
  onBookEtterbetaling: (recordId: string, etterbetalingDate: string) => void
  onRemoveEtterbetalingBooking: (recordId: string) => void
}
```

- [ ] **Steg 2: Koble handlingene i kallet på `LonnsoppgjorSection` (ca. linje 298)**

```tsx
<LonnsoppgjorSection
  records={lonnsoppgjor}
  hasSlips={...}
  onAdd={addLonnsoppgjor}
  onUpdate={updateLonnsoppgjor}
  onRemove={removeLonnsoppgjor}
  onDerive={deriveLonnsoppgjorFromSlips}
  onBookEtterbetaling={bookEtterbetaling}
  onRemoveEtterbetalingBooking={removeEtterbetalingBooking}
/>
```

Husk å hente `bookEtterbetaling` og `removeEtterbetalingBooking` fra `useActiveEconomyStore`.

- [ ] **Steg 3: Legg til etterbetaling-panel for `forventet`-oppgjør i listen**

I `LonnsoppgjorSection`, finn der `records` vises (den sorterte listen). Under hvert `forventet`-oppgjør, legg til denne seksjonen:

```tsx
{r.source === 'forventet' && (
  <EtterbetalingPanel
    record={r}
    onBook={onBookEtterbetaling}
    onRemove={onRemoveEtterbetalingBooking}
  />
)}
```

- [ ] **Steg 4: Implementer `EtterbetalingPanel`-komponenten**

Legg til som en ny funksjon i `SalaryPage.tsx`:

```tsx
function EtterbetalingPanel({
  record,
  onBook,
  onRemove,
}: {
  record: LonnsoppgjorRecord
  onBook: (recordId: string, date: string) => void
  onRemove: (recordId: string) => void
}) {
  const [date, setDate] = useState(record.etterbetalingDate ?? '')
  const preview = date ? calcEtterbetaling(record, date) : null
  const isBooked = !!record.etterbetalingBudgetLineId

  return (
    <div className="mt-2 border-t border-border/50 pt-2 space-y-2">
      <p className="text-xs font-medium text-muted-foreground">Etterbetaling</p>

      {isBooked ? (
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            Bokført for{' '}
            {new Date(record.etterbetalingDate!).toLocaleDateString('no-NO', { month: 'long', year: 'numeric' })}
            {preview && (
              <span className="ml-1 font-medium text-foreground">
                — {preview.amount.toLocaleString('no-NO')} kr ({preview.months} mnd)
              </span>
            )}
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-xs text-destructive hover:text-destructive"
            onClick={() => { onRemove(record.id); setDate('') }}
          >
            Fjern
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-0.5">
            <Label className="text-xs">Forventet utbetalingsdato</Label>
            <Input
              type="date"
              className="h-7 text-xs w-36"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          {preview && (
            <div className="text-xs text-muted-foreground pb-1">
              ≈{' '}
              <span className="font-medium text-foreground">
                {preview.amount.toLocaleString('no-NO')} kr
              </span>
              {' '}({preview.months} mnd × {(record.maanedslonn - record.forrigeMaanedslonn).toLocaleString('no-NO')} kr/mnd)
            </div>
          )}
          {preview && (
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={() => onBook(record.id, date)}
            >
              Legg i budsjett
            </Button>
          )}
        </div>
      )}

      {date && !preview && record.forrigeMaanedslonn <= 0 && (
        <p className="text-xs text-muted-foreground">
          Fyll inn forrige månedslønn for å beregne etterbetaling.
        </p>
      )}
    </div>
  )
}
```

- [ ] **Steg 5: Typecheck**

```bash
npm run typecheck
```

Forventet: ingen feil.

- [ ] **Steg 6: Commit**

```bash
git add src/pages/economy/SalaryPage.tsx
git commit -m "feat(salary): etterbetaling-panel for forventede lønnsoppgjør"
```

---

### Task 5: Manuell test og push

- [ ] **Steg 1: Start dev-server og test flyten**

```bash
npm run dev
```

Åpne `http://localhost:5173` → Lønn-fanen → Legg til lønnsoppgjør (type: Forventet, ny lønn, forrige lønn).

Verifiser:
1. Etterbetaling-panel vises under forventet-oppgjøret
2. Velg utbetalingsdato → beregnet beløp vises med riktig mnd-antall
3. Klikk «Legg i budsjett» → panelet viser «Bokført»-tilstand
4. Gå til Budsjett-fanen → etterbetalingen vises under `annen_inntekt` for riktig måned
5. «Fjern»-knappen fjerner bokføringen fra budsjettet

- [ ] **Steg 2: Push**

```bash
git push
```
