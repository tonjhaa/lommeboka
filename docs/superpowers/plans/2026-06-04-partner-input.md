# Partner Input Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gi brukeren full kontroll over partnerdata — logo som hjem-knapp, partner-fanen alltid tilgjengelig for manuell innlegging, og to nye knapper i Månedsoversikt (navigasjon + sync).

**Architecture:** Tre uavhengige UI-endringer i eksisterende filer. Sync-logikken er en ren funksjon som leser fra `usePartnerStore` og skriver til `useEconomyStore.partnerVeikart`. Ingen nye filer.

**Tech Stack:** React 19, TypeScript strict, Zustand, Vite/Vitest, Tailwind CSS v4

---

## Filkart

| Fil | Endring |
|-----|---------|
| `src/components/layout/Header.tsx` | Legg til click-handler på logo → `economy/dashboard` |
| `src/pages/economy/PartnerPage.tsx` | Fjern invitasjons-gate, vis alltid full fane med banner |
| `src/pages/economy/SavingsPage.tsx` | Bytt "Rediger partner →" med "+ Partner konto" + "⟳ Synk" |

---

## Task 1: Logo som hjem-knapp

**Files:**
- Modify: `src/components/layout/Header.tsx`

### Kontekst

`Header.tsx` viser logo + tekst øverst. Ingen click-handler i dag. Skal navigere til `economy/dashboard` ved klikk.

- [ ] **Steg 1: Oppdater Header.tsx**

Erstatt innholdet med:

```tsx
import { Moon, Sun, Menu } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { Button } from '@/components/ui/button'

export function Header() {
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)
  const sidebarOpen = useAppStore((s) => s.sidebarOpen)
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen)
  const setCurrentView = useAppStore((s) => s.setCurrentView)
  const setCurrentEconomyPage = useAppStore((s) => s.setCurrentEconomyPage)

  function toggleTheme() {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  function goHome() {
    setCurrentView('economy')
    setCurrentEconomyPage('dashboard')
  }

  return (
    <header className="flex h-14 items-center gap-3 border-b border-border bg-card px-4 shrink-0">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        <Menu className="h-5 w-5" />
      </Button>

      <button
        onClick={goHome}
        className="flex items-center gap-2.5 flex-1 hover:opacity-80 transition-opacity text-left"
      >
        <img src={`${import.meta.env.BASE_URL}lb-logo.svg`} alt="LB" className="h-8 w-8" />
        <div>
          <span className="font-semibold text-foreground leading-tight block">Lommeboka</span>
          <p className="text-xs text-muted-foreground italic leading-none">Oversikt er frihet</p>
        </div>
      </button>

      <Button variant="ghost" size="icon" onClick={toggleTheme}>
        {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </Button>
    </header>
  )
}
```

- [ ] **Steg 2: Typesjekk**

```bash
npm run typecheck
```

Forventet: ingen feil.

- [ ] **Steg 3: Commit**

```bash
git add src/components/layout/Header.tsx
git commit -m "feat(nav): logo navigerer til dashboard ved klikk"
```

---

## Task 2: Partner-fanen alltid tilgjengelig

**Files:**
- Modify: `src/pages/economy/PartnerPage.tsx`

### Kontekst

I dag: `if (status !== 'connected') return <invitasjonsskjerm>`.  
Etter: alltid vis full fane. Når ikke koblet, vis diskret banner øverst med lenke til kobling.

`PartnerLinkSection` er allerede importert — den inneholder invitasjonslogikken.

- [ ] **Steg 1: Legg til lokal state for å vise koblings-panel**

Endre toppen av `PartnerPage`-funksjonen:

```tsx
export function PartnerPage() {
  const partnerVeikart = useEconomyStore((s) => s.partnerVeikart)
  const setPartnerVeikart = useEconomyStore((s) => s.setPartnerVeikart)
  const [tab, setTab] = useState<Tab>('dashbord')
  const [showConnect, setShowConnect] = useState(false)
  const status = usePartnershipStore((s) => s.status)

  // Auto-aktiver første gang
  if (!partnerVeikart.enabled) {
    setPartnerVeikart({ ...partnerVeikart, enabled: true })
  }
```

