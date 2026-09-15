# Mottakerliste: kompakt visning + «Barn av venn» — Design

## Sammendrag

To små, uavhengige forbedringer i Mottakere-fanen (`RecipientsTab` i `src/pages/economy/GiftPage.tsx`) i Gaveplanlegger:

1. En ny relasjonstype **«Barn av venn»** — for gaver til venners barn, som i dag må puttes i en generisk kategori.
2. En **Kort/Liste-toggle** — et alternativ til dagens kort-rutenett med en tettere tabellvisning, for enklere overblikk når man har mange mottakere.

Et tredje behov brukeren tok opp under brainstormen — å kunne registrere kjøpte julegaver tidlig i året, ikke bare de som vises under «Kommende hendelser» på Oversikt — krever ingen kodeendring: det er allerede løst via Mottakere-fanens person-panel (velg person → «Kjøpt»-knapp på hvilken som helst hendelse, uavhengig av dato). Brukeren visste ikke at denne veien fantes; den kompakte listevisningen gjør det raskere å finne riktig person der.

## Mål og avgrensning

**Mål:**
- Kunne kategorisere en mottaker som «Barn av venn», med egen visning i Relasjon-sorteringen og egen (justerbar) standardsats.
- Kunne bytte til en tettere, tabellignende visning av mottakerlisten.

**Avgrensning:**
- Ingen endring i Oversikt-fanen eller kjøpsflyten («marker som kjøpt») — dette er rent Mottakere-fanen.
- Ingen ny persistert innstilling — Kort/Liste er en lokal UI-state, nullstilles til Kort ved åpning (samme mønster som «Redigering»-låsen på Klær-siden).
- Ingen migrering — «Barn av venn» er et additivt nytt medlem av en union-type; eksisterende data er upåvirket.

## Beslutninger

| Spørsmål | Beslutning |
|---|---|
| Skal Kort/Liste erstatte kort-visningen, eller være et alternativ? | Alternativ — bytte-knapp, kort er standard |
| Skal «Barn av venn» regnes som familie eller venn i kostnadsfordelingen? | Verken/eller eksplisitt, men — siden `FAMILY_RELATIONSHIPS` i giftCalculator.ts er den ENESTE binære grensen mellom «familie» og «alt annet» i fordelingslogikken — får den automatisk samme kostnadsbehandling som en venn ved å IKKE stå i det settet. |
| Skal «Barn av venn» ha egen synlig gruppe i Relasjon-sorteringen? | Ja — ny gruppe «Barn av venner», plassert mellom Venner og Andre. |
| Hvordan skal en Liste-rad se ut? | Navn \| Relasjon \| 🎂 Bursdag-beløp \| 🎄 Jul-beløp \| Neste hendelse. Stjerne-badge og override-markør (✎) tas ikke med — bevisst forenkling for tetthet. |
| Trengs endring for «kjøp gaver hele året»? | Nei — allerede løst av eksisterende personpanel-flyt på Mottakere-fanen. |

## Datamodell

`src/types/gifts.ts` — `RelationshipType` får ett nytt medlem:

```ts
export type RelationshipType =
  | 'partner' | 'foreldre' | 'svigerforeldre' | 'søsken' | 'svigersøsken'
  | 'besteforeldre' | 'barn' | 'stebarn' | 'tante_onkel' | 'niese_nevø'
  | 'fadderbarn' | 'nær_venn' | 'venn' | 'barn_av_venn' | 'kollega' | 'nabo'
  | 'vertskap' | 'annet'
```

`src/domain/gifts/defaultWeights.ts`:
- `RELATIONSHIP_LABELS.barn_av_venn = 'Barn av venn'`
- `DEFAULT_WEIGHT_RULES.relationshipBaseAmounts.barn_av_venn = 250` (mellom nabo=200 og venn=400 — kun en startverdi, justerbar i Tilpass-fanen som alle andre satser).

`src/domain/gifts/giftCalculator.ts` — `FAMILY_RELATIONSHIPS`-settet endres IKKE. `barn_av_venn` er bevisst utenfor, slik at `calculateEventShare`s `familie_venn`-modell automatisk behandler den som en venn (eier betaler alene med mindre eierskap er «felles», da 50/50) — ingen kodeendring i selve funksjonen er nødvendig, kun i hvilke verdier settet inneholder (som forblir uendret).

Ingen migrering: eksisterende `GiftRecipient`- eller `GiftEvent`-data har aldri hatt `relationshipType: 'barn_av_venn'`, så additiv utvidelse av unionen er trygg uten videre tiltak.

## Sortering — ny gruppe

`RecipientsTab`s `sections`-`useMemo` (relasjon-grenen) bygges i dag opp av `FAMILY_RELS`/`FRIEND_RELS`-settene og en implisitt «Andre»-gruppe. Det legges til et tredje, eksplisitt sett:

```ts
const CHILD_OF_FRIEND_RELS = new Set<RelationshipType>(['barn_av_venn'])
```

og gruppe-inndelingen i 'relasjon'-grenen utvides fra tre til fire grupper i denne rekkefølgen: **Familie → Venner → Barn av venner → Andre** (kun grupper med minst én mottaker vises, som i dag).

## UI — Kort/Liste

Ny lokal state i `RecipientsTab`:

```ts
const [view, setView] = useState<'kort' | 'liste'>('kort')
```

En knapp/toggle plasseres på topplinjen, ved siden av sorteringsbryterne (Eierskap/Bursdag/Gaveverdi/Relasjon) og før «+ Legg til»-knappen.

Når `view === 'liste'`, rendres hver seksjon (samme grupperte data, samme `sections`-array) som en tett tabell i stedet for kort-rutenettet:

```
Navn           Relasjon      🎂 Bursdag   🎄 Jul     Neste
Anne Iren      Foreldre      500 kr       500 kr     Om 5 mnd
Per Kolbjørn   Foreldre      500 kr       500 kr     Om 10 dager
```

Hver rad beholder eksisterende funksjonalitet fra kort-visningen:
- Klikk på raden → samme `toggleSelected(r.id)` som i dag (åpner person-hendelser-panelet under).
- Rediger- og slette-ikon → samme `openEditing(r)` / `removeRecipient(r.id)` som i dag.
- Beløpene beregnes med samme `calcOccasionAmount(r, 'bursdag')` / `calcOccasionAmount(r, 'jul')` som kortene allerede bruker.
- «Neste»-kolonnen bruker samme `nextBStr(r)`-funksjon som kortenes «neste bursdag»-tekst.

Stjerne-badge (rund fødselsdag) og override-markør (✎) vises IKKE i liste-visningen — en bevisst forenkling for at raden skal forbli tett. Disse forblir synlige i kort-visningen.

## Testing

Ingen nye rene funksjoner å teste — dette er et additivt datapunkt (ny enum-verdi + to nye kart-oppføringer) og en UI-visningsendring i en komponent uten eksisterende komponenttester (se [[feedback-ui-krever-browsertest]] i minnet — manuell browser-test mot ekte data er nødvendig før dette regnes som ferdig, siden ingen automatisert test rendrer denne komponenten).

Verifiseres manuelt:
1. Legg til/rediger en mottaker med relasjon «Barn av venn» — bekreft at den dukker opp i en egen «Barn av venner»-gruppe når sortering = Relasjon.
2. Bytt til Liste-visning — bekreft at alle mottakere vises med korrekte beløp/neste-dato, og at rediger/slett/klikk-for-å-velge fortsatt virker identisk til kort-visningen.
3. Bytt tilbake til Kort — bekreft ingen datatap eller feil state.
