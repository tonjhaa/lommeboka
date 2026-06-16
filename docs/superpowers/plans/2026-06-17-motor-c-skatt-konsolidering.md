# Motor C skatt-konsolidering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La boligkalkulatorens nettoinntekt-skatt (`utils/tax.ts`) delegere til den kanoniske motoren `norwegianTaxRules` (B), og fjerne den døde `TaxConfig`-konfigen — så appen har kun én skattemotor.

**Architecture:** `calcAnnualTax`/`calcMonthlyNetIncome`/`calcHouseholdMonthlyNetIncome` slutter å bruke `TaxConfig` og kaller i stedet `calcNorwegianTax(gross, year).skattEtterFradrag`. De to konsumentene (`affordability.ts`, `maxPurchase.ts`) dropper `config.tax`-argumentet. Deretter fjernes den nå ubrukte `tax`-konfigen, `TaxConfig`-typen og migrerings-undblokken.

**Tech Stack:** React 19 + TypeScript (strict), Vitest.

**KRITISK byggsjekk:** Bruk `npm run typecheck` (= `tsc -b`) før commit — `npx tsc --noEmit` fanger ikke `noUnusedLocals`.

---

### Task 1: `utils/tax` delegerer til B + konsumenter + tester

**Files:**
- Rewrite: `src/utils/tax.ts`
- Modify: `src/utils/affordability.ts:92`, `src/utils/maxPurchase.ts:101`
- Test: `src/utils/__tests__/tax.test.ts`

- [ ] **Step 1: Skriv om testen (drop `config`-arg, legg til konsistenstest)**

Erstatt HELE `src/utils/__tests__/tax.test.ts` med:
```ts
import { describe, it, expect } from 'vitest'
import { calcAnnualTax, calcMonthlyNetIncome, calcTotalAnnualIncome } from '../tax'
import { calcNorwegianTax } from '@/domain/economy/norwegianTaxRules'

describe('calcAnnualTax', () => {
  it('600 000 kr brutto → samlet skatt i rimelig bånd', () => {
    const annualTax = calcAnnualTax(600_000)
    expect(annualTax).toBeGreaterThan(130_000)
    expect(annualTax).toBeLessThan(160_000)
  })
  it('0 kr brutto → 0 kr skatt', () => {
    expect(calcAnnualTax(0)).toBe(0)
  })
  it('200 000 kr brutto → under 30% effektiv', () => {
    const result = calcAnnualTax(200_000)
    expect(result).toBeGreaterThan(0)
    expect(result).toBeLessThan(200_000 * 0.30)
  })
  it('1 000 000 kr brutto → ~28–36% effektiv', () => {
    const result = calcAnnualTax(1_000_000)
    expect(result / 1_000_000).toBeGreaterThan(0.28)
    expect(result / 1_000_000).toBeLessThan(0.36)
  })
})

describe('calcAnnualTax ↔ calcNorwegianTax konsistens', () => {
  for (const lonn of [300_000, 600_000, 1_000_000]) {
    it(`calcAnnualTax(${lonn}) = B sin skattEtterFradrag`, () => {
      expect(calcAnnualTax(lonn, 2026)).toBe(calcNorwegianTax(lonn, 2026).skattEtterFradrag)
    })
  }
})

describe('calcMonthlyNetIncome', () => {
  it('600 000 kr brutto → ~33 000–40 000 kr netto/mnd', () => {
    const monthly = calcMonthlyNetIncome(600_000)
    expect(monthly).toBeGreaterThan(33_000)
    expect(monthly).toBeLessThan(40_000)
  })
  it('nettoinntekt < brutto / 12', () => {
    const gross = 800_000
    expect(calcMonthlyNetIncome(gross)).toBeLessThan(gross / 12)
  })
})

describe('calcTotalAnnualIncome', () => {
  it('to søkere + annen inntekt summeres korrekt', () => {
    expect(calcTotalAnnualIncome(600_000, 50_000, 500_000, 0)).toBe(1_150_000)
  })
  it('undefined verdier behandles som 0', () => {
    expect(calcTotalAnnualIncome(600_000, undefined, undefined, undefined)).toBe(600_000)
  })
})
```

- [ ] **Step 2: Kjør testen og se at den feiler**

