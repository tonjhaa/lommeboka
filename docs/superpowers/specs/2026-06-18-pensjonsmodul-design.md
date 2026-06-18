# Pensjonsmodul (SPK-/pensjonsprognose) — Design

**Dato:** 2026-06-18
**Status:** Godkjent design — klar for implementeringsplan
**Branch:** `feat/pensjonsmodul`

## Sammendrag

En ny modul i Lommeboka som beregner forventet alderspensjon for brukeren
(Forsvaret-ansatt, født 1995) ved valgt uttaksalder. Modulen er en **detaljert,
lokal beregningsmotor** etter 2020-modellen (ny offentlig tjenestepensjon), forankret
i NAVs egen referanseimplementasjon (`navikt/pensjonssimulator`). Den gjenbruker
eksisterende lønns-, tillegg- og profildata, og rammes tydelig inn som et
estimat/scenarioverktøy — ikke et løfte.

## Mål og avgrensning

**Mål**
- Vise forventet månedlig pensjon ved valgt uttaksalder, brutt ned per pilar.
- La brukeren sammenligne uttaksaldre (62 / 65 / 67 / 70 / særalder) og se trade-offen.
- Gjenbruke data appen allerede har (lønn, faste tillegg, fødselsår), uten dobbel inntasting.
- Være ærlig om usikkerhet (≈40 års horisont): synlige, redigerbare forutsetninger.

**Avgrensning (YAGNI)**
- **Kun ny modell (født 1963+).** Ingen støtte for gammel/overgangsmodell (1954–1962 eller eldre).
- Ikke uføre-, etterlatte- eller barnepensjon. Kun alderspensjon + AFP + særalder.
- Ingen nettverkskall / ingen integrasjon mot norskpensjon.no i v1 (kalibrering mot
  offisielle tall er en valgfri senere utvidelse — felt `officialEstimate` er forberedt).
- Privat sparing som «4. søyle» (fond/BSU framskrevet) er **stretch / v1.1**, ikke v1.

## Beslutninger (fra brainstorm)

| Spørsmål | Valg |
|----------|------|
| Ambisjonsnivå | Detaljert lokal beregningsmotor |
| Kohort | Kun ny modell (født 1995 → 1963+) |
| Komponenter | Folketrygd + SPK-påslag + ny AFP + særalder |
| Særalder | Konfigurerbar (av/på + alder, standard 60), **flagget usikker** |
| Beregningsstrategi | Ren lokal motor (A); kalibrering (C) utsettes |

## Kildeforankring (NAV)

Satser og struktur er bekreftet mot NAVs åpne kildekode:

- **`navikt/pensjonssimulator`** — prognosemotor for alderspensjon, med egen mappe
  `afp/offentlig/fra2025/` for ny livsvarig offentlig AFP (født 1963+).
- Bekreftede konstanter (`LivsvarigOffentligAfpYtelseBeregner.kt`,
  `OffentligAfpConstants.kt`):
  - Folketrygd opptjeningssats: `0.181` (18,1 %)
  - AFP opptjeningssats: `0.0421` (4,21 %)
  - AFP/år = `(pensjonsbeholdning / 0.181) * 0.0421 / delingstall`
    = `(livsinntekt ≤ 7,1G) * 4,21 % / delingstall`
  - Minste uttaksalder AFP: 62
  - Overgang til livsvarig offentlig AFP: født 1963+
- **SPK** (`statens-pensjonskasse` på GitHub) eksponerer kun infrastruktur/tooling —
  ingen pensjonsformler. SPK-påslagets satser hentes fra offentlig regelverk (dokumentert
  på spk.no), ikke fra kode.

**Den ene biten NAV henter eksternt (ikke som ren konstant): delingstall.** Det blir
modulens viktigste tabell å skaffe, og — sammen med G-vekst — den største usikkerheten.

## Arkitektur

Følger kodebasens etablerte lagdeling (rene domenekalkulatorer + Zustand-store + lazy-side).

| Lag | Fil | Ansvar |
|-----|-----|--------|
| Domene | `src/domain/economy/pensionCalculator.ts` | Rene funksjoner: opptjening + uttaksberegning per pilar. Ingen React/store. |
| Tester | `src/domain/economy/__tests__/pensionCalculator.test.ts` | Verifiser mot kjente eksempler + NAVs e2e-JSON som orakel. |
| Konstanter | `src/config/economy.config.ts` (utvides) | Ny seksjon: G, delingstall-tabell, satser, tak — med kilde + «sist verifisert»-dato. |
| Typer | `src/types/economy.ts` (utvides) | `PensionSettings`, `PensionScenario`, `PensionProjection`. |
| Store | `src/application/useEconomyStore.ts` | Nytt felt `pensionSettings` + setter; persist-versjon bumpes; `pension` i `enabledTabs`-migrering. |
| Side | `src/pages/economy/PensionPage.tsx` | UI; lazy-import i `EconomyPage.tsx`; ny `EconomySubPage`/`EconomyTab` + nav-ikon. |
| Navigasjon | `EconomyPage.tsx`, `useAppStore.ts`, `types/economy.ts` | `EconomySubPage`/`EconomyTab` `'pension'`; `NAV_ITEMS`-element (ikon `Landmark`). |
| Dashboard | `EconomyDashboard.tsx` | Ny pengepuls-chip for forventet pensjon. |

