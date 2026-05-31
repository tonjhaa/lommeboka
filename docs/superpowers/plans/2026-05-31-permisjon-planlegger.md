# Foreldrepermisjon-planlegger med AI-agent — Implementasjonsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** En dedikert fane i Lommeboka der brukeren og partner kan planlegge foreldrepermisjonen optimalt mot barnehagestart, med full støtte for norsk regelverk og en innebygd AI-rådgiver (Claude via Supabase Edge Function).

**Architecture:** Standalone Zustand-store (`usePermisjonStore`) lagrer konfig og plan. En ren regel-engine (`foreldrepengerRules.ts`) beregner tilgjengelige uker og validerer planen uten side-effects. AI-agenten kjøres via en Supabase Edge Function som proxyer til Anthropic API — API-nøkkel lagres aldri i frontend. Tidslinje-visualisering bygges med rene CSS-beregninger (ingen ekstra chart-bibliotek).

**Tech Stack:** React 19, Zustand persist, TypeScript strict, Tailwind v4, Supabase Edge Function (Deno), Anthropic SDK (server-side), eksisterende `src/lib/supabase.ts`

**Norsk regelverk som implementeres — tall hentet fra navikt/fp-stonadskonto (barn født etter 1. juli 2024):**

Alle tall er i **stønadsdager** (arbeidsdager, 5-dagers uke). Kilde: `Konfigurasjon.java` i navikt/fp-stonadskonto.

| Konto | 100 % (dager) | 100 % (uker) | 80 % (dager) | 80 % (uker) |
|---|---|---|---|---|
| `FORELDREPENGER_FØR_FØDSEL` (mor, separat konto) | 15 | 3 | 15 | 3 |
| `MØDREKVOTE_DAGER` (etter fødsel) | 75 | 15 | 95 | 19 |
| `FEDREKVOTE_DAGER` | 75 | 15 | 95 | 19 |
| `FELLESPERIODE_DAGER` | 80 | 16 | 101 | 20 + 1 dag |
| **Totalt** | **245** | **49** | **306** | **~61 + 1 dag** |
| `EKSTRA_DAGER_TO_BARN` (tvillinger) | 85 | 17 | 106 | 21 + 1 dag |
| `FAR_DAGER_RUNDT_FØDSEL` (delpott av fedrekvote) | 10 | 2 | 10 | 2 |

**Viktig arkitektur-detalj:**
- `FORELDREPENGER_FØR_FØDSEL` er en **separat konto**, IKKE del av mødrekvoten
- Mor disponerer totalt: 3 uker (forTermin) + 15 uker (mødrekvote) = **18 uker** + andel av fellesperiode
- `FAR_DAGER_RUNDT_FØDSEL` = 2 uker er en **delpott av fedrekvoten** (ikke ekstra) — kan tas rundt fødsel
- Stønadsdager telles i **arbeidsdager** (man–fre). Regel-engine bruker dager internt, viser uker i UI.

**Andre regler:**
- Obligatorisk: 3 uker før termin (mor) + 6 uker etter fødsel (mor, ikke utsettbar)
- Fedrekvote kan tas fra uke 7 etter fødsel, ingen aktivitetskrav til mor under selve kvoten
- Fellesperiode: mor MÅ være i godkjent aktivitet (jobb/utdanning) om far tar den
- Ferie kan "pause" perioden (NAV-perioden forskyves)
- Tidsfrist: all permisjon må tas før barnet fyller 3 år
- Tvillinger: +17 uker (100 %) / +21 uker + 1 dag (80 %) ekstra (fordelt likt mellom foreldrene)

**Lærer-spesifikt:**
- Partner er lærer med sommerferie ca. 22. juni – 14. august (~8 uker)
- Permisjonstid som overlapper sommerferie er "bortkastet" — partneren er hjemme uansett
- Optimal strategi: legg partnerens fedrekvote/fellesperiode til skoleåret (sept–mai), ikke sommer
- Kan bruke "ferie-pause" i NAV-søknad for å forskyve ukene

**Barnehagestart:** 1. august i kalenderåret barnet fyller 1 år (norsk standard).

---

## Filer som opprettes / endres

| Fil | Hva |
|-----|-----|
| `src/types/permisjon.ts` | NY — alle typer for permisjonplanner |
| `src/application/usePermisjonStore.ts` | NY — Zustand store med localStorage-persist |
| `src/domain/economy/foreldrepengerRules.ts` | NY — ren regel-engine, ingen side-effects |
| `src/components/economy/PermisjonTimeline.tsx` | NY — horisontal tidslinje-visualisering |
| `src/pages/economy/PermisjonPage.tsx` | NY — hoved-side med sub-tabs: Oppsett, Tidslinje, AI-rådgiver |
| `supabase/functions/permisjon-ai/index.ts` | NY — Edge Function, proxyer til Anthropic API |
| `src/types/economy.ts` | Legg til `'permisjon'` i `EconomyTab` union |
| `src/store/useAppStore.ts` | Legg til `'permisjon'` i `EconomySubPage` union |
| `src/pages/economy/EconomyPage.tsx` | Lazy import + route for PermisjonPage |

---

## Task 1: Typer

**Files:**
- Create: `src/types/permisjon.ts`

- [ ] **Steg 1: Skriv typer**

```typescript
// src/types/permisjon.ts

export type Dekningsgrad = 80 | 100

export interface FerieBlokk {
  fra: string   // "YYYY-MM-DD"
  til: string   // "YYYY-MM-DD"
  label?: string
}

export type PeriodeType =
  | 'mor_før_termin'        // obligatorisk 3 uker
  | 'mor_obligatorisk'      // obligatorisk 6 uker etter fødsel
  | 'mor_kvote'             // resterende mødrekvote (fleksibel)
  | 'far_kvote'             // fedrekvote / medmorkvote
  | 'felles_mor'            // fellesperiode tatt av mor
  | 'felles_far'            // fellesperiode tatt av far (krever mor i aktivitet)
  | 'ferie_pause'           // ferie-pause (forskyver perioden)

export interface PermisjonPeriode {
  id: string
  type: PeriodeType
  owner: 'meg' | 'partner'
  fra: string               // "YYYY-MM-DD"
  til: string               // "YYYY-MM-DD"
  gradertProsent?: number   // 0–100, 0 = ikke gradert
  erPause?: boolean         // ferie-pause, telles ikke mot kvoten
}

export interface PermisjonInput {
  terminDato: string              // "YYYY-MM-DD"
  fodselsDato?: string            // settes hvis allerede født
  dekningsgrad: Dekningsgrad
  tvillinger: boolean
  forTidligFodsel: boolean        // født < uke 33
  mineFerieblokker: FerieBlokk[] // brukerens (mor) ferie
  partnerErLærer: boolean
  partnerFerieblokker: FerieBlokk[]  // typisk sommer-ferie
  partnerSommerFraManedDag: string   // default "06-22"
  partnerSommerTilManedDag: string   // default "08-14"
}

export interface TilgjengeligeUker {
  // Kilde: navikt/fp-stonadskonto Konfigurasjon.java
  forTermin: number       // FORELDREPENGER_FØR_FØDSEL — separat konto (ikke del av mødrekvote)
  mødrekvote: number      // MØDREKVOTE_DAGER etter fødsel (15 uker ved 100%)
  fedrekvote: number      // FEDREKVOTE_DAGER (15 uker ved 100%)
  farRundtFodsel: number  // FAR_DAGER_RUNDT_FØDSEL = 2 uker (delpott av fedrekvote)
  fellesperiode: number   // FELLESPERIODE_DAGER (16 uker ved 100%)
  total: number           // sum av alle kontoer inkl. forTermin
  totalMor: number        // forTermin + mødrekvote + fellesperiode
  totalPartner: number    // fedrekvote + fellesperiode
  obligatorisk: { forTermin: number; etterFodsel: number }
  ekstraFlerbarns: number
  ekstraForTidlig: number  // stønadsdager omregnet til uker
}

export interface PlanValidering {
  ok: boolean
  advarsler: string[]         // gule advarsler
  feil: string[]              // røde feil (regler brutt)
}

export interface PermisjonOppsummering {
  barnehageStart: string       // "YYYY-MM-DD"
  dekkerTilBarnehageStart: boolean
  sluttdatoMeg: string | null
  sluttdatoPartner: string | null
  ukerdBruktMeg: number
  ukerBruktPartner: number
  ukerIgjenMeg: number
  ukerIgjenPartner: number
  partnerUkerISommerFerie: number  // uker "bortkastet" i sommerferie
  validering: PlanValidering
}

export interface PermisjonState {
  input: PermisjonInput
  perioder: PermisjonPeriode[]
  chatHistory: ChatMessage[]
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}
```

