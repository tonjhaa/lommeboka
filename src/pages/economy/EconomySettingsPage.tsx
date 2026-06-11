import { useState, useEffect } from 'react'
import { Download, Upload, Trash2, Smartphone, User, ShieldCheck, Plus, X } from 'lucide-react'
import { useAuthStore } from '@/store/useAuthStore'
import { useEconomyStore } from '@/application/useEconomyStore'
import { DEFAULT_BANK_PRESETS } from '@/config/bankPresets'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { MODULES } from './OnboardingWizard'
import { cn } from '@/lib/utils'
import type { EconomyTab } from '@/types/economy'
import { PartnerLinkSection } from '@/components/PartnerLinkSection'

const LAST_EXPORT_KEY = 'min-okonomi-last-export'

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

function Section({ title, description, children }: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

// ----------------------------------------------------------------
// Personalia
// ----------------------------------------------------------------

function HousingToggle({ value, onChange }: { value: 'leier' | 'eier' | undefined; onChange: (v: 'leier' | 'eier') => void }) {
  return (
    <div className="flex rounded-md border border-border overflow-hidden w-fit">
      {(['leier', 'eier'] as const).map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={cn(
            'px-3 py-1 text-xs font-medium transition-colors',
            value === opt
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/40',
          )}
        >
          {opt === 'leier' ? 'Leier' : 'Eier bolig'}
        </button>
      ))}
    </div>
  )
}

