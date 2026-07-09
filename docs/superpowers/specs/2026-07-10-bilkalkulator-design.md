# Bilkalkulator — planlegge et bilkjøp

Dato: 2026-07-10
Status: Godkjent, klar for implementasjonsplan

## Problem / formål

Lommeboka har ingen dedikert planleggingskalkulator for et fremtidig bilkjøp.
Gjeld-siden (`DebtPage.tsx`) sporer allerede et aktivt billån (`DebtAccount.type
=== 'billaan'`), men det forutsetter at lånet finnes — ikke at man utforsker om
og hvordan man har råd til én. Boligkalkulatoren (`CalculatorPage.tsx`) løser
akkurat dette problemet for bolig; bilkalkulatoren er søsteren for bil.

## Avklarte krav (fra brainstorming)

- **Bruksområde:** både (a) planlegge et fremtidig bilkjøp fra bunnen av, og
  (b) simulere et konkret lånetilbud (pris/rente/løpetid) du vurderer — samme
  verktøy dekker begge, ingen separate moduser.
- **FINN-oppslag:** lim inn en FINN-kode for en bilannonse → henter pris, år,
  kilometerstand og drivstofftype automatisk.
- **Driftskostnader ut over selve låneterminen** — alle valgfrie tillegg, av
  som utgangspunkt:
  - Forsikring (kr/mnd, manuelt anslag)
  - Drivstoff/lading (kr/mnd, foreslått startverdi ut fra drivstofftype + km
    fra FINN-oppslaget, justerbar)
  - Service/vedlikehold + årsavgift (kr/år, sjablongverdi, justerbar)
- **Råd-sjekk:** henter «OVERSKUDD»-tallet for inneværende måned fra
  budsjettmotoren (`useBudgetTable`) som forslag til «disponibelt til bil per
  måned», med et tallfelt du kan overstyre. Terminbeløp (+ ev. påslåtte
  driftskostnader) vises mot dette tallet — grønt/gult/rødt.
- **Ingen scenarioliste** — én løpende kalkulator, ikke flere lagrede
  scenarioer å sammenligne (i motsetning til boligkalkulatoren).
- **Husker likevel siste verdier** mellom økter (samme forventning som resten
  av appen) — persisteres, nullstilles ikke ved refresh.
- **Plassering:** eget toppnivå-view, rett ved siden av «Boligkalkulator» i
  «Fremtid»-gruppen i `MainNav.tsx`.

## Arkitektur

### Navigasjon

- Ny `AppView`-verdi `'billan'` i `src/store/useAppStore.ts:14`
  (`export type AppView = 'calculator' | 'economy' | 'skattekalkulator' |
  'partner' | 'ivf' | 'billan'`).
- Ny rad i `MainNav.tsx`s `fremtid`-gruppe (linje ~73), rett under
  `Boligkalkulator`: `{ label: 'Bilkalkulator', target: { kind: 'view', view:
  'billan' } }`.
- Ny lazy-lastet side i `App.tsx`, samme mønster som `PartnerPage`/`IVFPageTop`:
  `const CarLoanCalculatorPage = lazyWithRetry(() => import(...))`, rendret når
  `currentView === 'billan'`.

### Beregningsmotor — gjenbruk, ikke duplisering

`src/utils/amortization.ts`s `buildAmortizationPlan(scenarioId, principal,
annualRate, termYears, loanType)` (linje 232) er allerede generisk — ikke
bundet til boliglån-typer. Bilkalkulatoren kaller denne direkte for
nedbetalingsplanen; ingen ny lånematematikk skrives.

Ny `src/utils/carLoanCalculator.ts` (mirror av `utils/calculator.ts`s form,
ikke innhold) komponerer:

