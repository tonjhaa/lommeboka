# Gaveplanlegger: faktisk kjøp + historikk — Implementeringsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La brukerne registrere faktisk kjøpt gave (pris, brukt/ny, delt kjøp, sammenslått med en annen mottakers gave) og se avvik/historikk på Oversikt-fanen i Gaveplanlegger, med automatisk (dato-basert) arkivering av kjøpte/droppede hendelser slik at neste års bursdag/jul kan genereres på nytt uten datatap.

**Architecture:** Arkivering beregnes rent fra dato ved hver render (`isEventArchived`) — ingen lagret arkiv-flagg, ingen bakgrunnsjobb. `deriveAutoEvents` filtrerer bort arkiverte lagrede hendelser når den avgjør om en ny auto-hendelse skal genereres. Sammenslåtte gaver er to vanlige `GiftEvent`-rader der den sekundære peker på den primære via `linkedEventId`; kostberegninger hopper over rader med `linkedEventId` satt. Alle nye felt på `GiftEvent` er valgfrie tillegg — ingen migrering, ingen versjonsheving i `useGiftStore`.

**Tech Stack:** React 19 + TypeScript (strict), Zustand (`useGiftStore`, ingen endring i persist-versjon), Vitest (`environment: 'node'`).

---

## Fasit fra spec

Spec: `docs/superpowers/specs/2026-09-15-gaveplanlegger-faktisk-kjop-historikk-design.md` (godkjent av bruker).

- Faktisk kjøpt pris finnes allerede (`actualAmount`) — nytt er `boughtUsed`, delt-kjøp-notat/-totalpris, sammenslåing via `linkedEventId`.
- Kun brukerens egen andel (feltet `actualAmount`) telles i sparepuls/avvik ved delt kjøp med utenforstående — `sharedPurchaseNote`/`sharedPurchaseTotal` er ren informasjon.
- Sammenslåtte gaver = **to rader** (Option B), ikke én rad med flere mottakere. Én rad er «primær» (teller kostnad), den andre er sekundær og peker på primæren via `linkedEventId`.
- Arkivering er automatisk og dato-styrt: jul-hendelser arkiveres 1. januar året etter; bursdag-hendelser arkiveres 3 måneder etter bursdagsdatoen. Gjelder uansett status (også `planlagt`/`droppet`).
- Arkivering fjerner IKKE data — den er beregnet på lesetidspunktet (`isEventArchived`), så historikk forblir redigerbar.
- Alt skal vises på **Oversikt**-fanen: avvik (per mottaker) + historikk-liste.

## File Structure

- `src/types/gifts.ts` — legg til 4 valgfrie felt på `GiftEvent`; fjern ubrukt `GiftPurchase`.
- `src/domain/gifts/giftCalculator.ts` — ny `isEventArchived`; `deriveAutoEvents` blir arkiv-bevisst + jul får explisitt `year`; `calculateActualVsPlanned` får per-mottaker-oppsplitting og hopper over sammenslåtte rader.
- `src/domain/gifts/__tests__/giftCalculator.test.ts` — **ny fil**, tester for alt over.
- `src/pages/economy/GiftPage.tsx` — `EventModal` får nye felt (brukt/delt kjøp/sammenslåing); `OverviewTab` får «marker som kjøpt»-flyt via modal, «Faktisk vs. planlagt» og «Historikk»; `RecipientsTab` får samme «marker som kjøpt»-flyt; `SavingsPlanTab` mister det gamle avvik-blokka (flyttet til Oversikt) og filtrerer arkiverte hendelser fra `allEffectiveEvents`.

---

### Task 1: Datamodell — nye felt på `GiftEvent`, fjern ubrukt `GiftPurchase`

**Files:**
- Modify: `src/types/gifts.ts:41-55` (GiftEvent), `src/types/gifts.ts:107-114` (GiftPurchase)

- [ ] **Step 1: Legg til feltene**

I `src/types/gifts.ts`, erstatt:

```ts
export interface GiftEvent {
  id: string
  recipientId: string
  occasion: Occasion
  date?: string             // "YYYY-MM-DD"
  month?: number            // 1–12, brukt hvis ingen dato
  year?: number
  ownership: Ownership      // kan overstyre mottakerens eierskap
  calculatedAmount: number
  manualAmount?: number     // manuell overstyring
  isLocked: boolean         // låste beløp ekskluderes fra normalisering
  status: EventStatus
  actualAmount?: number
  notes?: string
}
```

med:

```ts
export interface GiftEvent {
  id: string
  recipientId: string
  occasion: Occasion
  date?: string             // "YYYY-MM-DD"
  month?: number            // 1–12, brukt hvis ingen dato
  year?: number
  ownership: Ownership      // kan overstyre mottakerens eierskap
  calculatedAmount: number
  manualAmount?: number     // manuell overstyring
  isLocked: boolean         // låste beløp ekskluderes fra normalisering
  status: EventStatus
  actualAmount?: number
  notes?: string
  boughtUsed?: boolean          // kjøpt brukt/secondhand
  sharedPurchaseNote?: string   // info: kjøpt sammen med folk utenfor appen
  sharedPurchaseTotal?: number  // info: totalpris for det delte kjøpet (kun til info — actualAmount er brukerens andel)
  linkedEventId?: string        // peker på en annen GiftEvent (samme gave, delt på to mottakere) — kostnaden telles kun på den andre
}
```

- [ ] **Step 2: Fjern `GiftPurchase`**

Bekreft først at typen er ubrukt utenfor denne filen:

```bash
grep -rn "GiftPurchase" src/
```

Forventet: kun treffet i `src/types/gifts.ts` selv. Fjern deretter interfacet helt fra slutten av filen:

```ts
export interface GiftPurchase {
  id: string
  giftEventId: string
  plannedAmount: number
  actualAmount: number
  purchasedDate: string
  notes?: string
}
```

- [ ] **Step 3: Bygg for å bekrefte ingen brukssteder brytes**

Run: `npm run build`
Expected: ingen feil.

- [ ] **Step 4: Commit**

```bash
git add src/types/gifts.ts
git commit -m "$(cat <<'EOF'
Gaveplanlegger: legg til felt for brukt/delt kjøp/sammenslåing på GiftEvent

Fjerner samtidig GiftPurchase, som var ubrukt i hele kodebasen.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ub5qZzBFP2bdPt9GdtbYzV
EOF
)"
```