- [ ] **Steg 2: Bygg**

```bash
npm run build 2>&1 | grep -E "error TS|✓"
```
Forventet: `✓ built`

- [ ] **Steg 3: Commit**

```bash
git add src/types/permisjon.ts
git commit -m "feat(permisjon): typer for foreldrepermisjon-planlegger"
```

---

## Task 2: Regel-engine

**Files:**
- Create: `src/domain/economy/foreldrepengerRules.ts`

- [ ] **Steg 1: Skriv regel-engine**

```typescript
// src/domain/economy/foreldrepengerRules.ts
import type {
  Dekningsgrad, PermisjonInput, TilgjengeligeUker,
  PermisjonPeriode, PlanValidering, PermisjonOppsummering, FerieBlokk,
} from '@/types/permisjon'

// ── Konstanter — hentet fra navikt/fp-stonadskonto Konfigurasjon.java ──
// Alle tall er stønadsdager (arbeidsdager, man–fre). 1 uke = 5 stønadsdager.
// Kilde: DATO_UTLIGNE_80 = 2024-07-01

const DAGER_PER_UKE = 5

/** Stønadsdager per konto, per dekningsgrad (barn etter 1. juli 2024) */
const KONFIG_DAGER: Record<Dekningsgrad, {
  forTermin: number   // FORELDREPENGER_FØR_FØDSEL — separat konto (ikke del av mødrekvote)
  mødre: number       // MØDREKVOTE_DAGER
  fedre: number       // FEDREKVOTE_DAGER
  felles: number      // FELLESPERIODE_DAGER
  farRundtFodsel: number  // FAR_DAGER_RUNDT_FØDSEL (delpott av fedrekvote)
  ekstraToBarn: number    // EKSTRA_DAGER_TO_BARN
}> = {
  100: { forTermin: 15, mødre: 75, fedre: 75, felles: 80, farRundtFodsel: 10, ekstraToBarn: 85 },
   80: { forTermin: 15, mødre: 95, fedre: 95, felles: 101, farRundtFodsel: 10, ekstraToBarn: 106 },
}

const OBLIGATORISK_ETTER_FODSEL_DAGER = 30  // 6 uker × 5 dager

function dagerTilUker(dager: number): number { return dager / DAGER_PER_UKE }
function ukerTilDager(uker: number): number { return uker * DAGER_PER_UKE }

// ── Hjelper: dato-matte ───────────────────────────────────────────

export function addWeeks(date: string, weeks: number): string {
  const d = new Date(date)
  d.setDate(d.getDate() + Math.round(weeks * 7))
  return d.toISOString().split('T')[0]
}

export function addDays(date: string, days: number): string {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

export function weeksBetween(fra: string, til: string): number {
  const ms = new Date(til).getTime() - new Date(fra).getTime()
  return ms / (1000 * 60 * 60 * 24 * 7)
}

export function daysBetween(fra: string, til: string): number {
  return Math.round((new Date(til).getTime() - new Date(fra).getTime()) / (1000 * 60 * 60 * 24))
}

/** Antall uker en periode overlapper med en ferieblokk */
export function ukerOverlapMedFerie(periode: { fra: string; til: string }, ferie: FerieBlokk): number {
  const start = new Date(Math.max(new Date(periode.fra).getTime(), new Date(ferie.fra).getTime()))
  const slutt = new Date(Math.min(new Date(periode.til).getTime(), new Date(ferie.til).getTime()))
  if (slutt <= start) return 0
  return (slutt.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 7)
}

// ── Beregn tilgjengelige uker ─────────────────────────────────────

export function beregnTilgjengeligeUker(input: PermisjonInput): TilgjengeligeUker {
  const k = KONFIG_DAGER[input.dekningsgrad]
  const ekstraDagerFlerbarns = input.tvillinger ? k.ekstraToBarn : 0

  // For tidlig fødsel: dager barnet er født FØR termin (kalenderdager → stønadsdager)
  let ekstraForTidligDager = 0
  if (input.forTidligFodsel && input.fodselsDato && input.terminDato) {
    const kalenderDager = daysBetween(input.fodselsDato, input.terminDato)
    // Konverter til stønadsdager (5/7 av kalenderdager)
    ekstraForTidligDager = Math.max(0, Math.round(kalenderDager * 5 / 7))
  }

  // Merk: FORELDREPENGER_FØR_FØDSEL er SEPARAT fra mødrekvote
  const møreDager = k.mødre + ekstraDagerFlerbarns + ekstraForTidligDager
  const fedreDager = k.fedre + ekstraDagerFlerbarns
  const fellesDager = k.felles + ekstraDagerFlerbarns

  return {
    // Vises i uker i UI (desimaler OK, rund av ved visning)
    forTermin: dagerTilUker(k.forTermin),         // 3 uker — separat konto
    mødrekvote: dagerTilUker(møreDager),           // 15 uker (+ eventuelle ekstra)
    fedrekvote: dagerTilUker(fedreDager),          // 15 uker
    farRundtFodsel: dagerTilUker(k.farRundtFodsel), // 2 uker (delpott av fedrekvote)
    fellesperiode: dagerTilUker(fellesDager),      // 16 uker
    // Totalt inkl. forTermin:
    total: dagerTilUker(k.forTermin + møreDager + fedreDager + fellesDager),
    // Totalt mor kan disponere: forTermin + mødrekvote + (fellesperiode om ønskelig)
    totalMor: dagerTilUker(k.forTermin + møreDager + fellesDager),
    // Totalt partner kan disponere: fedrekvote + (fellesperiode om mor er i aktivitet)
    totalPartner: dagerTilUker(fedreDager + fellesDager),
    obligatorisk: {
      forTermin: dagerTilUker(k.forTermin),
      etterFodsel: dagerTilUker(OBLIGATORISK_ETTER_FODSEL_DAGER),
    },
    ekstraFlerbarns: dagerTilUker(ekstraDagerFlerbarns),
    ekstraForTidlig: dagerTilUker(ekstraForTidligDager),
  }
}

// ── Beregn barnehagestart ─────────────────────────────────────────

export function beregnBarnehageStart(terminDato: string, fodselsDato?: string): string {
  const refDato = fodselsDato ?? terminDato
  const refYear = new Date(refDato).getFullYear()
  // Barnehagestart = 1. august i kalenderåret barnet fyller 1 år
  const barnehageYear = refYear + 1
  return `${barnehageYear}-08-01`
}

// ── Standard-plan (forslag) ───────────────────────────────────────

/**
 * Genererer et optimalisert startforslag basert på input.
 * Hensyn: partner er lærer → fedrekvote legges til skoleåret (ikke sommer)
 */
export function genererStandardPlan(input: PermisjonInput): PermisjonPeriode[] {
  const fodsel = input.fodselsDato ?? input.terminDato
  const tilgjengelig = beregnTilgjengeligeUker(input)
  const k = KVOTE[input.dekningsgrad]
  const perioder: PermisjonPeriode[] = []

  // 1. Mor: 3 uker før termin
  const morFørStart = addWeeks(input.terminDato, -k.forTermin)
  perioder.push({
    id: 'mor-for-termin',
    type: 'mor_før_termin',
    owner: 'meg',
    fra: morFørStart,
    til: addDays(fodsel, -1),
  })

  // 2. Mor: 6 obligatoriske uker etter fødsel (del av mødrekvote, ikke av forTermin)
  const morObligStart = fodsel
  const morObligSlutt = addWeeks(fodsel, tilgjengelig.obligatorisk.etterFodsel)
  perioder.push({
    id: 'mor-obligatorisk',
    type: 'mor_obligatorisk',
    owner: 'meg',
    fra: morObligStart,
    til: addDays(morObligSlutt, -1),
  })

  // 3. Mor: resterende mødrekvote (mødrekvote minus obligatoriske 6 uker etter fødsel)
  // NB: forTermin er separat — trekkes IKKE fra mødrekvote
  const morFleksibel = tilgjengelig.mødrekvote - tilgjengelig.obligatorisk.etterFodsel
  if (morFleksibel > 0) {
    perioder.push({
      id: 'mor-kvote',
      type: 'mor_kvote',
      owner: 'meg',
      fra: morObligSlutt,
      til: addDays(addWeeks(morObligSlutt, morFleksibel), -1),
    })
  }

  // 4. Fellesperiode — mor tar den (ingen aktivitetskrav)
  const fellesMorStart = addWeeks(morObligSlutt, morFleksibel)
  perioder.push({
    id: 'felles-mor',
    type: 'felles_mor',
    owner: 'meg',
    fra: fellesMorStart,
    til: addDays(addWeeks(fellesMorStart, tilgjengelig.fellesperiode), -1),
  })

  // 5. Partner (far/medmor): fedrekvote
  // For lærere: start etter at sommerferie er over (august)
  // Ellers: start fra uke 7
  let farStart: string
  const uke7EtterFodsel = addWeeks(fodsel, 7)

  if (input.partnerErLærer) {
    // Finn slutt på partnerens sommerferie det aktuelle året
    const fodselYear = new Date(fodsel).getFullYear()
    const kandidater = [fodselYear, fodselYear + 1].map(
      (y) => `${y}-${input.partnerSommerTilManedDag}`
    )
    const aktuellSommerSlutt = kandidater.find((d) => d > uke7EtterFodsel) ?? uke7EtterFodsel
    farStart = new Date(aktuellSommerSlutt) > new Date(uke7EtterFodsel)
      ? acuellSommerSlutt
      : uke7EtterFodsel
    farStart = aktuellSommerSlutt > uke7EtterFodsel ? aktuellSommerSlutt : uke7EtterFodsel
  } else {
    farStart = uke7EtterFodsel
  }

  perioder.push({
    id: 'far-kvote',
    type: 'far_kvote',
    owner: 'partner',
    fra: farStart,
    til: addDays(addWeeks(farStart, tilgjengelig.fedrekvote), -1),
  })

  return perioder
}

// ── Valider plan ──────────────────────────────────────────────────

export function validerPlan(
  input: PermisjonInput,
  perioder: PermisjonPeriode[],
): PlanValidering {
  const advarsler: string[] = []
  const feil: string[] = []
  const fodsel = input.fodselsDato ?? input.terminDato
  const tilgjengelig = beregnTilgjengeligeUker(input)

  const harForTermin = perioder.some((p) => p.type === 'mor_før_termin')
  if (!harForTermin) feil.push('Mor mangler 3 uker før termin (obligatorisk)')

  const harOblig = perioder.some((p) => p.type === 'mor_obligatorisk')
  if (!harOblig) feil.push('Mor mangler 6 obligatoriske uker etter fødsel')

  // Kontroller at far ikke starter før uke 7
  const uke7 = addWeeks(fodsel, 7)
  const farPerioder = perioder.filter((p) => p.owner === 'partner' && !p.erPause)
  farPerioder.forEach((p) => {
    if (p.fra < uke7) {
      feil.push(`Partner-periode starter ${p.fra}, men fedrekvote kan tidligst starte ${uke7} (uke 7)`)
    }
  })

  // Kontroller total uker
  const morUker = perioder
    .filter((p) => p.owner === 'meg' && !p.erPause)
    .reduce((s, p) => s + weeksBetween(p.fra, addDays(p.til, 1)), 0)
  const farUker = perioder
    .filter((p) => p.owner === 'partner' && !p.erPause)
    .reduce((s, p) => s + weeksBetween(p.fra, addDays(p.til, 1)), 0)
  const morMaks = tilgjengelig.mødrekvote + tilgjengelig.fellesperiode
  const farMaks = tilgjengelig.fedrekvote + tilgjengelig.fellesperiode

  if (morUker > morMaks + 0.5)
    feil.push(`Mor bruker ${Math.round(morUker)} uker, maks er ${morMaks} uker`)
  if (farUker > farMaks + 0.5)
    feil.push(`Partner bruker ${Math.round(farUker)} uker, maks er ${farMaks} uker`)

  // Advarsel: partner-uker i sommerferie
  if (input.partnerErLærer) {
    const fodselYear = new Date(fodsel).getFullYear()
    const sommerBlokker: FerieBlokk[] = [fodselYear, fodselYear + 1].map((y) => ({
      fra: `${y}-${input.partnerSommerFraManedDag}`,
      til: `${y}-${input.partnerSommerTilManedDag}`,
    }))
    let sommerUker = 0
    farPerioder.forEach((p) =>
      sommerBlokker.forEach((s) => { sommerUker += ukerOverlapMedFerie(p, s) })
    )
    if (sommerUker > 0.5) {
      advarsler.push(
        `${Math.round(sommerUker)} av partnerens permisjonsukene faller i sommerferie — partner er hjemme uansett. Vurder å flytte disse til skoleåret.`
      )
    }
  }

  // Advarsel: dekker ikke til barnehagestart
  const barnehageStart = beregnBarnehageStart(input.terminDato, input.fodselsDato)
  const alleSlutt = perioder.filter((p) => !p.erPause).map((p) => p.til)
  const sisteSlutt = alleSlutt.sort().at(-1)
  if (sisteSlutt && sisteSlutt < barnehageStart) {
    advarsler.push(
      `Permisjonen slutter ${sisteSlutt}, men barnehagestart er ${barnehageStart}. Det er et gap på ${Math.round(weeksBetween(sisteSlutt, barnehageStart))} uker uten verken permisjon eller barnehage.`
    )
  }

  return { ok: feil.length === 0, advarsler, feil }
}

// ── Oppsummering ──────────────────────────────────────────────────

export function beregnOppsummering(
  input: PermisjonInput,
  perioder: PermisjonPeriode[],
): PermisjonOppsummering {
  const tilgjengelig = beregnTilgjengeligeUker(input)
  const barnehageStart = beregnBarnehageStart(input.terminDato, input.fodselsDato)
  const fodsel = input.fodselsDato ?? input.terminDato

  const morPerioder = perioder.filter((p) => p.owner === 'meg' && !p.erPause)
  const farPerioder = perioder.filter((p) => p.owner === 'partner' && !p.erPause)

  const morUker = morPerioder.reduce((s, p) => s + weeksBetween(p.fra, addDays(p.til, 1)), 0)
  const farUker = farPerioder.reduce((s, p) => s + weeksBetween(p.fra, addDays(p.til, 1)), 0)

  const morMaks = tilgjengelig.mødrekvote + tilgjengelig.fellesperiode
  const farMaks = tilgjengelig.fedrekvote + tilgjengelig.fellesperiode

  const alleSlutt = [...morPerioder, ...farPerioder].map((p) => p.til).sort()
  const sisteSlutt = alleSlutt.at(-1) ?? null

  // Uker partner er i sommerferie
  const fodselYear = new Date(fodsel).getFullYear()
  const sommerBlokker: FerieBlokk[] = input.partnerErLærer
    ? [fodselYear, fodselYear + 1].map((y) => ({
        fra: `${y}-${input.partnerSommerFraManedDag}`,
        til: `${y}-${input.partnerSommerTilManedDag}`,
      }))
    : []

  let sommerUker = 0
  farPerioder.forEach((p) =>
    sommerBlokker.forEach((s) => { sommerUker += ukerOverlapMedFerie(p, s) })
  )

  return {
    barnehageStart,
    dekkerTilBarnehageStart: sisteSlutt !== null && sisteSlutt >= barnehageStart,
    sluttdatoMeg: morPerioder.map((p) => p.til).sort().at(-1) ?? null,
    sluttdatoPartner: farPerioder.map((p) => p.til).sort().at(-1) ?? null,
    ukerdBruktMeg: Math.round(morUker),
    ukerBruktPartner: Math.round(farUker),
    ukerIgjenMeg: Math.max(0, Math.round(morMaks - morUker)),
    ukerIgjenPartner: Math.max(0, Math.round(farMaks - farUker)),
    partnerUkerISommerFerie: Math.round(sommerUker * 10) / 10,
    validering: validerPlan(input, perioder),
  }
}
```

