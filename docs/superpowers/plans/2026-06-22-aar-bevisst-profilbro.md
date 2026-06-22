# År-bevisst profil-bro Implementeringsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gjøre boligkalkulatorens profil-bro år-bevisst: et «Kjøpsår»-felt får broen til å hente PROJISERTE tall (lønn via vekst, EK + restgjeld fra samme primitiver som Formue-over-tid) for det året, for både søker og partner, med én tydelig «Inkluder partner»-bryter.

**Architecture:** Ny ren domene-modul `bridgeProjection.ts` projiserer lønn/EK/gjeld/partner for et målår ved å gjenbruke de EKSPORTERTE primitivene `savingsBalanceAt`/`fondValueAt`/`debtBalanceAt`/`partnerNetWorthAt` fra `netWorthCalculator.ts` — samme motor som Formue-over-tid, så tallene kan ikke divergere. `profileBridge.ts` får valgfri `targetYear`-param (default = nå ⇒ bit-identisk med dagens bro, fordi `savingsBalanceAt` ved nå-punktet = `sum(computeEffectiveBalance)`). UI får et Kjøpsår-felt + «Inkluder partner»-bryter.

**Tech Stack:** React 19, TypeScript (strict), Zustand, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-22-aar-bevisst-profilbro-design.md`
**Branch:** `feat/aar-bevisst-profilbro`

**Konvensjoner:**
- TypeScript-sjekk: **`npm run typecheck`** (= `tsc -b`). `npx tsc --noEmit` fanger IKKE `noUnusedLocals`.
- Tester: `npm test -- <navn>`.
- Conventional commits. Avslutt med blank linje + `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

**Verifiserte fakta (mot faktisk kode):**
- `netWorthCalculator.ts` EKSPORTERER: `savingsBalanceAt(accounts, year, month, now)`, `fondValueAt(portfolio, year, month, now)`, `debtBalanceAt(debts, year, month, now)`. `partnerNetWorthAt(partner, year, month, now)` er IKKE eksportert (privat) — må eksporteres.
- `savingsBalanceAt` ved nå-punktet (`!isAfter(...)`) = `accounts.reduce((s,a)=>s+computeEffectiveBalance(a, monthEndDate(now)),0)` ⇒ matcher dagens bros `calcBridgeEquity`. `fondValueAt` ved nå = siste snapshot ≤ nå ⇒ matcher dagens bro.
- `partnerNetWorthAt` projiserer partner: `sparing = max(0, nowSparing + monthlySave*dM)`, `fond = fondCurrentValue` (statisk), `gjeld = max(0, nowGjeld − monthlyPay*dM)`, `dM = (year−now.year)*12 + (month−now.month)`.
- `profileBridge.ts`: `EQUITY_ACCOUNT_TYPES = {sparekonto, BSU, fond, buffer}`; `calcBridgeIncome` = `baseMonthly*12 + faste tillegg (ikke-temporære)*12`; `calcBridgeEquity` = `sum(computeEffectiveBalance equity-kontoer) + siste fond-snapshot`. `extractCoApplicantFromPartner` leser `partnerVeikart` (annualIncome/debts/accounts/bsu/fondCurrentValue).
- Lønnsvekst: `LONNSVEKST_DEFAULT = 3.0` i `economy.config.ts`.
- `ScenarioInput` i `src/types/index.ts`; scenarioer persisteres i `useAppStore` (version 2). `purchaseYear?` valgfri ⇒ INGEN migrering.
- HouseholdForm: profil-bro + medsøker-håndtering ligger i `section='essential'`/`'advanced'`-blokkene (nylig refaktorert). `hasCoApplicant = Boolean(household.coApplicant)` (utledet fra store).

**Projeksjonskontrakt (målmåned):** projiser N HELE år fram → bruk `targetMonth = now.month`, så `dM = (targetYear − nowYear)*12`. Lønnsvekst-eksponent = `targetYear − nowYear`. (Spec: år-nivå er nok.)