---

### Task 2: `isEventArchived` — beregnet arkivering

**Files:**
- Modify: `src/domain/gifts/giftCalculator.ts` (ny funksjon, sett inn før `deriveAutoEvents`, dvs. rett etter linje 336 / før kommentaren på linje 338)
- Create: `src/domain/gifts/__tests__/giftCalculator.test.ts`

- [ ] **Step 1: Skriv failende tester**

Create `src/domain/gifts/__tests__/giftCalculator.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { isEventArchived } from '../giftCalculator'
import type { GiftEvent } from '@/types/gifts'

describe('isEventArchived', () => {
  it('bursdag: ikke arkivert rett før 3-månedersgrensen', () => {
    const event: GiftEvent = {
      id: '1', recipientId: 'r1', occasion: 'bursdag', date: '2026-06-01',
      ownership: 'felles', calculatedAmount: 500, isLocked: false, status: 'kjøpt',
    }
    expect(isEventArchived(event, new Date('2026-08-31'))).toBe(false)
  })

  it('bursdag: arkivert rett etter 3-månedersgrensen', () => {
    const event: GiftEvent = {
      id: '1', recipientId: 'r1', occasion: 'bursdag', date: '2026-06-01',
      ownership: 'felles', calculatedAmount: 500, isLocked: false, status: 'kjøpt',
    }
    expect(isEventArchived(event, new Date('2026-09-02'))).toBe(true)
  })

  it('bursdag: arkiveres uansett status (også planlagt/droppet)', () => {
    const event: GiftEvent = {
      id: '1', recipientId: 'r1', occasion: 'bursdag', date: '2026-06-01',
      ownership: 'felles', calculatedAmount: 500, isLocked: false, status: 'planlagt',
    }
    expect(isEventArchived(event, new Date('2026-09-02'))).toBe(true)
  })

  it('jul: ikke arkivert i desember samme år', () => {
    const event: GiftEvent = {
      id: '1', recipientId: 'r1', occasion: 'jul', month: 12, year: 2026,
      ownership: 'felles', calculatedAmount: 500, isLocked: false, status: 'kjøpt',
    }
    expect(isEventArchived(event, new Date('2026-12-24'))).toBe(false)
  })

  it('jul: arkivert 1. januar året etter', () => {
    const event: GiftEvent = {
      id: '1', recipientId: 'r1', occasion: 'jul', month: 12, year: 2026,
      ownership: 'felles', calculatedAmount: 500, isLocked: false, status: 'kjøpt',
    }
    expect(isEventArchived(event, new Date('2027-01-01'))).toBe(true)
  })

  it('jul uten explisitt year faller tilbake på dagens år', () => {
    const event: GiftEvent = {
      id: '1', recipientId: 'r1', occasion: 'jul', month: 12,
      ownership: 'felles', calculatedAmount: 500, isLocked: false, status: 'planlagt',
    }
    expect(isEventArchived(event, new Date('2026-06-01'))).toBe(false)
  })

  it('andre anledninger arkiveres ikke automatisk', () => {
    const event: GiftEvent = {
      id: '1', recipientId: 'r1', occasion: 'bryllup', date: '2020-01-01',
      ownership: 'felles', calculatedAmount: 500, isLocked: false, status: 'kjøpt',
    }
    expect(isEventArchived(event, new Date('2026-06-01'))).toBe(false)
  })

  it('bursdag uten dato arkiveres aldri automatisk', () => {
    const event: GiftEvent = {
      id: '1', recipientId: 'r1', occasion: 'bursdag',
      ownership: 'felles', calculatedAmount: 500, isLocked: false, status: 'kjøpt',
    }
    expect(isEventArchived(event, new Date('2030-01-01'))).toBe(false)
  })
})
```

- [ ] **Step 2: Kjør testene og bekreft at de feiler**

Run: `npm test -- giftCalculator`
Expected: FAIL — `isEventArchived is not a function` / import error, siden funksjonen ikke finnes ennå.

- [ ] **Step 3: Implementer**

I `src/domain/gifts/giftCalculator.ts`, sett inn følgende **rett før** kommentaren `/** Utleder auto-genererte gavehendelser ... */` (linje 338 i dagens fil, over `deriveAutoEvents`):

```ts
// ── Arkivering ──────────────────────────────────────────────────

/**
 * Avgjør om en hendelse er "arkivert" — dvs. hører til et tidligere år og
 * ikke lenger skal telle som den aktive hendelsen for mottaker+anledning.
 * Beregnet fra dato, ikke lagret som flagg — historikk forblir redigerbar.
 * Gjelder kun bursdag og jul; andre anledninger arkiveres ikke automatisk.
 */
export function isEventArchived(event: GiftEvent, today: Date = new Date()): boolean {
  if (event.occasion === 'jul') {
    const y = event.year ?? today.getFullYear()
    return today >= new Date(y + 1, 0, 1)
  }
  if (event.occasion === 'bursdag' && event.date) {
    const d = new Date(event.date)
    d.setMonth(d.getMonth() + 3)
    return today >= d
  }
  return false
}
```

- [ ] **Step 4: Kjør testene og bekreft at de passerer**

Run: `npm test -- giftCalculator`
Expected: PASS (8 tester).

- [ ] **Step 5: Commit**

```bash
git add src/domain/gifts/giftCalculator.ts src/domain/gifts/__tests__/giftCalculator.test.ts
git commit -m "$(cat <<'EOF'
Gaveplanlegger: legg til isEventArchived for dato-basert arkivering

Arkivstatus beregnes fra dato ved lesing (ikke lagret flagg), slik at
historikk forblir redigerbar og migreringsrisikoen ved en "flytt til
arkiv"-jobb unngås.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ub5qZzBFP2bdPt9GdtbYzV
EOF
)"
```

---

### Task 3: `deriveAutoEvents` — arkiv-bevisst regenerering + explisitt jul-år

**Files:**
- Modify: `src/domain/gifts/giftCalculator.ts:344-391`
- Modify: `src/domain/gifts/__tests__/giftCalculator.test.ts` (append)

**Problem:** `manualKeys` i dagens kode nøkler kun på `recipientId-occasion` (uten år) — så snart én hendelse er lagret for en mottaker+anledning, blokkeres auto-generering for alltid, selv når hendelsen er fra i fjor og allerede kjøpt/arkivert.

