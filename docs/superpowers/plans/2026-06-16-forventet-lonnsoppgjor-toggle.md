# Forventet lønnsoppgjør-toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La brukeren slå et forventet (antatt) lønnsoppgjør av/på i budsjettprognosen, per oppgjør, inaktivt som standard, med indikator i både Lønn- og Budsjett-fanen.

**Architecture:** Et nytt valgfritt felt `activeInProjection` på `LonnsoppgjorRecord` gates ett sted i prognosemotoren (`computeBudgetTable`). UI-en i Lønn- og Budsjett-fanen leser/setter feltet via eksisterende `updateLonnsoppgjor`. Persist-migrering slår av eksisterende forventede oppgjør.

**Tech Stack:** React 19 + TypeScript (strict), Zustand persist, Vitest, Tailwind v4.

**VIKTIG byggsjekk:** Bruk `npm run typecheck` (= `tsc -b`) før commit — `npx tsc --noEmit` fanger ikke `noUnusedLocals` i dette composite-oppsettet.

---

### Task 1: Gate forventet oppgjør i prognosemotoren (TDD)

**Files:**
- Modify: `src/types/economy.ts:433`
- Modify: `src/domain/economy/budgetTableComputer.ts:185`
- Test: `src/domain/economy/__tests__/budgetTableComputer.test.ts`

- [ ] **Step 1: Skriv de feilende testene**

Legg til nederst i `src/domain/economy/__tests__/budgetTableComputer.test.ts` (etter siste `describe`-blokk, før filslutt):

```ts
describe('computeBudgetTable — forventet lønnsoppgjør toggle', () => {
  it('forventet med activeInProjection=true brukes i prognosen', () => {
    const data = compute({ lonnsoppgjor: [mkOppgjor({ effectiveDate: '2026-05-01', maanedslonn: 55_000, source: 'forventet', activeInProjection: true })] })
    const lonn = data.sections.find((s) => s.key === 'INNTEKTER')!.rows.find((r) => r.id === 'lonn')!
    expect(lonn.cells[5].budget).toBe(55_000) // juni
  })

  it('forventet med activeInProjection=false ekskluderes (faller til grunnlønn)', () => {
    const data = compute({ lonnsoppgjor: [mkOppgjor({ effectiveDate: '2026-05-01', maanedslonn: 55_000, source: 'forventet', activeInProjection: false })] })
    const lonn = data.sections.find((s) => s.key === 'INNTEKTER')!.rows.find((r) => r.id === 'lonn')!
    expect(lonn.cells[5].budget).toBe(50_000) // profile.baseMonthly
  })

  it('forventet uten activeInProjection (undefined) ekskluderes', () => {
    const data = compute({ lonnsoppgjor: [mkOppgjor({ effectiveDate: '2026-05-01', maanedslonn: 55_000, source: 'forventet' })] })
    const lonn = data.sections.find((s) => s.key === 'INNTEKTER')!.rows.find((r) => r.id === 'lonn')!
    expect(lonn.cells[5].budget).toBe(50_000)
  })

  it('slip/manual brukes alltid uavhengig av flagget', () => {
    const data = compute({ lonnsoppgjor: [mkOppgjor({ effectiveDate: '2026-05-01', maanedslonn: 55_000, source: 'manual' })] })
    const lonn = data.sections.find((s) => s.key === 'INNTEKTER')!.rows.find((r) => r.id === 'lonn')!
    expect(lonn.cells[5].budget).toBe(55_000)
  })
})
```

- [ ] **Step 2: Kjør testene og se at de feiler**

Run: `npx vitest run src/domain/economy/__tests__/budgetTableComputer.test.ts`
Expected: FAIL — TypeScript-feil på `activeInProjection` (finnes ikke på `LonnsoppgjorRecord`) og/eller assertion-feil på den ekskluderte casen (får 55 000, forventer 50 000).

- [ ] **Step 3: Legg til feltet på typen**

I `src/types/economy.ts`, rett etter linje 433 (`  source: 'slip' | 'manual' | 'forventet'`), legg til:

```ts
  /** Kun relevant for source:'forventet'. Absent/false = ekskludert fra
   *  budsjettprognosen, true = inkludert. slip/manual brukes alltid. */
  activeInProjection?: boolean
```

- [ ] **Step 4: Endre filteret i prognosemotoren**

