# Lommeboka — Backlog

> Fersk gjennomgang av hele verktøyet, forankret i faktisk kodebase.
> **Sist oppdatert:** 2026-07-02. Oppdater når punkter leveres eller nye dukker opp.
> Effort: **S** = timer, **M** = en økt, **L** = flere økter / eget delprosjekt.

## Levert nylig (kontekst)
**«Vei til råd» i boligkalkulatoren (2026-07-03):** Kalkulatoren er koblet til Lommebokas
faktiske kontoer/spareplaner/gjeld (`analyzeAffordabilityPath` i `utils/affordabilityPath.ts`
— gjenbruker projectSavingsGrowth/buildRepaymentPlan). Nytt kort viser NÅR alle tre
forskriftskravene blir oppfylt for scenarioets bolig (EK-projeksjon m/ renter, BSU-tak,
fond, partner) + hva som mangler i dag: EK-gap, nødvendig kausjon (m/ tak-sjekk) og
lønnsgap for gjeldsgrad/betjeningsevne (invers progressiv skatt). Erstattet det naive
lineære Sparemål-kortet.

**Boligkalkulator-revisjon + FINN-oppslag (2026-07-03):** Kritisk modellgjennomgang mot
utlånsforskriften. Fikset: fellesgjeld var bakt inn i eget lån (dobbelttelte betjening,
feil lånebeløp/amortisering — nå: eget lån separat, fellesgjeld i gjeldsgrad/LTV +
rentestress 3pp/12 i betjeningsevnen), otherIncome talte i gjeldsgrad men ikke
betjeningsevne, oppdiktet 10 % SIFO-«stordriftsrabatt» fjernet (banker regner full SIFO).
UI: kjøpsår uten tusenskilletegn, MiniSummary-tekstkollisjon fikset (stablede celler),
«1 advarsler»-grammatikk. NYTT: FINN-kode-oppslag (`api/finn.ts` + parser i
`src/domain/finn/` + vite-dev-middleware) — lim inn FINN-kode/lenke i kalkulatoren,
alle felt fylles og «har dere råd»-verdikt vises mot maks kjøpsbeløp.

**IA-ombygging (2026-07-02):** gruppert to-nivå-navigasjon (Oversikt/Inntekt/Utgifter/
Sparing & gjeld/Fremtid/Livet) eier nå ALL navigasjon i `MainNav.tsx`; EconomyPage har ingen
egen fanerad. Tynne faner slått sammen: Forbruk + Treffsikkerhet → visninger i Budsjett,
Formue → «Detaljer»-dialog på Dashbord. Pengepuls-chips prioriteres (rød > gul > nøytral > grønn),
maks 5 synlige + dismiss (7 dager, persistert i useAppStore). Én motor per formål:
`useBudgetTable` (kanonisk budsjettabell m/ trekktabell+lønnsoppgjør+ansettelsesdato overalt),
`useForecastAccuracy`, `usePensionBaseInput`. Døde AppViews fjernet + migrering (v3) av
persisted navigasjon.

Tidligere: Pensjonsmodul · Formue over tid · Treffsikkerhet (kalibrering) · Scenario-simulator ·
Nøkkeltall-register (fundament + auto-hent G fra NAV) · security-CI-fiks + SHA-pinning.
Alle i prod på lommeboka.com. Specs i `docs/superpowers/specs/`.

---

## 1. Datakvalitet & integrasjoner

