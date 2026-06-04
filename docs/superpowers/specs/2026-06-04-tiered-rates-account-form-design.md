# Trinnvis rente og utvidet kontoskjema — Design

**Dato:** 2026-06-04  
**Status:** Klar for implementering

---

## Sammendrag

Tre relaterte forbedringer:

1. **Trinnvis rente** — ny `tieredRates`-struktur på `SavingsAccount`, kalkulator oppdateres
2. **Bankpresets i Innstillinger** — konfigurerbar liste over banker og rentesatser
3. **Ny utvidet `AddAccountForm`** — bankvelger, trinnvis renteeditor, spareplaner og enkeltinnskudd ved opprettelse

---

## 1. Datamodell

### Nye typer i `src/types/economy.ts`

```ts
export interface TieredRate {
  fromBalance: number  // terskel i kr (0 = første trinn)
  rate: number         // % per år — gjelder hele saldoen når balance >= fromBalance
}

export interface BankAccountPreset {
  id: string
  bankName: string            // "Trøndelag Sparebank"
  accountTypeName: string     // "Gullkonto"
  tieredRates: TieredRate[]
  interestCreditFrequency: 'monthly' | 'yearly'
  enabled: boolean            // vises i bankvelger i AddAccountForm
}
```

### Endring i `SavingsAccount`

Nytt optional felt:
```ts
tieredRates?: TieredRate[]  // sortert stigende på fromBalance
```

`rateHistory` beholdes uendret for historiske rente*endringer* over tid. `tieredRates` beskriver nåværende trinnstruktur og tas i bruk av kalkulatoren når den er tilstede.

### Nytt felt i `useEconomyStore`

```ts
bankPresets: BankAccountPreset[]
setBankPresets: (presets: BankAccountPreset[]) => void
updateBankPreset: (id: string, updates: Partial<BankAccountPreset>) => void
addBankPreset: (preset: BankAccountPreset) => void
removeBankPreset: (id: string) => void
```

Initialiseres fra hardkodede standardverdier via store-migrering (bumpe version, seed `bankPresets` om tom).

---

## 2. Bankpresets — standardverdier

**Fil:** `src/config/bankPresets.ts`

Eksporterer `DEFAULT_BANK_PRESETS: BankAccountPreset[]`:

| Bank | Kontotype | Trinn |
|------|-----------|-------|
| Trøndelag Sparebank | Gullkonto | 0: 3,25% / 100k: 3,55% / 500k: 3,80% / 1M: 4,05% |
| Trøndelag Sparebank | Gullkonto UNG (under 34) | 0: 4,10% |
| Trøndelag Sparebank | Særvilkår | 0: 3,00% / 100k: 3,50% / 1M: 4,05% |
| Trøndelag Sparebank | BSU Pluss | 0: 4,75% |
| DNB | Sparekonto Pluss | 0: 2,50% / 100k: 3,65% / 500k: 4,10% / 2M: 0,80% |
| DNB | Høyrentekonto | 0: 3,50% |
| Storebrand | Høyrentekonto | 0: 3,50% / 100k: 3,75% / 500k: 4,40% |
| Nordea | BufferSpar | 0: 3,05% / 100k: 0,90% |
| Nordea | Sparekonto Ekstra | 0: 4,35% |
| SpareBank 1 | Sparekonto | 0: 3,50% / 500k: 2,45% |

BSU-kontoer håndteres av eksisterende BSU-logikk og er ikke i preset-listen.

---

## 3. Innstillinger — "Banker og rentesatser"

**Fil:** `src/pages/economy/EconomySettingsPage.tsx` — ny seksjon

### UI

- Liste over alle `bankPresets` gruppert etter `bankName`
- Per preset: toggle (enabled/disabled), rediger-knapp, slett-knapp
- Redigering: inline skjema med `bankName`, `accountTypeName`, `interestCreditFrequency`, og redigerbar rentesats-tabell
- "+ Legg til kontotype"-knapp nederst
- "Tilbakestill til standard"-knapp per bank (gjenoppretter fra `DEFAULT_BANK_PRESETS` for den banken)

---

## 4. Ny `AddAccountForm`

**Fil:** `src/pages/economy/SavingsPage.tsx` — erstatter eksisterende `AddAccountForm` og `EditAccountForm`

Én enkelt form med fire seksjoner. Brukes både ved opprettelse og redigering (pre-fylt ved redigering).

### Seksjon A — Grunninfo
- Navn (tekst)
- Type: BSU / Sparekonto / Fond / Krypto / Annet
- Nåværende saldo (kr)
- Åpningsdato (date-picker, default: i dag)
- Kontonummer (valgfritt)
- Fødselsår (kun ved BSU, for aldersgrense)

### Seksjon B — Rente
- Bankvelger: dropdown med alle `enabled` presets fra `bankPresets`
  - Velg preset → `tieredRates` fylles inn automatisk
  - "Ingen bank / manuell" = standard valg