I `src/domain/economy/budgetTableComputer.ts`, erstatt linje 185:

```ts
    .filter((r) => r.maanedslonn > 0)
```

med:

```ts
    .filter((r) => r.maanedslonn > 0 && (r.source !== 'forventet' || r.activeInProjection === true))
```

- [ ] **Step 5: Kjør testene og se at de passerer**

Run: `npx vitest run src/domain/economy/__tests__/budgetTableComputer.test.ts`
Expected: PASS (alle 4 nye + eksisterende).

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: Ingen feil.

- [ ] **Step 7: Commit**

```bash
git add src/types/economy.ts src/domain/economy/budgetTableComputer.ts src/domain/economy/__tests__/budgetTableComputer.test.ts
git commit -m "feat(budget): gate forventet lønnsoppgjør i prognosen via activeInProjection"
```

---

### Task 2: Persist-migrering — slå av eksisterende forventede oppgjør

**Files:**
- Modify: `src/application/useEconomyStore.ts:1208` (version) og `:1210` (migrering)

- [ ] **Step 1: Bump persist-versjon**

I `src/application/useEconomyStore.ts`, endre linje 1208:

```ts
      version: 19,
```

til:

```ts
      version: 20,
```

- [ ] **Step 2: Legg til migreringsblokk**

I `src/application/useEconomyStore.ts`, rett etter linje 1210 (`        const state = persistedState as Record<string, unknown>`), legg til:

```ts
        // v19 → v20: forventede lønnsoppgjør slås AV i prognosen som standard.
        // Brukeren slår på de hen stoler på. (LonnsoppgjorRecord er allerede importert.)
        if (fromVersion < 20 && Array.isArray(state.lonnsoppgjor)) {
          state.lonnsoppgjor = (state.lonnsoppgjor as LonnsoppgjorRecord[]).map((r) =>
            r.source === 'forventet' ? { ...r, activeInProjection: false } : r,
          )
        }
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: Ingen feil (`LonnsoppgjorRecord` er importert i denne filen fra før).

- [ ] **Step 4: Verifiser at hele testsuiten fortsatt er grønn**

Run: `npx vitest run`
Expected: PASS (alle tester).

- [ ] **Step 5: Commit**

```bash
git add src/application/useEconomyStore.ts
git commit -m "feat(store): migrer forventede lønnsoppgjør til av-i-prognosen (v20)"
```

---

### Task 3: Lønn-fanen — av/på-bryter, badge og default

**Files:**
- Modify: `src/pages/economy/SalaryPage.tsx` (handleAdd ~970, pendingOppgjor ~188, row ~1176/1256/1181)

- [ ] **Step 1: Default for nye forventede oppgjør**

I `src/pages/economy/SalaryPage.tsx` `handleAdd` (rundt linje 970-979), erstatt `onAdd({ ... })`-objektet slik at det får med flagget for forventet. Bytt blokken:

```ts
    onAdd({
      id: crypto.randomUUID(),
      year: form.year,
      effectiveDate: form.effectiveDate,
      maanedslonn: form.maanedslonn,
      forrigeMaanedslonn: prev?.maanedslonn ?? 0,
      htaTillegg: form.htaTillegg,
      notes: form.notes,
      source: form.source,
    })
```

med:

```ts
    onAdd({
      id: crypto.randomUUID(),
      year: form.year,
      effectiveDate: form.effectiveDate,
      maanedslonn: form.maanedslonn,
      forrigeMaanedslonn: prev?.maanedslonn ?? 0,
      htaTillegg: form.htaTillegg,
      notes: form.notes,
      source: form.source,
      // Forventede oppgjør starter AV i prognosen — brukeren slår dem på selv
      ...(form.source === 'forventet' ? { activeInProjection: false } : {}),
    })
```

- [ ] **Step 2: La pendingOppgjor-banneret kun vise aktive forventede oppgjør**

I `src/pages/economy/SalaryPage.tsx` (rundt linje 188-189), erstatt:

```ts
  const pendingOppgjor = [...lonnsoppgjor]
    .filter(r => r.source === 'forventet' && r.maanedslonn > 0 && r.effectiveDate <= todayIso)
```

med:

```ts
  const pendingOppgjor = [...lonnsoppgjor]
    .filter(r => r.source === 'forventet' && r.activeInProjection === true && r.maanedslonn > 0 && r.effectiveDate <= todayIso)