Run: `npx vitest run src/utils/__tests__/tax.test.ts`
Expected: FAIL — `calcAnnualTax` tar fortsatt `config` (gammelt signatur gir feil tall / TS-feil i testkjøring), og konsistenstesten finnes ikke ennå.

- [ ] **Step 3: Skriv om `src/utils/tax.ts`**

Erstatt HELE filen med:
```ts
import { calcNorwegianTax } from '@/domain/economy/norwegianTaxRules'

/**
 * Estimert samlet årsskatt for en lønnsmottaker.
 * Delegerer til den kanoniske skattemotoren (norwegianTaxRules) — samme tall som
 * skatteoppgjør, budsjett-trekk og skattekalkulator. Ingen ekstra fradrag (brutto→skatt).
 */
export function calcAnnualTax(grossIncome: number, year: number = new Date().getFullYear()): number {
  return calcNorwegianTax(grossIncome, year).skattEtterFradrag
}

/** Månedlig nettoinntekt etter skatt for én person. */
export function calcMonthlyNetIncome(grossIncome: number, year?: number): number {
  return (grossIncome - calcAnnualTax(grossIncome, year)) / 12
}

/** Total månedlig nettoinntekt for en husholdning. */
export function calcHouseholdMonthlyNetIncome(
  primaryGross: number,
  coApplicantGross: number | undefined,
  year?: number,
): number {
  const primary = calcMonthlyNetIncome(primaryGross, year)
  const co = coApplicantGross ? calcMonthlyNetIncome(coApplicantGross, year) : 0
  return primary + co
}

/** Total bruttoinntekt for husstanden per år. */
export function calcTotalAnnualIncome(
  primaryGross: number,
  primaryOtherIncome: number | undefined,
  coApplicantGross: number | undefined,
  coApplicantOtherIncome: number | undefined,
): number {
  return (
    primaryGross +
    (primaryOtherIncome ?? 0) +
    (coApplicantGross ?? 0) +
    (coApplicantOtherIncome ?? 0)
  )
}
```

- [ ] **Step 4: Oppdater konsument `affordability.ts`**

I `src/utils/affordability.ts`, finn (rundt linje 92):
```ts
  const monthlyNetIncome = calcHouseholdMonthlyNetIncome(primaryGross, coGross, config.tax)
```
Erstatt med:
```ts
  const monthlyNetIncome = calcHouseholdMonthlyNetIncome(primaryGross, coGross)
```

- [ ] **Step 5: Oppdater konsument `maxPurchase.ts`**

I `src/utils/maxPurchase.ts`, finn (rundt linje 101):
```ts
  const monthlyNetIncome = calcHouseholdMonthlyNetIncome(primaryGross, coGross, config.tax)
```
Erstatt med:
```ts
  const monthlyNetIncome = calcHouseholdMonthlyNetIncome(primaryGross, coGross)
```

- [ ] **Step 6: Kjør tax-testen + typecheck**

Run: `npx vitest run src/utils/__tests__/tax.test.ts && npm run typecheck`
Expected: tax-testene PASS (inkl. konsistens), typecheck clean. (`config` brukes fortsatt i begge konsumentene via `config.sifo`/`config.lendingRules`, så ingen unused-param.)

- [ ] **Step 7: Kjør HELE suiten og forson eventuelle endrede affordability-tall**

Run: `npx vitest run`
Expected: Grønt. MERK: `src/utils/__tests__/calculator.test.ts` kan ha assertions på maks kjøpesum / affordability som nå skifter litt fordi nettoinntekten er mer korrekt. Hvis noen slike assertions feiler: bekreft at de nye tallene er fornuftige (samme størrelsesorden), og oppdater forventningene til FAKTISK output (dette er en tilsiktet konsekvens — ikke hack testen for å passe; bytt forventet til den nye korrekte verdien). Hvis et tall endrer seg mer enn ~10 %, STOPP og rapporter.

- [ ] **Step 8: Commit**

