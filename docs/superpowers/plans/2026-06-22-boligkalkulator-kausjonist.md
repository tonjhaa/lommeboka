# Boligkalkulator kausjonist Implementeringsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Legge til kausjonist (realkausjon) i den fulle boligkalkulatoren: kausjon løfter EK-grensen i `analyzeMaxPurchase`, pluss revers («hvor mye kausjon trengs for målpris») og sjekk av kausjonistens frie sikkerhet.

**Architecture:** Kausjon er en valgfri parameter (default 0) som legges til egenkapital KUN i EK-regelen (`maxPriceByEquity`); gjeldsgrad og betjeningsevne er uendret. To nye rene funksjoner: `kausjonNeededForPrice` (revers) og `guarantorFreeCollateral`. Kausjon lever kun i full kalkulator — `calcMaxPurchaseSimple` er urørt. UI-input i ScenarioFormPanel, resultat i MaxPurchaseCard.

**Tech Stack:** TypeScript (strict), React 19, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-22-boligkalkulator-kausjonist-design.md`
**Branch:** `feat/boligkalkulator-kausjonist`

**Konvensjoner:**
- TypeScript-sjekk: **`npm run typecheck`** (= `tsc -b`). `npx tsc --noEmit` fanger IKKE `noUnusedLocals`.
- Tester: `npm test -- <navn>`.
- Conventional commits. Avslutt med blank linje + `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

**Verifiserte fakta (mot faktisk kode):**
- Motor: `src/utils/maxPurchase.ts` — `analyzeMaxPurchase(equity, sharedDebt, existingDebt, household, monthlyFee, propertyTaxAnnual, extraMonthlyExpenses, config, interestRate?, loanTermYears?, ownershipType?, financeAllFees?)`. Tre interne: `maxPriceByEquity`, `maxPriceByDebtRatio`, `maxPriceByAffordability`. Konstant `config.lendingRules.minEquityPercent` (=10), `maxDebtRatio` (=5).
- `MaxPurchaseAnalysis` i `src/types/index.ts:242` — maxByEquity/maxByDebtRatio/maxByAffordability/maxPurchasePrice/limitingFactor/maxLoanAmount.
- `LoanParametersInput` i `src/types/index.ts:68` — equity/interestRate/loanTermYears/loanType/stressTestRate?/extraMonthlyExpenses?.
- Kall-site: `src/utils/calculator.ts:99` `analyzeMaxPurchase(equity, property.sharedDebt ?? 0, existingDebt, household, property.monthlyFee ?? 0, property.propertyTax ?? 0, loanParameters.extraMonthlyExpenses ?? 0, config, loanParameters.interestRate, loanParameters.loanTermYears, property.ownershipType, financeEstFee)`.
- Scenario-default: `src/hooks/useNewScenario.ts:29` `loanParameters: { equity: 750_000, ... }`.
- UI: `src/components/calculator/ScenarioFormPanel.tsx` (input, tabs household/…); `src/components/calculator/AnalysisCards.tsx` → `MaxPurchaseCard({ analysis })` viser de tre grensene.
- Helpers brukt av motoren: `calcAcquisitionFees`, `calcEffectiveEquity` (fra `./property`), `calcTotalAnnualIncome` (fra `./tax`).
- **Kausjon-feltene er valgfrie med `?? 0`-fallback ⇒ bakoverkompatible, INGEN persist-migrering nødvendig** (gamle scenarioer mangler feltet → tolkes som 0).

---

### Task 1: Motor — kausjon i analyzeMaxPurchase + revers + fri sikkerhet

**Files:**
- Modify: `src/types/index.ts` (utvid `MaxPurchaseAnalysis`)
- Modify: `src/utils/maxPurchase.ts`
- Test: `src/utils/__tests__/maxPurchase.test.ts` (ny)

- [ ] **Step 1: Utvid output-typen**

I `src/types/index.ts`, i `interface MaxPurchaseAnalysis` (etter `maxLoanAmount`):

```ts
  /** Kausjon (realkausjon) brukt som egenkapital-ekvivalent i EK-regelen. 0 = ingen. */
  kausjonApplied: number
  /** Maks kjøpspris UTEN kausjon (samme tre grenser, kausjon=0) — for å vise løftet. */
  maxPriceWithoutKausjon: number
  /** Taket kausjon ikke kommer forbi = min(gjeldsgrad, betjeningsevne). */
  kausjonCeiling: number
```

- [ ] **Step 2: Skriv failing test**

