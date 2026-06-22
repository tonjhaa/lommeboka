# Boligkalkulator — UX-forenkling (essensielt-først) — Design

**Dato:** 2026-06-22
**Status:** Godkjent design — klar for implementeringsplan
**Branch:** `feat/boligkalkulator-ux-forenkling`

## Sammendrag

Boligkalkulatoren oppleves overveldende: ~25 inputfelt over tre faner og 6 resultatkort
vises samtidig. Denne omleggingen gjør den til **én smart «essensiell»-side**: få essensielle
felt + ett tydelig hovedsvar synlig, alt annet bak progressiv avsløring. Profil-broen
(forhåndsfyll fra lønnsprofil/Partner) løftes fram. Ren presentasjons-reorganisering — ingen
beregning, intet felt og ingen konsistens-kontrakt endres; all funksjonalitet (inkl. ny
kausjonist) bevares, bare flyttet fra «alltid synlig» til «én klikk unna».

## Problem (forankret i faktisk kode)

- **«Lån»-fanen: 10 felt** vist flatt, inkl. 4 nylig tillagte kausjon-felt uten progressiv avsløring.
- **~25 felt totalt** over tre faner (Bolig 5 · Husstand ~8 · Lån 10).
- **6 resultatkort samtidig** (egenkapital, gjeldsgrad, betjeningsevne, maks kjøpesum, sparemål, status).
- Bruker valgte ALLE fire problemkilder: for mange felt, redundant inntasting, layout-tetthet, uklare verdier.

**Eksisterende styrker som utnyttes:** `profileBridge` (forhåndsfyll fra økonomiprofil + Partner),
betinget visning i `PropertyForm` (eiendomsskatt skjules for borettslag), medsøker bak toggle,
tooltips. Defaults finnes alt (rente 5,5 %, løpetid 25 år).

## Beslutninger (fra brainstorm)

| Spørsmål | Valg |
|----------|------|
| Hovedproblem | Alle fire: felt-antall, redundant inntasting, layout-tetthet, uklare verdier |
| Tilnærming | Én smart «essensiell»-side (ikke 3 faner, ikke veiviser) |
| Scope | Både input- OG resultatside forenkles |

## Input-siden — én side, tre soner

**Sone 1 — Profil-forhåndsfyll (øverst, fremtredende):**
Ved første åpning av tomt scenario auto-fyll inntekt/EK/gjeld fra lønnsprofil hvis den finnes,
med «✨ Hentet fra profilen din»-stripe + «Oppdater»/«Hent medsøker fra Partner». Bruker
eksisterende `extractLoanInputFromEconomy`/`extractCoApplicantFromPartner` — ingen ny logikk.

**Sone 2 — Essensielle felt (alltid synlig, 4 stk):**
- Bruttoinntekt (deg) — + medsøkers inntekt vises her KUN hvis medsøker er på
- Egenkapital
- Eksisterende gjeld
- Boligpris

Disse fire driver hovedsvaret. Live-oppdatering (ingen «Beregn»-knapp).

**Sone 3 — Tre kollapsede seksjoner (lukket som standard):**
- **▾ Boligdetaljer** — eierform, boligtype, fellesgjeld, fellesutgifter, eiendomsskatt (PropertyForm minus pris)
- **▾ Husstand & medsøker** — medsøker-toggle, barn, voksne, navn (HouseholdForm minus inntekt)
- **▾ Avanserte lånevilkår** — rente, løpetid, lånetype, ekstra utgifter, hele kausjon-seksjonen (4 felt flyttes hit)

Kollapsede felt har fornuftige defaults, så de aldri MÅ åpnes.

## Resultatsiden — hovedsvar + detaljer

**Sone 1 — Hovedsvar (alltid synlig):**
- «Maks kjøpesum: X» stort + «— begrenset av [bindende grense]» (destillert fra `MaxPurchaseCard`).
- Status for den konkrete boligen: én grønn/rød linje («✓ Denne boligen går» / «✗ Mangler X»),
  destillert fra `StatusBanner`.
- Når kausjon er i bruk: «uten → med kausjon»-linjen + revers-svaret vises her (hører til hovedsvaret).

