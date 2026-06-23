# År-bevisst profil-bro i boligkalkulatoren — Design

**Dato:** 2026-06-22
**Status:** Godkjent design — klar for implementeringsplan
**Branch:** `feat/aar-bevisst-profilbro`

## Sammendrag

Boligkalkulatoren kan gjelde et fremtidig kjøpsår (f.eks. «Boligkjøp juni 2029»), men
profil-broen henter i dag bare dagens snapshot av lønn/EK/gjeld. Denne funksjonen gjør broen
**år-bevisst**: et «Kjøpsår»-felt styrer broen, som da henter PROJISERTE tall for det året —
lønn (lønnsvekst), egenkapital og restgjeld (fra `computeNetWorthSeries`, samme motor som
Formue-over-tid) — for både søker og partner. Den rydder samtidig opp i medsøker-UX-en med
én tydelig «Inkluder partner»-bryter. Default kjøpsår = i dag ⇒ nøyaktig dagens bro.

## Problem (forankret i faktisk kode)

- `profileBridge.extractLoanInputFromEconomy()` bruker dagens snapshot: `calcBridgeIncome`
  (baseMonthly×12 + faste tillegg), `calcBridgeEquity` (effektiv saldo NÅ + siste fond-snapshot),
  og dagens debt-balanser. Alt «nå».
- Scenarioet kan være for 2029 → de hentede tallene er villedende (dagens tall, ikke 2029).
- Medsøker-UX forvirrende: overlappende medsøker-toggle + «Hent medsøker fra Partner»-knapp.

**Eksisterende motorer som gjenbrukes (konsistens-kontrakt):**
- `computeNetWorthSeries` (`netWorthCalculator.ts`) projiserer `sparing`, `fond`, `gjeld`
  måned-for-måned med `isProjected`-flagg; støtter «felles»-scope (folder inn partner via
  `partnerVeikart`). Samme motor som Formue-over-tid.
- Lønnsvekst: `LONNSVEKST_DEFAULT = 3.0` (`economy.config.ts`); pensjon bruker
  `inntekt × (1 + salaryGrowthPct/100)^(toYear − currentYear)`.

## Beslutninger (fra brainstorm)

| Spørsmål | Valg |
|----------|------|
| År-styring | Velg år → broen projiserer automatisk |
| Medsøker | Én «Inkluder partner som medsøker»-bryter (erstatter dagens toggle + «Hent medsøker») |

## Projeksjons-mekanisme

| Størrelse | Kilde for år Y | Antakelse |
|-----------|----------------|-----------|
| **Lønn** | `nå-inntekt × (1 + LONNSVEKST_DEFAULT/100)^(Y − nå)` | varig inntekt vokser med antatt sats |
| **Egenkapital** | `computeNetWorthSeries(nå → Y)` siste punkt: `sparing + fond` | fortsatt sparing på dagens nivå (= Formue-over-tid) |
| **Restgjeld** | samme serie-punkt: `gjeld` | dagens nedbetalingstakt |

Ett `computeNetWorthSeries`-kall gir BÅDE EK og restgjeld for år Y. Lønn er en vekst-formel.

**Partner (når bryteren er på):**
- Partner-lønn: fra Partner-fanen × samme vekst.
- Partner-EK/gjeld: `computeNetWorthSeries` med `scope='felles'` folder inn partners formue via
  `partnerVeikart` — samme motor, samme år.

**Projiserte tall er anslag:** fylles inn i feltene (redigerbare som i dag), men merkes «anslag
for [år]». Default kjøpsår = i dag ⇒ ingen vekst ⇒ bit-identisk med dagens bro.

## UX-flyt

1. **«Kjøpsår»-felt** øverst (ved profil-broen): tallvelger, default inneværende år.
2. **«Hent fra Lommeboka for [år]»** fyller projiserte tall for primærsøker (auto ved år-endring).
3. **«Inkluder partner som medsøker»-bryter** — erstatter dagens medsøker-toggle OG «Hent
   medsøker»-knapp. PÅ ⇒ partner projiseres for samme år, legges til som søker 2.