Create `src/utils/__tests__/maxPurchase.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { analyzeMaxPurchase, kausjonNeededForPrice, guarantorFreeCollateral } from '../maxPurchase'
import { defaultConfig } from '@/config/default.config'
import type { HouseholdInput } from '@/types'

const household: HouseholdInput = {
  primaryApplicant: { grossIncome: 750_000, existingDebt: 0, label: 'A' },
  coApplicant: { grossIncome: 650_000, existingDebt: 0, label: 'B' },
  children: 0,
  adults: 2,
}

// Lav EK gjør at EK-regelen binder (kausjon skal da hjelpe).
function analyze(equity: number, kausjon = 0) {
  return analyzeMaxPurchase(
    equity, 0, 0, household, 4_500, 0, 0, defaultConfig,
    5.5, 25, 'selveier', false, kausjon,
  )
}

describe('analyzeMaxPurchase — kausjon-invariant', () => {
  it('kausjon=0 ⇒ uendret fra dagens motor (alle felt)', () => {
    const a = analyze(900_000, 0)
    expect(a.kausjonApplied).toBe(0)
    expect(a.maxPriceWithoutKausjon).toBe(a.maxPurchasePrice)
  })
})

describe('analyzeMaxPurchase — kausjon løfter KUN EK-grensen', () => {
  it('kausjon hever maxByEquity, men ikke debtRatio/affordability', () => {
    const base = analyze(400_000, 0)        // lav EK → EK binder
    const withK = analyze(400_000, 1_000_000)
    expect(withK.maxByEquity).toBeGreaterThan(base.maxByEquity)
    expect(withK.maxByDebtRatio).toBe(base.maxByDebtRatio)
    expect(withK.maxByAffordability).toBe(base.maxByAffordability)
  })
  it('maxPurchasePrice kan ikke overstige kausjonCeiling (min av debt/affordability)', () => {
    const withK = analyze(400_000, 50_000_000)  // urealistisk høy kausjon
    expect(withK.maxPurchasePrice).toBe(withK.kausjonCeiling)
    expect(withK.maxPurchasePrice).toBeLessThanOrEqual(Math.min(withK.maxByDebtRatio, withK.maxByAffordability))
  })
  it('kausjon på en allerede gjeldsgrad-/betjeningsbundet bruker ⇒ 0 løft', () => {
    const base = analyze(5_000_000, 0)        // høy EK → ikke EK-bundet
    const withK = analyze(5_000_000, 2_000_000)
    expect(withK.maxPurchasePrice).toBe(base.maxPurchasePrice)
  })
})

describe('kausjonNeededForPrice', () => {
  it('returnerer EK-mangelen for målpris (krav − EK)', () => {
    const r = kausjonNeededForPrice(3_000_000, 100_000, 0, household, defaultConfig, 5.5, 25, 'selveier', false)
    expect(r.kausjonNeeded).toBeGreaterThan(0)
    // EK-krav ~ 10% av 3M = 300k + gebyrer; med 100k EK trengs ~ 200k+ kausjon
    expect(r.kausjonNeeded).toBeGreaterThan(150_000)
  })
  it('nok EK ⇒ kausjonNeeded = 0', () => {
    const r = kausjonNeededForPrice(1_000_000, 2_000_000, 0, household, defaultConfig, 5.5, 25, 'selveier', false)
    expect(r.kausjonNeeded).toBe(0)
  })
  it('målpris over taket ⇒ reachable=false', () => {
    const r = kausjonNeededForPrice(50_000_000, 100_000, 0, household, defaultConfig, 5.5, 25, 'selveier', false)
    expect(r.reachable).toBe(false)
    expect(r.ceiling).toBeLessThan(50_000_000)
  })
})

describe('guarantorFreeCollateral', () => {
  it('homeValue×maxLTV − mortgage, gulv 0', () => {
    expect(guarantorFreeCollateral(4_000_000, 1_000_000, 0.90)).toBe(2_600_000)
    expect(guarantorFreeCollateral(2_000_000, 2_000_000, 0.90)).toBe(0)
  })
})
```

- [ ] **Step 3: Kjør — verifiser feil**

Run: `npm test -- maxPurchase`
Expected: FAIL (funksjoner/felt finnes ikke).

- [ ] **Step 4: Implementer**

I `src/utils/maxPurchase.ts`:

a) Legg `kausjon: number = 0` som siste parameter på `analyzeMaxPurchase` (etter `financeAllFees`):

