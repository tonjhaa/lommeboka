# Nøkkeltall-register Implementeringsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bygg et runtime-register for G-dynamiske/årlige nøkkeltall der defaults bor i kode, brukeren kan overstyre med år-versjonert historikk i Innstillinger, alt er sky-synket, og alle lesere henter via én resolver — uten å endre dagens oppførsel (tom override ≡ kode-konstant).

**Architecture:** Ren `keyFigureRegistry.ts` med katalog (key→meta) + `resolveKeyFigure(key, overrides, year)`. Lesende kalkulatorer tar verdien som parameter med default = dagens konstant (bakoverkompatibelt). Hooks injiserer resolvert verdi via `useKeyFigures`. Overrides i `useEconomyStore` (sky-synket). v1 wirer G, delingstall, pensjonssatser, feriepengesats, egenmelding; BSU + skattetrinn vises read-only.

**Tech Stack:** React 19 + TypeScript (strict), Zustand, Vitest, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-06-21-nokkeltall-register-design.md`
**Branch:** `feat/nokkeltall-register`

**Konvensjoner:**
- TypeScript-sjekk: **`npm run typecheck`** (= `tsc -b`). `npx tsc --noEmit` fanger IKKE `noUnusedLocals`.
- Tester: `npm test`; spesifikk: `npm test -- <navn>`.
- Conventional commits. Avslutt hver melding med blank linje + `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

**Verifiserte lesersteder (per konstant):**
- `GRUNNBELOP_NOK`: `pensionCalculator.ts:221` (i `buildPensionInputFromProfile`).
- `getDelingstall`/`DELINGSTALL_BASELINE`: `pensionCalculator.ts:172` (i `projectPension`).
- pensjonssatser (`FOLKETRYGD_OPPTJENINGSSATS`, `SPK_PAASLAG_SATS_LAV/HOY`, `AFP_OPPTJENINGSSATS`, `TAK_FOLKETRYGD_G`, `TAK_SPK_G`): kun i `pensionCalculator.ts` (accrue-funksjoner).
- `FERIEPENGER_PROSENT`/`FERIEDAGER_TREKK`/`FERIETREKK_DIVISOR`: `salaryCalculator.ts:390-391`, `holidayPayCalculator.ts:123,137-138`.
- `EGENMELDING_KVOTE`: `absenceCalculator.ts:310,314,318`, `AbsencePage.tsx` (display).
- **BSU_MAX_* (30+ sites) og taxRules: IKKE wired i v1** — vises read-only i registeret.

---

### Task 1: Typer + registry-katalog + resolver

**Files:**
- Modify: `src/types/economy.ts` (legg til typer i enden)
- Create: `src/domain/economy/keyFigureRegistry.ts`
- Test: `src/domain/economy/__tests__/keyFigureRegistry.test.ts`

- [ ] **Step 1: Legg til typer**

Legg til nederst i `src/types/economy.ts`:

```ts
// ------------------------------------------------------------
// NØKKELTALL-REGISTER
// ------------------------------------------------------------

export type KeyFigureKey =
  | 'grunnbelop' | 'feriepengerProsent' | 'egenmeldingKvote'
  | 'folketrygdOpptjeningssats' | 'spkPaaslagLav' | 'spkPaaslagHoy' | 'afpOpptjeningssats'
  | 'takFolketrygdG' | 'takSpkG'
  | 'delingstall'
  // vises read-only i v1 (wires senere)
  | 'bsuMaxYearly' | 'bsuMaxTotal' | 'taxRules'

export type KeyFigureKind = 'scalar' | 'table'

export interface KeyFigureMeta {
  key: KeyFigureKey
  label: string
  group: 'pensjon' | 'sparing' | 'feriepenger' | 'fravaer' | 'skatt'
  unit: 'kr' | 'pst' | 'G' | 'antall' | 'tabell'
  kind: KeyFigureKind
  editable: boolean          // false = vises read-only i v1
  sourceUrl: string
  defaultVerifiedAt: string  // "YYYY-MM-DD"
}

export interface KeyFigureOverride {
  key: KeyFigureKey
  year: number               // gjelder fra dette året
  value: number | Record<number, number>  // scalar = number; table = blob
  verifiedAt: string         // "YYYY-MM-DD"
  source?: string
}
```

- [ ] **Step 2: Skriv failing test (konsistens-invariant + resolver)**