- [ ] **Steg 2: Fiks typo i genererStandardPlan** (acuellSommerSlutt → aktuellSommerSlutt):

Linje med `farStart = acuellSommerSlutt ...` skal leses av `aktuellSommerSlutt`. Slett den linjen med typo:
```typescript
    // Slett denne linjen:
    // farStart = acuellSommerSlutt > uke7EtterFodsel ? acuellSommerSlutt : uke7EtterFodsel
    // Korrekt linje er allerede der:
    farStart = aktuellSommerSlutt > uke7EtterFodsel ? aktuellSommerSlutt : uke7EtterFodsel
```

- [ ] **Steg 3: Bygg**

```bash
npm run build 2>&1 | grep -E "error TS|✓"
```
Forventet: `✓ built`

- [ ] **Steg 4: Commit**

```bash
git add src/domain/economy/foreldrepengerRules.ts
git commit -m "feat(permisjon): regel-engine for norsk foreldrepenger"
```

---

## Task 3: Zustand Store

**Files:**
- Create: `src/application/usePermisjonStore.ts`

- [ ] **Steg 1: Skriv store**

```typescript
// src/application/usePermisjonStore.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PermisjonInput, PermisjonPeriode, ChatMessage } from '@/types/permisjon'
import { genererStandardPlan } from '@/domain/economy/foreldrepengerRules'

const DEFAULT_INPUT: PermisjonInput = {
  terminDato: '',
  fodselsDato: undefined,
  dekningsgrad: 100,
  tvillinger: false,
  forTidligFodsel: false,
  mineFerieblokker: [],
  partnerErLærer: true,
  partnerFerieblokker: [],
  partnerSommerFraManedDag: '06-22',
  partnerSommerTilManedDag: '08-14',
}

interface PermisjonStoreState {
  input: PermisjonInput
  perioder: PermisjonPeriode[]
  chatHistory: ChatMessage[]

  setInput: (updates: Partial<PermisjonInput>) => void
  setPerioder: (perioder: PermisjonPeriode[]) => void
  genererPlan: () => void
  addChatMessage: (msg: ChatMessage) => void
  clearChat: () => void
  reset: () => void
}

export const usePermisjonStore = create<PermisjonStoreState>()(
  persist(
    (set, get) => ({
      input: DEFAULT_INPUT,
      perioder: [],
      chatHistory: [],

      setInput: (updates) =>
        set((s) => ({ input: { ...s.input, ...updates } })),

      setPerioder: (perioder) => set({ perioder }),

      genererPlan: () => {
        const { input } = get()
        if (!input.terminDato) return
        set({ perioder: genererStandardPlan(input) })
      },

      addChatMessage: (msg) =>
        set((s) => ({ chatHistory: [...s.chatHistory, msg] })),

      clearChat: () => set({ chatHistory: [] }),

      reset: () => set({ input: DEFAULT_INPUT, perioder: [], chatHistory: [] }),
    }),
    {
      name: 'lommeboka-permisjon-v1',
      version: 1,
    }
  )
)
```