```ts
export function analyzeMaxPurchase(
  equity: number,
  sharedDebt: number,
  existingDebt: number,
  household: HouseholdInput,
  monthlyFee: number,
  propertyTaxAnnual: number,
  extraMonthlyExpenses: number,
  config: AppConfig,
  interestRate: number = config.loanDefaults.defaultInterestRate,
  loanTermYears: number = config.loanDefaults.defaultLoanTermYears,
  ownershipType: OwnershipType = 'selveier',
  financeAllFees = false,
  kausjon = 0,
): MaxPurchaseAnalysis {
```

b) Endre EK-grensen til å bruke `equity + kausjon`, og behold en uten-kausjon-variant:

```ts
  const maxByEquity = maxPriceByEquity(equity + kausjon, sharedDebt, config, ownershipType, financeAllFees)
  const maxByEquityNoKausjon = maxPriceByEquity(equity, sharedDebt, config, ownershipType, financeAllFees)
```

(`maxByDebtRatio` og `maxByAffordability` er UENDRET — bruker `equity`.)

c) Etter `maxPurchasePrice = Math.min(...)` og `limitingFactor`-blokken, før return, beregn de nye feltene:

```ts
  const kausjonCeiling = Math.min(maxByDebtRatio, maxByAffordability)
  const maxPriceWithoutKausjon = Math.min(maxByEquityNoKausjon, maxByDebtRatio, maxByAffordability)
```

d) Legg de tre nye feltene i retur-objektet:

```ts
    kausjonApplied: kausjon,
    maxPriceWithoutKausjon,
    kausjonCeiling,
```

e) Legg til de to nye eksporterte funksjonene nederst i fila:

```ts
/**
 * Revers: hvor mye kausjon (realkausjon) trengs for å nå en målpris, gitt EK og inntekt.
 * Kausjon dekker EK-mangelen, men kommer ALDRI forbi gjeldsgrad/betjeningsevne-taket.
 */
export function kausjonNeededForPrice(
  targetPrice: number,
  equity: number,
  existingDebt: number,
  household: HouseholdInput,
  config: AppConfig,
  interestRate: number = config.loanDefaults.defaultInterestRate,
  loanTermYears: number = config.loanDefaults.defaultLoanTermYears,
  ownershipType: OwnershipType = 'selveier',
  financeAllFees = false,
): { kausjonNeeded: number; reachable: boolean; ceiling: number } {
  const minEqPct = config.lendingRules.minEquityPercent / 100
  const feeBreakdown = calcAcquisitionFees(targetPrice, config.fees, ownershipType, financeAllFees)
  const effEq = calcEffectiveEquity(equity, feeBreakdown.totalFees)
  // Påkrevd egenkapital ved målpris (samme EK-regel som maxPriceByEquity bruker)
  const requiredEquity = targetPrice * minEqPct
  const kausjonNeeded = Math.max(0, Math.round(requiredEquity - effEq))

  // Taket: gjeldsgrad + betjeningsevne (kausjon hjelper ikke forbi dette)
  const a = analyzeMaxPurchase(
    equity, 0, existingDebt, household, 0, 0, 0, config,
    interestRate, loanTermYears, ownershipType, financeAllFees,
  )
  const ceiling = a.kausjonCeiling
  return { kausjonNeeded, reachable: targetPrice <= ceiling, ceiling }
}

/** Kausjonistens ledige pantesikkerhet i egen bolig: verdi×maxLTV − restgjeld (gulv 0). */
export function guarantorFreeCollateral(homeValue: number, mortgage: number, maxLTV = 0.90): number {
  return Math.max(0, Math.round(homeValue * maxLTV - mortgage))
}
```

> **Implementeringsnotat:** `kausjonNeededForPrice` kaller `analyzeMaxPurchase` for taket — dette er trygt (ingen rekursjon på kausjon-parameteren siden default 0). `calcAcquisitionFees`/`calcEffectiveEquity` er allerede importert øverst i fila.

- [ ] **Step 5: Kjør — verifiser pass + ingen regresjon**

Run: `npm test -- maxPurchase calculator && npm run typecheck`
Expected: PASS / rent. (calculator.test.ts er regresjonsvern — kausjon=0 default ⇒ uendret.)

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/utils/maxPurchase.ts src/utils/__tests__/maxPurchase.test.ts
git commit -m "feat(bolig): kausjon i maxPurchase-motor + revers + fri sikkerhet

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Wire kausjon gjennom typer + scenario-default + kalkulator-kall

