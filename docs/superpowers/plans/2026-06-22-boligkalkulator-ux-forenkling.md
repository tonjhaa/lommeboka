# Boligkalkulator UX-forenkling Implementeringsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gjøre boligkalkulatoren til én smart «essensiell»-side: ~4 essensielle felt + ett hovedsvar synlig, alt annet (boligdetaljer, husstand, avanserte lånevilkår inkl. kausjon, detaljkort) bak progressiv avsløring (`<details>`).

**Architecture:** Ren presentasjons-reorganisering. De tre skjemaene (PropertyForm/HouseholdForm/LoanForm) får en `section: 'essential' | 'advanced' | 'all'`-prop (default `'all'` = dagens oppførsel) som gater hvilke felt-blokker de rendrer. ScenarioFormPanel erstatter `<Tabs>` med essensielle felt + tre `<details>`-seksjoner. ResultsPanel beholder hovedsvaret (StatusBanner + MaxPurchaseCard) og kollapser detaljkortene i en `<details>`. Ingen endring i motor/store/hooks/felt — bare flyttet.

**Tech Stack:** React 19, TypeScript (strict), Tailwind v4, native `<details>` (kodebasens kollaps-mønster).

**Spec:** `docs/superpowers/specs/2026-06-22-boligkalkulator-ux-forenkling-design.md`
**Branch:** `feat/boligkalkulator-ux-forenkling`

