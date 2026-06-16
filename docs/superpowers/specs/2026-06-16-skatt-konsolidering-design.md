# Design: Konsolidering av skattemotorer og korrekt restskatt/tilgode

**Dato:** 2026-06-16
**Status:** Godkjent design

## Problem

Skatteberegningen er fragmentert over tre motorer med ulike (delvis foreldede)
konstanter, så tallene henger ikke sammen og restskatt/tilgode kan bli feil eller
selvmotsigende:

| Parameter (2026) | A: `norwegianTaxCalc`<br>(Skattekalkulator) | B: `norwegianTaxRules`<br>(Skatteoppgjør + budsjett-trekk) | C: `utils/tax`+config<br>(Boligkalkulator) |
|---|---|---|---|
| personfradrag | 108 550 | 114 540 | 110 400 |
| minstefradrag maks | 92 000 | 95 700 | 108 550 |
| trygdeavgift | 7,8 % flat | 7,6 % m/frigrense | 7,6 % flat |
| trinnskatt trinn 4/5 | 16,8 / 17,8 % | 16,8 / 17,8 % | 16,7 / 17,7 % |
| formueskatt | ja | nei | nei |

Konkrete feil som rammer restskatt/tilgode:

1. **Motstridende fortegn på samme side.** KPI-chipen «Forventet saldo» regner
   `trekk − skatt` (+ = til gode). Detaljraden i prognoseseksjonen regner
   `skatt − trekk` og viser «+X» som restskatt — motsatt av KPI-chipen og av
   `TaxSettlementRecord.skattTilGodeEllerRest` (negativt = restskatt).
2. **`expectedTax` har to kilder.** KPI-chipen bruker lagret
   `taxForecast.expectedTax`, satt enten av B (Skatteoppgjør-prognosen, uten
   formueskatt) eller av A (Skattekalkulatorens «Bruk i skatteprognose», inkl.
   formueskatt + foreldede satser). De to restskatt-tallene på siden kan sprike.
3. **Tre motorer som ikke er enige.** Samme inntekt gir tre ulike årsskattetall.
4. **Trekk-projeksjon:** desember halverer også ekstratrekk (frivillig fast beløp
   som ikke halveres), og manglende juni antas = 0.

## Beslutninger (fra brainstorming)

- **Omfang:** Denne omgangen samler motor **A + B** (det som gir restskatt). Motor
  **C** (boligkalkulatorens `utils/tax` + `TaxConfig`) holdes **uté** og tas som
  egen oppfølging.
- **Samlingsdybde:** Full samling — B blir kanonisk kilde for både satser **og**
  kjernealgoritmer. A beholder sine ekstra inntektstyper + formueskatt + visning,
  men henter satser og trinnskatt/trygd fra B.
- **Satsverdier:** Brukeren verifiserer offisielle 2026-tall mot skatteetaten.no
  og oppgir fasit. B sine nåværende verdier beholdes som plassholder inntil da.

## Løsning

### 1. Kanonisk skattemodul — `src/domain/economy/norwegianTaxRules.ts`

Eneste kilde for 2026-satser (`TAX_RULES`) og kjernealgoritmer. Eksporterer
gjenbrukbare byggeklosser slik at motor A kan dele dem:

- `getTaxRules(year): YearRules` (finnes).
- `calcTrinnskatt(income, brackets): number` — **eksporteres** (er i dag privat).
- `calcTrygdeavgift(income, rules): number` — **eksporteres** (med frigrense/
  overgangsregel; i dag privat).
- `calcNorwegianTax(...)` (finnes) — kanonisk inntektsskatt for lønn.

Ingen logikk-endring i tallene her utover å gjøre to funksjoner eksporterbare.
De verifiserte 2026-satsene legges inn i `TAX_RULES[2026]` når brukeren oppgir
dem (ett sted, flyter til alle konsumenter).

### 2. Skattekalkulator-motor som lag oppå B — `src/domain/economy/norwegianTaxCalc.ts`

`beregnSkatt(input, year?)` refaktoreres slik at den ikke lenger har egne,
foreldede konstanter eller en forenklet trygdeavgift:

- Henter satser fra `getTaxRules(year)` i stedet for sin egen `TAX_RATES_2026`.
- Bruker B sine `calcTrinnskatt` og `calcTrygdeavgift` (med frigrense) for de
  komponentene — identisk algoritme som Skatteoppgjør og budsjett-trekk.
- Beholder det B ikke dekker: flere inntektstyper (pensjon, næring, kapital),
  minstefradrag pensjon, og **formueskatt** som et eksplisitt tillegg på toppen
  av inntektsskatten, samt visnings-breakdown (trinnskattlinjer, effektiv/
  marginal sats).
- `TaxResult` får et tydelig skille mellom inntektsskatt og formueskatt slik at
  konsumenter kan be om inntektsskatt-delen alene (brukes av restskatt-flyten).

Den lokale `TAX_RATES_2026`/`CURRENT_RATES`-konstanten i denne fila fjernes;
satser kommer fra B. Trinnskatt-grensene er allerede like, så tallene endres ikke
av selve refaktoren (kun trygdeavgift blir korrekt med frigrense og
personfradrag/minstefradrag følger B).

### 3. Restskatt/tilgode — én formel, ett fortegn, én kilde

I `src/pages/economy/TaxSettlementPage.tsx`:

- **Formel overalt:** `tilgode = innbetalt trekk − beregnet inntektsskatt`.
  **Positivt = til gode, negativt = restskatt.** Detaljradens motsatte fortegn
  snus, så KPI-chip og detaljrad bruker samme konvensjon og farge/etikett.
- **Beregnet inntektsskatt** for sammenligningen beregnes **alltid live** via den
  kanoniske B-motoren ut fra prognoseseksjonens inputs, og deles av både
  KPI-chipen og detaljraden (ett tall — kan ikke sprike). Lagret
  `taxForecast.expectedTax` brukes ikke lenger som separat kilde til
  restskatt-tallet.
- **Formueskatt holdes UTE** av restskatt-sammenligningen (forskuddstrekk på lønn
  dekker ikke formueskatt).
- Skattekalkulator-fanens `sendToSkattPrognose` sender **inntektsskatt-delen uten
  formueskatt** (fra det nye skillet i `TaxResult`), så det som lagres er
  sammenlignbart med trekket.

### 4. Trekk-projeksjon — `projectedWithheld`

I `TaxSettlementPage.tsx`:

- Skill gjennomsnittlig skattetrekk og gjennomsnittlig ekstratrekk. I desember:
  halver kun det tabellbaserte skattetrekket; behold ekstratrekk fullt.
- Manglende juni = 0 trekk beholdes, med en kommentar om at det er en bevisst
  forenkling (feriepenger er trekkfrie).

### 5. Tester

- `norwegianTaxRules.test.ts` (ny/utvidet): kanonisk motor mot et par kjente
  referansecaser (representative lønninger → forventet samlet inntektsskatt), så
  satsendringer som bryter en kjent fasit fanges.
- `norwegianTaxCalc` ↔ `norwegianTaxRules` konsistenstest: for en lønns-only input
  skal A sin inntektsskatt (uten formueskatt) være lik B.
- Restskatt-fortegnstest: trekk > skatt → positivt (til gode); trekk < skatt →
  negativt (restskatt).
- Trekk-projeksjonstest: ekstratrekk halveres ikke i desember.

## Konsekvenser

- Skattekalkulator-fanen vil vise litt andre tall enn før: trygdeavgift får
  frigrense, og personfradrag/minstefradrag følger B sine (mer oppdaterte)
  verdier. Dette er tilsiktet (A var foreldet).
- Når brukeren legger inn verifiserte 2026-satser, endres alle tre konsumentene
  (Skattekalkulator, budsjett-trekk, restskatt) samtidig fra ett sted.

## Utenfor scope

- Motor C (`utils/tax` + `TaxConfig` + boligkalkulatorens nettoinntekt-kjede:
  `calculator.ts`, `affordability.ts`, `maxPurchase.ts`). Egen oppfølging.
- Endring av den offisielle trekktabell-kilden (`trekktabellLookup`) — den er
  allerede autoritativ for budsjettets trekk.
- Faktisk fastsetting av de offisielle 2026-tallene (brukeren verifiserer).
