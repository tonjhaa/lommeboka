# Boligkalkulator — kausjonist (realkausjon) — Design

**Dato:** 2026-06-22
**Status:** Godkjent design — klar for implementeringsplan
**Branch:** `feat/boligkalkulator-kausjonist`

## Sammendrag

Legge til kausjonist (realkausjon/tilleggssikkerhet) i den fulle boligkalkulatoren
(`analyzeMaxPurchase`). Kausjon modelleres som en «egenkapital-ekvivalent» som KUN løfter
egenkapital-/belåningsgrad-grensen — ikke gjeldsgrad eller betjeningsevne. Verktøyet svarer
på begge retninger: «maks kjøpesum MED kausjon» (forward) og «hvor mye kausjon trengs for å
nå målpris» (revers, gitt EK og inntekt), pluss en sjekk av om kausjonisten har nok fri
sikkerhet i egen bolig. Kausjon lever bare i boligkalkulatoren; de lettvekts «kjøpekraft»-
visningene ellers er urørt.

## Regulatorisk grunnlag

Utlånsforskriften (FOR-2024-12-18-3398, gjeldende):
- **Belåningsgrad maks 90 %** (EK-krav 10 % for førstehjemslån; koden bruker allerede
  `minEquityPercent: 10`). § 7.
- **Gjeldsgrad maks 5× brutto årsinntekt.** § 8.
- **Betjeningsevne:** tåle 3 pp renteøkning (stresstest). Koden: `stressTestAddition: 3.0`.
- **Tilleggssikkerhet (§ 7):** «Ved beregning av belåningsgrad … kan boligens verdi suppleres
  med betryggende tilleggssikkerhet i form av pant i annen fast eiendom, kausjon eller garanti.»
  Finanstilsynet tilrår å begrense dette til **realkausjon** (pant i annen fast eiendom).

**Konsekvens:** kausjon supplerer boligens verdi → påvirker KUN belåningsgrad-/EK-regelen.
Den reduserer ikke lånet (garanti, ikke kontanter) og gir ikke inntekt → gjeldsgrad og
betjeningsevne er harde tak på låntakers egen inntekt som kausjon ALDRI kommer forbi.

