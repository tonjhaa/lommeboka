# Bilkalkulator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bygg en planleggingskalkulator for bilkjøp — FINN-oppslag, lånematematikk (gjenbruk av eksisterende amortiseringsmotor), valgfrie driftskostnader, og en råd-sjekk mot budsjettmotorens overskuddstall.

**Architecture:** Ny toppnivå-side (`CarLoanCalculatorPage`) ved siden av boligkalkulatoren i navigasjonen, drevet av en ny liten Zustand-store (kun ett løpende sett input, ingen scenarioliste), en ren beregningsmotor (`carLoanCalculator.ts`) som gjenbruker `buildAmortizationPlan`, og en egen FINN-bilannonse-parser (`finnCarAdParser.ts`) — FINN Motor har en helt annen HTML-struktur enn boligannonser, verifisert mot ekte annonser under research.

**Tech Stack:** React 19, TypeScript, Zustand (persist), Vitest, Vercel serverless function (`api/finn.ts`), Tailwind CSS + shadcn-komponenter.

**Referanse:** `docs/superpowers/specs/2026-07-10-bilkalkulator-design.md`

---

## Research-funn som denne planen bygger på

FINN Motor-annonser (`https://www.finn.no/mobility/item/<finnkode>`) ble hentet og inspisert direkte (juli 2026) for å verifisere faktisk HTML-struktur før parser-koden ble skrevet:

- **Pris**: ligger IKKE som dt/dd slik boligannonser gjør. Ligger i et `<script type="application/ld+json">`-innslag med `"@type":"Product"`, feltet `offers.price` (rått tall, NOK). Siden har flere ld+json-blokker (BreadcrumbList, Product, Organization) — må filtrere på `@type`.
- **Årsmodell, kilometerstand, drivstoff**: en fast "hurtigfakta"-ikonrad øverst i annonsen, med mønsteret
  `<span class="s-text-subtle">LABEL</span><p class="m-0 font-bold">VERDI</p>`. Bekreftede labels: `Modellår` (f.eks. "2019"), `Kilometerstand` (f.eks. "90&nbsp;500 km" — bruker faktisk NBSP-tegn, ikke HTML-entiteten), `Drivstoff` (bekreftede verdier: "Bensin", "Diesel", "El").
- Girkasse/Hjuldrift lenger ned på siden bruker derimot ekte `<dt>`/`<dd>`-par (samme mønster som boligannonser) — ikke relevant for denne kalkulatoren, men verdt å vite at siden blander begge mønstre.

---

### Task 1: Beregningsmotor — `carLoanCalculator.ts`

**Files:**
- Create: `src/utils/carLoanCalculator.ts`
- Test: `src/utils/__tests__/carLoanCalculator.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/utils/__tests__/carLoanCalculator.test.ts
import { describe, it, expect } from 'vitest'
import { calculateCarLoan, estimateFuelCost, type CarLoanInputs } from '../carLoanCalculator'

function baseInputs(overrides: Partial<CarLoanInputs> = {}): CarLoanInputs {
  return {
    price: 300_000,
    equity: 50_000,
    annualRate: 6,
    termYears: 5,
    loanType: 'annuitet',
    fuelType: null,
    year: null,
    mileageKm: null,
    runningCosts: {
      insurance: { enabled: false, monthlyAmount: 0 },
      fuel: { enabled: false, monthlyAmount: 0 },
      maintenance: { enabled: false, yearlyAmount: 0 },
    },
    availableMonthlyBudget: 10_000,
    ...overrides,
  }
}

describe('calculateCarLoan', () => {
  it('lånebeløp = pris minus egenkapital', () => {
    const result = calculateCarLoan(baseInputs({ price: 300_000, equity: 50_000 }))
    expect(result.loanAmount).toBe(250_000)
  })

  it('terminbeløp kommer fra amortiseringsplanens første rad', () => {
    const result = calculateCarLoan(baseInputs())
    expect(result.monthlyInstallment).toBe(result.amortization.rows[0].payment)
    expect(result.monthlyInstallment).toBeGreaterThan(0)
  })

  it('driftskostnader som er avslått teller ikke med', () => {
    const result = calculateCarLoan(baseInputs({
      runningCosts: {
        insurance: { enabled: false, monthlyAmount: 1000 },
        fuel: { enabled: false, monthlyAmount: 1500 },
        maintenance: { enabled: false, yearlyAmount: 12_000 },
      },
    }))
    expect(result.totalRunningCostMonthly).toBe(0)
    expect(result.totalMonthlyCost).toBe(result.monthlyInstallment)
  })

  it('påslåtte driftskostnader summeres — årlig service deles på 12', () => {
    const result = calculateCarLoan(baseInputs({
      runningCosts: {
        insurance: { enabled: true, monthlyAmount: 1000 },
        fuel: { enabled: true, monthlyAmount: 1500 },
        maintenance: { enabled: true, yearlyAmount: 12_000 },
      },
    }))
    expect(result.totalRunningCostMonthly).toBe(1000 + 1500 + 1000) // 12000/12 = 1000
    expect(result.totalMonthlyCost).toBe(result.monthlyInstallment + 3500)
  })

  it('affordability = ok når totalkostnad er innenfor budsjett', () => {
    const result = calculateCarLoan(baseInputs({ price: 60_000, equity: 60_000, availableMonthlyBudget: 5000 }))
    expect(result.loanAmount).toBe(0)
    expect(result.affordability).toBe('ok')
  })

  it('affordability = stramt når totalkostnad er inntil 10% over budsjett', () => {
    // Lånebeløp gir terminbeløp rett over budsjett, men innenfor 10%-margin
    const result = calculateCarLoan(baseInputs({
      price: 300_000, equity: 0, annualRate: 6, termYears: 5,
      availableMonthlyBudget: 5300, // terminbeløp for 300k/6%/5år er ca 5800
    }))
    expect(result.totalMonthlyCost).toBeGreaterThan(5300)
    expect(result.totalMonthlyCost).toBeLessThanOrEqual(5300 * 1.1)
    expect(result.affordability).toBe('stramt')
  })

  it('affordability = ikke-rad når totalkostnad er over 10% over budsjett', () => {
    const result = calculateCarLoan(baseInputs({
      price: 300_000, equity: 0, annualRate: 6, termYears: 5,
      availableMonthlyBudget: 1000,
    }))
    expect(result.affordability).toBe('ikke-rad')
  })

  it('totalInterestCost kommer fra amortiseringsplanens totalInterestPaid', () => {
    const result = calculateCarLoan(baseInputs())
    expect(result.totalInterestCost).toBe(result.amortization.totalInterestPaid)
    expect(result.totalInterestCost).toBeGreaterThan(0)
  })
})

describe('estimateFuelCost', () => {
  it('bruker km/år estimert fra kilometerstand delt på bilens alder', () => {
    const nowYear = new Date().getFullYear()
    // Bil kjøpt/registrert 5 år siden med 100 000 km => 20 000 km/år
    const cost = estimateFuelCost('bensin', 100_000, nowYear - 5)
    // 20 000 km/år * 1.8 kr/km / 12 mnd = 3000 kr/mnd
    expect(cost).toBe(3000)
  })

  it('faller tilbake på 15 000 km/år når år eller km mangler', () => {
    const withoutYear = estimateFuelCost('bensin', 100_000, null)
    const withoutKm = estimateFuelCost('bensin', null, 2020)
    // 15 000 km/år * 1.8 / 12 = 2250 kr/mnd
    expect(withoutYear).toBe(2250)
    expect(withoutKm).toBe(2250)
  })

  it('el er billigere per km enn bensin', () => {
    const bensin = estimateFuelCost('bensin', 100_000, new Date().getFullYear() - 5)
    const el = estimateFuelCost('el', 100_000, new Date().getFullYear() - 5)
    expect(el).toBeLessThan(bensin)
  })

  it('ukjent/manglende drivstofftype bruker fallback-sats', () => {
    const cost = estimateFuelCost(null, 100_000, new Date().getFullYear() - 5)
    // 20 000 km/år * 1.5 (fallback) / 12 = 2500 kr/mnd
    expect(cost).toBe(2500)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/utils/__tests__/carLoanCalculator.test.ts`