```

- [ ] **Step 3: Row-styling basert på aktiv-tilstand**

I `src/pages/economy/SalaryPage.tsx`, finn linje 1176:

```ts
                const isForventet = r.source === 'forventet'
```

og erstatt med:

```ts
                const isForventet = r.source === 'forventet'
                const isActiveForventet = isForventet && r.activeInProjection === true
```

Erstatt deretter rad-className (linje 1180-1182):

```ts
                  <tr
                    className={`${!isForventet ? 'border-b border-border/40' : ''} ${isForventet ? 'opacity-70' : ''}`}
                  >
```

med:

```ts
                  <tr
                    className={`${!isForventet ? 'border-b border-border/40' : ''} ${isForventet && !isActiveForventet ? 'opacity-60' : ''}`}
                  >
```

- [ ] **Step 4: Legg til bryter + Aktiv/Inaktiv-badge i kilde-cellen**

I `src/pages/economy/SalaryPage.tsx`, i `<td>`-en med kilde-badgen (rundt linje 1256-1279), erstatt `<div className="flex items-center gap-1.5"> ... </div>` slik at den får bryter for forventet. Bytt åpningen og legg til toggle rett etter source-badgen — erstatt blokken:

```ts
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          r.source === 'slip' ? 'bg-green-900/30 text-green-400' :
                          r.source === 'forventet' ? 'bg-yellow-900/30 text-yellow-400' :
                          'bg-muted text-muted-foreground'
                        }`}>
                          {r.source === 'slip' ? 'slipp' : r.source === 'forventet' ? 'forventet' : 'manuelt'}
                        </span>
```

med:

```ts
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          r.source === 'slip' ? 'bg-green-900/30 text-green-400' :
                          r.source === 'forventet' ? 'bg-yellow-900/30 text-yellow-400' :
                          'bg-muted text-muted-foreground'
                        }`}>
                          {r.source === 'slip' ? 'slipp' : r.source === 'forventet' ? 'forventet' : 'manuelt'}
                        </span>
                        {isForventet && (
                          <button
                            onClick={() => onUpdate(r.id, { activeInProjection: !isActiveForventet })}
                            title={isActiveForventet ? 'Aktivt i budsjettprognosen — klikk for å slå av' : 'Ikke med i prognosen — klikk for å slå på'}
                            className={`text-xs px-1.5 py-0.5 rounded border transition-colors ${
                              isActiveForventet
                                ? 'border-green-500/40 text-green-400 bg-green-500/10 hover:bg-green-500/20'
                                : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted/40'
                            }`}
                          >
                            {isActiveForventet ? 'Aktiv i prognose' : 'Inaktiv'}
                          </button>
                        )}
```

(Resten av `<div>`-en — slip-vis-knappen og lukkende `</div>` — beholdes uendret.)

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: Ingen feil. (`onUpdate` er allerede en prop = `updateLonnsoppgjor`.)

- [ ] **Step 6: Manuell verifisering**

Run: `npm run dev` og åpne Lønn-fanen → Lønnsoppgjør.
Expected: Forventede oppgjør viser «Inaktiv»-knapp og er dempet; klikk gjør dem grønne «Aktiv i prognose» og fjerner dempingen. Faktiske (slip/manual) rader har ingen bryter.

- [ ] **Step 7: Commit**

```bash
git add src/pages/economy/SalaryPage.tsx
git commit -m "feat(salary): av/på-bryter og Aktiv/Inaktiv-badge for forventet lønnsoppgjør"
```

---

### Task 4: Budsjett-fanen — indikator + hurtigbryter ved Månedslønn

**Files:**
- Modify: `src/pages/economy/BudgetPage.tsx` (store-destrukturering ~89, ny useMemo, banner etter ~409)

- [ ] **Step 1: Hent updateLonnsoppgjor fra storen**

I `src/pages/economy/BudgetPage.tsx`, i destruktureringen som slutter på linje 89-90, erstatt:

```ts
    absenceHireDate,
    lonnsoppgjor,
  } = useActiveEconomyStore()
```

med:

```ts
    absenceHireDate,
    lonnsoppgjor,
    updateLonnsoppgjor,
  } = useActiveEconomyStore()
