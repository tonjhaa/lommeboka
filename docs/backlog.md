# Lommeboka — Backlog

> Fersk gjennomgang av hele verktøyet, forankret i faktisk kodebase.
> **Sist oppdatert:** 2026-06-22. Oppdater når punkter leveres eller nye dukker opp.
> Effort: **S** = timer, **M** = en økt, **L** = flere økter / eget delprosjekt.

## Levert nylig (kontekst)
Pensjonsmodul · Formue over tid · Treffsikkerhet (kalibrering) · Scenario-simulator ·
Nøkkeltall-register (fundament + auto-hent G fra NAV) · security-CI-fiks + SHA-pinning.
Alle i prod på lommeboka.com. Specs i `docs/superpowers/specs/`.

---

## 1. Datakvalitet & integrasjoner

### 1.1 Auto-kategorisering av bankimport — **M/L** ⭐ anbefalt neste
Bankimporten kategoriserer ikke transaksjoner i dag, så Treffsikkerhet (#6) kan kun
kalibrere inntekt/trekk/sparing/gjeld — **ikke forbruksutgifter**. En regel-/mønsterbasert
kategorisering (motpart → budsjettkategori, med brukerlærte overstyringer) **låser opp
utgiftskalibrering** og gjør budsjett-treff langt mer presist.
- **Låser opp:** utgiftsdelen av Treffsikkerhet; bedre budsjett-prognose.
- **Avhenger av:** eksisterende bankimport-format (verifiser i koden før design).

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