- [ ] **Step 1: Skriv failende tester**

Append til `src/domain/gifts/__tests__/giftCalculator.test.ts`:

```ts
import { deriveAutoEvents } from '../giftCalculator'
import { DEFAULT_WEIGHT_RULES, DEFAULT_GIFT_SETTINGS } from '@/domain/gifts/defaultWeights'
import type { GiftRecipient } from '@/types/gifts'
import { vi, beforeEach, afterEach } from 'vitest'

describe('deriveAutoEvents — årlig gjenbruk etter arkivering', () => {
  const recipient: GiftRecipient = {
    id: 'r1', name: 'Per', relationshipType: 'venn', lifePhase: 'voksen',
    ownership: 'felles', receivesBirthdayGift: true, receivesChristmasGift: false,
    birthDate: '1990-06-01',
  }

  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('genererer ikke ny bursdagshendelse når det finnes en aktiv lagret en', () => {
    vi.setSystemTime(new Date('2026-08-01')) // før 3-månedersgrensen for 2026-06-01
    const stored: GiftEvent = {
      id: 's1', recipientId: 'r1', occasion: 'bursdag', date: '2026-06-01',
      ownership: 'felles', calculatedAmount: 500, isLocked: false, status: 'kjøpt',
    }
    const auto = deriveAutoEvents([recipient], [stored], DEFAULT_WEIGHT_RULES, DEFAULT_GIFT_SETTINGS)
    expect(auto).toHaveLength(0)
  })

  it('genererer en fersk bursdagshendelse når den lagrede har blitt arkivert', () => {
    vi.setSystemTime(new Date('2026-09-05')) // etter 3-månedersgrensen for 2026-06-01
    const stored: GiftEvent = {
      id: 's1', recipientId: 'r1', occasion: 'bursdag', date: '2026-06-01',
      ownership: 'felles', calculatedAmount: 500, isLocked: false, status: 'kjøpt',
    }
    const auto = deriveAutoEvents([recipient], [stored], DEFAULT_WEIGHT_RULES, DEFAULT_GIFT_SETTINGS)
    expect(auto).toHaveLength(1)
    expect(auto[0].date).toBe('2027-06-01')
  })

  it('jul-auto-hendelser får explisitt year satt til inneværende år', () => {
    vi.setSystemTime(new Date('2026-03-01'))
    const julRecipient: GiftRecipient = { ...recipient, receivesBirthdayGift: false, receivesChristmasGift: true }
    const auto = deriveAutoEvents([julRecipient], [], DEFAULT_WEIGHT_RULES, DEFAULT_GIFT_SETTINGS)
    expect(auto).toHaveLength(1)
    expect(auto[0].year).toBe(2026)
  })
})
```

- [ ] **Step 2: Kjør testene og bekreft at de feiler**

Run: `npm test -- giftCalculator`
Expected: FAIL — «genererer en fersk bursdagshendelse ...» feiler (`auto` er tom fordi `manualKeys` blokkerer uansett arkivstatus), og «jul-auto-hendelser får explisitt year ...» feiler (`auto[0].year` er `undefined`).

- [ ] **Step 3: Implementer**

I `src/domain/gifts/giftCalculator.ts`, erstatt `deriveAutoEvents` (linje 344-391) med:

```ts
export function deriveAutoEvents(
  recipients: GiftRecipient[],
  storedEvents: GiftEvent[],
  weightRules: WeightRules,
  settings: GiftSettings,
): GiftEvent[] {
  const today = new Date()
  const activeKeys = new Set(
    storedEvents
      .filter((e) => !isEventArchived(e, today))
      .map((e) => `${e.recipientId}-${e.occasion}`)
  )
  const auto: GiftEvent[] = []
  const currentYear = today.getFullYear()

  for (const r of recipients) {
    if (r.receivesBirthdayGift && r.birthDate && !activeKeys.has(`${r.id}-bursdag`)) {
      const [, mo, day] = r.birthDate.split('-').map(Number)
      const thisYearDate = new Date(currentYear, mo - 1, day)
      const bYear = thisYearDate < today ? currentYear + 1 : currentYear
      const date = `${bYear}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const event: GiftEvent = {
        id: `auto-bursdag-${r.id}`,
        recipientId: r.id,
        occasion: 'bursdag',
        date,
        ownership: r.ownership,
        calculatedAmount: 0,
        isLocked: false,
        status: 'planlagt',
      }
      const raw = calculateGiftAmount(event, r, weightRules)
      auto.push({ ...event, calculatedAmount: roundGiftAmount(raw, settings.roundingNearest) })
    }

    if (r.receivesChristmasGift && !activeKeys.has(`${r.id}-jul`)) {
      const event: GiftEvent = {
        id: `auto-jul-${r.id}`,
        recipientId: r.id,
        occasion: 'jul',
        month: 12,
        year: currentYear,
        ownership: r.ownership,
        calculatedAmount: 0,
        isLocked: false,
        status: 'planlagt',
      }
      const raw = calculateGiftAmount(event, r, weightRules)
      auto.push({ ...event, calculatedAmount: roundGiftAmount(raw, settings.roundingNearest) })
    }
  }
  return auto
}
```

- [ ] **Step 4: Kjør testene og bekreft at de passerer**

Run: `npm test -- giftCalculator`
Expected: PASS (11 tester totalt).

- [ ] **Step 5: Commit**

```bash
git add src/domain/gifts/giftCalculator.ts src/domain/gifts/__tests__/giftCalculator.test.ts
git commit -m "$(cat <<'EOF'
Gaveplanlegger: deriveAutoEvents regenererer etter arkivering

manualKeys nøklet kun på mottaker+anledning uten år, så en kjøpt fjorårs-
hendelse blokkerte auto-generering for alltid. Filtrerer nå på
isEventArchived, og jul-auto-hendelser får explisitt year for at
arkiveringssjekken skal ha noe å regne fra.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ub5qZzBFP2bdPt9GdtbYzV
EOF
)"
```

---

### Task 4: `calculateActualVsPlanned` — per mottaker + hopp over sammenslåtte rader

**Files:**
- Modify: `src/domain/gifts/giftCalculator.ts:393-403`
- Modify: `src/domain/gifts/__tests__/giftCalculator.test.ts` (append)

- [ ] **Step 1: Skriv failende tester**

Append til `src/domain/gifts/__tests__/giftCalculator.test.ts`:

```ts
import { calculateActualVsPlanned } from '../giftCalculator'