---

### Task 1: Eksporter `partnerNetWorthAt` + ren `bridgeProjection.ts`

**Files:**
- Modify: `src/domain/economy/netWorthCalculator.ts` (eksporter `partnerNetWorthAt`)
- Create: `src/domain/economy/bridgeProjection.ts`
- Test: `src/domain/economy/__tests__/bridgeProjection.test.ts`

- [ ] **Step 1: Eksporter partnerNetWorthAt**

I `netWorthCalculator.ts`, endre `function partnerNetWorthAt(` → `export function partnerNetWorthAt(`.

- [ ] **Step 2: Skriv failing test**

Create `src/domain/economy/__tests__/bridgeProjection.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  projectIncomeToYear, projectEquityToYear, projectDebtToYear, projectPartnerToYear,
} from '../bridgeProjection'
import { savingsBalanceAt, fondValueAt, debtBalanceAt } from '../netWorthCalculator'
import type { SavingsAccount, FondPortfolio, DebtAccount, PartnerVeikart } from '@/types/economy'

const now = { year: 2026, month: 6 }
const accounts: SavingsAccount[] = [
  { id: 'a', name: 'Spar', type: 'sparekonto', openingBalance: 200_000, openingDate: '2024-01-01',
    monthlyContribution: 5_000, rateTiers: [{ threshold: 0, rate: 3 }] } as unknown as SavingsAccount,
]
const fond: FondPortfolio = { monthlyDeposit: 0, startDate: '2025-01-01', funds: [], snapshots: [{ date: '2026-06-01', totalValue: 100_000 }] }
const debts: DebtAccount[] = [
  { id: 'd', name: 'Lån', currentBalance: 300_000, monthlyPayment: 4_000, status: 'aktiv' } as unknown as DebtAccount,
]

describe('projectIncomeToYear', () => {
  it('år = nå ⇒ uendret inntekt (eksponent 0)', () => {
    expect(projectIncomeToYear(600_000, 2026, 2026, 3)).toBe(600_000)
  })
  it('3 år fram ⇒ vokser med satsen', () => {
    expect(projectIncomeToYear(600_000, 2026, 2029, 3)).toBe(Math.round(600_000 * Math.pow(1.03, 3)))
  })
})

describe('projectEquityToYear — matcher netWorth-primitivene', () => {
  it('= savingsBalanceAt + fondValueAt ved målåret', () => {
    const ek = projectEquityToYear(accounts, fond, 2029, 6, now)
    const expected = savingsBalanceAt(accounts, 2029, 6, now) + fondValueAt(fond, 2029, 6, now)
    expect(ek).toBe(Math.round(expected))
  })
  it('år = nå ⇒ nå-saldo (bit-identisk grunnlag)', () => {
    const ek = projectEquityToYear(accounts, fond, 2026, 6, now)
    expect(ek).toBe(Math.round(savingsBalanceAt(accounts, 2026, 6, now) + fondValueAt(fond, 2026, 6, now)))
  })
})

describe('projectDebtToYear', () => {
  it('= debtBalanceAt ved målåret', () => {
    expect(projectDebtToYear(debts, 2029, 6, now)).toBe(Math.round(debtBalanceAt(debts, 2029, 6, now)))
  })
})

describe('projectPartnerToYear', () => {
  const partner: PartnerVeikart = {
    enabled: true, partnerName: 'P', annualIncome: 500_000, annualNetIncome: 0,
    equity: 0, bsu: 0, bsuMonthlyContribution: 0, monthlySavings: 2_000, accounts: [{ balance: 100_000 } as never],
    debts: [{ currentBalance: 200_000, monthlyPayment: 3_000 } as never], fondCurrentValue: 50_000,
  } as unknown as PartnerVeikart
  it('projiserer partner-inntekt med vekst + EK/gjeld via partnerNetWorthAt', () => {
    const r = projectPartnerToYear(partner, 2029, 6, now, 3)
    expect(r.grossIncome).toBe(Math.round(500_000 * Math.pow(1.03, 3)))
    expect(r.equity).toBeGreaterThan(0)
    expect(r.debt).toBeLessThan(200_000) // nedbetalt noe over 3 år
  })
  it('partner disabled ⇒ null', () => {
    expect(projectPartnerToYear({ enabled: false } as PartnerVeikart, 2029, 6, now, 3)).toBeNull()
  })
})
```

