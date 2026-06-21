# Nøkkeltall-/G-register — Design

**Dato:** 2026-06-21
**Status:** Godkjent design — klar for implementeringsplan
**Branch:** `feat/nokkeltall-register`

## Sammendrag

Et runtime-register for G-dynamiske og årlige nøkkeltall (grunnbeløp, BSU-grenser,
feriepengesats, pensjons-/skattesatser, delingstall, skattetrinn) som brukeren kan se,
overstyre og holde historikk på i Innstillinger — sky-synket så partner ser live tall.
Registeret er **én kilde til sannhet** som pensjon, feriepenger, skatt, formue, Veikart og
scenario alle leser fra via en ren resolver. Kode-konstantene blir *defaults/fallback*, så
innføringen er bakoverkompatibel (tom override ≡ dagens oppførsel). Dette er delprosjekt 1
av 2; **auto-hent fra offentlig kilde (nav.no/skatteetaten) er delprosjekt 2** og skriver
inn i registeret.

## Mål og avgrensning

**Mål**
- Brukerredigerbare nøkkeltall med år-versjonert historikk + «sist verifisert»-merking.
- Én resolver som alle lesere bruker → konsistens på tvers, begge veier.
- Sky-synk (husholdnings-fakta delt) → partner ser oppdaterte tall live.
- Bakoverkompatibel: defaults i kode forblir bunnplanken; tom override endrer ingenting.

