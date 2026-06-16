# Design: Toggle for forventet lønnsoppgjør i budsjettprognosen

**Dato:** 2026-06-16
**Status:** Godkjent design

## Problem

`computeBudgetTable` projiserer månedslønn for fremtidige måneder primært fra
lønnsoppgjør (`LonnsoppgjorRecord`). I dag brukes **alle** oppgjør automatisk,
inkludert `source: 'forventet'`, så lenge `maanedslonn > 0` og `effectiveDate`
er passert. Det finnes ingen måte å ekskludere et forventet (antatt) oppgjør fra
prognosen uten å slette det, og ingen tydelig indikasjon på om det er aktivt.
Brukeren vet derfor ikke om et antatt oppgjørsresultat ligger inne, og resten av
årets projisering blir feil/uklar.

## Beslutninger (fra brainstorming)

- **Granularitet:** Per oppgjør (av/på-bryter per rad), ikke én global bryter.
- **Standardtilstand:** Inaktivt som standard. Nye forventede oppgjør er AV til
  brukeren slår dem på. Eksisterende forventede oppgjør slås AV ved migrering.
- **Plassering:** Både Lønn-fanen (bryter + Aktiv/Inaktiv-merke der oppgjørene
  administreres) og Budsjett-fanen (indikator + hurtigbryter ved Månedslønn-raden).

## Løsning

### 1. Datamodell — `src/types/economy.ts`

Nytt valgfritt felt på `LonnsoppgjorRecord`:

```ts
/** Kun relevant for source:'forventet'. Absent/false = ekskludert fra
 *  prognosen, true = inkludert. */
activeInProjection?: boolean
```

Semantikk: `slip`- og `manual`-oppgjør (faktiske/bekreftede) brukes alltid i
prognosen. Kun `forventet` gates av flagget. Fravær av flagget tolkes som
inaktiv (matcher «inaktivt som standard» og gjør migrering/round-trip trygt).

### 2. Prognoselogikk — `src/domain/economy/budgetTableComputer.ts`

Eneste stedet prognosen avgjøres. I `salaryFromOppgjor` endres filteret fra:

```ts
.filter((r) => r.maanedslonn > 0)
```

til:

```ts
.filter((r) => r.maanedslonn > 0 && (r.source !== 'forventet' || r.activeInProjection === true))
```

Fordi både budsjett-tabellen og nedstrøms-konsumenter bygger på
`computeBudgetTable`, blir effekten konsistent overalt.

### 3. Store + migrering — `src/application/useEconomyStore.ts`

- Bump persist-versjon **19 → 20**.
- Migrering `if (fromVersion < 20)`: sett `activeInProjection: false` eksplisitt
  på alle eksisterende `forventet`-oppgjør (slår dem av).
- `importData` (Supabase-sync/backup-path som omgår persist-migreringene): siden
  «absent = inaktiv» er semantikken, round-tripper feltet trygt uten
  spesialhåndtering. Verifiseres i implementasjonen.

### 4. Lønn-fanen — `src/pages/economy/SalaryPage.tsx`

- Av/på-bryter på hver `forventet`-rad i Lønnsoppgjør-listen →
  `updateLonnsoppgjor(id, { activeInProjection: !current })`.
- Tydelig tilstand: **Aktiv** (grønn, full opacity) vs **Inaktiv** (dempet,
  «Inaktiv»-badge). Erstatter dagens uniforme `opacity-70` på forventet-rader.
- `pendingOppgjor`-banneret filtreres til kun `activeInProjection === true`, så
  det ikke villeder om hva som faktisk er med i prognosen.
- Nytt forventet oppgjør opprettes med `activeInProjection: false` (skjemaets
  default-state).

### 5. Budsjett-fanen — `src/pages/economy/BudgetPage.tsx`

Liten indikator ved Månedslønn-raden når et forventet oppgjør er relevant for
det viste budsjettåret:

- Aktivt: grønt merke, f.eks. «Forventet oppgjør på (+X kr/mnd fra mai)».
- Av: dempet/amber «Forventet oppgjør AV — prognose uten oppgjør».
- Hurtigbryter rett på indikatoren (kaller `updateLonnsoppgjor`), så brukeren
  kan toggle der prognosen vises.

### 6. Tester — `src/domain/economy/__tests__/budgetTableComputer.test.ts`

- `forventet` med `activeInProjection: true` → brukes i prognosen.
- `forventet` med `false`/`undefined` → ekskluderes.
- `slip`/`manual` → brukes alltid, uavhengig av flagget.

## Konsekvenser

- Etter oppdateringen endres brukerens nåværende prognose umiddelbart: eksisterende
  forventede oppgjør slutter å telle til de slås på igjen. Dette er tilsiktet
  («tryggest mot feil prognose») og kommunisert.

## Utenfor scope

- Global bryter for alle forventede oppgjør.
- Endring av hvordan `slip`/`manual`-oppgjør eller trend-fallback fungerer.
- Endringer i Veikart/Sparing utover det som følger automatisk av at de bygger
  på `computeBudgetTable`.