Expected: FAIL — `Cannot find module '../carLoanCalculator'`

- [ ] **Step 3: Write the implementation**

```typescript
// src/utils/carLoanCalculator.ts
import { buildAmortizationPlan } from './amortization'
import type { AmortizationPlan } from '@/types'

/**
 * Beregningsmotor for bilkalkulatoren. Gjenbruker den eksisterende
 * amortiseringsmotoren (buildAmortizationPlan, samme som boligkalkulatoren
 * bruker) — ingen ny lånematematikk her.
 */

export type FuelType = 'bensin' | 'diesel' | 'el' | 'hybrid'

export interface RunningCostToggle {
  enabled: boolean
  monthlyAmount: number
}

export interface RunningCostYearlyToggle {
  enabled: boolean
  yearlyAmount: number
}

export interface CarLoanInputs {
  price: number
  equity: number
  annualRate: number
  termYears: number
  loanType: 'annuitet' | 'serie'
  fuelType: FuelType | null
  year: number | null
  mileageKm: number | null
  runningCosts: {
    insurance: RunningCostToggle
    fuel: RunningCostToggle
    maintenance: RunningCostYearlyToggle
  }
  availableMonthlyBudget: number
}

export interface CarLoanResult {
  loanAmount: number
  amortization: AmortizationPlan
  monthlyInstallment: number
  totalRunningCostMonthly: number
  totalMonthlyCost: number
  totalInterestCost: number
  affordability: 'ok' | 'stramt' | 'ikke-rad'
}

// Sjablongverdier (kr/km, 2026-nivå) — kun et startforslag, brukeren overstyrer.
const FUEL_COST_PER_KM: Record<FuelType, number> = {
  bensin: 1.8,
  diesel: 1.6,
  el: 0.5,
  hybrid: 1.2,
}
const FUEL_COST_PER_KM_FALLBACK = 1.5
const DEFAULT_ANNUAL_KM = 15_000

/**
 * Estimerer månedlig drivstoff-/ladekostnad. `mileageKm` er kilometerstanden
 * (totalt kjørt siden ny, IKKE årlig kjørelengde) — kombinert med `year`
 * (årsmodell) gir det et estimat på faktisk årlig kjørelengde for akkurat
 * denne bilen: km / (inneværende år - årsmodell). Faller tilbake på et
 * nasjonalt gjennomsnitt (15 000 km/år) når data mangler.
 */
export function estimateFuelCost(
  fuelType: FuelType | null,
  mileageKm: number | null,
  year: number | null
): number {
  const ageYears = year ? Math.max(1, new Date().getFullYear() - year) : null
  const estimatedAnnualKm = mileageKm && ageYears ? mileageKm / ageYears : DEFAULT_ANNUAL_KM
  const costPerKm = fuelType ? FUEL_COST_PER_KM[fuelType] : FUEL_COST_PER_KM_FALLBACK
  return Math.round((estimatedAnnualKm * costPerKm) / 12)
}

export function calculateCarLoan(inputs: CarLoanInputs): CarLoanResult {
  const loanAmount = Math.max(0, inputs.price - inputs.equity)
  const amortization = buildAmortizationPlan(
    'bilkalkulator',
    loanAmount,
    inputs.annualRate,
    inputs.termYears,
    inputs.loanType
  )
  const monthlyInstallment = amortization.rows[0]?.payment ?? 0

  const { insurance, fuel, maintenance } = inputs.runningCosts
  const totalRunningCostMonthly =
    (insurance.enabled ? insurance.monthlyAmount : 0) +
    (fuel.enabled ? fuel.monthlyAmount : 0) +
    (maintenance.enabled ? maintenance.yearlyAmount / 12 : 0)

  const totalMonthlyCost = monthlyInstallment + totalRunningCostMonthly

  let affordability: CarLoanResult['affordability']
  if (totalMonthlyCost <= inputs.availableMonthlyBudget) {
    affordability = 'ok'
  } else if (totalMonthlyCost <= inputs.availableMonthlyBudget * 1.1) {
    affordability = 'stramt'
  } else {
    affordability = 'ikke-rad'
  }

  return {
    loanAmount,
    amortization,
    monthlyInstallment,
    totalRunningCostMonthly,
    totalMonthlyCost,
    totalInterestCost: amortization.totalInterestPaid,
    affordability,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/utils/__tests__/carLoanCalculator.test.ts`
