# Trinnvis rente — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Legg grunnlaget for trinnvis rente: nye typer, hardkodede bankpresets, store-actions, kalkulatorfunksjoner og partner-sync.

**Architecture:** Rent datalag — ingen UI-endringer. Ny `TieredRate`-type på `SavingsAccount` og `PartnerAccount`, `BankAccountPreset`-liste i `useEconomyStore` (v15), `getEffectiveRateFromTiers` i kalkulatoren. Plan B (UI) bygger på dette.

**Tech Stack:** TypeScript strict, Zustand persist v14→v15, Vitest

---

## Filkart

| Fil | Endring |
|-----|---------|
| `src/types/economy.ts` | Ny `TieredRate`, `BankAccountPreset`, felt på `SavingsAccount` + `PartnerAccount` |
| `src/config/bankPresets.ts` | **Ny** — `DEFAULT_BANK_PRESETS` |
| `src/application/useEconomyStore.ts` | `bankPresets` state + actions + migrering v14→v15 + partialize |
| `src/application/usePartnerStore.ts` | Stub-implementasjon av bankPresets-actions |
| `src/domain/economy/savingsCalculator.ts` | Ny `getEffectiveRateFromTiers`, `getEffectiveRate`, oppdater `computeYearlyInterestIncome` |
| `src/domain/economy/__tests__/savingsCalculator.test.ts` | Nye tester for trinnvis rente |
| `src/domain/economy/syncPartnerToVeikart.ts` | Kopier `tieredRates`, bruk `getEffectiveRate` |
| `src/domain/economy/__tests__/syncPartnerToVeikart.test.ts` | Oppdater eksisterende tester |

---

## Task 1: Legg til TieredRate og BankAccountPreset i types

**Files:**
- Modify: `src/types/economy.ts`

### Kontekst
`SavingsAccount` er definert fra linje ~285. `PartnerAccount` er fra linje ~670. `UserPreferences` fra linje ~661.

- [ ] **Steg 1: Legg til TieredRate og BankAccountPreset**

Legg inn disse to interface-ene like FØR `interface RateHistoryEntry` (ca. linje 259):

```ts
export interface TieredRate {
  fromBalance: number  // terskel i kr (0 = første trinn)
  rate: number         // % per år — gjelder hele saldoen når balance >= fromBalance
}

export interface BankAccountPreset {
  id: string
  bankName: string
  accountTypeName: string
  tieredRates: TieredRate[]
  interestCreditFrequency: 'monthly' | 'yearly'
  enabled: boolean
}
```

- [ ] **Steg 2: Legg til tieredRates på SavingsAccount**

I `interface SavingsAccount` (etter `monthlyContributionToDate`-feltet):
```ts
  /** Trinnvis rente — overstyrer rateHistory for saldobasert renteberegning */
  tieredRates?: TieredRate[]
```

- [ ] **Steg 3: Legg til tieredRates på PartnerAccount**

I `interface PartnerAccount` (etter `toDate`-feltet):
```ts
  tieredRates?: TieredRate[]
```

- [ ] **Steg 4: Typesjekk**

```bash
npm run typecheck
```

Forventet: ingen feil.

- [ ] **Steg 5: Commit**

```bash
git add src/types/economy.ts
git commit -m "feat(types): legg til TieredRate, BankAccountPreset og tieredRates-felt"
```

---

## Task 2: Opprett bankPresets.ts med DEFAULT_BANK_PRESETS

**Files:**
- Create: `src/config/bankPresets.ts`

- [ ] **Steg 1: Opprett filen**

Opprett `src/config/bankPresets.ts`:

```ts
import type { BankAccountPreset } from '@/types/economy'

export const DEFAULT_BANK_PRESETS: BankAccountPreset[] = [
  {
    id: 'trondelag-gullkonto',
    bankName: 'Trøndelag Sparebank',
    accountTypeName: 'Gullkonto',
    tieredRates: [
      { fromBalance: 0,           rate: 3.25 },
      { fromBalance: 100_000,     rate: 3.55 },
      { fromBalance: 500_000,     rate: 3.80 },
      { fromBalance: 1_000_000,   rate: 4.05 },
    ],
    interestCreditFrequency: 'monthly',
    enabled: true,
  },
  {
    id: 'trondelag-gullkonto-ung',
    bankName: 'Trøndelag Sparebank',
    accountTypeName: 'Gullkonto UNG (under 34)',
    tieredRates: [
      { fromBalance: 0, rate: 4.10 },
    ],
    interestCreditFrequency: 'monthly',
    enabled: true,
  },
  {
    id: 'trondelag-saervilkaar',
    bankName: 'Trøndelag Sparebank',
    accountTypeName: 'Særvilkår',
    tieredRates: [
      { fromBalance: 0,           rate: 3.00 },
      { fromBalance: 100_000,     rate: 3.50 },
      { fromBalance: 1_000_000,   rate: 4.05 },
    ],
    interestCreditFrequency: 'monthly',
    enabled: true,
  },
  {
    id: 'trondelag-bsu-pluss',
    bankName: 'Trøndelag Sparebank',
    accountTypeName: 'BSU Pluss',
    tieredRates: [
      { fromBalance: 0, rate: 4.75 },
    ],
    interestCreditFrequency: 'yearly',
    enabled: true,
  },
  {
    id: 'dnb-sparekonto-pluss',
    bankName: 'DNB',
    accountTypeName: 'Sparekonto Pluss',
    tieredRates: [
      { fromBalance: 0,           rate: 2.50 },
      { fromBalance: 100_000,     rate: 3.65 },
      { fromBalance: 500_000,     rate: 4.10 },
      { fromBalance: 2_000_000,   rate: 0.80 },
    ],
    interestCreditFrequency: 'monthly',
    enabled: true,
  },
  {
    id: 'dnb-hoyrentekonto',
    bankName: 'DNB',
    accountTypeName: 'Høyrentekonto',
    tieredRates: [
      { fromBalance: 0, rate: 3.50 },
    ],
    interestCreditFrequency: 'monthly',
    enabled: true,
  },
  {
    id: 'storebrand-hoyrentekonto',
    bankName: 'Storebrand',
    accountTypeName: 'Høyrentekonto',
    tieredRates: [
      { fromBalance: 0,       rate: 3.50 },
      { fromBalance: 100_000, rate: 3.75 },
      { fromBalance: 500_000, rate: 4.40 },
    ],
    interestCreditFrequency: 'monthly',
    enabled: true,
  },
  {
    id: 'nordea-bufferspar',
    bankName: 'Nordea',
    accountTypeName: 'BufferSpar',
    tieredRates: [
      { fromBalance: 0,       rate: 3.05 },
      { fromBalance: 100_000, rate: 0.90 },
    ],
    interestCreditFrequency: 'monthly',
    enabled: true,
  },
  {
    id: 'nordea-sparekonto-ekstra',
    bankName: 'Nordea',
    accountTypeName: 'Sparekonto Ekstra',
    tieredRates: [
      { fromBalance: 0, rate: 4.35 },
    ],
    interestCreditFrequency: 'monthly',
    enabled: true,
  },
  {
    id: 'sparebank1-sparekonto',
    bankName: 'SpareBank 1',
    accountTypeName: 'Sparekonto',
    tieredRates: [
      { fromBalance: 0,       rate: 3.50 },
      { fromBalance: 500_000, rate: 2.45 },
    ],
    interestCreditFrequency: 'monthly',
    enabled: true,
  },
]
```

- [ ] **Steg 2: Typesjekk**

```bash
npm run typecheck
```

Forventet: ingen feil.

- [ ] **Steg 3: Commit**

```bash
git add src/config/bankPresets.ts
git commit -m "feat(config): DEFAULT_BANK_PRESETS med norske banker"
```

---

## Task 3: Legg til bankPresets i useEconomyStore og usePartnerStore

**Files:**
- Modify: `src/application/useEconomyStore.ts`
- Modify: `src/application/usePartnerStore.ts`

### Kontekst
Store-versjonen er p.t. 14 (linje ~1120). Migrering følger mønsteret `if (fromVersion < N)`. `partialize`-blokken (linje ~1242) bestemmer hva som persisteres.

