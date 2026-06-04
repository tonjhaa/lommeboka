# Trinnvis rente — UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Krever:** Plan A (`2026-06-04-tiered-rates-foundation.md`) må være fullført.

**Goal:** Nytt utvidet kontoskjema med bankvelger og trinnvis renteeditor, trinnvis rente i AccountCard og Månedsoversikt, og bank-preset-administrasjon i Innstillinger.

**Architecture:** Tre UI-komponenter i eksisterende filer. `AddAccountForm` og `EditAccountForm` i `SavingsPage.tsx` erstattes av én ny form. `EconomySettingsPage.tsx` får ny seksjon. Månedsoversikt-simulatoren oppdateres til å bruke `getEffectiveRateFromTiers` per måned.

**Tech Stack:** React 19, TypeScript strict, Tailwind CSS v4, shadcn-komponenter

---

## Filkart

| Fil | Endring |
|-----|---------|
| `src/pages/economy/SavingsPage.tsx` | Ny `AccountForm` (erstatter `AddAccountForm` + `EditAccountForm`), oppdater `AccountCard` stats-grid, oppdater Månedsoversikt-simulator |
| `src/pages/economy/EconomySettingsPage.tsx` | Ny `BankPresetsSection` |

---

## Task 6: Oppdater Månedsoversikt-simulator til trinnvis rente

**Files:**
- Modify: `src/pages/economy/SavingsPage.tsx`

### Kontekst
I `MånedsoversiktTable` (linje ~651) bygges `accMeta` med en fast `rate` per konto (linje ~726):
```ts
rate: contribOverrides[`rate-${acc.id}`] ?? ([...acc.rateHistory].sort(...)[0]?.rate ?? 0),
```

Denne raten brukes månedlig i simulatoren (linje ~745):
```ts
const monthlyInterest = bal0 * acc.rate / 100 / 12
```

For trinnvis rente skal renten beregnes fra `runningBals[j]` per måned, ikke fra en fast verdi.

Partner-kontoer fra `partnerAccMeta` (linje ~708) har `rate` og nå også `tieredRates`.

- [ ] **Steg 1: Legg til import av getEffectiveRateFromTiers**

Øverst i `SavingsPage.tsx`, legg til i eksisterende import fra kalkulatoren:
```ts
import {
  ...,
  getEffectiveRateFromTiers,
} from '@/domain/economy/savingsCalculator'
```

- [ ] **Steg 2: Legg til tieredRates i accMeta**

Finn `accMeta`-byggingen (linje ~721) og legg til `tieredRates`:
```ts
    const accMeta = accounts.map(acc => ({
      id: acc.id,
      label: acc.label,
      type: acc.type,
      startBalance: contribOverrides[`start-${acc.id}`] ?? computeEffectiveBalance(acc, now),
      rate: contribOverrides[`rate-${acc.id}`] ?? ([...acc.rateHistory].sort((a, b) => b.fromDate.localeCompare(a.fromDate))[0]?.rate ?? 0),
      tieredRates: acc.tieredRates,
      getBase: (year: number, month: number) => getBaseContribForMonth(acc, year, month, nowISO),
    }))
```

- [ ] **Steg 3: Bruk tieredRates per måned i simulatoren**

I per-måned-løkken, finn der `monthlyInterest` beregnes for vanlige kontoer (ca. linje ~745):
```ts
          const monthlyInterest = bal0 * acc.rate / 100 / 12
```

Erstatt med:
```ts
          const effectiveRate = (acc.tieredRates?.length && !(`rate-${acc.id}` in contribOverrides))
            ? getEffectiveRateFromTiers(acc.tieredRates, bal0)
            : acc.rate
          const monthlyInterest = bal0 * effectiveRate / 100 / 12
```

- [ ] **Steg 4: Legg til tieredRates i partnerAccMeta**

