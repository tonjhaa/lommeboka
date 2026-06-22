import { useState } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { NumberInput } from '@/components/ui/number-input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import {
  extractLoanInputFromEconomy,
  getProfileBridgeSummary,
  getCurrentBridgeValues,
  extractCoApplicantFromPartner,
} from '@/application/profileBridge'
import { formatCurrency } from '@/lib/utils'
import type { ScenarioInput, ApplicantInput } from '@/types'

interface Props {
  scenario: ScenarioInput
  section?: 'essential' | 'advanced' | 'all'
}

function ApplicantFields({
  applicant,
  label,
  onChange,
  section = 'all',
}: {
  applicant: ApplicantInput
  label: string
  onChange: (patch: Partial<ApplicantInput>) => void
  section?: 'essential' | 'advanced' | 'all'
}) {
  const showEssential = section === 'all' || section === 'essential'
  const showAdvanced = section === 'all' || section === 'advanced'
  return (
    <div className="space-y-4">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>

      {showAdvanced && (
        <div className="space-y-1.5">
          <Label>Navn (valgfritt)</Label>
          <Input
            value={applicant.label ?? ''}
            onChange={(e) => onChange({ label: e.target.value })}
            placeholder={label}
          />
        </div>
      )}

      {showEssential && (
        <div className="space-y-1.5">
          <Label>Bruttoinntekt per år</Label>
          <NumberInput
            value={applicant.grossIncome}
            onChange={(v) => onChange({ grossIncome: v })}
            suffix="kr"
            min={0}
            step={10_000}
          />
        </div>
      )}

      {showEssential && (
        <div className="space-y-1.5">
          <Label>Eksisterende gjeld</Label>
          <NumberInput
            value={applicant.existingDebt ?? 0}
            onChange={(v) => onChange({ existingDebt: v })}
            suffix="kr"
            min={0}
            step={10_000}
          />
          <p className="text-xs text-muted-foreground">
            Billån, studielån, kredittkort, etc. Telles i gjeldsgraden og
            betjenes automatisk i stresstesten.
          </p>
        </div>
      )}
    </div>
  )
}

