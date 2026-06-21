# Forbruks-import + auto-kategorisering — Design

**Dato:** 2026-06-22
**Status:** Godkjent design — klar for implementeringsplan
**Branch:** `feat/forbruk-import-kategorisering`

## Sammendrag

Importere brukskonto-transaksjoner (forbruk) fra bank-CSV og auto-kategorisere dem mot de
eksisterende budsjettkategoriene, med innebygde seed-regler + brukerlærte overstyringer.
Gir en synlig «forbruk per kategori vs budsjett»-oversikt. Dette er **delprosjekt A+B** av
utgiftskalibrerings-arbeidet; **C (wire kategorisert forbruk inn i Treffsikkerhet-kalibreringen)
er en egen oppfølging** som bygger rett på aggregeringsmotoren her.

## Bakgrunn / hvorfor

Forbruk importeres ikke i dag. Den eksisterende `bankTransactionParser.ts` er en *sparing*-
importør (Trøndelag Sparebank sparekontoutskrifter): fanger kun innskudd (positive beløp),
har ingen motpart-kolonne, estimerer månedssparing/rente. Budsjettets «faktisk»-tall kommer
fra lønnsslipper + sparing/gjeld-snapshots — utgiftsrader har ingen faktisk-kilde. Derfor kan
Treffsikkerhet (#6) ikke kalibrere forbruk. Denne funksjonen skaffer forbruksdataene +
kategoriserer dem, slik at oversikt (nå) og kalibrering (C) blir mulig.

## Mål og avgrensning

**Mål**
- Importere brukskonto-CSV (samme bank) → forbrukstransaksjoner med motpart + signert beløp.
- Auto-kategorisere mot eksisterende `BudgetCategory` (hybrid: seed-regler + lærte regler).
- Bruker kan alltid overstyre; overstyring læres per motpart og vinner fremover.
- Synlig «forbruk per kategori vs budsjett»-oversikt.

**Avgrensning (YAGNI)**
- **C (kalibrering-wiring inn i budgetTableComputer.actual + Treffsikkerhet) er egen runde.**
- Kun samme bank (Trøndelag Sparebank) CSV i v1; generisk kolonne-mapping er senere arbeid.
- Ingen ML/AI-kategorisering — deterministiske regler (ren, testbar, forutsigbar).
- Inntekt/intern overføring kategoriseres ikke som forbruk (filtreres).

## Beslutninger (fra brainstorm)

| Spørsmål | Valg |
|----------|------|
| Dekomponering | A+B sammen (import + kategorisering + oversikt); C som oppfølging |
| Kildeformat | Samme bank (Trøndelag Sparebank) CSV — utvid parser-infra |
| Regelmodell | Hybrid: innebygde seed-regler + brukerlærte overstyringer (vinner) |
| Matching | Normalisert motpart (filialer kollapser), seed via substring |

## Arkitektur

| Lag | Fil | Ansvar |
|-----|-----|--------|
| Domene (parser) | `src/domain/economy/spendingStatementParser.ts` | Parser brukskonto-CSV: dato, motpart/tekst, signert beløp (utgift negativt). Bygger på `colIdx`-mønsteret fra `bankTransactionParser.ts`. |
| Domene (motor) | `src/domain/economy/spendingCategorizer.ts` | Ren: `normalizeCounterparty`, `categorize(key, rules)`, `applyCategories(txs, rules)`, `aggregateByCategory(txs, år, mnd)`. |
| Seed-data | `src/config/categorySeedRules.ts` | `SEED_CATEGORY_RULES` — vanlige norske motparter → kategori. |
| Typer | `src/types/economy.ts` | `BankSpendingTransaction`, `CategoryRule`. |
| Store | `src/application/useEconomyStore.ts` | `spendingTransactions` + `categoryRules` + settere; persist v26→v27; sky-synk (3 stier) + partner-stub. |
| UI | `src/features/spending/SpendingImporter.tsx` + `src/pages/economy/SpendingPage.tsx` | Import → kategorisert review (overstyr = lær) → oversikt forbruk vs budsjett. |
| Tester | `__tests__/spendingStatementParser.test.ts`, `__tests__/spendingCategorizer.test.ts` | Parsing, normalisering, presedens, aggregering, dedup. |

## Datamodell

```ts
export interface BankSpendingTransaction {
  id: string
  date: string                 // "YYYY-MM-DD"
  counterpartyRaw: string      // "REMA 1000 OSLO 1234"
  counterpartyKey: string      // "rema 1000" (normalisert)
  amount: number               // signert; utgift = negativt
  category: BudgetCategory | null
  categorySource: 'seed' | 'learned' | 'manual' | 'none'
  importBatchId: string        // for angre/re-import-dedup
}

export interface CategoryRule {
  id: string
  merchantKey: string          // normalisert motpart
  category: BudgetCategory
  source: 'seed' | 'learned'   // learned = brukeroverstyring (vinner)
}
```

## Kategoriserings-presedens (ren funksjon)

```
categorize(counterpartyKey, rules):
  1. lært regel som matcher key            → { category, source:'learned' }
  2. ellers seed-regel som matcher key     → { category, source:'seed' }
  3. ellers                                → { category:null, source:'none' }
```

**Normalisering:** `normalizeCounterparty` lowercaser, fjerner dato/kortnummer-fragmenter,
stripper etterfølgende sted/tall, kollapser whitespace. F.eks.
`«VISA VARE 22.03 REMA 1000 OSLO»` → `«rema 1000»`. Konservativ: nok til å skille butikker,
nok fjernet til at filialer kollapser. Seed-regler matcher på substring av normalisert nøkkel.

## Lærings-/overstyringsflyt

I review-skjermen kan bruker endre kategori på en transaksjon:
- **Standard «Bruk på alle fra <motpart>»:** oppretter/oppdaterer `learned`-regel (vinner over
  seed) + re-kategoriserer alle transaksjoner med samme `counterpartyKey` umiddelbart.
- **«Bare denne»:** setter `category` + `categorySource:'manual'` kun på raden, ingen regel.

Lærte regler vises/redigeres i en egen liste, så en feillært regel kan rettes.

## UI-flyt

1. **`SpendingImporter`** (følger `SavingsImporter`-mønsteret): velg CSV →
   `spendingStatementParser` → `applyCategories` → forhåndsvisning.
2. **Review-tabell:** dato · motpart · beløp · kategori (dropdown, fargekodet etter source).
   Ukategoriserte (`none`) løftes til topp. Lagre → skriver transaksjoner + nye regler.
3. **`SpendingPage` (oversikt):** valgt måned → tabell forbruk per kategori vs budsjett
   (faktisk sum fra transaksjoner mot `budgetTemplate`-beløp per kategori) + avvik. Den
   synlige A+B-verdien. Rører IKKE budgetTableComputer/kalibrering (det er C).

## Feilhåndtering / kanttilfeller

- Ukjent CSV-format / mangler tekst-kolonne → tydelig feil, ikke delvis import. (Bekreft
  eksakt tekst-kolonnenavn mot en anonymisert header-rad i implementeringen.)
- Inntekts-/overføringsrader (positivt beløp) → filtreres fra forbruk; interne sparekonto-
  overføringer flagges/utelates for å unngå dobbelttelling mot sparemodulen.
- Re-import av samme periode → dedup på (dato, motpart, beløp) hindrer duplikater.
- Motpart uten treff → `category:null` («ukategorisert»), aldri gjettet.

## Testing

- `spendingStatementParser.test.ts`: ekte rotete CSV → riktig dato/motpart/signert beløp;
  inntekt vs utgift; mangler-kolonne → feil.
- `spendingCategorizer.test.ts`: normalisering (filial-kollaps), seed-treff, **lært vinner
  over seed**, **tom regel-liste ⇒ alt `null` (invariant)**, aggregering per kategori/måned, dedup.
- Store: CRUD + persist-migrering v27 + partner-stub.

## Konsistens-wiring (stående regel)

- Kategorisering er eneste kilde for forbruks-faktisk; ingen parallell logikk. Kategori-målet
  er den eksisterende `BudgetCategory`-enumen → oversikt og (senere) kalibrering bruker NØYAKTIG
  samme kategorier som budsjettet.
- Lærte regler + transaksjoner synkes (3 stier + partner-stub) → partner ser samme.
- Tom regel-liste ⇒ ingen gjetting (invariant, testlåst).
- **C bygger rett på `aggregateByCategory`** uten endring i motoren. Se [[arbeidsregel-helhetlig-konsistens]].

## Åpne punkter til implementering

- Be om EN anonymisert header-rad fra brukskonto-CSV-en for å treffe tekst-/motpart-kolonnenavnet
  eksakt (kandidater: «Tekst», «Beskrivelse», «Melding», «Til konto»).
- Bekreft hvordan utgift vs inntekt skilles i brukskonto-CSV (egne Inn/Ut-kolonner som spare-CSV,
  eller én signert beløp-kolonne).
- Fastsett seed-listens omfang (kort, vedlikeholdbar startliste — de vanligste norske kjedene).
- Vurder om interne overføringer til egne sparekontoer skal gjenkjennes via kontonummer
  (unngå dobbelttelling mot sparemodulen).
