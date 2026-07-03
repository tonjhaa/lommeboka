import { useState } from 'react'
import { User, Pencil, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { useEconomyStore } from '@/application/useEconomyStore'
import { NumberInput } from '@/components/ui/number-input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { HelpTooltip } from '@/components/ui/help-tooltip'
import { Button } from '@/components/ui/button'
import {
  extractLoanInputFromEconomy,
  getProfileBridgeSummary,
  getCurrentBridgeValues,
  extractCoApplicantFromPartner,
} from '@/application/profileBridge'
import { cn, formatCurrency } from '@/lib/utils'
import type { ScenarioInput, ApplicantInput } from '@/types'

interface Props {
  scenario: ScenarioInput
  section?: 'essential' | 'advanced' | 'all'
}

/**
 * Søker-kort: navn + nøkkeltall. I redigeringsmodus ekspanderer kortet til
 * full bredde med feltene INNI seg — redigeringen skjer i kortet det gjelder.
 */
function ApplicantCard({
  name,
  applicant,
  editing,
  onToggleEdit,
  onChange,
}: {
  name: string
  applicant: ApplicantInput
  editing: boolean
  onToggleEdit: () => void
  onChange: (patch: Partial<ApplicantInput>) => void
}) {
  return (
    <div
      className={cn(
        'rounded-lg border transition-colors',
        editing ? 'col-span-full border-primary/50 bg-primary/5' : 'border-border bg-card/60 hover:bg-muted/30',
      )}
    >
      {/* Header + nøkkeltall er klikkflaten — feltene under skal ikke toggle */}
      <button onClick={onToggleEdit} className="w-full p-3 text-left">
        <div className="flex items-center justify-between gap-1 mb-1.5">
          <span className="flex items-center gap-1.5 min-w-0">
            <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium truncate" title={name}>{name}</span>
          </span>
          {editing
            ? <ChevronUp className="h-3.5 w-3.5 shrink-0 text-primary" />
            : <Pencil className="h-3 w-3 shrink-0 text-muted-foreground/50" />}
        </div>
        <div className="space-y-0.5 text-xs">
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Brutto/år</span>
            <span className="font-mono tabular-nums whitespace-nowrap">{formatCurrency(applicant.grossIncome + (applicant.otherIncome ?? 0))}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Gjeld</span>
            <span className="font-mono tabular-nums whitespace-nowrap">{formatCurrency(applicant.existingDebt ?? 0)}</span>
          </div>
        </div>
      </button>

      {editing && (
        <div className="border-t border-primary/20 px-3 pb-3 pt-3 space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Navn</Label>
            <Input
              value={applicant.label ?? ''}
              onChange={(e) => onChange({ label: e.target.value })}
              placeholder={name}
              className="h-9 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Bruttoinntekt per år</Label>
              <NumberInput
                value={applicant.grossIncome}
                onChange={(v) => onChange({ grossIncome: v })}
                suffix="kr"
                min={0}
                step={10_000}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center">
                Annen inntekt/år
                <HelpTooltip content="Leieinntekter, biinntekt o.l. Teller i både gjeldsgrad og betjeningsevne." />
              </Label>
              <NumberInput
                value={applicant.otherIncome ?? 0}
                onChange={(v) => onChange({ otherIncome: v })}
                suffix="kr"
                min={0}
                step={5_000}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center">
              Eksisterende gjeld
              <HelpTooltip content="Billån, studielån, kredittkort osv. Telles i gjeldsgraden og betjenes automatisk i stresstesten." />
            </Label>
            <NumberInput
              value={applicant.existingDebt ?? 0}
              onChange={(v) => onChange({ existingDebt: v })}
              suffix="kr"
              min={0}
              step={10_000}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export function HouseholdForm({ scenario, section = 'all' }: Props) {
  const update = useAppStore((s) => s.updateScenario)
  const partnerName = useEconomyStore((s) => s.partnerVeikart.partnerName)
  const { household } = scenario
  // Utled fra storen (ikke lokal state): HouseholdForm rendres to ganger (essential + advanced),
  // så lokal state ville desynke — «Hent medsøker»-knappen i én instans må vises i den andre.
  const hasCoApplicant = Boolean(household.coApplicant)
  const [bridgeSummary, setBridgeSummary] = useState<string[] | null>(null)
  const [showSyncDetails, setShowSyncDetails] = useState(false)
  const [noPartnerMsg, setNoPartnerMsg] = useState(false)
  const [editingApplicant, setEditingApplicant] = useState<'primary' | 'co' | null>(null)
  const showEssential = section === 'all' || section === 'essential'
  const showAdvanced = section === 'all' || section === 'advanced'

  const primaryName = household.primaryApplicant.label?.trim() || 'Deg'
  const coName = household.coApplicant?.label?.trim() || partnerName?.trim() || 'Medsøker'

  function setHousehold(patch: Partial<typeof household>) {
    update(scenario.id, { household: { ...household, ...patch } })
  }

  function toggleCoApplicant(checked: boolean) {
    if (checked) {
      setHousehold({
        coApplicant: { grossIncome: 0, existingDebt: 0, label: partnerName?.trim() || 'Medsøker' },
        adults: Math.max(household.adults, 2),
      })
      setEditingApplicant('co')
    } else {
      const { coApplicant: _, ...rest } = household
      void _
      update(scenario.id, { household: { ...rest, coApplicant: undefined, adults: Math.max(1, household.adults - 1) } })
      setEditingApplicant(null)
    }
  }

  function handleUseProfile(yearOverride?: number) {
    const yr = yearOverride ?? scenario.purchaseYear
    const partial = extractLoanInputFromEconomy(yr)
    if (!partial.household) {
      setBridgeSummary(['Ingen lønnsprofil registrert i Lommeboka.'])
      setShowSyncDetails(true)
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
    setBridgeSummary(getProfileBridgeSummary(yr))
  }

  function handleUsePartner(yearOverride?: number) {
    const yr = yearOverride ?? scenario.purchaseYear
    const partner = extractCoApplicantFromPartner(yr)
    if (!partner) {
      setNoPartnerMsg(true)
      return
    }
    setNoPartnerMsg(false)
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
    // Samme kjøpsår som snapshot ble laget med — ellers falsk «siden da»-avvik for fremtidsår.
    const current = getCurrentBridgeValues(scenario.purchaseYear)
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

  const totalGross =
    household.primaryApplicant.grossIncome + (household.primaryApplicant.otherIncome ?? 0) +
    (household.coApplicant ? household.coApplicant.grossIncome + (household.coApplicant.otherIncome ?? 0) : 0)
  const totalDebt =
    (household.primaryApplicant.existingDebt ?? 0) + (household.coApplicant?.existingDebt ?? 0)

  return (
    <div className="space-y-4">
      {showEssential && (
        <>
          {/* Kjøpsår + profil-bro */}
          <div className="flex items-end gap-3">
            <div className="space-y-1 flex-1">
              <Label className="text-xs flex items-center">
                Kjøpsår
                <HelpTooltip content="«Bruk min profil» henter lønn, EK og gjeld fra Lommeboka — projisert til dette året." />
              </Label>
              <NumberInput
                grouping={false}
                value={scenario.purchaseYear ?? new Date().getFullYear()}
                onChange={(v) => {
                  update(scenario.id, { purchaseYear: v })
                  // Auto-reproject: når år endres og profil alt er hentet, oppdater felt
                  if (scenario.bridgeSnapshot) {
                    handleUseProfile(v)
                    if (hasCoApplicant) {
                      handleUsePartner(v)
                    }
                  }
                }}
                min={new Date().getFullYear()}
                step={1}
              />
            </div>
            <Button variant="outline" size="sm" className="text-xs shrink-0" onClick={() => handleUseProfile()}>
              Bruk min profil
            </Button>
          </div>

          {/* Kompakt sync-linje — erstatter de gamle forklaringsboksene */}
          {freshness && (
            freshness.diffs.length > 0 ? (
              <div className="flex items-center justify-between gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-300">
                <span className="min-w-0 truncate" title={`Siden ${freshness.date}: ${freshness.diffs.join(', ')}`}>
                  ⚠ Siden {freshness.date}: {freshness.diffs.join(', ')}
                </span>
                <button
                  className="flex items-center gap-1 underline underline-offset-2 shrink-0"
                  onClick={() => { handleUseProfile(); if (hasCoApplicant) handleUsePartner() }}
                >
                  <RefreshCw className="h-3 w-3" /> Oppdater
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span>✓ Synket med Lommeboka {freshness.date} — alt à jour</span>
                {bridgeSummary && (
                  <button
                    className="flex items-center gap-0.5 hover:text-foreground transition-colors shrink-0"
                    onClick={() => setShowSyncDetails((v) => !v)}
                  >
                    detaljer {showSyncDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </button>
                )}
              </div>
            )
          )}
          {showSyncDetails && bridgeSummary && (
            <div className="rounded-md bg-muted/40 px-2.5 py-2 space-y-0.5">
              {bridgeSummary.map((line, i) => (
                <p key={i} className="text-[11px] text-muted-foreground">{line}</p>
              ))}
            </div>
          )}

          {/* Søkere: navngitte kort — alltid synlige, klikk for å redigere */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Søkere</p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground flex items-center">
                  Inkluder partner
                  <HelpTooltip content="Henter inntekt, gjeld og EK fra Partner-fanen og legger partneren til som medsøker." />
                </span>
                <Switch
                  checked={hasCoApplicant}
                  onCheckedChange={(checked) => {
                    setNoPartnerMsg(false)
                    if (checked) {
                      handleUsePartner()
                    } else {
                      toggleCoApplicant(false)
                    }
                  }}
                />
              </div>
            </div>
            {noPartnerMsg && (
              <p className="text-xs text-amber-400">
                Ingen partner registrert i Partner-fanen.{' '}
                <button className="underline underline-offset-2" onClick={() => { setNoPartnerMsg(false); toggleCoApplicant(true) }}>
                  Legg til medsøker manuelt
                </button>
              </p>
            )}

            {/* items-start: kortet i redigering vokser uten å strekke naboen */}
            <div className={cn('grid gap-2 items-start', hasCoApplicant ? 'grid-cols-2' : 'grid-cols-1')}>
              <ApplicantCard
                name={primaryName}
                applicant={household.primaryApplicant}
                editing={editingApplicant === 'primary'}
                onToggleEdit={() => setEditingApplicant((e) => (e === 'primary' ? null : 'primary'))}
                onChange={(patch) =>
                  setHousehold({ primaryApplicant: { ...household.primaryApplicant, ...patch } })
                }
              />
              {hasCoApplicant && household.coApplicant && (
                <ApplicantCard
                  name={coName}
                  applicant={household.coApplicant}
                  editing={editingApplicant === 'co'}
                  onToggleEdit={() => setEditingApplicant((e) => (e === 'co' ? null : 'co'))}
                  onChange={(patch) =>
                    setHousehold({ coApplicant: { ...household.coApplicant!, ...patch } })
                  }
                />
              )}
            </div>

            {hasCoApplicant && (
              <p className="text-[11px] text-muted-foreground">
                Samlet: <span className="font-mono">{formatCurrency(totalGross)}</span>/år
                {' · '}gjeld <span className="font-mono">{formatCurrency(totalDebt)}</span>
              </p>
            )}
          </div>
        </>
      )}

      {showAdvanced && (
        <>
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
