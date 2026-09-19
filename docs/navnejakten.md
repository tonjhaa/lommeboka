# Navnejakten

«Tinder for babynavn» for to koblede kontoer. Ligger som fane under **Livet → Prosjekt → Navnejakten** (`src/pages/economy/NavnejaktPage.tsx`, lazy-lastet fra `ProsjektPage.tsx` først når fanen åpnes). Den følger dermed Prosjekt-modulen (`ivf`) i Innstillinger → Moduler. Lagret navigasjon til den gamle egne siden migreres i `migrateAppState` (persist v5).

## Datakilde: SSB tabell 10467
«Fødte, etter jente- eller guttenavn, statistikkvariabel og år» (1880–siste år, antall og andel av fødte).
- Tall under 4 oppgis ikke; navnelisten omfatter fornavn brukt av minst 200 personer; fra 2021 teller navngivningsår.
- Kode-prefiks `1` = jente, `2` = gutt. Samme navn kan finnes for begge kjønn → `names` er unik på `(name, gender)`.
- **Rang** (per kjønn og år) og **trend** er beregnet av oss fra SSBs antall — SSB oppgir ikke rang.
- Trend (`supabase/functions/sync-ssb-names/transform.ts`): snitt andel siste 2 år / snitt de 3 årene før (t-4..t-2). ≥ 1,15 økende, ≤ 0,85 synkende, ellers stabil; `null` uten tall for siste år eller for få basisår. «Tidløs» = stabil og tall alle de siste 20 årene.
- Klienten kaller aldri SSB (CSP tillater det ikke, og det skal ikke skje per swipe). Synk kjøres av edge function `sync-ssb-names`
  (knappen «Oppdater fra SSB» i Statistikk-fanen). Maks én vellykket synk per 12 timer. SSB oppdaterer tabellen ca. én gang i året.

## Database (`supabase/migrations/20260919000000_navnejakten.sql`)
`names`, `name_statistics`, `ssb_sync_log` (lesbare for innloggede) · `name_votes` (privat) · `name_matches` (delt) ·
`name_favorites` (privat) · `name_finals` (delt økt) · `name_final_runs` (privat per bruker).

**Personvern.** `name_votes` har RLS `user_id = auth.uid()` og er ikke i realtime-publikasjonen. Matcher opprettes/fjernes
av en `SECURITY DEFINER`-trigger som bruker `pg_advisory_xact_lock` (to samtidige «ja» går ikke glipp av hverandre).
Partnerens tall utleveres bare som aggregat (`name_partner_stats()`), og Finalens felles resultat først når begge er ferdige
(`name_final_results()`). Test: `supabase/tests/navnejakten_privacy.sql` (rulles alltid tilbake).

## Finalen
Utslagsturnering per bruker (`src/lib/names/tournament.ts`): de som taper i samme runde får **delt plassering**.
Felles liste (`jointRanking.ts`): sum av begge sine plasseringer (delte plasseringer = snittet av plassene de deler).
Lik sum = delt plass; ingen tie-breaker. Minst 4 matcher.

## Filtre
Standard viser bare navn med SSB-tall for siste år; «Eldre navn» tar med resten. «Sjeldnere navn» = rang ≥ 250 eller ikke registrert siste år.

## Versjon 2
- **Ny-match-markering:** «sett» lagres lokalt per bruker (`seenMatchIds`). `loadMatchIndicator` (kalles fra `App.tsx`) henter bare matcher, slik at prikken i navigasjonen og «n nye» på Matcher-fanen virker fra alle sider — også for matcher som kom mens appen var lukket. Matcher blir markert som sett 1,5 s etter at Matcher-fanen åpnes.
- **Kombinasjoner:** fornavn + valgfritt mellomnavn fra matchene, med etternavn (lagres kun i nettleseren). Merkene «samme forbokstav» og «samme bokstav i skjøten» er rent mekaniske (`src/lib/names/combinations.ts`).
- **Notater:** `name_match_notes` (migrasjon `20260920000000_navnejakten_notes.sql`) — ett notat per partner per match, maks 280 tegn, synlig for begge. RLS tillater bare notater på navn som er en match, og de leses bare mens matchen finnes. Test: `supabase/tests/navnejakten_notes.sql`.
- **Ikke bygget:** push-varsel (krever service worker, push-abonnement og server-utsending).