Expected: PASS — 11 tests.

Hvis `stramt`-testen feiler fordi terminbeløpet for 300k/6%/5 år ikke faktisk
havner mellom 5300 og 5830 (5300×1.1): kjør testen med `console.log(result.monthlyInstallment)`
og juster `availableMonthlyBudget` i testen til en verdi som faktisk ligger i
stramt-vinduet for den beregnede annuiteten — ikke endre produksjonskoden for
å få testen til å passe.

- [ ] **Step 5: Commit**

```bash
git add src/utils/carLoanCalculator.ts src/utils/__tests__/carLoanCalculator.test.ts
git commit -m "feat(bilkalkulator): beregningsmotor for lån, driftskostnader og råd-sjekk"
```

---

### Task 2: FINN-bilannonse-parser — `finnCarAdParser.ts`

**Files:**
- Create: `src/domain/finn/finnCarAdParser.ts`
- Test: `src/domain/finn/__tests__/finnCarAdParser.test.ts`

- [ ] **Step 1: Write the failing tests**

Fixturene under speiler EKTE FINN Motor-annonser hentet og inspisert under
research for denne planen (Nissan Leaf, en bensinbil, en dieselbil) — samme
klassenavn (`s-text-subtle`, `m-0 font-bold`) og samme ld+json-struktur som
i de faktiske sidene.

```typescript
// src/domain/finn/__tests__/finnCarAdParser.test.ts
import { describe, it, expect } from 'vitest'
import { parseFinnCarAd } from '../finnCarAdParser'

const FIXTURE_EL = `
<html><head>
<meta property="og:title" content="Nissan Leaf til salgs"/>
</head><body>
<div class="grid mt-16 gap-24"><div class="flex gap-16 hyphens-auto"><div class="flex items-center"><w-icon name="Calendar"></w-icon></div><div><span class="s-text-subtle">Modellår</span><p class="m-0 font-bold">2019</p></div></div><div class="flex gap-16 hyphens-auto"><div class="flex items-center"><w-icon name="Speedometer"></w-icon></div><div><span class="s-text-subtle">Kilometerstand</span><p class="m-0 font-bold">90 500 km</p></div></div><div class="flex gap-16 hyphens-auto"><div class="flex items-center"><w-icon name="Road"></w-icon></div><div><span class="s-text-subtle">Rekkevidde (WLTP)</span><p class="m-0 font-bold">270 km</p></div></div><div class="flex gap-16 hyphens-auto"><div class="flex items-center"><w-icon name="Charger"></w-icon></div><div><span class="s-text-subtle">Drivstoff</span><p class="m-0 font-bold">El</p></div></div></div>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[]}</script>
<script type="application/ld+json">
{
  "@type": "Product",
  "@context": "https://schema.org",
  "name": "Nissan Leaf",
  "offers": {
    "@type": "Offer",
    "price": 129532,
    "priceCurrency": "NOK",
    "seller": { "@type": "Person" }
  },
  "brand": { "@type": "Brand", "name": "Nissan" },
  "model": "Leaf"
}
</script>
</body></html>`

const FIXTURE_BENSIN_MINIMAL = `
<html><head><meta property="og:title" content="Golf til salgs"/></head><body>
<div><span class="s-text-subtle">Modellår</span><p class="m-0 font-bold">2015</p></div>
<div><span class="s-text-subtle">Kilometerstand</span><p class="m-0 font-bold">142 000 km</p></div>
<div><span class="s-text-subtle">Drivstoff</span><p class="m-0 font-bold">Bensin</p></div>
<script type="application/ld+json">{"@type":"Product","@context":"https://schema.org","offers":{"@type":"Offer","price":89000}}</script>
</body></html>`

const FIXTURE_NO_PRICE = `
<html><head><meta property="og:title" content="Solgt bil"/></head><body>
<div><span class="s-text-subtle">Modellår</span><p class="m-0 font-bold">2018</p></div>
</body></html>`

describe('parseFinnCarAd', () => {
  it('parser alle felt fra en el-bil-fixture', () => {
    const d = parseFinnCarAd(FIXTURE_EL, '469404429')
    expect(d.finnkode).toBe('469404429')
    expect(d.tittel).toBe('Nissan Leaf til salgs')
    expect(d.price).toBe(129_532)
    expect(d.year).toBe(2019)
    expect(d.mileageKm).toBe(90_500)
    expect(d.fuelType).toBe('el')
  })

  it('parser en minimal bensinbil-fixture', () => {
    const d = parseFinnCarAd(FIXTURE_BENSIN_MINIMAL, '469406530')
    expect(d.price).toBe(89_000)
    expect(d.year).toBe(2015)
    expect(d.mileageKm).toBe(142_000)
    expect(d.fuelType).toBe('bensin')
  })

  it('manglende pris gir null, ikke krasj', () => {
    const d = parseFinnCarAd(FIXTURE_NO_PRICE, '000000000')
    expect(d.price).toBeNull()
    expect(d.year).toBe(2018)
    expect(d.mileageKm).toBeNull()
    expect(d.fuelType).toBeNull()
  })

  it('ignorerer ld+json-blokker som ikke er @type Product', () => {
    // FIXTURE_EL har en BreadcrumbList-blokk FØR Product-blokken —
    // bekrefter at parseren ikke plukker feil blokk.
    const d = parseFinnCarAd(FIXTURE_EL, '469404429')
    expect(d.price).toBe(129_532)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/domain/finn/__tests__/finnCarAdParser.test.ts`
Expected: FAIL — `Cannot find module '../finnCarAdParser'`

- [ ] **Step 3: Write the implementation**

