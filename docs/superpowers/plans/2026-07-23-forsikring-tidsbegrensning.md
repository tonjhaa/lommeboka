# Forsikring — start- og sluttdato — Implementeringsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gi `InsuranceEntry` en `activeFrom`/`activeUntil`-månedsgrense (samme mønster som `SubscriptionEntry.activeUntil`) slik at en forsikring automatisk slutter å telle i budsjettet fra og med måneden etter sluttdatoen, uten en manuell «avslutt»-handling.

**Architecture:** Rene, beregnede grenser — ingen lagret status å vedlikeholde. To nye valgfrie felt på typen, en utvidelse av den eksisterende `insMonthAmount`-beregningen i budsjettmotoren, og et nytt UI-mønster i Abo & Fors.-siden som speiler det abonnement allerede har (`activeSubscriptions`/`expiredSubscriptions`).

**Tech Stack:** React 19 + TypeScript, Zustand (`useEconomyStore`), Vitest.

Spec: `docs/superpowers/specs/2026-07-23-forsikring-tidsbegrensning-design.md`

---

### Task 1: Datamodell — legg til activeFrom/activeUntil på InsuranceEntry

**Files:**
- Modify: `src/types/economy.ts:548-564`

- [ ] **Step 1: Legg til de to nye valgfrie feltene**

Åpne `src/types/economy.ts` og finn `InsuranceEntry` (linje 548-564):

```ts
export interface InsuranceEntry {
  id: string
  provider: string
  type: string
  yearlyAmounts: {
    [year: string]: number
  }
  isActive: boolean
  renewalMonth?: number   // 1–12
  /** 'avsluttet' = soft-slettet, vises i historikk */
  status?: 'aktiv' | 'avsluttet'
  cancelledDate?: string  // "YYYY-MM-DD"
  /** Bonus-nivå i % (f.eks. 70 = 70% bonus) */
  bonus?: number
  /** Leverandørhistorikk */
  providerHistory?: InsuranceProviderHistory[]
  /** Første aktive måned ("YYYY-MM"). Udefinert = har alltid vært aktiv. */
  activeFrom?: string
  /** Siste aktive måned ("YYYY-MM"). Udefinert = løpende. */
  activeUntil?: string
}
```

Legg de to nye feltene (`activeFrom`, `activeUntil`) til slutt i interfacet, etter `providerHistory`.

- [ ] **Step 2: Verifiser at typen kompilerer**

Run: `npm run build`
Expected: Ingen TypeScript-feil (feltene er valgfrie — ingen eksisterende kode bruker `InsuranceEntry` på en måte som bryter med additive valgfrie felt).

- [ ] **Step 3: Commit**

```bash
git add src/types/economy.ts
git commit -m "feat(forsikring): legg til activeFrom/activeUntil på InsuranceEntry"
```

---

### Task 2: Budsjettmotor — insMonthAmount respekterer activeFrom/activeUntil

**Files:**
- Modify: `src/domain/economy/budgetTableComputer.ts:116-122`
- Test: `src/domain/economy/__tests__/budgetTableComputer.test.ts`

- [ ] **Step 1: Skriv de feilende testene**

Åpne `src/domain/economy/__tests__/budgetTableComputer.test.ts` og legg til nederst i filen (etter siste `describe`-blokk), importer `insMonthAmount` sammen med `computeBudgetTable` på linje 2:

```ts
import { computeBudgetTable, insMonthAmount } from '../budgetTableComputer'
```

Legg til denne nye describe-blokken på slutten av filen:

```ts
describe('insMonthAmount — activeFrom/activeUntil', () => {
  function makeIns(overrides: Partial<import('@/types/economy').InsuranceEntry> = {}): import('@/types/economy').InsuranceEntry {
    return {
      id: 'ins-1',
      provider: 'Gjensidige',
      type: 'MC',
      yearlyAmounts: { '2026': 7200 },
      isActive: true,
      ...overrides,
    }
  }

  it('teller vanlig månedsbeløp når ingen grenser er satt', () => {
    const ins = makeIns()
    expect(insMonthAmount(ins, 2026, 3)).toBe(600) // 7200 / 12
  })

  it('returnerer 0 før activeFrom', () => {
    const ins = makeIns({ activeFrom: '2026-06' })
    expect(insMonthAmount(ins, 2026, 3)).toBe(0)
    expect(insMonthAmount(ins, 2026, 6)).toBe(600)
  })

  it('returnerer 0 etter activeUntil', () => {
    const ins = makeIns({ activeUntil: '2026-06' })
    expect(insMonthAmount(ins, 2026, 6)).toBe(600)
    expect(insMonthAmount(ins, 2026, 7)).toBe(0)
  })

  it('kombinerer activeFrom og activeUntil til et vindu', () => {
    const ins = makeIns({ activeFrom: '2026-03', activeUntil: '2026-08' })
    expect(insMonthAmount(ins, 2026, 2)).toBe(0)
    expect(insMonthAmount(ins, 2026, 5)).toBe(600)
    expect(insMonthAmount(ins, 2026, 9)).toBe(0)
  })

  it('cancelledDate er strengest hvis den inntreffer før activeUntil', () => {
    const ins = makeIns({ activeUntil: '2026-12', cancelledDate: '2026-05-15' })
    expect(insMonthAmount(ins, 2026, 5)).toBe(600)
    expect(insMonthAmount(ins, 2026, 6)).toBe(0)
  })
})
```