```

- [ ] **Step 2: Finn relevant forventet oppgjør for det viste året**

I `src/pages/economy/BudgetPage.tsx`, rett etter linje 278 (`  const years = [activeYear - 1, activeYear, activeYear + 1].filter((y) => y >= minYear)`), legg til:

```ts
  // Forventet oppgjør som påvirker prognosen for det viste budsjettåret
  const forventetForYear = useMemo(() =>
    [...lonnsoppgjor]
      .filter((r) => r.source === 'forventet' && r.maanedslonn > 0 && Number(r.effectiveDate.slice(0, 4)) === activeYear)
      .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate))
      .at(-1) ?? null,
    [lonnsoppgjor, activeYear])
  const forventetAktiv = forventetForYear?.activeInProjection === true
  const forventetOkning = forventetForYear ? Math.round(forventetForYear.maanedslonn - (forventetForYear.forrigeMaanedslonn || 0)) : 0
  const forventetMnd = forventetForYear ? MONTH_SHORT[Number(forventetForYear.effectiveDate.slice(5, 7))] : ''
```

- [ ] **Step 3: Render indikator-banner etter toppbaren**

I `src/pages/economy/BudgetPage.tsx`, finn linje 409-411:

```ts
      </div>

      {/* ---- Oversikt view ---- */}
```

og erstatt med:

```ts
      </div>

      {/* ---- Forventet lønnsoppgjør-indikator ---- */}
      {forventetForYear && (
        <div className={`flex items-center gap-2 px-4 py-1.5 border-b text-xs shrink-0 ${
          forventetAktiv ? 'border-green-500/30 bg-green-500/5 text-green-300' : 'border-amber-500/30 bg-amber-500/5 text-amber-300'
        }`}>
          <span>
            {forventetAktiv
              ? `Forventet lønnsoppgjør PÅ i prognosen${forventetOkning > 0 ? ` (+${forventetOkning.toLocaleString('no-NO')} kr/mnd fra ${forventetMnd.toLowerCase()})` : ''}`
              : 'Forventet lønnsoppgjør AV — månedslønn projiseres uten oppgjøret'}
          </span>
          <button
            onClick={() => updateLonnsoppgjor(forventetForYear.id, { activeInProjection: !forventetAktiv })}
            className={`ml-auto px-2 py-0.5 rounded border transition-colors ${
              forventetAktiv
                ? 'border-green-500/40 hover:bg-green-500/20'
                : 'border-amber-500/40 hover:bg-amber-500/20'
            }`}
          >
            {forventetAktiv ? 'Slå av' : 'Slå på'}
          </button>
        </div>
      )}

      {/* ---- Oversikt view ---- */}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: Ingen feil. (`MONTH_SHORT` finnes i fila linje 21; `useMemo` er allerede importert.)

- [ ] **Step 5: Manuell verifisering**

Run: `npm run dev` og åpne Budsjett-fanen for inneværende år med et forventet oppgjør registrert.
Expected: Amber-banner «Forventet lønnsoppgjør AV …» med «Slå på». Klikk → grønn «… PÅ (+X kr/mnd fra mai)», Månedslønn-radens prognose for mai–des hopper opp til oppgjørsnivået. Toggle i Lønn-fanen reflekteres her og omvendt.

- [ ] **Step 6: Full build**

Run: `npm run build`
Expected: Bygger uten feil.

- [ ] **Step 7: Commit**

```bash
git add src/pages/economy/BudgetPage.tsx
git commit -m "feat(budget): indikator og hurtigbryter for forventet lønnsoppgjør i prognosen"
```

---

## Self-Review-notater

- **Spec-dekning:** Datamodell (T1), prognoselogikk (T1), store+migrering (T2), Lønn-fane-UI inkl. pendingOppgjor-filter og default (T3), Budsjett-indikator+bryter (T4), tester (T1). Alle spec-seksjoner dekket.
- **Typekonsistens:** Feltnavn `activeInProjection` brukt identisk i type, filter, migrering, SalaryPage og BudgetPage. `updateLonnsoppgjor`-signatur `(id, Partial<LonnsoppgjorRecord>)` matcher storen.
- **Default-semantikk:** `absent === false` håndteres av filteret (`r.activeInProjection === true`), så både nye records, migrerte records og importData-round-trip oppfører seg likt uten ekstra kode i importData.