```typescript
// src/domain/finn/finnCarAdParser.ts
/**
 * Parser for FINN.no-bilannonser (server-rendret HTML, FINN Motor / mobility).
 *
 * Helt annen sidestruktur enn boligannonser (finnAdParser.ts): nøkkelfeltene
 * (årsmodell, kilometerstand, drivstoff) ligger i faste "hurtigfakta"-rader
 * (<span class="s-text-subtle">LABEL</span><p class="m-0 font-bold">VERDI</p>),
 * og prisen ligger i et innebygd JSON-LD Product-objekt
 * (<script type="application/ld+json">) i stedet for en egen
 * prisantydnings-span slik boligannonser har. Verifisert mot ekte annonser
 * (finn.no/mobility/item/<finnkode>) under research for denne funksjonen —
 * bevisst tolerant på samme måte som finnAdParser: manglende felt blir null,
 * kaster ikke.
 */

export type FinnCarFuelType = 'bensin' | 'diesel' | 'el' | 'hybrid'

export interface FinnCarAdData {
  finnkode: string
  tittel: string | null
  price: number | null
  year: number | null
  mileageKm: number | null
  fuelType: FinnCarFuelType | null
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Trekker <p class="m-0 font-bold">VERDI</p>-innholdet for en gitt hurtigfakta-label */
function quickFact(html: string, label: string): string | null {
  const re = new RegExp(
    `<span[^>]*class="[^"]*s-text-subtle[^"]*"[^>]*>\\s*${escapeRegExp(label)}\\s*</span>\\s*` +
    `<p[^>]*class="[^"]*font-bold[^"]*"[^>]*>([^<]*)</p>`
  )
  const m = html.match(re)
  if (!m) return null
  return m[1].replace(/ |&nbsp;|&#160;/g, ' ').trim()
}

/** Trekker første heltall ut av en tekst som «90 500 km» */
function parseIntFromText(text: string | null): number | null {
  if (!text) return null
  const digits = text.match(/[\d\s]+/)?.[0]?.replace(/\s/g, '')
  if (!digits) return null
  const n = parseInt(digits, 10)
  return Number.isFinite(n) ? n : null
}

function parseFuelType(text: string | null): FinnCarFuelType | null {
  if (!text) return null
  const t = text.toLowerCase()
  if (t.includes('hybrid')) return 'hybrid'
  if (t.includes('el')) return 'el'
  if (t.includes('diesel')) return 'diesel'
  if (t.includes('bensin')) return 'bensin'
  return null
}

/** Henter prisen fra JSON-LD-blokken med @type "Product" (offers.price) */
function extractProductPrice(html: string): number | null {
  const scripts = html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)
  for (const m of scripts) {
    try {
      const data = JSON.parse(m[1]) as { '@type'?: string; offers?: { price?: number } }
      if (data['@type'] === 'Product' && typeof data.offers?.price === 'number') {
        return data.offers.price
      }
    } catch {
      continue
    }
  }
  return null
}

/** Parser en FINN-bilannonseside. Kaster ikke — manglende felt blir null. */
export function parseFinnCarAd(html: string, finnkode: string): FinnCarAdData {
  const tittel = html.match(/property="og:title" content="([^"]+)"/i)?.[1]?.trim() ?? null

  return {
    finnkode,
    tittel,
    price: extractProductPrice(html),
    year: parseIntFromText(quickFact(html, 'Modellår')),
    mileageKm: parseIntFromText(quickFact(html, 'Kilometerstand')),
    fuelType: parseFuelType(quickFact(html, 'Drivstoff')),
  }
}

export class FinnCarLookupError extends Error {
  statusCode: number
  constructor(message: string, statusCode: number) {
    super(message)
    this.name = 'FinnCarLookupError'
    this.statusCode = statusCode
  }
}

/**
 * Henter og parser en FINN-bilannonse. Kjøres SERVER-SIDE (Vercel-funksjon) —
 * nettleseren blokkeres av CORS.
 */
export async function fetchFinnCarAd(finnkode: string): Promise<FinnCarAdData> {
  const url = `https://www.finn.no/mobility/item/${finnkode}`
  const res = await fetch(url, {
    redirect: 'follow',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'nb-NO,nb;q=0.9',
    },
  })
  if (res.status === 404) {
    throw new FinnCarLookupError('Fant ingen annonse med denne FINN-koden. Sjekk koden og prøv igjen.', 404)
  }
  if (!res.ok) {
    throw new FinnCarLookupError(`FINN svarte med ${res.status} — prøv igjen om litt.`, 502)
  }
  const html = await res.text()
  const data = parseFinnCarAd(html, finnkode)
  if (data.price === null) {
    throw new FinnCarLookupError(
      'Fant annonsen, men klarte ikke å lese prisen (annonsen kan være solgt/utløpt eller av en type kalkulatoren ikke støtter).',
      422
    )
  }
  return data
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/domain/finn/__tests__/finnCarAdParser.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/domain/finn/finnCarAdParser.ts src/domain/finn/__tests__/finnCarAdParser.test.ts
git commit -m "feat(bilkalkulator): FINN-bilannonse-parser (egen HTML-struktur fra bolig)"
```

---

### Task 3: Utvid `api/finn.ts` til å rute biloppslag

**Files:**
- Modify: `api/finn.ts`

- [ ] **Step 1: Les gjeldende fil**

Filen er allerede lest i sin helhet under planleggingen (se over) — ingen
egen test-fil finnes for denne (Vercel-funksjoner i dette prosjektet testes
ikke automatisk, kun `finnAdParser.ts`/`finnCarAdParser.ts` sin ren-funksjon-
logikk er enhetstestet). Verifiseres manuelt i Task 8.

- [ ] **Step 2: Skriv om filen til å rute på `type`-parameter**

```typescript
// api/finn.ts
// NB: .js-endelsen er PÅKREVD: package.json har "type":"module", så Vercel
// kjører funksjonen som ESM — Node-ESM krever eksplisitt endelse i relative
// imports (uten den: ERR_MODULE_NOT_FOUND i /var/task). TS mapper .js → .ts.
import { fetchFinnAd, isValidFinnkode, FinnLookupError } from '../src/domain/finn/finnAdParser.js'
import { fetchFinnCarAd, FinnCarLookupError } from '../src/domain/finn/finnCarAdParser.js'

// Minimal strukturell typing — unngår @vercel/node-avhengighet.
// (api/ ligger utenfor tsconfig-include; Vercel bygger funksjonen med esbuild.)
interface Req {
  method?: string
  query: Record<string, string | string[] | undefined>
}
interface Res {
  status(code: number): Res
  setHeader(name: string, value: string): void
  json(body: unknown): void
}