```ts
interface CarLoanInputs {
  price: number
  equity: number
  annualRate: number
  termYears: number
  loanType: 'annuitet' | 'serie'
  fuelType: 'bensin' | 'diesel' | 'el' | 'hybrid' | null
  mileageKm: number | null
  runningCosts: {
    insurance: { enabled: boolean; monthlyAmount: number }
    fuel: { enabled: boolean; monthlyAmount: number }       // forhåndsutfylt forslag, se under
    maintenance: { enabled: boolean; yearlyAmount: number }
  }
  availableMonthlyBudget: number   // forhåndsutfylt fra useBudgetTable, overstyrbar
}

interface CarLoanResult {
  loanAmount: number
  amortization: AmortizationPlan   // fra buildAmortizationPlan
  monthlyInstallment: number       // amortization.rows[0].payment
  totalRunningCostMonthly: number  // sum av påslåtte driftskostnader, årlige delt på 12
  totalMonthlyCost: number         // installment + totalRunningCostMonthly
  totalInterestCost: number        // fra amortization
  affordability: 'ok' | 'stramt' | 'ikke-rad'  // sammenligning mot availableMonthlyBudget
}

function estimateFuelCost(fuelType, mileageKm): number  // sjablongtabell, se under
function calculateCarLoan(inputs: CarLoanInputs): CarLoanResult
```

Terskler for `affordability` (låst her for å unngå tvetydighet):
`totalMonthlyCost <= availableMonthlyBudget` → `'ok'`;
`totalMonthlyCost <= availableMonthlyBudget * 1.1` → `'stramt'` (inntil 10 % over);
ellers → `'ikke-rad'`. Samme prinsipp som boligkalkulatorens forskriftssjekk
(binær ja/nei per krav), men med en mellomsone siden bilhold — i motsetning
til boliglånsforskriften — ikke har en offisiell grense.

`estimateFuelCost` er en enkel oppslagstabell (kr/mnd per drivstofftype ved
gitt årlig kjørelengde, f.eks. `bensin: km/100 * literpris_pr_mil_estimat`) —
kun et startforslag brukeren kan overstyre, ikke en presis modell. Nøyaktige
satser fastsettes under implementasjon (research-oppgave, ikke en del av
denne spec-en).

`Ny src/hooks/useCarLoanCalculator.ts` kobler `carLoanCalculator.ts` mot
storen (samme rolle som `useCalculator.ts` har for boligkalkulatoren): leser
input fra `useCarLoanCalculatorStore`, kjører `calculateCarLoan` på endring,
returnerer resultat til siden. Ingen mellomlagret resultat i storen — kun
input persisteres, resultat beregnes on-the-fly (billig nok til å kjøre ved
hver render, ingen useMemo-cache nødvendig gitt størrelsen på beregningen).

### Råd-sjekk mot budsjett

`useBudgetTable` (eksisterende hook) eksponerer en `OVERSKUDD`-rad
(`budgetTableComputer.ts:872`) med budsjett/faktisk-celler per måned.
`useCarLoanCalculator` leser inneværende måneds `budget`-verdi derfra som
startverdi for `availableMonthlyBudget` — kun ved første gangs bruk (tomt
felt); en gang brukeren har skrevet inn/endret verdien manuelt, overstyres
ikke den igjen automatisk ved senere besøk (unngår at et manuelt justert tall
"spretter tilbake" hver gang budsjettet endrer seg).

### Lagring

Ny liten store `src/store/useCarLoanCalculatorStore.ts`, persist-nøkkel
`lommeboka-bilkalkulator-v1` — samme mønster som `useGiftStore`
(`lommeboka-gaver-v1`) og `usePermisjonStore` (`lommeboka-permisjon-v1`).
Lagrer kun `CarLoanInputs` (pluss en `availableMonthlyBudgetIsManual: boolean`
for regelen over) — ikke beregningsresultatet.

**Må også legges til** i `STORE_KEYS`-opprydddingslisten i `App.tsx:94`
(brukerbytte-cleanup) — samme sted som `min-okonomi-v1`,
`lommeboka-partner-v1` osv. allerede står. Glemt registrering her var
nettopp årsaken til datalekkasje-risikoen som ble undersøkt tidligere i
kveld (se `c21f3e0 fix(auth): rydd stale brukerdata ved brukerskifte` i git-
loggen) — bevisst listet opp eksplisitt her for å ikke gjenta det mønsteret.

### FINN-oppslag for bil

FINN Motor-annonser har en helt annen HTML-struktur enn boligannonser
(`finnAdParser.ts` sine `dt`/`dd`-oppslag som "Boligtype"/"Prisantydning" er
boligspesifikke). Ny, egen parser:

```
src/domain/finn/finnCarAdParser.ts
  export interface FinnCarAdData {
    price: number | null
    year: number | null
    mileageKm: number | null
    fuelType: 'bensin' | 'diesel' | 'el' | 'hybrid' | null
  }
  export function parseFinnCarAd(html: string, finnkode: string): FinnCarAdData
  export function fetchFinnCarAd(finnkode: string): Promise<FinnCarAdData>
```

