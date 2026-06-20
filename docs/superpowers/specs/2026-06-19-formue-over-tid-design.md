# Formue over tid — Design

**Dato:** 2026-06-19
**Status:** Godkjent design — klar for implementeringsplan
**Branch:** `feat/formue-over-tid`

## Sammendrag

En «Formue over tid»-graf i Lommeboka som viser netto formue (eiendeler − gjeld) som
tidsserie per måned, med **historikk + projeksjon** og veksling mellom **Din** og
**Felles (du + partner)**. Vises både kompakt på dashbordet og i en dedikert detaljside.
Formuen utledes på nytt fra eksisterende data hver gang (ingen lagrede aggregater), slik
at den alltid er konsistent med resten av verktøyet — begge veier. Dette er delprosjekt 1
av to; delprosjekt 2 (nøkkeltall-/grunnbeløp-register med historikk og partner-synk) får
egen spec senere.

## Mål og avgrensning

**Mål**
- Vise faktisk netto formue bakover + projisert formue-bane fremover, per måned.
- Veksle mellom Din og Felles (du + partner).
- Gjenbruke `FormueChart` og eksisterende kalkulatorer; ingen ny lagring/migrering for selve serien.
- Én kilde til sannhet: dashbord-graf, Formue-side og hero-tall konsumerer samme serie.

**Avgrensning (YAGNI)**
- Ingen lagrede formue-snapshots (rekonstrueres alltid — se Beslutninger).
- Ingen ny Supabase-synk i dette delprosjektet (alle input ligger allerede i synket store).
- Nøkkeltall-/G-register med historikk og partner-realtime er **delprosjekt 2**, ikke her.
- Partner-historikk simuleres (partner har ingen `balanceHistory`).

## Beslutninger (fra brainstorm)

| Spørsmål | Valg |
|----------|------|
| Omfang | Begge — Din/Felles med veksling |
| Plassering | Begge — kompakt på dashbord + dedikert Formue-side |
| Tidsspenn | Historikk + projeksjon (gjenbruker projeksjonsmotorer) |
| Beregningsstrategi | A — ren rekonstruksjon, ingen ny lagring |

**Hvorfor ren rekonstruksjon (A) framfor lagrede snapshots (B):** Lagrede aggregater blir
utdaterte når en historisk saldo korrigeres, og kan bare bygge fremover. Rekonstruksjon
respekterer den stående regelen om konsistens på tvers begge veier: retter du et tall ett
sted, regnes hele formue-kurven på nytt. Cache (C) er YAGNI inntil ytelse faktisk blir et problem.

## Arkitektur

Følger etablert lagdeling (rene domenekalkulatorer + hook + sider).

| Lag | Fil | Ansvar |
|-----|-----|--------|
| Domene | `src/domain/economy/netWorthCalculator.ts` | Ren `computeNetWorthSeries(input)` → månedsserie med nedbrytning. Gjenbruker `savingsCalculator`, `debtCalculator`, fond-snapshots, IVF. |
| Tester | `src/domain/economy/__tests__/netWorthCalculator.test.ts` | Konsistens-invariant + per-klasse-oppførsel. |
| Typer | `src/types/economy.ts` (utvides) | `NetWorthPoint`, `NetWorthSeries`, `NetWorthInput`, `NetWorthScope`. |
| Hook | `src/hooks/useNetWorthSeries.ts` | Samler store-data (+ `partnerVeikart` for Felles), kaller kalkulatoren, memoisert. |
| Dashboard | `src/pages/economy/EconomyDashboard.tsx` | Mater `FormueChart` med formue-serie; Din/Felles-toggle; henter nå-tall fra kalkulatoren. |
| Dedikert side | `src/pages/economy/FormuePage.tsx` | Stablet nedbrytning over tid, tidsspenn-kontroller, sammensetningspanel, Din/Felles. |
| Navigasjon | `EconomyPage.tsx`, `useAppStore.ts`, `types/economy.ts`, `OnboardingWizard.tsx`, `useEconomyStore.ts` | Ny `EconomySubPage`/`EconomyTab` `'formue'`, nav-element, `MODULES`-oppføring, persist-migrering (legg `'formue'` i `enabledTabs`). |

## Datamodell

```ts
export type NetWorthScope = 'din' | 'felles'

export interface NetWorthPoint {
  year: number
  month: number              // 1–12
  sparing: number            // sum sparekontoer
  fond: number
  ivf: number                // maks(0, kassesaldo)
  gjeld: number              // positivt tall (trekkes fra)
  total: number              // sparing + fond + ivf − gjeld
  isProjected: boolean       // false = faktisk (≤ nå), true = fremskrevet
}

export type NetWorthSeries = NetWorthPoint[]

export interface NetWorthInput {
  scope: NetWorthScope
  from: { year: number; month: number }   // default: tidligste datapunkt
  to: { year: number; month: number }      // default: nå + projeksjonshorisont
  now: { year: number; month: number }     // skille faktisk/projisert
  savingsAccounts: SavingsAccount[]
  fondPortfolio: FondPortfolio
  ivfTransactions: IVFTransaction[]         // delt prosjekt hvis koblet, ellers personlig
  debts: DebtAccount[]
  partnerVeikart: PartnerVeikart            // brukes kun ved scope === 'felles'
}
```

## Beregningsmotor

`computeNetWorthSeries(input)` itererer hver måned fra `from` til `to` og bygger ett
`NetWorthPoint`. For hver aktivaklasse skilles **faktisk** (≤ `now`) fra **projisert** (> `now`).