Create `src/domain/economy/__tests__/keyFigureRegistry.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { resolveScalar, KEY_FIGURE_META, isStale } from '../keyFigureRegistry'
import {
  GRUNNBELOP_NOK, FERIEPENGER_PROSENT, EGENMELDING_KVOTE,
  FOLKETRYGD_OPPTJENINGSSATS, AFP_OPPTJENINGSSATS, TAK_FOLKETRYGD_G,
} from '@/config/economy.config'
import type { KeyFigureOverride } from '@/types/economy'

describe('resolveScalar — konsistens-invariant (tom override ≡ kode-konstant)', () => {
  it('grunnbelop', () => { expect(resolveScalar('grunnbelop', [], 2026)).toBe(GRUNNBELOP_NOK) })
  it('feriepengerProsent', () => { expect(resolveScalar('feriepengerProsent', [], 2026)).toBe(FERIEPENGER_PROSENT) })
  it('egenmeldingKvote', () => { expect(resolveScalar('egenmeldingKvote', [], 2026)).toBe(EGENMELDING_KVOTE) })
  it('folketrygdOpptjeningssats', () => { expect(resolveScalar('folketrygdOpptjeningssats', [], 2026)).toBe(FOLKETRYGD_OPPTJENINGSSATS) })
  it('afpOpptjeningssats', () => { expect(resolveScalar('afpOpptjeningssats', [], 2026)).toBe(AFP_OPPTJENINGSSATS) })
  it('takFolketrygdG', () => { expect(resolveScalar('takFolketrygdG', [], 2026)).toBe(TAK_FOLKETRYGD_G) })
})

describe('resolveScalar — overrides', () => {
  const ov: KeyFigureOverride[] = [
    { key: 'grunnbelop', year: 2026, value: 140_000, verifiedAt: '2026-05-01' },
    { key: 'grunnbelop', year: 2025, value: 130_160, verifiedAt: '2025-05-01' },
  ]
  it('velger nyeste override med year <= forespurt år', () => {
    expect(resolveScalar('grunnbelop', ov, 2026)).toBe(140_000)
    expect(resolveScalar('grunnbelop', ov, 2025)).toBe(130_160)
  })
  it('faller tilbake på kode-default for år før alle overrides', () => {
    expect(resolveScalar('grunnbelop', ov, 2020)).toBe(GRUNNBELOP_NOK)
  })
})

describe('KEY_FIGURE_META', () => {
  it('grunnbelop er editerbar skalar med kilde', () => {
    expect(KEY_FIGURE_META.grunnbelop.editable).toBe(true)
    expect(KEY_FIGURE_META.grunnbelop.kind).toBe('scalar')
    expect(KEY_FIGURE_META.grunnbelop.sourceUrl).toContain('nav.no')
  })
  it('bsuMaxTotal og taxRules er read-only i v1', () => {
    expect(KEY_FIGURE_META.bsuMaxTotal.editable).toBe(false)
    expect(KEY_FIGURE_META.taxRules.editable).toBe(false)
  })
})

describe('isStale', () => {
  it('utdatert når ingen override i år og default eldre enn 12 mnd', () => {
    expect(isStale('grunnbelop', [], new Date('2099-01-01'))).toBe(true)
  })
  it('ikke utdatert når override for inneværende år finnes', () => {
    const ov: KeyFigureOverride[] = [{ key: 'grunnbelop', year: 2026, value: 140_000, verifiedAt: '2026-05-01' }]
    expect(isStale('grunnbelop', ov, new Date('2026-06-01'))).toBe(false)
  })
})
```

- [ ] **Step 3: Kjør — verifiser feil**

Run: `npm test -- keyFigureRegistry`
Expected: FAIL (modul finnes ikke).

- [ ] **Step 4: Implementer registry**

Create `src/domain/economy/keyFigureRegistry.ts`:

```ts
// ============================================================
// NØKKELTALL-REGISTER — defaults i kode, override-overlay, ren resolver
// Tom override ⇒ resolver returnerer eksakt dagens kode-konstant.
// ============================================================

import type { KeyFigureKey, KeyFigureMeta, KeyFigureOverride } from '@/types/economy'
import {
  GRUNNBELOP_NOK, FERIEPENGER_PROSENT, EGENMELDING_KVOTE,
  FOLKETRYGD_OPPTJENINGSSATS, SPK_PAASLAG_SATS_LAV, SPK_PAASLAG_SATS_HOY,
  AFP_OPPTJENINGSSATS, TAK_FOLKETRYGD_G, TAK_SPK_G,
  BSU_MAX_YEARLY, BSU_MAX_TOTAL, DELINGSTALL_BASELINE,
} from '@/config/economy.config'

/** Kode-default per skalar nøkkeltall (samme verdi som resten av appen bruker i dag). */
const SCALAR_DEFAULTS: Record<string, number> = {
  grunnbelop: GRUNNBELOP_NOK,
  feriepengerProsent: FERIEPENGER_PROSENT,
  egenmeldingKvote: EGENMELDING_KVOTE,
  folketrygdOpptjeningssats: FOLKETRYGD_OPPTJENINGSSATS,
  spkPaaslagLav: SPK_PAASLAG_SATS_LAV,
  spkPaaslagHoy: SPK_PAASLAG_SATS_HOY,
  afpOpptjeningssats: AFP_OPPTJENINGSSATS,
  takFolketrygdG: TAK_FOLKETRYGD_G,
  takSpkG: TAK_SPK_G,
  bsuMaxYearly: BSU_MAX_YEARLY,
  bsuMaxTotal: BSU_MAX_TOTAL,
}

export const KEY_FIGURE_META: Record<KeyFigureKey, KeyFigureMeta> = {
  grunnbelop: { key: 'grunnbelop', label: 'Grunnbeløp (G)', group: 'pensjon', unit: 'kr', kind: 'scalar', editable: true, sourceUrl: 'https://www.nav.no/grunnbelopet', defaultVerifiedAt: '2026-06-20' },
  feriepengerProsent: { key: 'feriepengerProsent', label: 'Feriepengesats', group: 'feriepenger', unit: 'pst', kind: 'scalar', editable: true, sourceUrl: 'https://www.skatteetaten.no', defaultVerifiedAt: '2026-06-16' },
  egenmeldingKvote: { key: 'egenmeldingKvote', label: 'Egenmeldingsdager (kvote)', group: 'fravaer', unit: 'antall', kind: 'scalar', editable: true, sourceUrl: 'https://www.nav.no', defaultVerifiedAt: '2026-06-16' },
  folketrygdOpptjeningssats: { key: 'folketrygdOpptjeningssats', label: 'Folketrygd opptjeningssats', group: 'pensjon', unit: 'pst', kind: 'scalar', editable: true, sourceUrl: 'https://www.nav.no/alderspensjon', defaultVerifiedAt: '2026-06-18' },
  spkPaaslagLav: { key: 'spkPaaslagLav', label: 'SPK påslag (grunnsats)', group: 'pensjon', unit: 'pst', kind: 'scalar', editable: true, sourceUrl: 'https://www.spk.no', defaultVerifiedAt: '2026-06-18' },
  spkPaaslagHoy: { key: 'spkPaaslagHoy', label: 'SPK påslag (tilleggssats)', group: 'pensjon', unit: 'pst', kind: 'scalar', editable: true, sourceUrl: 'https://www.spk.no', defaultVerifiedAt: '2026-06-18' },
  afpOpptjeningssats: { key: 'afpOpptjeningssats', label: 'AFP opptjeningssats', group: 'pensjon', unit: 'pst', kind: 'scalar', editable: true, sourceUrl: 'https://www.nav.no/afp', defaultVerifiedAt: '2026-06-18' },
  takFolketrygdG: { key: 'takFolketrygdG', label: 'Inntektstak folketrygd (G)', group: 'pensjon', unit: 'G', kind: 'scalar', editable: true, sourceUrl: 'https://www.nav.no/alderspensjon', defaultVerifiedAt: '2026-06-18' },
  takSpkG: { key: 'takSpkG', label: 'Inntektstak SPK (G)', group: 'pensjon', unit: 'G', kind: 'scalar', editable: true, sourceUrl: 'https://www.spk.no', defaultVerifiedAt: '2026-06-18' },
  delingstall: { key: 'delingstall', label: 'Delingstall (per uttaksalder)', group: 'pensjon', unit: 'tabell', kind: 'table', editable: true, sourceUrl: 'https://www.nav.no/alderspensjon', defaultVerifiedAt: '2026-06-19' },
  bsuMaxYearly: { key: 'bsuMaxYearly', label: 'BSU maks/år', group: 'sparing', unit: 'kr', kind: 'scalar', editable: false, sourceUrl: 'https://www.skatteetaten.no', defaultVerifiedAt: '2026-06-16' },
  bsuMaxTotal: { key: 'bsuMaxTotal', label: 'BSU maks totalt', group: 'sparing', unit: 'kr', kind: 'scalar', editable: false, sourceUrl: 'https://www.skatteetaten.no', defaultVerifiedAt: '2026-06-16' },
  taxRules: { key: 'taxRules', label: 'Skattetrinn & satser', group: 'skatt', unit: 'tabell', kind: 'table', editable: false, sourceUrl: 'https://www.skatteetaten.no', defaultVerifiedAt: '2026-06-16' },
}

/** Nyeste override med year <= forespurt år, ellers kode-default. */
export function resolveScalar(key: KeyFigureKey, overrides: KeyFigureOverride[], year: number): number {
  const candidates = overrides
    .filter((o) => o.key === key && o.year <= year && typeof o.value === 'number')
    .sort((a, b) => b.year - a.year)
  if (candidates.length > 0) return candidates[0].value as number
  return SCALAR_DEFAULTS[key] ?? 0
}

/** Delingstall-tabell: nyeste override <= år, ellers kode-default. */
export function resolveDelingstall(overrides: KeyFigureOverride[], year: number): Record<number, number> {
  const candidates = overrides
    .filter((o) => o.key === 'delingstall' && o.year <= year && typeof o.value === 'object')
    .sort((a, b) => b.year - a.year)
  if (candidates.length > 0) return candidates[0].value as Record<number, number>
  return DELINGSTALL_BASELINE
}

const STALE_MONTHS = 12

/** Utdatert: ingen override for inneværende år OG default eldre enn STALE_MONTHS. */
export function isStale(key: KeyFigureKey, overrides: KeyFigureOverride[], now: Date = new Date()): boolean {
  const year = now.getFullYear()
  const hasCurrent = overrides.some((o) => o.key === key && o.year === year)
  if (hasCurrent) return false
  const verified = new Date(KEY_FIGURE_META[key].defaultVerifiedAt)
  const ageMonths = (now.getTime() - verified.getTime()) / (1000 * 60 * 60 * 24 * 30)
  return ageMonths > STALE_MONTHS
}
```

