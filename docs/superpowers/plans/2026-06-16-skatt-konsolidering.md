# Skatt-konsolidering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Samle Skattekalkulator-motoren (A, `norwegianTaxCalc`) på den kanoniske `norwegianTaxRules` (B) for både satser og kjernealgoritmer, og gjøre restskatt/tilgode korrekt og konsistent (ett fortegn, én skattekilde, riktig trekk-projeksjon).

**Architecture:** `norwegianTaxRules` (B) er eneste kilde for 2026-satser og inntektsskatt-algoritmer. A blir et lag som henter satser + trinnskatt/trygd fra B og legger til flere inntektstyper, formueskatt og visnings-breakdown. Restskatt-flyten på Skatteoppgjør-siden bruker B-motorens inntektsskatt (uten formueskatt) live, med konvensjonen positivt = til gode.

**Tech Stack:** React 19 + TypeScript (strict), Vitest.

**KRITISK byggsjekk:** Bruk `npm run typecheck` (= `tsc -b`) før commit — `npx tsc --noEmit` fanger ikke `noUnusedLocals` i dette composite-oppsettet.

**MERK om satsverdier:** Selve 2026-tallene i `TAX_RULES[2026]` endres IKKE i denne planen — brukeren verifiserer dem mot Skatteetaten og plugger dem inn etterpå (ett sted). Planen bygger strukturen og bruker B sine nåværende verdier som baseline.

---

### Task 0: Verifiser og oppdater 2026-satser fra Skatteetatens GitHub

**Files:**
- Modify: `src/domain/economy/norwegianTaxRules.ts` (`TAX_RULES[2026]`, ~linje 73-93)

Kilde: `github.com/skatteetaten/trekktabell` — `Konstanter.java` for inntektsår 2026
(samme repo som allerede er sitert i `norwegianTaxRules.ts`). Hent rå Java-fil via
raw.githubusercontent.com.

**VIKTIG distinksjon:** Konstanter.java inneholder trekkrutine-konstanter. For
skatteoppgjøret (B-motoren) skal `minstefradragSats` være **46 %** (skatteoppgjør),
IKKE 40,48 % (trekkrutine — den brukes kun i `calcMonthlyTaxWithholding` og skal
ikke røres). Personfradrag, trinnskatt-grenser/-satser, trygdeavgift-sats og
frigrense er felles og hentes fra kilden.

- [ ] **Step 1: Hent de offisielle 2026-konstantene**

Hent `Konstanter.java` (2026) fra skatteetaten/trekktabell via raw-URL. Finn de
offisielle verdiene for inntektsår 2026:
- personfradrag (klassefradrag)
- minstefradrag: maks og evt. nedre grense (skatteoppgjør)
- trinnskatt: alle grenser (threshold) + satser (rate)
- trygdeavgift på lønn: sats + frigrense (avgiftsfri grense)
- fagforeningsfradrag maks
- BSU: maks innskudd per år
- reisefradrag bunnfradrag

- [ ] **Step 2: Sammenlign mot nåværende `TAX_RULES[2026]`**

Les `src/domain/economy/norwegianTaxRules.ts` `TAX_RULES[2026]` og list opp ALLE
avvik mellom de hentede offisielle verdiene og koden. Hvis ingen avvik: noter det
og hopp til Step 5.

- [ ] **Step 3: Oppdater avvikende verdier**

Rett opp hvert avvik i `TAX_RULES[2026]`. Behold `minstefradragSats: 46` (ikke
trekkrutinens 40,48). Oppdater kommentaren med kilde-URL og dato.

- [ ] **Step 4: Typecheck + full test**

Run: `npm run typecheck && npx vitest run`
Expected: Ingen typefeil. Eksisterende tester kan endre forventede tallverdier —
det håndteres i Task 1 (referansetallene settes mot oppdaterte satser der).

- [ ] **Step 5: Commit (kun hvis noe ble endret)**

```bash
git add src/domain/economy/norwegianTaxRules.ts
git commit -m "fix(skatt): verifiser 2026-satser mot Skatteetatens trekktabell-repo

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

Rapporter de hentede offisielle verdiene og avvikene eksplisitt tilbake, slik at
de kan dobbeltsjekkes.

---

### Task 1: Eksporter delte algoritmer fra den kanoniske motoren (B)

**Files:**
- Modify: `src/domain/economy/norwegianTaxRules.ts:247` og `:300`
- Test: `src/domain/economy/__tests__/norwegianTaxRules.test.ts` (ny)

- [ ] **Step 1: Skriv test som krever de eksporterte funksjonene + fester referansetall**

Opprett `src/domain/economy/__tests__/norwegianTaxRules.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { calcNorwegianTax, calcTrinnskatt, calcTrygdeavgift, getTaxRules } from '../norwegianTaxRules'

