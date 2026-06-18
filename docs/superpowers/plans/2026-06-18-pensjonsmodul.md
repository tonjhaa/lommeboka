# Pensjonsmodul Implementeringsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bygg en lokal pensjonsprognose-modul som viser forventet alderspensjon (folketrygd + SPK-påslag + ny AFP + valgfri særalder) ved valgt uttaksalder for en Forsvaret-ansatt født 1963+.

**Architecture:** Rene domenefunksjoner i `pensionCalculator.ts` drevet av beholdning/delingstall-modellen (2020-reformen), forankret i NAVs `navikt/pensjonssimulator`. Konstanter i `economy.config.ts`, tilstand i `useEconomyStore`, side i `PensionPage.tsx`. Beregningsfunksjonene tar G og delingstall som parametre, så enhetstestene er deterministiske uavhengig av tabellverdiene.

**Tech Stack:** React 19 + TypeScript (strict), Zustand persist, Vitest, Tailwind v4, lucide-react.

**Spec:** `docs/superpowers/specs/2026-06-18-pensjonsmodul-design.md`
**Branch:** `feat/pensjonsmodul`

**Konvensjoner:**
- TypeScript-sjekk: bruk **`npm run typecheck`** (= `tsc -b`). `npx tsc --noEmit` fanger IKKE `noUnusedLocals` i dette composite-oppsettet.
- Tester: `npm test` (vitest run).
- Conventional commits. Avslutt hver commit-melding med `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: Typer

**Files:**
- Modify: `src/types/economy.ts` (legg til i enden, før `partnerNonBsuEquity`-helperne er greit; og utvid `EconomyTab`)

- [ ] **Step 1: Legg til pensjonstyper**

Legg til nederst i `src/types/economy.ts`:

```ts
// ------------------------------------------------------------
// PENSJON (2020-modellen, født 1963+)
// ------------------------------------------------------------

export interface PensionSettings {
  birthYear: number               // default fra userPreferences
  serviceStartYear: number        // yrkesstart / opptjeningsstart
  særalder: { enabled: boolean; age: 57 | 60 | 63 }  // FLAGGES USIKKER i UI
  afpEnabled: boolean             // antas oppfylt; kan skrus av
  assumptions: {
    salaryGrowthPct: number       // forventet årlig lønnsvekst, f.eks. 3
    gGrowthPct: number            // forventet G-regulering, f.eks. 3.5
  }
  officialEstimate?: number       // valgfritt norskpensjon.no-tall (krok for senere kalibrering)
}

export interface PensionPillarBreakdown {
  folketrygd: number              // kr/mnd
  spk: number                     // kr/mnd
  afp: number                     // kr/mnd
  særalder: number                // kr/mnd (0 hvis av)
}

export interface PensionProjection {
  uttaksalder: number
  perPilar: PensionPillarBreakdown
  monthlyTotal: number            // sum perPilar
  replacementRate: number         // monthlyTotal / (sluttlønn per mnd)
  confidence: 'lav' | 'middels'   // alltid ≤ middels (~40 års horisont)
}
```

- [ ] **Step 2: Legg `'pension'` til EconomyTab**

Endre `EconomyTab`-unionen i samme fil:

```ts
export type EconomyTab =
  | 'dashboard' | 'budget' | 'salary' | 'atf' | 'feriepenger'
  | 'savings' | 'fond' | 'debt' | 'absence' | 'tax'
  | 'subscriptions' | 'ivf' | 'vacation' | 'settings' | 'veikart' | 'gaver' | 'partner' | 'permisjon'
  | 'pension'
```

- [ ] **Step 3: Verifiser typer kompilerer**

Run: `npm run typecheck`
Expected: PASS (ingen feil). Typer er foreløpig ubrukte, men eksporterte typer trigger ikke `noUnusedLocals`.

- [ ] **Step 4: Commit**

```bash
git add src/types/economy.ts
git commit -m "feat(pensjon): typer for pensjonsprognose

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Konstanter + delingstall-tabell

**Files:**
- Modify: `src/config/economy.config.ts` (ny seksjon i enden)
- Test: `src/domain/economy/__tests__/pensionConfig.test.ts`

- [ ] **Step 1: Skriv failing test for `getDelingstall`**

Create `src/domain/economy/__tests__/pensionConfig.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { getDelingstall, DELINGSTALL_BASELINE } from '@/config/economy.config'

describe('getDelingstall', () => {
  it('returnerer eksakt tabellverdi for kjent alder', () => {
    expect(getDelingstall(67)).toBe(DELINGSTALL_BASELINE[67])
  })

  it('interpolerer lineært mellom to aldre', () => {
    const mid = (DELINGSTALL_BASELINE[67] + DELINGSTALL_BASELINE[68]) / 2
    expect(getDelingstall(67.5)).toBeCloseTo(mid, 4)
  })

  it('klamrer til ytterpunktene utenfor tabellen', () => {
    const minAlder = Math.min(...Object.keys(DELINGSTALL_BASELINE).map(Number))
    const maxAlder = Math.max(...Object.keys(DELINGSTALL_BASELINE).map(Number))
    expect(getDelingstall(minAlder - 5)).toBe(DELINGSTALL_BASELINE[minAlder])
    expect(getDelingstall(maxAlder + 5)).toBe(DELINGSTALL_BASELINE[maxAlder])
  })

  it('senere uttak gir lavere delingstall (monotont)', () => {
    expect(getDelingstall(70)).toBeLessThan(getDelingstall(62))
  })
})
```

- [ ] **Step 2: Kjør testen — verifiser at den feiler**

Run: `npm test -- pensionConfig`
Expected: FAIL ("getDelingstall is not a function" / import-feil).

- [ ] **Step 3: Legg til konstanter + helper**

Legg til i enden av `src/config/economy.config.ts`:

```ts
// ------------------------------------------------------------
// PENSJON (2020-modellen — ny offentlig tjenestepensjon)
// Satser forankret i navikt/pensjonssimulator (se design-spec).
// Sist verifisert: 2026-06-18.
// ------------------------------------------------------------

/** Grunnbeløp (G) i kr. VERIFISER mot nav.no ved implementering (per 1. mai 2025 ≈ 130 160). */
export const GRUNNBELOP_NOK = 130_160
/** Antatt årlig G-regulering (%). */
export const GRUNNBELOP_VEKST_DEFAULT = 3.5
/** Antatt årlig lønnsvekst (%). */
export const LONNSVEKST_DEFAULT = 3.0

/** Folketrygd alderspensjon: opptjeningssats av inntekt ≤ 7,1G. (NAV: 0.181) */
export const FOLKETRYGD_OPPTJENINGSSATS = 0.181
/** SPK påslag: lav sats av grunnlag ≤ 12G. */
export const SPK_PAASLAG_SATS_LAV = 0.057
/** SPK påslag: høy sats i båndet 7,1G–12G. */
export const SPK_PAASLAG_SATS_HOY = 0.181
/** Ny livsvarig offentlig AFP: opptjeningssats av livsinntekt ≤ 7,1G. (NAV: 0.0421) */
export const AFP_OPPTJENINGSSATS = 0.0421

/** Inntektstak for folketrygd/AFP i antall G. */
export const TAK_FOLKETRYGD_G = 7.1
/** Øvre grunnlagstak for SPK-påslag i antall G. */
export const TAK_SPK_G = 12

/** Minste uttaksalder for alderspensjon/AFP. */
export const MIN_UTTAKSALDER = 62

/**
 * Delingstall per uttaksalder.
 * FORELØPIG: seeded med NAVs publiserte tall for 1963-kullet som baseline.
 * Erstatt med forventede delingstall for brukerens årskull ved verifisering mot nav.no.
 */
export const DELINGSTALL_BASELINE: Record<number, number> = {
  62: 19.39,
  63: 18.59,
  64: 17.79,
  65: 16.99,
  66: 16.20,
  67: 15.42,
  68: 14.64,
  69: 13.87,
  70: 13.11,
}

/** Slår opp delingstall med lineær interpolasjon; klamrer til ytterpunktene. */
export function getDelingstall(uttaksalder: number): number {
  const aldre = Object.keys(DELINGSTALL_BASELINE).map(Number).sort((a, b) => a - b)
  const minA = aldre[0]
  const maxA = aldre[aldre.length - 1]
  if (uttaksalder <= minA) return DELINGSTALL_BASELINE[minA]
  if (uttaksalder >= maxA) return DELINGSTALL_BASELINE[maxA]
  const lav = Math.floor(uttaksalder)
  const hoy = Math.ceil(uttaksalder)
  if (lav === hoy) return DELINGSTALL_BASELINE[lav]
  const frac = uttaksalder - lav
  return DELINGSTALL_BASELINE[lav] + (DELINGSTALL_BASELINE[hoy] - DELINGSTALL_BASELINE[lav]) * frac
}
```

- [ ] **Step 4: Kjør testen — verifiser at den passerer**

Run: `npm test -- pensionConfig`
Expected: PASS (4 tester).

- [ ] **Step 5: Commit**

```bash
git add src/config/economy.config.ts src/domain/economy/__tests__/pensionConfig.test.ts
git commit -m "feat(pensjon): konstanter + delingstall-tabell med interpolasjon

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Inntekts- og G-framskriving (rene hjelpere)

**Files:**
- Create: `src/domain/economy/pensionCalculator.ts`
- Test: `src/domain/economy/__tests__/pensionCalculator.test.ts`

- [ ] **Step 1: Skriv failing test**

Create `src/domain/economy/__tests__/pensionCalculator.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildIncomeProjection, buildGProjection } from '../pensionCalculator'

describe('buildIncomeProjection', () => {
  it('holder inntekt konstant når vekst = 0', () => {
    const inc = buildIncomeProjection({ currentYear: 2026, currentAnnualIncome: 600_000, fromYear: 2024, toYear: 2028, growthPct: 0 })
    expect(inc[2026]).toBe(600_000)
    expect(inc[2024]).toBe(600_000)
    expect(inc[2028]).toBe(600_000)
  })

  it('skalerer framover og bakover med vekst relativt til currentYear', () => {
    const inc = buildIncomeProjection({ currentYear: 2026, currentAnnualIncome: 100_000, fromYear: 2025, toYear: 2027, growthPct: 10 })
    expect(inc[2027]).toBeCloseTo(110_000, 0)
    expect(inc[2025]).toBeCloseTo(100_000 / 1.1, 0)
  })
})

describe('buildGProjection', () => {
  it('framskriver G med gGrowthPct fra currentYear', () => {
    const g = buildGProjection({ currentYear: 2026, currentG: 130_000, fromYear: 2026, toYear: 2027, gGrowthPct: 5 })
    expect(g[2026]).toBe(130_000)
    expect(g[2027]).toBeCloseTo(136_500, 0)
  })
})
```

- [ ] **Step 2: Kjør testen — verifiser at den feiler**

Run: `npm test -- pensionCalculator`
Expected: FAIL (modul/funksjon finnes ikke).

- [ ] **Step 3: Implementer hjelperne**

Create `src/domain/economy/pensionCalculator.ts`:

```ts
// ============================================================
// PENSJONSKALKULATOR — 2020-modellen (født 1963+)
// Rene funksjoner. Satser/tabeller injiseres for deterministisk testing.
// Kildeforankring: navikt/pensjonssimulator (se design-spec).
// ============================================================

interface IncomeProjectionParams {
  currentYear: number
  currentAnnualIncome: number
  fromYear: number
  toYear: number
  growthPct: number
}