- [ ] **Steg 1: Legg til bankPresets-felt i EconomyState-interfacet**

I `src/application/useEconomyStore.ts`, i `export interface EconomyState`, etter `savingsPlanHorizon`-linjen, legg til:

```ts
  // Bankpresets
  bankPresets: BankAccountPreset[]
  setBankPresets: (presets: BankAccountPreset[]) => void
  updateBankPreset: (id: string, updates: Partial<BankAccountPreset>) => void
  addBankPreset: (preset: BankAccountPreset) => void
  removeBankPreset: (id: string) => void
```

- [ ] **Steg 2: Legg til import av BankAccountPreset og DEFAULT_BANK_PRESETS**

Øverst i filen, legg til i eksisterende import fra `@/types/economy`:
```ts
import type { ..., BankAccountPreset } from '@/types/economy'
```

Legg til import av presets:
```ts
import { DEFAULT_BANK_PRESETS } from '@/config/bankPresets'
```

- [ ] **Steg 3: Legg til initiell state og actions**

I `create<EconomyState>()(persist(...))`, etter `savingsPlanHorizon: 48`-linjen, legg til:

```ts
      bankPresets: DEFAULT_BANK_PRESETS,
      setBankPresets: (presets) => set({ bankPresets: presets }),
      updateBankPreset: (id, updates) =>
        set((s) => ({
          bankPresets: s.bankPresets.map((p) => p.id === id ? { ...p, ...updates } : p),
        })),
      addBankPreset: (preset) =>
        set((s) => ({ bankPresets: [...s.bankPresets, preset] })),
      removeBankPreset: (id) =>
        set((s) => ({ bankPresets: s.bankPresets.filter((p) => p.id !== id) })),
```

- [ ] **Steg 4: Migrering v14 → v15**

Endre `version: 14` til `version: 15`, og legg til migreringssteg like FØR `return state` på slutten av `migrate`-funksjonen:

```ts
        if (fromVersion < 15) {
          if (!Array.isArray(state.bankPresets) || (state.bankPresets as unknown[]).length === 0) {
            state.bankPresets = DEFAULT_BANK_PRESETS
          }
        }
```

- [ ] **Steg 5: Legg til bankPresets i partialize**

I `partialize`-blokken (ca. linje 1269), legg til:
```ts
        bankPresets: state.bankPresets,
```

- [ ] **Steg 6: Legg til stubs i usePartnerStore**

I `src/application/usePartnerStore.ts`, i `create<EconomyState>()`, legg til etter `// ── Spareplan`-seksjonen:

```ts
      // ── Bankpresets — stubs (partner-store bruker hoved-store sine presets) ─
      bankPresets: [],
      setBankPresets: () => {},
      updateBankPreset: () => {},
      addBankPreset: () => {},
      removeBankPreset: () => {},
```

- [ ] **Steg 7: Typesjekk**

```bash
npm run typecheck
```

Forventet: ingen feil.

- [ ] **Steg 8: Commit**

```bash
git add src/application/useEconomyStore.ts src/application/usePartnerStore.ts
git commit -m "feat(store): bankPresets i useEconomyStore v15, stub i usePartnerStore"
```

---

## Task 4: getEffectiveRateFromTiers og getEffectiveRate i kalkulatoren

**Files:**
- Modify: `src/domain/economy/savingsCalculator.ts`
- Modify: `src/domain/economy/__tests__/savingsCalculator.test.ts`

### Kontekst
`getCurrentRateForDate` er definert rundt linje 172 og brukes i `computeYearlyInterestIncome` (linje ~401). Ny funksjon `getEffectiveRateFromTiers` er en ren funksjon — enkelt å teste.

`computeYearlyInterestIncome` bruker `getCurrentRateForDate(account.rateHistory, date)` per måned. Med trinnvis rente skal renten bestemmes av løpende `balance`, ikke dato.

- [ ] **Steg 1: Skriv tester**

Legg til i `src/domain/economy/__tests__/savingsCalculator.test.ts`:

```ts
import { getEffectiveRateFromTiers, getEffectiveRate } from '../savingsCalculator'
import type { TieredRate } from '@/types/economy'

describe('getEffectiveRateFromTiers', () => {
  const tiers: TieredRate[] = [
    { fromBalance: 0,         rate: 3.25 },
    { fromBalance: 100_000,   rate: 3.55 },
    { fromBalance: 500_000,   rate: 3.80 },
    { fromBalance: 1_000_000, rate: 4.05 },
  ]

  it('bruker første trinn for saldo 0', () => {
    expect(getEffectiveRateFromTiers(tiers, 0)).toBe(3.25)
  })

  it('bruker riktig trinn for saldo 50 000', () => {
    expect(getEffectiveRateFromTiers(tiers, 50_000)).toBe(3.25)
  })

  it('bruker neste trinn ved eksakt terskel 100 000', () => {
    expect(getEffectiveRateFromTiers(tiers, 100_000)).toBe(3.55)
  })

  it('bruker riktig trinn for saldo 450 000', () => {
    expect(getEffectiveRateFromTiers(tiers, 450_000)).toBe(3.55)
  })

  it('bruker øverste trinn for saldo over 1M', () => {
    expect(getEffectiveRateFromTiers(tiers, 1_500_000)).toBe(4.05)
  })

  it('håndterer enkelt trinn (flat rente)', () => {
    expect(getEffectiveRateFromTiers([{ fromBalance: 0, rate: 4.10 }], 999_999)).toBe(4.10)
  })
})

describe('getEffectiveRate', () => {
  it('faller tilbake på rateHistory når tieredRates mangler', () => {
    const acc = makeBSUAccount({
      rateHistory: [{ fromDate: '2025-01-01', rate: 6.3 }],
    })
    expect(getEffectiveRate(acc, 50_000)).toBe(6.3)
  })

  it('bruker tieredRates når tilstede', () => {
    const acc = makeBSUAccount({
      rateHistory: [{ fromDate: '2025-01-01', rate: 6.3 }],
      tieredRates: [
        { fromBalance: 0,       rate: 3.25 },
        { fromBalance: 100_000, rate: 3.55 },
      ],
    })
    expect(getEffectiveRate(acc, 150_000)).toBe(3.55)
  })
})
```

- [ ] **Steg 2: Kjør tester og bekreft feil**

```bash
npm test src/domain/economy/__tests__/savingsCalculator.test.ts
```

Forventet: FAIL — `getEffectiveRateFromTiers` og `getEffectiveRate` er ikke definert.

- [ ] **Steg 3: Implementer funksjonene**

Legg til disse to funksjonene i `src/domain/economy/savingsCalculator.ts`, like etter `getCurrentRateForDate`-funksjonen:

```ts
export function getEffectiveRateFromTiers(tiers: TieredRate[], balance: number): number {
  const sorted = [...tiers].sort((a, b) => b.fromBalance - a.fromBalance)
  return sorted.find(t => balance >= t.fromBalance)?.rate ?? sorted.at(-1)!.rate
}

export function getEffectiveRate(account: SavingsAccount, balance: number): number {
  if (account.tieredRates?.length) {
    return getEffectiveRateFromTiers(account.tieredRates, balance)
  }
  return getCurrentRateForDate(account.rateHistory, new Date())
}
```

Legg til import av `TieredRate` i filen:
```ts
import type { ..., TieredRate } from '@/types/economy'
```

- [ ] **Steg 4: Oppdater computeYearlyInterestIncome**

I `computeYearlyInterestIncome` (linje ~401), erstatt:
```ts
    const rate = getCurrentRateForDate(account.rateHistory, date)
```
Med:
```ts
    const rate = account.tieredRates?.length
      ? getEffectiveRateFromTiers(account.tieredRates, balance)
      : getCurrentRateForDate(account.rateHistory, date)
```

- [ ] **Steg 5: Kjør tester og bekreft at de passerer**

```bash
npm test src/domain/economy/__tests__/savingsCalculator.test.ts
```

Forventet: alle nye tester PASS, eksisterende tester fortsatt PASS.

- [ ] **Steg 6: Typesjekk**

```bash
npm run typecheck
```

Forventet: ingen feil.