- [ ] **Step 5: Kjør — verifiser pass**

Run: `npm test -- keyFigureRegistry && npm run typecheck`
Expected: PASS / rent.

- [ ] **Step 6: Commit**

```bash
git add src/types/economy.ts src/domain/economy/keyFigureRegistry.ts src/domain/economy/__tests__/keyFigureRegistry.test.ts
git commit -m "feat(nøkkeltall): registry-katalog + resolver + konsistens-invariant

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Store — keyFigureOverrides + persist v26 + synk

**Files:**
- Modify: `src/application/useEconomyStore.ts`
- Modify: `src/lib/syncEconomyData.ts`
- Modify: `src/application/usePartnerStore.ts` (stub)
- Test: `src/store/__tests__/keyFigureStore.test.ts`

- [ ] **Step 1: Skriv failing test**

Create `src/store/__tests__/keyFigureStore.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useEconomyStore } from '@/application/useEconomyStore'

describe('keyFigureOverrides-actions', () => {
  beforeEach(() => { useEconomyStore.setState({ keyFigureOverrides: [] }) })

  it('setKeyFigureOverride legger til / erstatter per (key,year)', () => {
    useEconomyStore.getState().setKeyFigureOverride({ key: 'grunnbelop', year: 2026, value: 140_000, verifiedAt: '2026-05-01' })
    useEconomyStore.getState().setKeyFigureOverride({ key: 'grunnbelop', year: 2026, value: 141_000, verifiedAt: '2026-05-02' })
    const ov = useEconomyStore.getState().keyFigureOverrides.filter((o) => o.key === 'grunnbelop' && o.year === 2026)
    expect(ov).toHaveLength(1)
    expect(ov[0].value).toBe(141_000)
  })

  it('removeKeyFigureOverride fjerner per (key,year)', () => {
    useEconomyStore.getState().setKeyFigureOverride({ key: 'grunnbelop', year: 2026, value: 140_000, verifiedAt: '2026-05-01' })
    useEconomyStore.getState().removeKeyFigureOverride('grunnbelop', 2026)
    expect(useEconomyStore.getState().keyFigureOverrides).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Kjør — verifiser feil**

Run: `npm test -- keyFigureStore`
Expected: FAIL.

- [ ] **Step 3: Implementer store-endringer**

I `src/application/useEconomyStore.ts`:

a) Importer typen (legg til i eksisterende `@/types/economy`-import): `KeyFigureOverride`.

b) I `EconomyState`-interfacet (nær `pensionSettings`):

```ts
  keyFigureOverrides: KeyFigureOverride[]
  setKeyFigureOverride: (o: KeyFigureOverride) => void
  removeKeyFigureOverride: (key: string, year: number) => void
```

c) Initial state (ved `pensionSettings: null`):

```ts
      keyFigureOverrides: [],
```

d) Actions (ved `setPensionSettings`):