/** Årlig inntekt skalert med vekst relativt til currentYear, for [fromYear, toYear]. */
export function buildIncomeProjection(p: IncomeProjectionParams): Record<number, number> {
  const out: Record<number, number> = {}
  for (let y = p.fromYear; y <= p.toYear; y++) {
    out[y] = p.currentAnnualIncome * Math.pow(1 + p.growthPct / 100, y - p.currentYear)
  }
  return out
}

interface GProjectionParams {
  currentYear: number
  currentG: number
  fromYear: number
  toYear: number
  gGrowthPct: number
}

/** Årlig grunnbeløp framskrevet med gGrowthPct fra currentYear. */
export function buildGProjection(p: GProjectionParams): Record<number, number> {
  const out: Record<number, number> = {}
  for (let y = p.fromYear; y <= p.toYear; y++) {
    out[y] = p.currentG * Math.pow(1 + p.gGrowthPct / 100, y - p.currentYear)
  }
  return out
}
```

- [ ] **Step 4: Kjør testen — verifiser at den passerer**

Run: `npm test -- pensionCalculator`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/economy/pensionCalculator.ts src/domain/economy/__tests__/pensionCalculator.test.ts
git commit -m "feat(pensjon): inntekts- og G-framskriving

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Folketrygd-opptjening + uttaksberegning

**Files:**
- Modify: `src/domain/economy/pensionCalculator.ts`
- Test: `src/domain/economy/__tests__/pensionCalculator.test.ts`

- [ ] **Step 1: Skriv failing test**

Legg til i `pensionCalculator.test.ts`:

```ts
import { accrueFolketrygdBeholdning, annualFromBeholdning } from '../pensionCalculator'
import { FOLKETRYGD_OPPTJENINGSSATS, TAK_FOLKETRYGD_G } from '@/config/economy.config'

describe('accrueFolketrygdBeholdning', () => {
  it('legger 18,1 % av inntekt ≤ 7,1G i beholdningen per år', () => {
    const G = 100_000
    const income = { 2030: 500_000 } // 500k < 7,1G (710k) → hele teller
    const beholdning = accrueFolketrygdBeholdning(income, { 2030: G })
    expect(beholdning).toBeCloseTo(500_000 * FOLKETRYGD_OPPTJENINGSSATS, 2)
  })

  it('kapper inntekt ved 7,1G', () => {
    const G = 100_000
    const tak = TAK_FOLKETRYGD_G * G // 710 000
    const income = { 2030: 900_000 } // over taket
    const beholdning = accrueFolketrygdBeholdning(income, { 2030: G })
    expect(beholdning).toBeCloseTo(tak * FOLKETRYGD_OPPTJENINGSSATS, 2)
  })

  it('summerer over flere år', () => {
    const income = { 2030: 300_000, 2031: 300_000 }
    const g = { 2030: 100_000, 2031: 100_000 }
    const beholdning = accrueFolketrygdBeholdning(income, g)
    expect(beholdning).toBeCloseTo(2 * 300_000 * FOLKETRYGD_OPPTJENINGSSATS, 2)
  })
})

describe('annualFromBeholdning', () => {
  it('deler beholdning på delingstall', () => {
    expect(annualFromBeholdning(1_600_000, 16)).toBeCloseTo(100_000, 6)
  })
})
```

- [ ] **Step 2: Kjør testen — verifiser at den feiler**

Run: `npm test -- pensionCalculator`
Expected: FAIL (funksjonene finnes ikke).

- [ ] **Step 3: Implementer**

Legg til i `pensionCalculator.ts` (importer satsene øverst i fila):

```ts
import {
  FOLKETRYGD_OPPTJENINGSSATS,
  TAK_FOLKETRYGD_G,
} from '@/config/economy.config'

/** Folketrygdens pensjonsbeholdning: 18,1 % av inntekt ≤ 7,1G, summert over år. */
export function accrueFolketrygdBeholdning(
  incomeByYear: Record<number, number>,
  gByYear: Record<number, number>,
): number {
  let beholdning = 0
  for (const [yearStr, income] of Object.entries(incomeByYear)) {
    const year = Number(yearStr)
    const g = gByYear[year]
    if (!g) continue
    const tak = TAK_FOLKETRYGD_G * g
    beholdning += Math.min(income, tak) * FOLKETRYGD_OPPTJENINGSSATS
  }
  return beholdning
}

/** Årlig ytelse = beholdning / delingstall. */
export function annualFromBeholdning(beholdning: number, delingstall: number): number {
  return delingstall > 0 ? beholdning / delingstall : 0
}
```

- [ ] **Step 4: Kjør testen — verifiser at den passerer**

Run: `npm test -- pensionCalculator`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/economy/pensionCalculator.ts src/domain/economy/__tests__/pensionCalculator.test.ts
git commit -m "feat(pensjon): folketrygd-opptjening og uttaksberegning

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: SPK-påslag

**Files:**
- Modify: `src/domain/economy/pensionCalculator.ts`
- Test: `src/domain/economy/__tests__/pensionCalculator.test.ts`

- [ ] **Step 1: Skriv failing test**

Legg til i `pensionCalculator.test.ts`:

```ts
import { accrueSpkPaaslagBeholdning } from '../pensionCalculator'
import { SPK_PAASLAG_SATS_LAV, SPK_PAASLAG_SATS_HOY, TAK_SPK_G } from '@/config/economy.config'

