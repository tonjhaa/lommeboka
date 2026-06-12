import { useState } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { NumberInput } from '@/components/ui/number-input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { extractLoanInputFromEconomy, getProfileBridgeSummary } from '@/application/profileBridge'
import type { ScenarioInput, ApplicantInput } from '@/types'

interface Props {
  scenario: ScenarioInput
}

function ApplicantFields({
  applicant,
  label,
  onChange,
}: {
  applicant: ApplicantInput
  label: string
  onChange: (patch: Partial<ApplicantInput>) => void
}) {
  return (
    <div className="space-y-4">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>

      <div className="space-y-1.5">
        <Label>Navn (valgfritt)</Label>
        <Input
          value={applicant.label ?? ''}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder={label}
        />
      </div>

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
    </div>
  )
}

export function HouseholdForm({ scenario }: Props) {
  const update = useAppStore((s) => s.updateScenario)
  const { household } = scenario
  const [hasCoApplicant, setHasCoApplicant] = useState(Boolean(household.coApplicant))
  const [bridgeSummary, setBridgeSummary] = useState<string[] | null>(null)

  function setHousehold(patch: Partial<typeof household>) {
    update(scenario.id, { household: { ...household, ...patch } })
  }

  function toggleCoApplicant(checked: boolean) {
    setHasCoApplicant(checked)
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
    })
    setBridgeSummary(getProfileBridgeSummary())
  }

  return (
    <div className="space-y-5">
      {/* Bruk min profil-knapp */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">
            Hent tall fra Lommeboka automatisk
          </p>
        </div>
        <Button variant="outline" size="sm" className="text-xs" onClick={handleUseProfile}>
          Bruk min profil
        </Button>
      </div>

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
        onChange={(patch) =>
          setHousehold({ primaryApplicant: { ...household.primaryApplicant, ...patch } })
        }
      />

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
    </div>
  )
}