- [ ] **Step 3: Kjør — verifiser feil**

Run: `npm test -- bridgeProjection`
Expected: FAIL (modul finnes ikke).

- [ ] **Step 4: Implementer bridgeProjection.ts**

Create `src/domain/economy/bridgeProjection.ts`:

```ts
// ============================================================
// PROJEKSJON FOR PROFIL-BRO — projiserer lønn/EK/gjeld/partner til et målår.
// Gjenbruker netWorth-primitivene → EK/gjeld matcher Formue-over-tid for samme år.
// Rene funksjoner; targetYear = nå ⇒ nå-verdier (bakoverkompatibelt).
// ============================================================

import type { SavingsAccount, FondPortfolio, DebtAccount, PartnerVeikart } from '@/types/economy'
import { savingsBalanceAt, fondValueAt, debtBalanceAt, partnerNetWorthAt } from './netWorthCalculator'

/** Brutto årsinntekt framskrevet med antatt lønnsvekst (whole-year-eksponent). */
export function projectIncomeToYear(annualIncome: number, nowYear: number, targetYear: number, growthPct: number): number {
  const years = Math.max(0, targetYear - nowYear)
  return Math.round(annualIncome * Math.pow(1 + growthPct / 100, years))
}

/** EK (sparing + fond) ved målåret — samme primitiver som netWorth/Formue-over-tid. */
export function projectEquityToYear(
  equityAccounts: SavingsAccount[], fondPortfolio: FondPortfolio,
  targetYear: number, targetMonth: number, now: { year: number; month: number },
): number {
  return Math.round(
    savingsBalanceAt(equityAccounts, targetYear, targetMonth, now) +
    fondValueAt(fondPortfolio, targetYear, targetMonth, now),
  )
}

/** Restgjeld ved målåret — samme primitiv som netWorth/Formue-over-tid. */
export function projectDebtToYear(
  debts: DebtAccount[], targetYear: number, targetMonth: number, now: { year: number; month: number },
): number {
  return Math.round(debtBalanceAt(debts, targetYear, targetMonth, now))
}

/** Partner projisert til målåret: inntekt med vekst, EK/gjeld via partnerNetWorthAt. */
export function projectPartnerToYear(
  partner: PartnerVeikart, targetYear: number, targetMonth: number,
  now: { year: number; month: number }, growthPct: number,
): { grossIncome: number; equity: number; debt: number } | null {
  if (!partner?.enabled) return null
  const grossIncome = projectIncomeToYear(Math.round(partner.annualIncome ?? 0), now.year, targetYear, growthPct)
  const nw = partnerNetWorthAt(partner, targetYear, targetMonth, now)
  return { grossIncome, equity: Math.round(nw.sparing + nw.fond), debt: Math.round(nw.gjeld) }
}
```

- [ ] **Step 5: Kjør — verifiser pass**

Run: `npm test -- bridgeProjection && npm run typecheck`
Expected: PASS / rent.

- [ ] **Step 6: Commit**

```bash
git add src/domain/economy/netWorthCalculator.ts src/domain/economy/bridgeProjection.ts src/domain/economy/__tests__/bridgeProjection.test.ts
git commit -m "feat(bolig): bridgeProjection — projiser lønn/EK/gjeld/partner til målår

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: År-bevisst profileBridge

**Files:**
- Modify: `src/application/profileBridge.ts`
- Test: `src/application/__tests__/profileBridge.test.ts` (ny — hvis ingen finnes)

- [ ] **Step 1: Skriv failing test**

Create `src/application/__tests__/profileBridge.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useEconomyStore } from '@/application/useEconomyStore'
import { extractLoanInputFromEconomy } from '@/application/profileBridge'