describe('accrueSpkPaaslagBeholdning', () => {
  it('gir kun lav sats når grunnlag ≤ 7,1G', () => {
    const G = 100_000
    const grunnlag = { 2030: 500_000 } // < 7,1G
    const beholdning = accrueSpkPaaslagBeholdning(grunnlag, { 2030: G })
    expect(beholdning).toBeCloseTo(500_000 * SPK_PAASLAG_SATS_LAV, 2)
  })

  it('legger høy sats på båndet 7,1G–12G', () => {
    const G = 100_000
    const grunnlag = { 2030: 800_000 } // 7,1G=710k, 12G=1,2M → bånd = 90k
    const beholdning = accrueSpkPaaslagBeholdning(grunnlag, { 2030: G })
    const forventet = 800_000 * SPK_PAASLAG_SATS_LAV + (800_000 - 7.1 * G) * SPK_PAASLAG_SATS_HOY
    expect(beholdning).toBeCloseTo(forventet, 2)
  })

  it('kapper grunnlaget ved 12G', () => {
    const G = 100_000
    const grunnlag = { 2030: 2_000_000 } // over 12G
    const beholdning = accrueSpkPaaslagBeholdning(grunnlag, { 2030: G })
    const cap = TAK_SPK_G * G // 1,2M
    const forventet = cap * SPK_PAASLAG_SATS_LAV + (cap - 7.1 * G) * SPK_PAASLAG_SATS_HOY
    expect(beholdning).toBeCloseTo(forventet, 2)
  })
})
```

- [ ] **Step 2: Kjør testen — verifiser at den feiler**

Run: `npm test -- pensionCalculator`
Expected: FAIL.

- [ ] **Step 3: Implementer**

Utvid importen og legg til funksjonen i `pensionCalculator.ts`:

```ts
import {
  FOLKETRYGD_OPPTJENINGSSATS,
  TAK_FOLKETRYGD_G,
  SPK_PAASLAG_SATS_LAV,
  SPK_PAASLAG_SATS_HOY,
  TAK_SPK_G,
} from '@/config/economy.config'

/** SPK påslagsbeholdning: 5,7 % av grunnlag ≤ 12G + 18,1 % av båndet 7,1G–12G. */
export function accrueSpkPaaslagBeholdning(
  grunnlagByYear: Record<number, number>,
  gByYear: Record<number, number>,
): number {
  let beholdning = 0
  for (const [yearStr, grunnlag] of Object.entries(grunnlagByYear)) {
    const year = Number(yearStr)
    const g = gByYear[year]
    if (!g) continue
    const lavtGrunnlag = Math.min(grunnlag, TAK_SPK_G * g)
    const baandStart = TAK_FOLKETRYGD_G * g
    const baand = Math.max(0, Math.min(grunnlag, TAK_SPK_G * g) - baandStart)
    beholdning += lavtGrunnlag * SPK_PAASLAG_SATS_LAV + baand * SPK_PAASLAG_SATS_HOY
  }
  return beholdning
}
```

- [ ] **Step 4: Kjør testen — verifiser at den passerer**

Run: `npm test -- pensionCalculator`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/economy/pensionCalculator.ts src/domain/economy/__tests__/pensionCalculator.test.ts
git commit -m "feat(pensjon): SPK-påslagsmodell med båndberegning

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Ny livsvarig AFP

**Files:**
- Modify: `src/domain/economy/pensionCalculator.ts`
- Test: `src/domain/economy/__tests__/pensionCalculator.test.ts`

- [ ] **Step 1: Skriv failing test**

Legg til i `pensionCalculator.test.ts`:

```ts
import { sumLivsinntektUnder7_1G, annualAfp } from '../pensionCalculator'
import { AFP_OPPTJENINGSSATS } from '@/config/economy.config'

describe('AFP (ny livsvarig)', () => {
  it('summerer livsinntekt kappet ved 7,1G', () => {
    const G = 100_000
    const income = { 2030: 500_000, 2031: 900_000 } // år 2: kappes til 710k
    const sum = sumLivsinntektUnder7_1G(income, { 2030: G, 2031: G })
    expect(sum).toBeCloseTo(500_000 + 710_000, 2)
  })

  it('beregner AFP = livsinntekt × 4,21 % / delingstall', () => {
    const livsinntekt = 20_000_000
    const delingstall = 16
    expect(annualAfp(livsinntekt, delingstall)).toBeCloseTo(
      livsinntekt * AFP_OPPTJENINGSSATS / delingstall, 4,
    )
  })
})
```

- [ ] **Step 2: Kjør testen — verifiser at den feiler**

Run: `npm test -- pensionCalculator`
Expected: FAIL.

- [ ] **Step 3: Implementer**

Utvid importen (legg til `AFP_OPPTJENINGSSATS`) og legg til i `pensionCalculator.ts`:

```ts
/** Sum av pensjonsgivende inntekt kappet ved 7,1G per år (AFP-grunnlag). */
export function sumLivsinntektUnder7_1G(
  incomeByYear: Record<number, number>,
  gByYear: Record<number, number>,
): number {
  let sum = 0
  for (const [yearStr, income] of Object.entries(incomeByYear)) {
    const g = gByYear[Number(yearStr)]
    if (!g) continue
    sum += Math.min(income, TAK_FOLKETRYGD_G * g)
  }
  return sum
}

/** Ny livsvarig offentlig AFP: livsinntekt ≤ 7,1G × 4,21 % / delingstall. */
export function annualAfp(livsinntektUnder7_1G: number, delingstall: number): number {
  return delingstall > 0 ? (livsinntektUnder7_1G * AFP_OPPTJENINGSSATS) / delingstall : 0
}
```

- [ ] **Step 4: Kjør testen — verifiser at den passerer**

Run: `npm test -- pensionCalculator`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/economy/pensionCalculator.ts src/domain/economy/__tests__/pensionCalculator.test.ts
git commit -m "feat(pensjon): ny livsvarig offentlig AFP

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Topp-funksjon `projectPension` + særalder (usikker) + guards

**Files:**
- Modify: `src/domain/economy/pensionCalculator.ts`
- Test: `src/domain/economy/__tests__/pensionCalculator.test.ts`

- [ ] **Step 1: Skriv failing test**

Legg til i `pensionCalculator.test.ts`:

```ts
import { projectPension, type PensionInput } from '../pensionCalculator'