**Avgrensning (YAGNI)**
- **Auto-hent (#4) er delprosjekt 2**, ikke her. En «Auto-hent»-knapp vises deaktivert
  («kommer») som krok. Manuell inntasting/overstyring er v1-mekanismen.
- Rent kosmetiske/ikke-beregnings-konstanter (ATF-timesnormer, varselterskler) migreres
  IKKE i v1 — de er ikke «nøkkeltall» brukeren trenger å oppdatere.
- Tabeller (delingstall, skattetrinn) redigeres som **hele årssett** (erstatt blob), ikke
  celle-for-celle.

## Beslutninger (fra brainstorm)

| Spørsmål | Valg |
|----------|------|
| Omfang | Alt inkl. strukturelle satser (men kosmetiske konstanter utelatt) |
| «Hente» | Auto-hent fra offentlig kilde — men som **delprosjekt 2** |
| Dekomponering | Register-fundament (#1–3) nå; auto-hent (#4) egen runde |
| Arkitektur | A — override-overlay + resolver, defaults i kode som fallback |
| Historikk-modell | År-versjonert (matcher TAX_RULES/styringsrente/KPI-presedens) |

## Arkitektur

| Lag | Fil | Ansvar |
|-----|-----|--------|
| Domene | `src/domain/economy/keyFigureRegistry.ts` | Nøkkeltall-katalog (key → meta + default-referanse), ren `resolveKeyFigure(key, overrides, year?)`, `isStale`, blob-validering. Ingen React/store. |
| Tester | `src/domain/economy/__tests__/keyFigureRegistry.test.ts` | Resolver, konsistens-invariant, staleness, validering. |
| Typer | `src/types/economy.ts` (utvides) | `KeyFigureKey`, `KeyFigureKind`, `KeyFigureMeta`, `KeyFigureOverride`. |
| Store | `src/application/useEconomyStore.ts` | `keyFigureOverrides` + settere; persist v25→v26; Supabase-synk (3 stier). |
| Hook | `src/hooks/useKeyFigures.ts` | Resolverte verdier + `isStale`, memoisert på overrides + år. |
| Side | `src/pages/economy/EconomySettingsPage.tsx` (ny seksjon) | Se/rediger/historikk/utdatert-varsel. |
| Migrering | nøkkeltall-lesende sites (delmengde av config-importørene) | Rekable fra `import { KONST }` til resolvert verdi (se Migreringsstrategi). Kun de som faktisk leser et registrert nøkkeltall — ikke urelaterte config-importer. |

## Datamodell

```ts
export type KeyFigureKey =
  | 'grunnbelop' | 'bsuMaxYearly' | 'bsuMaxTotal' | 'feriepengerProsent'
  | 'folketrygdOpptjeningssats' | 'spkPaaslagLav' | 'spkPaaslagHoy' | 'afpOpptjeningssats'
  | 'takFolketrygdG' | 'takSpkG' | 'egenmeldingKvote'
  | 'delingstall' | 'taxRules'   // strukturerte tabeller (år-blob)

export type KeyFigureKind = 'scalar' | 'table'

export interface KeyFigureMeta {
  key: KeyFigureKey
  label: string              // «Grunnbeløp (G)»
  group: 'pensjon' | 'sparing' | 'feriepenger' | 'skatt' | 'fravaer'
  unit: 'kr' | 'pst' | 'G' | 'antall' | 'tabell'
  kind: KeyFigureKind
  sourceUrl: string          // nav.no/grunnbelopet osv. (krok for auto-hent)
  defaultVerifiedAt: string  // "YYYY-MM-DD" da kode-defaulten sist ble verifisert
}

/** Brukerens overstyring av ett nøkkeltall for ett (virknings)år. */
export interface KeyFigureOverride {
  key: KeyFigureKey
  year: number               // gjelder fra dette året
  value: number | unknown    // scalar = number; table = JSON-blob
  verifiedAt: string         // "YYYY-MM-DD"
  source?: string
}
```

`KEY_FIGURE_META: Record<KeyFigureKey, KeyFigureMeta>` ligger i domenet og refererer
dagens kode-konstanter som default (defaults flyttes IKKE ut av `economy.config.ts`).

## Resolver (kjernen)

```
resolveKeyFigure(key, overrides, year = currentYear):
  1. nyeste override for key med override.year <= year  → return value
  2. ellers → kode-default fra economy.config (via katalogen)
```

År-semantikk: «siste gjeldende ≤ år» — samme logikk som `getKpiIndex`/styringsrente.
Defaults-i-kode er alltid bunnplanken.

**`isStale(key, overrides)`** = ingen override for inneværende år OG `defaultVerifiedAt`
eldre enn ~12 mnd → UI viser «kan være utdatert, sjekk [kilde]».

**Konsistens-invariant:** tom override-liste ⇒ `resolveKeyFigure(key)` == dagens kode-konstant
for HVERT nøkkeltall ⇒ alle beregninger uendret. Låses med test (én assert per key).

## Migreringsstrategi (tre grupper, lav risiko først)

**Gruppe 1 — leser allerede via parameter.** `pensionCalculator` tar `currentG`; hooks
(`useScenario`, dashbord, `useNetWorthSeries`-konsumenter) mater i dag `GRUNNBELOP_NOK`.
Bytt kun *hva hooken mater inn* → `useKeyFigures().grunnbelop`. Null endring i kalkulatorene.

**Gruppe 2 — kalkulator importerer konstant dypt inne.** `savingsCalculator` (`BSU_MAX_*`),
`holidayPayCalculator` (`FERIEPENGER_PROSENT`), `getDelingstall` (`DELINGSTALL_BASELINE`).
Refaktorer til **parameter med default = dagens konstant**: `function x(..., bsuMax = BSU_MAX_TOTAL)`.
Hver eksisterende kall-site er uendret (defaulten gjelder); hooks injiserer resolvert verdi.
Bakoverkompatibelt — eksisterende tester består.

**Gruppe 3 — skatt (`norwegianTaxRules`).** Allerede år-nøklet via `getTaxRules(year)`. La den
ta valgfri override-blob: `getTaxRules(year, override?)`. Ingen endring uten override.

**Pure kalkulatorer importerer ALDRI registeret/hooken** — de får verdier inn.

## Sky-synk

`keyFigureOverrides` legges i alle tre stier: `partialize` (localStorage), `saveToSupabase`-
payload, `importData` (sky-lasting) + `usePartnerStore`-stub. Husholdnings-fakta er delt
(G er likt for begge) → full synk er riktig (i motsetning til scenario-spakene).

## UI — ny seksjon i `EconomySettingsPage.tsx` («Nøkkeltall & satser»)

1. **Liste** gruppert (pensjon/sparing/feriepenger/skatt/fravær): label, gjeldende verdi
   (resolvert), enhet, «sist verifisert». Utdaterte markeres gult med «sjekk [kilde]»-lenke.
2. **Rediger skalar:** inline input (verdi + virkningsår + kilde) → `setKeyFigureOverride`.
   «Tilbakestill til standard» fjerner override.
3. **Historikk:** utvidbar per nøkkeltall — overstyringer over tid + kode-default som bunnlinje.
4. **Tabeller (delingstall, skattetrinn):** read-only gjeldende årssett + «sist verifisert»;
   redigering = erstatt hele årssettet (JSON/strukturert editor). Auto-hent er primær vei senere.
5. **«Auto-hent»-knapp:** deaktivert med «kommer» (krok til delprosjekt 2).

## Feilhåndtering / kanttilfeller

- Ugyldig input (negativ G, sats > 100 %) → valider, ikke lagre.
- Override for fremtidig år → tillatt (forhåndsregistrer neste års G).
- Tabell-blob med feil form → valider mot skjema, vis feil, ikke lagre (beskytter kalkulatorene).
- Sletting av siste override → faller rent tilbake til kode-default.

## Testing

- `keyFigureRegistry.test.ts`: resolver (override ≤ år vinner; tom ⇒ default), **konsistens-
  invariant** (tom override ⇒ hver resolve == dagens konstant), `isStale`, blob-validering.
- Per migrert kalkulator: eksisterende tester består uendret (parameter-default = konstant er regresjonsvernet).
- Store: override-CRUD, persist-migrering v26, partner-stub.

## Konsistens-wiring (stående regel)

- Resolveren er eneste kilde: pensjon/feriepenger/skatt/formue/Veikart/scenario får verdiene
  via `useKeyFigures` → samme resolver. Ingen parallell konstant i lesersti.
- Tom override ≡ dagens oppførsel (invariant-test) → innføringen endrer ingenting utilsiktet.
- Full sky-synk → partner ser oppdaterte tall live.
- Defaults-i-kode = bunnplanke → robust + krok for auto-hent (delprosjekt 2).
- Se [[arbeidsregel-helhetlig-konsistens]].

## Åpne punkter til implementering

- Bekreft eksakt liste over lesersteder per konstant (grep) før Gruppe 2-refaktoren — så
  alle kall-sites dekkes og konsistens-invarianten holder.
- Fastsett blob-skjema for delingstall (Record<alder,number>) og taxRules (YearRules-form).
- Avklar om `getDelingstall` skal ta hele tabellen som param eller en resolver-callback.
- Fastsett staleness-terskel (forslag: 12 mnd) som konstant.