Finn `partnerAccMeta`-byggingen (linje ~708):
```ts
      const partnerAccMeta: (PartnerAccount & { runningBal: number })[] = hasPartner
        ? (partnerVeikart.accounts ?? []).map(a => ({
            ...a,
            rate: contribOverrides[`rate-p-${a.id}`] ?? a.rate,
            runningBal: contribOverrides[`start-p-${a.id}`] ?? a.balance,
          }))
        : []
```

Beholder som er — `...a` kopierer allerede `tieredRates` siden det er på `PartnerAccount`.

Finn partner-rente-beregningen i simulatoren (ca. linje ~779):
```ts
        const rate = acc.rate || SAVINGS_RATE_TABLE
        const monthlyInterest = acc.runningBal * rate / 100 / 12
```

Erstatt med:
```ts
        const rate = (acc.tieredRates?.length && !(`rate-p-${acc.id}` in contribOverrides))
          ? getEffectiveRateFromTiers(acc.tieredRates, acc.runningBal)
          : (acc.rate || SAVINGS_RATE_TABLE)
        const monthlyInterest = acc.runningBal * rate / 100 / 12
```

- [ ] **Steg 5: Typesjekk**

```bash
npm run typecheck
```

Forventet: ingen feil.

- [ ] **Steg 6: Commit**

```bash
git add src/pages/economy/SavingsPage.tsx
git commit -m "feat(savings): trinnvis rente i Månedsoversikt-simulator"
```

---

## Task 7: Oppdater AccountCard stats-grid til å vise trinnvis rente

**Files:**
- Modify: `src/pages/economy/SavingsPage.tsx`

### Kontekst
`AccountCard` stats-grid viser "Rentesats" som `MiniStat` med én verdi (linje ~1573).

Når `account.tieredRates?.length > 1` skal vi vise en kompakt trinnvis liste istedenfor én sats.

- [ ] **Steg 1: Oppdater MiniStat-kortet for rentesats**

Finn i `AccountCard` (ca. linje 1573):
```tsx
          <MiniStat
            label="Rentesats"
            value={`${currentRate.toFixed(2)} %`}
            subvalue={isBSU ? 'krediteres 31. des' : 'månedlig kreditering'}
          />
```

Erstatt med:
```tsx
          {account.tieredRates && account.tieredRates.length > 1 ? (
            <div className="rounded-lg border border-border bg-muted/10 p-2 space-y-0.5">
              <p className="text-xs text-muted-foreground">Rentesats (trinnvis)</p>
              {[...account.tieredRates]
                .sort((a, b) => a.fromBalance - b.fromBalance)
                .map((t, i, arr) => {
                  const isActive = currentBalance >= t.fromBalance &&
                    (i === arr.length - 1 || currentBalance < arr[i + 1].fromBalance)
                  return (
                    <div key={t.fromBalance} className={`flex justify-between text-xs ${isActive ? 'text-primary font-semibold' : 'text-muted-foreground'}`}>
                      <span>
                        {t.fromBalance === 0 ? '0' : `${(t.fromBalance / 1000).toFixed(0)}k`}
                        {i < arr.length - 1 ? `–${(arr[i + 1].fromBalance / 1000).toFixed(0)}k` : '+'}
                      </span>
                      <span>{t.rate.toFixed(2)} %{isActive ? ' ◀' : ''}</span>
                    </div>
                  )
                })}
            </div>
          ) : (
            <MiniStat
              label="Rentesats"
              value={`${currentRate.toFixed(2)} %`}
              subvalue={isBSU ? 'krediteres 31. des' : 'månedlig kreditering'}
            />
          )}
```

- [ ] **Steg 2: Typesjekk**

```bash
npm run typecheck
```

Forventet: ingen feil.

- [ ] **Steg 3: Commit**

```bash
git add src/pages/economy/SavingsPage.tsx
git commit -m "feat(savings): vis trinnvis rentesats i AccountCard"
```

---

## Task 8: Ny AccountForm (erstatter AddAccountForm og EditAccountForm)

**Files:**
- Modify: `src/pages/economy/SavingsPage.tsx`

### Kontekst
`AddAccountForm` (linje 2292) og `EditAccountForm` (linje 2399) erstattes av én ny `AccountForm`-komponent som brukes for både opprettelse og redigering.

