# Partner-innlegging i Sparing — Design

**Dato:** 2026-06-04  
**Status:** Klar for implementering

---

## Sammendrag

Tre relaterte forbedringer:

1. **Logo som hjem-knapp** — klikk på Lommeboka-logoen navigerer til `economy/dashboard`
2. **Partner-fanen alltid tilgjengelig** — fjern blokkeringen som viser invitasjonsskjerm når partner ikke er koblet
3. **To nye knapper i Månedsoversikt** — "+ Partner konto" og "⟳ Synk" erstatter "Rediger partner →"

---

## 1. Logo-navigasjon

**Fil:** `src/components/layout/Header.tsx`

Logo-området (bilde + tekst) pakkes i en `<button>` med `onClick` som kaller:
```ts
setCurrentView('economy')
setCurrentEconomyPage('dashboard')
```

Header trenger to nye hooks fra `useAppStore`: `setCurrentView` og `setCurrentEconomyPage`.

---

## 2. Partner-fanen alltid tilgjengelig

**Fil:** `src/pages/economy/PartnerPage.tsx`

### Nåværende oppførsel
Når `status !== 'connected'` returnerer komponenten en invitasjonsskjerm som blokkerer all annen funksjonalitet.

### Ny oppførsel
Alltid vis den fulle partner-fanen med alle sub-tabs (Dashbord, Lønn, Feriepenger, Budsjett, Sparing, Gjeld, Fravær, Skatt) via `EconomyStoreProvider store="partner"`.

Når `status !== 'connected'`: vis en diskret banner øverst:
```
⚠ Ikke koblet — data synkes ikke med en annen bruker.  [Koble til →]
```

`[Koble til →]` åpner `PartnerLinkSection` i en dialog/ekspanderbar seksjon.

### Aktivering av partnerVeikart
Når brukeren åpner partner-fanen for første gang (manuell modus), settes `partnerVeikart.enabled = true` automatisk — samme som i dag når man er koblet.

---

## 3. Verktøylinja i Månedsoversikt

**Fil:** `src/pages/economy/SavingsPage.tsx` — `MånedsoversiktTable`

### Knapper som erstattes
"Rediger partner →" fjernes.

### Nye knapper
```
+ Min konto   + Fond   + Partner konto   [⟳ Synk]   ...
```

**"+ Partner konto"** (alltid synlig):
- `onClick`: `setCurrentView('partner')`
- Tar brukeren til partner-fanen der de kan legge inn data manuelt

**"⟳ Synk"** (kun synlig når `usePartnershipStore().status === 'connected'`):
- `onClick`: kaller `syncPartnerToVeikart()`
- Viser "Partner-data importert" som kort feedback (f.eks. knappetekst endres til "✓ Importert" i 2 sek)

---

## 4. Sync-funksjonen

**Plassering:** Inline i `MånedsoversiktTable` eller som en util-funksjon i `src/lib/partnerSync.ts`

```ts
function syncPartnerToVeikart() {
  const partnerStore = usePartnerStore.getState()
  const { setPartnerVeikart, partnerVeikart } = useEconomyStore.getState()

  const now = new Date()
  const nonBsuAccounts = partnerStore.savingsAccounts
    .filter(a => a.type !== 'BSU' && a.type !== 'fond')
    .map(a => ({
      id: a.id,
      label: a.label,
      type: a.type,
      balance: computeEffectiveBalance(a, now),
      rate: [...a.rateHistory].sort((x, y) => y.fromDate.localeCompare(x.fromDate))[0]?.rate ?? 0,
      monthlyContribution: a.monthlyContribution ?? 0,
    }))

  const bsuAcc = partnerStore.savingsAccounts.find(a => a.type === 'BSU')
  const annualIncome = partnerStore.profile
    ? (partnerStore.profile.baseMonthly ?? 0) * 12
    : partnerVeikart.annualIncome

  const activeDebts = partnerStore.debts
    .filter(d => d.status !== 'nedbetalt')
    .map(d => ({
      id: d.id,
      label: d.label,
      currentBalance: d.currentBalance,
      rate: [...d.rateHistory].sort((x, y) => y.fromDate.localeCompare(x.fromDate))[0]?.nominalRate ?? 0,
      monthlyPayment: d.monthlyPayment,
    }))

  setPartnerVeikart({
    ...partnerVeikart,
    enabled: true,
    accounts: nonBsuAccounts,
    bsu: bsuAcc ? computeEffectiveBalance(bsuAcc, now) : partnerVeikart.bsu,
    bsuMonthlyContribution: bsuAcc?.monthlyContribution ?? partnerVeikart.bsuMonthlyContribution,
    annualIncome,
    debts: activeDebts.length > 0 ? activeDebts : partnerVeikart.debts,
  })
}
```

**Fond synkes ikke** — partnerens fond er ikke en del av `partnerVeikart`-modellen.

---

## Dataflyt

```
Manuell innlegging:
  Bruker → Partner-fanen → usePartnerStore (lokal) → [⟳ Synk] → partnerVeikart → Månedsoversikt

Koblet partner:
  Partner-bruker → sin app → Supabase → usePartnerStore (synket) → [⟳ Synk] → partnerVeikart → Månedsoversikt
```

---

## Filer som endres

| Fil | Endring |
|-----|---------|
| `src/components/layout/Header.tsx` | Logo-knapp med hjem-navigasjon |
| `src/pages/economy/PartnerPage.tsx` | Fjern invitasjons-gate, legg til koblet/ukoblet-banner |
| `src/pages/economy/SavingsPage.tsx` | Bytt ut "Rediger partner →" med to nye knapper + sync-logikk |

---

## Ikke i scope

- Fond-sync til `partnerVeikart`
- Automatisk/real-time sync uten at bruker klikker "⟳ Synk"
- Endringer i `partnerVeikart`-datamodellen