- [ ] **Step 2: Kjør testene og verifiser at de feiler**

Run: `npx vitest run src/domain/economy/__tests__/budgetTableComputer.test.ts`
Expected: FAIL — `insMonthAmount` er ikke eksportert ennå (`insMonthAmount is not a function` eller tilsvarende importfeil), og selv om den var eksportert ville "returnerer 0 før activeFrom"/"etter activeUntil"-testene feile fordi funksjonen ikke sjekker disse feltene ennå.

- [ ] **Step 3: Eksporter og utvid insMonthAmount**

I `src/domain/economy/budgetTableComputer.ts`, endre linje 116-122 fra:

```ts
function insMonthAmount(ins: InsuranceEntry, year: number, month: number): number {
  if (ins.cancelledDate) {
    const monthKey = `${year}-${String(month).padStart(2, '0')}`
    if (monthKey > ins.cancelledDate.slice(0, 7)) return 0
  }
  return (ins.yearlyAmounts[String(year)] ?? 0) / 12
}
```

til:

```ts
export function insMonthAmount(ins: InsuranceEntry, year: number, month: number): number {
  const key = `${year}-${String(month).padStart(2, '0')}`
  if (ins.activeFrom && key < ins.activeFrom) return 0
  if (ins.activeUntil && key > ins.activeUntil) return 0
  if (ins.cancelledDate && key > ins.cancelledDate.slice(0, 7)) return 0
  return (ins.yearlyAmounts[String(year)] ?? 0) / 12
}
```

(Kun endringen fra `function` til `export function`, og de to nye grense-sjekkene før `cancelledDate`-sjekken — resten er identisk oppførsel.)

- [ ] **Step 4: Kjør testene og verifiser at de passerer**

Run: `npx vitest run src/domain/economy/__tests__/budgetTableComputer.test.ts`
Expected: PASS — alle tester i filen, inkludert de 5 nye.

- [ ] **Step 5: Full regresjon**

Run: `npm run build && npm run test`
Expected: Build uten feil, alle tester grønne (ingen andre steder i kodebasen kaller `insMonthAmount` direkte, så dette er en additiv endring).

- [ ] **Step 6: Commit**

```bash
git add src/domain/economy/budgetTableComputer.ts src/domain/economy/__tests__/budgetTableComputer.test.ts
git commit -m "feat(forsikring): insMonthAmount respekterer activeFrom/activeUntil"
```

---

### Task 3: UI — datofelt i Rediger/Ny forsikring-skjemaene

**Files:**
- Modify: `src/pages/economy/SubscriptionsPage.tsx:307-312` (kallsted for EditInsuranceForm)
- Modify: `src/pages/economy/SubscriptionsPage.tsx:814-902` (EditInsuranceForm)
- Modify: `src/pages/economy/SubscriptionsPage.tsx:961-1008` (AddInsuranceForm)

Ingen egen test her — dette er ren skjema-/JSX-kode uten forgrening som prosjektet allerede har som konvensjon å ikke enhetsteste (ingen komponent-rendering-tester i dette prosjektet). Verifiseres manuelt i dev-server i Step 4.

- [ ] **Step 1: Send currentMonthKey inn til EditInsuranceForm**

I `SubscriptionsPage.tsx`, finn kallstedet til `EditInsuranceForm` (linje 307-312):

```tsx
                          <EditInsuranceForm
                            ins={ins}
                            currentYear={currentYear}
                            onSave={(updates) => { updateInsurance(ins.id, updates); setEditingInsId(null) }}
                            onCancel={() => setEditingInsId(null)}
                          />
```

Legg til `currentMonthKey={currentMonthKey}`:

```tsx
                          <EditInsuranceForm
                            ins={ins}
                            currentYear={currentYear}
                            currentMonthKey={currentMonthKey}
                            onSave={(updates) => { updateInsurance(ins.id, updates); setEditingInsId(null) }}
                            onCancel={() => setEditingInsId(null)}
                          />
```

- [ ] **Step 2: Utvid EditInsuranceForm med de to datofeltene**

Finn `EditInsuranceForm` (linje 814-902). Endre props-typen og state (linje 814-830):

```tsx
function EditInsuranceForm({
  ins,
  currentYear,
  currentMonthKey,
  onSave,
  onCancel,
}: {
  ins: InsuranceEntry
  currentYear: string
  currentMonthKey: string
  onSave: (updates: Partial<InsuranceEntry>) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState({
    provider: ins.provider,
    type: ins.type,
    year: currentYear,
    yearlyAmount: ins.yearlyAmounts[currentYear] ?? 0,
    activeFrom: ins.activeFrom ?? '',
    activeUntil: ins.activeUntil ?? '',
  })
```

Legg til to nye felt i grid-en (linje 846-875), rett etter «Årsbeløp»-feltet (etter linjen som slutter med `</div>` for `yearlyAmount`, før den lukkende `</div>` for `grid-cols-2`):

```tsx
        <div className="space-y-1">
          <Label className="text-xs">Aktiv fra (valgfritt)</Label>
          <Input
            type="month"
            className="h-8 text-xs"
            value={form.activeFrom}
            onChange={(e) => setForm((f) => ({ ...f, activeFrom: e.target.value }))}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Aktiv t.o.m. (valgfritt)</Label>
          <Input
            type="month"
            className="h-8 text-xs"
            min={currentMonthKey}
            value={form.activeUntil}
            onChange={(e) => setForm((f) => ({ ...f, activeUntil: e.target.value }))}
          />
        </div>
```

Oppdater `onSave`-kallet (linje 889-896) til å inkludere de nye feltene:

```tsx
          onClick={() =>
            onSave({
              provider: form.provider.trim(),
              type: form.type.trim(),
              yearlyAmounts: { ...ins.yearlyAmounts, [form.year]: form.yearlyAmount },
              activeFrom: form.activeFrom || undefined,
              activeUntil: form.activeUntil || undefined,
            })
          }
```

- [ ] **Step 3: Utvid AddInsuranceForm med de to datofeltene**

Finn `AddInsuranceForm` (linje 961-1008). Legg til `currentMonthKey` lokalt (samme mønster som `AddSubscriptionForm` linje 716-717) og de to nye feltene i form-state (linje 962-963):

```tsx
function AddInsuranceForm({ onSave, onCancel }: { onSave: (ins: InsuranceEntry) => void; onCancel: () => void }) {
  const currentYear = String(new Date().getFullYear())
  const now = new Date()
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const [form, setForm] = useState({ provider: '', type: '', yearlyAmount: 0, activeFrom: '', activeUntil: '' })
```

Legg til de to input-feltene i grid-en (linje 969-986), rett etter «Årsbeløp»-feltet:

```tsx
          <div className="space-y-1">
            <Label className="text-xs">Aktiv fra (valgfritt)</Label>
            <Input
              type="month"
              className="h-8 text-xs"
              value={form.activeFrom}
              onChange={(e) => setForm((f) => ({ ...f, activeFrom: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Aktiv t.o.m. (valgfritt)</Label>
            <Input
              type="month"
              className="h-8 text-xs"
              min={currentMonthKey}
              value={form.activeUntil}
              onChange={(e) => setForm((f) => ({ ...f, activeUntil: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">La stå tom for løpende forsikring</p>
          </div>
```

Oppdater `onSave`-kallet (linje 992-1000):

```tsx
            onClick={() =>
              onSave({
                id: crypto.randomUUID(),
                provider: form.provider.trim(),
                type: form.type.trim(),
                yearlyAmounts: { [currentYear]: form.yearlyAmount },
                isActive: true,
                ...(form.activeFrom ? { activeFrom: form.activeFrom } : {}),
                ...(form.activeUntil ? { activeUntil: form.activeUntil } : {}),
              })
            }
```

- [ ] **Step 4: Verifiser manuelt i dev-server**

Run: `npm run dev`, åpne Abo & Fors.-siden i nettleseren. Åpne «Legg til forsikring», bekreft at de to nye datofeltene vises og kan fylles ut. Rediger en eksisterende forsikring (blyant-ikonet), bekreft at feltene vises forhåndsutfylt og kan lagres.

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: Ingen TypeScript-feil.

- [ ] **Step 6: Commit**

```bash
git add src/pages/economy/SubscriptionsPage.tsx
git commit -m "feat(forsikring): datofelt for aktiv fra/til i rediger- og ny-skjema"
```