- [ ] **Steg 2: Bygg**

```bash
npm run build 2>&1 | grep -E "error TS|✓"
```

- [ ] **Steg 3: Commit**

```bash
git add src/application/usePermisjonStore.ts
git commit -m "feat(permisjon): Zustand store for permisjonplanlegger"
```

---

## Task 4: Tidslinje-komponent

**Files:**
- Create: `src/components/economy/PermisjonTimeline.tsx`

- [ ] **Steg 1: Skriv tidslinje-komponent**

```typescript
// src/components/economy/PermisjonTimeline.tsx
import type { PermisjonPeriode, PermisjonInput, FerieBlokk } from '@/types/permisjon'
import { beregnBarnehageStart } from '@/domain/economy/foreldrepengerRules'

const PERIODE_FARGER: Record<string, string> = {
  mor_før_termin:    'bg-purple-600',
  mor_obligatorisk:  'bg-purple-800',
  mor_kvote:         'bg-purple-500',
  felles_mor:        'bg-indigo-500',
  felles_far:        'bg-blue-500',
  far_kvote:         'bg-blue-600',
  ferie_pause:       'bg-muted border border-border',
}

const PERIODE_LABEL: Record<string, string> = {
  mor_før_termin:   'Mor (før termin)',
  mor_obligatorisk: 'Mor (obligatorisk)',
  mor_kvote:        'Mor (kvote)',
  felles_mor:       'Felles (mor)',
  felles_far:       'Felles (far)',
  far_kvote:        'Partner (kvote)',
  ferie_pause:      'Ferie-pause',
}

function monthsBetween(a: string, b: string): number {
  const da = new Date(a), db = new Date(b)
  return (db.getFullYear() - da.getFullYear()) * 12 + (db.getMonth() - da.getMonth())
}

function pct(date: string, startDate: string, totalMonths: number): number {
  return (monthsBetween(startDate, date) / totalMonths) * 100
}

export function PermisjonTimeline({
  input,
  perioder,
}: {
  input: PermisjonInput
  perioder: PermisjonPeriode[]
}) {
  if (!input.terminDato || perioder.length === 0) return null

  const barnehageStart = beregnBarnehageStart(input.terminDato, input.fodselsDato)
  const fodsel = input.fodselsDato ?? input.terminDato

  // Tidslinje-span: 3 måneder før termin til 2 måneder etter barnehagestart
  const tStart = new Date(input.terminDato)
  tStart.setMonth(tStart.getMonth() - 3)
  const timelineStart = tStart.toISOString().split('T')[0]

  const tEnd = new Date(barnehageStart)
  tEnd.setMonth(tEnd.getMonth() + 2)
  const timelineEnd = tEnd.toISOString().split('T')[0]

  const totalMonths = monthsBetween(timelineStart, timelineEnd) || 1

  function posPct(date: string) {
    return Math.max(0, Math.min(100, pct(date, timelineStart, totalMonths)))
  }
  function widthPct(fra: string, til: string) {
    return Math.max(0.5, posPct(til) - posPct(fra))
  }

  // Måneds-tick labels
  const months: { label: string; left: number }[] = []
  const cur = new Date(timelineStart)
  cur.setDate(1)
  while (cur.toISOString().split('T')[0] < timelineEnd) {
    months.push({
      label: cur.toLocaleDateString('no-NO', { month: 'short', year: '2-digit' }),
      left: posPct(cur.toISOString().split('T')[0]),
    })
    cur.setMonth(cur.getMonth() + 1)
  }

  // Rader: meg og partner
  const morPerioder = perioder.filter((p) => p.owner === 'meg')
  const farPerioder = perioder.filter((p) => p.owner === 'partner')

  // Sommerferie-blokker
  const fodselYear = new Date(fodsel).getFullYear()
  const sommerBlokker: FerieBlokk[] = input.partnerErLærer
    ? [fodselYear, fodselYear + 1].map((y) => ({
        fra: `${y}-${input.partnerSommerFraManedDag}`,
        til: `${y}-${input.partnerSommerTilManedDag}`,
        label: 'Sommerferie',
      }))
    : []

  function renderPerioder(ps: PermisjonPeriode[], row: 'meg' | 'partner') {
    return ps.map((p) => {
      const l = posPct(p.fra)
      const w = widthPct(p.fra, p.til)
      const color = PERIODE_FARGER[p.type] ?? 'bg-muted'
      return (
        <div
          key={p.id}
          className={`absolute h-full ${color} rounded opacity-90 flex items-center justify-center overflow-hidden`}
          style={{ left: `${l}%`, width: `${w}%` }}
          title={`${PERIODE_LABEL[p.type] ?? p.type}: ${p.fra} → ${p.til}`}
        >
          <span className="text-[9px] text-white font-medium px-0.5 truncate hidden sm:block">
            {PERIODE_LABEL[p.type]}
          </span>
        </div>
      )
    })
  }

  return (
    <div className="space-y-3 select-none">
      {/* Måneds-akse */}
      <div className="relative h-5 text-[10px] text-muted-foreground">
        {months.map((m) => (
          <span
            key={m.label}
            className="absolute -translate-x-1/2"
            style={{ left: `${m.left}%` }}
          >
            {m.label}
          </span>
        ))}
      </div>

      {/* Rad: meg (mor) */}
      <div>
        <p className="text-[10px] text-purple-400 mb-1 font-medium">Meg</p>
        <div className="relative h-8 bg-muted/20 rounded overflow-hidden border border-border/30">
          {/* Ferie-blokker for meg */}
          {input.mineFerieblokker.map((f, i) => (
            <div
              key={i}
              className="absolute h-full bg-orange-500/15 border-l border-r border-orange-500/30"
              style={{ left: `${posPct(f.fra)}%`, width: `${widthPct(f.fra, f.til)}%` }}
              title={`Ferie: ${f.fra} → ${f.til}`}
            />
          ))}
          {renderPerioder(morPerioder, 'meg')}
        </div>
      </div>

      {/* Rad: partner */}
      <div>
        <p className="text-[10px] text-blue-400 mb-1 font-medium">Partner{input.partnerErLærer ? ' (lærer)' : ''}</p>
        <div className="relative h-8 bg-muted/20 rounded overflow-hidden border border-border/30">
          {/* Sommerferie-blokker for lærer */}
          {sommerBlokker.map((f, i) => (
            <div
              key={i}
              className="absolute h-full bg-yellow-500/15 border-l border-r border-yellow-500/30"
              style={{ left: `${posPct(f.fra)}%`, width: `${widthPct(f.fra, f.til)}%` }}
              title={`Sommerferie: ${f.fra} → ${f.til}`}
            />
          ))}
          {renderPerioder(farPerioder, 'partner')}
        </div>
      </div>

      {/* Markører */}
      <div className="relative h-4">
        {/* Termin */}
        <div
          className="absolute w-px h-4 bg-pink-500"
          style={{ left: `${posPct(input.terminDato)}%` }}
          title={`Termin: ${input.terminDato}`}
        />
        {/* Barnehagestart */}
        <div
          className="absolute w-px h-4 bg-green-500"
          style={{ left: `${posPct(barnehageStart)}%` }}
          title={`Barnehagestart: ${barnehageStart}`}
        />
        <span
          className="absolute text-[9px] text-green-400 -translate-x-1/2"
          style={{ left: `${posPct(barnehageStart)}%`, top: 0 }}
        >🎒</span>
      </div>

      {/* Forklaring */}
      <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
        {Object.entries(PERIODE_LABEL).map(([k, v]) => (
          <span key={k} className="flex items-center gap-1">
            <span className={`inline-block w-3 h-3 rounded-sm ${PERIODE_FARGER[k]}`} />
            {v}
          </span>
        ))}
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm bg-yellow-500/30 border border-yellow-500/30" />
          Sommerferie
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-px h-3 bg-pink-500" />
          Termin
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-px h-3 bg-green-500" />
          Barnehagestart
        </span>
      </div>
    </div>
  )
}
```