function makeInput(overrides: Partial<PensionInput> = {}): PensionInput {
  return {
    birthYear: 1995,
    serviceStartYear: 2016,
    currentYear: 2026,
    currentG: 130_000,
    folketrygdAnnualIncome: 600_000, // inkl. ATF/tillegg
    spkAnnualGrunnlag: 550_000,      // fast lønn + faste tillegg
    uttaksalder: 67,
    salaryGrowthPct: 0,
    gGrowthPct: 0,
    afpEnabled: true,
    særalder: { enabled: false, age: 60 },
    ...overrides,
  }
}

describe('projectPension', () => {
  it('returnerer positive beløp for alle aktive pilarer', () => {
    const p = projectPension(makeInput())
    expect(p.perPilar.folketrygd).toBeGreaterThan(0)
    expect(p.perPilar.spk).toBeGreaterThan(0)
    expect(p.perPilar.afp).toBeGreaterThan(0)
    expect(p.perPilar.særalder).toBe(0)
    expect(p.monthlyTotal).toBeCloseTo(
      p.perPilar.folketrygd + p.perPilar.spk + p.perPilar.afp + p.perPilar.særalder, 4,
    )
    expect(p.confidence).toBe('middels')
  })

  it('gir 0 AFP når afpEnabled = false', () => {
    const p = projectPension(makeInput({ afpEnabled: false }))
    expect(p.perPilar.afp).toBe(0)
  })

  it('gir særalderbeløp > 0 når særalder er på', () => {
    const p = projectPension(makeInput({ særalder: { enabled: true, age: 60 }, uttaksalder: 60 }))
    expect(p.perPilar.særalder).toBeGreaterThan(0)
  })

  it('kaster for årskull før 1963', () => {
    expect(() => projectPension(makeInput({ birthYear: 1960 }))).toThrow()
  })

  it('senere uttaksalder gir høyere folketrygd', () => {
    const tidlig = projectPension(makeInput({ uttaksalder: 62 }))
    const sen = projectPension(makeInput({ uttaksalder: 70 }))
    expect(sen.perPilar.folketrygd).toBeGreaterThan(tidlig.perPilar.folketrygd)
  })
})
```

- [ ] **Step 2: Kjør testen — verifiser at den feiler**

Run: `npm test -- pensionCalculator`
Expected: FAIL.

- [ ] **Step 3: Implementer**

Legg til øverst i `pensionCalculator.ts` (utvid config-importen med `getDelingstall` og `MIN_UTTAKSALDER`):

```ts
import {
  // ...eksisterende...
  getDelingstall,
  MIN_UTTAKSALDER,
} from '@/config/economy.config'
import type { PensionProjection } from '@/types/economy'

export interface PensionInput {
  birthYear: number
  serviceStartYear: number
  currentYear: number
  currentG: number
  folketrygdAnnualIncome: number   // dagens årsinntekt inkl. ATF/tillegg (folketrygdgrunnlag)
  spkAnnualGrunnlag: number        // dagens SPK-grunnlag (fast lønn + faste tillegg)
  uttaksalder: number
  salaryGrowthPct: number
  gGrowthPct: number
  afpEnabled: boolean
  særalder: { enabled: boolean; age: number }
}

const MIN_BIRTH_YEAR_NY_MODELL = 1963

/** Tilnærmet særalderspåslag — FORELØPIG, regelverk under utvikling. */
function estimateSæralder(input: PensionInput, folketrygdAarlig: number): number {
  if (!input.særalder.enabled) return 0
  // Forenklet: et livsvarig påslag som kompenserer for tidligere uttak,
  // grovt anslått som 10 % av folketrygdytelsen. Merkes «usikker» i UI.
  return folketrygdAarlig * 0.10
}

/** Hovedfunksjon: prognose for én uttaksalder. */
export function projectPension(input: PensionInput): PensionProjection {
  if (input.birthYear < MIN_BIRTH_YEAR_NY_MODELL) {
    throw new Error(`Pensjonsmodulen støtter kun ny modell (født ${MIN_BIRTH_YEAR_NY_MODELL}+)`)
  }
  const uttaksaar = input.birthYear + Math.max(input.uttaksalder, MIN_UTTAKSALDER)
  const fromYear = input.serviceStartYear
  const toYear = uttaksaar - 1 // opptjening til og med året før uttak

  const gByYear = buildGProjection({
    currentYear: input.currentYear, currentG: input.currentG,
    fromYear, toYear, gGrowthPct: input.gGrowthPct,
  })
  const ftIncome = buildIncomeProjection({
    currentYear: input.currentYear, currentAnnualIncome: input.folketrygdAnnualIncome,
    fromYear, toYear, growthPct: input.salaryGrowthPct,
  })
  const spkGrunnlag = buildIncomeProjection({
    currentYear: input.currentYear, currentAnnualIncome: input.spkAnnualGrunnlag,
    fromYear, toYear, growthPct: input.salaryGrowthPct,
  })

  const delingstall = getDelingstall(input.uttaksalder)

  const folketrygdAarlig = annualFromBeholdning(accrueFolketrygdBeholdning(ftIncome, gByYear), delingstall)
  const spkAarlig = annualFromBeholdning(accrueSpkPaaslagBeholdning(spkGrunnlag, gByYear), delingstall)
  const afpAarlig = input.afpEnabled
    ? annualAfp(sumLivsinntektUnder7_1G(ftIncome, gByYear), delingstall)
    : 0
  const særalderAarlig = estimateSæralder(input, folketrygdAarlig)

  const perPilar = {
    folketrygd: folketrygdAarlig / 12,
    spk: spkAarlig / 12,
    afp: afpAarlig / 12,
    særalder: særalderAarlig / 12,
  }
  const monthlyTotal = perPilar.folketrygd + perPilar.spk + perPilar.afp + perPilar.særalder

  const sluttlonnMnd = (input.folketrygdAnnualIncome *
    Math.pow(1 + input.salaryGrowthPct / 100, toYear - input.currentYear)) / 12

  return {
    uttaksalder: input.uttaksalder,
    perPilar,
    monthlyTotal,
    replacementRate: sluttlonnMnd > 0 ? monthlyTotal / sluttlonnMnd : 0,
    confidence: 'middels',
  }
}
```

- [ ] **Step 4: Kjør testene — verifiser at de passerer**

Run: `npm test -- pensionCalculator`
Expected: PASS (alle tester).

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck`
Expected: PASS.