**Sone 2 — ▾ Vis detaljer (kollapset som standard):**
De fire forklarings-kortene flyttet hit, urørt internt: Egenkapital-, Gjeldsgrad-, Betjeningsevne-,
Sparemål-kortet + kausjonistens frie sikkerhet.

**Mobil/desktop:** dagens side-om-side (desktop) / stablet (mobil) beholdes. Hovedsvaret synlig
rett under essensielle felt; detaljer kollapset → roligere side begge steder.

## Arkitektur (gjenbruk, ikke omskriving)

| Komponent | Endring |
|-----------|---------|
| `ScenarioFormPanel.tsx` | Erstatt `<Tabs>` med én-side-layout: profil-stripe + essensielle felt + tre Collapsible-seksjoner. |
| `PropertyForm` / `HouseholdForm` / `LoanForm` | Får en `section: 'essential' \| 'advanced'`-prop som styrer hvilke felt komponenten rendrer — samme komponent gjenbrukes begge steder, ingen duplisert felt-JSX. |
| `ResultsPanel.tsx` | Hovedsvar-blokk (destillert fra MaxPurchaseCard + StatusBanner) + Collapsible rundt de fire detaljkortene. |
| Kort-komponenter (`MaxPurchaseCard` m.fl.) | Uendret internt — flyttet inn i kollaps (detaljer) eller destillert opp (hovedsvar). |

Bruk eksisterende Collapsible/`<details>`-mønster i kodebasen. **Ingen endring i**
`useAllCalculations`, `maxPurchase.ts`, stores, eller scenario-håndtering (ScenarioComparison,
flere scenarioer beholdes uendret over den nye layouten).

## Feilhåndtering / kanttilfeller

- Ingen profil tilgjengelig → ingen forhåndsfyll-stripe, essensielle felt starter tomme/med default (som i dag).
- Medsøker av → medsøkers inntektsfelt vises ikke i essensielle felt; toggle ligger i «Husstand & medsøker».
- Bruker som åpner alle kollapsene → ser nøyaktig dagens kalkulator (funksjonsbevaring).
- Eiendomsskatt-feltet beholder dagens betinget-visning (skjult for borettslag) inne i «Boligdetaljer».

## Konsistens-wiring (stående regel)

- **Ren presentasjons-reorganisering:** ingen beregning, intet felt, ingen konsistens-kontrakt
  endres. Samme `scenario`-state, samme `update`-stier, samme resultat-tall.
- **Funksjonsbevarings-invariant:** hvert felt som finnes i dag finnes etterpå (bare flyttet).
  Kausjon-funksjonen flyttes intakt til «Avanserte lånevilkår».
- Eksisterende `calculator.test.ts`/`maxPurchase.test.ts` består uendret (logikken urørt) —
  sikringen på at omleggingen er rent kosmetisk. Se [[arbeidsregel-helhetlig-konsistens]].

## Testing

- Fokuserte interaksjonstester: (a) essensielle felt synlige ved åpning; (b) kollaps åpner/viser
  avanserte felt; (c) endring i kollapset felt (f.eks. kausjon) påvirker hovedsvaret likt som før;
  (d) profil-forhåndsfyll fyller essensielle felt.
- Regresjonsvern: alle eksisterende kalkulator-tester grønne uendret.
- Manuell røyktest: åpne → se ~5 ting; fyll essensielle → hovedsvar live; åpne hver kollaps; mobil.

## Åpne punkter til implementering

- Bekreft eksakt Collapsible-komponent i kodebasen (shadcn Collapsible vs `<details>`) — bruk den
  som alt er i bruk for konsistent stil.
- Bekreft `section`-prop-tilnærmingen mot faktisk felt-struktur i hvert skjema; alternativt to små
  underkomponenter per skjema (EssentialFields/AdvancedFields) hvis det blir renere enn én prop.
- Bekreft at profil-auto-fyll ved første åpning ikke kolliderer med eksisterende
  `bridgeSnapshot`-logikk (HouseholdForm har allerede snapshot-håndtering).
- Bekreft hvordan CalculatorPage arrangerer ScenarioFormPanel + ResultsPanel (mobil/desktop) så
  hovedsvaret havner rett sted i begge.