Ny `AccountForm` tar props:
```ts
interface AccountFormProps {
  initial?: SavingsAccount   // undefined = ny konto, definert = redigering
  bankPresets: BankAccountPreset[]
  onSave: (account: SavingsAccount) => void
  onCancel: () => void
}
```

- [ ] **Steg 1: Legg til import av useEconomyStore for bankPresets i SavingsPage**

Øverst i `SavingsPage.tsx`, legg til i eksisterende import:
```ts
import { useEconomyStore } from '@/application/useEconomyStore'
```

- [ ] **Steg 2: Les bankPresets i SavingsPage-komponenten**

I `SavingsPage()`-funksjonen, legg til:
```ts
  const bankPresets = useEconomyStore((s) => s.bankPresets)
```

- [ ] **Steg 3: Oppdater bruken av AddAccountForm til AccountForm**

Finn (linje ~172):
```tsx
          {showAddAccount && (
            <AddAccountForm
              onSave={(a) => { addSavingsAccount(a); setShowAddAccount(false) }}
              onCancel={() => setShowAddAccount(false)}
            />
          )}
```

Erstatt med:
```tsx
          {showAddAccount && (
            <AccountForm
              bankPresets={bankPresets}
              onSave={(a) => { addSavingsAccount(a); setShowAddAccount(false) }}
              onCancel={() => setShowAddAccount(false)}
            />
          )}
```

- [ ] **Steg 4: Oppdater AccountCard til å bruke AccountForm for redigering**

Finn i `AccountCard` der `EditAccountForm` brukes (linje ~1563):
```tsx
        {editingAccount && (
          <EditAccountForm
            account={account}
            onSave={(patch) => { onUpdate(patch); setEditingAccount(false) }}
            onCancel={() => setEditingAccount(false)}
          />
        )}
```

AccountCard trenger `bankPresets` som prop. Oppdater `AccountCard`-interface til å inkludere:
```ts
  bankPresets: BankAccountPreset[]
```

Og legg til `bankPresets` i `AccountCard`-kallet i `SavingsPage`:
```tsx
                <AccountCard
                  key={account.id}
                  account={account}
                  now={now}
                  bankPresets={bankPresets}
                  ...
```

Inne i `AccountCard`, erstatt `EditAccountForm`-blokken med:
```tsx
        {editingAccount && (
          <AccountForm
            initial={account}
            bankPresets={bankPresets}
            onSave={(updated) => {
              onUpdate({
                label: updated.label,
                type: updated.type,
                accountNumber: updated.accountNumber,
                tieredRates: updated.tieredRates,
                rateHistory: updated.rateHistory,
                contributionPeriods: updated.contributionPeriods,
                monthlyContribution: updated.monthlyContribution,
              })
              setEditingAccount(false)
            }}
            onCancel={() => setEditingAccount(false)}
          />
        )}
```

- [ ] **Steg 5: Implementer AccountForm**

Slett `AddAccountForm` (linje 2292–2397) og `EditAccountForm` (linje 2399–2448) og erstatt med:

