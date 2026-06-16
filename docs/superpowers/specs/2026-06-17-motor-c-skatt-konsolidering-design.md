# Design: Samle boligkalkulatorens skattemotor (C) på den kanoniske motoren (B)

**Dato:** 2026-06-17
**Status:** Godkjent design

## Problem

Boligkalkulatoren beregner husholdningens nettoinntekt (for affordability / maks
lånebeløp) via en tredje skattemotor, `src/utils/tax.ts` (motor C), som henter
satser fra `defaultConfig.tax` (`TaxConfig`). Disse satsene er foreldede og avviker
fra den kanoniske motoren `norwegianTaxRules.ts` (B) som nå driver resten av appen
(skatteoppgjør, budsjett-trekk, skattekalkulator):

| 2026-parameter | Motor C (`TaxConfig`) | Motor B (kanonisk) |
|---|---|---|
| personfradrag | 110 400 | 114 540 |
| minstefradrag maks | 108 550 | 95 700 |
| trygdeavgift | 7,6 % flat (ingen frigrense) | 7,6 % m/frigrense + overgangsregel |
| trinnskatt-grenser | 232 500 / 324 000 / … (avrundede estimater) | 226 100 / 318 300 / … (offisielle) |

Resultat: boligkalkulatorens nettoinntekt — og dermed maks kjøpesum — bygger på feil
skatt, og henger ikke sammen med resten av appen.

**Viktig premiss (verifisert):** `config.tax` er ALDRI bruker-redigerbar.
`SettingsPanel` redigerer kun `lendingRules`, `fees` og `sifo`. `defaultConfig.tax`
er i praksis en hardkodet konstant. Å samle den på B fjerner derfor ingen funksjon.

## Beslutninger (fra brainstorming)

- **Omfang:** Motor A + B ble samlet i forrige omgang. Denne omgangen samler motor C.
- **Oppryddingsgrad:** Full opprydding — `utils/tax` delegerer til B, signaturene
  endres fra `config: TaxConfig` til `year?`, og den døde `tax`-konfigen + `TaxConfig`-
  typen fjernes helt.
- **År:** Helperne bruker inneværende år som standard; `getTaxRules` faller tilbake på
  siste kjente år, så boligkalkulatoren projiserer med gjeldende regler (og virker
  også i 2027+).

## Løsning

### 1. `src/utils/tax.ts` — deleger til B

- `calcAnnualTax(grossIncome: number, year: number = new Date().getFullYear()): number`
  → returnerer `calcNorwegianTax(grossIncome, year).skattEtterFradrag`.
- `calcMonthlyNetIncome(grossIncome: number, year?: number): number`
  → `(grossIncome − calcAnnualTax(grossIncome, year)) / 12`.
- `calcHouseholdMonthlyNetIncome(primaryGross, coApplicantGross, year?: number): number`
  → samme logikk, dropper `config`-parameteren.
- `calcTotalAnnualIncome(...)` — ren inntektssum, **uendret** (bruker ingen skatt/konfig).
- De lokale hjelperne `minstefradrag` og `calcBracketTax` og importen av `TaxConfig`
  fjernes. Ny import: `calcNorwegianTax` fra `@/domain/economy/norwegianTaxRules`.

### 2. Kallerne dropper `config.tax`

- `src/utils/affordability.ts:92`: `calcHouseholdMonthlyNetIncome(primaryGross, coGross, config.tax)`
  → `calcHouseholdMonthlyNetIncome(primaryGross, coGross)`.
- `src/utils/maxPurchase.ts:101`: samme endring.
- `src/utils/calculator.ts` og `src/hooks/useVeikart.ts` er upåvirket (bruker bare
  `calcTotalAnnualIncome` / `calcMaxPurchase`, ikke net-income-skatt direkte).

### 3. Fjern den døde skatte-konfigen

- `src/config/default.config.ts`: fjern hele `tax: { … }`-blokken (linje ~128).
- `src/types/index.ts`: fjern `tax: TaxConfig` fra `AppConfig` (linje ~516) og hele
  `TaxConfig`-interfacet (linje ~469).
- `src/store/useAppStore.ts`: i v<2-migreringen (linje ~154-157), fjern `tax: { …
  defaultConfig.tax … }`-undblokken (den refererer `defaultConfig.tax` som forsvinner).
  Resten av migreringens deep-merge beholdes. En evt. gjenliggende `tax`-nøkkel i
  gammel persistert state er harmløs (ignoreres).
- Verifiser at ingen andre filer importerer `TaxConfig` eller leser `config.tax`
  (typecheck må fange dette).

### 4. Tester — `src/utils/__tests__/tax.test.ts`

- Oppdater signaturene: `calcAnnualTax(gross)` / `calcMonthlyNetIncome(gross)` (uten
  `defaultConfig.tax`-argument). Sett forventede verdier til faktisk B-avledet output
  (karakteriseringsbaseline; kommentér at de oppdateres ved satsendring).
- Ny konsistenstest: `calcAnnualTax(lønn)` == `calcNorwegianTax(lønn, år).skattEtterFradrag`
  for et par lønnsnivåer — beviser at boligkalkulatoren og resten av appen er enige.
- `calculator.test.ts` og andre som bruker `defaultConfig` kjører videre uendret (de
  rører ikke skatt direkte), men kan få justerte forventningstall hvis et avledet
  affordability-tall endres — oppdater til faktisk output der det skjer.

## Konsekvenser

- Boligkalkulatorens nettoinntekt og maks kjøpesum/lånebeløp endres litt (mer korrekt,
  matcher resten av appen). Tilsiktet.
- Etter denne omgangen finnes det kun ÉN skattemotor (`norwegianTaxRules`) i hele appen.

## Utenfor scope

- Endring av lending-regler, fees, SIFO eller andre deler av `AppConfig`.
- Endring av selve B-motoren eller 2026-satsene (allerede verifisert i forrige omgang).