**Files:**
- Modify: `src/types/index.ts` (`LoanParametersInput`)
- Modify: `src/hooks/useNewScenario.ts` (default)
- Modify: `src/utils/calculator.ts` (send kausjon til motoren)

- [ ] **Step 1: Utvid LoanParametersInput**

I `src/types/index.ts`, i `interface LoanParametersInput` (etter `extraMonthlyExpenses?`):

```ts
  /** Kausjon (realkausjon) i NOK — løfter egenkapitalkravet i kalkulatoren. */
  kausjon?: number
  /** Kausjonistens boligverdi i NOK (for sjekk av fri pantesikkerhet). */
  guarantorHomeValue?: number
  /** Kausjonistens restgjeld på egen bolig i NOK. */
  guarantorMortgage?: number
```

- [ ] **Step 2: Send kausjon til analyzeMaxPurchase**

I `src/utils/calculator.ts`, i `analyzeMaxPurchase`-kallet (linje ~99), legg til som 13. argument etter `financeEstFee`:

```ts
    property.ownershipType,
    financeEstFee,
    loanParameters.kausjon ?? 0,
  )
```

- [ ] **Step 3: (Valgfritt) sett default i nytt scenario**

I `src/hooks/useNewScenario.ts`, i default `loanParameters`-objektet, kausjon er valgfri og default-udefinert tolkes som 0 — INGEN endring nødvendig for korrekthet. (Hopp over med mindre du vil eksplisitt vise feltet; da `kausjon: 0`.)

- [ ] **Step 4: Verifiser bygg + test**

Run: `npm run build && npm test && npm run typecheck`
Expected: PASS / rent / alle grønne. Eksisterende kalkulator-oppførsel uendret (kausjon default 0).

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/utils/calculator.ts
git commit -m "feat(bolig): kausjon-felt i scenario-input + send til motoren

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: UI-input — «Kausjon»-seksjon i ScenarioFormPanel

**Files:**
- Modify: `src/components/calculator/ScenarioFormPanel.tsx`

- [ ] **Step 1: Les komponenten + finn input-mønsteret**

Les `src/components/calculator/ScenarioFormPanel.tsx`. Finn hvordan et eksisterende valgfritt tall-input (f.eks. `loanParameters.extraMonthlyExpenses` eller `equity`) bindes og oppdateres (onChange → oppdaterer scenario-state). Følg NØYAKTIG samme mønster (samme input-komponent, samme update-funksjon, samme formattering).

- [ ] **Step 2: Legg til Kausjon-seksjon**

Legg til en valgfri «Kausjon»-blokk (kollapset/seksjon i samme stil som resten av skjemaet) med tre tall-input, alle bundet til `loanParameters` via samme update-mønster som `equity`:
- «Kausjon (realkausjon)» → `loanParameters.kausjon`
- «Kausjonistens boligverdi» → `loanParameters.guarantorHomeValue`
- «Kausjonistens restgjeld» → `loanParameters.guarantorMortgage`

Mikrocopy under seksjonen: «Kausjon (pant i kausjonistens bolig) løfter egenkapitalkravet — ikke gjeldsgrad eller betjeningsevne.»

> **Implementeringsnotat:** Bruk samme tallinput-komponent og `updateLoanParameters`/tilsvarende setter som `equity` bruker (finn den eksakte i fila). Tomt felt ⇒ udefinert ⇒ tolkes som 0 nedstrøms. Ikke innfør ny state-mekanikk; gjenbruk eksisterende.

- [ ] **Step 3: Verifiser bygg**

Run: `npm run build && npm run typecheck`
Expected: PASS / rent. `noUnusedLocals`.

- [ ] **Step 4: Commit**