- Rentesats-tabell: opp til 6 rader med `Fra saldo (kr)` og `Rente (%)` + slett-rad-knapp
  - Første rad har alltid `fromBalance = 0` (kan ikke slettes)
- "+ Legg til trinn"-knapp (aktiv når < 6 rader)
- `interestCreditFrequency`: månedlig / årlig (BSU = alltid årlig)

### Seksjon C — Spareplaner
- Liste over bidragsperioder: `beløp (kr/mnd)` / `fra dato` (valgfri) / `til dato` (valgfri) + slett
- "+ Legg til periode"-knapp
- Om ingen perioder: enkelt "Standard månedlig beløp"-felt

### Seksjon D — Enkeltinnskudd *(sammenleggbar, skjult som standard)*
- For å registrere historiske innskudd ved opprettelse
- Liste med `dato` + `beløp` + `notat (valgfritt)` + slett
- "+ Legg til innskudd"-knapp

### Lagring
Ved `onSave` produseres ett komplett `SavingsAccount`-objekt:
- `rateHistory`: settes til `[{ fromDate: openingDate, rate: tieredRates[last].rate }]` som fallback hvis tieredRates har ett trinn; ellers settes rate til gjennomsnitt av aktive trinn (brukes kun som legacy-fallback)
- `tieredRates`: fra seksjon B (undefined hvis kun ett trinn uten terskel — bruker da flat `rateHistory`)
- `contributionPeriods`: fra seksjon C
- `contributions`: fra seksjon D

---

## 5. Kalkulator-oppdateringer

**Fil:** `src/domain/economy/savingsCalculator.ts`

### Ny hjelpefunksjon

```ts
export function getEffectiveRate(account: SavingsAccount, balance: number): number {
  if (!account.tieredRates?.length) {
    return [...account.rateHistory]
      .sort((a, b) => b.fromDate.localeCompare(a.fromDate))[0]?.rate ?? 0
  }
  const sorted = [...account.tieredRates].sort((a, b) => b.fromBalance - a.fromBalance)
  return sorted.find(t => balance >= t.fromBalance)?.rate ?? sorted.at(-1)!.rate
}
```

### Endrede funksjoner

**`computeYearlyInterestIncome`** — erstatter hardkodet `rateHistory`-oppslag med `getEffectiveRate(account, currentBalance)`

**Månedsoversikt-simulatoren** i `SavingsPage.tsx` — inne i per-måned-løkken brukes `getEffectiveRate(acc, runningBals[j])` istedenfor `acc.rate` (den lokale metadata-kopien)

**AccountCard stats-grid** — rentesats-feltet viser trinnvis tabell når `tieredRates?.length > 1`:
```
Rentesats    0–100k: 3,25%  100k–500k: 3,55%  500k–1M: 3,80%  1M+: 4,05%
             ▲ Din saldo: 450 000 kr → aktiv sats: 3,55%
```

---

## Filer som endres/opprettes

| Fil | Endring |
|-----|---------|
| `src/types/economy.ts` | Legg til `TieredRate`, `BankAccountPreset`, `tieredRates?` på `SavingsAccount`, `bankPresets` på store-interface |
| `src/config/bankPresets.ts` | **Ny** — `DEFAULT_BANK_PRESETS` |
| `src/application/useEconomyStore.ts` | Legg til `bankPresets` state + actions + migrering |
| `src/domain/economy/savingsCalculator.ts` | Ny `getEffectiveRate`, oppdater `computeYearlyInterestIncome` |
| `src/pages/economy/SavingsPage.tsx` | Ny `AddAccountForm`, erstatt `EditAccountForm`, oppdater Månedsoversikt-simulator og AccountCard |
| `src/pages/economy/EconomySettingsPage.tsx` | Ny "Banker og rentesatser"-seksjon |
| `src/domain/economy/syncPartnerToVeikart.ts` | Kopier `tieredRates` ved sync, bruk `getEffectiveRate` |

---

## 6. Partnerkontoer — trinnvis rente

`PartnerAccount` i `src/types/economy.ts` får nytt optional felt:
```ts
tieredRates?: TieredRate[]
```

**`buildPartnerVeikartPatch`** i `src/domain/economy/syncPartnerToVeikart.ts` — kopierer `tieredRates` fra partnerens `SavingsAccount` ved sync:
```ts
.map((a) => ({
  id: a.id,
  label: a.label,
  balance: projectedBalance(a),
  rate: getEffectiveRate(a, projectedBalance(a)),  // aktiv sats ved synktidspunkt
  tieredRates: a.tieredRates,                      // kopieres for fremtidig simulering
  monthlyContribution: a.monthlyContribution ?? 0,
}))
```

**Månedsoversikt-simulatoren** — partner-kontoer bruker `getEffectiveRate`-logikk basert på `partnerAccMeta[j].tieredRates` og løpende saldo.

---

## Ikke i scope

- Live-henting av rentesatser fra banker (hardkodet)
- Per-trinn-beregning (hvert kr-sjikt med egen rente) — norsk standard er "hele saldoen"
- Historisk endring av trinnstruktur over tid