describe('calculateActualVsPlanned', () => {
  it('grupperer avvik per mottaker', () => {
    const events: GiftEvent[] = [
      { id: 'a', recipientId: 'r1', occasion: 'bursdag', ownership: 'felles', calculatedAmount: 500, isLocked: false, status: 'kjøpt', actualAmount: 600 },
      { id: 'b', recipientId: 'r2', occasion: 'jul', ownership: 'felles', calculatedAmount: 300, isLocked: false, status: 'kjøpt', actualAmount: 250 },
    ]
    const result = calculateActualVsPlanned(events)
    expect(result.planned).toBe(800)
    expect(result.actual).toBe(850)
    expect(result.deviation).toBe(50)
    expect(result.byRecipient).toEqual(
      expect.arrayContaining([
        { recipientId: 'r1', planned: 500, actual: 600, deviation: 100 },
        { recipientId: 'r2', planned: 300, actual: 250, deviation: -50 },
      ])
    )
  })

  it('hopper over sekundære rader i en sammenslått gave (linkedEventId satt)', () => {
    const events: GiftEvent[] = [
      { id: 'primary', recipientId: 'r1', occasion: 'bursdag', ownership: 'felles', calculatedAmount: 500, isLocked: false, status: 'kjøpt', actualAmount: 500 },
      { id: 'secondary', recipientId: 'r2', occasion: 'bursdag', ownership: 'felles', calculatedAmount: 0, isLocked: false, status: 'kjøpt', actualAmount: 0, linkedEventId: 'primary' },
    ]
    const result = calculateActualVsPlanned(events)
    expect(result.planned).toBe(500)
    expect(result.actual).toBe(500)
    expect(result.byRecipient).toEqual([{ recipientId: 'r1', planned: 500, actual: 500, deviation: 0 }])
  })
})
```

- [ ] **Step 2: Kjør testene og bekreft at de feiler**

Run: `npm test -- giftCalculator`
Expected: FAIL — `result.byRecipient` er `undefined` (feltet finnes ikke i dagens returtype).

- [ ] **Step 3: Implementer**

I `src/domain/gifts/giftCalculator.ts`, erstatt `calculateActualVsPlanned` (linje 393-403) med:

```ts
/** Beregner faktisk vs planlagt avvik, totalt og per mottaker. Sammenslåtte gaver (linkedEventId satt) telles kun på primærraden. */
export function calculateActualVsPlanned(events: GiftEvent[]): {
  planned: number
  actual: number
  deviation: number
  byRecipient: { recipientId: string; planned: number; actual: number; deviation: number }[]
} {
  const purchased = events.filter((e) => e.status === 'kjøpt' && !e.linkedEventId)
  const planned = purchased.reduce((s, e) => s + (e.manualAmount ?? e.calculatedAmount), 0)
  const actual = purchased.reduce((s, e) => s + (e.actualAmount ?? 0), 0)

  const byRecipientMap = new Map<string, { planned: number; actual: number }>()
  for (const e of purchased) {
    const cur = byRecipientMap.get(e.recipientId) ?? { planned: 0, actual: 0 }
    cur.planned += e.manualAmount ?? e.calculatedAmount
    cur.actual += e.actualAmount ?? 0
    byRecipientMap.set(e.recipientId, cur)
  }
  const byRecipient = Array.from(byRecipientMap.entries()).map(([recipientId, v]) => ({
    recipientId,
    planned: v.planned,
    actual: v.actual,
    deviation: v.actual - v.planned,
  }))

  return { planned, actual, deviation: actual - planned, byRecipient }
}
```

- [ ] **Step 4: Kjør testene og bekreft at de passerer**

Run: `npm test -- giftCalculator`
Expected: PASS (13 tester totalt).

- [ ] **Step 5: Commit**

```bash
git add src/domain/gifts/giftCalculator.ts src/domain/gifts/__tests__/giftCalculator.test.ts
git commit -m "$(cat <<'EOF'
Gaveplanlegger: calculateActualVsPlanned gir avvik per mottaker