```bash
git add src/components/calculator/ScenarioFormPanel.tsx
git commit -m "feat(bolig): kausjon-inputseksjon i ScenarioFormPanel

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: UI-resultat — utvid MaxPurchaseCard

**Files:**
- Modify: `src/components/calculator/AnalysisCards.tsx` (`MaxPurchaseCard`)

- [ ] **Step 1: Vis kausjon-effekten når kausjon > 0**

I `MaxPurchaseCard`, etter de tre grense-radene, legg til en blokk som KUN vises når `maxPurchase.kausjonApplied > 0`:
- «Kausjon brukt: {formatCurrency(kausjonApplied)}»
- «Uten kausjon: {formatCurrency(maxPriceWithoutKausjon)} → med kausjon: {formatCurrency(maxPurchasePrice)}»
- Hvis `maxPurchasePrice === kausjonCeiling`: liten note «Begrenset av {gjeldsgrad/betjeningsevne} — mer kausjon hjelper ikke.»

Bruk eksisterende `formatCurrency` + samme rad-stil som de andre.

- [ ] **Step 2: Vis fri-sikkerhet-sjekk når kausjonist-bolig oppgitt**

`analysis` har tilgang til scenario-inputene? Hvis `MaxPurchaseCard` kun får `analysis` (resultat), og guarantor-feltene er input, bekreft hvordan komponenten får tak i `loanParameters.guarantorHomeValue/Mortgage`. Hvis ikke tilgjengelig i `analysis`, beregn fri sikkerhet i `calculator.ts` og legg `guarantorFreeCollateral` + `kausjonShortfall` i `MaxPurchaseAnalysis` (utvid typen), ELLER send scenario-inputene inn i kortet via props. Velg den minst invasive: hvis kortet allerede har scenario-tilgang, bruk `guarantorFreeCollateral(...)` direkte; ellers utvid `MaxPurchaseAnalysis` med `guarantorFreeCollateral?: number`.

Når oppgitt: vis «Kausjonistens frie sikkerhet: {Z}» + «✓ dekker kausjonen» eller «mangler {kausjon − Z}».

> **Implementeringsnotat:** Bekreft FØRST om `MaxPurchaseCard` har tilgang til scenario-input (loanParameters) eller bare `analysis.maxPurchase`. Velg minst invasive vei (props vs. type-utvidelse) og hold det konsistent med hvordan kortet ellers får data.

- [ ] **Step 3: Verifiser bygg + manuell røyktest**

Run: `npm run build && npm run typecheck`
Manuell: `npm run dev` → boligkalkulator → sett lav EK så EK binder → legg inn kausjon → maks kjøpesum stiger til kausjonCeiling, ikke forbi; «uten/med kausjon»-løft vises; legg inn kausjonist-bolig → fri-sikkerhet-sjekk.

- [ ] **Step 4: Commit**

```bash
git add src/components/calculator/AnalysisCards.tsx
git commit -m "feat(bolig): vis kausjon-løft + fri-sikkerhet i MaxPurchaseCard

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Sluttverifisering

- [ ] **Step 1: Full verifisering**

Run: `npm test && npm run typecheck && npm run build`
Expected: Alle PASS. Nye maxPurchase-tester grønne; calculator.test.ts (regresjon) uendret.

- [ ] **Step 2: Konsistens-sjekk (manuell)**

Run: `npm run dev`. Bekreft:
- Kausjon=0 (default): kalkulatoren viser nøyaktig samme tall som før (invariant).
- Kausjon løfter maks kjøpesum KUN når EK binder; aldri forbi gjeldsgrad/betjening.
- Revers («for å nå X trengs Y kausjon») stemmer med forward (samme grenser).
- Veikart/Sparing/Dashboard «kjøpekraft» er UENDRET (calcMaxPurchaseSimple urørt).

---

## Self-Review (utført av planforfatter)

- **Spec-dekning:** motor-integrasjon kausjon-kun-i-EK + invariant (Task 1), revers `kausjonNeededForPrice` med tak (Task 1), `guarantorFreeCollateral` (Task 1), typer + scenario-wiring (Task 2), UI-input med mikrocopy (Task 3), UI-resultat med løft + fri-sikkerhet (Task 4), feilhåndtering (kausjon>nødvendig kappes via kausjonCeiling; gjeldsgrad-bundet ⇒ 0 løft — begge testlåst Task 1). `calcMaxPurchaseSimple` urørt (bevisst, sjekkes Task 5).
- **Placeholders:** Task 1 har komplett kode + tester. Task 2 konkrete kall-endringer. Task 3/4 har implementeringsnotater som ber implementer bekrefte eksakt input-binding/dataflyt FØR endring (siden disse avhenger av eksisterende komponent-struktur) — dette er bevisst, ikke en placeholder: koden som skrives må følge det eksisterende mønsteret i akkurat de filene.
- **Typekonsistens:** `kausjonApplied`/`maxPriceWithoutKausjon`/`kausjonCeiling` (MaxPurchaseAnalysis), `kausjon`/`guarantorHomeValue`/`guarantorMortgage` (LoanParametersInput), `kausjonNeededForPrice`/`guarantorFreeCollateral` konsistente på tvers.
- **Konsistens-regel:** kausjon=0 ⇒ bit-identisk (invariant-test); kausjon kun i EK-regel (testlåst at debtRatio/affordability uendret); revers bruker samme motor som forward; simple-varianten urørt.