- [ ] **Steg 2: Fjern invitasjons-gaten og legg til banner**

Fjern hele denne blokken (ca. linje 85–111 i original):
```tsx
// Ikke koblet — vis invitasjonsskjerm
if (status !== 'connected') {
  return (
    ...
  )
}
```

Legg til banner rett etter `<nav>...</nav>` og før `<div className="flex-1 overflow-hidden">`:

```tsx
{status !== 'connected' && (
  <div className="shrink-0 px-4 py-2 bg-amber-950/30 border-b border-amber-800/30 flex items-center justify-between gap-3">
    <p className="text-xs text-amber-300/80">
      Ikke koblet — data synkes ikke med en annen bruker.
    </p>
    <button
      onClick={() => setShowConnect((v) => !v)}
      className="text-xs text-amber-400 hover:text-amber-300 underline underline-offset-2 whitespace-nowrap transition-colors"
    >
      {showConnect ? 'Skjul' : 'Koble til →'}
    </button>
  </div>
)}
{showConnect && status !== 'connected' && (
  <div className="shrink-0 px-4 py-3 border-b border-border bg-card/60">
    <PartnerLinkSection />
  </div>
)}
```

- [ ] **Steg 3: Typesjekk**

```bash
npm run typecheck
```

Forventet: ingen feil.

- [ ] **Steg 4: Commit**

```bash
git add src/pages/economy/PartnerPage.tsx
git commit -m "feat(partner): vis full partnerfane uten kobling, banner for tilkobling"
```

---

## Task 3: Sync-funksjon og nye verktøylinje-knapper i Månedsoversikt

**Files:**
- Modify: `src/pages/economy/SavingsPage.tsx`

### Kontekst

`MånedsoversiktTable` i `SavingsPage.tsx` har en verktøylinje med "+ Min konto", "+ Fond", "Rediger partner →".  
Planen: fjern "Rediger partner →", legg til "+ Partner konto" og "⟳ Synk".

Viktige typer å kjenne til:
```ts
// src/types/economy.ts
interface PartnerAccount {
  id: string
  label: string
  balance: number
  monthlyContribution: number
  rate: number        // % per år
  fromDate?: string
  toDate?: string
  // NB: ingen 'type'-felt
}

interface PartnerDebt {
  id: string
  label: string        // vi bruker DebtAccount.creditor her
  currentBalance: number
  interestRate: number  // NB: 'interestRate', ikke 'rate'
  monthlyPayment: number
}
```

`computeEffectiveBalance(account: SavingsAccount, now: Date): number` er allerede importert øverst i filen.

- [ ] **Steg 1: Skriv en test for sync-logikken**