describe('extractLoanInputFromEconomy — år-bevisst', () => {
  beforeEach(() => {
    useEconomyStore.setState({
      profile: { baseMonthly: 50_000, fixedAdditions: [] } as never,
      savingsAccounts: [], fondPortfolio: { monthlyDeposit: 0, startDate: '2025-01-01', funds: [], snapshots: [] } as never,
      debts: [],
    })
  })

  it('uten år (default nå) ⇒ inntekt = baseMonthly*12 (uendret oppførsel)', () => {
    const r = extractLoanInputFromEconomy()
    expect(r.household?.primaryApplicant?.grossIncome).toBe(600_000)
  })
  it('fremtidig år ⇒ inntekt vokser med lønnsvekst', () => {
    const nowYear = new Date().getFullYear()
    const r = extractLoanInputFromEconomy(nowYear + 3)
    expect(r.household?.primaryApplicant?.grossIncome).toBeGreaterThan(600_000)
  })
})
```

- [ ] **Step 2: Kjør — verifiser feil**

Run: `npm test -- profileBridge`
Expected: FAIL (extractLoanInputFromEconomy tar ikke år-param ennå).

- [ ] **Step 3: Gjør profileBridge år-bevisst**

I `src/application/profileBridge.ts`:

a) Importer projeksjon + config øverst:
```ts
import { projectIncomeToYear, projectEquityToYear, projectDebtToYear, projectPartnerToYear } from '@/domain/economy/bridgeProjection'
import { LONNSVEKST_DEFAULT } from '@/config/economy.config'
```

b) `extractLoanInputFromEconomy(targetYear?: number)`:
- Beregn `const now = new Date(); const nowYear = now.getFullYear(); const nowMonth = now.getMonth() + 1; const year = targetYear ?? nowYear`.
- Inntekt: behold `calcBridgeIncome(profile)` som NÅ-inntekt, deretter `projectIncomeToYear(nowIncome, nowYear, year, LONNSVEKST_DEFAULT)`.
- EK: filtrer equity-kontoer (EQUITY_ACCOUNT_TYPES minus 'fond'; fond håndteres av fondValueAt) og bruk `projectEquityToYear(equityAccounts, fondPortfolio, year, nowMonth, { year: nowYear, month: nowMonth })`.
- Gjeld: `projectDebtToYear(activeDebts, year, nowMonth, { year: nowYear, month: nowMonth })`.
- **Bakoverkompat:** når `year === nowYear` gir disse primitivene nå-verdier (savingsBalanceAt ved nå = sum computeEffectiveBalance) ⇒ samme som før. Behold retur-formen uendret (household/loanParameters).

c) `extractCoApplicantFromPartner(targetYear?: number)`:
- Bruk `projectPartnerToYear(partnerVeikart, year, nowMonth, { year: nowYear, month: nowMonth }, LONNSVEKST_DEFAULT)` for grossIncome/equity/debt. `year === nowYear` ⇒ nå-verdier (uendret).
- Behold returform (`{ grossIncome, existingDebt, label, equityContribution, summary }`) — map `equity → equityContribution`, `debt → existingDebt`. Oppdater summary-tekst til å nevne året når `year > nowYear` (f.eks. «(anslag for {year})»).

d) `getProfileBridgeSummary(targetYear?: number)`: ta år-param og inkluder projiserte verdier + «anslag for {year}» når fremtidig.

> **Implementeringsnotat:** EQUITY_ACCOUNT_TYPES inkluderer i dag 'fond'. Siden `fondValueAt` håndterer fond separat via `fondPortfolio`, filtrer savings-kontoene til `{sparekonto, BSU, buffer}` for `savingsBalanceAt`-kallet (unngå dobbelttelling), og la fond komme fra `fondValueAt`. Verifiser at år=nå da gir SAMME total som dagens `calcBridgeEquity` (sum equity-kontoer inkl. fond-snapshot). Hvis dagens kode teller fond via en konto av type 'fond' OG fond-snapshot, bevar nøyaktig samme sumlogikk.

- [ ] **Step 4: Kjør — verifiser pass + ingen regresjon**

Run: `npm test -- profileBridge && npm run typecheck && npm test`
Expected: PASS / rent / alle grønne.

- [ ] **Step 5: Commit**

```bash
git add src/application/profileBridge.ts src/application/__tests__/profileBridge.test.ts
git commit -m "feat(bolig): profileBridge tar targetYear (projiserer; nå=uendret)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `purchaseYear` på scenario + Kjøpsår-felt i UI