**Sparing**
- Faktisk: `computeEffectiveBalance(konto, månedsslutt)` (bruker `balanceHistory` + innskudd + rente).
- Projisert: `projectSavingsGrowth(konto, to)` (kalt én gang per konto), indekser inn månedsverdien.

**Fond**
- Faktisk: nærmeste `snapshot.date ≤ månedsslutt` (hold siste; 0 før første snapshot).
- Projisert: framskriv fra siste snapshot med `monthlyDeposit` + forventet avkastning (`FondEntry.returnPercent`).

**IVF**
- `maks(0, Σ transaksjoner med dato ≤ månedsslutt)`. Bruker delt prosjekt-data hvis koblet, ellers `ivfTransactions`.

**Gjeld** (positivt tall, trekkes fra)
- «Nå» eksakt = `currentBalance`. Projisert fremover: `buildRepaymentPlan(gjeld).rows[i].balance`.
- Bakover: ingen lagret saldo­historikk → fortid **rekonstrueres** ved amortisering fra
  `originalAmount`/`startDate` frem til nå (forutsetter planlagte terminer; `paymentHistory`
  forfiner der den finnes). **Asymmetri dokumenteres:** sparing/fond/IVF bakover er faktiske,
  gjeld bakover er rekonstruert. Gjeld uten `startDate`/`originalAmount` → start ved nå.

**Felles (Din + Partner)**
Partners formue legges oppå per måned. Partner har bare nåverdier (`partnerVeikart`:
`accounts`, `debts`, `bsu`, `fondCurrentValue`), ingen `balanceHistory` → partnerdelen
**simuleres** bakover og fremover fra saldo + `monthlyContribution` + `rate` (gjenbruker
`partnerNonBsuEquity`/`partnerMonthlySavingsTotal`-logikken). Caveat: i Felles er
partner-bidraget en simulering, ikke faktiske historiske tall.

**Split ved «nå»**: `isProjected = (år/måned > now)`, slik at `FormueChart` tegner
faktisk-delen heltrukket og projeksjonen stiplet.

**Ytelse**: rene tall, memoisert i `useNetWorthSeries` på relevante store-snitt.
Månedsoppløsning over ~5 år + horisont = få hundre punkter — billig.

## UI

**Dashboard (kompakt)**
- `FormueChart` mates med formue-serien (total) i stedet for inntektstrend; etikett «Netto formue», stiplet projeksjon.
- Liten **Din/Felles**-toggle over grafen (kun når `partnerVeikart.enabled`). Toggelen
  bytter **kun grafens** scope. Hero-tallet (nettoFormue) og helsescore forblir **Din**
  (personlig oversikt) for å ikke endre helsescore-grunnlaget — Felles husholdning ses i grafen.
- **Konsistens-refaktor:** `HeroBand`-nettoFormue + totalSparing/totalGjeld hentes fra
  kalkulatorens nå-punkt (scope `'din'`) i stedet for egen inline-beregning → én kilde.

**Dedikert side `FormuePage.tsx`**
- Topp: nåværende formue + Din/Felles-toggle + endring (delta vs periodestart).
- **Nedbrytning over tid (stablet)**: recharts stablet areal (sparing/fond/IVF positivt,
  gjeld som eget areal under null) + total-linje. Recharts er allerede avhengighet.
- Tidsspenn-kontroller: segmentert (1 år / 3 år / 5 år / Alt) for historikk + projeksjon på/av med horisont.
- Sammensetningspanel: dagens fordeling per aktivaklasse (beløp + andel).

## Feilhåndtering / kanttilfeller

- Ingen finansdata → tomtilstand («Legg til sparing/gjeld for å se formue over tid»).
- `partnerVeikart` ikke aktivert → Felles-toggle skjult.
- Gjeld uten `startDate`/`originalAmount` → hopp over fortids­rekonstruksjon (start ved nå).
- Manglende `expectedReturn`/`returnPercent` → hold flatt fremover.
- Ingen fond-snapshots → fond bidrar 0 i historikken.

## Testing

`src/domain/economy/__tests__/netWorthCalculator.test.ts` (domenetester):
- **Konsistens-invariant**: nå-punkt.total == `Σ computeEffectiveBalance + fond + maks(0,ivf) − Σ currentBalance`.
- Sparing bakover bruker `balanceHistory`; projeksjon fremover vokser med innskudd.
- Gjeld amortiserer ned til `currentBalance` ved nå.
- `felles` == `din` + simulert partner.
- `isProjected` splitter korrekt ved nå.
- Tom input → tom/flat serie.

## Konsistens-wiring (stående regel)

Én kalkulator → dashbord-graf + Formue-side + hero-tall konsumerer samme serie, så de kan
ikke divergere. Rekonsiliering-test låser nå-punktet mot dashbordets eksisterende
formue-tall. Alle input ligger allerede i synket store (inkl. `partnerVeikart`), så A3 er
sky-konsistent uten ny synk. Se [[arbeidsregel-helhetlig-konsistens]].

## Åpne punkter til implementering

- Bekreft `projectSavingsGrowth`-indeksering (returnerer månedsserie fra konto-start — finn riktig månedsoffset).
- Fastsett standard projeksjonshorisont (forslag: 5 år, eller gjenbruk Veikart-horisont).
- Avklar om dedikert side trenger egen `MODULES`-default (`defaultFor`), eller kun toggle-bar.