Opprett `src/domain/economy/__tests__/syncPartnerToVeikart.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildPartnerVeikartPatch } from '../syncPartnerToVeikart'
import type { SavingsAccount, DebtAccount, EmploymentProfile, PartnerVeikart } from '@/types/economy'

const now = new Date('2026-06-04')

function makeSavingsAccount(overrides: Partial<SavingsAccount> = {}): SavingsAccount {
  return {
    id: 'acc-1',
    type: 'sparekonto',
    label: 'Sparekonto',
    openingBalance: 50_000,
    openingDate: '2025-01-01',
    monthlyContribution: 2_000,
    interestCreditFrequency: 'yearly',
    rateHistory: [{ fromDate: '2025-01-01', rate: 4.1 }],
    balanceHistory: [],
    withdrawals: [],
    contributions: [],
    ...overrides,
  }
}

function makeDebt(overrides: Partial<DebtAccount> = {}): DebtAccount {
  return {
    id: 'debt-1',
    creditor: 'Lånekassen',
    type: 'studielaan',
    originalAmount: 300_000,
    currentBalance: 200_000,
    rateHistory: [{ fromDate: '2025-01-01', nominalRate: 4.5 }],
    monthlyPayment: 2_500,
    termFee: 0,
    startDate: '2020-01-01',
    ...overrides,
  }
}

const stubVeikart: PartnerVeikart = {
  enabled: false,
  annualIncome: 0,
  annualNetIncome: 0,
  equity: 0,
  bsu: 0,
  bsuMonthlyContribution: 0,
  monthlySavings: 0,
  accounts: [],
}

describe('buildPartnerVeikartPatch', () => {
  it('mapper sparekonto til PartnerAccount med riktig saldo', () => {
    const acc = makeSavingsAccount()
    const patch = buildPartnerVeikartPatch(
      [acc], [], null, stubVeikart, now
    )
    expect(patch.accounts).toHaveLength(1)
    expect(patch.accounts[0].label).toBe('Sparekonto')
    expect(patch.accounts[0].rate).toBe(4.1)
    expect(patch.accounts[0].monthlyContribution).toBe(2_000)
    expect(patch.accounts[0].balance).toBeGreaterThan(50_000)
  })

  it('ekskluderer BSU fra accounts-listen', () => {
    const bsu = makeSavingsAccount({ id: 'bsu-1', type: 'BSU', label: 'BSU' })
    const patch = buildPartnerVeikartPatch([bsu], [], null, stubVeikart, now)
    expect(patch.accounts).toHaveLength(0)
    expect(patch.bsu).toBeGreaterThan(0)
  })

  it('henter annualIncome fra profil', () => {
    const profile = { baseMonthly: 60_000 } as EmploymentProfile
    const patch = buildPartnerVeikartPatch([], [], profile, stubVeikart, now)
    expect(patch.annualIncome).toBe(720_000)
  })

  it('beholder eksisterende annualIncome om profil mangler', () => {
    const existing = { ...stubVeikart, annualIncome: 500_000 }
    const patch = buildPartnerVeikartPatch([], [], null, existing, now)
    expect(patch.annualIncome).toBe(500_000)
  })

  it('mapper aktiv gjeld til PartnerDebt', () => {
    const debt = makeDebt()
    const patch = buildPartnerVeikartPatch([], [debt], null, stubVeikart, now)
    expect(patch.debts).toHaveLength(1)
    expect(patch.debts![0].interestRate).toBe(4.5)
    expect(patch.debts![0].monthlyPayment).toBe(2_500)
    expect(patch.debts![0].label).toBe('Lånekassen')
  })

  it('ekskluderer nedbetalt gjeld', () => {
    const paid = makeDebt({ status: 'nedbetalt' })
    const patch = buildPartnerVeikartPatch([], [paid], null, stubVeikart, now)
    expect(patch.debts).toHaveLength(0)
  })
})
```

- [ ] **Steg 2: Kjør testen og bekreft at den feiler**

```bash
npm test src/domain/economy/__tests__/syncPartnerToVeikart.test.ts
```

Forventet: FAIL — `buildPartnerVeikartPatch` finnes ikke.

- [ ] **Steg 3: Opprett domain-funksjonen**

Opprett `src/domain/economy/syncPartnerToVeikart.ts`:

```ts
import { computeEffectiveBalance } from './savingsCalculator'
import type {
  SavingsAccount, DebtAccount, EmploymentProfile,
  PartnerVeikart, PartnerAccount, PartnerDebt,
} from '@/types/economy'

export function buildPartnerVeikartPatch(
  savingsAccounts: SavingsAccount[],
  debts: DebtAccount[],
  profile: EmploymentProfile | null,
  existing: PartnerVeikart,
  now: Date,
): Partial<PartnerVeikart> & Pick<PartnerVeikart, 'enabled' | 'accounts' | 'bsu' | 'bsuMonthlyContribution' | 'annualIncome' | 'debts'> {
  const accounts: PartnerAccount[] = savingsAccounts
    .filter((a) => a.type !== 'BSU' && a.type !== 'fond')
    .map((a) => ({
      id: a.id,
      label: a.label,
      balance: computeEffectiveBalance(a, now),
      rate: [...a.rateHistory].sort((x, y) => y.fromDate.localeCompare(x.fromDate))[0]?.rate ?? 0,
      monthlyContribution: a.monthlyContribution ?? 0,
    }))

  const bsuAcc = savingsAccounts.find((a) => a.type === 'BSU')

  const activeDebts: PartnerDebt[] = debts
    .filter((d) => d.status !== 'nedbetalt')
    .map((d) => ({
      id: d.id,
      label: d.creditor,
      currentBalance: d.currentBalance,
      interestRate: [...d.rateHistory].sort((x, y) => y.fromDate.localeCompare(x.fromDate))[0]?.nominalRate ?? 0,
      monthlyPayment: d.monthlyPayment,
    }))

  return {
    enabled: true,
    accounts,
    bsu: bsuAcc ? computeEffectiveBalance(bsuAcc, now) : existing.bsu,
    bsuMonthlyContribution: bsuAcc?.monthlyContribution ?? existing.bsuMonthlyContribution,
    annualIncome: profile ? (profile.baseMonthly ?? 0) * 12 : existing.annualIncome,
    debts: activeDebts,
  }
}
```