**Konvensjoner:**
- TypeScript-sjekk: **`npm run typecheck`** (= `tsc -b`). `npx tsc --noEmit` fanger IKKE `noUnusedLocals`.
- Bygg: `npm run build`. Tester: `npm test`.
- Conventional commits. Avslutt med blank linje + `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

**Verifiserte fakta (mot faktisk kode):**
- Kollaps-mønster: kodebasen bruker native `<details>`/`<summary>` (se `ScenarioPage.tsx`, `EconomySettingsPage.tsx`). INGEN shadcn Collapsible. Bruk `<details>`.
- `PropertyForm` (143 l): felt = Eierform, Boligpris, Boligtype, Fellesgjeld, Fellesutgifter, Eiendomsskatt (sistnevnte betinget skjult for borettslag via `isAndel`).
- `HouseholdForm` (321 l): profil-bro øverst (Bruk min profil / Hent medsøker fra Partner + freshness-banner + bridge-summary), så `ApplicantFields(primary)`, så medsøker-Switch + `ApplicantFields(co)`, + barn/voksne/spedbarn. `ApplicantFields` rendrer Navn + Bruttoinntekt + Eksisterende gjeld (+ evt. mer).
- `LoanForm` (347+ l): EK-seksjon (betinget «per søker» når medsøker, ellers «Egenkapital»), gebyr-toggle, rente, løpetid, lånetype, ekstra utgifter, kausjon-seksjon (4 felt) + målpris.
- `ScenarioFormPanel` (138 l): header (label-redigering) + `<Tabs property/household/loan>` + `<MiniSummary>`-footer.
- `ResultsPanel` (~127–149): `<StatusBanner>`, `<MaxPurchaseCard>`, `<AffordabilityCard>`, grid(`<EquityCard>` + `<DebtRatioCard>`), `<SavingsGoalCard>`, så DistributionPlanSection + amortisering (lazy, egen toggle `showAmortization`).
- **Ingen** endring i `useAllCalculations`/`useCalculator`/`maxPurchase.ts`/stores. Eksisterende `calculator.test.ts`/`maxPurchase.test.ts` = funksjonsbevarings-sikring.

**Gating-idiom (brukes i alle skjema-tasks):**
```tsx
const showEssential = section === 'all' || section === 'essential'
const showAdvanced  = section === 'all' || section === 'advanced'
// rundt et essensielt felt-blokk:  {showEssential && ( ...eksisterende JSX... )}
// rundt et avansert felt-blokk:    {showAdvanced  && ( ...eksisterende JSX... )}
```
**Viktig:** dette er en REORGANISERING — flytt eksisterende felt-JSX inn i `{showEssential && (...)}` / `{showAdvanced && (...)}`-blokker. Ikke skriv om felt-logikk, ikke endre binding/onChange. `section='all'` (default) MÅ rendre nøyaktig som i dag.

---

### Task 1: `section`-prop på PropertyForm + LoanForm

**Files:**
- Modify: `src/components/calculator/PropertyForm.tsx`
- Modify: `src/components/calculator/LoanForm.tsx`

- [ ] **Step 1: PropertyForm — legg til section-prop**

I `PropertyForm`s `Props`: `section?: 'essential' | 'advanced' | 'all'`. I komponenten:
```tsx
export function PropertyForm({ scenario, section = 'all' }: Props) {
  // ...eksisterende...
  const showEssential = section === 'all' || section === 'essential'
  const showAdvanced = section === 'all' || section === 'advanced'
```
- **Essensiell:** Boligpris-blokken (`<Label htmlFor="price">…` + NumberInput) → wrap i `{showEssential && (...)}`.
- **Avansert:** Eierform, Boligtype, Fellesgjeld+Fellesutgifter-grid, Eiendomsskatt → wrap hver i `{showAdvanced && (...)}`. Behold `isAndel`-betingelsen på Eiendomsskatt INNI `{showAdvanced && ...}`.

- [ ] **Step 2: LoanForm — legg til section-prop**

I `LoanForm`s `Props`: `section?: 'essential' | 'advanced' | 'all'`, default `'all'`. `showEssential`/`showAdvanced` som over.
- **Essensiell:** hele EK-seksjonen (den betingede `hasCoApplicant ? <per søker> : <Egenkapital>`-blokken) → wrap i `{showEssential && (...)}`.
- **Avansert:** gebyr-toggle, rente, løpetid, lånetype, ekstra utgifter, HELE kausjon-seksjonen (4 felt + målpris + mikrocopy) → wrap i `{showAdvanced && (...)}`.

- [ ] **Step 3: Verifiser bygg + typecheck + regresjon**

Run: `npm run build && npm run typecheck && npm test`
Expected: PASS / rent / alle grønne. (`section='all'` default ⇒ ingen visuell endring der formene brukes i dag.)

- [ ] **Step 4: Commit**

```bash
git add src/components/calculator/PropertyForm.tsx src/components/calculator/LoanForm.tsx
git commit -m "refactor(bolig): section-prop på PropertyForm + LoanForm (essential/advanced)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `section`-prop på HouseholdForm + ApplicantFields

**Files:**
- Modify: `src/components/calculator/HouseholdForm.tsx`

- [ ] **Step 1: ApplicantFields — section-aware**

Gi `ApplicantFields` en `section?: 'essential' | 'advanced' | 'all'` (default `'all'`). Inni:
- **Essensiell:** Bruttoinntekt + Eksisterende gjeld → `{showEssential && (...)}`.
- **Avansert:** Navn (+ evt. andre felt som annen inntekt hvis de finnes) → `{showAdvanced && (...)}`.

- [ ] **Step 2: HouseholdForm — section-prop**

`Props`: `section?: 'essential' | 'advanced' | 'all'`, default `'all'`. `showEssential`/`showAdvanced`.
- **Essensiell:** profil-bro-stripen (Bruk min profil / Hent medsøker + freshness-banner + bridge-summary) + `ApplicantFields(primary, section='essential')` → wrap i `{showEssential && (...)}`. (Medsøker holdes i avansert, se under — primær inntekt+gjeld er driveren.)
- **Avansert:** `ApplicantFields(primary, section='advanced')` (navn) + medsøker-Switch + `ApplicantFields(co, section='all')` (hele medsøker) + barn/voksne/spedbarn → wrap i `{showAdvanced && (...)}`.

> **Implementeringsnotat:** Når `section='all'` (default) skal HouseholdForm rendre nøyaktig som i dag — verifiser at både essential- og advanced-blokkene vises og i samme rekkefølge. Medsøker (toggle + felt) ligger helt i «Husstand & medsøker»-seksjonen; primær inntekt+gjeld er de essensielle (bevisst forenkling: medsøkers inntekt redigeres i husstand-seksjonen, ikke i essensielle felt). Separators (`<Separator/>`) plasseres slik at hver seksjon ser ryddig ut alene.

- [ ] **Step 3: Verifiser bygg + typecheck + regresjon**

Run: `npm run build && npm run typecheck && npm test`
Expected: PASS / rent / alle grønne.

- [ ] **Step 4: Commit**

```bash
git add src/components/calculator/HouseholdForm.tsx
git commit -m "refactor(bolig): section-prop på HouseholdForm + ApplicantFields

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: ScenarioFormPanel — én-side-layout (essensielt + tre kollapser)

**Files:**
- Modify: `src/components/calculator/ScenarioFormPanel.tsx`

- [ ] **Step 1: Erstatt Tabs-blokken**

Behold header (label-redigering) og `<MiniSummary>`-footer uendret. Erstatt `<Tabs>…</Tabs>`-blokken (inni `<div className="flex-1 overflow-y-auto p-4">`) med:

```tsx
        <div className="space-y-4">
          {/* Essensielle felt — alltid synlig */}
          <HouseholdForm scenario={scenario} section="essential" />
          <LoanForm scenario={scenario} section="essential" />
          <PropertyForm scenario={scenario} section="essential" />

          {/* Progressiv avsløring */}
          <details className="rounded-lg border border-border/50 bg-card/40">
            <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium hover:bg-muted/30">
              Boligdetaljer
            </summary>
            <div className="px-3 pb-3 pt-1"><PropertyForm scenario={scenario} section="advanced" /></div>
          </details>

          <details className="rounded-lg border border-border/50 bg-card/40">
            <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium hover:bg-muted/30">
              Husstand & medsøker
            </summary>
            <div className="px-3 pb-3 pt-1"><HouseholdForm scenario={scenario} section="advanced" /></div>
          </details>

          <details className="rounded-lg border border-border/50 bg-card/40">
            <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium hover:bg-muted/30">
              Avanserte lånevilkår
            </summary>
            <div className="px-3 pb-3 pt-1"><LoanForm scenario={scenario} section="advanced" /></div>
          </details>
        </div>
```

Fjern nå-ubrukte importer (`Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`, og ikonene `Home`/`Users`/`CreditCard` hvis de kun ble brukt i TabsTriggers). `noUnusedLocals` vil fange dem.

- [ ] **Step 2: Verifiser bygg + typecheck**

Run: `npm run build && npm run typecheck`
Expected: PASS / rent.

- [ ] **Step 3: Manuell røyktest**

Run: `npm run dev` → boligkalkulator.
Expected: Øverst essensielle felt (inntekt+gjeld, egenkapital, boligpris) + profil-bro-stripe. Tre kollapsede seksjoner under. Åpne hver → boligdetaljer / medsøker+barn / rente+løpetid+kausjon vises. MiniSummary-footer fortsatt der. Endring i et kollapset felt (f.eks. kausjon) oppdaterer resultatet.

- [ ] **Step 4: Commit**

```bash
git add src/components/calculator/ScenarioFormPanel.tsx
git commit -m "feat(bolig): én-side-layout med essensielt + progressiv avsløring

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: ResultsPanel — hovedsvar + kollapsede detaljkort

**Files:**
- Modify: `src/components/calculator/ResultsPanel.tsx`

- [ ] **Step 1: Kollaps detaljkortene**

I `ResultsPanel`s return (rundt linje 127–149): behold `<StatusBanner>` + `<MaxPurchaseCard>` som hovedsvar (alltid synlig). Wrap detaljkortene `<AffordabilityCard>`, grid(`<EquityCard>` + `<DebtRatioCard>`), `<SavingsGoalCard>` i en `<details>`:

```tsx
      <StatusBanner analysis={analysis} />
      <MaxPurchaseCard analysis={analysis} />

      <details className="rounded-lg border border-border/50 bg-card/40">
        <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium hover:bg-muted/30">
          Vis detaljer
        </summary>
        <div className="space-y-3 px-3 pb-3 pt-1">
          <AffordabilityCard analysis={analysis} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <EquityCard analysis={analysis} />
            <DebtRatioCard analysis={analysis} />
          </div>
          <SavingsGoalCard analysis={analysis} />
        </div>
      </details>
```
(Behold den EKSAKTE eksisterende grid-className-en for Equity/DebtRatio hvis den avviker — kopier fra nåværende kode.) DistributionPlanSection + amortiseringsseksjonen (med `showAmortization`-toggle) forblir UENDRET under detaljene.

- [ ] **Step 2: Verifiser bygg + typecheck + manuell**

Run: `npm run build && npm run typecheck`
Manuell: resultat viser hovedsvar (status + maks kjøpesum) øverst; «Vis detaljer» åpner de fire kortene; amortisering uendret.

- [ ] **Step 3: Commit**

```bash
git add src/components/calculator/ResultsPanel.tsx
git commit -m "feat(bolig): hovedsvar + kollapsede detaljkort i ResultsPanel

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Sluttverifisering

- [ ] **Step 1: Full verifisering**

Run: `npm test && npm run typecheck && npm run build`
Expected: Alle PASS. Eksisterende kalkulator-tester (calculator.test.ts/maxPurchase.test.ts) grønne uendret — funksjonsbevarings-sikringen.

- [ ] **Step 2: Funksjonsbevaring (manuell)**

Run: `npm run dev`. Bekreft:
- Åpne ALLE kollapser → nøyaktig de samme feltene som dagens kalkulator finnes (ingen felt borte): boligpris/eierform/boligtype/fellesgjeld/fellesutgifter/eiendomsskatt, inntekt/gjeld/navn/medsøker/barn/voksne, EK/rente/løpetid/lånetype/ekstra utgifter/kausjon(4)/målpris.
- Profil-forhåndsfyll fyller essensielle felt.
- Resultattall identiske med før (samme scenario-input ⇒ samme maks kjøpesum/status).
- Kausjon (i «Avanserte lånevilkår») påvirker hovedsvaret som før.
- Mobil: hovedsvar synlig rett under essensielle felt.

---

## Self-Review (utført av planforfatter)

- **Spec-dekning:** input-siden (essensielt + 3 kollapser via section-prop, Task 1–3), profil-bro løftet fram (i HouseholdForm essential, Task 2/3), kausjon flyttet til «Avanserte lånevilkår» (Task 1), resultatsiden (hovedsvar + detaljer kollapset, Task 4), funksjonsbevaring (Task 5 manuell + eksisterende tester). `<details>`-mønster bekreftet mot kodebasen.
- **Bevisst avvik fra spec:** medsøkers inntekt ligger i «Husstand & medsøker»-seksjonen (ikke i essensielle felt selv når medsøker er på) — unngår at medsøker-toggle blir uoppnåelig fra essensielle felt og holder essensielle felt = primærsøkers driver. Dokumentert i Task 2-notat.
- **Placeholders:** UI-reorg av store eksisterende komponenter → planen gir eksakt felt→seksjon-mapping + gating-idiom + ny layout-JSX for ScenarioFormPanel/ResultsPanel, og ber implementer flytte eksisterende felt-JSX (ikke skrive om). Dette er bevisst for en reorganisering, ikke en placeholder.
- **Typekonsistens:** `section: 'essential' | 'advanced' | 'all'` (default `'all'`) konsistent på alle tre skjema + ApplicantFields; `showEssential`/`showAdvanced`-idiom likt overalt.
- **Konsistens-regel:** ren presentasjons-reorganisering; `section='all'` ⇒ dagens oppførsel; motor/store/felt urørt; eksisterende logikk-tester = sikring. Hvert felt bevart (Task 5 verifiserer).