```ts
      setKeyFigureOverride: (o) => set((s) => ({
        keyFigureOverrides: [
          ...s.keyFigureOverrides.filter((x) => !(x.key === o.key && x.year === o.year)),
          o,
        ],
      })),
      removeKeyFigureOverride: (key, year) => set((s) => ({
        keyFigureOverrides: s.keyFigureOverrides.filter((x) => !(x.key === key && x.year === year)),
      })),
```

e) Bump persist `version: 25` → `version: 26` (ingen enabledTabs-migrering nødvendig — registeret bor i eksisterende Innstillinger-side, ikke en ny fane).

f) `partialize` (ved `pensionSettings: state.pensionSettings`):

```ts
        keyFigureOverrides: state.keyFigureOverrides,
```

g) `importData` (ved `pensionSettings: data.pensionSettings ?? null`):

```ts
            keyFigureOverrides: data.keyFigureOverrides ?? [],
```

I `src/lib/syncEconomyData.ts`, legg i `saveToSupabase`-payload (ved `pensionSettings: state.pensionSettings`):

```ts
    keyFigureOverrides: state.keyFigureOverrides,
```

I `src/application/usePartnerStore.ts`: legg til stub-felt i initial state + no-op settere (`keyFigureOverrides: []`, `setKeyFigureOverride: () => {}`, `removeKeyFigureOverride: () => {}`) hvis typecheck klager (den implementerer `EconomyState`).

- [ ] **Step 4: Kjør test + typecheck**

Run: `npm test -- keyFigureStore && npm run typecheck`
Expected: PASS / rent.

- [ ] **Step 5: Commit**

```bash
git add src/application/useEconomyStore.ts src/lib/syncEconomyData.ts src/application/usePartnerStore.ts src/store/__tests__/keyFigureStore.test.ts
git commit -m "feat(nøkkeltall): store-overrides + persist v26 + Supabase-synk

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Hook `useKeyFigures`

**Files:**
- Create: `src/hooks/useKeyFigures.ts`

- [ ] **Step 1: Implementer hooken**

Create `src/hooks/useKeyFigures.ts`:

```ts
import { useMemo } from 'react'
import { useActiveEconomyStore } from '@/contexts/EconomyStoreContext'
import { resolveScalar, resolveDelingstall, isStale } from '@/domain/economy/keyFigureRegistry'
import type { KeyFigureKey } from '@/types/economy'

/** Resolverte nøkkeltall for inneværende år + staleness-sjekk. */
export function useKeyFigures() {
  const overrides = useActiveEconomyStore((s) => s.keyFigureOverrides)

  return useMemo(() => {
    const year = new Date().getFullYear()
    return {
      grunnbelop: resolveScalar('grunnbelop', overrides, year),
      feriepengerProsent: resolveScalar('feriepengerProsent', overrides, year),
      egenmeldingKvote: resolveScalar('egenmeldingKvote', overrides, year),
      folketrygdOpptjeningssats: resolveScalar('folketrygdOpptjeningssats', overrides, year),
      spkPaaslagLav: resolveScalar('spkPaaslagLav', overrides, year),
      spkPaaslagHoy: resolveScalar('spkPaaslagHoy', overrides, year),
      afpOpptjeningssats: resolveScalar('afpOpptjeningssats', overrides, year),
      takFolketrygdG: resolveScalar('takFolketrygdG', overrides, year),
      takSpkG: resolveScalar('takSpkG', overrides, year),
      delingstall: resolveDelingstall(overrides, year),
      stale: (key: KeyFigureKey) => isStale(key, overrides),
    }
  }, [overrides])
}
```

- [ ] **Step 2: Verifiser**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useKeyFigures.ts
git commit -m "feat(nøkkeltall): useKeyFigures-hook (resolverte verdier + staleness)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Wire G + delingstall + pensjonssatser inn i pensjon

**Files:**
- Modify: `src/domain/economy/pensionCalculator.ts`
- Modify: `src/pages/economy/PensionPage.tsx`, `src/pages/economy/EconomyDashboard.tsx`, `src/hooks/useScenario.ts`
- Test: `src/domain/economy/__tests__/pensionCalculator.test.ts` (eksisterende — skal bestå uendret)

- [ ] **Step 1: Legg parametre med default på de rene funksjonene**

I `pensionCalculator.ts`:

a) `buildPensionInputFromProfile(profile, settings, currentYear, currentG = GRUNNBELOP_NOK)` — bruk `currentG` der `GRUNNBELOP_NOK` brukes (linje ~221).

b) Utvid `PensionInput` med valgfrie overstyringer:

```ts
  /** Valgfri delingstall-tabell (fra register). Default = DELINGSTALL_BASELINE via getDelingstall. */
  delingstallTable?: Record<number, number>
  /** Valgfrie satser (fra register). Default = kode-konstantene. */
  rates?: {
    folketrygd?: number; spkLav?: number; spkHoy?: number; afp?: number
    takFolketrygdG?: number; takSpkG?: number
  }