- [ ] **Steg 4: Kjør testen og bekreft at den passerer**

```bash
npm test src/domain/economy/__tests__/syncPartnerToVeikart.test.ts
```

Forventet: alle tester PASS.

- [ ] **Steg 5: Oppdater verktøylinja i MånedsoversiktTable**

I `SavingsPage.tsx`, finn `MånedsoversiktTable`-komponenten. Øverst i funksjonen, legg til imports og hooks:

```tsx
// Øverst i filen — legg til disse importene:
import { usePartnerStore } from '@/application/usePartnerStore'
import { usePartnershipStore } from '@/store/usePartnershipStore'
import { buildPartnerVeikartPatch } from '@/domain/economy/syncPartnerToVeikart'
import { useEconomyStore } from '@/application/useEconomyStore'
```

Inne i `MånedsoversiktTable`-funksjonen, etter eksisterende hooks:

```tsx
const setCurrentView = useAppStore((s) => s.setCurrentView)
const partnerStatus = usePartnershipStore((s) => s.status)
const setPartnerVeikart = useEconomyStore((s) => s.setPartnerVeikart)
const [syncDone, setSyncDone] = useState(false)

function syncPartner() {
  const ps = usePartnerStore.getState()
  const patch = buildPartnerVeikartPatch(
    ps.savingsAccounts,
    ps.debts,
    ps.profile,
    partnerVeikart,
    now,
  )
  setPartnerVeikart({ ...partnerVeikart, ...patch })
  setSyncDone(true)
  setTimeout(() => setSyncDone(false), 2000)
}
```

- [ ] **Steg 6: Bytt ut "Rediger partner →"-knappen i verktøylinja**

Finn og erstatt denne knappen (ca. linje 869 i original):

```tsx
// FJERN:
<button
  onClick={() => setCurrentEconomyPage('settings')}
  className="flex items-center gap-1 px-2 py-1 rounded border border-border hover:bg-muted/40 transition-colors text-violet-400"
>
  Rediger partner →
</button>

// ERSTATT MED:
<button
  onClick={() => setCurrentView('partner')}
  className="flex items-center gap-1 px-2 py-1 rounded border border-border hover:bg-muted/40 transition-colors text-violet-400"
>
  + Partner konto
</button>
{partnerStatus === 'connected' && (
  <button
    onClick={syncPartner}
    className="flex items-center gap-1 px-2 py-1 rounded border border-border hover:bg-muted/40 transition-colors text-violet-400"
  >
    {syncDone ? '✓ Importert' : '⟳ Synk'}
  </button>
)}
```

- [ ] **Steg 7: Typesjekk**

```bash
npm run typecheck
```

Forventet: ingen feil.

- [ ] **Steg 8: Kjør alle tester**

```bash
npm test
```

Forventet: alle tester PASS.

- [ ] **Steg 9: Commit**

```bash
git add src/domain/economy/syncPartnerToVeikart.ts \
        src/domain/economy/__tests__/syncPartnerToVeikart.test.ts \
        src/pages/economy/SavingsPage.tsx
git commit -m "feat(savings): legg til partner-sync og navigasjon i Månedsoversikt"
```

---

## Avsluttende sjekk

- [ ] `npm run build` — ingen TypeScript-feil eller build-feil
- [ ] Manuell test: klikk logo → dashboard
- [ ] Manuell test: navigér til Partner-fanen uten tilkobling — bekreft at full UI vises med gult banner
- [ ] Manuell test: klikk "+ Partner konto" i Månedsoversikt → havner i Partner-fanen