```tsx
function AccountForm({
  initial,
  bankPresets,
  onSave,
  onCancel,
}: {
  initial?: SavingsAccount
  bankPresets: BankAccountPreset[]
  onSave: (a: SavingsAccount) => void
  onCancel: () => void
}) {
  const isEdit = !!initial

  // Seksjon A: Grunninfo
  const [label, setLabel] = useState(initial?.label ?? '')
  const [type, setType] = useState<SavingsAccountType>(initial?.type ?? 'sparekonto')
  const [openingBalance, setOpeningBalance] = useState(initial?.openingBalance ?? 0)
  const [openingDate, setOpeningDate] = useState(
    initial?.openingDate ?? new Date().toISOString().split('T')[0]
  )
  const [accountNumber, setAccountNumber] = useState(initial?.accountNumber ?? '')
  const [birthYear, setBirthYear] = useState(String(initial?.birthYear ?? ''))

  // Seksjon B: Rente
  const [selectedPresetId, setSelectedPresetId] = useState<string>('manual')
  const [tieredRates, setTieredRates] = useState<TieredRate[]>(
    initial?.tieredRates ?? [{ fromBalance: 0, rate: initial?.rateHistory?.[0]?.rate ?? 3.5 }]
  )
  const [interestFreq, setInterestFreq] = useState<'monthly' | 'yearly'>(
    initial?.interestCreditFrequency ?? 'monthly'
  )

  // Seksjon C: Spareplaner
  const [periods, setPeriods] = useState<ContributionPeriod[]>(
    initial?.contributionPeriods ?? []
  )
  const [defaultMonthly, setDefaultMonthly] = useState(initial?.monthlyContribution ?? 0)

  // Seksjon D: Enkeltinnskudd
  const [showDeposits, setShowDeposits] = useState(false)
  const [deposits, setDeposits] = useState<SavingsContribution[]>(
    initial?.contributions ?? []
  )

  const isBSU = type === 'BSU'
  const enabledPresets = bankPresets.filter((p) => p.enabled)

  function applyPreset(presetId: string) {
    setSelectedPresetId(presetId)
    if (presetId === 'manual') return
    const preset = enabledPresets.find((p) => p.id === presetId)
    if (!preset) return
    setTieredRates([...preset.tieredRates])
    setInterestFreq(preset.interestCreditFrequency)
  }

  function updateTier(idx: number, field: 'fromBalance' | 'rate', value: number) {
    setTieredRates((prev) => prev.map((t, i) => i === idx ? { ...t, [field]: value } : t))
  }

  function removeTier(idx: number) {
    if (idx === 0) return
    setTieredRates((prev) => prev.filter((_, i) => i !== idx))
  }

  function addTier() {
    const lastBalance = tieredRates.at(-1)?.fromBalance ?? 0
    setTieredRates((prev) => [...prev, { fromBalance: lastBalance + 100_000, rate: 0 }])
  }

  function addPeriod() {
    setPeriods((prev) => [...prev, {
      id: crypto.randomUUID(),
      amount: 0,
      fromDate: new Date().toISOString().split('T')[0],
    }])
  }

  function updatePeriod(id: string, patch: Partial<ContributionPeriod>) {
    setPeriods((prev) => prev.map((p) => p.id === id ? { ...p, ...patch } : p))
  }

  function removePeriod(id: string) {
    setPeriods((prev) => prev.filter((p) => p.id !== id))
  }

  function addDeposit() {
    setDeposits((prev) => [...prev, {
      id: crypto.randomUUID(),
      date: new Date().toISOString().split('T')[0],
      amount: 0,
    }])
  }

  function updateDeposit(id: string, patch: Partial<SavingsContribution>) {
    setDeposits((prev) => prev.map((d) => d.id === id ? { ...d, ...patch } : d))
  }

  function removeDeposit(id: string) {
    setDeposits((prev) => prev.filter((d) => d.id !== id))
  }

  function handleSave() {
    if (!label.trim()) return
    const hasMultipleTiers = tieredRates.length > 1 ||
      (tieredRates.length === 1 && tieredRates[0].fromBalance > 0)
    const effectiveTieredRates = hasMultipleTiers ? tieredRates : undefined
    const flatRate = tieredRates[0]?.rate ?? 3.5

    const account: SavingsAccount = {
      id: initial?.id ?? crypto.randomUUID(),
      label: label.trim(),
      type,
      openingBalance,
      openingDate,
      accountNumber: accountNumber || undefined,
      birthYear: isBSU && birthYear ? parseInt(birthYear) : undefined,
      interestCreditFrequency: isBSU ? 'yearly' : interestFreq,
      rateHistory: initial?.rateHistory ?? [{ fromDate: openingDate, rate: flatRate }],
      tieredRates: effectiveTieredRates,
      monthlyContribution: periods.length > 0 ? 0 : defaultMonthly,
      contributionPeriods: periods.length > 0 ? periods : undefined,
      balanceHistory: initial?.balanceHistory ?? [],
      withdrawals: initial?.withdrawals ?? [],
      contributions: deposits.filter((d) => d.amount > 0),
      ...(isBSU ? { maxYearlyContribution: 27500, maxTotalBalance: 300_000 } : {}),
    }
    onSave(account)
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{isEdit ? 'Rediger konto' : 'Ny sparekonto'}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* Seksjon A: Grunninfo */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Grunninfo</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Navn</Label>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="f.eks. Sparekonto DNB" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as SavingsAccountType)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(ACCOUNT_TYPE_LABELS) as SavingsAccountType[]).map((t) => (
                    <SelectItem key={t} value={t} className="text-xs">{ACCOUNT_TYPE_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Nåværende saldo</Label>
              <Input type="number" placeholder="0" value={openingBalance || ''} onChange={(e) => setOpeningBalance(parseFloat(e.target.value) || 0)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Åpningsdato</Label>
              <Input type="date" value={openingDate} onChange={(e) => setOpeningDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Kontonummer (valgfritt)</Label>
              <Input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="xxxx.xx.xxxxx" />
            </div>
            {isBSU && (
              <div className="col-span-2 space-y-1">
                <Label className="text-xs">Fødselsår (for aldersgrense)</Label>
                <Input type="number" placeholder="f.eks. 1995" value={birthYear} onChange={(e) => setBirthYear(e.target.value)} />
              </div>
            )}
          </div>
        </div>

        {/* Seksjon B: Rente */}
        {!isBSU && (
          <div className="space-y-2 border-t border-border/30 pt-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Rente</p>
            {enabledPresets.length > 0 && (
              <div className="space-y-1">
                <Label className="text-xs">Bank / kontotype</Label>
                <Select value={selectedPresetId} onValueChange={applyPreset}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Velg bank…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual" className="text-xs">Manuell innlegging</SelectItem>
                    {enabledPresets.map((p) => (
                      <SelectItem key={p.id} value={p.id} className="text-xs">
                        {p.bankName} — {p.accountTypeName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs">Rentesatser</Label>
              <div className="space-y-1">
                {tieredRates.map((tier, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <div className="flex items-center gap-1 flex-1">
                      <span className="text-xs text-muted-foreground w-16">Fra saldo</span>
                      <Input
                        type="number"
                        step={10000}
                        disabled={idx === 0}
                        value={tier.fromBalance || ''}
                        placeholder="0"
                        onChange={(e) => updateTier(idx, 'fromBalance', parseFloat(e.target.value) || 0)}
                        className="h-7 text-xs w-28"
                      />
                      <span className="text-xs text-muted-foreground">kr →</span>
                      <Input
                        type="number"
                        step={0.05}
                        value={tier.rate || ''}
                        placeholder="0.00"
                        onChange={(e) => updateTier(idx, 'rate', parseFloat(e.target.value) || 0)}
                        className="h-7 text-xs w-20"
                      />
                      <span className="text-xs text-muted-foreground">%</span>
                    </div>
                    {idx > 0 && (
                      <button onClick={() => removeTier(idx)} className="text-muted-foreground hover:text-red-400 transition-colors">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {tieredRates.length < 6 && (
                <button onClick={addTier} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1">
                  <Plus className="h-3 w-3" /> Legg til trinn
                </button>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Rentekreditering</Label>
              <Select value={interestFreq} onValueChange={(v) => setInterestFreq(v as 'monthly' | 'yearly')}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly" className="text-xs">Månedlig</SelectItem>
                  <SelectItem value="yearly" className="text-xs">Årlig (31. des)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Seksjon C: Spareplaner */}
        <div className="space-y-2 border-t border-border/30 pt-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Spareplaner</p>
          {periods.length === 0 ? (
            <div className="space-y-1">
              <Label className="text-xs">Standard månedlig beløp</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  step={100}
                  placeholder="0"
                  value={defaultMonthly || ''}
                  onChange={(e) => setDefaultMonthly(parseFloat(e.target.value) || 0)}
                  className="w-36"
                />
                <span className="text-xs text-muted-foreground">kr/mnd</span>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              {periods.map((p) => (
                <div key={p.id} className="flex items-center gap-2 rounded border border-border/40 bg-muted/10 px-2 py-1.5">
                  <Input
                    type="number"
                    step={100}
                    placeholder="Beløp"
                    value={p.amount || ''}
                    onChange={(e) => updatePeriod(p.id, { amount: parseFloat(e.target.value) || 0 })}
                    className="h-7 text-xs w-24 font-mono"
                  />
                  <span className="text-xs text-muted-foreground shrink-0">kr/mnd fra</span>
                  <Input
                    type="date"
                    value={p.fromDate ?? ''}
                    onChange={(e) => updatePeriod(p.id, { fromDate: e.target.value || undefined })}
                    className="h-7 text-xs w-32"
                  />
                  <span className="text-xs text-muted-foreground shrink-0">til</span>
                  <Input
                    type="date"
                    value={p.toDate ?? ''}
                    onChange={(e) => updatePeriod(p.id, { toDate: e.target.value || undefined })}
                    className="h-7 text-xs w-32"
                  />
                  <button onClick={() => removePeriod(p.id)} className="text-muted-foreground hover:text-red-400 transition-colors shrink-0">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <button onClick={addPeriod} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <Plus className="h-3 w-3" /> Legg til periode
          </button>
        </div>

        {/* Seksjon D: Enkeltinnskudd */}
        {!isEdit && (
          <div className="border-t border-border/30 pt-3">
            <button
              onClick={() => setShowDeposits((v) => !v)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronDown className={`h-3 w-3 transition-transform ${showDeposits ? 'rotate-180' : ''}`} />
              Legg til historiske innskudd (valgfritt)
            </button>
            {showDeposits && (
              <div className="mt-2 space-y-1.5">
                {deposits.map((d) => (
                  <div key={d.id} className="flex items-center gap-2">
                    <Input
                      type="date"
                      value={d.date}
                      onChange={(e) => updateDeposit(d.id, { date: e.target.value })}
                      className="h-7 text-xs w-32"
                    />
                    <Input
                      type="number"
                      step={100}
                      placeholder="Beløp"
                      value={d.amount || ''}
                      onChange={(e) => updateDeposit(d.id, { amount: parseFloat(e.target.value) || 0 })}
                      className="h-7 text-xs w-28 font-mono"
                    />
                    <span className="text-xs text-muted-foreground">kr</span>
                    <button onClick={() => removeDeposit(d.id)} className="text-muted-foreground hover:text-red-400 transition-colors">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <button onClick={addDeposit} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                  <Plus className="h-3 w-3" /> Legg til innskudd
                </button>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2 justify-end pt-2 border-t border-border/30">
          <Button variant="outline" size="sm" onClick={onCancel}>Avbryt</Button>
          <Button size="sm" onClick={handleSave} disabled={!label.trim()}>
            {isEdit ? 'Lagre endringer' : 'Opprett konto'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
```

