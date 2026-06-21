# Auto-hent nøkkeltall (delprosjekt 2) — Design

**Dato:** 2026-06-21
**Status:** Godkjent design — klar for implementeringsplan
**Branch:** `feat/auto-hent-nokkeltall`

## Sammendrag

On-demand-henting av grunnbeløpet (G) fra NAVs offisielle JSON-API direkte inn i
nøkkeltall-registeret. Brukeren klikker «Hent fra NAV» i Innstillinger, ser foreslått
verdi vs sin nåværende, og bekrefter før noe skrives. Auto-hent skriver KUN via samme
`setKeyFigureOverride` som manuell redigering — ingen sidekanal — så den nye G-en
propagerer via resolveren til pensjon/feriepenger/skatt/formue/scenario/dashbord og
synkes til partner. Dette er delprosjekt 2 av nøkkeltall-registeret; fundamentet
(register + resolver + `useKeyFigures` + Innstillinger-UI med deaktivert «auto-hent»-knapp)
er allerede i prod.

## Mål og avgrensning

**Mål**
- Hente fersk G fra NAVs strukturerte API (robust mot layout-endringer, ulikt HTML-scraping).
- Bruker bekrefter/overstyrer ALLTID — auto-hent kan aldri skrive uten eksplisitt klikk.
- Full konsistens: skriver via eksisterende `setKeyFigureOverride`, propagerer overalt.
- Robust mot at kilden endrer form: enhver tvil → ikke skriv, vis melding, behold manuell sti.

**Avgrensning (YAGNI)**
- **Kun `grunnbelop`-kilden.** `SOURCES`-map-en er seamen for flere kilder senere (én ny
  oppføring + parse-funksjon), men ingen andre kilder bygges nå.
- Delingstall/skattetrinn/BSU/feriepengesats mangler strukturert offentlig API — forblir
  manuelle i registeret.
- **Ingen cron/bakgrunnssjekk** — on-demand-knapp. G endres én gang i året (1. mai), og
  registerets `isStale`-varsel nudger allerede brukeren.

## Beslutninger (fra brainstorm)

| Spørsmål | Valg |
|----------|------|
| Kilde-scope | Kun G via NAV-API (g.nav.no/api/v1/grunnbeloep) |
| Trigger | On-demand-knapp i Innstillinger |
| Arkitektur | Tynn serverless-proxy + allowlist + bekreftelsesflyt i UI |
| Bekreftelse | Bruker bekrefter alltid; aldri auto-skriv |

## Kontekst: NAV-API-et

`GET https://g.nav.no/api/v1/grunnbeloep` returnerer:
```json
{ "dato": "2026-05-01", "grunnbeloep": 136549, "grunnbeloepPerMaaned": 11379,
  "gjennomsnittPerAar": 134419, "omregningsfaktor": 1.049086,
  "virkningstidspunktForMinsteinntekt": "2026-06-01" }
```
`grunnbeloep: 136549` matcher dagens kode-default. Open source: github.com/navikt/g.
CSP-en (`connect-src 'self' + supabase/vercel/sentry`) blokkerer direkte nettleserkall →
serverless-proxy er teknisk nødvendig.

## Arkitektur

| Lag | Fil | Ansvar |
|-----|-----|--------|
| Serverless | `api/key-figure-source.ts` | Vercel-funksjon. Allowlist `SOURCES`, henter NAV-API server-side, validerer responsform via `parse`, returnerer normalisert `{ key, value, effectiveDate, source }`. |
| Frontend-tjeneste | `src/domain/economy/keyFigureFetchService.ts` | `fetchKeyFigure(key)` → kaller `/api/key-figure-source?source=…`, returnerer `FetchedKeyFigure \| { error }`. Ingen React. |
| Tester | `src/domain/economy/__tests__/keyFigureFetchService.test.ts` | Parsing/normalisering, feilhåndtering (mock fetch). |
| UI | `src/pages/economy/EconomySettingsPage.tsx` | Aktiver «auto-hent»-knappen → henter → bekreftelses-rad (forslag vs din verdi) → `setKeyFigureOverride`. |

## Allowlist i serverless (kjernen i robustheten)

```ts
const SOURCES: Record<string, { url: string; parse: (json: unknown) => { value: number; effectiveDate: string } }> = {
  grunnbelop: {
    url: 'https://g.nav.no/api/v1/grunnbeloep',
    parse: (j) => {
      const o = j as { grunnbeloep?: unknown; dato?: unknown }
      if (typeof o.grunnbeloep !== 'number' || !isFinite(o.grunnbeloep) || o.grunnbeloep <= 0) throw new Error('bad value')
      if (typeof o.dato !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.dato)) throw new Error('bad date')
      return { value: o.grunnbeloep, effectiveDate: o.dato }
    },
  },
}
```

