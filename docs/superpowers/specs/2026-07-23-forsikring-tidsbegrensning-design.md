# Forsikring — start- og sluttdato — Design

**Dato:** 2026-07-23
**Status:** Godkjent design — klar for implementeringsplan
**Branch:** `feat/forsikring-tidsbegrensning`

## Sammendrag

`InsuranceEntry` (Abo & Fors.-siden) mangler i dag en måte å angi at en forsikring kun er
gyldig i en avgrenset periode — f.eks. en MC-forsikring som ble avsluttet i en gitt måned
fordi motorsykkelen ble solgt. Den eneste mekanismen som finnes er en manuell «Avslutt
forsikring»-handling som permanent flytter forsikringen til en historikk-seksjon
(`status: 'avsluttet'` + `cancelledDate`). Brukeren ønsker i stedet å kunne sette en
start- og sluttdato på forsikringen direkte, slik at den **automatisk** slutter å telle
med i budsjettet fra og med måneden etter sluttdatoen — uten en egen manuell handling.

`SubscriptionEntry` har allerede nøyaktig dette mønsteret for sluttdato (`activeUntil`,
beregnet ut fra dagens måned — ingen lagret boolean som må vippes manuelt). Denne
featuren bringer `InsuranceEntry` til paritet med abonnement, og utvider mønsteret med
en tilsvarende startdato.

## Mål og avgrensning

**Mål**
- Forsikringer kan få en valgfri start- og/eller sluttmåned (`YYYY-MM`).
- Utenfor dette intervallet telles forsikringen automatisk som 0 kr i budsjettet — ingen
  manuell handling nødvendig hver periode.
- Forsikringer med passert sluttdato vises i en egen «Utløpte forsikringer»-seksjon i
  Abo & Fors., beregnet fra dagens dato — samme UX-mønster som abonnement har i dag.

**Avgrensning (YAGNI)**
- Den eksisterende «Avslutt forsikring»-handlingen (`status: 'avsluttet'` + `cancelledDate`,
  permanent flytting til historikk) beholdes uendret ved siden av. Den dekker et annet
  behov: uplanlagt/øyeblikkelig kansellering. De nye datofeltene dekker det motsatte
  tilfellet — en kjent, forhåndsbestemt periode.
- Ingen tilbakevendende/sesongbasert gyldighet (f.eks. «kun aktiv april–oktober hvert år»).
  Kun ett sammenhengende intervall per forsikring.
- Ingen store-migrering. Feltene er valgfrie og additive — eksisterende forsikringer uten
  dem oppfører seg akkurat som i dag (løpende, ingen grense).

## Beslutninger (fra brainstorm)

| Spørsmål | Valg |
|----------|------|
| Mekanisme | To valgfrie felt, beregnet i budsjettmotoren — ikke en lagret status som må oppdateres |
| Forhold til eksisterende «Avslutt forsikring» | Beholdes uendret, dekker et annet (manuelt/uplanlagt) behov |
| Mønster å følge | `SubscriptionEntry.activeUntil` — speiles 1:1, utvidet med tilsvarende `activeFrom` |
| Migrering | Ingen — additive valgfrie felt |

## Arkitektur

| Lag | Fil | Ansvar |
|-----|-----|--------|
| Type | `src/types/economy.ts` | `InsuranceEntry` får `activeFrom?: string` og `activeUntil?: string` (`"YYYY-MM"`) |
| Motor | `src/domain/economy/budgetTableComputer.ts` | `insMonthAmount` nuller beløp utenfor `[activeFrom, activeUntil]`, før eksisterende `cancelledDate`-sjekk |
| UI | `src/pages/economy/SubscriptionsPage.tsx` | `EditInsuranceForm`/`AddInsuranceForm` får to nye datofelt; ny «Utløpte forsikringer»-seksjon; gjenbruker `monthsRemaining`-badge fra abonnement |

## Datamodell

```ts
export interface InsuranceEntry {
  id: string
  provider: string
  type: string
  yearlyAmounts: { [year: string]: number }
  isActive: boolean
  renewalMonth?: number
  status?: 'aktiv' | 'avsluttet'
  cancelledDate?: string
  bonus?: number
  providerHistory?: InsuranceProviderHistory[]
  /** Første aktive måned ("YYYY-MM"). Udefinert = har alltid vært aktiv. */
  activeFrom?: string
  /** Siste aktive måned ("YYYY-MM"). Udefinert = løpende. */
  activeUntil?: string
}
```

Ingen endring i `version` for `useEconomyStore` — feltene er valgfrie, så eksisterende
persisterte forsikringer laster inn uendret (begge nye felt blir `undefined`, samme
oppførsel som i dag).

## Budsjettmotor

`insMonthAmount` (linje ~116) utvides til å sjekke begge grensene før den eksisterende
`cancelledDate`-sjekken:

```ts
function insMonthAmount(ins: InsuranceEntry, year: number, month: number): number {
  const key = `${year}-${String(month).padStart(2, '0')}`
  if (ins.activeFrom && key < ins.activeFrom) return 0
  if (ins.activeUntil && key > ins.activeUntil) return 0
  if (ins.cancelledDate && key > ins.cancelledDate.slice(0, 7)) return 0
  return (ins.yearlyAmounts[String(year)] ?? 0) / 12
}
```

`activeIns`-filteret (linje ~584, `insurances.filter((ins) => ins.isActive || (ins.status
=== 'avsluttet' && !!ins.cancelledDate))`) endres **ikke** — det inkluderer allerede alle
aktive forsikringer uavhengig av dato, og nulling skjer per måned inni `insMonthAmount`,
akkurat slik `subMonthAmount`/`activeSubs` allerede fungerer for abonnement.

## UI — Abo & Fors.-siden

Speiler abonnement-mønsteret som allerede finnes i `SubscriptionsPage.tsx`:

- **Redigering:** `EditInsuranceForm` og `AddInsuranceForm` får to nye måned-input-felt
  («Aktiv fra» / «Aktiv til»), samme komponent/UX som abonnement sitt `activeUntil`-felt.
- **Gruppering:** en ny beregnet liste, parallell til `expiredSubscriptions` (linje 57):
  `insurances.filter((ins) => ins.isActive && ins.activeUntil && ins.activeUntil <
  currentMonthKey)`. Disse vises i en egen «Utløpte forsikringer»-seksjon i stedet for
  hovedlisten — beregnet fra dagens måned, ikke en lagret status. Hovedlistens filter
  (linje ~301, `insurances.filter(i => i.status !== 'avsluttet')`) utvides til også å
  ekskludere disse utløpte-men-ikke-avsluttede forsikringene.
- **Badge:** gjenbruker `monthsRemaining`-hjelpefunksjonen (linje 453, allerede skrevet for
  abonnement) for å vise «Utløper om X måneder» / «Utløpt {dato}» på forsikringsraden.

## Testing

Ren logikk i `budgetTableComputer.ts` (`insMonthAmount`) dekkes med enhetstester —
tilsvarende eksisterende tester for `subMonthAmount`/`activeUntil` på abonnement, om de
finnes; ellers nye tester som dekker: før `activeFrom` → 0, etter `activeUntil` → 0,
innenfor intervallet → vanlig beløp, samspill med `cancelledDate` (strengeste grense
vinner). UI-grupperingen (`expiredSubscriptions`-ekvivalent for forsikring) er ren
filter-logikk og kan også enhetstestes uten DOM-rendering, i tråd med prosjektets
eksisterende testkonvensjon (`environment: 'node'`, ingen komponent-rendering-tester).