- [ ] **Steg 2: Bygg**

```bash
npm run build 2>&1 | grep -E "error TS|✓"
```

- [ ] **Steg 3: Commit**

```bash
git add src/components/economy/PermisjonTimeline.tsx
git commit -m "feat(permisjon): tidslinje-visualisering"
```

---

## Task 5: PermisjonPage

**Files:**
- Create: `src/pages/economy/PermisjonPage.tsx`

Siden har tre interne tabs: **Oppsett**, **Tidslinje**, **AI-rådgiver**.

- [ ] **Steg 1: Skriv PermisjonPage**

```typescript
// src/pages/economy/PermisjonPage.tsx
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertTriangle, CheckCircle, Baby, GraduationCap, RefreshCw } from 'lucide-react'
import { usePermisjonStore } from '@/application/usePermisjonStore'
import { beregnTilgjengeligeUker, beregnOppsummering, beregnBarnehageStart } from '@/domain/economy/foreldrepengerRules'
import { PermisjonTimeline } from '@/components/economy/PermisjonTimeline'
import { PermisjonAIChat } from '@/components/economy/PermisjonAIChat'
import type { FerieBlokk } from '@/types/permisjon'

type Tab = 'oppsett' | 'tidslinje' | 'ai'

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('no-NO', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function PermisjonPage() {
  const { input, perioder, setInput, genererPlan } = usePermisjonStore()
  const [tab, setTab] = useState<Tab>('oppsett')
  const [minFerieFra, setMinFerieFra] = useState('')
  const [minFerieTil, setMinFerieTil] = useState('')

  const tilgjengelig = input.terminDato ? beregnTilgjengeligeUker(input) : null
  const oppsummering = input.terminDato && perioder.length > 0
    ? beregnOppsummering(input, perioder)
    : null
  const barnehageStart = input.terminDato
    ? beregnBarnehageStart(input.terminDato, input.fodselsDato)
    : null

  function leggTilMinFerie() {
    if (!minFerieFra || !minFerieTil) return
    setInput({ mineFerieblokker: [...input.mineFerieblokker, { fra: minFerieFra, til: minFerieTil, label: 'Ferie' }] })
    setMinFerieFra(''); setMinFerieTil('')
  }

  function fjernMinFerie(i: number) {
    setInput({ mineFerieblokker: input.mineFerieblokker.filter((_, idx) => idx !== i) })
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Tab-bar */}
      <div className="flex gap-1 px-4 pt-3 border-b border-border shrink-0">
        {(['oppsett', 'tidslinje', 'ai'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-xs rounded-t font-medium transition-colors ${
              tab === t
                ? 'bg-background border border-b-background border-border text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'oppsett' ? 'Oppsett' : t === 'tidslinje' ? 'Tidslinje' : '🤖 AI-rådgiver'}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* ── OPPSETT ── */}
        {tab === 'oppsett' && (
          <div className="space-y-4 max-w-2xl">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Baby className="h-4 w-4" /> Graviditet & dekningsgrad
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Termindato</Label>
                    <Input type="date" className="h-8 text-xs"
                      value={input.terminDato}
                      onChange={(e) => setInput({ terminDato: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Fødselsdato (hvis allerede født)</Label>
                    <Input type="date" className="h-8 text-xs"
                      value={input.fodselsDato ?? ''}
                      onChange={(e) => setInput({ fodselsDato: e.target.value || undefined })} />
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <Label className="text-xs">Dekningsgrad</Label>
                  {([100, 80] as const).map((d) => (
                    <button
                      key={d}
                      onClick={() => setInput({ dekningsgrad: d })}
                      className={`px-3 py-1 rounded text-xs border transition-colors ${
                        input.dekningsgrad === d
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'border-border text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {d} %
                    </button>
                  ))}
                </div>
                <div className="flex gap-4 text-xs">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={input.tvillinger}
                      onChange={(e) => setInput({ tvillinger: e.target.checked })} />
                    Tvillinger (+{input.dekningsgrad === 100 ? 17 : 21} uker)
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={input.forTidligFodsel}
                      onChange={(e) => setInput({ forTidligFodsel: e.target.checked })} />
                    Født før uke 33
                  </label>
                </div>

                {tilgjengelig && (
                  <div className="rounded-md bg-muted/30 px-3 py-2 text-xs space-y-1">
                    <p className="font-medium text-foreground">Tilgjengelige uker ({input.dekningsgrad} %)</p>
                    <div className="grid grid-cols-3 gap-2 text-muted-foreground">
                      <span>Mødrekvote: <b className="text-purple-400">{tilgjengelig.mødrekvote} uker</b></span>
                      <span>Fedrekvote: <b className="text-blue-400">{tilgjengelig.fedrekvote} uker</b></span>
                      <span>Fellesperiode: <b className="text-indigo-400">{tilgjengelig.fellesperiode} uker</b></span>
                    </div>
                    <p className="text-muted-foreground">
                      Totalt: <b className="text-foreground">{tilgjengelig.total} uker</b>
                      {barnehageStart && (
                        <> · Barnehagestart: <b className="text-green-400">{fmtDate(barnehageStart)}</b></>
                      )}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <GraduationCap className="h-4 w-4" /> Partner
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={input.partnerErLærer}
                    onChange={(e) => setInput({ partnerErLærer: e.target.checked })} />
                  Partner er lærer / skoleansatt
                </label>
                {input.partnerErLærer && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Sommerferie fra (MM-DD)</Label>
                      <Input className="h-8 text-xs" placeholder="06-22"
                        value={input.partnerSommerFraManedDag}
                        onChange={(e) => setInput({ partnerSommerFraManedDag: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Sommerferie til (MM-DD)</Label>
                      <Input className="h-8 text-xs" placeholder="08-14"
                        value={input.partnerSommerTilManedDag}
                        onChange={(e) => setInput({ partnerSommerTilManedDag: e.target.value })} />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Mine ferieblokker (5 uker)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Legg inn planlagte ferieperioder. Disse kan brukes som pause fra foreldrepenger, slik at ukene forskyves.
                </p>
                {input.mineFerieblokker.map((f, i) => (
                  <div key={i} className="flex items-center justify-between text-xs rounded border border-border px-2 py-1">
                    <span>{f.fra} → {f.til}</span>
                    <button className="text-muted-foreground hover:text-red-400" onClick={() => fjernMinFerie(i)}>×</button>
                  </div>
                ))}
                <div className="flex gap-2 items-end flex-wrap">
                  <div className="space-y-0.5">
                    <Label className="text-xs">Fra</Label>
                    <Input type="date" className="h-7 text-xs w-36" value={minFerieFra} onChange={(e) => setMinFerieFra(e.target.value)} />
                  </div>
                  <div className="space-y-0.5">
                    <Label className="text-xs">Til</Label>
                    <Input type="date" className="h-7 text-xs w-36" value={minFerieTil} onChange={(e) => setMinFerieTil(e.target.value)} />
                  </div>
                  <Button size="sm" className="h-7 text-xs" onClick={leggTilMinFerie}>Legg til</Button>
                </div>
              </CardContent>
            </Card>

            {input.terminDato && (
              <Button className="gap-2" onClick={() => { genererPlan(); setTab('tidslinje') }}>
                <RefreshCw className="h-4 w-4" />
                {perioder.length === 0 ? 'Generer plan' : 'Regenerer plan'}
              </Button>
            )}
          </div>
        )}

        {/* ── TIDSLINJE ── */}
        {tab === 'tidslinje' && (
          <div className="space-y-4">
            {perioder.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground text-sm mb-3">Ingen plan ennå.</p>
                <Button onClick={() => setTab('oppsett')}>Gå til oppsett</Button>
              </div>
            ) : (
              <>
                <PermisjonTimeline input={input} perioder={perioder} />

                {oppsummering && (
                  <Card>
                    <CardContent className="pt-4 space-y-2 text-xs">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-muted-foreground mb-1 font-medium">Meg</p>
                          <p>Brukt: <b>{oppsummering.ukerdBruktMeg} uker</b></p>
                          <p>Igjen: <b className={oppsummering.ukerIgjenMeg > 0 ? 'text-amber-400' : 'text-green-400'}>{oppsummering.ukerIgjenMeg} uker</b></p>
                          {oppsummering.sluttdatoMeg && <p>Slutter: <b>{fmtDate(oppsummering.sluttdatoMeg)}</b></p>}
                        </div>
                        <div>
                          <p className="text-muted-foreground mb-1 font-medium">Partner</p>
                          <p>Brukt: <b>{oppsummering.ukerBruktPartner} uker</b></p>
                          <p>Igjen: <b className={oppsummering.ukerIgjenPartner > 0 ? 'text-amber-400' : 'text-green-400'}>{oppsummering.ukerIgjenPartner} uker</b></p>
                          {oppsummering.sluttdatoPartner && <p>Slutter: <b>{fmtDate(oppsummering.sluttdatoPartner)}</b></p>}
                          {oppsummering.partnerUkerISommerFerie > 0 && (
                            <p className="text-amber-400">⚠️ {oppsummering.partnerUkerISommerFerie} uker i sommerferie</p>
                          )}
                        </div>
                      </div>

                      <div className={`flex items-center gap-1.5 rounded px-2 py-1 ${
                        oppsummering.dekkerTilBarnehageStart ? 'bg-green-900/20 text-green-400' : 'bg-amber-900/20 text-amber-400'
                      }`}>
                        {oppsummering.dekkerTilBarnehageStart
                          ? <><CheckCircle className="h-3.5 w-3.5" /> Dekker til barnehagestart ({fmtDate(oppsummering.barnehageStart)})</>
                          : <><AlertTriangle className="h-3.5 w-3.5" /> Gap før barnehagestart ({fmtDate(oppsummering.barnehageStart)})</>
                        }
                      </div>

                      {oppsummering.validering.feil.map((f, i) => (
                        <p key={i} className="text-red-400 text-[11px] flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3 shrink-0" />{f}
                        </p>
                      ))}
                      {oppsummering.validering.advarsler.map((a, i) => (
                        <p key={i} className="text-amber-400 text-[11px] flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3 shrink-0" />{a}
                        </p>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </div>
        )}

        {/* ── AI-RÅDGIVER ── */}
        {tab === 'ai' && (
          <PermisjonAIChat input={input} perioder={perioder} oppsummering={oppsummering} />
        )}
      </div>
    </div>
  )
}
```

- [ ] **Steg 2: Bygg (vil feile pga manglende PermisjonAIChat — midlertidig stub)**

Opprett midlertidig stub:
```typescript
// src/components/economy/PermisjonAIChat.tsx (midlertidig stub)
export function PermisjonAIChat(_props: unknown) {
  return <div className="text-muted-foreground text-sm p-4">AI-chat kommer i neste task.</div>
}
```

```bash
npm run build 2>&1 | grep -E "error TS|✓"
```
Forventet: `✓ built`

- [ ] **Steg 3: Commit**

```bash
git add src/pages/economy/PermisjonPage.tsx src/components/economy/PermisjonAIChat.tsx
git commit -m "feat(permisjon): PermisjonPage med oppsett og tidslinje-tab (AI-stub)"
```

---

## Task 6: Supabase Edge Function for AI

**Files:**
- Create: `supabase/functions/permisjon-ai/index.ts`

Edge Function proxyer chat-meldinger til Anthropic API. System-prompten inneholder hele regelverket + brukerdata.

- [ ] **Steg 1: Opprett mappe**

```bash
mkdir -p supabase/functions/permisjon-ai
```

- [ ] **Steg 2: Skriv Edge Function**

```typescript
// supabase/functions/permisjon-ai/index.ts
import Anthropic from 'npm:@anthropic-ai/sdk'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SYSTEM_PROMPT = `Du er en norsk permisjonrådgiver som hjelper foreldre med å planlegge foreldrepermisjonen optimalt.

## Norsk regelverk (barn født etter 1. juli 2024)

**100 % dekningsgrad (49 uker totalt):**
- Mødrekvote: 15 uker (inkl. 3 uker obligatorisk FØR termin og 6 obligatoriske uker etter fødsel)
- Fedrekvote/medmorkvote: 15 uker (kan tas fra uke 7 etter fødsel)
- Fellesperiode: 16 uker (kan deles fritt; mor MÅ være i godkjent aktivitet om far tar fellesperioden)

**80 % dekningsgrad (61 uker + 1 dag totalt):**
- Mødrekvote: 19 uker
- Fedrekvote: 19 uker
- Fellesperiode: 20 uker + 1 dag

**Obligatoriske regler:**
- Mor SKAL starte permisjon senest 3 uker før termin
- Mor kan IKKE jobbe, ta ferie, eller gjøre annet de første 6 ukene etter fødsel
- Fedrekvote kan tidligst starte uke 7 etter fødsel
- All permisjon MÅ tas ut før barnet fyller 3 år
- Ubrukte dager i fellesperioden er TAPT hvis ikke tatt ut innen fristen

**Ferie og utsettelse:**
- Ferie kan "pause" foreldrepengeperioden (perioden forskyves tilsvarende — oppgis i NAV-søknaden ved å avslutte periode og starte ny etter ferien)
- For utsettelse første 6 ukene kreves legeattest for sykdom/innleggelse

**Tvillinger:** +17 uker (100 %) / +21 uker + 1 dag (80 %)
**For tidlig fødsel (< uke 33):** Perioden forlenges med like mange uker som barnet er født tidlig

**Barnehagestart:** 1. august i kalenderåret barnet fyller 1 år

**Viktig om lærere:**
- Lærere har sommerferie ca. 22. juni – 14. august (ca. 8 uker)
- Tar en lærer permisjon i sommerferie, "brukes" disse ukene i en periode der de allerede er hjemme
- Anbefalt strategi: legg lærerens permisjonsuker til SKOLEÅRET (august–juni), ikke sommeren
- Alternativt: bruk sommerferie som "ferie-pause" i NAV-søknaden (da forskyves ukene til etter ferien)
- Mor kan ta fellesperioden om sommeren så far kan spare sine uker til skoleåret
- Far trenger INGEN dokumentasjon på aktivitet fra mor for å ta FEDREKVOTEN — det er kun fellesperioden som krever at mor er i aktivitet

**Gradert uttak:**
- Kan kombinere deltidsjobb med foreldrepenger (f.eks. 80 % arbeid + 20 % foreldrepenger)
- Perioden forlenges tilsvarende

Svar alltid på norsk. Vær konkret med datoer og uker. Forklar regelverket enkelt. Gi optimaliseringsforslag tilpasset brukerens situasjon.`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { messages, userContext } = await req.json()

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY ikke satt i Supabase secrets' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const client = new Anthropic({ apiKey })

    // Bygg systemmelding med brukerkontext
    const systemWithContext = userContext
      ? `${SYSTEM_PROMPT}\n\n## Brukerens situasjon\n${userContext}`
      : SYSTEM_PROMPT

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemWithContext,
      messages,
    })

    return new Response(JSON.stringify({ content: response.content[0] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
```

- [ ] **Steg 3: Deploy Edge Function via Supabase MCP**

Bruk `mcp__claude_ai_Supabase__deploy_edge_function` med project_id `wtgycitlfbbmeivnexsu`, navn `permisjon-ai`, og innholdet fra filen over.

Alternativt via CLI:
```bash
npx supabase functions deploy permisjon-ai --project-ref wtgycitlfbbmeivnexsu
```

- [ ] **Steg 4: Sett ANTHROPIC_API_KEY som Supabase secret**

I Supabase Dashboard: Settings → Edge Functions → Secrets → legg til `ANTHROPIC_API_KEY`.

Eller via CLI:
```bash
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-... --project-ref wtgycitlfbbmeivnexsu
```

- [ ] **Steg 5: Commit**

```bash
git add supabase/functions/permisjon-ai/index.ts
git commit -m "feat(permisjon): Supabase Edge Function for AI-rådgiver (Claude)"
```

---

## Task 7: AI Chat-komponent

**Files:**
- Modify: `src/components/economy/PermisjonAIChat.tsx` (erstatt stub)

- [ ] **Steg 1: Skriv chat-komponent**

```typescript
// src/components/economy/PermisjonAIChat.tsx
import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Send, Bot, RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { usePermisjonStore } from '@/application/usePermisjonStore'
import type { PermisjonInput, PermisjonPeriode, PermisjonOppsummering, ChatMessage } from '@/types/permisjon'
import { beregnTilgjengeligeUker } from '@/domain/economy/foreldrepengerRules'

const FORSLAG = [
  'Hva er den optimale planen gitt termindato og at partner er lærer?',
  'Hvordan unngår vi gap mellom permisjon og barnehagestart?',
  'Kan partner ta fedrekvote i ferien uten å "kaste bort" ukene?',
  'Hva skjer om vi velger 80 % i stedet for 100 %?',
  'Forklar fellesperioden og aktivitetskravet til mor.',
  'Hva bør vi gjøre med mine 5 uker ferie?',
]

function buildUserContext(input: PermisjonInput, perioder: PermisjonPeriode[], oppsummering: PermisjonOppsummering | null): string {
  const tilgjengelig = input.terminDato ? beregnTilgjengeligeUker(input) : null
  const lines = [
    `Termindato: ${input.terminDato || 'ikke satt'}`,
    input.fodselsDato ? `Fødselsdato: ${input.fodselsDato}` : null,
    `Dekningsgrad: ${input.dekningsgrad} %`,
    input.tvillinger ? 'Tvillinger: ja' : null,
    input.forTidligFodsel ? 'Født for tidlig (< uke 33): ja' : null,
    `Partner er lærer: ${input.partnerErLærer ? 'ja' : 'nei'}`,
    input.partnerErLærer
      ? `Partner sommerferie: ${input.partnerSommerFraManedDag} – ${input.partnerSommerTilManedDag}`
      : null,
    input.mineFerieblokker.length > 0
      ? `Mine ferieblokker: ${input.mineFerieblokker.map((f) => `${f.fra}→${f.til}`).join(', ')}`
      : 'Ingen ferieblokker registrert',
    tilgjengelig
      ? `Tilgjengelige uker: mødrekvote=${tilgjengelig.mødrekvote}, fedrekvote=${tilgjengelig.fedrekvote}, felles=${tilgjengelig.fellesperiode}`
      : null,
    oppsummering
      ? [
          `Nåværende plan: meg slutter ${oppsummering.sluttdatoMeg ?? 'ukjent'}, partner slutter ${oppsummering.sluttdatoPartner ?? 'ukjent'}`,
          `Barnehagestart: ${oppsummering.barnehageStart}`,
          `Dekker til barnehagestart: ${oppsummering.dekkerTilBarnehageStart ? 'ja' : 'nei'}`,
          oppsummering.partnerUkerISommerFerie > 0
            ? `Partner har ${oppsummering.partnerUkerISommerFerie} uker permisjon i sommerferie`
            : null,
        ].filter(Boolean).join('\n')
      : 'Ingen plan generert ennå',
  ]
  return lines.filter(Boolean).join('\n')
}

export function PermisjonAIChat({
  input,
  perioder,
  oppsummering,
}: {
  input: PermisjonInput
  perioder: PermisjonPeriode[]
  oppsummering: PermisjonOppsummering | null
}) {
  const { chatHistory, addChatMessage, clearChat } = usePermisjonStore()
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatHistory, loading])

  async function send(content: string) {
    if (!content.trim() || loading) return
    setDraft('')
    setError(null)

    const userMsg: ChatMessage = { role: 'user', content, timestamp: new Date().toISOString() }
    addChatMessage(userMsg)
    setLoading(true)

    const userContext = buildUserContext(input, perioder, oppsummering)
    const messages = [...chatHistory, userMsg].map(({ role, content: c }) => ({ role, content: c }))

    try {
      const { data, error: fnError } = await supabase.functions.invoke('permisjon-ai', {
        body: { messages, userContext },
      })
      if (fnError) throw fnError
      const assistantContent = data?.content?.text ?? 'Ingen svar'
      addChatMessage({ role: 'assistant', content: assistantContent, timestamp: new Date().toISOString() })
    } catch (e) {
      setError(`Feil ved AI-kall: ${String(e)}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full min-h-[500px] space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-blue-400" />
          <span className="text-sm font-medium">AI-rådgiver</span>
        </div>
        {chatHistory.length > 0 && (
          <Button variant="ghost" size="sm" className="text-xs h-6 gap-1" onClick={clearChat}>
            <RefreshCw className="h-3 w-3" /> Ny samtale
          </Button>
        )}
      </div>

      {/* Hurtigspørsmål */}
      {chatHistory.length === 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Vanlige spørsmål:</p>
          <div className="flex flex-wrap gap-1.5">
            {FORSLAG.map((f) => (
              <button
                key={f}
                onClick={() => send(f)}
                className="text-xs px-2 py-1 rounded border border-border hover:bg-muted/40 transition-colors text-muted-foreground hover:text-foreground"
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Chat-meldinger */}
      <div className="flex-1 overflow-y-auto space-y-3 rounded-md border border-border p-3 bg-muted/10 min-h-40">
        {chatHistory.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">
            Still meg et spørsmål om permisjonplanlegging — jeg kjenner regelverket og situasjonen din.
          </p>
        )}
        {chatHistory.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] rounded-lg px-3 py-2 text-xs whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-foreground'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-lg px-3 py-2 text-xs text-muted-foreground animate-pulse">
              Tenker…
            </div>
          </div>
        )}
        {error && (
          <p className="text-xs text-red-400 text-center">{error}</p>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <input
          className="flex-1 h-9 rounded-md border border-border bg-background px-3 text-xs outline-none focus:border-primary"
          placeholder="Spør om permisjonplanlegging…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(draft) } }}
          disabled={loading}
        />
        <Button size="sm" className="h-9 px-3" onClick={() => send(draft)} disabled={!draft.trim() || loading}>
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Steg 2: Bygg**

```bash
npm run build 2>&1 | grep -E "error TS|✓"
```
Forventet: `✓ built`

- [ ] **Steg 3: Commit**

```bash
git add src/components/economy/PermisjonAIChat.tsx
git commit -m "feat(permisjon): AI chat-komponent via Supabase Edge Function"
```

---

## Task 8: Navigasjon og registrering

**Files:**
- Modify: `src/types/economy.ts:656-659`
- Modify: `src/store/useAppStore.ts:13`
- Modify: `src/pages/economy/EconomyPage.tsx`

- [ ] **Steg 1: Legg til 'permisjon' i EconomyTab**

I `src/types/economy.ts`, finn:
```typescript
export type EconomyTab =
  | 'dashboard' | 'budget' | 'salary' | 'atf' | 'feriepenger'
  | 'savings' | 'fond' | 'debt' | 'absence' | 'tax'
  | 'subscriptions' | 'ivf' | 'vacation' | 'settings' | 'veikart' | 'gaver' | 'partner'
```
Legg til `| 'permisjon'` i unionen.

- [ ] **Steg 2: Legg til 'permisjon' i EconomySubPage**

I `src/store/useAppStore.ts`, finn:
```typescript
export type EconomySubPage = 'dashboard' | 'budget' | 'salary' | ...
```
Legg til `'permisjon'` i unionen.

- [ ] **Steg 3: Legg til lazy import og route i EconomyPage.tsx**

Etter de andre lazy-importene:
```typescript
const PermisjonPage = lazy(() =>
  import('./PermisjonPage').then((m) => ({ default: m.PermisjonPage }))
)
```

I tab-lista og route-switchen, legg til permisjon som ny tab med ikon 👶:
```typescript
// Tab-config (der de andre tabsene er definert):
{ key: 'permisjon', label: 'Permisjon', icon: '👶' }

// Route-switch:
{currentPage === 'permisjon' && <PermisjonPage />}
```

- [ ] **Steg 4: Legg til i migreringen i useEconomyStore**

Finn `version`-feltet i useEconomyStore og bumpe det til neste versjon (f.eks. 14). Legg til `'permisjon'` i `enabledTabs` om det ikke allerede finnes i migrate-logikken.

I `migrate`-funksjonen, legg til:
```typescript
if (!state.enabledTabs.includes('permisjon')) {
  state.enabledTabs.push('permisjon')
}
```

- [ ] **Steg 5: Bygg og verifiser**

```bash
npm run build 2>&1 | grep -E "error TS|✓"
```
Forventet: `✓ built`

- [ ] **Steg 6: Commit og push**

```bash
git add src/types/economy.ts src/store/useAppStore.ts src/pages/economy/EconomyPage.tsx src/application/useEconomyStore.ts
git commit -m "feat(permisjon): registrer permisjon-fane i navigasjon og store"
git push
```

---

## Spec-sjekk

- [x] Ny fane "Permisjon" i navigasjonen → Task 8
- [x] Norske foreldrepengerregler (100 %/80 %, kvoter, obligatoriske uker, fedrekvote uke 7+) → Task 2
- [x] Partner er lærer → sommerferie-aware optimalisering → Tasks 2, 5
- [x] 5 uker ferie for bruker → ferieblokk-input, pause-støtte → Task 5 (oppsett)
- [x] Barnehagestart beregnes og valideres → Tasks 2, 5
- [x] AI-agent onsite med full regelkunnskap → Tasks 6, 7
- [x] Tidslinje-visualisering → Task 4
- [x] Oppsummering med advarsler → Tasks 2, 5
- [x] Tvillinger og for tidlig fødsel → Task 2
- [x] Chat lagres i store (persistent) → Task 3

## Manuelt steg (ikke i koden)

Etter deploy: gå til Supabase Dashboard → Edge Functions → Secrets → legg til `ANTHROPIC_API_KEY=sk-ant-...`