```

c) I `projectPension`, bruk `input.delingstallTable` (om satt) ved delingstall-oppslag: `getDelingstall(input.uttaksalder, input.delingstallTable)`, og send `input.rates` videre til accrue-funksjonene (gi hver accrue-funksjon valgfrie sats-parametre med default = dagens konstant). Endre `getDelingstall` i `economy.config.ts` til `getDelingstall(uttaksalder, table = DELINGSTALL_BASELINE)`.

- [ ] **Step 2: Verifiser at eksisterende pensjon-tester består (regresjonsvern)**

Run: `npm test -- pensionCalculator`
Expected: PASS — defaults = konstantene, så ingen oppførselsendring.

- [ ] **Step 3: Injiser resolverte verdier fra hooks**

I `PensionPage.tsx`, `EconomyDashboard.tsx`, `useScenario.ts`: hent `const kf = useKeyFigures()` og send `kf.grunnbelop` der `GRUNNBELOP_NOK` ble sendt, og `delingstallTable: kf.delingstall` + `rates: { folketrygd: kf.folketrygdOpptjeningssats, ... }` inn i `projectPension`/`buildPensionInputFromProfile`. (Importen av `GRUNNBELOP_NOK` i disse fjernes hvis ubrukt.)

- [ ] **Step 4: Verifiser bygg + full test**

Run: `npm run build && npm test`
Expected: PASS / alle grønne.

- [ ] **Step 5: Commit**

```bash
git add src/domain/economy/pensionCalculator.ts src/config/economy.config.ts src/pages/economy/PensionPage.tsx src/pages/economy/EconomyDashboard.tsx src/hooks/useScenario.ts
git commit -m "feat(nøkkeltall): pensjon leser G/delingstall/satser fra registeret

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Wire feriepengesats + egenmelding

**Files:**
- Modify: `src/domain/economy/salaryCalculator.ts`, `src/domain/economy/holidayPayCalculator.ts`, `src/domain/economy/absenceCalculator.ts`
- Modify: lesende hooks/sider (se Step 3)

- [ ] **Step 1: Parametre med default på de rene funksjonene**

- `salaryCalculator.ts` / `holidayPayCalculator.ts`: gi funksjonene som bruker `FERIEPENGER_PROSENT`/`FERIEDAGER_TREKK`/`FERIETREKK_DIVISOR` valgfrie parametre med default = konstanten (f.eks. `forecastJune(..., feriepengerProsent = FERIEPENGER_PROSENT)`). Bruk parameteren i beregningen.
- `absenceCalculator.ts`: funksjonene `getRemainingSelfCertDays*`/`getAbsenceStatus*` som bruker `EGENMELDING_KVOTE` får valgfri `kvote = EGENMELDING_KVOTE`-parameter.

- [ ] **Step 2: Verifiser eksisterende tester (regresjonsvern)**

Run: `npm test -- holidayPayCalculator absenceCalculator salaryCalculator`
Expected: PASS — defaults uendret.

- [ ] **Step 3: Injiser resolverte verdier**

Der feriepenger/fravær beregnes i hooks/sider (f.eks. `EconomyDashboard.tsx` sin `forecastJune`-bruk, `AbsencePage.tsx`), hent `useKeyFigures()` og send `kf.feriepengerProsent` / `kf.egenmeldingKvote`. `AbsencePage` display-bruk av `EGENMELDING_KVOTE` byttes til `kf.egenmeldingKvote`.

- [ ] **Step 4: Verifiser bygg + full test**

Run: `npm run build && npm test`
Expected: PASS / alle grønne.