- [ ] **Steg 7: Commit**

```bash
git add src/domain/economy/savingsCalculator.ts \
        src/domain/economy/__tests__/savingsCalculator.test.ts
git commit -m "feat(calc): getEffectiveRateFromTiers og getEffectiveRate for trinnvis rente"
```

---

## Task 5: Oppdater syncPartnerToVeikart

**Files:**
- Modify: `src/domain/economy/syncPartnerToVeikart.ts`
- Modify: `src/domain/economy/__tests__/syncPartnerToVeikart.test.ts`

### Kontekst
`buildPartnerVeikartPatch` i `syncPartnerToVeikart.ts` mapper partnerens `SavingsAccount[]` til `PartnerAccount[]`. Nå skal `tieredRates` kopieres over og `getEffectiveRate` brukes for `rate`-feltet.

- [ ] **Steg 1: Legg til ny test**

Legg til i `src/domain/economy/__tests__/syncPartnerToVeikart.test.ts`:

```ts
import { getEffectiveRate } from '../savingsCalculator'

it('kopierer tieredRates til PartnerAccount', () => {
  const acc = makeSavingsAccount({
    tieredRates: [
      { fromBalance: 0,       rate: 3.25 },
      { fromBalance: 100_000, rate: 3.55 },
    ],
  })
  const patch = buildPartnerVeikartPatch([acc], [], null, stubVeikart, now)
  expect(patch.accounts[0].tieredRates).toHaveLength(2)
  expect(patch.accounts[0].tieredRates![0].rate).toBe(3.25)
})

it('bruker getEffectiveRate for rate-feltet når tieredRates finnes', () => {
  const acc = makeSavingsAccount({
    openingBalance: 150_000,
    tieredRates: [
      { fromBalance: 0,       rate: 3.25 },
      { fromBalance: 100_000, rate: 3.55 },
    ],
  })
  const patch = buildPartnerVeikartPatch([acc], [], null, stubVeikart, now)
  // Saldo > 100k → skal bruke 3.55
  expect(patch.accounts[0].rate).toBe(3.55)
})
```

- [ ] **Steg 2: Kjør test og bekreft feil**

```bash
npm test src/domain/economy/__tests__/syncPartnerToVeikart.test.ts
```

Forventet: FAIL — `tieredRates` mangler i output.

- [ ] **Steg 3: Oppdater buildPartnerVeikartPatch**

I `src/domain/economy/syncPartnerToVeikart.ts`, oppdater importen:
```ts
import { computeEffectiveBalance, projectBalanceMonthly, getEffectiveRate } from './savingsCalculator'
```

Oppdater `.map()`-blokken for `accounts`:
```ts
  const accounts: PartnerAccount[] = savingsAccounts
    .filter((a) => a.type !== 'BSU' && a.type !== 'fond')
    .map((a) => {
      const balance = projectedBalance(a)
      return {
        id: a.id,
        label: a.label,
        balance,
        rate: getEffectiveRate(a, balance),
        monthlyContribution: a.monthlyContribution ?? 0,
        ...(a.tieredRates?.length ? { tieredRates: a.tieredRates } : {}),
      }
    })
```

- [ ] **Steg 4: Kjør tester**

```bash
npm test src/domain/economy/__tests__/syncPartnerToVeikart.test.ts
```

Forventet: alle tester PASS.

- [ ] **Steg 5: Typesjekk**

```bash
npm run typecheck
```

Forventet: ingen feil.

- [ ] **Steg 6: Kjør alle tester**

```bash
npm test
```

Forventet: 6 pre-eksisterende feil i `taxSettlementCalc` og `debtCalculator` — alle andre PASS.

- [ ] **Steg 7: Commit**

```bash
git add src/domain/economy/syncPartnerToVeikart.ts \
        src/domain/economy/__tests__/syncPartnerToVeikart.test.ts
git commit -m "feat(partner): kopier tieredRates ved sync, bruk getEffectiveRate"
```

---

## Avsluttende sjekk Plan A

- [ ] `npm run build` — ingen feil
- [ ] `npm test` — kun pre-eksisterende feil

Plan B (UI) kan starte etter dette.