```bash
git add src/domain/economy/pensionCalculator.ts src/domain/economy/__tests__/pensionCalculator.test.ts
git commit -m "feat(pensjon): projectPension med særalder (usikker) og guards

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Store — pensionSettings + migrering

**Files:**
- Modify: `src/application/useEconomyStore.ts`
- Test: `src/store/__tests__/pensionMigration.test.ts` (følg eksisterende `src/store/__tests__`-mønster)

- [ ] **Step 1: Skriv failing test**

Create `src/store/__tests__/pensionMigration.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { DEFAULT_PENSION_SETTINGS } from '@/application/useEconomyStore'

describe('DEFAULT_PENSION_SETTINGS', () => {
  it('har fornuftige standardverdier', () => {
    expect(DEFAULT_PENSION_SETTINGS.særalder.enabled).toBe(false)
    expect(DEFAULT_PENSION_SETTINGS.særalder.age).toBe(60)
    expect(DEFAULT_PENSION_SETTINGS.afpEnabled).toBe(true)
    expect(DEFAULT_PENSION_SETTINGS.assumptions.salaryGrowthPct).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Kjør testen — verifiser at den feiler**

Run: `npm test -- pensionMigration`
Expected: FAIL (`DEFAULT_PENSION_SETTINGS` ikke eksportert).

- [ ] **Step 3: Implementer store-endringer**

I `src/application/useEconomyStore.ts`:

a) Importer typen øverst (legg til i eksisterende `@/types/economy`-import): `PensionSettings`.

b) Legg til default-konstant nær de andre DEFAULT-konstantene (f.eks. ved `INITIAL_IVF_TRANSACTIONS`):

```ts
import { LONNSVEKST_DEFAULT, GRUNNBELOP_VEKST_DEFAULT } from '@/config/economy.config'

export const DEFAULT_PENSION_SETTINGS: PensionSettings = {
  birthYear: 1995,
  serviceStartYear: new Date().getFullYear() - 5,
  særalder: { enabled: false, age: 60 },
  afpEnabled: true,
  assumptions: {
    salaryGrowthPct: LONNSVEKST_DEFAULT,
    gGrowthPct: GRUNNBELOP_VEKST_DEFAULT,
  },
}
```

c) Legg `pensionSettings` i `EconomyState`-interfacet (nær `userPreferences`):

```ts
  pensionSettings: PensionSettings | null
  setPensionSettings: (settings: PensionSettings) => void
```

d) Legg til i initial state (ved `userPreferences: null`):

```ts
      pensionSettings: null,
```

e) Legg til action (ved `setUserPreferences`):

```ts
      setPensionSettings: (settings) => set({ pensionSettings: settings }),
```

f) Bump `version: 21` → `version: 22` og legg til migrering (i `migrate`-funksjonen, etter v19-blokken):

```ts
        // v21 → v22: legg til 'pension' i enabledTabs for eksisterende brukere
        if (fromVersion < 22 && state.userPreferences) {
          const prefs = state.userPreferences as { enabledTabs?: string[] }
          if (Array.isArray(prefs.enabledTabs) && !prefs.enabledTabs.includes('pension')) {
            prefs.enabledTabs = [...prefs.enabledTabs, 'pension']
          }
        }
```

g) Legg `pensionSettings` i `partialize`:

```ts
        pensionSettings: state.pensionSettings,
```

- [ ] **Step 4: Kjør test + typecheck**

Run: `npm test -- pensionMigration && npm run typecheck`
Expected: PASS for begge.

- [ ] **Step 5: Commit**

```bash
git add src/application/useEconomyStore.ts src/store/__tests__/pensionMigration.test.ts
git commit -m "feat(pensjon): store-felt pensionSettings + persist v22-migrering

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: Navigasjon + lazy-rute

**Files:**
- Modify: `src/store/useAppStore.ts:13` (utvid `EconomySubPage`)
- Modify: `src/pages/economy/EconomyPage.tsx` (lazy-import, NAV_ITEMS, render-gren)

- [ ] **Step 1: Utvid `EconomySubPage`**

I `src/store/useAppStore.ts`, legg `'pension'` til `EconomySubPage`-unionen (linje 13):

```ts
export type EconomySubPage = 'dashboard' | 'budget' | 'salary' | 'atf' | 'savings' | 'debt' | 'absence' | 'tax' | 'subscriptions' | 'feriepenger' | 'fond' | 'ivf' | 'vacation' | 'settings' | 'veikart' | 'gaver' | 'partner' | 'permisjon' | 'pension'
```

- [ ] **Step 2: Lazy-import + nav-element + render i `EconomyPage.tsx`**

a) Importer ikon: legg `Landmark` til lucide-import-blokka (linje 8–22).

b) Legg til lazy-komponent ved de andre:

```ts
const PensionPage = lazyWithRetry(() =>
  import('./PensionPage').then((m) => ({ default: m.PensionPage }))
)
```

c) Legg til i `NAV_ITEMS` (etter `veikart`, før `gaver` er greit):

```ts
  { page: 'pension', label: 'Pensjon', Icon: Landmark },