- [ ] **Step 5: Commit**

```bash
git add src/domain/economy/salaryCalculator.ts src/domain/economy/holidayPayCalculator.ts src/domain/economy/absenceCalculator.ts src/pages/economy/EconomyDashboard.tsx src/pages/economy/AbsencePage.tsx
git commit -m "feat(nøkkeltall): feriepengesats og egenmeldingskvote fra registeret

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Innstillinger-UI — «Nøkkeltall & satser»

**Files:**
- Modify: `src/pages/economy/EconomySettingsPage.tsx` (ny seksjon-komponent)

- [ ] **Step 1: Legg til seksjonen**

I `EconomySettingsPage.tsx`, legg til en `KeyFigureSection`-komponent og render den blant de andre seksjonene. Bruk eksisterende `Section`-wrapper-mønster i fila. Komponenten:

```tsx
import { KEY_FIGURE_META, resolveScalar, resolveDelingstall, isStale } from '@/domain/economy/keyFigureRegistry'
import type { KeyFigureKey, KeyFigureMeta } from '@/types/economy'
import { useEconomyStore } from '@/application/useEconomyStore'
import { useState } from 'react'

function fmtUnit(v: number, unit: KeyFigureMeta['unit']): string {
  if (unit === 'pst') return `${(v * 100).toFixed(2).replace(/\.?0+$/, '')} %`
  if (unit === 'kr') return v.toLocaleString('no-NO') + ' kr'
  if (unit === 'G') return `${v} G`
  if (unit === 'antall') return `${v}`
  return '—'
}

function KeyFigureSection() {
  const overrides = useEconomyStore((s) => s.keyFigureOverrides)
  const setOverride = useEconomyStore((s) => s.setKeyFigureOverride)
  const removeOverride = useEconomyStore((s) => s.removeKeyFigureOverride)
  const year = new Date().getFullYear()
  const [editKey, setEditKey] = useState<KeyFigureKey | null>(null)
  const [editVal, setEditVal] = useState('')

  const scalarKeys = (Object.keys(KEY_FIGURE_META) as KeyFigureKey[])
    .filter((k) => KEY_FIGURE_META[k].kind === 'scalar')

  function save(meta: KeyFigureMeta) {
    const raw = parseFloat(editVal.replace(/\s/g, '').replace(',', '.'))
    if (isNaN(raw) || raw < 0) return
    // prosent lagres som desimal (UI viser %, lagrer 0–1)
    const value = meta.unit === 'pst' ? raw / 100 : raw
    setOverride({ key: meta.key, year, value, verifiedAt: new Date().toISOString().split('T')[0], source: meta.sourceUrl })
    setEditKey(null); setEditVal('')
  }

  return (
    <Section title="Nøkkeltall & satser" description="G-dynamiske og årlige verdier som pensjon, feriepenger og skatt bruker. Endringer slår gjennom i hele verktøyet og synkes til partner.">
      <div className="space-y-2">
        {scalarKeys.map((k) => {
          const meta = KEY_FIGURE_META[k]
          const current = resolveScalar(k, overrides, year)
          const hasOverride = overrides.some((o) => o.key === k && o.year === year)
          const stale = isStale(k, overrides)
          return (
            <div key={k} className="flex items-center justify-between gap-2 rounded-lg border border-border/50 bg-card/60 px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm">{meta.label} {!meta.editable && <span className="text-[10px] text-muted-foreground">(redigering kommer)</span>}</p>
                <p className="text-[11px] text-muted-foreground">
                  {fmtUnit(current, meta.unit)}
                  {hasOverride ? <span className="text-blue-400"> · egendefinert {year}</span> : <span> · standard</span>}
                  {stale && <a href={meta.sourceUrl} target="_blank" rel="noreferrer" className="text-yellow-400"> · kan være utdatert, sjekk kilde</a>}
                </p>
              </div>
              {meta.editable && (
                editKey === k ? (
                  <div className="flex items-center gap-1 shrink-0">
                    <input autoFocus value={editVal} onChange={(e) => setEditVal(e.target.value)}
                      className="w-24 rounded-md border border-border/50 bg-background px-2 py-1 text-xs" aria-label={`Ny verdi for ${meta.label}`} />
                    <button onClick={() => save(meta)} className="rounded bg-primary/20 px-2 py-1 text-xs text-primary">Lagre</button>
                    <button onClick={() => { setEditKey(null); setEditVal('') }} className="text-xs text-muted-foreground">Avbryt</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 shrink-0">
                    {hasOverride && <button onClick={() => removeOverride(k, year)} className="text-[11px] text-muted-foreground hover:text-red-400">Tilbakestill</button>}
                    <button onClick={() => { setEditKey(k); setEditVal(meta.unit === 'pst' ? String(current * 100) : String(current)) }}
                      className="text-[11px] text-primary hover:underline">Endre</button>
                  </div>
                )
              )}
            </div>
          )
        })}
        {/* Tabeller (delingstall, taxRules) — read-only oppsummering */}
        <div className="rounded-lg border border-border/50 bg-card/60 px-3 py-2">
          <p className="text-sm">Delingstall (per uttaksalder)</p>
          <p className="text-[11px] text-muted-foreground">
            {Object.entries(resolveDelingstall(overrides, year)).map(([a, v]) => `${a}: ${v}`).join('  ·  ')}
          </p>
        </div>
        <p className="text-[10px] text-muted-foreground/60">
          Auto-hent fra nav.no/skatteetaten kommer i en senere versjon.
        </p>
      </div>
    </Section>
  )
}
```

> **Implementeringsnotat:** Bekreft at `Section`-wrapperen finnes i `EconomySettingsPage.tsx` (den brukes av eksisterende seksjoner som `PersonaliaSection`) og at `KeyFigureSection` rendres i samme liste. Prosent lagres som desimal (0–1) men vises/redigeres som %.

- [ ] **Step 2: Verifiser bygg**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Manuell røyktest**

Run: `npm run dev`, åpne Innstillinger.
Expected: «Nøkkeltall & satser»-seksjon viser alle verdier; endre G → lagres; «Tilbakestill» fjerner; BSU/skatt vises read-only; delingstall vises.

- [ ] **Step 4: Commit**

```bash
git add src/pages/economy/EconomySettingsPage.tsx
git commit -m "feat(nøkkeltall): Innstillinger-seksjon med rediger/historikk/utdatert

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Sluttverifisering