---

### Task 4: Pure helper — isInsuranceExpired

**Files:**
- Modify: `src/pages/economy/SubscriptionsPage.tsx` (etter `monthsRemaining`, linje 453-457)
- Test: `src/pages/economy/__tests__/SubscriptionsPage.test.ts` (ny fil)

- [ ] **Step 1: Skriv den feilende testen**

Opprett `src/pages/economy/__tests__/SubscriptionsPage.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { isInsuranceExpired } from '../SubscriptionsPage'
import type { InsuranceEntry } from '@/types/economy'

function makeIns(overrides: Partial<InsuranceEntry> = {}): InsuranceEntry {
  return {
    id: 'ins-1',
    provider: 'Gjensidige',
    type: 'MC',
    yearlyAmounts: {},
    isActive: true,
    ...overrides,
  }
}

describe('isInsuranceExpired', () => {
  it('er false når activeUntil ikke er satt', () => {
    expect(isInsuranceExpired(makeIns(), '2026-07')).toBe(false)
  })

  it('er false når activeUntil er inneværende eller fremtidig måned', () => {
    expect(isInsuranceExpired(makeIns({ activeUntil: '2026-07' }), '2026-07')).toBe(false)
    expect(isInsuranceExpired(makeIns({ activeUntil: '2026-12' }), '2026-07')).toBe(false)
  })

  it('er true når activeUntil er en tidligere måned', () => {
    expect(isInsuranceExpired(makeIns({ activeUntil: '2026-06' }), '2026-07')).toBe(true)
  })
})
```

- [ ] **Step 2: Kjør testen og verifiser at den feiler**

Run: `npx vitest run src/pages/economy/__tests__/SubscriptionsPage.test.ts`
Expected: FAIL — `isInsuranceExpired` finnes ikke ennå (importfeil).

- [ ] **Step 3: Implementer isInsuranceExpired**

I `SubscriptionsPage.tsx`, legg til rett etter `monthsRemaining`-funksjonen (linje 453-457):

```ts
export function isInsuranceExpired(ins: InsuranceEntry, currentMonthKey: string): boolean {
  return !!ins.activeUntil && ins.activeUntil < currentMonthKey
}
```

- [ ] **Step 4: Kjør testen og verifiser at den passerer**

Run: `npx vitest run src/pages/economy/__tests__/SubscriptionsPage.test.ts`
Expected: PASS — alle 3 tester.

- [ ] **Step 5: Commit**

```bash
git add src/pages/economy/SubscriptionsPage.tsx src/pages/economy/__tests__/SubscriptionsPage.test.ts
git commit -m "feat(forsikring): isInsuranceExpired ren hjelpefunksjon"
```

---

### Task 5: UI — utløpte forsikringer-seksjon, badge og oppdaterte totaler

**Files:**
- Modify: `src/pages/economy/SubscriptionsPage.tsx:63-66` (totaler)
- Modify: `src/pages/economy/SubscriptionsPage.tsx:288-301` (hovedliste-filter)
- Modify: `src/pages/economy/SubscriptionsPage.tsx:337-338` (badge på rad)
- Modify: `src/pages/economy/SubscriptionsPage.tsx` (ny seksjon etter linje 444)

Bygger videre på `isInsuranceExpired` fra Task 4. Ren UI-forgrening — verifiseres manuelt (samme begrunnelse som Task 3).

- [ ] **Step 1: Beregn activeInsurances/expiredInsurances og oppdater totalen**

Finn linje 63-66:

```ts
  const yearlyInsTotal = insurances
    .filter((i) => i.isActive)
    .reduce((s, ins) => s + (ins.yearlyAmounts[currentYear] ?? 0), 0)
  const monthlyInsTotal = yearlyInsTotal / 12
```

Erstatt med:

```ts
  const activeInsurances = insurances.filter((i) => i.isActive && !isInsuranceExpired(i, currentMonthKey))
  const expiredInsurances = insurances.filter((i) => i.isActive && isInsuranceExpired(i, currentMonthKey))
  const yearlyInsTotal = activeInsurances
    .reduce((s, ins) => s + (ins.yearlyAmounts[currentYear] ?? 0), 0)
  const monthlyInsTotal = yearlyInsTotal / 12
```

- [ ] **Step 2: Bruk activeInsurances i hovedlisten**

Finn linje 288 og 301 (begge bruker `insurances.filter(i => i.status !== 'avsluttet')`). Erstatt begge forekomstene med `activeInsurances`:

Linje 288:
```tsx
      {activeInsurances.length > 0 && (
```

