# Design: Tidsbevisst trinnvisrente

**Dato:** 2026-06-18
**Status:** Godkjent

## Bakgrunn

Trinnvisrente (`tieredRates`) er i dag en statisk snapshot på en sparekonto — ingen tidsdimensjon. Brukeren kan ikke registrere når banken endret sin trinnstruktur, og kan ikke planlegge fremtidige endringer. Dette designet legger til en historikk for trinnvise rentestrukturer, analogt med `rateHistory` for flate renter.

## Mål

1. Rediger intervaller (terskler) og satser på gjeldende trinnstruktur
2. Se historikk over tidligere trinnstrukturer
3. Registrere fremtidige planlagte endringer med ikraftredelsesdato

## Datamodell

### Ny type

```typescript
export interface TieredRateHistoryEntry {
  fromDate: string    // ISO "YYYY-MM-DD" — når strukturen gjelder fra
  tiers: TieredRate[] // hele trinnstrukturen for denne perioden
}
```

### Endring i `SavingsAccount`

Nytt felt legges til:

```typescript
tieredRateHistory?: TieredRateHistoryEntry[]
```

`tieredRates?: TieredRate[]` beholdes i typen under migrering, men settes til `undefined` etter at migreringen har kjørt. Brukes ikke i ny kode.

### Aktiv struktur

For en gitt dato D er aktiv trinnstruktur:

```typescript
function getActiveTiersForDate(
  history: TieredRateHistoryEntry[],
  date: string
): TieredRate[] | undefined {
  return [...history]
    .filter(e => e.fromDate <= date)
    .sort((a, b) => b.fromDate.localeCompare(a.fromDate))[0]?.tiers
}
```

- Fremtidige innslag = `fromDate > today` — vises men brukes ikke i beregninger
- Historiske innslag = `fromDate <= today` — det seneste av disse er aktivt

## Beregningsendringer

Alle steder i `SavingsPage.tsx` som refererer til `acc.tieredRates` erstattes med:

```typescript
getActiveTiersForDate(acc.tieredRateHistory ?? [], dateISO)
```

`getEffectiveRateFromTiers(tiers, balance)` er uendret — den opererer fortsatt på `TieredRate[]`.

Prognoseberegningen (måneds- og årsløkke) bruker allerede `effectiveBal` per måned; den aktive strukturen hentes for `nowISO` og gjenbrukes gjennom hele beregningen (bankstrukturen endres sjelden midt i et år). For simuleringer som strekker seg over fremtidige perioder bør `getActiveTiersForDate` kalles per måned.

## UI

### Kontokortet — eksisterende visning

Det trinnvise rentedisplayet (stats-grid) er uendret og viser aktivt trinn. Under det legges en liten tekstknapp:

```
Administrer rentestruktur ▾
```

Klikk på knappen toggler en akkordeon-seksjon rett under kontokortet. Styres av ny state `openRateHistoryFor: string | null` (konto-ID).

### Akkordeonet

Viser alle `tieredRateHistory`-innslag sortert nyest øverst. Fargekoding per innslag:

| Farge | Betyr |
|---|---|
| Gul (amber) | Fremtidig (`fromDate > today`) |
| Grønn | Aktiv (seneste med `fromDate <= today`) |
| Grå | Historisk |

Rad-layout:
```
[● Fra 1. jan 2026]  [3.4 / 3.7 / 4.35 / 3.9 %]  [✎]  [✗]
```

Rateoppsummeringen vises kompakt: satsene for hvert trinn separert med `/`.

**Redigering inline:** Klikk ✎ utvider raden til en mini-editor:
- Datofelt for `fromDate` (disabled for det eldste innslaget om det er det eneste)
- Trinnrader: `Fra [balance] kr → [rate] %`
- `+ Legg til trinn`-knapp (maks 6 trinn, første trinn låst til `fromBalance = 0`)
- Lagre / Avbryt

**Slett:** Klikk ✗ fjerner innslaget. Deaktivert hvis kun ett innslag gjenstår.

**Ny periode:** `+ Ny periode fra dato`-knapp nederst i akkordeonet oppretter et nytt innslag med mini-editoren utvidet. Pre-fyller tiers fra aktivt innslag som utgangspunkt.

### Edit-modal (`AccountEditForm`)

Den eksisterende trinnvisrenteditoren initialiseres fra aktivt innslag (`getActiveTiersForDate`). Ved lagring oppdateres det aktive innslaget uten å endre `fromDate`. Arbeidsdeling:

- **Edit-modal** = juster satser/grenser for gjeldende periode
- **Akkordeon** = ny periode fra dato, historikk, fremtidige endringer

## Store-migrasjon

Version bumpes (v19 → v20 eller neste ledige). Migreringen kjøres én gang per konto:

```typescript
if (acc.tieredRates?.length && !acc.tieredRateHistory) {
  acc.tieredRateHistory = [{
    fromDate: acc.openingDate,
    tiers: acc.tieredRates
  }]
  acc.tieredRates = undefined
}
```

Kontoer uten trinnvisrente berøres ikke. BSU-kontoer bruker `rateHistory` og berøres ikke.

## Ut av scope

- Trinnvisrente på gjeldskonto (`DebtAccount`) — den har allerede `rateHistory` med flate satser
- Import/eksport av trinnhistorikk
- Bankpreset-håndtering ved renteendring (bankpresets forblir snapshots)
