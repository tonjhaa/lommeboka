# Månedsoversikt: behold historikk (grået ut) i stedet for at den forsvinner

Dato: 2026-07-04
Status: Godkjent, klar for implementasjonsplan

## Problem

I "Sparing"-fanens `MånedsoversiktTable` (`src/pages/economy/SavingsPage.tsx`) er
`monthRows` et rent fremoverrettet prognosevindu: `Array.from({ length: horizonMonths },
(_, i) => ...)` starter alltid på inneværende måned (`i = 0`) og går `horizonMonths`
måneder frem. Hver gang en ny kalendermåned begynner, ruller vinduet ett hakk frem —
forrige måneds rad forsvinner fra tabellen og "absorberes" i den beregnede
inngående saldoen (`startBalance` via `computeEffectiveBalance(acc, prevMonthEnd)`).

Brukeropplevelsen: måneder man har vært innom og fylt ut, forsvinner sporløst etter
hvert som tiden går. Ønsket: tidligere måneder skal fortsatt vises, men grået ut og
skrivebeskyttet — ikke fjernes.

## Avklarte krav (fra brainstorming)

- Historikk vises **helt tilbake til kontoen ble opprettet** (ikke en rullerende
  begrenset periode).
- Passerte måneder er **skrivebeskyttet** (ingen `InnskuddCell`-redigering).
- Tallene som vises for passerte måneder skal være **faktiske historiske verdier**,
  ikke de samme plan-baserte estimatene tabellen alltid har brukt for prognosen.
- Historikk vises for **alle kolonner der ekte data finnes** (egne kontoer + eget
  fond). Kolonner uten historiske data (se under) viser "–", ikke oppdiktede tall.
- Tidligere år er **kollapset som standard**; inneværende år (og fremtidige år) er
  utvidet som i dag.

## Datamodell-begrensning (fastslått under research)

| Kolonne | Har transaksjonshistorikk? | Kilde |
|---|---|---|
| Egne sparekontoer (`SavingsAccount`) | Ja — `openingBalance`, `openingDate`, `balanceHistory`, `contributions`, `withdrawals` | `src/types/economy.ts:312-346` |
| Eget fond (`FondPortfolio`) | Ja — `startDate`, `snapshots[]` (manuelt daterte verdipunkter) | `src/types/economy.ts:587-594` |
| Partnerkonto (`PartnerAccount`) | **Nei** — kun `balance` (øyeblikksbilde), ingen `openingDate`/historikk. Dokumentert i kildekoden: "Enkel sparekonto for partner — ingen full transaksjonshistorikk" | `src/types/economy.ts:708-721` |
| Partnerfond (`partnerVeikart.fondCurrentValue`/`fondHoldings`) | **Nei** — samme snapshot-begrensning | `src/types/economy.ts:790-799` |
| Gjeld / kjøpekraft (maxKjøpesum, EK) | Nei i praksis — dette er alltid *avledede* projeksjoner (basert på dagens inntekt/gjeldsvilkår), ikke en historisk fasit. "Hva var min kjøpekraft for 3 år siden" er ikke et meningsfullt spørsmål å rekonstruere med dagens regler. | — |

Konklusjon: kun egne kontoer og eget fond får ekte historiske tall. Alt annet viser
"–" for passerte måneder — konsistent med tabellens eksisterende konvensjon for
manglende data (se f.eks. linje 1461, 1516: `x > 0 ? x.toLocaleString(...) : '—'`).

## Arkitektur

**To uavhengige beregningssteg — ikke én utvidet loop.**

Dagens `monthRows`-simulering (useMemo, linje ~801–1050) er en løpende
tilstandsmaskin forankret i "nå": renteberegning, BSU-årskvote-takking, og
gjeldsnedbetaling (`for (let m = 0; m < i + 1; m++)`, linje ~1012) forutsetter
eksplisitt `i >= 0`. Å utvide denne til negative `i` (fortid) ville krevd å
"spole tilbake" kvoter og nedbetalingsplaner kunstig — høy regresjonsrisiko for lite
gevinst, siden fortiden uansett skal vise ekte tall, ikke re-simulerte.

I stedet:

1. **`monthRows` beholdes helt uendret.** Fortsatt fremoverrettet fra `now`,
   `horizonMonths` måneder. `goalRow`-søket (linje ~1066) og "åpne som
   scenario"-knappen fortsetter å virke kun på denne, som i dag.