Legg til `ChevronDown` i lucide-react-importen øverst i filen hvis den ikke allerede er der.

- [ ] **Steg 6: Typesjekk**

```bash
npm run typecheck
```

Forventet: ingen feil. Merk at `TieredRate` og `ContributionPeriod` allerede importeres fra `@/types/economy` — sjekk at de er i import-listen øverst.

- [ ] **Steg 7: Commit**

```bash
git add src/pages/economy/SavingsPage.tsx
git commit -m "feat(savings): ny AccountForm med bankvelger, trinnvis rente og spareplaner"
```

---

## Task 9: Legg til BankPresetsSection i EconomySettingsPage

**Files:**
- Modify: `src/pages/economy/EconomySettingsPage.tsx`

### Kontekst
`EconomySettingsPage` (linje 681) rendrer seksjoner adskilt av `<Separator />`. Ny seksjon legges til etter `<ModulesSection />`.

- [ ] **Steg 1: Legg til ny BankPresetsSection-komponent**

Legg til denne nye komponenten i `EconomySettingsPage.tsx` (f.eks. etter `ModulesSection`):

```tsx
function BankPresetsSection() {
  const bankPresets = useEconomyStore((s) => s.bankPresets)
  const updateBankPreset = useEconomyStore((s) => s.updateBankPreset)
  const addBankPreset = useEconomyStore((s) => s.addBankPreset)
  const removeBankPreset = useEconomyStore((s) => s.removeBankPreset)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [newBank, setNewBank] = useState({ bankName: '', accountTypeName: '', freq: 'monthly' as 'monthly' | 'yearly' })
  const [adding, setAdding] = useState(false)

  const grouped = bankPresets.reduce<Record<string, typeof bankPresets>>((acc, p) => {
    if (!acc[p.bankName]) acc[p.bankName] = []
    acc[p.bankName].push(p)
    return acc
  }, {})

  function resetToDefault(bankName: string) {
    DEFAULT_BANK_PRESETS
      .filter((p) => p.bankName === bankName)
      .forEach((p) => updateBankPreset(p.id, { tieredRates: p.tieredRates, enabled: p.enabled }))
  }

  return (
    <Section title="Banker og rentesatser" description="Konfigurer bankpresets som brukes i bankvelgeren når du oppretter sparekontoer.">
      <div className="space-y-4">
        {Object.entries(grouped).map(([bankName, presets]) => (
          <div key={bankName} className="rounded-lg border border-border bg-card/40 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-muted/20 border-b border-border">
              <p className="text-xs font-semibold">{bankName}</p>
              <button
                onClick={() => resetToDefault(bankName)}
                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                Tilbakestill
              </button>
            </div>
            <div className="divide-y divide-border/40">
              {presets.map((preset) => (
                <div key={preset.id} className="px-3 py-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={preset.enabled}
                        onChange={(e) => updateBankPreset(preset.id, { enabled: e.target.checked })}
                        className="h-3.5 w-3.5 accent-primary"
                      />
                      <span className="text-xs font-medium">{preset.accountTypeName}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {preset.interestCreditFrequency === 'monthly' ? 'månedlig' : 'årlig'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setEditingId(editingId === preset.id ? null : preset.id)}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {editingId === preset.id ? 'Lukk' : 'Rediger'}
                      </button>
                      <button
                        onClick={() => removeBankPreset(preset.id)}
                        className="text-muted-foreground hover:text-red-400 transition-colors p-0.5"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                  {editingId !== preset.id && (
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                      {[...preset.tieredRates]
                        .sort((a, b) => a.fromBalance - b.fromBalance)
                        .map((t) => (
                          <span key={t.fromBalance} className="text-[10px] text-muted-foreground font-mono">
                            {t.fromBalance === 0 ? '0' : `${(t.fromBalance / 1000).toFixed(0)}k`}+: {t.rate}%
                          </span>
                        ))}
                    </div>
                  )}
                  {editingId === preset.id && (
                    <div className="space-y-1.5 pl-2">
                      {[...preset.tieredRates]
                        .sort((a, b) => a.fromBalance - b.fromBalance)
                        .map((tier, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <Input
                              type="number"
                              step={10000}
                              disabled={idx === 0}
                              value={tier.fromBalance || ''}
                              placeholder="0"
                              onChange={(e) => {
                                const updated = [...preset.tieredRates]
                                updated[idx] = { ...tier, fromBalance: parseFloat(e.target.value) || 0 }
                                updateBankPreset(preset.id, { tieredRates: updated })
                              }}
                              className="h-6 text-xs w-24 font-mono"
                            />
                            <span className="text-xs text-muted-foreground">kr →</span>
                            <Input
                              type="number"
                              step={0.05}
                              value={tier.rate || ''}
                              onChange={(e) => {
                                const updated = [...preset.tieredRates]
                                updated[idx] = { ...tier, rate: parseFloat(e.target.value) || 0 }
                                updateBankPreset(preset.id, { tieredRates: updated })
                              }}
                              className="h-6 text-xs w-16 font-mono"
                            />
                            <span className="text-xs text-muted-foreground">%</span>
                            {idx > 0 && (
                              <button
                                onClick={() => {
                                  const updated = preset.tieredRates.filter((_, i) => i !== idx)
                                  updateBankPreset(preset.id, { tieredRates: updated })
                                }}
                                className="text-muted-foreground hover:text-red-400 transition-colors"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        ))}
                      <button
                        onClick={() => {
                          const last = preset.tieredRates.at(-1)
                          updateBankPreset(preset.id, {
                            tieredRates: [...preset.tieredRates, { fromBalance: (last?.fromBalance ?? 0) + 100_000, rate: 0 }],
                          })
                        }}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Plus className="h-3 w-3" /> Legg til trinn
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Legg til ny bank */}
        {adding ? (
          <div className="rounded-lg border border-border bg-card/40 p-3 space-y-2">
            <p className="text-xs font-medium">Ny kontotype</p>
            <div className="grid grid-cols-2 gap-2">
              <Input
                placeholder="Banknavn"
                value={newBank.bankName}
                onChange={(e) => setNewBank((b) => ({ ...b, bankName: e.target.value }))}
                className="h-7 text-xs"
              />
              <Input
                placeholder="Kontotype"
                value={newBank.accountTypeName}
                onChange={(e) => setNewBank((b) => ({ ...b, accountTypeName: e.target.value }))}
                className="h-7 text-xs"
              />
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={!newBank.bankName.trim() || !newBank.accountTypeName.trim()}
                onClick={() => {
                  addBankPreset({
                    id: crypto.randomUUID(),
                    bankName: newBank.bankName.trim(),
                    accountTypeName: newBank.accountTypeName.trim(),
                    tieredRates: [{ fromBalance: 0, rate: 0 }],
                    interestCreditFrequency: newBank.freq,
                    enabled: true,
                  })
                  setNewBank({ bankName: '', accountTypeName: '', freq: 'monthly' })
                  setAdding(false)
                }}
              >
                Legg til
              </Button>
              <Button variant="outline" size="sm" onClick={() => setAdding(false)}>Avbryt</Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Legg til kontotype
          </Button>
        )}
      </div>
    </Section>
  )
}
```

