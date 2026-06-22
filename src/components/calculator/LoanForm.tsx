import { useAppStore } from '@/store/useAppStore'
import { NumberInput } from '@/components/ui/number-input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { HelpTooltip } from '@/components/ui/help-tooltip'
import type { ScenarioInput } from '@/types'
import { formatCurrency } from '@/lib/utils'
import { calcAcquisitionFees } from '@/utils/property'

interface Props {
  scenario: ScenarioInput
  section?: 'essential' | 'advanced' | 'all'
}

export function LoanForm({ scenario, section = 'all' }: Props) {
  const update = useAppStore((s) => s.updateScenario)
  const config = useAppStore((s) => s.config)
  const { loanParameters, property, household, distribution } = scenario

  const hasCoApplicant = Boolean(household.coApplicant)
  const financeAllFees = loanParameters.financeAllFees ?? false

  function setLoan(patch: Partial<typeof loanParameters>) {
    update(scenario.id, { loanParameters: { ...loanParameters, ...patch } })
  }

  function setDist(patch: Partial<NonNullable<typeof distribution>>) {
    update(scenario.id, { distribution: { primaryShare: distribution?.primaryShare ?? 50, ...distribution, ...patch } })
  }

  // Separate EK per søker
  const p1EK = distribution?.primaryEquityContribution ?? (
    hasCoApplicant ? Math.round(loanParameters.equity * 0.5) : loanParameters.equity
  )
  const p2EK = hasCoApplicant
    ? distribution?.coApplicantEquityContribution ?? Math.max(0, loanParameters.equity - p1EK)
    : 0
  const totalEK = hasCoApplicant ? p1EK + p2EK : loanParameters.equity

  function handleP1EK(val: number) {
    setDist({ primaryEquityContribution: val, coApplicantEquityContribution: p2EK })
    setLoan({ equity: val + p2EK })
  }

  function handleP2EK(val: number) {
    setDist({ primaryEquityContribution: p1EK, coApplicantEquityContribution: val })
    setLoan({ equity: p1EK + val })
  }

  function handleTotalEK(val: number) {
    setLoan({ equity: val })
    if (hasCoApplicant) {
      // Behold andelen, oppdater absolutt
      const ratio = totalEK > 0 ? p1EK / totalEK : 0.5
      const newP1 = Math.round(val * ratio)
      const newP2 = val - newP1
      setDist({ primaryEquityContribution: newP1, coApplicantEquityContribution: newP2 })
    }
  }

  const fees = calcAcquisitionFees(
    property.price,
    config.fees,
    property.ownershipType,
    financeAllFees
  )

  const effectiveEquity = Math.max(0, loanParameters.equity - fees.totalFees)
  const totalPropertyValue = property.price + (property.sharedDebt ?? 0)
  const loanAmount = Math.max(0, totalPropertyValue - effectiveEquity + fees.financedFees)
  const equityPercent = totalPropertyValue > 0 ? (effectiveEquity / totalPropertyValue) * 100 : 0
  const stressRate = Math.max(
    loanParameters.interestRate + config.lendingRules.stressTestAddition,
    config.lendingRules.minStressTestRate
  )

  const p1Name = household.primaryApplicant.label || 'Søker 1'
  const p2Name = household.coApplicant?.label || 'Søker 2'

  const showEssential = section === 'all' || section === 'essential'
  const showAdvanced = section === 'all' || section === 'advanced'

  return (
    <div className="space-y-5">

      {/* --- EK-seksjon --- */}
      {showEssential && (hasCoApplicant ? (
        <div className="space-y-3">
          <Label className="flex items-center">
            Egenkapital per søker
            <HelpTooltip content="EK-bidraget til hver søker brukes til å beregne anbefalt eierbrøk (60% EK-vekt + 40% inntektsvekt). Totalen påvirker lånebeløpet." />
          </Label>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">{p1Name}</p>
              <NumberInput
                value={p1EK}
                onChange={handleP1EK}
                suffix="kr"
                min={0}
                step={10_000}
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">{p2Name}</p>
              <NumberInput
                value={p2EK}
                onChange={handleP2EK}
                suffix="kr"
                min={0}
                step={10_000}
              />
            </div>
          </div>

          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              Totalt EK:{' '}
              <span className="text-foreground font-medium">{formatCurrency(totalEK)}</span>
            </span>
            <span>
              {p1Name}: {totalEK > 0 ? Math.round((p1EK / totalEK) * 100) : 50}% /{' '}
              {totalEK > 0 ? Math.round((p2EK / totalEK) * 100) : 50}% {p2Name}
            </span>
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="equity" className="flex items-center">
            Egenkapital
            <HelpTooltip content="Tilgjengelig egenkapital inkl. BSU, sparing og salg av bolig. Gebyrer betales av EK med mindre du finansierer dem i lånets saldo." />
          </Label>
          <NumberInput
            id="equity"
            value={loanParameters.equity}
            onChange={handleTotalEK}
            suffix="kr"
            min={0}
            step={10_000}
          />
        </div>
      ))}

      {/* --- Gebyrer: kontant vs. finansiert --- */}
      {showAdvanced && (
        <div className="rounded-md border border-border bg-card px-4 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground flex items-center">
                Finansier alle gebyrer i lånet
                <HelpTooltip content="Alle kjøpsgebyrer (dokumentavgift, tinglysing, etablering) legges til lånesaldoen istedenfor å betales kontant av EK. Gir høyere lånebeløp, men du bevarer hele EK-en." />
              </p>
              <p className="text-xs text-muted-foreground">
                {(() => {
                  const totalAllFees = fees.totalFees + fees.financedFees
                  return financeAllFees
                    ? `+${formatCurrency(totalAllFees)} i lånets saldo — EK reduseres ikke`
                    : `−${formatCurrency(totalAllFees)} betales kontant av EK`
                })()}
              </p>
            </div>
            <Switch
              checked={financeAllFees}
              onCheckedChange={(v) => setLoan({ financeAllFees: v })}
            />
          </div>
        </div>
      )}

      {/* --- Låne-sammendrag — live-feedback på EK-inntastingen, hører ved essensiell EK-seksjon --- */}
      {showEssential && (
        <div className="rounded-md bg-muted/40 px-4 py-3 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Kjøpspris</span>
            <span>{formatCurrency(property.price)}</span>
          </div>
          {(property.sharedDebt ?? 0) > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">+ Fellesgjeld</span>
              <span>{formatCurrency(property.sharedDebt ?? 0)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Gebyrer (kontant)</span>
            <span className="text-red-400/80">−{formatCurrency(fees.totalFees)}</span>
          </div>
          {financeAllFees && fees.financedFees > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Gebyrer (i lånet)</span>
              <span className="text-yellow-400/80">+{formatCurrency(fees.financedFees)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">− Effektiv EK</span>
            <span>
              −{formatCurrency(effectiveEquity)}
              {' '}
              <span className={equityPercent >= config.lendingRules.minEquityPercent ? 'text-green-400' : 'text-red-400'}>
                ({equityPercent.toFixed(1)}%)
              </span>
            </span>
          </div>
          <div className="flex justify-between border-t border-border pt-1 font-medium">
            <span>Lånebeløp</span>
            <span className="text-primary">{formatCurrency(loanAmount)}</span>
          </div>
        </div>
      )}

      {/* --- Rente og løpetid --- */}
      {showAdvanced && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="interestRate" className="flex items-center">
              Nominell rente
              <HelpTooltip content="Avtalerenten med banken. Stresstesten legger til 3 pp (minimum 7%) for å sjekke at du tåler rentehopp." />
            </Label>
            <NumberInput
              id="interestRate"
              value={loanParameters.interestRate}
              onChange={(v) => setLoan({ interestRate: v })}
              suffix="%"
              min={0.1}
              max={20}
              step={0.1}
            />
            <p className="text-xs text-muted-foreground">
              Stressrente: <span className="text-foreground">{stressRate.toFixed(1)}%</span>
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="loanTermYears" className="flex items-center">
              Løpetid
              <HelpTooltip content="Maks 30 år for annuitetslån i norske banker. Lengre løpetid gir lavere månedsbetaling men høyere total rentekostnad." />
            </Label>
            <NumberInput
              id="loanTermYears"
              value={loanParameters.loanTermYears}
              onChange={(v) => setLoan({ loanTermYears: Math.round(v) })}
              suffix="år"
              min={5}
              max={30}
              step={1}
            />
          </div>
        </div>
      )}

      {/* --- Lånetype --- */}
      {showAdvanced && (
        <div className="space-y-1.5">
          <Label htmlFor="loanType" className="flex items-center">
            Lånetype
            <HelpTooltip content="Annuitetslån: fast terminbeløp hele løpetiden — enkelt å budsjettere. Serielån: fast avdrag + synkende renter — billigere totalt men høy startbetaling." />
          </Label>
          <Select
            value={loanParameters.loanType}
            onValueChange={(v) => setLoan({ loanType: v as 'annuitet' | 'serie' })}
          >
            <SelectTrigger id="loanType">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="annuitet">Annuitetslån (fast terminbeløp)</SelectItem>
              <SelectItem value="serie">Serielån (synkende terminbeløp)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* --- Ekstra utgifter --- */}
      {showAdvanced && (
        <div className="space-y-1.5">
          <Label htmlFor="extraExpenses" className="flex items-center">
            Ekstra månedlige utgifter
            <HelpTooltip content="Utgifter som ikke fanges av SIFO-budsjettet: barnehage/SFO, bilhold, dyre hobbyer mv. IKKE lån — eksisterende gjeld legges inn under Husholdning og stresstestes automatisk." />
          </Label>
          <NumberInput
            id="extraExpenses"
            value={loanParameters.extraMonthlyExpenses ?? 0}
            onChange={(v) => setLoan({ extraMonthlyExpenses: v })}
            suffix="kr/mnd"
            min={0}
            step={500}
          />
        </div>
      )}

      {/* --- Kausjon --- */}
      {showAdvanced && (
        <div className="rounded-md border border-border bg-card px-4 py-3 space-y-3">
          <p className="text-sm font-medium text-foreground">Kausjon (valgfritt)</p>

          <div className="space-y-1.5">
            <Label htmlFor="kausjon" className="flex items-center">
              Kausjon (realkausjon)
              <HelpTooltip content="Pant i kausjonistens bolig som stilles som sikkerhet for din boligkjøp. Teller som egenkapital i egenkapitalkravet, men ikke i gjeldsgrad eller betjeningsevne." />
            </Label>
            <NumberInput
              id="kausjon"
              value={loanParameters.kausjon ?? 0}
              onChange={(v) => setLoan({ kausjon: v })}
              suffix="kr"
              min={0}
              step={10_000}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="guarantorHomeValue" className="flex items-center">
              Kausjonistens boligverdi
              <HelpTooltip content="Markedsverdi på kausjonistens bolig. Brukes til å beregne kausjonistens ledige pantesikkerhet (boligverdi × 90% − restgjeld)." />
            </Label>
            <NumberInput
              id="guarantorHomeValue"
              value={loanParameters.guarantorHomeValue ?? 0}
              onChange={(v) => setLoan({ guarantorHomeValue: v })}
              suffix="kr"
              min={0}
              step={100_000}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="guarantorMortgage" className="flex items-center">
              Kausjonistens restgjeld
              <HelpTooltip content="Eksisterende gjeld med pant i kausjonistens bolig. Trekkes fra boligverdien for å finne ledig pantesikkerhet." />
            </Label>
            <NumberInput
              id="guarantorMortgage"
              value={loanParameters.guarantorMortgage ?? 0}
              onChange={(v) => setLoan({ guarantorMortgage: v })}
              suffix="kr"
              min={0}
              step={10_000}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="kausjonTargetPrice" className="flex items-center">
              Målpris (regn nødvendig kausjon)
              <HelpTooltip content="Oppgi en ønsket kjøpesum, så regner kalkulatoren ut hvor mye kausjon du trenger for å nå den — eller forteller om den ligger over taket gjeldsgrad/betjeningsevne setter." />
            </Label>
            <NumberInput
              id="kausjonTargetPrice"
              value={loanParameters.kausjonTargetPrice ?? 0}
              onChange={(v) => setLoan({ kausjonTargetPrice: v })}
              suffix="kr"
              min={0}
              step={100_000}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Kausjon (pant i kausjonistens bolig) løfter egenkapitalkravet — ikke gjeldsgrad eller betjeningsevne.
          </p>
        </div>
      )}
    </div>
  )
}