## Datamodell

```ts
interface PensionSettings {
  birthYear: number              // default fra userPreferences (1995)
  serviceStartYear: number       // år innmeldt i SPK / yrkesstart (opptjeningsstart)
  særalder: { enabled: boolean; age: 57 | 60 | 63 }   // default { false, 60 } — FLAGGES USIKKER
  afpEnabled: boolean            // antas oppfylt; kan skrus av
  assumptions: {
    salaryGrowthPct: number      // forventet årlig lønnsvekst (default ~3 %)
    gGrowthPct: number           // forventet G-regulering (default ~3,5 %)
  }
  officialEstimate?: number      // valgfritt: norskpensjon.no-tall (krok for senere kalibrering)
}

type PensionScenario = { uttaksalder: number }   // 62 | 65 | 67 | 70 | særalder — sammenlignes

interface PensionPillarBreakdown {
  folketrygd: number             // kr/mnd
  spk: number                    // kr/mnd
  afp: number                    // kr/mnd
  særalder: number               // kr/mnd (0 hvis av)
}

interface PensionProjection {
  uttaksalder: number
  perPilar: PensionPillarBreakdown
  monthlyTotal: number           // sum perPilar
  replacementRate: number        // monthlyTotal / sluttlønn per mnd
  confidence: 'lav' | 'middels'  // alltid ≤ middels pga. ~40 års horisont
}
```

**Datakilder som gjenbrukes (ingen dobbel inntasting):**
- `profile.baseMonthly` + `fixedAdditions` → SPK-pensjonsgrunnlag (fast lønn + faste pensjonsgivende tillegg)
- `monthHistory` (importerte slipper) → faktisk pensjonsgivende inntekt bakover
- `lonnsoppgjor` → kalibrere `salaryGrowthPct`-antakelsen
- `atfEntries` → teller i **folketrygdens** grunnlag, men **ikke** i SPK-grunnlaget
- `userPreferences.birthYear` → forhåndsfyll `birthYear`

## Beregningsmotor

Alle pilarer bygger på samme mønster: årlig opptjening akkumuleres i en beholdning som
reguleres med lønnsvekst, og deles på delingstall ved uttak.

**1. Folketrygd alderspensjon (kap. 20)**
- Årlig opptjening: `18,1 % × pensjonsgivende inntekt`, kappet ved `7,1G`.
- Pensjonsgivende inntekt = lønn + ATF + de fleste tillegg (ATF teller her).
- Beholdning reguleres årlig med lønnsvekst (`gGrowthPct`).
- Opptjeningsperiode: lovlig vindu er 13–75 år. Vi approksimerer inntektshistorikken
  framover fra `serviceStartYear` (yrkesstart) + lønnsvekst, og bakover fra `monthHistory`
  der slipper finnes. (Folketrygd bruker all pensjonsgivende inntekt, ikke SPK-medlemskap.)
- Uttak: `årlig pensjon = pensjonsbeholdning / delingstall(uttaksalder, årskull)`.
- Tidligste uttak 62 (betinget av minstenivå — forenkles i v1).

**2. SPK offentlig tjenestepensjon — påslagsmodell**
- Årlig påslagsopptjening: `5,7 % × grunnlag (≤ 12G) + 18,1 % × grunnlag i båndet 7,1G–12G`.
- Grunnlag = **fast lønn + faste pensjonsgivende tillegg** (variabelt/ATF **ikke** med).
- Akkumuleres i påslagsbeholdning, regulert med lønnsvekst.
- Uttak: `årlig påslag = påslagsbeholdning / delingstall`.
- Betinget tjenestepensjon (når AFP ikke tas ut) nevnes i UI men forenkles bort i v1.

**3. Ny livsvarig offentlig AFP (fra 2025)**
- `årlig AFP = (livsinntekt ≤ 7,1G) × 4,21 % / delingstall` (bekreftet fra NAV-kilde).
- Fra 62 år, livsvarig, kun født 1963+.
- Betinget av AFP-vilkår (offentlig ansatt ved uttak osv.) → `afpEnabled`-toggle, antas oppfylt.

**4. Særalderspåslag — ⚠️ FLAGGET USIKKER**
- For født 1963+ med særaldersgrense: tilnærmet modell — tidligpensjon mellom særalder
  og 67 + et livsvarig særalderspåslag.
- Regelverk avtalt 2023/2024, fortsatt detaljer under utvikling → hele pilaren merkes
  «foreløpig — regelverk under utvikling», får egen visuell advarsel, og kan skrus av.