function PersonaliaSection() {
  const userPreferences = useEconomyStore((s) => s.userPreferences)
  const setUserPreferences = useEconomyStore((s) => s.setUserPreferences)
  const absenceHireDate = useEconomyStore((s) => s.absenceHireDate)
  const setAbsenceHireDate = useEconomyStore((s) => s.setAbsenceHireDate)

  const [birthYearInput, setBirthYearInput] = useState(
    userPreferences?.birthYear ? String(userPreferences.birthYear) : ''
  )

  const birthYearError = birthYearInput
    ? (isNaN(parseInt(birthYearInput)) || parseInt(birthYearInput) < 1950 || parseInt(birthYearInput) > 2010)
      ? 'Ugyldig år (1950–2010)'
      : undefined
    : undefined

  function saveBirthYear() {
    const yr = parseInt(birthYearInput)
    if (!yr || yr < 1950 || yr > 2010) return
    setUserPreferences({
      onboardingCompleted: userPreferences?.onboardingCompleted ?? true,
      enabledTabs: userPreferences?.enabledTabs ?? [],
      payDay: userPreferences?.payDay,
      birthYear: yr,
      housingStatus: userPreferences?.housingStatus,
    })
  }

  function setHousingStatus(v: 'leier' | 'eier') {
    setUserPreferences({
      onboardingCompleted: userPreferences?.onboardingCompleted ?? true,
      enabledTabs: userPreferences?.enabledTabs ?? [],
      payDay: userPreferences?.payDay,
      birthYear: userPreferences?.birthYear,
      housingStatus: v,
    })
  }

  const myBsuAgeOk = !userPreferences?.birthYear || (new Date().getFullYear() - userPreferences.birthYear) <= 33

  return (
    <Section title="Personalia" description="Grunnoppsett for deg. Brukes av Boligveikart og andre beregninger på tvers av verktøyet.">
      <div className="rounded-md border border-border bg-muted/20 p-4 space-y-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          <User className="h-3.5 w-3.5" />
          Deg
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Fødselsår</Label>
            <div className="flex gap-2 items-center">
              <Input
                type="number"
                value={birthYearInput}
                onChange={(e) => setBirthYearInput(e.target.value)}
                onBlur={saveBirthYear}
                placeholder="f.eks. 1995"
                className="h-8 text-sm w-28"
                error={birthYearError}
              />
              {userPreferences?.birthYear && (
                <span className={cn(
                  'text-[11px]',
                  myBsuAgeOk ? 'text-blue-400' : 'text-muted-foreground',
                )}>
                  {myBsuAgeOk
                    ? `BSU OK (${new Date().getFullYear() - userPreferences.birthYear} år)`
                    : `Over BSU-alder (${new Date().getFullYear() - userPreferences.birthYear} år)`}
                </span>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Boligstatus</Label>
            <HousingToggle value={userPreferences?.housingStatus} onChange={setHousingStatus} />
          </div>

          <div className="space-y-1.5 col-span-2">
            <Label className="text-xs">Ansatt siden</Label>
            <Input
              type="date"
              value={absenceHireDate ?? ''}
              onChange={(e) => setAbsenceHireDate(e.target.value || null)}
              className="h-8 text-sm w-40"
            />
            <p className="text-[11px] text-muted-foreground">
              Brukes av budsjettprognosen (ingen lønn før denne datoen), egenmeldingsreglene i
              Fravær-fanen og validering av slippimport.
            </p>
          </div>
        </div>
      </div>
    </Section>
  )
}

// ----------------------------------------------------------------
// Sikkerhetskopi
// ----------------------------------------------------------------

function BackupReminderBanner({ onExport }: { onExport: () => void }) {
  const raw = localStorage.getItem(LAST_EXPORT_KEY)
  if (!raw) return null
  const lastExport = new Date(raw)
  const daysSince = Math.floor((Date.now() - lastExport.getTime()) / (1000 * 60 * 60 * 24))
  if (daysSince < 30) return null
  const formatted = lastExport.toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' })
  return (
    <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex items-center justify-between gap-4">
      <span className="text-xs text-amber-700 dark:text-amber-400">
        💾 Siste sikkerhetskopi: {formatted} ({daysSince} dager siden)
      </span>
      <Button variant="outline" size="sm" onClick={onExport} className="shrink-0 text-xs">
        Last ned nå
      </Button>
    </div>
  )
}

function SikkerhetskopiBSection() {
  const store = useEconomyStore()
  const [importError, setImportError] = useState<string | null>(null)
  const [importSuccess, setImportSuccess] = useState(false)
  const [pendingData, setPendingData] = useState<string | null>(null)
  const [pendingMeta, setPendingMeta] = useState<{ exportedAt: string } | null>(null)

  function handleExport() {
    const data = {
      storeVersion: store.storeVersion,
      profile: store.profile,
      budgetTemplate: store.budgetTemplate,
      monthHistory: store.monthHistory.map((m) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { slipPdfBase64: _pdf, ...rest } = m as typeof m & { slipPdfBase64?: unknown }
        return rest
      }),
      atfEntries: store.atfEntries,
      savingsAccounts: store.savingsAccounts,
      savingsGoals: store.savingsGoals,
      debts: store.debts,
      absenceRecords: store.absenceRecords,
      taxSettlements: store.taxSettlements,
      subscriptions: store.subscriptions,
      insurances: store.insurances,
      policyRateHistory: store.policyRateHistory,
      lonnsoppgjor: store.lonnsoppgjor,
      temporaryPayEntries: store.temporaryPayEntries,
      ivfTransactions: store.ivfTransactions,
      ivfSettings: store.ivfSettings,
      fondPortfolio: store.fondPortfolio,
      partnerVeikart: store.partnerVeikart,
      savingsPlanTarget: store.savingsPlanTarget,
      savingsPlanHorizon: store.savingsPlanHorizon,
      absenceEvents: store.absenceEvents,
      absenceHireDate: store.absenceHireDate,
      budgetOverrides: store.budgetOverrides,
      userPreferences: store.userPreferences,
    }

    // Inkluder alle relevante localStorage-nøkler (gaveplanner, app-state osv.)
    const EXTRA_KEYS = ['lommeboka-gaver-v1', 'boligkalkulator-storage']
    const extraStores: Record<string, string> = {}
    for (const key of EXTRA_KEYS) {
      const val = localStorage.getItem(key)
      if (val) extraStores[key] = val
    }

    const backup = { version: '2.0', exportedAt: new Date().toISOString(), data, extraStores }
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `lommeboka-backup-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
    localStorage.setItem(LAST_EXPORT_KEY, new Date().toISOString())
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result
      if (typeof text !== 'string') return
      try {
        const parsed = JSON.parse(text)
        if (!parsed.version || !parsed.exportedAt || !parsed.data) {
          setImportError('Ugyldig fil. Dette ser ikke ut som en Lommeboka-sikkerhetskopi.')
          return
        }
        setPendingData(text)
        setPendingMeta({ exportedAt: parsed.exportedAt })
        setImportError(null)
      } catch {
        setImportError('Kunne ikke lese filen. Kontroller at det er en gyldig JSON-fil.')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  function handleConfirmImport() {
    if (!pendingData) return
    try {
      const parsed = JSON.parse(pendingData)
      store.importData(JSON.stringify(parsed.data))
      // Gjenopprett ekstra stores (gaveplanner, app-state) hvis de finnes i backupen
      if (parsed.extraStores && typeof parsed.extraStores === 'object') {
        for (const [key, val] of Object.entries(parsed.extraStores)) {
          if (typeof val === 'string') localStorage.setItem(key, val)
        }
      }
      setImportSuccess(true)
      setPendingData(null)
      setPendingMeta(null)
      setTimeout(() => window.location.reload(), 1500)
    } catch {
      setImportError('Import feilet. Filen kan være skadet.')
    }
  }

  return (
    <Section
      title="Sikkerhetskopi"
      description="Last ned en kopi av all data og lagre den i Google Drive for tilgang fra alle enheter."
    >
      <BackupReminderBanner onExport={handleExport} />

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="h-3.5 w-3.5 mr-1.5" />
          Last ned sikkerhetskopi
        </Button>
        <Label className="cursor-pointer">
          <Button variant="outline" size="sm" asChild>
            <span>
              <Upload className="h-3.5 w-3.5 mr-1.5" />
              Gjenopprett fra fil
            </span>
          </Button>
          <input type="file" accept=".json,application/json" className="hidden" onChange={handleFileSelect} />
        </Label>
      </div>

      <p className="text-xs text-muted-foreground">
        ⚠️ PDF-slipper lagres ikke i sikkerhetskopien og må lastes opp på nytt på ny enhet.
      </p>

      <div className="rounded-md border border-border bg-muted/20 p-3 space-y-1.5">
        <div className="flex items-center gap-2 text-xs font-medium">
          <Smartphone className="h-3.5 w-3.5 text-muted-foreground" />
          Ny enhet
        </div>
        <ol className="text-xs text-muted-foreground space-y-0.5 list-decimal list-inside">
          <li>Last ned sikkerhetskopi</li>
          <li>Last opp til Google Drive</li>
          <li>Åpne appen på ny enhet → Innstillinger → Gjenopprett fra fil</li>
        </ol>
      </div>

      {importError && <p className="text-xs text-red-400">{importError}</p>}
      {importSuccess && <p className="text-xs text-green-500">✅ Data gjenopprettet — laster inn på nytt...</p>}

      {pendingData && pendingMeta && (
        <div className="rounded-md border border-border bg-muted/40 p-4 space-y-3">
          <p className="text-sm font-medium">Gjenopprett sikkerhetskopi?</p>
          <div className="text-xs text-muted-foreground space-y-1">
            <p>Lagret: {new Date(pendingMeta.exportedAt).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
            <p className="text-destructive">Dette overskriver all data.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setPendingData(null); setPendingMeta(null) }}>Avbryt</Button>
            <Button variant="default" size="sm" onClick={handleConfirmImport}>Gjenopprett</Button>
          </div>
        </div>
      )}
    </Section>
  )
}

// ----------------------------------------------------------------
// Data
// ----------------------------------------------------------------

function DataSection() {
  const { exportData, importData, resetAll, clearAllSlips } = useEconomyStore()
  const [confirmReset, setConfirmReset] = useState(false)
  const [confirmClearSlips, setConfirmClearSlips] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)

  const storageKey = 'min-okonomi-v1'
  const storedData = localStorage.getItem(storageKey)
  const storageKB = storedData ? Math.round(storedData.length / 1024 * 10) / 10 : 0

  function handleExport() {
    const json = exportData()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `lommeboka-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result
      if (typeof text !== 'string') return
      try {
        importData(text)
        setImportError(null)
        e.target.value = ''
      } catch {
        setImportError('Ugyldig fil.')
      }
    }
    reader.readAsText(file)
  }

  return (
    <Section
      title="Data"
      description={`Rådata lagret i nettleseren: ${storageKB} KB`}
    >
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="h-3.5 w-3.5 mr-1.5" />
          Eksporter JSON
        </Button>
        <Label className="cursor-pointer">
          <Button variant="outline" size="sm" asChild>
            <span>
              <Upload className="h-3.5 w-3.5 mr-1.5" />
              Importer JSON
            </span>
          </Button>
          <input type="file" accept=".json,application/json" className="hidden" onChange={handleImport} />
        </Label>
        {confirmClearSlips ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-red-400">Alle slipper slettes!</span>
            <Button variant="destructive" size="sm" onClick={() => { clearAllSlips(); setConfirmClearSlips(false) }}>Bekreft</Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmClearSlips(false)}>Avbryt</Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" className="text-red-400 hover:text-red-500 hover:border-red-400" onClick={() => setConfirmClearSlips(true)}>
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            Slett slipper
          </Button>
        )}
        {confirmReset ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-red-400">Er du sikker? Alt slettes!</span>
            <Button variant="destructive" size="sm" onClick={() => { resetAll(); setConfirmReset(false) }}>Bekreft</Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmReset(false)}>Avbryt</Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" className="text-red-400 hover:text-red-500 hover:border-red-400" onClick={() => setConfirmReset(true)}>
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            Nullstill alt
          </Button>
        )}
      </div>
      {importError && <p className="text-xs text-red-400">{importError}</p>}
    </Section>
  )
}