**Files:**
- Modify: `src/types/index.ts` (`ScenarioInput`)
- Modify: `src/components/calculator/HouseholdForm.tsx`

- [ ] **Step 1: Legg purchaseYear på ScenarioInput**

I `src/types/index.ts`, i `interface ScenarioInput` (ved de andre valgfrie feltene):
```ts
  /** Kjøpsår — styrer år-bevisst forhåndsfyll fra profil/partner. Default = inneværende år. */
  purchaseYear?: number
```

- [ ] **Step 2: Kjøpsår-felt + wire broen til året**

I `HouseholdForm.tsx`, i profil-bro-blokken (essential-seksjonen), legg til over «Bruk min profil»-knappene:
- Et «Kjøpsår»-`NumberInput` bundet til `scenario.purchaseYear ?? new Date().getFullYear()`, `onChange={(v) => update(scenario.id, { purchaseYear: v })}`, min = inneværende år, step 1.
- Endre `handleUseProfile` til å kalle `extractLoanInputFromEconomy(scenario.purchaseYear)` og `getProfileBridgeSummary(scenario.purchaseYear)`.
- Endre `handleUsePartner` til å kalle `extractCoApplicantFromPartner(scenario.purchaseYear)`.

> **Implementeringsnotat:** Auto-reproject: når purchaseYear endres OG profil alt er hentet (bridgeSnapshot finnes), kjør `handleUseProfile()` på nytt så feltene oppdateres til det nye året. Enkleste robuste form: i `onChange` for Kjøpsår, etter `update(...purchaseYear)`, kall `handleUseProfile()` (og `handleUsePartner()` hvis medsøker er på). Pass på at dette ikke gir uendelig løkke (kallene leser fra storen, setter felt — ingen rekursjon på purchaseYear).

- [ ] **Step 3: Verifiser bygg + typecheck + test**

Run: `npm run build && npm run typecheck && npm test`
Expected: PASS / rent / alle grønne.

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts src/components/calculator/HouseholdForm.tsx
git commit -m "feat(bolig): Kjøpsår-felt styrer år-bevisst forhåndsfyll

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: «Inkluder partner»-bryter + transparens-stripe

**Files:**
- Modify: `src/components/calculator/HouseholdForm.tsx`

- [ ] **Step 1: «Inkluder partner som medsøker»-bryter**

I HouseholdForm, erstatt dagens «Hent medsøker fra Partner»-knapp (i essential-blokken) med en `<Switch>` + label «Inkluder partner som medsøker». Atferd:
- PÅ: kall `handleUsePartner()` (som setter coApplicant fra projisert partner) — dette setter også `household.coApplicant`, så medsøker-feltene i advanced-blokken vises (via `hasCoApplicant = Boolean(household.coApplicant)`).
- AV: fjern coApplicant (samme som `toggleCoApplicant(false)` — clear coApplicant + juster adults).

Den eksisterende medsøker-`<Switch>` i advanced-blokken kan beholdes som den er (begge styrer `household.coApplicant` via storen — `hasCoApplicant` er utledet, så de holder seg i synk). ELLER, for å unngå to brytere: la «Inkluder partner»-bryteren i essential være den primære, og behold advanced-toggle som i dag. Bekreft at begantene reflekterer samme store-state (de gjør, siden hasCoApplicant er utledet).

