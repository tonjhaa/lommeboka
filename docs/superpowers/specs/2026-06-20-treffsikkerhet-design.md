# Treffsikkerhet (aktiv kalibrering) — Design

**Dato:** 2026-06-20
**Status:** Godkjent design — klar for implementeringsplan
**Branch:** `feat/treffsikkerhet`

## Sammendrag

«Treffsikkerhet» måler hvor godt budsjett-prognosen treffer faktiske tall, og
**kalibrerer estimatene automatisk** via glidende (trimmet) snitt av importerte
lønnsslipper. Den erstatter dagens skjulte «siste-verdi»-oppdatering i `importSlip`
med en mer robust, transparent og reversibel mekanisme. Dette er delprosjekt #6 av to
relaterte (Scenario-simulator #7 følger som egen runde og bygger på treffsikkerheten).

## Mål og avgrensning

**Mål**
- Aktiv kalibrering: ikke bare måle avvik, men forbedre fremtidige prognoser automatisk.
- Mer robust enn dagens «siste-verdi»: glidende trimmet snitt demper enkeltmåned-blips.
- Transparent og reversibel: logg over hva som ble justert; master-toggle; manuell overstyring vinner.
- Konsistens: skriver kun til eksisterende kilder (`profile`/`budgetTemplate`), sky-synket.

**Avgrensning (YAGNI)**
- **Kjerne v1 — inntekt/trekk fra slipper:** skattetrekk, /440-%, baseMonthly, ekstra trekk,
  husleietrekk, fagforening, ATF-satser, faste tillegg. Dette er hovedleveransen.
- **Sekundært — sparing/gjeld fra saldohistorikk:** tas med hvis datakilden viser seg ren
  (se Åpne punkter); ellers kun målt (ikke kalibrert) i v1. Ikke kritisk for kjernen.
- **Ikke forbruksutgifter** (mat/transport/fritid) — appen har ingen faktiske forbrukstall
  per kategori (bankimport kategoriserer ikke forbruk). Utgiftskalibrering venter på
  #5 Auto-kategorisering.
- Ingen prediktiv ML — ren trimmet snitt.

## Beslutninger (fra brainstorm)

| Spørsmål | Valg |
|----------|------|
| Hovedformål | Aktiv kalibrering (måle + foreslå + anvende) |
| Kalibreringsmodus | B — automatisk selvkalibrering, men ansvarlig (transparent + reversibel) |
| Hva kalibreres (v1) | Det vi har faktisk-data på (inntekt/trekk + sparing/gjeld). Ikke forbruksutgifter. |
| Arkitektur | Erstatter dagens `importSlip` siste-verdi-logikk (ikke et lag oppå) |

**Kontekst — appen kalibrerer allerede (skjult):** `importSlip` (useEconomyStore.ts
~linje 471–522) setter i dag `lastKnownTaxWithholding`, `lastKnownTableTaxPercent`,
`knownATFRates`, `baseMonthly`, faste tillegg m.m. fra *nyeste* slipp. B oppgraderer denne
mekanismen til (a) glidende trimmet snitt i stedet for siste-verdi, (b) bredere dekning,
(c) transparent logg + reversibilitet.

## Arkitektur

| Lag | Fil | Ansvar |
|-----|-----|--------|
| Domene | `src/domain/economy/forecastCalibration.ts` | Rene funksjoner: `selectNormalSlips`, `trimmedMean`, `calibrateProfile`, `computeAccuracy`. Ingen React/store. |
| Tester | `src/domain/economy/__tests__/forecastCalibration.test.ts` | Snitt-logikk, blip-robusthet, treff-%, locked, av/på, konsistens-invariant. |
| Typer | `src/types/economy.ts` (utvides) | `CalibrationKey`, `CalibrationEntry`, `CalibrationResult`, `AccuracyReport`, `CalibrationSettings`. |
| Store | `src/application/useEconomyStore.ts` | `importSlip`/`restoreProfileFromSlips` kaller `calibrateProfile`; nye felt `calibrationSettings`, `calibrationLog`, `lockedCalibrationKeys` + settere; persist v24-migrering; Supabase-synk. |
| Side | `src/pages/economy/ForecastAccuracyPage.tsx` | Treff-%, avvikstabell, kalibreringslogg, innstillinger. Ny `EconomySubPage`/`EconomyTab` `'calibration'` + nav (`Target`) + `MODULES`. |
| Dashboard | `EconomyDashboard.tsx` | Pengepuls-chip ved lav treffsikkerhet / vesentlig kalibrering. |

## Datamodell

```ts
export type CalibrationKey =
  | 'skattetrekk' | 'tabelltrekkProsent' | 'baseMonthly'
  | 'extraTaxWithholding' | 'housingDeduction' | 'unionFee'
  | `atf:${string}`          // per artskode (2230, 2232 …)
  | `tillegg:${string}`      // per kode (1501, 1162 …)
  | 'sparerate' | 'gjeldsavdrag'

export interface CalibrationEntry {
  key: CalibrationKey
  label: string
  previous: number
  calibrated: number
  sampleCount: number
  asOf: string               // "YYYY-MM-DD"
  locked: boolean            // true = manuelt overstyrt, auto rører den ikke
}

export interface CalibrationResult {
  entries: CalibrationEntry[]
  profilePatch: Partial<EmploymentProfile>
}

export interface AccuracyReport {
  rows: {
    key: string
    label: string
    avgBudget: number
    avgActual: number
    deviation: number        // actual − budget (kr)
    deviationPct: number
    sampleCount: number
  }[]
  overallHitRate: number     // 0–100: andel innenfor ±5 % toleranse
  monthsWithData: number
}

export interface CalibrationSettings {
  enabled: boolean           // master-toggle (default true)
  horizonSlips: number       // N normale slipper (default 6)
}
```

**Store-tillegg:** `calibrationSettings: CalibrationSettings`, `calibrationLog: CalibrationEntry[]`,
`lockedCalibrationKeys: string[]` + settere (`setCalibrationSettings`, `lockCalibration`,
`unlockCalibration`). Persist v23→v24 (legg `'calibration'` i `enabledTabs`). Supabase-synk:
de tre feltene legges i `saveToSupabase`-payload + `importData`.

## Beregning (`forecastCalibration.ts`, rene funksjoner)

1. **`selectNormalSlips(monthHistory, n)`** → siste `n` importerte slipper (`source ===
   'imported_slip'`), **ekskl. juni/desember** og slipper med `ferietrekk > 0`
   (feriepenger/ferietrekk forstyrrer snittet — samme ekskludering `taxSettlementCalc` bruker).
2. **`trimmedMean(values)`** → snitt etter å droppe høyeste + laveste når `n ≥ 4`
   (blip-demping); vanlig snitt for `2 ≤ n < 4`; verdien selv for `n = 1`; 0 for tom.
3. **`calibrateProfile(monthHistory, current, settings, lockedKeys)`** → `CalibrationResult`:
   - For hver `CalibrationKey`: hent verdiserie fra de normale slippene → `trimmedMean` → `CalibrationEntry`.
   - `enabled === false` → fall tilbake til dagens siste-verdi-oppførsel (ingen snitt).
   - `locked`-nøkler hoppes over (beholder `current`-verdi).
   - `tabelltrekkProsent`: ekskluder juni-slipper med ferietrekk (= dagens linje 499-regel).
   - `atf:<artskode>`: snitt av `sats`-verdiene per artskode.
   - Bygger `profilePatch: Partial<EmploymentProfile>` som store merger inn.
4. **`computeAccuracy(budgetTable, monthHistory)`** → `AccuracyReport`: bruker
   `BudgetCell.budget` vs `.actual` (kun måneder med slipp), per slipp-basert rad,
   `overallHitRate` = andel rader innenfor ±5 % toleranse.

**Når kalibrering kjører:** `importSlip` kaller `calibrateProfile(...)` (erstatter
useEconomyStore.ts ~471–522). `restoreProfileFromSlips` bruker samme funksjon → import-sti
og rebuild-sti kan ikke divergere.

## UI — `ForecastAccuracyPage.tsx`

1. **Treffsikkerhet-topp:** stort `overallHitRate` (%) + `monthsWithData` + kort status.
2. **Avvikstabell** (`AccuracyReport.rows`): snitt budsjett vs faktisk, avvik (kr + %),
   datapunkter; fargekodet (grønn innenfor ±5 %, gul/rød utenfor); sortert på størst avvik.
3. **Kalibreringslogg** (`calibrationLog`): «Skattetrekk: 18 000 → 18 478 (snitt 6 slipper,
   20.06.2026)». Hver rad: lås-knapp (🔒 → `locked`, auto slutter å røre den) + tilbakestill.
4. **Innstillinger-panel:** master-toggle «Auto-kalibrer prognoser» (default på), horisont-slider
   (3–12 normale slipper, default 6).

**Dashboard-chip:** vises ved lav treffsikkerhet eller nylig vesentlig kalibrering
(«🎯 Skattetrekk-estimat justert +478 kr/mnd»).

## Feilhåndtering / kanttilfeller

- < 2 slipper → tomtilstand «Importer flere lønnsslipper for å måle treffsikkerhet».
- 1 slipp → siste-verdi (ingen snitt mulig), `sampleCount = 1`.
- Manglende felt på en slipp → hopp i den seriens snitt.
- Kun juni/desember tilgjengelig → bruk dem heller enn ingenting, men flagg lav `sampleCount`.
- `enabled === false` → dagens siste-verdi-oppførsel uendret.

## Testing

`src/domain/economy/__tests__/forecastCalibration.test.ts` (domenetester):
- `selectNormalSlips` ekskluderer juni/desember + ferietrekk-slipper.
- `trimmedMean`: dropper høyeste+laveste ved n≥4; vanlig snitt n<4; **blip-test**
  (én slipp på 40 000 blant 18 000-er flytter estimatet minimalt).
- `calibrateProfile`: `locked`-nøkler urørt; `enabled:false` → siste-verdi-fallback;
  ATF per artskode; tom/1-slipp.
- `computeAccuracy`: treff-% mot ±5 %, kun måneder med actual teller.
- **Konsistens-invariant:** `enabled:false` gir samme `profilePatch` som dagens
  siste-verdi-logikk (låser at vi ikke endrer eksisterende oppførsel når auto er av).

## Konsistens-wiring (stående regel)

- Kalibrering skriver kun til `profile`/`budgetTemplate` — kilder som budsjett, Veikart,
  pensjon (G-grunnlag) og formue allerede leser. Kalibrerte tall propagerer automatisk
  overalt, begge veier.
- `importSlip` og `restoreProfileFromSlips` deler `calibrateProfile` → ingen divergens.
- `calibrationSettings`/`calibrationLog`/`lockedCalibrationKeys` i både persist og
  Supabase-synk → partner ser kalibrerte tall live; historikk bevares ved enhetsbytte.
- Se [[arbeidsregel-helhetlig-konsistens]].

## Åpne punkter til implementering

- Bekreft eksakt liste over hvilke felt dagens `importSlip` setter, så `enabled:false`-fallback
  matcher 1:1 (konsistens-invariant-testen låser dette).
- Avklar `sparerate`/`gjeldsavdrag`-kilder: faktisk saldovekst fra `balanceHistory`
  vs budsjettert månedssparing; gjeld fra `paymentHistory` vs `monthlyPayment`.
- Fastsett ±5 % toleranse for `overallHitRate` (justerbar konstant i config).