// ----------------------------------------------------------------
// Page
// ----------------------------------------------------------------


function ModulesSection() {
  const userPreferences = useEconomyStore((s) => s.userPreferences)
  const setUserPreferences = useEconomyStore((s) => s.setUserPreferences)

  const enabled = new Set<EconomyTab>(userPreferences?.enabledTabs ?? [])

  function toggle(tab: EconomyTab) {
    const next = new Set(enabled)
    if (next.has(tab)) next.delete(tab)
    else next.add(tab)
    setUserPreferences({
      onboardingCompleted: true,
      enabledTabs: Array.from(next),
    })
  }

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">Moduler</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Velg hvilke faner som vises i Økonomi-navigasjonen.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {MODULES.map(({ tab, label, desc, icon: Icon }) => {
          const active = enabled.has(tab)
          return (
            <button
              key={tab}
              onClick={() => toggle(tab)}
              className={`flex items-center gap-3 p-2.5 rounded-lg border text-left transition-all ${
                active ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/30'
              }`}
            >
              <div className={`shrink-0 h-7 w-7 rounded-md flex items-center justify-center ${
                active ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
              }`}>
                <Icon className="h-3.5 w-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium">{label}</p>
                <p className="text-xs text-muted-foreground truncate">{desc}</p>
              </div>
              <div className={`shrink-0 h-4 w-4 rounded border-2 flex items-center justify-center ${
                active ? 'border-primary bg-primary' : 'border-muted-foreground/40'
              }`}>
                {active && <span className="text-primary-foreground text-[10px] leading-none">✓</span>}
              </div>
            </button>
          )
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Faner som alltid vises: Dashbord, Budsjett, Lønn, Innstillinger.
      </p>
    </div>
  )
}