> **Implementeringsnotat:** Hvis ingen partner er registrert (`extractCoApplicantFromPartner` returnerer null), vis en melding «Ingen partner registrert i Partner-fanen» og ikke slå på bryteren. Behold dagens medsøker-Switch i «Husstand & medsøker»-seksjonen for manuell medsøker uten partner-data.

- [ ] **Step 2: Transparens-stripe**

Utvid bridge-summary-visningen (`bridgeSummary`) så den, ved fremtidig kjøpsår, viser projiserte verdier med «anslag for {år}» (kommer fra `getProfileBridgeSummary(purchaseYear)` oppdatert i Task 2). Sørg for at strengene viser nå→anslag der det er naturlig (summary-tekstene bygges i profileBridge; UI rendrer dem som i dag).

- [ ] **Step 3: Verifiser bygg + manuell røyktest**

Run: `npm run build && npm run typecheck`
Manuell: `npm run dev` → boligkalkulator → sett Kjøpsår 2029 → «Bruk min profil» fyller projisert lønn/EK/gjeld for 2029; slå på «Inkluder partner» → partner projisert; transparens viser «anslag for 2029»; sett Kjøpsår = i dag → samme tall som før.

- [ ] **Step 4: Commit**

```bash
git add src/components/calculator/HouseholdForm.tsx
git commit -m "feat(bolig): «Inkluder partner»-bryter + anslag-transparens

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Sluttverifisering

- [ ] **Step 1: Full verifisering**

Run: `npm test && npm run typecheck && npm run build`
Expected: Alle PASS. bridgeProjection + profileBridge-tester grønne; eksisterende tester uendret.

- [ ] **Step 2: Konsistens-sjekk (manuell)**

Run: `npm run dev`. Bekreft:
- Kjøpsår = i dag ⇒ broen gir nøyaktig samme tall som før (bakoverkompat).
- Kjøpsår 2029 ⇒ lønn vokst, EK = det Formue-over-tid-fanen viser for 2029 (åpne formue-fanen og sammenlign), restgjeld = formue-fanens gjeld for 2029.
- «Inkluder partner» PÅ ⇒ partner projisert for samme år; AV ⇒ bare deg.
- Ingen partner + bryter ⇒ tydelig melding.

---

## Self-Review (utført av planforfatter)

- **Spec-dekning:** projeksjons-mekanisme via gjenbrukte netWorth-primitiver (Task 1), år-bevisst bro med default=nå-invariant (Task 2), Kjøpsår-felt + datamodell (Task 3), «Inkluder partner»-bryter + transparens (Task 4), konsistens med Formue-over-tid (Task 1-test + Task 5 manuell). Lønnsvekst = LONNSVEKST_DEFAULT. Kanttilfeller (ingen profil/partner, år=fortid) i Task 1/2-tester + Task 4-UI.
- **Placeholders:** Task 1/2 har komplett kode + tester. Task 3/4 (UI) har implementeringsnotater som ber implementer wire mot eksisterende HouseholdForm-struktur (bridge-handlers, hasCoApplicant utledet) — bevisst, siden det avhenger av den nylig refaktorerte komponenten.
- **Typekonsistens:** `projectIncomeToYear`/`projectEquityToYear`/`projectDebtToYear`/`projectPartnerToYear`, `extractLoanInputFromEconomy(targetYear?)`, `purchaseYear`, `partnerNetWorthAt` (eksportert) konsistente på tvers.
- **Konsistens-regel:** EK/gjeld for år Y bruker SAMME eksporterte primitiver som Formue-over-tid → kan ikke divergere; targetYear=nå ⇒ bit-identisk (savingsBalanceAt ved nå = sum computeEffectiveBalance); lønnsvekst = pensjonens default.