2. **Ny `pastRows`-beregning** (egen `useMemo` eller del av samme, men logisk
   atskilt): for hver måned fra `min(alle kontoers openingDate, fondets startDate)`
   til og med måneden før inneværende:
   - Egne kontoer: `balance = computeEffectiveBalance(acc, monthEnd)` (samme
     funksjon som i dag brukes til å beregne inngående saldo). `contribution` =
     faktisk sum av `acc.contributions`/`acc.withdrawals` datert i den måneden.
     "Rente"-tallet vises som residual: `balance(monthEnd) - balance(prevMonthEnd)
     - contribution` — samme prinsipp fondet allerede bruker for snapshots
     (linje 918: `fondInterest = fondBal - prevFondBal - effectiveFondMnd`).
   - Eget fond: gjenbruk eksisterende snapshot-oppslag (linje 913:
     `fondPortfolio?.snapshots?.find(s => s.date.slice(0,7) === ym)`), samme
     residual-prinsipp for "avkastning".
   - Kontoer som ikke eksisterte ennå i en gitt måned (måned < kontoens
     `openingDate`): cellen viser "–" for akkurat den kontoen, ikke for hele raden.
   - Partnerkontoer, partnerfond, gjeld, kjøpekraft-kolonner: "–" for alle
     passerte måneder (se tabell over).
   - Hver rad merkes `isPast: true`.

3. **Rendering:** `years`/`yearData` bygges fra `[...pastRows, ...monthRows]`.

## UI-endringer

- **Måneds-rader** (`isPast === true`): `InnskuddCell` erstattes med vanlig
  skrivebeskyttet tekst. Styling: `text-muted-foreground` + noe redusert
  opacity på hele raden — samme visuelle språk som Rentehistorikk-blokken
  (linje ~2148-2160: `isFuture`/`isCurrent`-mønsteret, her speilvendt til
  `isPast`/`isCurrent`).
- **År-header, redigerbar startsaldo-celle:** i dag styrt av
  `isFirstYear = year === years[0]` (array-rekkefølge). Dette er feil når
  `years[0]` blir et historisk år etter denne endringen. Erstattes med et
  eksplisitt `isCurrentYear = year === now.getFullYear()` som eneste betingelse
  for å vise de redigerbare `InnskuddCell`-ene for startsaldo (kontoer, fond,
  partner-BSU, partnerfond, partnerkontoer — alle 5 steder som i dag sjekker
  `isFirstYear`).
- **År-header for tidligere år** (inkl. det aller tidligste året, som ikke har
  noe "forrige år" å rulle opp fra i arrayet): vises alltid som skrivebeskyttet
  rollup, akkurat som "ikke-første år"-grenen gjør i dag. For det aller
  tidligste året, der `prevYearRows` er tom, syntetiseres en åpningssaldo via
  `computeEffectiveBalance(acc, 31.12 året før)` (og tilsvarende fond-oppslag)
  i stedet for `contribOverrides['start-...']`.
- **Kollaps:** `collapsedYears` initialiseres til `{ alle år unntatt
  currentYear og år > currentYear }` i stedet for tom `Set` — tidligere år er
  kollapset ved første last, brukeren kan fortsatt åpne dem manuelt (samme
  toggle-mekanikk som i dag).

## Ikke i scope

- Ingen endring i `monthRows`/prognose-simuleringen (renter, BSU-kvoter,
  gjeldsnedbetaling) — kun visning av fortiden legges til ved siden av.
- Ingen rekonstruksjon av historisk gjeld, kjøpekraft eller partnerdata — disse
  forblir "–" bakover i tid, se begrunnelse over.
- Ingen endring i `horizonMonths`-velgeren (12/24/36/72 måneder frem) — den
  styrer fortsatt kun fremtidsvinduet.
- Ingen persistering av `collapsedYears`-tilstand (ingen endring fra dagens
  oppførsel — nullstilles ved remount, kun standardverdien endres).

## Risiko / ting å teste

- `isFirstYear` → `isCurrentYear`-endringen berører 5 nesten like kodeblokker
  (egne kontoer, fond, partner-BSU, partnerfond, partnerkontoer) — hver må
  verifiseres separat.
- Kontoer opprettet i inneværende måned (ingen reell fortid): `pastRows` skal
  da bli tom eller kort — sjekk at tabellen ikke viser tomme/rare rader for
  perioden før kontoen fantes.
- BSU-kontoer i fortiden: skal IKKE kjøre kvote-/takbegrensning på nytt (det er
  historikk, ikke simulering) — kun vise faktisk saldo/innskudd.
- Ytelse: `computeEffectiveBalance` kalles nå opptil (antall måneder × antall
  kontoer) ganger ekstra — forvent trivielt for realistiske kontohistorikker
  (få år, få kontoer), men verifiser ingen merkbar treghet ved åpning av siden.
- `npm run build` (`tsc -b`) må kjøres før commit per prosjektregel — fanger
  `noUnusedLocals`/`noUnusedParameters` som `tsc --noEmit` ikke gjør.