Kilder: [Lovdata](https://lovdata.no/dokument/SF/forskrift/2020-12-09-2648),
[Finanstilsynet](https://www.finanstilsynet.no/nyhetsarkiv/nyheter/2024/finanstilsynets-rad-om-innretting-av-utlansforskriften/).

## Mål og avgrensning

**Mål**
- Kausjon som valgfritt input i boligkalkulatoren som løfter EK-grensen i motoren.
- Revers: «for å nå målpris X trengs kausjon Y» — med ærlig tak der kausjon slutter å hjelpe.
- Sjekk: har kausjonisten nok fri sikkerhet i egen bolig?

**Avgrensning (YAGNI)**
- Kausjon lever KUN i `analyzeMaxPurchase` (full kalkulator). `calcMaxPurchaseSimple`
  (Veikart/Sparing/Formue/Dashboard/Scenario) er URØRT.
- Ingen modellering av kausjonistens egen inntekt/betjeningsevne (bank-spesifikk, kompleks).
- Personlig kausjon (uten pant) modelleres ikke — kun realkausjon (tilleggssikkerhet).

## Beslutninger (fra brainstorm)

| Spørsmål | Valg |
|----------|------|
| Modelldybde | Kausjonsbeløp + fri sikkerhet (kausjonistens bolig − restgjeld) |
| Plassering | Kun i boligkalkulatoren; calcMaxPurchaseSimple urørt |
| Mekanisme | Kausjon = egenkapital-ekvivalent KUN i EK-regelen |

## Arkitektur

| Lag | Fil | Ansvar |
|-----|-----|--------|
| Motor | `src/utils/maxPurchase.ts` | `analyzeMaxPurchase(..., kausjon = 0)`; kausjon legges til EK kun i `maxPriceByEquity`; ny `kausjonNeededForPrice(...)` + `guarantorFreeCollateral(...)`. |
| Type | `src/types/index.ts` | Utvid `MaxPurchaseAnalysis` (kausjonApplied, maxPriceWithoutKausjon, kausjonCeiling); kausjon-felt i loanParameters/scenario-input. |
| Hook/Store | kalkulator-scenario | `loanParameters.kausjon?`, `.guarantorHomeValue?`, `.guarantorMortgage?` + persist. |
| UI input | `src/components/calculator/ScenarioFormPanel.tsx` | Ny valgfri «Kausjon»-seksjon. |
| UI resultat | `src/components/calculator/AnalysisCards.tsx` | Maks med kausjon, EK-løft, bindende grense, fri-sikkerhet-sjekk, revers-rad. |
| Tester | `src/utils/__tests__/maxPurchase.test.ts` | Invariant + per-regel + revers + fri sikkerhet. |

## Motor-integrasjon

```
analyzeMaxPurchase(..., kausjon = 0):
  maxByEquity        = maxPriceByEquity(equity + kausjon, ...)   // KUN her
  maxByDebtRatio     = maxPriceByDebtRatio(equity, ...)          // uendret
  maxByAffordability = maxPriceByAffordability(equity, ...)      // uendret
  maxPurchasePrice   = min(de tre)
  // nye output-felt:
  kausjonApplied         = kausjon
  maxPriceWithoutKausjon = min(maxPriceByEquity(equity,...), maxByDebtRatio, maxByAffordability)
  kausjonCeiling         = min(maxByDebtRatio, maxByAffordability)
```

**Revers (det brukeren eksplisitt ba om):**
```
kausjonNeededForPrice(targetPrice, equity, ..., config):
  kravEK        = targetPrice × minEqPct + gebyrer(targetPrice)
  kausjonNeeded = max(0, kravEK − effektivEK)
  ceiling       = min(maxByDebtRatio, maxByAffordability)
  return { kausjonNeeded, reachable: targetPrice <= ceiling, ceiling }
```
`reachable: false` ⇒ ærlig melding: «Kausjon hjelper opp til [ceiling]. For å nå [targetPrice]
må inntekt øke eller annen gjeld ned.»

**Kausjonistens frie sikkerhet:**
```
guarantorFreeCollateral(homeValue, mortgage, maxLTV = 0.90):
  return max(0, homeValue × maxLTV − mortgage)
```
UI: sammenlign mot `kausjonApplied`/`kausjonNeeded` → «har nok (Z) / mangler (Y−Z)».
`maxLTV` konfigurerbar (default 90 %, samme belåningsgrad) — dokumentert tilnærming.

## UI

**Input** (`ScenarioFormPanel`, ny valgfri/kollapset «Kausjon»-seksjon):
kausjonsbeløp + (valgfritt) kausjonistens boligverdi + restgjeld.

**Resultat** (`AnalysisCards`, utvidet):
- Maks kjøpesum MED kausjon; «kausjon løftet EK-grensen fra X → Y».
- Bindende grense nå (gjeldsgrad/betjening).
- Fri-sikkerhet-sjekk (når kausjonist-bolig oppgitt).
- Revers-rad: «for å nå [målpris]: trenger [kausjon]», med ærlig melding over `kausjonCeiling`.
- Mikrocopy: kausjon løfter kun egenkapitalkravet, ikke gjeldsgrad/betjeningsevne.

## Feilhåndtering / kanttilfeller

- Kausjon større enn nødvendig → ingen effekt utover `kausjonCeiling` (kappes, vises ærlig).
- Bruker allerede gjeldsgrad-/betjeningsbundet (ikke EK-bundet) → kausjon gir 0 løft; UI sier det.
- Negativ/ugyldig input → valider, behandle som 0.
- Kausjonist-bolig udefinert → vis kausjonsbeløp uten kapasitetssjekk (ikke krasj).

## Testing

`src/utils/__tests__/maxPurchase.test.ts` (utvid):
- **Invariant:** kausjon=0 ⇒ bit-identisk med dagens tall (alle eksisterende kalkulator-tester består).
- Kausjon løfter KUN `maxByEquity`; debtRatio/affordability uendret.
- Kausjon på en gjeldsgrad-bundet bruker ⇒ 0 løft i `maxPurchasePrice`.
- `kausjonNeededForPrice`: krav − EK; `reachable: false` når targetPrice > ceiling.
- `guarantorFreeCollateral`: homeValue×maxLTV − mortgage, gulv 0.

## Konsistens-wiring (stående regel)

- Kausjon rører KUN `analyzeMaxPurchase`/full kalkulator. `calcMaxPurchaseSimple`
  (Veikart/Sparing/Formue/Dashboard/Scenario) er URØRT → «kjøpekraft» der betyr fortsatt din
  egen, uten kausjon. Bevisst grense.
- `kausjon = 0` ⇒ bit-identisk med dagens motor (invariant-test) → ingen utilsiktet endring.
- Revers bruker SAMME tre grenser som forward → «trengs X kausjon» og «maks med kausjon» kan
  aldri divergere. Se [[arbeidsregel-helhetlig-konsistens]].

## Åpne punkter til implementering

- Bekreft eksakt plassering + persist-versjon for `loanParameters.kausjon`/guarantor-felt i
  kalkulator-scenario-storen (useNewScenario/useAppStore).
- Bekreft `MaxPurchaseAnalysis`-konsumentene (AnalysisCards) tåler de nye valgfrie feltene
  uten endring der de ikke brukes.
- Fastsett om `maxLTV` for kausjonistens frie sikkerhet skal i config (lendingRules) eller
  være lokal konstant (forslag: config for konsistens med minEquityPercent).
- Vurder om kausjon skal med i scenario-sammenligning (ScenarioComparison) — sannsynlig ja
  siden det er et scenario-input, men bekreft at det ikke krever egne endringer der.
