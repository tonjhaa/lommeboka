# Gaveplanlegger — faktisk kjøp, historikk og sammenslåtte gaver — Design

**Dato:** 2026-09-15
**Status:** Godkjent design — klar for implementeringsplan
**Branch:** `feat/gaver-faktisk-kjop-historikk`

## Sammendrag

Gaveplanleggeren (`GiftPage.tsx`, `useGiftStore`) planlegger og fordeler gavebudsjett, men
har i dag ingen god måte å registrere hva en gave faktisk endte med å koste, eller å se
tilbake på tidligere kjøp. `GiftEvent` har riktignok et `actualAmount`-felt og en enkel
«Faktisk vs planlagt»-sum (i Spareplan-fanen), men:

- Hendelser er nøkket på mottaker+anledning **uten årstall** — samme lagrede rad
  representerer «neste bursdag» år etter år, uten noen automatikk som arkiverer den og
  åpner for en fersk rad neste år. I praksis blir en kjøpt gave hengende med utdatert
  dato og status «kjøpt» for alltid.
- Ingen måte å notere at en gave ble kjøpt sammen med noen utenfor appen (delt kostnad),
  eller kjøpt brukt.
- Ingen måte å slå to mottakeres gaver sammen til ett kjøp (f.eks. én gave til både
  søsken og svigersøsken) uten å telle kostnaden dobbelt i sparepuls/fordeling.
- `GiftPurchase` (`src/types/gifts.ts`) er en definert, men aldri brukt type — et
  forlatt forsøk på nøyaktig dette. Fjernes som del av denne featuren (YAGNI — ny logikk
  legges direkte på `GiftEvent`, ikke i en separat kjøps-tabell).

## Mål og avgrensning

**Mål**
- Registrere faktisk pris, om gaven ble kjøpt brukt, og om den ble delt med noen
  utenfor appen (med et eget «delt totalpris»-felt til info — kun din andel telles).
- Automatisk årlig arkivering: en bursdagsgave blir historikk 3 måneder etter datoen,
  en julegave blir historikk 1. januar året etter — uavhengig av om den ble kjøpt eller
  ikke. Arkivering skjer helt automatisk (beregnet av dato), ikke via en knapp.
- Historikk er redigerbar — akkurat som en aktiv hendelse, bare i en egen liste.
- Slå sammen to mottakeres gaver til ett kjøp, med mulighet til å endre eller fjerne
  sammenslåingen senere.
- Alt dette vises på **Oversikt**-fanen (ikke en ny fane) — historikk-liste og en
  tydeligere faktisk-vs-planlagt-oversikt (per mottaker, ikke bare total).

**Avgrensning (YAGNI)**
- Ingen lagret «arkivert»-boolean eller bakgrunnsjobb som flytter data. Aktiv/historikk
  er en beregnet klassifisering ut fra dato, samme prinsipp som `deriveAutoEvents`
  allerede bruker for å generere kommende hendelser. Ingen migrering, ingen risiko for
  at en flytte-bug sletter data.
- Delt kjøp med eksterne er kun ett fritekstnotat + ett valgfritt totalbeløp til info —
  ingen formell sporing av hvem den andre parten er eller hva de betalte.
- Sammenslåtte gaver støtter to rader (én primær, én sekundær som peker til den) — ikke
  et generelt many-to-many-oppsett. Dekker det faktiske behovet (to mottakere, én gave).
- Ingen endring i `useGiftStore`s persist-`version` — alle nye felt er valgfrie og
  additive; eksisterende data laster inn uendret.
- Automatisk arkivering gjelder kun `bursdag` og `jul` (de eneste tilbakevendende
  anledningene med en klar «neste gang»). Andre anledninger (jubileum, dåp, bryllup ...)
  er engangshendelser i dagens modell og arkiveres ikke automatisk — de forblir i
  «Kommende hendelser» til brukeren evt. sletter dem manuelt, som i dag.

## Beslutninger (fra brainstorm)