Linje 301:
```tsx
                {activeInsurances.map((ins) => {
```

- [ ] **Step 3: Legg til badge på forsikringsraden**

Finn linje 325-339 (raden som viser `ins.type`):

```tsx
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            {allYears.length > 1 && (
                              <button
                                className="text-muted-foreground hover:text-foreground"
                                onClick={() => setExpandedInsId(isExpanded ? null : ins.id)}
                              >
                                {isExpanded
                                  ? <ChevronDown className="h-3 w-3" />
                                  : <ChevronRight className="h-3 w-3" />}
                              </button>
                            )}
                            {ins.type}
                          </div>
                        </td>
```

Erstatt med (legger til badge under typen, samme mønster som `SubscriptionRow`):

```tsx
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            {allYears.length > 1 && (
                              <button
                                className="text-muted-foreground hover:text-foreground"
                                onClick={() => setExpandedInsId(isExpanded ? null : ins.id)}
                              >
                                {isExpanded
                                  ? <ChevronDown className="h-3 w-3" />
                                  : <ChevronRight className="h-3 w-3" />}
                              </button>
                            )}
                            {ins.type}
                          </div>
                          {ins.activeUntil && (
                            <span className="text-xs text-muted-foreground">
                              {monthsRemaining(ins.activeUntil, currentMonthKey) === 0
                                ? 'Siste måned'
                                : `Utløper om ${monthsRemaining(ins.activeUntil, currentMonthKey)} mnd`}
                            </span>
                          )}
                        </td>
```

- [ ] **Step 4: Legg til «Utløpte forsikringer»-seksjonen**

Finn den lukkende `)}`  for hovedlistens `<Card>` (rett etter `</table>` `</CardContent>` `</Card>` som avslutter den store forsikringstabellen, altså rett etter linje 444 `)}` og før den ytre `</div>` på linje 445). Legg til denne nye blokken der, etter hovedlisten og før filens avsluttende `</div>`:

```tsx
      {expiredInsurances.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-2">Utløpte forsikringer</p>
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm opacity-50">
                <tbody>
                  {expiredInsurances.map((ins) => (
                    <tr key={ins.id} className="border-b border-border/50 last:border-0">
                      <td className="px-3 py-2">
                        <p>{ins.type}</p>
                        <span className="text-xs text-muted-foreground">Utløpt {ins.activeUntil}</span>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{ins.provider}</td>
                      <td className="px-3 py-2 text-right font-mono">
                        {fmtNOK(ins.yearlyAmounts[currentYear] ?? 0)}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex gap-1 justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-muted-foreground"
                            onClick={() => updateInsurance(ins.id, { activeUntil: undefined })}
                            title="Fjern sluttdato (gjør løpende igjen)"
                          >
                            <ToggleRight className="h-3.5 w-3.5 text-green-500" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-red-400"
                            onClick={() => removeInsurance(ins.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}
```

- [ ] **Step 5: Verifiser manuelt i dev-server**

Run: `npm run dev`. Rediger en forsikring, sett «Aktiv t.o.m.» til forrige måned, lagre. Bekreft: raden forsvinner fra hovedlisten og dukker opp i den nye «Utløpte forsikringer»-seksjonen, summen i «Forsikringer»-kortet oppdateres til å ekskludere den. Sett «Aktiv t.o.m.» til neste måned i stedet — bekreft at «Utløper om 1 mnd»-badge vises i hovedlisten.

- [ ] **Step 6: Full regresjon**

Run: `npm run build && npm run test`
Expected: Build uten feil, alle tester grønne.

- [ ] **Step 7: Commit**

```bash
git add src/pages/economy/SubscriptionsPage.tsx
git commit -m "feat(forsikring): utløpte forsikringer-seksjon, badge og oppdaterte totaler"
```

---

## Selv-gjennomgang (utført av planforfatter)

- **Spec-dekning:** Datamodell → Task 1. Budsjettmotor → Task 2. UI-redigering av datoer → Task 3. Automatisk utløpsdeteksjon (paritet med abonnement) → Task 4 + 5. Alle spec-krav har en task.
- **Plassholder-skann:** Ingen TBD/TODO — alle steg har komplett kode.
- **Type-konsistens:** `activeFrom`/`activeUntil` (Task 1) brukes med identisk navn og `"YYYY-MM"`-format i Task 2 (`insMonthAmount`), Task 3 (skjema-state) og Task 4/5 (`isInsuranceExpired`). `currentMonthKey` (allerede definert i komponenten, linje 50) trådes gjennom som prop til `EditInsuranceForm` i Task 3 og brukes konsekvent i Task 4/5.