function BankPresetsSection() {
  const bankPresets = useEconomyStore((s) => s.bankPresets)
  const updateBankPreset = useEconomyStore((s) => s.updateBankPreset)
  const addBankPreset = useEconomyStore((s) => s.addBankPreset)
  const removeBankPreset = useEconomyStore((s) => s.removeBankPreset)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [newBank, setNewBank] = useState({ bankName: '', accountTypeName: '', freq: 'monthly' as 'monthly' | 'yearly' })

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
                                const updated = [...preset.tieredRates].sort((a, b) => a.fromBalance - b.fromBalance)
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
                                const updated = [...preset.tieredRates].sort((a, b) => a.fromBalance - b.fromBalance)
                                updated[idx] = { ...tier, rate: parseFloat(e.target.value) || 0 }
                                updateBankPreset(preset.id, { tieredRates: updated })
                              }}
                              className="h-6 text-xs w-16 font-mono"
                            />
                            <span className="text-xs text-muted-foreground">%</span>
                            {idx > 0 && (
                              <button
                                onClick={() => {
                                  const updated = [...preset.tieredRates].sort((a, b) => a.fromBalance - b.fromBalance).filter((_, i) => i !== idx)
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
                          const sorted = [...preset.tieredRates].sort((a, b) => a.fromBalance - b.fromBalance)
                          const last = sorted.at(-1)
                          updateBankPreset(preset.id, {
                            tieredRates: [...sorted, { fromBalance: (last?.fromBalance ?? 0) + 100_000, rate: 0 }],
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

export function EconomySettingsPage() {
  const { user } = useAuthStore()
  return (
    <div className="h-full overflow-y-auto p-6 space-y-8 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Økonomi — Innstillinger</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Konfigurer lønnsprofil, moduler og datahåndtering.
        </p>
        {user?.email && (
          <p className="text-xs text-muted-foreground/60 mt-1">
            Innlogget som <span className="font-mono text-muted-foreground">{user.email}</span>
          </p>
        )}
      </div>

      <Separator />
      <PersonaliaSection />

      <Separator />
      <ModulesSection />

      <Separator />
      <BankPresetsSection />

      <Separator />
      <SikkerhetskopiBSection />

      <Separator />
      <Section title="Kobling til partner" description="Koble deg til partneren din for å dele økonomidata i sanntid.">
        <PartnerLinkSection />
      </Section>

      <Separator />
      <MfaSection />

      <Separator />
      <DataSection />
    </div>
  )
}

function MfaSection() {
  const { enrollMfa, confirmMfaEnrollment, unenrollMfa, isMfaEnabled } = useAuthStore()
  const [enabled, setEnabled] = useState(false)
  const [enrolling, setEnrolling] = useState(false)
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [factorId, setFactorId] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    isMfaEnabled().then(setEnabled)
  }, [isMfaEnabled])

  const startEnroll = async () => {
    setError(null)
    setLoading(true)
    const result = await enrollMfa()
    setLoading(false)
    if (!result) { setError('Kunne ikke starte oppsett'); return }
    setQrCode(result.qrCode)
    setSecret(result.secret)
    setFactorId(result.factorId)
    setEnrolling(true)
  }

  const confirmEnroll = async () => {
    if (!factorId) return
    setError(null)
    setLoading(true)
    const err = await confirmMfaEnrollment(factorId, code)
    setLoading(false)
    if (err) { setError(err); return }
    setEnabled(true)
    setEnrolling(false)
    setQrCode(null)
    setSecret(null)
    setCode('')
  }

  const disable = async () => {
    setError(null)
    setLoading(true)
    const err = await unenrollMfa()
    setLoading(false)
    if (err) { setError(err); return }
    setEnabled(false)
  }

  return (
    <Section title="Tofaktorautentisering" description="Beskytt kontoen med en engangskode fra Apple Passord.">
      {!enrolling && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <ShieldCheck className={cn('h-4 w-4', enabled ? 'text-green-500' : 'text-muted-foreground')} />
            <span>{enabled ? 'Aktivert' : 'Ikke aktivert'}</span>
          </div>
          <Button
            variant={enabled ? 'outline' : 'default'}
            size="sm"
            onClick={enabled ? disable : startEnroll}
            disabled={loading}
          >
            {loading ? 'Venter…' : enabled ? 'Deaktiver' : 'Aktiver'}
          </Button>
        </div>
      )}

      {enrolling && qrCode && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Åpne <strong>Apple Passord</strong> → trykk <strong>+</strong> → skann QR-koden nedenfor.
          </p>
          <div className="flex justify-center">
            <img src={qrCode} alt="QR-kode for tofaktorautentisering" className="w-40 h-40 rounded-lg border border-border" />
          </div>
          {secret && (
            <p className="text-xs text-muted-foreground text-center">
              Manuell kode: <code className="font-mono bg-muted px-1 rounded">{secret}</code>
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Bekreft med engangskode</Label>
            <div className="flex gap-2">
              <Input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                className="text-sm tracking-widest"
              />
              <Button onClick={confirmEnroll} disabled={loading || code.length < 6} size="sm">
                {loading ? 'Verifiserer…' : 'Bekreft'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </Section>
  )
}