```

d) Legg til render-gren i `<Suspense>`-blokka (ved de andre `currentPage === ...`):

```tsx
          {currentPage === 'pension' && <PensionPage />}
```

- [ ] **Step 3: Verifiser**

Run: `npm run typecheck`
Expected: PASS (PensionPage importeres i Task 10; midlertidig kan denne tasken slås sammen med Task 10 hvis fila ikke finnes ennå — opprett `PensionPage.tsx` i Task 10 FØR typecheck her, eller rekkefølgefølg Task 10 først).

> **Rekkefølge-merknad:** Implementer Task 10 (selve siden) før `npm run typecheck` i denne tasken, siden lazy-importen peker på `./PensionPage`. Commit begge sammen om nødvendig.

- [ ] **Step 4: Commit**

```bash
git add src/store/useAppStore.ts src/pages/economy/EconomyPage.tsx
git commit -m "feat(pensjon): naviger til pensjonsside

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 10: PensionPage UI

**Files:**
- Create: `src/pages/economy/PensionPage.tsx`

- [ ] **Step 1: Opprett siden med guards, hero, pilar-nedbrytning, sammenligning og forutsetninger**

Create `src/pages/economy/PensionPage.tsx`. Bruk eksisterende mønstre: `useEconomyStore`, `Button`/`Progress` fra `@/components/ui`, `cn` fra `@/lib/utils`. Innhold (komplett skjelett — fyll inn de fire seksjonene):

```tsx
import { useMemo, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useEconomyStore, DEFAULT_PENSION_SETTINGS } from '@/application/useEconomyStore'
import { projectPension, type PensionInput } from '@/domain/economy/pensionCalculator'
import { GRUNNBELOP_NOK } from '@/config/economy.config'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

function fmtNOK(n: number): string {
  return Math.round(n).toLocaleString('no-NO') + ' kr'
}

const UTTAKSALDRE = [62, 65, 67, 70]

export function PensionPage() {
  const profile = useEconomyStore((s) => s.profile)
  const prefs = useEconomyStore((s) => s.userPreferences)
  const stored = useEconomyStore((s) => s.pensionSettings)
  const setPensionSettings = useEconomyStore((s) => s.setPensionSettings)

  const settings = stored ?? {
    ...DEFAULT_PENSION_SETTINGS,
    birthYear: prefs?.birthYear ?? DEFAULT_PENSION_SETTINGS.birthYear,
  }
  const [uttaksalder, setUttaksalder] = useState(67)

  // Guards
  if (!profile || !prefs?.birthYear) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Pensjonsprognosen trenger lønnsprofil og fødselsår.
          </p>
          <p className="text-xs text-muted-foreground">
            Importer en lønnsslipp og sett fødselsår i Innstillinger.
          </p>
        </div>
      </div>
    )
  }
  if (settings.birthYear < 1963) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
        Pensjonsmodulen støtter foreløpig kun ny modell (født 1963 eller senere).
      </div>
    )
  }

  const baseInput: Omit<PensionInput, 'uttaksalder'> = useMemo(() => {
    const fasteTillegg = (profile.fixedAdditions ?? []).reduce((s, t) => s + t.amount, 0)
    const spkGrunnlag = (profile.baseMonthly + fasteTillegg) * 12
    // Folketrygd inkluderer variable tillegg/ATF — grovt anslag: +5 % over SPK-grunnlag.
    const folketrygdInntekt = spkGrunnlag * 1.05
    return {
      birthYear: settings.birthYear,
      serviceStartYear: settings.serviceStartYear,
      currentYear: new Date().getFullYear(),
      currentG: GRUNNBELOP_NOK,
      folketrygdAnnualIncome: folketrygdInntekt,
      spkAnnualGrunnlag: spkGrunnlag,
      salaryGrowthPct: settings.assumptions.salaryGrowthPct,
      gGrowthPct: settings.assumptions.gGrowthPct,
      afpEnabled: settings.afpEnabled,
      særalder: settings.særalder,
    }
  }, [profile, settings])

  const projection = useMemo(
    () => projectPension({ ...baseInput, uttaksalder }),
    [baseInput, uttaksalder],
  )
  const sammenligning = useMemo(
    () => UTTAKSALDRE.map((a) => projectPension({ ...baseInput, uttaksalder: a })),
    [baseInput],
  )

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 space-y-4">
      {/* SEKSJON 1: Hero — projection.monthlyTotal, replacementRate, confidence-badge,
          segmentkontroll over UTTAKSALDRE som setter setUttaksalder. */}

      {/* SEKSJON 2: Pilar-nedbrytning — projection.perPilar (folketrygd/spk/afp/særalder)
          som stablet søyle eller liste med kr/mnd + andel. */}

      {/* SEKSJON 3: Uttaksalder-sammenligning — sammenligning[]: alder vs monthlyTotal. */}

      {/* SEKSJON 4: Forutsetninger-panel — rediger settings (lønnsvekst, G-vekst,
          serviceStartYear, særalder av/på + alder, afpEnabled) → setPensionSettings(...). */}

      {settings.særalder.enabled && (
        <div className="flex items-start gap-2 rounded-lg border border-yellow-500/25 bg-yellow-500/10 px-3 py-2 text-[11px] text-yellow-400">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            Særalderspensjon er et foreløpig estimat — regelverket for født 1963+ er fortsatt under utvikling.
          </span>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        Estimat, ikke et løfte. Prognosen strekker seg ~40 år fram; G, delingstall og regelverk vil endre seg.
      </p>
    </div>
  )
}
```