**Konstanter/tabeller i `economy.config.ts`** (ny seksjon, med kilde + «sist verifisert»-dato):
- `G` (grunnbeløp): dagens verdi — **verifiseres mot nav.no ved implementering**
  (per 1. mai 2025 ca. 130 160 kr) — pluss antatt årlig vekst.
- `DELINGSTALL`-tabell per årskull/uttaksalder (foreløpige for årskull 1995) + interpolasjon.
- Satser: `0.181` / `0.057` / `0.0421`; tak `7,1G` og `12G`.

## UI / side (`PensionPage.tsx`)

Dense card-stil som resten av appen. Komponenter splittes (HeroSummary, PillarBreakdown,
UttaksalderCompare, AssumptionsPanel) for lesbarhet.

1. **Hero-sammendrag** — «Forventet pensjon ved [uttaksalder]»: stort kr/mnd-tall,
   kompensasjonsgrad (% av sluttlønn), alltid-synlig confidence-badge. Segmentkontroll
   for uttaksalder.
2. **Pilar-nedbrytning** — stablet søyle (gjenbruker `SalaryWaterfallHero`-mønster /
   recharts): Folketrygd + SPK + AFP (+ særalder) = total, med kr/mnd og andel. Særalder
   får ⚠-markering.
3. **Uttaksalder-sammenligning (kjernefunksjon)** — tabell/graf: 62 vs 65 vs 67 vs 70
   (vs særalder), månedsbeløp + livsvarig + «break-even-alder» der senere uttak passerer
   tidlig uttak.
4. **Forutsetninger-panel (utvidbart, redigerbart)** — lønnsvekst %, G-vekst %,
   yrkesstart/SPK-innmeldingsår, særalder (av/på + alder), AFP (av/på), dagens lønn
   (forhåndsutfylt fra `profile`). Endring → umiddelbar oppdatering.
5. **Privat sparing som valgfri 4. søyle** — *stretch/v1.1*, nevnt men ikke i v1.

## Integrasjon

- **Dashboard**: ny pengepuls-chip («🏛️ Forventet pensjon ~X kr/mnd ved 67») via
  eksisterende `chips`-mønster i `EconomyDashboard.tsx`.
- **Navigasjon**: ny `EconomySubPage`/`EconomyTab` `'pension'`, nav-element i `NAV_ITEMS`
  (ikon `Landmark`), migrering i `useEconomyStore` (persist-versjon bumpes, `pension`
  legges i `enabledTabs`).
- **Innstillinger**: dukker opp i `ModulesSection`-toggle automatisk via `enabledTabs`.
- **Data**: leser `profile` + `userPreferences.birthYear` + `pensionSettings`.

## Feilhåndtering / kanttilfeller

- Mangler `profile`/`birthYear` → `EmptyState` som guider til å importere slipp / sette
  fødselsår (samme mønster som andre sider).
- `birthYear < 1963` → notis «støtter foreløpig kun ny modell (1963+)» og deaktivert
  beregning (defensivt; trigges aldri for født 1995).
- Delingstall for fjerne årskull → «foreløpige delingstall»-disclaimer.
- All output: confidence ≤ middels, forutsetninger synlige, mikrocopy «estimat, ikke et løfte».
- NOK-formatering via eksisterende hjelper; avrunding til nærmeste kr.

## Testing

Følger konvensjonen (domenetester, ikke komponenttester).
`src/domain/economy/__tests__/pensionCalculator.test.ts`:
- **Folketrygd**: 1 år på 7,1G → beholdning = `18,1 % × 7,1G`; inntekt over 7,1G kappes.
- **AFP**: matcher NAV-formelen `(livsinntekt ≤ 7,1G) × 4,21 % / delingstall`; bruk NAVs
  `end-to-end-test/*.json` som referanseorakel der verdiene passer.
- **SPK-påslag**: båndmatematikk (8G → `5,7 %×8G + 18,1 %×(8G−7,1G)`; ≤ 7,1G → kun 5,7 %).
- **Delingstall**: interpolasjon + monotoni (senere uttak → høyere årlig ytelse).
- **Guards**: `birthYear < 1963`, null-inntekt, manglende profil.

## Åpne punkter til implementering

- Verifiser dagens `G` og hent **foreløpige delingstall** for årskull 1995 fra nav.no /
  NAVs publiserte tabeller.
- Fastsett tilnærmingen for særalderspåslag (tallfest den forenklede modellen) og
  ordlyden på usikkerhetsmerkingen.
- Bekreft SPK-påslagets satser (5,7 % / 18,1 %, tak 12G) mot gjeldende regelverk på spk.no.

## Kilder

- navikt/pensjonssimulator — https://github.com/navikt/pensjonssimulator
- navikt/pensjonskalkulator-backend — https://github.com/navikt/pensjonskalkulator-backend
- Produktområde pensjon i NAV — https://navikt.github.io/pensjon/
- statens-pensjonskasse (GitHub) — https://github.com/statens-pensjonskasse