export function HouseholdForm({ scenario, section = 'all' }: Props) {
  const update = useAppStore((s) => s.updateScenario)
  const { household } = scenario
  // Utled fra storen (ikke lokal state): HouseholdForm rendres to ganger (essential + advanced),
  // så lokal state ville desynke — «Hent medsøker»-knappen i én instans må vises i den andre.
  const hasCoApplicant = Boolean(household.coApplicant)
  const [bridgeSummary, setBridgeSummary] = useState<string[] | null>(null)
  const showEssential = section === 'all' || section === 'essential'
  const showAdvanced = section === 'all' || section === 'advanced'

  function setHousehold(patch: Partial<typeof household>) {
    update(scenario.id, { household: { ...household, ...patch } })
  }

  function toggleCoApplicant(checked: boolean) {
    if (checked) {
      setHousehold({
        coApplicant: { grossIncome: 0, existingDebt: 0, label: 'Søker 2' },
        adults: Math.max(household.adults, 2),
      })
    } else {
      const { coApplicant: _, ...rest } = household
      void _
      update(scenario.id, { household: { ...rest, coApplicant: undefined, adults: Math.max(1, household.adults - 1) } })
    }
  }

  function handleUseProfile() {
    const partial = extractLoanInputFromEconomy()
    if (!partial.household) {
      setBridgeSummary(['Ingen lønnsprofil registrert i Lommeboka.'])
      return
    }
    update(scenario.id, {
      household: {
        ...household,
        primaryApplicant: {
          ...household.primaryApplicant,
          ...partial.household.primaryApplicant,
        },
      },
      // Kun EK hentes fra profilen — rente, løpetid og lånetype er brukerens egne valg
      loanParameters: partial.loanParameters
        ? { ...scenario.loanParameters, equity: partial.loanParameters.equity }
        : scenario.loanParameters,
      // Øyeblikksbilde for ferskhets-indikatoren
      bridgeSnapshot: {
        syncedAt: Date.now(),
        equity: partial.loanParameters?.equity ?? scenario.loanParameters.equity,
        grossIncome: partial.household.primaryApplicant.grossIncome,
        existingDebt: partial.household.primaryApplicant.existingDebt ?? 0,
      },
    })
    setBridgeSummary(getProfileBridgeSummary())
  }

  function handleUsePartner() {
    const partner = extractCoApplicantFromPartner()
    if (!partner) {
      setBridgeSummary(['Partner er ikke aktivert — koble til eller legg inn partnerdata i Partner-fanen.'])
      return
    }
    // Behold Søker 1s EK-bidrag; partnerens EK legges til totalen
    const p1EK = scenario.distribution?.primaryEquityContribution
      ?? (household.coApplicant ? Math.round(scenario.loanParameters.equity * 0.5) : scenario.loanParameters.equity)
    update(scenario.id, {
      household: {
        ...household,
        adults: Math.max(household.adults, 2),
        coApplicant: {
          ...household.coApplicant,
          grossIncome: partner.grossIncome,
          existingDebt: partner.existingDebt,
          label: partner.label,
        },
      },
      distribution: {
        primaryShare: scenario.distribution?.primaryShare ?? 50,
        ...scenario.distribution,
        primaryEquityContribution: p1EK,
        coApplicantEquityContribution: partner.equityContribution,
      },
      loanParameters: { ...scenario.loanParameters, equity: p1EK + partner.equityContribution },
    })
    setBridgeSummary(partner.summary)
  }

  // Ferskhets-indikator: har Lommeboka-tallene endret seg siden forrige synk?
  const freshness = (() => {
    const snap = scenario.bridgeSnapshot
    if (!snap) return null
    const current = getCurrentBridgeValues()
    if (!current) return null
    const diffs: string[] = []
    if (Math.abs(current.equity - snap.equity) > 1_000) {
      const d = current.equity - snap.equity
      diffs.push(`EK ${d > 0 ? '+' : '−'}${formatCurrency(Math.abs(d))}`)
    }
    if (Math.abs(current.grossIncome - snap.grossIncome) > 1_000) {
      const d = current.grossIncome - snap.grossIncome
      diffs.push(`inntekt ${d > 0 ? '+' : '−'}${formatCurrency(Math.abs(d))}`)
    }
    if (Math.abs(current.existingDebt - snap.existingDebt) > 1_000) {
      const d = current.existingDebt - snap.existingDebt
      diffs.push(`gjeld ${d > 0 ? '+' : '−'}${formatCurrency(Math.abs(d))}`)
    }
    return {
      date: new Date(snap.syncedAt).toLocaleDateString('no-NO', { day: 'numeric', month: 'short' }),
      diffs,
    }
  })()

  // When section='essential': profil-bro + primary applicant essentials (income+debt)
  // When section='advanced': primary applicant name + co-applicant toggle+fields + household size
  // When section='all' (default): full original layout — profil-bro + all primary fields + co-applicant + household
  const primaryApplicantSection = section === 'all' ? 'all' : section

  return (
    <div className="space-y-5">
      {showEssential && (
        <>
          {/* Bruk min profil / Hent partner */}
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Hent tall fra Lommeboka automatisk
            </p>
            <div className="flex gap-2 shrink-0">
              <Button variant="outline" size="sm" className="text-xs" onClick={handleUseProfile}>
                Bruk min profil
              </Button>
              <Button variant="outline" size="sm" className="text-xs text-violet-400 border-violet-500/40 hover:bg-violet-500/10" onClick={handleUsePartner}>
                Hent medsøker fra Partner
              </Button>
            </div>
          </div>

          {/* Ferskhets-indikator */}
          {freshness && (
            freshness.diffs.length > 0 ? (
              <div className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-300 flex items-center justify-between gap-2">
                <span>
                  Hentet fra Lommeboka {freshness.date} — siden da: {freshness.diffs.join(', ')}
                </span>
                <button className="underline underline-offset-2 shrink-0" onClick={handleUseProfile}>
                  Oppdater
                </button>
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                ✓ Synket med Lommeboka {freshness.date} — ingen endringer siden.
              </p>
            )
          )}

          {bridgeSummary && (
            <div className="rounded-md bg-muted/50 p-2 space-y-0.5">
              {bridgeSummary.map((line, i) => (
                <p key={i} className="text-xs text-muted-foreground">{line}</p>
              ))}
              <button
                className="text-xs text-muted-foreground underline mt-1"
                onClick={() => setBridgeSummary(null)}
              >
                Lukk
              </button>
            </div>
          )}

          <Separator />

          <ApplicantFields
            applicant={household.primaryApplicant}
            label="Søker 1"
            section={primaryApplicantSection}
            onChange={(patch) =>
              setHousehold({ primaryApplicant: { ...household.primaryApplicant, ...patch } })
            }
          />
        </>
      )}

      {showAdvanced && (
        <>
          {/* When section='advanced' only: show primary applicant name field */}
          {section === 'advanced' && (
            <ApplicantFields
              applicant={household.primaryApplicant}
              label="Søker 1"
              section="advanced"
              onChange={(patch) =>
                setHousehold({ primaryApplicant: { ...household.primaryApplicant, ...patch } })
              }
            />
          )}

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Medsøker</p>
              <p className="text-xs text-muted-foreground">Legg til ektefelle / samboer</p>
            </div>
            <Switch checked={hasCoApplicant} onCheckedChange={toggleCoApplicant} />
          </div>

          {hasCoApplicant && household.coApplicant && (
            <>
              <Separator />
              <ApplicantFields
                applicant={household.coApplicant}
                label="Søker 2"
                section="all"
                onChange={(patch) =>
                  setHousehold({ coApplicant: { ...household.coApplicant!, ...patch } })
                }
              />
            </>
          )}

          <Separator />

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Antall barn (0–17 år)</Label>
              <NumberInput
                value={household.children}
                onChange={(v) => setHousehold({ children: Math.round(v) })}
                min={0}
                max={10}
                step={1}
              />
              <p className="text-xs text-muted-foreground">Påvirker SIFO-budsjettet</p>
            </div>
            <div className="space-y-1.5">
              <Label>Antall voksne</Label>
              <NumberInput
                value={household.adults}
                onChange={(v) => setHousehold({ adults: Math.round(v) })}
                min={1}
                max={4}
                step={1}
              />
            </div>
          </div>

          {household.children > 0 && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Derav spedbarn (0–3 år)</Label>
                <NumberInput
                  value={household.infantsUnder4 ?? 0}
                  onChange={(v) =>
                    setHousehold({ infantsUnder4: Math.round(Math.min(v, household.children)) })
                  }
                  min={0}
                  max={household.children}
                  step={1}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Derav barn 4–10 år</Label>
                <NumberInput
                  value={household.childrenAge4to10 ?? 0}
                  onChange={(v) =>
                    setHousehold({ childrenAge4to10: Math.round(Math.min(v, household.children)) })
                  }
                  min={0}
                  max={household.children}
                  step={1}
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