> **Implementeringsnotat:** Fyll inn de fire seksjonene med faktisk markup i samme dense card-stil som `EconomyDashboard.tsx`/`SubscriptionsPage.tsx`. Bruk `fmtNOK`, `cn`, og `Button`. Sammenligningsseksjonen viser `sammenligning[i].uttaksalder` + `sammenligning[i].monthlyTotal`. Confidence-badgen viser `projection.confidence`.

- [ ] **Step 2: Verifiser bygg + typer**

Run: `npm run build`
Expected: PASS (typecheck + vite build uten feil).

- [ ] **Step 3: Manuell røyktest**

Run: `npm run dev`, åpne appen, naviger til Pensjon-fanen.
Expected: Siden laster; hero viser et månedsbeløp; bytte av uttaksalder oppdaterer tallene; særalder-toggle viser advarsel.

- [ ] **Step 4: Commit**

```bash
git add src/pages/economy/PensionPage.tsx
git commit -m "feat(pensjon): pensjonsside med hero, pilarer, sammenligning og forutsetninger

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 11: Dashboard-chip

**Files:**
- Modify: `src/pages/economy/EconomyDashboard.tsx`

- [ ] **Step 1: Legg til pengepuls-chip for forventet pensjon**

I `EconomyDashboard.tsx`:

a) Importer øverst:

```ts
import { projectPension } from '@/domain/economy/pensionCalculator'
import { GRUNNBELOP_NOK } from '@/config/economy.config'
```

b) Hent `pensionSettings` fra `useActiveEconomyStore()`-destruktureringen (legg til i lista ved `userPreferences`).

c) Etter de andre chip-blokkene (før `// ── Render ──`), legg til:

```ts
  // Pensjon-chip
  if (profile && userPreferences?.birthYear && (userPreferences.birthYear >= 1963)) {
    const fasteTillegg = (profile.fixedAdditions ?? []).reduce((s, t) => s + t.amount, 0)
    const spkGrunnlag = (profile.baseMonthly + fasteTillegg) * 12
    const ps = pensionSettings
    try {
      const proj = projectPension({
        birthYear: userPreferences.birthYear,
        serviceStartYear: ps?.serviceStartYear ?? currentYear - 5,
        currentYear,
        currentG: GRUNNBELOP_NOK,
        folketrygdAnnualIncome: spkGrunnlag * 1.05,
        spkAnnualGrunnlag: spkGrunnlag,
        uttaksalder: 67,
        salaryGrowthPct: ps?.assumptions.salaryGrowthPct ?? 3,
        gGrowthPct: ps?.assumptions.gGrowthPct ?? 3.5,
        afpEnabled: ps?.afpEnabled ?? true,
        særalder: ps?.særalder ?? { enabled: false, age: 60 },
      })
      chips.push({
        icon: '🏛️',
        text: `Forventet pensjon ~${Math.round(proj.monthlyTotal).toLocaleString('no-NO')} kr/mnd ved 67 (estimat)`,
      })
    } catch { /* født før 1963 — hopp over */ }
  }
```

- [ ] **Step 2: Verifiser bygg**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/pages/economy/EconomyDashboard.tsx
git commit -m "feat(pensjon): pengepuls-chip for forventet pensjon på dashbord

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 12: Sluttverifisering + dataforankring

**Files:** ingen kodeendring med mindre noe feiler.

- [ ] **Step 1: Full test + typecheck + build**

Run: `npm test && npm run typecheck && npm run build`
Expected: Alle PASS. Ingen feil.

- [ ] **Step 2: Verifiser/oppdater dataforankring (åpne punkter fra spec)**

Sjekk og oppdater i `src/config/economy.config.ts` ved behov:
- `GRUNNBELOP_NOK` mot gjeldende G på nav.no.
- `DELINGSTALL_BASELINE` — bytt 1963-baseline mot forventede delingstall for brukerens årskull hvis tilgjengelig fra nav.no; oppdater «sist verifisert»-dato.
- SPK-satsene (5,7 % / 18,1 %, tak 12G) mot gjeldende regelverk på spk.no.

Hvis verdier endres: kjør `npm test` på nytt (delingstall-interpolasjonstesten bruker tabellen relativt, så den skal fortsatt passere).

- [ ] **Step 3: Commit eventuelle dataoppdateringer**

```bash
git add src/config/economy.config.ts
git commit -m "chore(pensjon): verifiser G, delingstall og SPK-satser mot kilde

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review (utført av planforfatter)

- **Spec-dekning:** Folketrygd (Task 4), SPK-påslag (Task 5), AFP (Task 6), særalder usikker (Task 7), konstanter/delingstall (Task 2), datamodell (Task 1), store + migrering (Task 8), navigasjon (Task 9), UI med hero/pilar/sammenligning/forutsetninger + guards + usikkerhetsmerking (Task 10), dashboard-integrasjon (Task 11), testing (Task 2–8), åpne dataforankringspunkter (Task 12). Privat 4. søyle er bevisst utelatt (stretch/v1.1 i spec).
- **Placeholders:** Domene- og config-tasks har komplett kode + tester. UI-tasken har komplett skjelett med eksplisitt implementeringsnotat for de fire seksjonenes markup (bevisst, følger kodebasens dense card-stil) — verifiseres via `npm run build` + manuell røyktest.
- **Typekonsistens:** `PensionInput`, `PensionProjection`, `PensionSettings`, `DEFAULT_PENSION_SETTINGS`, og funksjonsnavnene (`accrueFolketrygdBeholdning`, `accrueSpkPaaslagBeholdning`, `annualAfp`, `sumLivsinntektUnder7_1G`, `annualFromBeholdning`, `projectPension`, `getDelingstall`) er konsistente på tvers av tasks.
- **Rekkefølge:** Task 9 (nav) avhenger av Task 10 (siden finnes) for typecheck — eksplisitt merknad lagt inn.