### 1.1 Auto-kategorisering av bankimport — ✅ A+B LEVERT (2026-06-22) · C gjenstår — **M**
**A+B levert** (`feat/forbruk-import-kategorisering`, PR #11): forbruks-import av brukskonto-CSV,
auto-kategorisering (seed + brukerlærte regler, helord-match), «forbruk vs budsjett»-oversikt.
Spec: `2026-06-22-forbruk-import-kategorisering-design.md`.
- **C gjenstår — wire kategorisert forbruk inn i Treffsikkerhet-kalibreringen:** bruk
  `aggregateByCategory(txs, år, mnd)` som «faktisk» for utgiftsrader i `budgetTableComputer`/
  `computeAccuracy`. **Dette låser endelig opp utgiftskalibrering i #6** — selve sluttgevinsten.
  Motoren er allerede klar (egen oppfølging, bygger rett på aggregateByCategory).

### 1.2 Excel-/CSV-eksport av økonomidata — **S/M**
`xlsx ^0.18.5` er allerede en avhengighet (brukes i `absenceImporter.ts` til *import*).
Generell **eksport** av budsjett/formue/lønn/årsoppsummering mangler. Lav kostnad siden
biblioteket er på plass.
- **Verdi:** dele med regnskapsfører, egen analyse, backup i lesbart format.

---

## 2. Plattform & infrastruktur

### 2.1 PWA + offline — **M/L**
Ingen `vite-plugin-pwa`/workbox/service-worker i dag. Gjør appen installerbar og lesbar
offline (cache av siste synkede data). Relevant for en app man sjekker på mobil.
- **Avhenger av:** vurder samspill med Supabase-synk (offline-skriving → konfliktløsning).

### 2.2 Varsler/notifikasjoner — **M**
Ingen push/notification-infra. Aktuelle triggere finnes alt i domenet: forfall (gjeld/abo),
fravær nær kvote (egenmelding 24/varselterskel 21), utdatert nøkkeltall (`isStale`),
spare-ETA. Start gjerne med in-app-varselsenter før ekte push.

---

## 3. Kodehelse & teknisk gjeld
*(Forankret i faktiske målinger 2026-06-22.)*

### 3.1 Rydd 42 eslint-problemer (38 feil) — **M**
`npx eslint src` gir 38 feil + 4 advarsler, konsentrert i `SalaryPage` (4+), `IVFPage` (3+),
`TaxSettlementPage`, `SavingsPage`, `TaxCalculatorPage`, `OnboardingWizard`, `EconomyDashboard`.
Mest React 19 «Calling setState synchronously within an effect» + et par `no-unused-expressions`.
Bygger fortsatt (tsc, ikke eslint, gater build), men det er reell renderkvalitets-gjeld.
- **Verdi:** færre kaskaderenders, ryddigere kodebase, eslint kan gjøres til CI-gate senere.

### 3.2 Del opp de største filene — **M/L per fil**
`SavingsPage.tsx` (3545), `SalaryPage.tsx` (1934), `GiftPage.tsx` (1878), `BudgetPage.tsx`
(1797), `useEconomyStore.ts` (1547). Store filer er vanskelige å reviewe og endre trygt.
Splitt etter ansvar (under-komponenter / slices), ikke teknisk lag.
- **Verdi:** tryggere endringer, lettere review (også for AI-assistert arbeid).

### 3.3 UI-/interaksjons-testdekning — **M (løpende)**
Domenelaget er godt dekket (23 moduler / 27 testfiler), men UI-laget (235 knapper) er nær
utestet. Legg til fokuserte interaksjons-/regresjonstester på de mest kritiske flytene
(budsjett, lønn, sparing) med React Testing Library.

---

## 4. Tilgjengelighet, mobil & polering

### 4.1 a11y-pass på ikon-knapper — **S/M**
Kun 32 `aria-label`/`role` mot 235 `<button>`. Tekst-knapper er greie, men ikon-only-knapper
(lucide-ikoner) trenger `aria-label`. Gå gjennom og merk dem; legg til fokus-synlighet der det mangler.

### 4.2 Mobil-polering — **M**
Gjennomgang av touch-targets, scroll-områder og tabell-/grid-overflow på små skjermer
(flere sider har brede grids/tabeller, f.eks. budsjett, ATF, Veikart).

### 4.3 Kontekstuell onboarding — **M**
`OnboardingWizard.tsx` finnes (modul-toggling). Utvid med kontekstuelle hint/tomtilstander
i nye/komplekse moduler (scenario, nøkkeltall-register, pensjon) for nye brukere.

### 4.4 PartnerPage: dashbordkortenes onNavigate treffer feil tab — **S**
`PartnerPage` rendrer `EconomyDashboard` med `onNavigate={(p) => setTab(p as Tab)}`, men
dashbordets sider heter `savings`/`atf`/`debt` mens partner-tabene heter `sparing`/`gjeld` …
Knappene («Legg til lån» osv.) gjør derfor ingenting i partner-kontekst. Map id-ene eller
skjul knappene der. (Pre-eksisterende, oppdaget under IA-ombyggingen 2026-07-02.)

### 4.5 Kjøpekraft: Veikart-motoren mangler betjeningsevne-regelen — **M**
`calcMaxPurchaseSimple` (Veikart/Sparing/Simulator/dashbord-chip) bruker EK- og gjeldsgrad-
regelen, mens Boligkalkulatorens `analyzeMaxPurchase` også har betjeningsevne (SIFO + stressrente).
Alle bruker samme modul (`utils/maxPurchase.ts`), men tallene kan avvike når betjeningsevnen
binder. Vurder å la den forenklede varianten ta inn husholdningsdata når de finnes.

---

## 5. Nye features (ideer)

### 5.1 Strømstøtte-kalkulator — **M**
Norsk strømstøtte-ordning som egen kalkulator/budsjettpost (forbruk × spotpris → støttegrad).
Sesongavhengig; kan kobles til budsjett.

### 5.2 Flere auto-hent-kilder (utvider delprosjekt 2) — **M hver**
`SOURCE_URLS`/`FETCH_SOURCES` har en ren seam for flere kilder. Kandidater hvis strukturert
kilde finnes: delingstall, skattesatser. Krever undersøkelse av om offentlig API/strukturert
data eksisterer (skatteetaten/trekktabell er kompleks; flagget som skjørt i delprosjekt 1).

### 5.3 Virkningsår-input i nøkkeltall-UI — **S**
Final review av registeret flagget at UI låser override til inneværende år, mens resolver/store
støtter vilkårlig år. Liten utvidelse: la bruker velge virkningsår ved manuell redigering.

---

## Anbefalt rekkefølge
1. **1.1 Auto-kategorisering bankimport** — størst verdi (låser opp utgiftskalibrering i #6).
2. **3.1 eslint-opprydding** — rask, hever kodehelse på tvers, kan gjøres til CI-gate.
3. **1.2 Excel-eksport** — lav kostnad (xlsx finnes), konkret nytte.
4. Deretter etter behov: PWA (2.1), varsler (2.2), fil-splitting (3.2), a11y (4.1).