describe('norwegianTaxRules — delte algoritmer', () => {
  it('calcTrinnskatt er eksportert og 0 under første trinn', () => {
    const rules = getTaxRules(2026)
    expect(calcTrinnskatt(100_000, rules.trinnskattBrackets)).toBe(0)
  })

  it('calcTrygdeavgift er eksportert og 0 under frigrensen', () => {
    const rules = getTaxRules(2026)
    expect(calcTrygdeavgift(50_000, rules)).toBe(0)
  })

  it('calcTrygdeavgift bruker ordinær sats godt over frigrensen', () => {
    const rules = getTaxRules(2026)
    // 600 000 er godt over frigrensen → ordinær sats
    expect(calcTrygdeavgift(600_000, rules)).toBe(Math.round(600_000 * rules.trygdeavgiftSats / 100))
  })
})

// Karakteriseringstest: låser nåværende oppførsel for TAX_RULES[2026].
// OPPDATER disse tallene når offisielle 2026-satser er verifisert og lagt inn.
describe('norwegianTaxRules — referansecaser (baseline for nåværende satser)', () => {
  it('500 000 kr lønn gir forventet samlet inntektsskatt', () => {
    const b = calcNorwegianTax(500_000, 2026)
    expect(b.skattEtterFradrag).toBe(108_834)
  })

  it('800 000 kr lønn gir forventet samlet inntektsskatt', () => {
    const b = calcNorwegianTax(800_000, 2026)
    expect(b.skattEtterFradrag).toBe(214_034)
  })
})
```

- [ ] **Step 2: Kjør testen og se at den feiler**

Run: `npx vitest run src/domain/economy/__tests__/norwegianTaxRules.test.ts`
Expected: FAIL — `calcTrinnskatt`/`calcTrygdeavgift` er ikke eksportert (import-feil). (Referansetallene kan også avvike — noter de faktiske verdiene fra kjøringen.)

- [ ] **Step 3: Eksporter funksjonene**

I `src/domain/economy/norwegianTaxRules.ts`, endre linje 247 fra:
```ts
function calcTrygdeavgift(income: number, rules: YearRules): number {
```
til:
```ts
export function calcTrygdeavgift(income: number, rules: YearRules): number {
```

Og linje 300 fra:
```ts
function calcTrinnskatt(income: number, brackets: { threshold: number; rate: number }[]): number {
```
til:
```ts
export function calcTrinnskatt(income: number, brackets: { threshold: number; rate: number }[]): number {
```

- [ ] **Step 4: Juster referansetallene til faktisk output**

Kjør `npx vitest run src/domain/economy/__tests__/norwegianTaxRules.test.ts` på nytt. For de to referansecasene: hvis `skattEtterFradrag` avviker fra `108_834`/`214_034`, erstatt forventningene i testen med de faktiske tallene fra kjøringen (dette er en karakteriseringsbaseline, ikke en offisiell fasit). Behold kommentaren om å oppdatere ved verifiserte satser.

- [ ] **Step 5: Kjør og bekreft grønt + typecheck**

Run: `npx vitest run src/domain/economy/__tests__/norwegianTaxRules.test.ts && npm run typecheck`
Expected: PASS, ingen typefeil.

- [ ] **Step 6: Commit**

```bash
git add src/domain/economy/norwegianTaxRules.ts src/domain/economy/__tests__/norwegianTaxRules.test.ts
git commit -m "refactor(skatt): eksporter calcTrinnskatt/calcTrygdeavgift + referansetester

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Refaktorer Skattekalkulator-motoren (A) til å bruke B

**Files:**
- Rewrite: `src/domain/economy/norwegianTaxCalc.ts`
- Modify: `src/pages/TaxCalculatorPage.tsx:130`
- Test: `src/domain/economy/__tests__/norwegianTaxCalc.test.ts` (ny)

- [ ] **Step 1: Skriv konsistens- og split-testen (driver refaktoren)**

Opprett `src/domain/economy/__tests__/norwegianTaxCalc.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { beregnSkatt, type TaxInput } from '../norwegianTaxCalc'
import { calcNorwegianTax } from '../norwegianTaxRules'

const EMPTY: TaxInput = {
  lonnsInntekt: 0, pensjonsinntekt: 0, næringsInntekt: 0, kapitalInntekt: 0,
  andreFradrag: 0, renteutgifter: 0, arbeidsreiseFradrag: 0, fagforeningskontingent: 0,
  pensjonspremie: 0, utgiftsgodtgjørelse: 0, bsuSkattefradrag: 0,
  primaerboligVerdi: 0, sekundaerboligVerdi: 0, bankinnskudd: 0, aksjerFondVerdi: 0,
  annenFormue: 0, gjeld: 0,
}

describe('beregnSkatt ↔ calcNorwegianTax konsistens (lønn-only)', () => {
  for (const lonn of [300_000, 500_000, 800_000, 1_200_000]) {
    it(`inntektsskatt = B for ${lonn} kr lønn`, () => {
      const a = beregnSkatt({ ...EMPTY, lonnsInntekt: lonn }, 2026)
      const b = calcNorwegianTax(lonn, 2026)
      expect(a.skattInntekt).toBe(b.skattEtterFradrag)
    })
  }
})

describe('beregnSkatt — formueskatt-split', () => {
  it('skattInntekt ekskluderer formueskatt; totalSkatt = inntekt + formue', () => {
    // Netto formue godt over bunnfradrag → formueskatt > 0
    const r = beregnSkatt({ ...EMPTY, lonnsInntekt: 600_000, bankinnskudd: 5_000_000 }, 2026)
    expect(r.skattFormue).toBeGreaterThan(0)
    expect(r.totalSkatt).toBe(r.skattInntekt + r.skattFormue)
    // Inntektsskatt-delen skal være uavhengig av formuen
    const utenFormue = beregnSkatt({ ...EMPTY, lonnsInntekt: 600_000 }, 2026)
    expect(r.skattInntekt).toBe(utenFormue.skattInntekt)
  })
})
```

- [ ] **Step 2: Kjør testen og se at den feiler**

Run: `npx vitest run src/domain/economy/__tests__/norwegianTaxCalc.test.ts`
Expected: FAIL — `skattInntekt`/`skattFormue` finnes ikke ennå, og konsistenstesten feiler fordi A i dag bruker foreldede satser + flat trygdeavgift.

- [ ] **Step 3: Skriv om `src/domain/economy/norwegianTaxCalc.ts`**

Erstatt HELE filen med:

```ts
// ------------------------------------------------------------
// Norsk skattekalkulator — bygger på den kanoniske satskilden
// i norwegianTaxRules (B). Egne, foreldede satser er fjernet.
// A legger til: flere inntektstyper, formueskatt og visnings-breakdown.
// ------------------------------------------------------------

import { getTaxRules, calcTrinnskatt, calcTrygdeavgift } from './norwegianTaxRules'

export const TAX_YEAR = 2026

// A-lokale konstanter som IKKE finnes i den kanoniske kilden
// (ingen duplisering av satser som ga avvik → ingen drift):
//   pensjon-minstefradrag, trygdeavgift pensjon/næring, formueskatt.
const PENSJON = {
  minstefradragSats: 0.40,
  minstefradragMaks: 73_150,
  trygdeavgift: 0.051,
}
const NÆRING = { trygdeavgift: 0.110 }
const FORMUE = {
  grense: 1_900_000,
  kommunal: 0.0035,
  statlig1: 0.0065,
  statlig1Grense: 21_500_000,
  statlig2: 0.0075,
}

// Visnings-satser for Skattekalkulator-siden — utledet fra den kanoniske
// kilden (B) for inntektsskatt-delen, pluss A-lokale formue/pensjon-satser.
const rules = getTaxRules(TAX_YEAR)
export const CURRENT_RATES = {
  year: TAX_YEAR,
  personfradrag: rules.personfradrag,
  minstefradragLonnSats: rules.minstefradragSats / 100,
  minstefradragLonnMaks: rules.minstefradragMaks,
  minstefradragPensjonSats: PENSJON.minstefradragSats,
  minstefradragPensjonMaks: PENSJON.minstefradragMaks,
  skattAlminneligSats: rules.alminneligInntektSats / 100,
  trygdeavgiftLonn: rules.trygdeavgiftSats / 100,
  trygdeavgiftPensjon: PENSJON.trygdeavgift,
  trygdeavgiftNæring: NÆRING.trygdeavgift,
  fagforeningskontingentMaks: rules.fagforeningsfradragMaks,
  formueskattGrense: FORMUE.grense,
  formueskattKommunal: FORMUE.kommunal,
  formueskattStatlig1: FORMUE.statlig1,
  formueskattStatlig1Grense: FORMUE.statlig1Grense,
  formueskattStatlig2: FORMUE.statlig2,
}

// ------------------------------------------------------------
// Input / Output
// ------------------------------------------------------------

export interface TaxInput {
  lonnsInntekt: number
  pensjonsinntekt: number
  næringsInntekt: number
  kapitalInntekt: number
  andreFradrag: number
  renteutgifter: number
  arbeidsreiseFradrag: number
  fagforeningskontingent: number
  pensjonspremie: number
  utgiftsgodtgjørelse: number
  bsuSkattefradrag: number
  primaerboligVerdi: number
  sekundaerboligVerdi: number
  bankinnskudd: number
  aksjerFondVerdi: number
  annenFormue: number
  gjeld: number
}

export interface TrinnskattLinje {
  trinn: number
  grenseFra: number
  grenseTil: number
  sats: number
  beløp: number
}

export interface TaxResult {
  minstefradragLonn: number
  minstefradragPensjon: number
  alminneligInntekt: number
  personinntekt: number
  skattemessigFormue: number
  nettoFormue: number
  skattepliktigFormue: number
  skattAlminneligInntekt: number
  trinnskatt: number
  trinnskattLinjer: TrinnskattLinje[]
  trygdeavgiftLonn: number
  trygdeavgiftPensjon: number
  trygdeavgiftNæring: number
  formueskattKommunal: number
  formueskattStatlig: number
  fagforeningFradrag: number
  bsuSkattefradragBeløp: number
  // Split: inntektsskatt (sammenlignbar med forskuddstrekk) vs formueskatt
  skattInntekt: number
  skattFormue: number
  totalSkatt: number
  totalInntekt: number
  effektivSats: number
  marginalSats: number
  estimertMånedligTrekk: number
}

// ------------------------------------------------------------
// Hjelpere
// ------------------------------------------------------------

/** Bygger trinnskatt-linjer for visning fra de kanoniske trinnskatt-grensene. */
function byggTrinnskattLinjer(
  personinntekt: number,
  brackets: { threshold: number; rate: number }[],
): TrinnskattLinje[] {
  const sorted = [...brackets].sort((a, b) => a.threshold - b.threshold)
  const linjer: TrinnskattLinje[] = []
  for (let i = 0; i < sorted.length; i++) {
    const fra = sorted[i].threshold
    if (personinntekt <= fra) break
    const til = sorted[i + 1]?.threshold ?? Infinity
    const sats = sorted[i].rate / 100
    const grunnlag = Math.min(personinntekt, til) - fra
    linjer.push({
      trinn: i + 1,
      grenseFra: fra,
      grenseTil: til === Infinity ? 0 : til,
      sats,
      beløp: Math.round(grunnlag * sats),
    })
  }
  return linjer
}

function beregnFormueskatt(nettoFormue: number): { kommunal: number; statlig: number } {
  const over = Math.max(0, nettoFormue - FORMUE.grense)
  if (over === 0) return { kommunal: 0, statlig: 0 }
  const kommunal = Math.round(over * FORMUE.kommunal)
  const statligGrunnlag1 = Math.min(over, FORMUE.statlig1Grense - FORMUE.grense)
  const statligGrunnlag2 = Math.max(0, over - (FORMUE.statlig1Grense - FORMUE.grense))
  const statlig = Math.round(statligGrunnlag1 * FORMUE.statlig1 + statligGrunnlag2 * FORMUE.statlig2)
  return { kommunal, statlig }
}

// ------------------------------------------------------------
// Beregning
// ------------------------------------------------------------

export function beregnSkatt(input: TaxInput, year: number = TAX_YEAR): TaxResult {
  const r = getTaxRules(year)
  const { lonnsInntekt, pensjonsinntekt, næringsInntekt, kapitalInntekt, andreFradrag,
          renteutgifter, arbeidsreiseFradrag, fagforeningskontingent, pensjonspremie,
          utgiftsgodtgjørelse, bsuSkattefradrag } = input

  // Minstefradrag — lønn følger den kanoniske kilden (med gulv), pensjon er A-lokal
  const minstefradragLonn = Math.min(
    r.minstefradragMaks,
    Math.max(lonnsInntekt > 0 ? r.minstefradragMin : 0, Math.round(lonnsInntekt * r.minstefradragSats / 100)),
  )
  const minstefradragPensjon = Math.min(
    Math.round(pensjonsinntekt * PENSJON.minstefradragSats),
    PENSJON.minstefradragMaks,
  )

  const personinntekt = lonnsInntekt + næringsInntekt + utgiftsgodtgjørelse
  const fagforeningFradrag = Math.min(fagforeningskontingent, r.fagforeningsfradragMaks)

  const totalInntekt = lonnsInntekt + pensjonsinntekt + næringsInntekt + kapitalInntekt + utgiftsgodtgjørelse
  const samledeFradrag = andreFradrag + renteutgifter + arbeidsreiseFradrag + fagforeningFradrag + pensjonspremie
  const alminneligInntekt = Math.max(0,
    totalInntekt - minstefradragLonn - minstefradragPensjon - samledeFradrag - r.personfradrag)

  const skattAlminneligSats = r.alminneligInntektSats / 100
  const skattAlminneligInntekt = Math.round(alminneligInntekt * skattAlminneligSats)

  // Trinnskatt: total fra den kanoniske algoritmen (B), linjer for visning
  const trinnskatt = Math.round(calcTrinnskatt(personinntekt, r.trinnskattBrackets))
  const trinnskattLinjer = byggTrinnskattLinjer(personinntekt, r.trinnskattBrackets)

  // Trygdeavgift: lønn fra den kanoniske kilden (med frigrense); pensjon/næring A-lokalt
  const trygdeavgiftLonn = calcTrygdeavgift(lonnsInntekt, r)
  const trygdeavgiftPensjon = Math.round(pensjonsinntekt * PENSJON.trygdeavgift)
  const trygdeavgiftNæring = Math.round(næringsInntekt * NÆRING.trygdeavgift)

  // Formue
  const skattemessigFormue =
    Math.round(input.primaerboligVerdi * 0.25) +
    Math.round(input.sekundaerboligVerdi * 1.00) +
    Math.round(input.bankinnskudd * 1.00) +
    Math.round(input.aksjerFondVerdi * 0.80) +
    Math.round(input.annenFormue * 1.00)
  const nettoFormue = Math.max(0, skattemessigFormue - input.gjeld)
  const skattepliktigFormue = Math.max(0, nettoFormue - FORMUE.grense)
  const { kommunal: formueskattKommunal, statlig: formueskattStatlig } = beregnFormueskatt(nettoFormue)

  // BSU skattefradrag (maks 10 % av årets maks-innskudd)
  const bsuMaksFradrag = Math.round(r.bsuMaksInnskuddPerAar * r.bsuFradragSats / 100)
  const bsuSkattefradragBeløp = Math.min(Math.round(bsuSkattefradrag), bsuMaksFradrag)

  // Split: inntektsskatt (sammenlignbar med forskuddstrekk) vs formueskatt
  const skattInntekt = Math.max(0, skattAlminneligInntekt + trinnskatt
    + trygdeavgiftLonn + trygdeavgiftPensjon + trygdeavgiftNæring
    - bsuSkattefradragBeløp)
  const skattFormue = formueskattKommunal + formueskattStatlig
  const totalSkatt = skattInntekt + skattFormue

  const effektivSats = totalInntekt > 0 ? totalSkatt / totalInntekt : 0

  const topTrinnskattSats = (() => {
    const sorted = [...r.trinnskattBrackets].sort((a, b) => a.threshold - b.threshold)
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (personinntekt > sorted[i].threshold) return sorted[i].rate / 100
    }
    return 0
  })()
  const marginalSats = skattAlminneligSats + (r.trygdeavgiftSats / 100) + topTrinnskattSats

  return {
    minstefradragLonn,
    minstefradragPensjon,
    alminneligInntekt,
    personinntekt,
    skattemessigFormue,
    nettoFormue,
    skattepliktigFormue,
    skattAlminneligInntekt,
    trinnskatt,
    trinnskattLinjer,
    trygdeavgiftLonn,
    trygdeavgiftPensjon,
    trygdeavgiftNæring,
    formueskattKommunal,
    formueskattStatlig,
    fagforeningFradrag,
    bsuSkattefradragBeløp,
    skattInntekt,
    skattFormue,
    totalSkatt,
    totalInntekt,
    effektivSats,
    marginalSats,
    estimertMånedligTrekk: Math.round(skattInntekt / 10.5),
  }
}
```

- [ ] **Step 4: Oppdater kallet i Skattekalkulator-siden**

I `src/pages/TaxCalculatorPage.tsx`, finn linje 130:
```ts
  const result = useMemo(() => beregnSkatt(effectiveInput, CURRENT_RATES), [effectiveInput])
```
Erstatt med:
```ts
  const result = useMemo(() => beregnSkatt(effectiveInput), [effectiveInput])
```
(Importen `CURRENT_RATES` på linje 11 beholdes — den brukes fortsatt til visnings-etiketter i JSX.)

- [ ] **Step 5: Kjør tester + typecheck + build**

Run: `npx vitest run src/domain/economy/__tests__/norwegianTaxCalc.test.ts && npm run typecheck && npm run build`
Expected: Alle nye tester PASS (konsistens + split), ingen typefeil, build OK. (`estimertMånedligTrekk` bruker nå `skattInntekt` i stedet for `totalSkatt` — riktig, siden månedstrekk ikke dekker formueskatt.)

- [ ] **Step 6: Kjør hele suiten**

Run: `npx vitest run`
Expected: Alt grønt.

- [ ] **Step 7: Commit**

```bash
git add src/domain/economy/norwegianTaxCalc.ts src/pages/TaxCalculatorPage.tsx src/domain/economy/__tests__/norwegianTaxCalc.test.ts
git commit -m "refactor(skatt): Skattekalkulator-motor bruker kanonisk norwegianTaxRules

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Restskatt-saldo — ren hjelper, ett fortegn, én live kilde

**Files:**
- Modify: `src/domain/economy/taxSettlementCalc.ts` (ny eksport)
- Modify: `src/pages/economy/TaxSettlementPage.tsx` (KPI ~249-251, detaljrad ~830-836, ~1020-1028)
- Test: `src/domain/economy/__tests__/taxSettlementCalc.test.ts` (utvid)

- [ ] **Step 1: Skriv test for saldo-hjelperen**

Legg til nederst i `src/domain/economy/__tests__/taxSettlementCalc.test.ts`:

```ts
import { settlementBalance } from '../taxSettlementCalc'

describe('settlementBalance — fortegn (positivt = til gode)', () => {
  it('trekk > skatt → positivt (til gode)', () => {
    expect(settlementBalance(120_000, 100_000)).toBe(20_000)
  })
  it('trekk < skatt → negativt (restskatt)', () => {
    expect(settlementBalance(90_000, 100_000)).toBe(-10_000)
  })
  it('likt → 0', () => {
    expect(settlementBalance(100_000, 100_000)).toBe(0)
  })
})
```

- [ ] **Step 2: Kjør og se at den feiler**

Run: `npx vitest run src/domain/economy/__tests__/taxSettlementCalc.test.ts`
Expected: FAIL — `settlementBalance` finnes ikke.

- [ ] **Step 3: Legg til hjelperen**

Legg til nederst i `src/domain/economy/taxSettlementCalc.ts`:

```ts
/**
 * Skatteoppgjørs-saldo. Positivt = til gode (du får penger),
 * negativt = restskatt (du skylder). Samme konvensjon som
 * TaxSettlementRecord.skattTilGodeEllerRest.
 */
export function settlementBalance(innbetaltTrekk: number, beregnetInntektsskatt: number): number {
  return Math.round(innbetaltTrekk - beregnetInntektsskatt)
}
```

- [ ] **Step 4: Kjør og bekreft grønt**

Run: `npx vitest run src/domain/economy/__tests__/taxSettlementCalc.test.ts`
Expected: PASS.

- [ ] **Step 5: Bruk hjelperen i detaljraden (snu fortegnet til samme som KPI)**

I `src/pages/economy/TaxSettlementPage.tsx`, importer hjelperen. Finn linje 13:
```ts
import { analyzeTaxSettlements } from '@/domain/economy/taxSettlementCalc'
```
Erstatt med:
```ts
import { analyzeTaxSettlements, settlementBalance } from '@/domain/economy/taxSettlementCalc'
```

I `TaxForecastSection`, finn (rundt linje 830):
```ts
  const deficit = estimatedTax > 0 && projectedWithheld > 0 ? estimatedTax - projectedWithheld : null
```
Erstatt med (saldo: positivt = til gode):
```ts
  const saldo = estimatedTax > 0 && projectedWithheld > 0 ? settlementBalance(projectedWithheld, estimatedTax) : null
```

Finn deretter de avledede flaggene (rundt linje 833-835):
```ts
  const onTrack = deficit !== null && Math.abs(deficit) < 2000
  const overPaying = deficit !== null && deficit < -2000
  const underPaying = deficit !== null && deficit > 2000
```
Erstatt med (overPaying = betaler for mye = til gode = positiv saldo):
```ts
  const onTrack = saldo !== null && Math.abs(saldo) < 2000
  const overPaying = saldo !== null && saldo > 2000
  const underPaying = saldo !== null && saldo < -2000
```

- [ ] **Step 6: Oppdater detaljrad-teksten til samme fortegn**

I samme fil, finn meldingsblokkene som bruker `deficit!` (rundt linje 974, 982) og saldo-raden (rundt linje 1026). Erstatt de tre forekomstene:

Overpaying-melding (rundt 974):
```ts
                Du betaler for mye. Prognosen tilsier {fmtNOK(Math.abs(deficit!))} til gode ved oppgjør.
```
→
```ts
                Du betaler for mye. Prognosen tilsier {fmtNOK(Math.abs(saldo!))} til gode ved oppgjør.
```

Underpaying-melding (rundt 982):
```ts
                Du risikerer restskatt på ~{fmtNOK(deficit!)} ved årets slutt.
```
→
```ts
                Du risikerer restskatt på ~{fmtNOK(Math.abs(saldo!))} ved årets slutt.
```

Saldo-raden (rundt 1026):
```ts
                      {deficit! >= 0 ? '+' : ''}{fmtNOK(deficit!)}
```
→
```ts
                      {saldo! >= 0 ? '+' : ''}{fmtNOK(saldo!)}
```

Og `monthlyAdjustment` (rundt linje 832) som bruker `deficit`:
```ts
  const monthlyAdjustment = deficit !== null && monthsRemaining > 0 ? Math.round(deficit / monthsRemaining) : null
```
→ (positiv saldo = til gode → kan redusere trekk; negativ = restskatt → øk trekk)
```ts
  const monthlyAdjustment = saldo !== null && monthsRemaining > 0 ? Math.round(-saldo / monthsRemaining) : null
```

- [ ] **Step 7: Gjør KPI-chipen til samme live-kilde (ikke lagret expectedTax)**

KPI-chipen «Forventet saldo» bruker i dag lagret `taxForecast.expectedTax`. La den i stedet bruke samme live B-beregning som prognoseseksjonen. I `TaxSettlementPage` (komponent-nivå, rundt linje 248-251), finn:
```ts
  const withheldYTD = skattetrekkYTD + ekstraTrekkYTD
  const expectedTax = taxForecast?.expectedTax ?? null
  const projectedGap = expectedTax !== null ? projectedWithheld - expectedTax : null
```
Erstatt med (beregn live inntektsskatt fra B med samme auto-fyll-grunnlag som prognoseseksjonen; positivt = til gode):
```ts
  const withheldYTD = skattetrekkYTD + ekstraTrekkYTD
  const liveExpectedTax = taxAutoFill.expectedIncome > 0
    ? calcNorwegianTax(
        taxForecast?.expectedIncome ?? taxAutoFill.expectedIncome,
        currentYear,
        {
          fagforeningskontingent: taxForecast?.fagforeningskontingent ?? taxAutoFill.fagforeningskontingent,
          bsuInnskuddThisYear: taxForecast?.bsuInnskuddThisYear ?? taxAutoFill.bsuInnskuddThisYear,
          pensjonspremie: taxForecast?.pensjonspremie ?? taxAutoFill.pensjonspremie,
          gjeldsrenter: taxForecast?.gjeldsrenter ?? taxAutoFill.gjeldsrenter,
          renteinntekter: taxForecast?.renteinntekter ?? taxAutoFill.renteinntekter,
          reisefradragBrutto: taxForecast?.reisefradragBrutto ?? 0,
          utgiftsgodtgjoerelseOverskudd: taxForecast?.utgiftsgodtgjoerelseOverskudd ?? 0,
        },
      ).skattEtterFradrag
    : null
  const expectedTax = liveExpectedTax
  const projectedGap = expectedTax !== null ? settlementBalance(projectedWithheld, expectedTax) : null
```
(`projectedGap` beholder samme retning som før: positivt = til gode. Resten av KPI-chip-JSX-en er uendret.)

- [ ] **Step 8: Typecheck + build + full test**

Run: `npm run typecheck && npm run build && npx vitest run`
Expected: Ingen typefeil (`deficit` skal ikke lenger finnes — søk og bekreft at alle er erstattet med `saldo`), build OK, alle tester grønne.

- [ ] **Step 9: Commit**

```bash
git add src/domain/economy/taxSettlementCalc.ts src/domain/economy/__tests__/taxSettlementCalc.test.ts src/pages/economy/TaxSettlementPage.tsx
git commit -m "fix(skatt): ett fortegn og én live kilde for restskatt/tilgode

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: «Bruk i skatteprognose» sender inntektsskatt uten formueskatt

**Files:**
- Modify: `src/pages/TaxCalculatorPage.tsx:146-148`

- [ ] **Step 1: Endre hva som sendes til prognosen**

I `src/pages/TaxCalculatorPage.tsx`, finn `sendToSkattPrognose` (rundt linje 142-149):
```ts
      taxForecast: {
        year: currentYear,
        expectedIncome: result.totalInntekt,
        expectedTax: result.totalSkatt,
      },
```
Erstatt med (inntektsskatt-delen, sammenlignbar med forskuddstrekk):
```ts
      taxForecast: {
        year: currentYear,
        expectedIncome: result.totalInntekt,
        expectedTax: result.skattInntekt,
      },
```

- [ ] **Step 2: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: Ingen typefeil, build OK.

- [ ] **Step 3: Commit**

```bash
git add src/pages/TaxCalculatorPage.tsx
git commit -m "fix(skatt): send inntektsskatt (uten formueskatt) til skatteprognosen

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Trekk-projeksjon — ekstratrekk halveres ikke i desember

**Files:**
- Modify: `src/domain/economy/taxSettlementCalc.ts` (ny eksport)
- Modify: `src/pages/economy/TaxSettlementPage.tsx:156-182`
- Test: `src/domain/economy/__tests__/taxSettlementCalc.test.ts` (utvid)

- [ ] **Step 1: Skriv test for projeksjonshjelperen**

Legg til nederst i `src/domain/economy/__tests__/taxSettlementCalc.test.ts`:

```ts
import { projectFullYearWithholding } from '../taxSettlementCalc'

describe('projectFullYearWithholding', () => {
  // Slipper for jan–mai (5 normale mnd): 10 000 skattetrekk + 1 000 ekstratrekk hver
  const slips = [1, 2, 3, 4, 5].map((month) => ({ month, skattetrekk: 10_000, ekstraTrekk: 1_000 }))

  it('halverer kun skattetrekk i desember, ikke ekstratrekk', () => {
    const total = projectFullYearWithholding(slips)
    // jan–mai faktisk: 5 × 11 000 = 55 000
    // juni: 0
    // jul–nov (5 mnd): snitt normal = 11 000 → 5 × 11 000 = 55 000
    // des: halvt skattetrekk (5 000) + fullt ekstratrekk (1 000) = 6 000
    expect(total).toBe(55_000 + 0 + 55_000 + 6_000)
  })

  it('returnerer 0 uten slipper', () => {
    expect(projectFullYearWithholding([])).toBe(0)
  })
})
```

- [ ] **Step 2: Kjør og se at den feiler**

Run: `npx vitest run src/domain/economy/__tests__/taxSettlementCalc.test.ts`
Expected: FAIL — `projectFullYearWithholding` finnes ikke.

- [ ] **Step 3: Legg til hjelperen**

Legg til nederst i `src/domain/economy/taxSettlementCalc.ts`:

```ts
export interface WithholdingSlip {
  month: number
  skattetrekk: number
  ekstraTrekk: number
}

/**
 * Projiserer fullt års forskuddstrekk fra registrerte slipper.
 * Spesialmåneder:
 *   Juni: 0 (trekkfrie feriepenger — bevisst forenkling for manglende juni)
 *   Desember: halvt tabelltrekk + FULLT ekstratrekk (frivillig fast beløp halveres ikke)
 *   Øvrige måneder uten slip: snitt av normale slipper (ekskl. juni/desember)
 */
export function projectFullYearWithholding(slips: WithholdingSlip[]): number {
  if (slips.length === 0) return 0
  const byMonth = new Map(slips.map((s) => [s.month, s]))
  const normal = slips.filter((s) => s.month !== 6 && s.month !== 12)
  const avgSkatt = normal.length > 0
    ? normal.reduce((sum, s) => sum + s.skattetrekk, 0) / normal.length
    : 0
  const avgEkstra = normal.length > 0
    ? normal.reduce((sum, s) => sum + s.ekstraTrekk, 0) / normal.length
    : 0

  let total = 0
  for (let mo = 1; mo <= 12; mo++) {
    const slip = byMonth.get(mo)
    if (slip) {
      total += slip.skattetrekk + slip.ekstraTrekk
    } else if (mo === 6) {
      total += 0
    } else if (mo === 12) {
      total += Math.round(avgSkatt * 0.5) + Math.round(avgEkstra)
    } else {
      total += Math.round(avgSkatt) + Math.round(avgEkstra)
    }
  }
  return total
}
```

- [ ] **Step 4: Kjør og bekreft grønt**

Run: `npx vitest run src/domain/economy/__tests__/taxSettlementCalc.test.ts`
Expected: PASS.

- [ ] **Step 5: Bruk hjelperen i Skatteoppgjør-siden**

I `src/pages/economy/TaxSettlementPage.tsx`, oppdater importen fra Step 3 (Task 3) til også å hente projeksjonshjelperen:
```ts
import { analyzeTaxSettlements, settlementBalance } from '@/domain/economy/taxSettlementCalc'
```
→
```ts
import { analyzeTaxSettlements, settlementBalance, projectFullYearWithholding } from '@/domain/economy/taxSettlementCalc'
```

Finn deretter blokken som beregner `projectedWithheld` (linje 156-182, fra `const slipsByMonth = ...` til og med slutten av `projectedWithheld`-uttrykket) og erstatt HELE blokken med:
```ts
  const projectedWithheld = slipMonth > 0
    ? projectFullYearWithholding(slipsThisYear.map((m) => ({
        month: m.month,
        skattetrekk: m.slipData!.skattetrekk ?? 0,
        ekstraTrekk: m.slipData!.ekstraTrekk ?? 0,
      })))
    : skattRow
      ? Math.abs(skattRow.annualActual) + Math.abs(ekstraRow?.annualActual ?? 0)
      : 0
```
(Dette fjerner de nå ubrukte lokale variablene `slipsByMonth`, `normalSlips`, `avgMonthlyWithheld` — bekreft at de ikke brukes andre steder.)

- [ ] **Step 6: Typecheck + build + full test**

Run: `npm run typecheck && npm run build && npx vitest run`
Expected: Ingen typefeil (ingen ubrukte lokale variabler), build OK, alle tester grønne.

- [ ] **Step 7: Commit**

```bash
git add src/domain/economy/taxSettlementCalc.ts src/domain/economy/__tests__/taxSettlementCalc.test.ts src/pages/economy/TaxSettlementPage.tsx
git commit -m "fix(skatt): ekstratrekk halveres ikke i desember i trekk-projeksjonen

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review-notater

- **Spec-dekning:** Kanonisk modul + delte algoritmer (T1); A bruker B for satser+algoritmer, formueskatt-split, TaxResult-skille (T2); restskatt ett fortegn + én live kilde + formueskatt ute (T3); sendToSkattPrognose uten formueskatt (T4); trekk-projeksjon Dec-ekstratrekk (T5); tester (T1, T2, T3, T5). Alle spec-seksjoner dekket.
- **Typekonsistens:** `skattInntekt`/`skattFormue` definert i T2 TaxResult, brukt i T3/T4. `settlementBalance(innbetalt, skatt)` og `projectFullYearWithholding(slips)` signaturer konsistente mellom test og bruk. `calcTrinnskatt`/`calcTrygdeavgift` eksportert i T1, brukt i T2.
- **Plassholder-skanning:** Ingen TBD/TODO. Satsverdier er bevisst brukerverifiserte (dokumentert), ikke en plan-luke. Karakteriseringstallene i T1 justeres til faktisk output i Step 4.
- **Fortegns-fellen:** I dag er `deficit = skatt − trekk` (+ = restskatt). Ny `saldo = trekk − skatt` (+ = til gode). `overPaying`/`underPaying` er snudd tilsvarende (T3 Step 5). Bekreft at ingen `deficit`-referanser står igjen.