/**
 * GET /api/finn?finnkode=468534269[&type=car]
 * Henter og parser en FINN-annonse server-side (CORS hindrer nettleseren).
 * type=housing (default, bakoverkompatibel) → boligannonse. type=car → bilannonse.
 * Personlig bruksmønster: enkeltoppslag initiert av brukeren, med CDN-cache
 * så samme annonse ikke hentes på nytt innen en time.
 */
export default async function handler(req: Req, res: Res) {
  if (req.method && req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  const rawFinnkode = req.query.finnkode
  const finnkode = (Array.isArray(rawFinnkode) ? rawFinnkode[0] : rawFinnkode ?? '').trim()
  const rawType = req.query.type
  const type = Array.isArray(rawType) ? rawType[0] : rawType

  if (!isValidFinnkode(finnkode)) {
    res.status(400).json({ error: 'Ugyldig FINN-kode — lim inn tallet fra annonsen (8–10 sifre).' })
    return
  }

  try {
    const data = type === 'car' ? await fetchFinnCarAd(finnkode) : await fetchFinnAd(finnkode)
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
    res.status(200).json(data)
  } catch (err) {
    if (err instanceof FinnLookupError || err instanceof FinnCarLookupError) {
      res.status(err.statusCode).json({ error: err.message })
      return
    }
    res.status(502).json({ error: 'Klarte ikke å hente annonsen fra FINN. Prøv igjen, eller fyll inn tallene manuelt.' })
  }
}
```

- [ ] **Step 3: Bygg for å bekrefte ingen typefeil**

Run: `npm run build`
Expected: Bygget fullfører uten feil (`api/`-mappen bygges av Vercel med esbuild
ved deploy, men `tsc -b` for resten av appen må uansett gå gjennom).

- [ ] **Step 4: Commit**

```bash
git add api/finn.ts
git commit -m "feat(bilkalkulator): rut /api/finn til bilannonse-parser ved type=car"
```

---

### Task 4: Ny store — `useCarLoanCalculatorStore.ts`

**Files:**
- Create: `src/store/useCarLoanCalculatorStore.ts`
- Modify: `src/App.tsx:94` (STORE_KEYS-opprydding)

- [ ] **Step 1: Skriv storen**

```typescript
// src/store/useCarLoanCalculatorStore.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CarLoanInputs } from '@/utils/carLoanCalculator'

interface CarLoanCalculatorState {
  inputs: CarLoanInputs
  /** Har brukeren selv skrevet inn "disponibelt til bil"? Hvis true, slutter
   *  useCarLoanCalculator å overstyre feltet med budsjett-forslaget. */
  availableMonthlyBudgetIsManual: boolean
  setInputs: (patch: Partial<CarLoanInputs>) => void
  setAvailableMonthlyBudget: (amount: number, isManual: boolean) => void
  setRunningCostToggle: (key: 'insurance' | 'fuel', patch: Partial<{ enabled: boolean; monthlyAmount: number }>) => void
  setMaintenanceToggle: (patch: Partial<{ enabled: boolean; yearlyAmount: number }>) => void
}

const DEFAULT_INPUTS: CarLoanInputs = {
  price: 0,
  equity: 0,
  annualRate: 6.5,
  termYears: 5,
  loanType: 'annuitet',
  fuelType: null,
  year: null,
  mileageKm: null,
  runningCosts: {
    insurance: { enabled: false, monthlyAmount: 0 },
    fuel: { enabled: false, monthlyAmount: 0 },
    maintenance: { enabled: false, yearlyAmount: 12_000 },
  },
  availableMonthlyBudget: 0,
}

export const useCarLoanCalculatorStore = create<CarLoanCalculatorState>()(
  persist(
    (set) => ({
      inputs: DEFAULT_INPUTS,
      availableMonthlyBudgetIsManual: false,

      setInputs: (patch) => set((s) => ({ inputs: { ...s.inputs, ...patch } })),

      setAvailableMonthlyBudget: (amount, isManual) =>
        set((s) => ({
          inputs: { ...s.inputs, availableMonthlyBudget: amount },
          availableMonthlyBudgetIsManual: isManual,
        })),

      setRunningCostToggle: (key, patch) =>
        set((s) => ({
          inputs: {
            ...s.inputs,
            runningCosts: {
              ...s.inputs.runningCosts,
              [key]: { ...s.inputs.runningCosts[key], ...patch },
            },
          },
        })),

      setMaintenanceToggle: (patch) =>
        set((s) => ({
          inputs: {
            ...s.inputs,
            runningCosts: {
              ...s.inputs.runningCosts,
              maintenance: { ...s.inputs.runningCosts.maintenance, ...patch },
            },
          },
        })),
    }),
    { name: 'lommeboka-bilkalkulator-v1' }
  )
)
```

- [ ] **Step 2: Registrer den nye persist-nøkkelen i brukerbytte-oppryddingen**

Åpne `src/App.tsx`, finn linje 94 (`const STORE_KEYS = [...]`), og legg til
`'lommeboka-bilkalkulator-v1'`:

```typescript
    const STORE_KEYS = ['min-okonomi-v1', 'lommeboka-partner-v1', 'lommeboka-gaver-v1', 'lommeboka-permisjon-v1', 'boligkalkulator-storage', 'lommeboka-bilkalkulator-v1']
```

Dette er bevisst inkludert som eget steg: samme klasse glipp
(en ny persist-nøkkel som ikke ble lagt til her) var årsaken til en reell
datalekkasje-risiko som ble undersøkt og fikset tidligere i prosjektet
(`c21f3e0 fix(auth): rydd stale brukerdata ved brukerskifte`).

- [ ] **Step 3: Bygg for å bekrefte ingen typefeil**

Run: `npm run build`
Expected: Ingen feil.

- [ ] **Step 4: Commit**

```bash
git add src/store/useCarLoanCalculatorStore.ts src/App.tsx
git commit -m "feat(bilkalkulator): ny persistert store + registrer i brukerbytte-opprydding"
```

---

### Task 5: Navigasjon — ny `AppView`, nav-rad, lazy route

**Files:**
- Modify: `src/store/useAppStore.ts:14`
- Modify: `src/components/layout/MainNav.tsx:73`
- Modify: `src/App.tsx`

- [ ] **Step 1: Legg til ny `AppView`-verdi**

I `src/store/useAppStore.ts`, endre linje 14:

```typescript
export type AppView = 'calculator' | 'economy' | 'skattekalkulator' | 'partner' | 'ivf' | 'billan'
```

- [ ] **Step 2: Legg til nav-raden**

I `src/components/layout/MainNav.tsx`, i `fremtid`-gruppens `items`-liste
(linje ~68-75), legg til rett under `Boligkalkulator`:

```typescript
  {
    id: 'fremtid', label: 'Fremtid', Icon: TrendingUp,
    items: [
      { label: 'Veikart', target: { kind: 'economy', page: 'veikart' }, requiresTab: 'veikart' },
      { label: 'Simulator', target: { kind: 'economy', page: 'scenario' }, requiresTab: 'scenario' },
      { label: 'Pensjon', target: { kind: 'economy', page: 'pension' }, requiresTab: 'pension' },
      { label: 'Boligkalkulator', target: { kind: 'view', view: 'calculator' } },
      { label: 'Bilkalkulator', target: { kind: 'view', view: 'billan' } },
      { label: 'Skattekalkulator', target: { kind: 'view', view: 'skattekalkulator' } },
    ],
  },
```

- [ ] **Step 3: Registrer lazy route i `App.tsx`**

I `src/App.tsx`, legg til en ny lazy import rett etter `IVFPageTop` (linje ~30):

```typescript
const CarLoanCalculatorPage = lazyWithRetry(() =>
  import('@/pages/CarLoanCalculatorPage').then((m) => ({ default: m.CarLoanCalculatorPage }))
)
```

I `AppContent`-komponenten, legg til rendring rett etter `ivf`-viewet
(samme sted som de andre `currentView === '...'`-grenene):

```typescript
        {currentView === 'ivf' && (
          <Suspense fallback={<PageFallback />}>
            <IVFPageTop />
          </Suspense>
        )}
        {currentView === 'billan' && (
          <Suspense fallback={<PageFallback />}>
            <CarLoanCalculatorPage />
          </Suspense>
        )}
```

(Legg denne blokken inn rett etter den eksisterende `ivf`-blokken i
`AppContent`-funksjonens JSX — se `src/App.tsx` linje ~65-69 for eksakt
plassering blant de andre `currentView`-sjekkene.)

- [ ] **Step 4: Bygg for å bekrefte ingen typefeil**

Dette steget vil FEILE frem til Task 6 er gjort (siden `CarLoanCalculatorPage`
ikke finnes ennå) — det er forventet. Ikke commit ennå.

Run: `npm run build`
Expected: FEIL — `Cannot find module '@/pages/CarLoanCalculatorPage'`. Fortsett til Task 6 før commit.

---

### Task 6: Hook — `useCarLoanCalculator.ts`

**Files:**
- Create: `src/hooks/useCarLoanCalculator.ts`

- [ ] **Step 1: Skriv hooken**

Ingen egen enhetstest her — hooken er ren sammenkobling av allerede testet
logikk (`calculateCarLoan`) og React-state/budsjett-hooken; verifiseres
manuelt sammen med siden i Task 8 (samme testfilosofi som `useCalculator.ts`
for boligkalkulatoren, som heller ikke har egen test).

```typescript
// src/hooks/useCarLoanCalculator.ts
import { useEffect, useMemo } from 'react'
import { useCarLoanCalculatorStore } from '@/store/useCarLoanCalculatorStore'
import { useBudgetTable } from './useBudgetTable'
import { calculateCarLoan, type CarLoanResult } from '@/utils/carLoanCalculator'

/**
 * Kobler bilkalkulator-storen mot beregningsmotoren, og forhåndsfyller
 * "disponibelt til bil per måned" med inneværende måneds OVERSKUDD fra
 * budsjettmotoren — helt til brukeren skriver inn et eget tall selv
 * (`availableMonthlyBudgetIsManual`), da respekteres det manuelle tallet
 * og overstyres ikke igjen automatisk ved senere besøk.
 */
export function useCarLoanCalculator(): { result: CarLoanResult } {
  const inputs = useCarLoanCalculatorStore((s) => s.inputs)
  const isManual = useCarLoanCalculatorStore((s) => s.availableMonthlyBudgetIsManual)
  const setAvailableMonthlyBudget = useCarLoanCalculatorStore((s) => s.setAvailableMonthlyBudget)

  const { table } = useBudgetTable(new Date().getFullYear())

  const suggestedBudget = useMemo(() => {
    const overskuddRow = table.sections
      .find((s) => s.key === 'BUNN')
      ?.rows.find((r) => r.id === 'overskudd')
    const currentMonthIndex = new Date().getMonth()
    return Math.max(0, Math.round(overskuddRow?.cells[currentMonthIndex]?.budget ?? 0))
  }, [table])

  useEffect(() => {
    if (!isManual && inputs.availableMonthlyBudget !== suggestedBudget) {
      setAvailableMonthlyBudget(suggestedBudget, false)
    }
  }, [isManual, suggestedBudget, inputs.availableMonthlyBudget, setAvailableMonthlyBudget])

  const result = useMemo(() => calculateCarLoan(inputs), [inputs])

  return { result }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useCarLoanCalculator.ts
git commit -m "feat(bilkalkulator): hook som kobler store, budsjettmotor og beregningsmotor"
```

---

### Task 7: Siden — `CarLoanCalculatorPage.tsx`

**Files:**
- Create: `src/pages/CarLoanCalculatorPage.tsx`

- [ ] **Step 1: Skriv siden**

```typescript
// src/pages/CarLoanCalculatorPage.tsx
import { useState } from 'react'
import { Search, Loader2, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NumberInput } from '@/components/ui/number-input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AmortizationTable } from '@/components/charts/AmortizationTable'
import { AmortizationChart } from '@/components/charts/AmortizationChart'
import { useCarLoanCalculatorStore } from '@/store/useCarLoanCalculatorStore'
import { useCarLoanCalculator } from '@/hooks/useCarLoanCalculator'
import { estimateFuelCost, type FuelType } from '@/utils/carLoanCalculator'
import { isValidFinnkode } from '@/domain/finn/finnAdParser'
import type { FinnCarAdData } from '@/domain/finn/finnCarAdParser'

function fmtNOK(n: number): string {
  return Math.round(n).toLocaleString('no-NO') + ' kr'
}

const FUEL_LABELS: Record<FuelType, string> = {
  bensin: 'Bensin',
  diesel: 'Diesel',
  el: 'El',
  hybrid: 'Hybrid',
}

export function CarLoanCalculatorPage() {
  const inputs = useCarLoanCalculatorStore((s) => s.inputs)
  const setInputs = useCarLoanCalculatorStore((s) => s.setInputs)
  const setAvailableMonthlyBudget = useCarLoanCalculatorStore((s) => s.setAvailableMonthlyBudget)
  const setRunningCostToggle = useCarLoanCalculatorStore((s) => s.setRunningCostToggle)
  const setMaintenanceToggle = useCarLoanCalculatorStore((s) => s.setMaintenanceToggle)
  const { result } = useCarLoanCalculator()

  const [finnkode, setFinnkode] = useState('')
  const [finnLoading, setFinnLoading] = useState(false)
  const [finnError, setFinnError] = useState<string | null>(null)

  async function handleFinnLookup() {
    const code = finnkode.trim()
    if (!isValidFinnkode(code)) {
      setFinnError('Ugyldig FINN-kode — lim inn tallet fra annonsen (8–10 sifre).')
      return
    }
    setFinnLoading(true)
    setFinnError(null)
    try {
      const res = await fetch(`/api/finn?finnkode=${code}&type=car`)
      const data = (await res.json()) as FinnCarAdData | { error: string }
      if (!res.ok || 'error' in data) {
        setFinnError('error' in data ? data.error : 'Klarte ikke å hente annonsen.')
        return
      }
      setInputs({
        price: data.price ?? inputs.price,
        year: data.year,
        mileageKm: data.mileageKm,
        fuelType: data.fuelType,
      })
      // Foreslå drivstoffkostnad ut fra de nye tallene, men ikke overskriv
      // et beløp brukeren allerede har justert manuelt inn i feltet under.
      if (!inputs.runningCosts.fuel.enabled) {
        setRunningCostToggle('fuel', {
          monthlyAmount: estimateFuelCost(data.fuelType, data.mileageKm, data.year),
        })
      }
    } catch {
      setFinnError('Klarte ikke å nå FINN. Prøv igjen, eller fyll inn tallene manuelt.')
    } finally {
      setFinnLoading(false)
    }
  }

  const affordabilityStyle = {
    ok: { icon: CheckCircle2, className: 'text-green-500', label: 'Innenfor det du har å avse' },
    stramt: { icon: AlertTriangle, className: 'text-yellow-500', label: 'Stramt — nær grensen' },
    'ikke-rad': { icon: XCircle, className: 'text-red-500', label: 'Over det du har å avse' },
  }[result.affordability]
  const AffordabilityIcon = affordabilityStyle.icon

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Bilkalkulator</h1>
        <p className="text-sm text-muted-foreground">
          Planlegg et bilkjøp — hent tall fra en FINN-annonse eller fyll inn selv.
        </p>
      </div>

      {/* FINN-oppslag */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">FINN-annonse</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-2">
          <div className="space-y-1 flex-1 min-w-[180px]">
            <Label className="text-xs">FINN-kode</Label>
            <Input
              value={finnkode}
              onChange={(e) => setFinnkode(e.target.value)}
              placeholder="f.eks. 469404429"
            />
          </div>
          <Button onClick={handleFinnLookup} disabled={finnLoading}>
            {finnLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Search className="h-4 w-4 mr-1.5" />}
            Hent
          </Button>
          {finnError && <p className="w-full text-xs text-red-500">{finnError}</p>}
        </CardContent>
      </Card>

      {/* Bil og lån */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Bil og lån</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="space-y-1">
            <Label className="text-xs">Pris</Label>
            <NumberInput value={inputs.price} onChange={(v) => setInputs({ price: v })} suffix="kr" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Egenkapital</Label>
            <NumberInput value={inputs.equity} onChange={(v) => setInputs({ equity: v })} suffix="kr" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Rente</Label>
            <NumberInput value={inputs.annualRate} onChange={(v) => setInputs({ annualRate: v })} suffix="%" step={0.1} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Løpetid</Label>
            <NumberInput value={inputs.termYears} onChange={(v) => setInputs({ termYears: v })} suffix="år" min={1} max={15} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Lånetype</Label>
            <Select value={inputs.loanType} onValueChange={(v) => setInputs({ loanType: v as 'annuitet' | 'serie' })}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="annuitet">Annuitet</SelectItem>
                <SelectItem value="serie">Serie</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Drivstoff</Label>
            <Select
              value={inputs.fuelType ?? '__none__'}
              onValueChange={(v) => setInputs({ fuelType: v === '__none__' ? null : (v as FuelType) })}
            >
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Ukjent</SelectItem>
                {(Object.keys(FUEL_LABELS) as FuelType[]).map((f) => (
                  <SelectItem key={f} value={f}>{FUEL_LABELS[f]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Årsmodell</Label>
            <NumberInput value={inputs.year ?? 0} onChange={(v) => setInputs({ year: v || null })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Kilometerstand</Label>
            <NumberInput value={inputs.mileageKm ?? 0} onChange={(v) => setInputs({ mileageKm: v || null })} suffix="km" />
          </div>
        </CardContent>
      </Card>

      {/* Driftskostnader */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Driftskostnader (valgfritt)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={inputs.runningCosts.insurance.enabled}
              onChange={(e) => setRunningCostToggle('insurance', { enabled: e.target.checked })}
              className="h-4 w-4"
            />
            <span className="text-sm flex-1">Forsikring</span>
            <NumberInput
              value={inputs.runningCosts.insurance.monthlyAmount}
              onChange={(v) => setRunningCostToggle('insurance', { monthlyAmount: v })}
              suffix="kr/mnd"
              disabled={!inputs.runningCosts.insurance.enabled}
              className="w-36"
            />
          </div>
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={inputs.runningCosts.fuel.enabled}
              onChange={(e) => setRunningCostToggle('fuel', { enabled: e.target.checked })}
              className="h-4 w-4"
            />
            <span className="text-sm flex-1">Drivstoff/lading</span>
            <NumberInput
              value={inputs.runningCosts.fuel.monthlyAmount}
              onChange={(v) => setRunningCostToggle('fuel', { monthlyAmount: v })}
              suffix="kr/mnd"
              disabled={!inputs.runningCosts.fuel.enabled}
              className="w-36"
            />
          </div>
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={inputs.runningCosts.maintenance.enabled}
              onChange={(e) => setMaintenanceToggle({ enabled: e.target.checked })}
              className="h-4 w-4"
            />
            <span className="text-sm flex-1">Service/vedlikehold + årsavgift</span>
            <NumberInput
              value={inputs.runningCosts.maintenance.yearlyAmount}
              onChange={(v) => setMaintenanceToggle({ yearlyAmount: v })}
              suffix="kr/år"
              disabled={!inputs.runningCosts.maintenance.enabled}
              className="w-36"
            />
          </div>
        </CardContent>
      </Card>

      {/* Resultat */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Resultat</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Lånebeløp</p>
              <p className="font-mono font-medium">{fmtNOK(result.loanAmount)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Terminbeløp</p>
              <p className="font-mono font-medium">{fmtNOK(result.monthlyInstallment)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total driftskostnad</p>
              <p className="font-mono font-medium">{fmtNOK(result.totalRunningCostMonthly)}/mnd</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total rentekostnad</p>
              <p className="font-mono font-medium">{fmtNOK(result.totalInterestCost)}</p>
            </div>
          </div>

          <div className="rounded-lg border border-border p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AffordabilityIcon className={`h-4 w-4 ${affordabilityStyle.className}`} />
              <span className={`text-sm font-medium ${affordabilityStyle.className}`}>{affordabilityStyle.label}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Disponibelt til bil/mnd</span>
              <NumberInput
                value={inputs.availableMonthlyBudget}
                onChange={(v) => setAvailableMonthlyBudget(v, true)}
                suffix="kr"
                className="w-32"
              />
            </div>
          </div>

          {result.amortization.rows.length > 0 && (
            <>
              <AmortizationChart plan={result.amortization} />
              <AmortizationTable plan={result.amortization} label="Bilkalkulator" />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Bygg for å bekrefte at typene stemmer**

Run: `npm run build`
Expected: PASS — dette er byggsteget som var forventet å feile i Task 5,
og som nå skal gå gjennom siden alle filene er på plass.

Vanlige feilkilder å sjekke om bygget feiler:
- `NumberInput`s `className`-prop finnes ikke → sjekk faktisk prop-navn i
  `src/components/ui/number-input.tsx` og juster (fjern proppen hvis den
  ikke støttes, bruk `className` på en wrapper-`div` i stedet).
- `AmortizationTable`/`AmortizationChart` sine eksakte eksporterte props kan
  ha endret seg siden planen ble skrevet — sjekk komponentfilene direkte.

- [ ] **Step 3: Commit**

```bash
git add src/pages/CarLoanCalculatorPage.tsx
git commit -m "feat(bilkalkulator): sammensatt kalkulator-side (bil, lån, driftskostnader, resultat)"
```

---

### Task 8: Verifisering

**Files:** Ingen nye — kjører eksisterende verktøy mot alt som er bygget.

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: PASS, ingen TypeScript-feil (fanger `noUnusedLocals`/`noUnusedParameters` —
`tsc --noEmit` alene er IKKE nok i dette prosjektet, se prosjektminnet).

- [ ] **Step 2: Full testsuite**

Run: `npm run test`
Expected: PASS — alle tidligere tester + de 11 nye i `carLoanCalculator.test.ts`
+ de 4 nye i `finnCarAdParser.test.ts`.

- [ ] **Step 3: Manuell verifisering i dev-server**

```bash
npm run dev
```

Åpne appen, naviger til «Fremtid» → «Bilkalkulator», og bekreft:
- Siden viser uten konsollfeil.
- Å fylle inn pris/egenkapital/rente/løpetid oppdaterer terminbeløpet live.
- Nedbetalingstabell og -graf vises og oppdateres.
- Å slå på en driftskostnad-bryter viser beløpsfeltet og påvirker
  totalkostnaden og råd-indikatoren.
- «Disponibelt til bil/mnd» er forhåndsutfylt med et tall (fra budsjettet) —
  ikke 0 med mindre budsjettet faktisk viser 0/negativt overskudd.
- Å skrive et eget tall i «Disponibelt til bil/mnd» og laste siden på nytt
  beholder det manuelle tallet (ikke overskrevet av budsjett-forslaget).
- FINN-oppslag: lim inn en ekte FINN-kode for en bilannonse (f.eks. en du
  finner på finn.no/mobility/search/car akkurat nå) og bekreft at pris/år/
  km/drivstoff fylles inn.
- Lukk fanen og åpne appen på nytt — bekreft at alle feltene (unntatt
  FINN-kode-inputen, som er lokal komponent-state) er som du forlot dem.

- [ ] **Step 4: Commit hvis noe ble justert under manuell verifisering**

```bash
git add -A
git commit -m "fix(bilkalkulator): justeringer fra manuell verifisering"
```

(Hopp over dette steget hvis ingenting måtte endres.)

---

## Selv-gjennomgang (utført under planlegging)

**Spec-dekning:** Alle avklarte krav fra spec-en er dekket — FINN-oppslag
(Task 2–3, 7), driftskostnader som valgfrie tillegg (Task 1, 4, 7), råd-sjekk
mot budsjettmotoren med manuell overstyring (Task 6, 7), ingen scenarioliste
men persisterte verdier (Task 4), plassering ved siden av boligkalkulatoren
(Task 5), gjenbruk av `buildAmortizationPlan`/`AmortizationTable`/
`AmortizationChart` i stedet for ny lånematematikk (Task 1, 7).

**Placeholder-skann:** Ingen TBD/TODO igjen — FINN-URL og HTML-struktur som
var uavklart i spec-en er nå verifisert mot ekte annonser og skrevet inn som
faktisk kode i Task 2. Sjablongsatsene for drivstoffkostnad er reelle,
justerbare startverdier, ikke placeholders.

**Typekonsistens:** `CarLoanInputs`/`CarLoanResult` (Task 1) brukes uendret
av storen (Task 4), hooken (Task 6) og siden (Task 7) — feltnavn er
sjekket på tvers (`runningCosts.insurance/fuel/maintenance`,
`availableMonthlyBudget`, `affordability`). `FinnCarAdData` (Task 2) brukes
uendret i siden (Task 7) sitt FINN-oppslagskall.