Hopper også over sekundære rader i en sammenslått gave (linkedEventId
satt) slik at kostnaden ikke telles dobbelt.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ub5qZzBFP2bdPt9GdtbYzV
EOF
)"
```

---

### Task 5: `EventModal` — felt for brukt/delt kjøp/sammenslåing

**Files:**
- Modify: `src/pages/economy/GiftPage.tsx:1038-1250` (`EventModal`)
- Modify: `src/pages/economy/GiftPage.tsx:21-24` (import fra giftCalculator)

Denne komponenten er allerede den eneste add/edit-dialogen for `GiftEvent` (kun 2 brukssteder i dag: linje 445 og 841). Vi gjenbruker den — ingen ny modal.

- [ ] **Step 1: Utvid import**

I `src/pages/economy/GiftPage.tsx`, erstatt (linje 21-24):

```ts
import {
  calculateGiftAmount, calculateGiftResult, calculateActualVsPlanned,
  giftAmountExplanation, roundGiftAmount, deriveAutoEvents,
} from '@/domain/gifts/giftCalculator'
```

med:

```ts
import {
  calculateGiftAmount, calculateGiftResult, calculateActualVsPlanned,
  giftAmountExplanation, roundGiftAmount, deriveAutoEvents, isEventArchived,
} from '@/domain/gifts/giftCalculator'
```

- [ ] **Step 2: Utvid props-signaturen**

Erstatt funksjonssignaturen (linje 1038-1050):

```ts
function EventModal({
  open, initial, defaultRecipientId, defaultOccasion, recipients, settings, weightRules, onSave, onClose,
}: {
  open: boolean
  initial?: GiftEvent
  defaultRecipientId?: string
  defaultOccasion?: Occasion
  recipients: GiftRecipient[]
  settings: ReturnType<typeof useGiftStore.getState>['settings']
  weightRules: ReturnType<typeof useGiftStore.getState>['weightRules']
  onSave: (ev: GiftEvent) => void
  onClose: () => void
}) {
```

med:

```ts
function EventModal({
  open, initial, defaultRecipientId, defaultOccasion, recipients, settings, weightRules,
  linkableEvents = [], onSave, onClose,
}: {
  open: boolean
  initial?: GiftEvent
  defaultRecipientId?: string
  defaultOccasion?: Occasion
  recipients: GiftRecipient[]
  settings: ReturnType<typeof useGiftStore.getState>['settings']
  weightRules: ReturnType<typeof useGiftStore.getState>['weightRules']
  linkableEvents?: GiftEvent[]
  onSave: (ev: GiftEvent) => void
  onClose: () => void
}) {
```

- [ ] **Step 3: Legg til state**

Etter linjen `const [notes, setNotes] = useState(initial?.notes ?? '')` (linje 1061), sett inn:

```ts
  const [boughtUsed, setBoughtUsed] = useState(initial?.boughtUsed ?? false)
  const [sharedPurchaseNote, setSharedPurchaseNote] = useState(initial?.sharedPurchaseNote ?? '')
  const [sharedPurchaseTotal, setSharedPurchaseTotal] = useState(initial?.sharedPurchaseTotal != null ? String(initial.sharedPurchaseTotal) : '')
  const [linkedEventId, setLinkedEventId] = useState(initial?.linkedEventId ?? '')
```

- [ ] **Step 4: Nullstill state ved åpning**

I `useEffect`-blokken, etter `setNotes(initial?.notes ?? '')` (linje 1073), sett inn:

```ts
    setBoughtUsed(initial?.boughtUsed ?? false)
    setSharedPurchaseNote(initial?.sharedPurchaseNote ?? '')
    setSharedPurchaseTotal(initial?.sharedPurchaseTotal != null ? String(initial.sharedPurchaseTotal) : '')
    setLinkedEventId(initial?.linkedEventId ?? '')
```

- [ ] **Step 5: Ta med feltene i `handleSave`**

I `handleSave`, etter `notes: notes.trim() || undefined,` (linje 1103, inni `ev`-objektet), sett inn:

```ts
      boughtUsed: boughtUsed || undefined,
      sharedPurchaseNote: sharedPurchaseNote.trim() || undefined,
      sharedPurchaseTotal: sharedPurchaseTotal ? parseFloat(sharedPurchaseTotal) : undefined,
      linkedEventId: linkedEventId || undefined,
```

- [ ] **Step 6: Legg til UI-felt**

Sett inn følgende blokk **etter** den lukkende `</div>` for Status/Faktisk-beløp-gridet (linje 1231) og **før** `<label className="flex items-center gap-2 text-xs cursor-pointer">` (Lås beløp, linje 1233):

```tsx
          {status === 'kjøpt' && (
            <div className="space-y-2 rounded border border-border/30 bg-muted/5 px-3 py-2.5">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <Switch checked={boughtUsed} onCheckedChange={setBoughtUsed} />
                Kjøpt brukt
              </label>
              <div className="space-y-1">
                <Label className="text-xs">Delt kjøp med andre (valgfritt)</Label>
                <Input
                  value={sharedPurchaseNote}
                  onChange={(e) => setSharedPurchaseNote(e.target.value)}
                  placeholder="F.eks. «Delt med Kari og Ola»"
                  className="h-8 text-xs"
                />
              </div>
              {sharedPurchaseNote && (
                <div className="space-y-1">
                  <Label className="text-xs">Total pris for det delte kjøpet</Label>
                  <Input
                    type="number"
                    value={sharedPurchaseTotal}
                    onChange={(e) => setSharedPurchaseTotal(e.target.value)}
                    placeholder="Kun til info — faktisk beløp over er din andel"
                    className="h-8 text-xs"
                  />
                  <p className="text-xs text-muted-foreground/70">Kun din andel (Faktisk beløp) telles i sparepulsen.</p>
                </div>
              )}
              {linkableEvents.length > 0 && (
                <div className="space-y-1">
                  <Label className="text-xs">Slå sammen med en annen gave (valgfritt)</Label>
                  <Select value={linkedEventId || '_none'} onValueChange={(v) => setLinkedEventId(v === '_none' ? '' : v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none" className="text-xs">— Ingen —</SelectItem>
                      {linkableEvents.map((le) => {
                        const leRecipient = recipients.find((r) => r.id === le.recipientId)
                        return (
                          <SelectItem key={le.id} value={le.id} className="text-xs">
                            {leRecipient?.name ?? '—'} · {OCCASION_LABELS[le.occasion]}
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground/70">
                    Kostnaden telles kun på den valgte gaven — denne blir en informasjonsrad.
                  </p>
                </div>
              )}
            </div>
          )}
```

- [ ] **Step 7: Bygg**

Run: `npm run build`
Expected: ingen feil. (`isEventArchived` er importert men ennå ubrukt i denne fila — det er greit, den brukes i Task 6/7/8; TypeScript flagger ikke ubrukte importer fra en modul som brukes for andre navn i samme import-setning, kun helt ubrukte enkeltnavn ville vært et `noUnusedLocals`-problem — bekreftes i Step 8 om nødvendig.)

- [ ] **Step 8: Commit**

```bash
git add src/pages/economy/GiftPage.tsx
git commit -m "$(cat <<'EOF'
Gaveplanlegger: EventModal støtter brukt/delt kjøp/sammenslåing

Gjenbruker den eksisterende add/edit-dialogen i stedet for å bygge en ny
modal — samme mønster brukes til "marker som kjøpt" i neste steg.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ub5qZzBFP2bdPt9GdtbYzV
EOF
)"
```

---

### Task 6: `OverviewTab` — «marker som kjøpt» via modal, avvik per mottaker, historikk

**Files:**
- Modify: `src/pages/economy/GiftPage.tsx:94-458` (`OverviewTab`)

- [ ] **Step 1: Filtrer arkiverte lagrede hendelser ut av `effectiveEvents`, legg til `historyEvents`**

Erstatt (linje 108):

```ts
  const effectiveEvents = useMemo(() => [...events, ...autoEvents], [events, autoEvents])
```

med:

```ts
  const activeStoredEvents = useMemo(() => events.filter((e) => !isEventArchived(e)), [events])
  const historyEvents = useMemo(
    () => events.filter((e) => isEventArchived(e)).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')),
    [events]
  )
  const effectiveEvents = useMemo(() => [...activeStoredEvents, ...autoEvents], [activeStoredEvents, autoEvents])
```

- [ ] **Step 2: Legg til state for «marker som kjøpt» og «rediger historikk»**

Etter linjen `const [prefill, setPrefill] = useState<{ recipientId: string; occasion: Occasion } | null>(null)` (linje 101), sett inn:

```ts
  const [markBoughtTarget, setMarkBoughtTarget] = useState<GiftEvent | null>(null)
  const [editingHistoryEvent, setEditingHistoryEvent] = useState<GiftEvent | null>(null)
```

- [ ] **Step 3: Gjør `promoteOrUpdate` åpne modalen for `kjøpt`**

Erstatt (linje 326-333):

```ts
              function promoteOrUpdate(newStatus: import('@/types/gifts').EventStatus) {
                const stored = events.find((se) => se.recipientId === e.recipientId && se.occasion === e.occasion)
                if (stored) {
                  updateEvent(stored.id, { status: newStatus })
                } else {
                  addEvent({ ...e, id: crypto.randomUUID(), status: newStatus })
                }
              }
```

med:

```ts
              function promoteOrUpdate(newStatus: import('@/types/gifts').EventStatus) {
                const stored = events.find((se) => se.recipientId === e.recipientId && se.occasion === e.occasion)
                if (newStatus === 'kjøpt') {
                  setMarkBoughtTarget(stored ?? { ...e, id: '' })
                  return
                }
                if (stored) {
                  updateEvent(stored.id, { status: newStatus })
                } else {
                  addEvent({ ...e, id: crypto.randomUUID(), status: newStatus })
                }
              }
```

- [ ] **Step 4: Legg til «Faktisk vs. planlagt» og «Historikk»-seksjonene**

Sett inn følgende **etter** «Kostnadsdrivere»-blokkens lukkende `})()}` (linje 441) og **før** `{/* EventModal for suggestions */}` (linje 443):

```tsx
      {/* Faktisk vs. planlagt */}
      {(() => {
        const avp = calculateActualVsPlanned(events)
        if (avp.planned === 0) return null
        return (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Faktisk vs. planlagt (kjøpte gaver)</p>
            <div className="rounded border border-border bg-muted/10 px-3 py-2.5 text-xs space-y-2">
              <div className="flex gap-6">
                <div>
                  <p className="text-muted-foreground">Planlagt</p>
                  <p className="font-mono">{fmtNOK(avp.planned)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Faktisk</p>
                  <p className="font-mono">{fmtNOK(avp.actual)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Avvik</p>
                  <p className={cn('font-mono', avp.deviation > 0 ? 'text-red-400' : 'text-green-400')}>
                    {avp.deviation > 0 ? '+' : ''}{fmtNOK(avp.deviation)}
                  </p>
                </div>
              </div>
              {avp.byRecipient.length > 1 && (
                <div className="space-y-1 border-t border-border/30 pt-2">
                  {avp.byRecipient.map((row) => {
                    const rec = recipientMap.get(row.recipientId)
                    return (
                      <div key={row.recipientId} className="flex items-center justify-between text-muted-foreground">
                        <span>{rec?.name ?? '—'}</span>
                        <span className={cn('font-mono', row.deviation > 0 ? 'text-red-400' : row.deviation < 0 ? 'text-green-400' : '')}>
                          {fmtNOK(row.actual)} <span className="opacity-50">({row.deviation > 0 ? '+' : ''}{fmtNOK(row.deviation)})</span>
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {/* Historikk */}
      {historyEvents.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Historikk</p>
          <div className="space-y-1.5">
            {historyEvents.map((ev) => {
              const rec = recipientMap.get(ev.recipientId)
              const amount = ev.manualAmount ?? ev.calculatedAmount
              return (
                <button
                  key={ev.id}
                  onClick={() => setEditingHistoryEvent(ev)}
                  className={cn(
                    'w-full flex items-center justify-between rounded border px-3 py-2 text-xs text-left transition-colors hover:border-border',
                    ev.status === 'kjøpt' ? 'border-green-500/20 bg-green-500/5' :
                    ev.status === 'droppet' ? 'border-border/20 bg-muted/5 opacity-60' :
                    'border-border/40 bg-muted/10'
                  )}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{rec?.name ?? '—'}</span>
                      <span className="text-muted-foreground">{OCCASION_LABELS[ev.occasion]}</span>
                      {ev.status === 'kjøpt' && <span className="text-green-400">✓</span>}
                      {ev.status === 'droppet' && <span className="text-muted-foreground/50">✕</span>}
                      {ev.boughtUsed && <span className="text-muted-foreground/50">· brukt</span>}
                      {ev.linkedEventId && <span className="text-muted-foreground/50">· slått sammen</span>}
                    </div>
                    <p className="text-muted-foreground mt-0.5">
                      {ev.date ? new Date(ev.date).toLocaleDateString('no-NO', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                    </p>
                  </div>
                  <span className="font-mono font-medium shrink-0 ml-3">{fmtNOK(ev.actualAmount ?? amount)}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
```

- [ ] **Step 5: Render modalene for «marker som kjøpt» og «rediger historikk»**

Sett inn følgende **etter** den eksisterende «EventModal for suggestions»-blokken (etter linje 455, `)}`) og **før** den avsluttende `</div>` på linje 456:

```tsx
      {/* Marker som kjøpt */}
      {markBoughtTarget && (
        <EventModal
          open
          initial={{ ...markBoughtTarget, status: 'kjøpt' }}
          recipients={recipients}
          settings={settings}
          weightRules={weightRules}
          linkableEvents={events.filter((se) => se.id !== markBoughtTarget.id && !isEventArchived(se) && se.status !== 'droppet')}
          onSave={(ev) => {
            if (ev.id) {
              updateEvent(ev.id, ev)
            } else {
              addEvent({ ...ev, id: crypto.randomUUID() })
            }
            setMarkBoughtTarget(null)
          }}
          onClose={() => setMarkBoughtTarget(null)}
        />
      )}

      {/* Rediger historikk */}
      {editingHistoryEvent && (
        <EventModal
          open
          initial={editingHistoryEvent}
          recipients={recipients}
          settings={settings}
          weightRules={weightRules}
          linkableEvents={events.filter((se) => se.id !== editingHistoryEvent.id && se.status !== 'droppet')}
          onSave={(ev) => { updateEvent(ev.id, ev); setEditingHistoryEvent(null) }}
          onClose={() => setEditingHistoryEvent(null)}
        />
      )}
```

- [ ] **Step 6: Bygg**

Run: `npm run build`
Expected: ingen feil.

- [ ] **Step 7: Commit**

```bash
git add src/pages/economy/GiftPage.tsx
git commit -m "$(cat <<'EOF'
Gaveplanlegger: Oversikt får marker-som-kjøpt-modal, avvik og historikk

"Marker som kjøpt" åpner nå EventModal (pris/brukt/delt kjøp/sammenslåing)
i stedet for å flippe status direkte. Arkiverte hendelser vises i en egen
redigerbar Historikk-liste og holdes utenfor effectiveEvents slik at neste
års bursdag/jul kan foreslås på nytt.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ub5qZzBFP2bdPt9GdtbYzV
EOF
)"
```

---

### Task 7: `RecipientsTab` — samme «marker som kjøpt»-flyt

**Files:**
- Modify: `src/pages/economy/GiftPage.tsx:509-853` (`RecipientsTab`)

- [ ] **Step 1: Legg til state**

Etter linjen `const [specialEventKey, setSpecialEventKey] = useState(0)` (linje 535), sett inn:

```ts
  const [markBoughtTarget, setMarkBoughtTarget] = useState<GiftEvent | null>(null)
```

- [ ] **Step 2: Gjør `promoteEvent` åpne modalen for `kjøpt`**

Erstatt (linje 542-549):

```ts
  function promoteEvent(autoEvent: import('@/types/gifts').GiftEvent, status: import('@/types/gifts').EventStatus) {
    const stored = events.find((e) => e.recipientId === autoEvent.recipientId && e.occasion === autoEvent.occasion)
    if (stored) {
      updateEvent(stored.id, { status })
    } else {
      addEvent({ ...autoEvent, id: crypto.randomUUID(), status })
    }
  }
```

med:

```ts
  function promoteEvent(autoEvent: import('@/types/gifts').GiftEvent, status: import('@/types/gifts').EventStatus) {
    const stored = events.find((e) => e.recipientId === autoEvent.recipientId && e.occasion === autoEvent.occasion)
    if (status === 'kjøpt') {
      setMarkBoughtTarget(stored ?? { ...autoEvent, id: '' })
      return
    }
    if (stored) {
      updateEvent(stored.id, { status })
    } else {
      addEvent({ ...autoEvent, id: crypto.randomUUID(), status })
    }
  }
```

- [ ] **Step 3: Render modalen**

Sett inn følgende **etter** den eksisterende «EventModal for spesielle hendelser»-blokken (etter linje 850, `/>`) og **før** den avsluttende `</div>` på linje 851:

```tsx
      {/* Marker som kjøpt */}
      {markBoughtTarget && (
        <EventModal
          open
          initial={{ ...markBoughtTarget, status: 'kjøpt' }}
          recipients={recipients}
          settings={settings}
          weightRules={weightRules}
          linkableEvents={events.filter((e) => e.id !== markBoughtTarget.id && e.status !== 'droppet' && !isEventArchived(e))}
          onSave={(ev) => {
            if (ev.id) {
              updateEvent(ev.id, ev)
            } else {
              addEvent({ ...ev, id: crypto.randomUUID() })
            }
            setMarkBoughtTarget(null)
          }}
          onClose={() => setMarkBoughtTarget(null)}
        />
      )}
```

- [ ] **Step 4: Bygg**

Run: `npm run build`
Expected: ingen feil.

- [ ] **Step 5: Commit**

```bash
git add src/pages/economy/GiftPage.tsx
git commit -m "$(cat <<'EOF'
Gaveplanlegger: Mottakere-fanens "Kjøpt"-knapp åpner samme kjøpsmodal

Samme mønster som Oversikt-fanen — "Kjøpt" åpner EventModal i stedet for
å flippe status direkte, så pris/brukt/delt kjøp/sammenslåing kan
registreres uansett hvor man markerer en gave som kjøpt.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ub5qZzBFP2bdPt9GdtbYzV
EOF
)"
```

---

### Task 8: `SavingsPlanTab` — fjern gammel avvik-blokk, filtrer arkiverte hendelser

**Files:**
- Modify: `src/pages/economy/GiftPage.tsx:1434-1588` (`SavingsPlanTab`)

- [ ] **Step 1: Filtrer arkiverte lagrede hendelser fra `allEffectiveEvents`**

Erstatt (linje 1443-1446):

```ts
  const allEffectiveEvents = useMemo(
    () => [...events, ...deriveAutoEvents(recipients, events, weightRules, settings)],
    [events, recipients, weightRules, settings]
  )
```

med:

```ts
  const allEffectiveEvents = useMemo(
    () => [
      ...events.filter((e) => !isEventArchived(e)),
      ...deriveAutoEvents(recipients, events, weightRules, settings),
    ],
    [events, recipients, weightRules, settings]
  )
```

- [ ] **Step 2: Fjern den gamle Avvik-blokken**

Fjern hele blokken (linje 1560-1585, inkludert `{/* Avvik */}`-kommentaren):

```tsx
      {/* Avvik */}
      {(() => {
        const avp = calculateActualVsPlanned(events)
        if (avp.planned === 0) return null
        return (
          <div className="rounded border border-border bg-muted/10 px-3 py-2.5 text-xs">
            <p className="font-semibold mb-1">Faktisk vs planlagt (kjøpte gaver)</p>
            <div className="flex gap-6">
              <div>
                <p className="text-muted-foreground">Planlagt</p>
                <p className="font-mono">{fmtNOK(avp.planned)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Faktisk</p>
                <p className="font-mono">{fmtNOK(avp.actual)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Avvik</p>
                <p className={cn('font-mono', avp.deviation > 0 ? 'text-red-400' : 'text-green-400')}>
                  {avp.deviation > 0 ? '+' : ''}{fmtNOK(avp.deviation)}
                </p>
              </div>
            </div>
          </div>
        )
      })()}
```

Denne funksjonaliteten er nå flyttet (og utvidet med per-mottaker-oppsplitting) til `OverviewTab` i Task 6.

- [ ] **Step 3: Bygg**

Run: `npm run build`
Expected: ingen feil. (`calculateActualVsPlanned` er fortsatt brukt i `OverviewTab`, så importen på toppen av filen forblir gyldig.)

- [ ] **Step 4: Commit**

```bash
git add src/pages/economy/GiftPage.tsx
git commit -m "$(cat <<'EOF'
Gaveplanlegger: fjern avvik-blokk fra Spareplan (flyttet til Oversikt)

Spareplan filtrerer nå også bort arkiverte lagrede hendelser fra
allEffectiveEvents, samme mønster som Oversikt-fanen, slik at
måneds-/sparepuls-beregningene ikke dobbeltteller en fjorårs kjøpt
hendelse og dens nygenererte oppfølger samtidig.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ub5qZzBFP2bdPt9GdtbYzV
EOF
)"
```

---

### Task 9: Full verifikasjon

**Files:** ingen nye — kun kjøring/manuell test.

- [ ] **Step 1: Full typecheck (per prosjektregel — `tsc --noEmit` er IKKE nok med dette composite-oppsettet)**

Run: `npm run build`
Expected: ingen feil, ingen `noUnusedLocals`/`noUnusedParameters`-varsler.

- [ ] **Step 2: Kjør hele testsuiten**

Run: `npm test`
Expected: alle eksisterende tester + de 13 nye i `giftCalculator.test.ts` passerer, ingen regresjon.

- [ ] **Step 3: Bekreft at ingen andre steder i kodebasen leser `events` rått for "aktive" hendelser uten arkiv-filter**

Run: `grep -n "deriveAutoEvents\|calculateGiftResult\|calculateMonthlyBreakdown" src/pages/economy/GiftPage.tsx`
Expected: kun de brukerstedene som allerede er dekket i Task 6/8 (`OverviewTab`, `SavingsPlanTab`) og `RecipientsTab`s `allEvs` for enkeltmottaker-panelet (linje 757-762) — sistnevnte er allerede korrekt fordi `deriveAutoEvents` selv er arkiv-bevisst etter Task 3, og `storedEvs` der kun brukes til å slå opp status/dato for visning i personpanelet (ikke til kostberegning), så ingen endring er nødvendig der.

- [ ] **Step 4: Manuell test i nettleser**

Start dev-server (`npm run dev`), gå til Livet → Prosjekt → Gaveplanlegger → Oversikt:

1. Finn en «Kommende hendelse», klikk ✓ («Merk som kjøpt») → bekreft at `EventModal` åpnes med status forhåndsvalgt til «Kjøpt», ikke at status flipper direkte.
2. Fyll ut Faktisk beløp, skru på «Kjøpt brukt», skriv noe i «Delt kjøp med andre», bekreft at «Total pris for det delte kjøpet» dukker opp, lagre.
3. Bekreft at hendelsen forsvinner fra «Kommende hendelser» og at «Faktisk vs. planlagt» øverst på Oversikt viser riktig sum.
4. Gjør det samme fra Mottakere-fanens person-panel («Kjøpt»-knappen) og bekreft samme modal-flyt.
5. Åpne `EventModal` på nytt for en «kjøpt»-hendelse med minst to mottakere med kjøpte gaver, bekreft at «Slå sammen med en annen gave» viser en nedtrekksliste, velg en, lagre, og bekreft at «Faktisk vs. planlagt» ikke dobbeltteller (kun primærraden bidrar til summen).
6. Merk: siden arkivering er dato-styrt (3 mnd etter bursdag / 1. januar etter jul), kan «Historikk»-seksjonen og regenerering av neste års hendelse ikke enkelt fremtvinges manuelt i produksjonsdata på riktig dato uten å vente — dette er allerede fullt dekket av de automatiserte testene i Task 2-3 (`vi.setSystemTime`). Den manuelle testen her dekker kun UI-flyten for å registrere et kjøp, ikke selve arkiveringsovergangen.

- [ ] **Step 5: Commit (kun hvis Step 1-4 avdekket rettelser)**

Hvis alt passerte uten endringer, er det ingenting å committe i dette steget — Task 1-8 er allerede committet hver for seg.

---

## Self-Review (utført under skriving av denne planen)

**Spekk-dekning:**
- Faktisk kjøpt pris/brukt/delt kjøp/sammenslåing på `GiftEvent` → Task 1, 5.
- Kun brukerens andel telles (delt kjøp med utenforstående) → `sharedPurchaseTotal`/`sharedPurchaseNote` er rene infofelt, kun `actualAmount` går inn i `calculateActualVsPlanned` → Task 1, 4, 5.
- Sammenslåtte gaver = to rader, `linkedEventId`, redigerbar → Task 1 (felt), 4 (kost-logikk), 5 (UI-velger), 6/7 (linkableEvents beregnes fra faktiske andre hendelser).
- Automatisk dato-styrt arkivering, uansett status → Task 2 (`isEventArchived`).
- Arkivering fjerner ikke data / historikk redigerbar → Task 6 (`editingHistoryEvent` åpner samme `EventModal` for arkiverte rader).
- Neste års hendelse genereres på nytt etter arkivering → Task 3 (`deriveAutoEvents`).
- Alt på Oversikt-fanen → Task 6 plasserer både avvik og historikk der; Task 8 fjerner duplikatet fra Spareplan.

**Placeholder-skann:** ingen «TBD»/«legg til passende feilhåndtering»/uferdige kodeblokker funnet — hvert steg viser fullstendig kode eller en konkret, kopierbar kommando.

**Typekonsistens:** `GiftEvent`-feltene (`boughtUsed`, `sharedPurchaseNote`, `sharedPurchaseTotal`, `linkedEventId`) fra Task 1 brukes med identiske navn i Task 4 (kost-logikk), Task 5 (modal-state), Task 6/7 (historikk-visning). `EventModal`s nye prop `linkableEvents?: GiftEvent[]` (Task 5) har samme navn og type ved begge kallsteder (Task 6, 7). `isEventArchived(event, today?)` (Task 2) brukes med samme signatur i Task 3, 6, 7, 8.

## Execution Handoff

Plan skrevet til `docs/superpowers/plans/2026-09-15-gaveplanlegger-faktisk-kjop-historikk.md`. To alternativer for utførelse:

**1. Subagent-Driven (anbefalt)** — jeg starter en fersk subagent per oppgave, med gjennomgang mellom hver, for rask iterasjon.

**2. Inline Execution** — jeg utfører oppgavene i denne sesjonen med executing-plans, batch-utførelse med sjekkpunkter for gjennomgang.

Hvilken vil du?