`api/finn.ts` utvides til å ta en `type`-query-parameter (`?finnkode=X&type=car`,
default `type=housing` for bakoverkompatibilitet med eksisterende kall) og
ruter til riktig parser/fetch-URL. CORS-proxy-logikken (headere, feilhåndtering,
cache-control) gjenbrukes uendret — kun URL-mønsteret og parseren er
type-spesifikke.

**Å avklare under implementasjon (ikke låst i denne spec-en):** eksakt FINN-URL
for biloppslag (`fetchFinnAd` bruker i dag hardkodet
`finn.no/realestate/homes/ad.html?finnkode=X` for bolig — bil-ekvivalenten må
verifiseres mot en ekte FINN Motor-annonse før parsing kan skrives, siden
FINN har endret URL-struktur for mobility-annonser før).

## UI

Siden speiler boligkalkulatorens informasjonstetthet, ikke dens
scenario-sidebar (som er droppet, se «Ingen scenarioliste» over):

- **Bil-seksjon**: FINN-kode-felt (samme inline-oppslag-mønster som
  boligkalkulatoren) + manuelle felt for pris/år/km/drivstoff som forhånds-
  fylles ved vellykket oppslag, men alltid er redigerbare.
- **Lån-seksjon**: egenkapital, rente, løpetid, annuitet/serie-valg.
- **Driftskostnader-seksjon**: tre av/på-brytere (forsikring, drivstoff/lading,
  service), hver med sitt beløpsfelt som vises når slått på.
- **Resultat-panel**: terminbeløp, total rentekostnad, `AmortizationTable` +
  `AmortizationChart` (gjenbrukt uendret fra boligkalkulatoren), og
  råd-sjekk-indikatoren (grønt/gult/rødt mot disponibelt beløp) med det
  overstyrbare budsjett-feltet rett ved siden av.

## Filstruktur (nye filer)

```
src/pages/CarLoanCalculatorPage.tsx
src/utils/carLoanCalculator.ts
src/hooks/useCarLoanCalculator.ts
src/store/useCarLoanCalculatorStore.ts
src/domain/finn/finnCarAdParser.ts
src/domain/finn/__tests__/finnCarAdParser.test.ts
src/utils/__tests__/carLoanCalculator.test.ts
```

Endringer i eksisterende filer:
```
src/store/useAppStore.ts     — ny AppView-verdi
src/components/layout/MainNav.tsx  — ny nav-rad
src/App.tsx                  — ny lazy route + STORE_KEYS-oppføring
api/finn.ts                  — type-query-parameter + ruting
```

## Ikke i scope

- Ingen lagrede/sammenlignbare scenarioer (avklart — kun én løpende
  kalkulator).
- Ingen kobling til Gjeld-siden i denne omgangen (f.eks. en «gjør dette til et
  aktivt lån»-knapp som oppretter en `DebtAccount`) — kan vurderes som egen
  senere utvidelse, ikke en del av v1.
- Ingen presis drivstofforbruks-modell (kun sjablongforslag brukeren
  overstyrer).
- Ingen endring i eksisterende boligkalkulator eller `finnAdParser.ts` utover
  at `api/finn.ts` får en ny valgfri query-parameter.

## Risiko / ting å teste

- FINN Motor sin faktiske URL-struktur og HTML-oppmerking må verifiseres mot
  en ekte annonse før `parseFinnCarAd` skrives — ikke anta at den følger
  samme `dt`/`dd`-mønster som boligannonser.
- `STORE_KEYS`-oppføringen i `App.tsx` er lett å glemme (skjedde tidligere i
  dette prosjektet) — eksplisitt sjekkpunkt i implementasjonsplanen.
- `availableMonthlyBudgetIsManual`-logikken (ikke overstyr et manuelt tall) må
  testes eksplisitt: åpne kalkulatoren, endre budsjett-feltet manuelt, endre
  noe i selve Budsjett-fanen, bekreft at bilkalkulatorens felt IKKE spretter
  tilbake til det nye budsjett-tallet.
- `npm run build` (`tsc -b`) må kjøres før commit per prosjektregel.