| Spørsmål | Valg |
|----------|------|
| Delt kjøp med eksterne — påvirker det budsjettet? | Ja — kun din andel (`actualAmount`) telles. Totalpris er bare til info. |
| Sammenslåtte gaver — én rad eller to linkede? | To linkede rader (lettere å forstå per-mottaker, og matcher at «én rad = én mottaker» ellers i appen) |
| Kan sammenslåingen endres etter at den er opprettet? | Ja — avlinke eller relinke til en annen gave når som helst |
| Arkiveringsmekanisme | Beregnet fra dato ved rendering, ikke en lagret status eller manuell knapp |
| Hva arkiveres? | Alle hendelser forbi fristen, uavhengig av status (kjøpt eller ikke kjøpt) |
| Er historikk redigerbar? | Ja — samme redigering som aktive hendelser |
| Hvor vises historikk/avvik? | På Oversikt-fanen, ikke en ny fane |

## Arkitektur

| Lag | Fil | Ansvar |
|-----|-----|--------|
| Type | `src/types/gifts.ts` | `GiftEvent` får 4 nye valgfrie felt (se Datamodell). `GiftPurchase` fjernes (ubrukt). `GiftEvent.year` blir brukt (ikke bare valgfritt) for `jul` fremover. |
| Motor | `src/domain/gifts/giftCalculator.ts` | Ny `isEventArchived(event, today)` (ren funksjon). `deriveAutoEvents` sin dedup-sjekk (`manualKeys`) endres til å bare telle **aktive** lagrede hendelser. `calculateActualVsPlanned` utvides til å gruppere per mottaker og hoppe over sekundære (linkede) rader. `jul`-generering får et explisitt `year`. |
| Store | `src/application/useGiftStore.ts` | Ingen strukturell endring — nye felt er additive på eksisterende `GiftEvent[]`. Delt via `useSharedGaverStore`/`giftSync.ts` helt uendret (speiler hele slicen uansett). |
| UI | `src/pages/economy/GiftPage.tsx` | `OverviewTab` får en «Historikk»-seksjon og en per-mottaker faktisk-vs-planlagt-liste (flyttet fra `RatesTab`/Spareplan). `EventEditForm`-dialogen (rundt linje 1057) får felt for kjøpt-brukt, delt-kjøp-notat/totalpris, og sammenslåing-velger. |

## Datamodell

```ts
export interface GiftEvent {
  id: string
  recipientId: string
  occasion: Occasion
  date?: string
  month?: number
  year?: number               // blir satt (ikke bare valgfritt) for `jul` — trengs til arkiveringsregelen
  ownership: Ownership
  calculatedAmount: number
  manualAmount?: number
  isLocked: boolean
  status: EventStatus
  actualAmount?: number
  notes?: string

  /** Kjøpt brukt/secondhand — ren informasjon, påvirker ingen beregning. */
  boughtUsed?: boolean

  /** Gaven ble kjøpt sammen med noen utenfor appen. Fritekst, f.eks. "Delt med svigermor".
   *  actualAmount forblir DIN andel og er det eneste som telles i sparepuls/budsjett. */
  sharedPurchaseNote?: string
  /** Gavens fulle pris når delt — kun til info, teller ikke i noen beregning. */
  sharedPurchaseTotal?: number

  /** Sammenslått gave: denne raden er "sekundær" og peker til en annen GiftEvent som
   *  regnes som "samme gave". Sekundærradens egen actualAmount/calculatedAmount holdes
   *  utenfor alle sum-beregninger (unngår dobbelttelling) — beløpet ligger på primærraden.
   *  `undefined` = uavhengig rad (normaltilfellet). */
  linkedEventId?: string
}
```

`GiftPurchase` (linje ~107, ubrukt) fjernes fra `src/types/gifts.ts`.

## Arkivering — beregnet, ikke lagret

```ts
// src/domain/gifts/giftCalculator.ts
export function isEventArchived(event: GiftEvent, today: Date = new Date()): boolean {
  if (event.occasion === 'jul') {
    const y = event.year ?? today.getFullYear()
    return today >= new Date(y + 1, 0, 1) // 1. januar året etter
  }
  if (event.occasion === 'bursdag' && event.date) {
    const d = new Date(event.date)
    d.setMonth(d.getMonth() + 3)
    return today >= d
  }
  return false // andre anledninger (jubileum, dåp, ...) arkiveres ikke automatisk foreløpig
}
```

`GiftPage.tsx` (og evt. andre steder som leser `events`) deler listen i to beregnede
utvalg — ingen egen state:

```ts
const activeEvents = events.filter((e) => !isEventArchived(e))
const historyEvents = events.filter((e) => isEventArchived(e))
```

`deriveAutoEvents`s `manualKeys` (linje 350) endres fra å telle *alle* lagrede hendelser
til å bare telle **aktive**:

```ts
const manualKeys = new Set(
  storedEvents.filter((e) => !isEventArchived(e)).map((e) => `${e.recipientId}-${e.occasion}`)
)
```

Konsekvens: så snart en lagret hendelse passerer arkiveringsfristen sin, forsvinner den
fra `manualKeys`, og `deriveAutoEvents` genererer automatisk en fersk «planlagt»-rad for
neste bursdag/jul — nøyaktig samme mekanisme som i dag genererer den første raden for en
ny mottaker, bare at den nå kan gjenta seg år etter år. Den arkiverte raden ligger fortsatt
i `storedEvents`/`useGiftStore.events` for alltid, uendret, og blir historikk-listen.

`jul`-generering (linje 375–387) får et konkret `year` (mangler i dag):

```ts
if (r.receivesChristmasGift && !manualKeys.has(`${r.id}-jul`)) {
  const event: GiftEvent = {
    id: `auto-jul-${r.id}`, recipientId: r.id, occasion: 'jul',
    month: 12, year: currentYear, ownership: r.ownership,
    calculatedAmount: 0, isLocked: false, status: 'planlagt',
  }
  ...
}
```

## Sammenslåtte gaver

- I redigeringsdialogen for en hendelse: en «Slå sammen med en annen gave»-velger, som
  lister andre *aktive* hendelser (typisk: andre mottakeres kommende gaver til samme
  anledning/dato). Å velge en setter `linkedEventId` på **denne** hendelsen, som dermed
  blir sekundær.
- Overalt der beløp summeres (`calculateGiftResult`, `calculateActualVsPlanned`,
  sparepuls per mottaker), hoppes hendelser med `linkedEventId` satt over — beløpet
  telles kun på primærraden (den `linkedEventId` peker til).
- I lister vises en sekundærrad med en lenke-indikator og primærmottakerens navn/beløp
  i stedet for sitt eget, f.eks. «🔗 Delt gave med Liv — 500 kr», med en «Fjern
  sammenslåing»-knapp som nullstiller `linkedEventId` (raden blir uavhengig igjen, med
  `actualAmount`/`calculatedAmount` som den hadde fra før — typisk 0, må fylles inn på
  nytt).
- Kan endres fritt: velge en annen gave å lenke til, eller fjerne lenken — ingen
  permanent binding.

## UI — Oversikt-fanen

To nye seksjoner i `OverviewTab` (`GiftPage.tsx`), i tillegg til dagens Sparepuls og
Kommende hendelser:

- **Faktisk vs. planlagt** flyttes hit fra Spareplan-fanen. I dag viser den kun én sum
  for alle kjøpte gaver (`calculateActualVsPlanned`). Utvides til å gruppere per
  mottaker — samme funksjon returnerer en liste `{ recipientId, planned, actual,
  deviation }[]` i tillegg til totalen, så over-/underforbruk per person blir synlig,
  ikke bare i sum.
- **Historikk** — `historyEvents` sortert nyeste først, viser mottaker, anledning, år,
  faktisk pris, evt. «Brukt»-merke, evt. delt-kjøp-notat. Klikk åpner samme
  redigeringsdialog som aktive hendelser — historikk er ikke låst.
- «Marker som kjøpt» på en kommende hendelse (i dag et enkelt avkrysningsfelt) åpner i
  stedet et lite skjema: faktisk pris (gjenbruker eksisterende `actualAmount`-input),
  kjøpt brukt (checkbox), delt kjøp (notat + valgfri totalpris). Selve
  redigeringsdialogen (linje ~1057, `EventEditForm`) får de samme feltene, siden den
  gjenbrukes for både ny/rediger/marker-som-kjøpt.

## Testing

`isEventArchived` og den endrede `deriveAutoEvents`-dedupen er ren logikk (ingen DOM) og
enhetstestes etter prosjektets eksisterende mønster (`environment: 'node'`):
- Bursdag: rett før/rett etter 3-måneders-grensen.
- Jul: rett før/rett etter 1. januar året etter, med og uten explisitt `year`.
- `deriveAutoEvents` genererer en ny hendelse når den gamle er arkivert, og genererer
  *ikke* en ny når det finnes en aktiv en.
- `calculateActualVsPlanned` (og evt. sparepuls-summeringen) hopper over hendelser med
  `linkedEventId` satt, og at fjerning av en lenke (`linkedEventId` → `undefined`) gjør
  raden synlig i summene igjen.