**Files:** ingen kodeendring med mindre noe feiler.

- [ ] **Step 1: Full verifisering**

Run: `npm test && npm run typecheck && npm run build`
Expected: Alle PASS. keyFigureRegistry-, keyFigureStore- og alle eksisterende kalkulator-tester grønne.

- [ ] **Step 2: Manuell konsistens-sjekk**

Run: `npm run dev`. Sjekk at:
- Uten overrides: alle tall er identiske med før (konsistens-invariant).
- Endre G i Innstillinger → pensjon (Pensjon-fanen), formue, scenario og dashbord-pensjonschip oppdateres alle.
- Endre feriepengesats → feriepenger-prognose endres.
- BSU/skattetrinn vises read-only.
- Reload + (om partner koblet) partner ser samme verdier (sky-synk).

---

## Self-Review (utført av planforfatter)

- **Spec-dekning:** Resolver + katalog + defaults-i-kode (Task 1), konsistens-invariant-test (Task 1), store + persist v26 + 3-stis sky-synk + partner-stub (Task 2), hook (Task 3), wiring av G/delingstall/pensjonssatser (Task 4) + feriepenger/egenmelding (Task 5) via parameter-med-default (regresjonsvern), Innstillinger-UI med rediger/tilbakestill/utdatert + read-only BSU/skatt + delingstall-visning (Task 6), staleness (Task 1, 6). BSU + taxRules bevisst read-only i v1 (brukervalg). Auto-hent er delprosjekt 2 (deaktivert krok nevnt i UI).
- **Placeholders:** Domene-/store-/hook-tasks har komplett kode + tester. Wiring-tasks (4, 5) beskriver parameter-med-default-mønsteret med eksplisitte funksjoner/linjer + regresjonstest-verifisering; UI-task (6) har komplett komponentkode. Verifiseres via build + eksisterende tester (regresjonsvern) + røyktest.
- **Typekonsistens:** `KeyFigureKey/Kind/Meta/Override`, `resolveScalar/resolveDelingstall/isStale`, `KEY_FIGURE_META`, `useKeyFigures`, `setKeyFigureOverride/removeKeyFigureOverride` konsistente på tvers.
- **Konsistens-regel:** resolver = eneste kilde for wirede tall (pensjon/feriepenger/fravær/formue/scenario via hook); tom override ≡ konstant (invariant-test); full sky-synk; defaults-i-kode bunnplanke. BSU/skatt vises read-only (ingen editerbart-men-ignorert-brudd) til de wires i oppfølging.