4. **Transparens-stripe** (utvider dagens summary): hvordan hvert tall ble utledet, f.eks.
   «Lønn 2029: 690 533 → 752 000 (+3 %/år) · EK: 452 480 → 681 000 · Restgjeld: 300 175 → 180 000».
5. **«Anslag for [år]»-merking** på projiserte felt; redigerbare.

## Arkitektur (gjenbruk, ren utvidelse)

| Lag | Fil | Endring |
|-----|-----|---------|
| Domene (ren) | `src/domain/economy/bridgeProjection.ts` (ny) | `projectBridgeForYear(targetYear, scope)` → bygger `computeNetWorthSeries`-input fra storen, henter EK/gjeld ved år Y + projiserer lønn. Ren, testbar. |
| Bro | `src/application/profileBridge.ts` | `extractLoanInputFromEconomy(targetYear?)` + `extractCoApplicantFromPartner(targetYear?)` får valgfri år-param; `targetYear = nå` ⇒ dagens oppførsel. Kaller `projectBridgeForYear`. |
| Datamodell | `src/types/index.ts` | `purchaseYear?: number` på scenario-input. |
| UI | `src/components/calculator/HouseholdForm.tsx` | Kjøpsår-felt + «Inkluder partner»-bryter + utvidet transparens-stripe; auto-reproject ved år-endring. |

Projeksjonen lever i domenelaget (ren `bridgeProjection.ts`), ikke i bro/UI → enhetstestbar mot
`computeNetWorthSeries`. Bro-funksjonene blir tynne delegater.

## Feilhåndtering / kanttilfeller

- Kjøpsår = i dag/fortid ⇒ projeksjon = nå-snapshot (ingen vekst), nøyaktig dagens bro.
- Ingen partner registrert + bryter på ⇒ «Ingen partner registrert i Partner-fanen».
- Kjøpsår langt fram ⇒ projiser likevel; anslag-merkingen kommuniserer usikkerheten.
- Manglende lønnsprofil ⇒ samme «ingen profil»-melding som i dag.
- Bruker overstyrer projisert felt ⇒ overstyringen står (anslag er startpunkt).

## Konsistens-wiring (stående regel)

- EK + restgjeld for år Y kommer fra SAMME `computeNetWorthSeries` som Formue-over-tid → kan
  ikke divergere fra formue-fanen. Partner via «felles»-scope, samme motor.
- Lønnsvekst bruker samme `LONNSVEKST_DEFAULT`/formel som pensjonsmodulen.
- `targetYear = nå` ⇒ bit-identisk med dagens bro (bakoverkompat-invariant, testlåst).
- Se [[arbeidsregel-helhetlig-konsistens]].

## Testing

- `bridgeProjection.test.ts`: år = nå ⇒ nå-snapshot (invariant); fremtidig år ⇒ lønn vokser med
  sats, EK/gjeld matcher `computeNetWorthSeries`-punktet for året; `scope='felles'` folder inn
  partner; ingen-profil/ingen-partner-kanttilfeller.
- Bro-tester: `extractLoanInputFromEconomy(år)` delegerer korrekt; år=nå ⇒ uendret.

## Åpne punkter til implementering

- Bekreft eksakt `NetWorthInput`-form (`from`/`to`/`now`/`savingsAccounts`/`fondPortfolio`/
  `debts`/`scope`/`partnerVeikart`) som `projectBridgeForYear` må bygge fra storen.
- Bekreft hvor partner-lønn hentes (Partner-fanen / `extractCoApplicantFromPartner` i dag) og at
  den kan vekst-projiseres.
- Fastsett om kjøpsmåned (scenarioet er «juni 2029») skal brukes (serie er månedlig) eller kun år
  (forslag: bruk år, projiser til desember/kjøpsmåned i det året — bekreft i implementering).
- Bekreft `purchaseYear`-plassering + persist på scenario-input (useAppStore, valgfri ⇒ ingen migrering).
- Avklar om `LONNSVEKST_DEFAULT` skal kunne overstyres her eller bare brukes (forslag: bruk default, vis sats i transparens-stripa).