Legg til nødvendige imports øverst i filen:
```ts
import { DEFAULT_BANK_PRESETS } from '@/config/bankPresets'
import { Plus, Trash2, X } from 'lucide-react'
import { useEconomyStore } from '@/application/useEconomyStore'
```

(Sjekk om noen allerede er importert og unngå duplikater.)

- [ ] **Steg 2: Legg til BankPresetsSection i EconomySettingsPage**

I `EconomySettingsPage()`-komponenten, etter `<ModulesSection />`-blokken:

```tsx
      <Separator />
      <BankPresetsSection />
```

- [ ] **Steg 3: Typesjekk**

```bash
npm run typecheck
```

Forventet: ingen feil.

- [ ] **Steg 4: Kjør alle tester**

```bash
npm test
```

Forventet: kun pre-eksisterende feil.

- [ ] **Steg 5: Commit**

```bash
git add src/pages/economy/EconomySettingsPage.tsx
git commit -m "feat(settings): Banker og rentesatser — CRUD for bankpresets"
```

---

## Avsluttende sjekk Plan B

- [ ] `npm run build` — ingen feil
- [ ] Manuell test: opprett ny konto → velg Trøndelag Gullkonto → renter fylles inn → legg til to spareplaner → lagre
- [ ] Manuell test: rediger eksisterende konto → trinnvis rente vises og kan endres
- [ ] Manuell test: AccountCard med Gullkonto viser trinnvis rentesats med aktiv sats markert
- [ ] Manuell test: Månedsoversikt simulerer med riktig sats per trinn etter hvert som saldo vokser
- [ ] Manuell test: Innstillinger → Banker og rentesatser → deaktiver en bank → vises ikke i bankvelger
