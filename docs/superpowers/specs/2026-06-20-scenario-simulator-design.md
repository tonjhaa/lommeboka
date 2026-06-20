# Scenario-/hva-skjer-hvis-simulator — Design

**Dato:** 2026-06-20
**Status:** Godkjent design — klar for implementeringsplan
**Branch:** `feat/scenario-simulator`

## Sammendrag

En dedikert simulator-side der brukeren drar **live-spaker** (lønn, rente, månedssparing,
engangsbeløp) og ser effekten propagert gjennom budsjett/skatt, gjeld, sparing, formue,
kjøpekraft og pensjon — som **baseline vs scenario** side om side. Scenariet kjøres gjennom
de *samme* projeksjonsmotorene som resten av verktøyet bruker (ingen parallell matematikk),
så baseline-kolonnen er per definisjon lik tallene brukeren ser ellers. Et treffsikkerhet-
bånd (#6) viser hvor pålitelig prognosen historisk har vært. Dette er delprosjekt #7, det
foroverskuende motstykket til #6 Treffsikkerhet.

## Mål og avgrensning

**Mål**
- La brukeren utforske «hva skjer hvis …» med umiddelbar propagering gjennom hele verktøyet.
- Gjenbruke eksisterende motorer (`computeNetWorthSeries`, `projectPension`, `buildRepaymentPlan`,
  `norwegianTaxCalc`, Veikart-kjøpekraft) → konsistens begge veier, ingen divergens.
- Vise baseline vs scenario som kurver + nøkkeltall-delta + treffsikkerhet-bånd.

**Avgrensning (YAGNI)**
- **Live-spaker, ikke lagrede/navngitte scenarier** (boligkalkulatoren har allerede det for låneevne).
- Fire spaker i v1: lønn (±%/±kr), rente (±pp), månedssparing (±kr), engangsbeløp/stor utgift.
- **Spak-state lagres lokalt** (`useAppStore` persist), **ikke** synket til Supabase — et hva-
  skjer-hvis er hypotetisk og personlig; baseline-dataene er allerede synket. (Bevisst justering
  av det opprinnelige «sky-lagret»-kravet.)
- Ingen dashbord-chip i v1 (scenariet er hypotetisk).
- Ingen hendelsesbasert tidslinje-redigering (det er en egen, større tilnærming).

## Beslutninger (fra brainstorm)

| Spørsmål | Valg |
|----------|------|
| Ambisjon | Live-spaker (ikke lagrede scenarier) |
| Spaker v1 | Lønn, rente, månedssparing, engangsbeløp (alle fire) |
| Visning | Egen dedikert side: baseline/scenario-kurver + nøkkeltall + treffsikkerhet-bånd |
| Lagring | Lokalt (ikke synket) |
| Propagering | A — override-overlay gjennom eksisterende motorer + eksplisitt propageringslag |

## Arkitektur

| Lag | Fil | Ansvar |
|-----|-----|--------|
| Domene | `src/domain/economy/scenarioSimulator.ts` | Ren `simulateScenario(baseline, levers)` → `{ baseline, scenario }`. Anvender spaker, kjører eksisterende motorer. Ingen React/store. |
| Tester | `src/domain/economy/__tests__/scenarioSimulator.test.ts` | Per-spak-propagering + konsistens-invariant (nøytral ≡ baseline). |
| Typer | `src/types/economy.ts` (utvides) | `ScenarioLevers`, `ScenarioKeyFigures`, `ScenarioResult`. |
| Hook | `src/hooks/useScenario.ts` | Samler baseline-input fra storen, kaller simulatoren, memoisert. |
| Store | `src/store/useAppStore.ts` | `scenarioLevers` + setter; persist lokalt (ikke Supabase). |
| Side | `src/pages/economy/ScenarioPage.tsx` | Spaker, baseline/scenario-graf, nøkkeltall-delta, treffsikkerhet-bånd. |
| Navigasjon | `EconomyPage.tsx`, `useAppStore.ts`, `types/economy.ts`, `OnboardingWizard.tsx`, `useEconomyStore.ts` | Ny `EconomySubPage`/`EconomyTab` `'scenario'`, nav (`SlidersHorizontal`), `MODULES`, persist v24→v25-migrering (legg `'scenario'` i `enabledTabs`). |

## Datamodell

```ts
export interface ScenarioOneTimeEvent {
  id: string
  label: string
  date: string               // "YYYY-MM-DD"
  amount: number             // + arv/bonus, − stor utgift
}

export interface ScenarioLevers {
  salaryPct: number           // ±% på brutto månedslønn (0 = uendret)
  salaryKr: number            // ±kr flat på brutto månedslønn
  rateDeltaPp: number         // ±prosentpoeng på rente (gjeld + sparing)
  monthlySavingsDelta: number // ±kr/mnd ekstra sparing
  oneTimeEvents: ScenarioOneTimeEvent[]
  extraNetToSavingsPct: number // andel av ekstra netto antatt spart (default 60)
}

export interface ScenarioKeyFigures {
  nettoPerMonth: number
  sparerate: number           // %
  netWorth5y: number
  purchasingPower: number     // maks kjøpesum
  pensionAt67: number         // kr/mnd
}

export interface ScenarioResult {
  baseline: { series: NetWorthSeries; figures: ScenarioKeyFigures }
  scenario: { series: NetWorthSeries; figures: ScenarioKeyFigures }
}
```

`DEFAULT_SCENARIO_LEVERS` = alt 0/tomt, `extraNetToSavingsPct: 60`.

## Propageringskontrakt (kjernen i tilnærming A)

Eksplisitte, dokumenterte antakelser — hver spak gjenbruker en eksisterende motor:

| Spak | Forplanter seg slik |
|------|---------------------|
| Lønn ±%/±kr | ny brutto = `baseMonthly × (1 + salaryPct/100) + salaryKr` → `norwegianTaxCalc` → ny netto; Δnetto → feriepengegrunnlag (×12), `projectPension` (ny `baseMonthly`), Veikart-kjøpekraft (`annualIncome`), og `extraNetToSavingsPct × Δnetto` → sparingDelta i formuekurven |
| Rente ±pp | gjeld: `nominalRate + rateDeltaPp` → `buildRepaymentPlan`; sparing/fond: rente/avkastning `+ rateDeltaPp` → `computeNetWorthSeries` |
| Månedssparing ± | direkte sparingDelta i formuekurven + sparemål-ETA |
| Engangsbeløp | overlay på `NetWorthPoint.total` fra `date` og framover (varig nivåskift) |

**Inntekt → sparing-antakelsen** er det viktigste designvalget: `sparingDelta_lønn =
Δnetto × extraNetToSavingsPct`. Justerbar i UI (default 60 %); `extraNetToSavingsPct = 0`
isolerer lønnseffekten fra formue.

## Beregning

`simulateScenario` kjøres to ganger over samme motorer — nøytralt (baseline) og med spaker (scenario):

1. **Lønn → netto:** ny brutto → `norwegianTaxCalc` → ny netto/mnd. **Baseline-netto beregnes
   via SAMME motor** (ikke fra slipp), så `Δnetto = scenarioNetto − baselineNetto` er rent
   spak-drevet og ikke forurenset av beregnet-vs-faktisk-avvik. (Den viste baseline-formuekurven
   bruker fortsatt faktiske tall — kun Δ-utledningen bruker motoren begge veier.)
2. **Inntekt → sparing:** `sparingDelta = Δnetto × extraNetToSavingsPct + monthlySavingsDelta`.
3. **Rente:** gjeld via `buildRepaymentPlan` med justert rate; sparing via `computeNetWorthSeries` med justert rente.
4. **Engangsbeløp:** overlay på formuekurven fra hver `date`.
5. **Formuekurve:** `computeNetWorthSeries` med modifiserte input → `scenario.series`; uendret → `baseline.series`. Begge med historikk + projeksjon (`isProjected`-splitt).

**Nøkkeltall (begge):** netto/mnd (skattemotor), sparerate (`sparing/netto`), formue om 5 år
(serie-punkt 60 mnd fram), kjøpekraft (Veikart `calcMaxPurchase`), pensjon ved 67
(`projectPension(...).monthlyTotal`). Delta per nøkkeltall beregnes i UI.

## UI — `ScenarioPage.tsx`

1. **Spak-panel:** fire spaker (range-slidere/input, `accent-primary`-stil) — Lønn (±%/±kr),
   Rente (±pp), Månedssparing (±kr), + liste for engangshendelser (legg til/fjern: label/dato/beløp).
   «Nullstill spaker»-knapp; «Andel ekstra netto til sparing»-slider under «Forutsetninger»-utvid.
2. **Baseline vs scenario-graf:** formue over tid, to linjer (baseline heltrukket grå, scenario
   farget), gjenbruker recharts/`FormueChart`-mønsteret; oppdateres live.
3. **Nøkkeltall-delta-tabell:** Netto/mnd, Sparerate, Formue om 5 år, Kjøpekraft, Pensjon ved 67 —
   `baseline → scenario (Δ)`, fargekodet.
4. **Treffsikkerhet-bånd:** henter `overallHitRate` (#6 `computeAccuracy`) → «Prognosen din har
   historisk truffet ±X % — scenariet arver samme usikkerhet.» Lenker til Treffsikkerhet-siden.

## Feilhåndtering / kanttilfeller

- Mangler profil/inntekt → tomtilstand («Importer lønnsslipp for å simulere»).
- Rente som gjør avdrag < rente (gjeld vokser) → `buildRepaymentPlan` kapper ved maxMonths;
  flagges «gjeld nedbetales ikke i perioden».
- Negativ netto (urimelig lønnskutt) → advarsel, ikke krasj.
- Engangsutgift > formue → formuekurve kan gå negativt; vises ærlig.

## Testing

`src/domain/economy/__tests__/scenarioSimulator.test.ts` (domenetester):
- **Konsistens-invariant:** nøytrale spaker ⇒ `scenario.series` identisk med `baseline.series`.
- Lønn +10 % → høyere netto/pensjon/formue; `extraNetToSavingsPct=0` ⇒ formue uendret av lønn (isolerer antakelsen).
- Rente +2pp → lengre gjeldsnedbetaling + høyere sparevekst.
- Månedssparing +2000 → formue om 5 år øker tilsvarende.
- Engangsbeløp −100k på dato → formuekurven faller 100k fra datoen.
- Kanttilfeller: manglende profil, negativ netto, gjeld som ikke nedbetales.

## Konsistens-wiring (stående regel)

Simulatoren kjører `computeNetWorthSeries`/`projectPension`/`buildRepaymentPlan`/`norwegianTaxCalc`/
Veikart-kjøpekraft — samme motorer som dashbord, Formue, Pensjon og Veikart bruker. Baseline-
kolonnen er derfor lik tallene ellers (invariant-testen låser det). Spak-state lagres lokalt i
`useAppStore` (ikke Supabase-synk); baseline-dataene er allerede synket. Se [[arbeidsregel-helhetlig-konsistens]].

## Åpne punkter til implementering

- Bekreft `norwegianTaxCalc`-signatur og hvordan baseline-netto utledes (slipp vs beregning) — så Δnetto er konsistent med Lønn-siden.
- Bekreft Veikart `calcMaxPurchase`-signatur (equity, annualIncome, gjeld) og hvor egenkapital hentes for scenario.
- Avklar hvordan rente-overlay anvendes på `computeNetWorthSeries` (tar den rente per konto i dag — trenger en override-parameter).
- Fastsett standard graf-horisont (gjenbruk formue-hookens 36 mnd historikk + 60 mnd projeksjon).