Handler: valider `source ∈ SOURCES` (ellers 400) →
`fetch(url, { redirect: 'error', signal: AbortSignal.timeout(8000), headers: { Accept: 'application/json' } })` →
`parse(json)` → `{ key, value, effectiveDate, source: 'g.nav.no/api/v1/grunnbeloep' }`.
Brukeren kan aldri styre URL-en (kun velge fra allowlist-nøkler) → SSRF nær null;
`redirect: 'error'` som forsvar i dybden (NAV-API-et skal ikke redirecte). `parse`
eksporteres slik at den kan enhetstestes som ren funksjon.

## Dataflyt (on-demand)

```
[Innstillinger: «Hent fra NAV»-knapp på grunnbelop-raden]
  → keyFigureFetchService.fetchKeyFigure('grunnbelop')
  → GET /api/key-figure-source?source=grunnbelop
  → serverless henter g.nav.no/api/v1/grunnbeloep, validerer, returnerer { value:136549, effectiveDate:'2026-05-01' }
  → UI viser bekreftelses-rad: «NAV: 136 549 kr (gjelder fra 2026-05-01) · din verdi: <resolvert>»
  → [Bruk] → setKeyFigureOverride({ key:'grunnbelop', year:2026, value:136549, verifiedAt:<i dag>, source:'g.nav.no/api/v1/grunnbeloep' })
  → [Avbryt] → ingen endring
```

**Virkningsår fra NAV.** `year` utledes fra `effectiveDate` (`2026-05-01` → 2026), ikke
«inneværende år». Dette utnytter år-versjoneringen i registeret (som UI-en ellers låste til
inneværende år) — auto-hent setter riktig virkningsår, og resolveren («siste gjeldende ≤ år»)
plukker det korrekt.

## Feilhåndtering (lagvis)

| Situasjon | Håndtering |
|-----------|------------|
| Ugyldig `source` (ikke i allowlist) | Serverless `400 { error }`; tjeneste `{ error: 'Ukjent kilde' }` |
| NAV nede / timeout (8s) / nettverksfeil | Serverless `502/504 { error }`; UI: «Kunne ikke hente fra NAV nå — prøv igjen senere». Ingen skriving. |
| Uventet responsform (mangler/feil type) | `parse` kaster → serverless `502`; UI: «Uventet svar fra NAV — sjekk verdien manuelt på nav.no» + kilde-lenke. Beskytter mot at en formatendring skriver søppel inn. |
| NAV-verdi == din gjeldende verdi | UI: «Du har allerede siste verdi (136 549, fra 2026-05-01)»; «Bruk» ingen-op |
| Offline | fetch feiler → samme nettverksfeil-melding |

Prinsipp: **enhver tvil → ikke skriv, vis melding, behold manuell sti.** Auto-hent kan aldri
korrumpere registeret; manuell overstyring (fundamentet) er alltid fallback.

## Testing

- `keyFigureFetchService.test.ts` (mock `fetch`):
  - Gyldig NAV-respons → `{ value:136549, effectiveDate:'2026-05-01', source }`.
  - Manglende/feil-type `grunnbeloep` → `{ error }`, ingen verdi.
  - Ikke-200 / nettverkskast → `{ error }`.
  - `effectiveDate` → år-utledning (`2026-05-01` → 2026).
- Serverless-`parse` (eksportert ren funksjon): gyldig/ugyldig form.
- UI: manuell røyktest (knapp → forslag → Bruk skriver override med riktig år; Avbryt no-op;
  feilmelding ved mock-feil). Ingen ny domene-invariant — register-konsistensen er låst i
  delprosjekt 1.

## Konsistens-wiring (stående regel)

- Auto-hent skriver KUN via `setKeyFigureOverride` — samme inngang som manuell redigering.
  Ingen sidekanal. Etter skriving leser alle (pensjon/feriepenger/skatt/formue/scenario/
  dashbord) den nye G-en via samme resolver, og den synkes til partner.
- `verifiedAt` = hentedato, `source` = NAV-API-URL → `isStale` nullstilles, historikken
  (delprosjekt 1) viser «hentet fra NAV».
- Auto-hent er en bekvem datakilde INN i det eksisterende konsistente registeret — ikke et
  parallelt system. Se [[arbeidsregel-helhetlig-konsistens]].

## Åpne punkter til implementering

- Bekreft Vercel serverless-konvensjon (`@vercel/node`, default export handler) mot
  eksisterende `api/scrape-product.ts`.
- Bekreft eksakt NAV-felt: `grunnbeloep` (årlig) er riktig for registerets G (ikke
  `grunnbeloepPerMaaned`).
- Avklar UI-plassering: «Hent fra NAV»-knapp kun på grunnbelop-raden (eneste kilde med
  `sourceUrl` som har auto-hent) vs en generell knapp. Forslag: per-rad-knapp som kun vises
  for nøkkeltall med registrert auto-hent-kilde.
- Bekreft at `@vercel/node` finnes i devDependencies (brukt av eksisterende api/-funksjoner).