```bash
git add src/utils/tax.ts src/utils/affordability.ts src/utils/maxPurchase.ts src/utils/__tests__/tax.test.ts src/utils/__tests__/calculator.test.ts
git commit -m "refactor(boligkalk): nettoinntekt-skatt delegerer til kanonisk norwegianTaxRules

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
(Inkluder `calculator.test.ts` i commit kun hvis den ble endret i Step 7.)

---

### Task 2: Fjern den døde `TaxConfig`-konfigen

**Files:**
- Modify: `src/config/default.config.ts` (fjern `tax`-blokk ~128-184)
- Modify: `src/types/index.ts` (fjern `TaxConfig` ~469-487 og `tax: TaxConfig` i `AppConfig`)
- Modify: `src/store/useAppStore.ts` (fjern `tax`-undblokk i migrering ~154-157)

- [ ] **Step 1: Fjern `tax`-blokken fra default-konfigen**

I `src/config/default.config.ts`, fjern hele `tax: { … },`-blokken. Den starter med linjen:
```ts
  tax: {
```
og slutter med den tilhørende:
```ts
    ],
  },
```
(blokken inneholder `incomeTaxRate`, `nationalInsuranceRate`, `minstefradragRate/Min/Max`, `personfradrag` og `bracketTax`-arrayet). Fjern alle disse linjene inkludert den avsluttende `},` for `tax`-objektet. La de omkringliggende blokkene (`loanDefaults` over, `ui` under) stå urørt.

- [ ] **Step 2: Fjern `tax`-feltet og `TaxConfig`-typen**

I `src/types/index.ts`, i `interface AppConfig`, fjern de to linjene:
```ts
  /** Skattekonfigurasjon */
  tax: TaxConfig
```

Fjern deretter hele `TaxConfig`-interfacet:
```ts
export interface TaxConfig {
  /** Skattesats på alminnelig inntekt i prosent */
  incomeTaxRate: number
  /** Trygdeavgift i prosent */
  nationalInsuranceRate: number
  /** Trinnskatt-trinn (årsgrenser og satser) */
  bracketTax: {
    threshold: number
    rate: number
  }[]
  /** Minstefradragssats (typisk 0.46) */
  minstefradragRate: number
  /** Minstefradrag minimum i NOK */
  minstefradragMin: number
  /** Minstefradrag maksimum i NOK */
  minstefradragMax: number
  /** Personfradrag i NOK */
  personfradrag: number
}
```

- [ ] **Step 3: Fjern `tax`-undblokken i persist-migreringen**

I `src/store/useAppStore.ts`, i v<2-migreringen, finn:
```ts
          state.config = {
            ...defaultConfig,
            ...(state.config as object),
            tax: {
              ...defaultConfig.tax,
              ...((state.config as Record<string, unknown>).tax as object | undefined),
            },
          }
```
Erstatt med:
```ts
          state.config = {
            ...defaultConfig,
            ...(state.config as object),
          }
```

- [ ] **Step 4: Typecheck (fanger evt. gjenværende referanser)**

Run: `npm run typecheck`
Expected: Clean. Hvis typecheck klager på en gjenværende `TaxConfig`- eller `config.tax`-referanse et sted som ikke er nevnt her, STOPP og rapporter filen/linjen (ikke gjett).

- [ ] **Step 5: Bekreft ingen referanser igjen + full suite + build**

Run: `grep -rn "TaxConfig\|config\.tax\|defaultConfig\.tax" src/ ; npm run build ; npx vitest run`
Expected: grep returnerer ingenting, build OK, alle tester grønne.

- [ ] **Step 6: Commit**

```bash
git add src/config/default.config.ts src/types/index.ts src/store/useAppStore.ts
git commit -m "refactor(boligkalk): fjern død TaxConfig — kun én skattemotor igjen

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review-notater

- **Spec-dekning:** utils/tax delegerer til B (T1), konsumenter dropper config.tax (T1), konsistenstest (T1), fjern tax-konfig + TaxConfig-type + migrering (T2), oppdater tester (T1). Alle spec-seksjoner dekket.
- **Typekonsistens:** Nye signaturer `calcAnnualTax(gross, year?)`, `calcMonthlyNetIncome(gross, year?)`, `calcHouseholdMonthlyNetIncome(primary, co, year?)` brukt konsistent i tax.ts, konsumentene (dropper 3. arg) og testene. `calcTotalAnnualIncome` uendret.
- **Rekkefølge:** T1 holder typecheck grønn (tax-konfig finnes fortsatt, bare ubrukt). T2 fjerner den døde konfigen etter at ingen leser den. Rekkefølgen er nødvendig (T2 før T1 ville brutt konsumentene).
- **Placeholders:** Ingen. Testbånd er bevisst romslige (engine B gir samme størrelsesorden); konsistenstesten er den eksakte invarianten.
