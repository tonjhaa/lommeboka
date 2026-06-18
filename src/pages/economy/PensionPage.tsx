import { useMemo, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useEconomyStore, DEFAULT_PENSION_SETTINGS } from '@/application/useEconomyStore'
import { projectPension, type PensionInput } from '@/domain/economy/pensionCalculator'
import { GRUNNBELOP_NOK } from '@/config/economy.config'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { PensionSettings } from '@/types/economy'

function fmtNOK(n: number): string {
  return Math.round(n).toLocaleString('no-NO') + ' kr'
}

function fmtPct(n: number): string {
  return Math.round(n * 100) + ' %'
}

const UTTAKSALDRE = [62, 65, 67, 70] as const

const PILAR_LABELS: Record<keyof import('@/types/economy').PensionPillarBreakdown, string> = {
  folketrygd: 'Folketrygd',
  spk: 'SPK-påslag',
  afp: 'AFP',
  særalder: 'Særalder',
}

const CONFIDENCE_LABELS: Record<'lav' | 'middels', string> = {
  lav: 'Lav sikkerhet',
  middels: 'Middels sikkerhet',
}

const CONFIDENCE_COLORS: Record<'lav' | 'middels', string> = {
  lav: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/25',
  middels: 'bg-blue-500/15 text-blue-400 border-blue-500/25',
}

const SÆRALDER_AGES = [57, 60, 63] as const

export function PensionPage() {
  const profile = useEconomyStore((s) => s.profile)
  const prefs = useEconomyStore((s) => s.userPreferences)
  const stored = useEconomyStore((s) => s.pensionSettings)
  const setPensionSettings = useEconomyStore((s) => s.setPensionSettings)

  const settings: PensionSettings = stored ?? {
    ...DEFAULT_PENSION_SETTINGS,
    birthYear: prefs?.birthYear ?? DEFAULT_PENSION_SETTINGS.birthYear,
  }
  const [uttaksalder, setUttaksalder] = useState(67)

  // Guards
  if (!profile || !prefs?.birthYear) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Pensjonsprognosen trenger lønnsprofil og fødselsår.
          </p>
          <p className="text-xs text-muted-foreground">
            Importer en lønnsslipp og sett fødselsår i Innstillinger.
          </p>
        </div>
      </div>
    )
  }
  if (settings.birthYear < 1963) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
        Pensjonsmodulen støtter foreløpig kun ny modell (født 1963 eller senere).
      </div>
    )
  }

  const baseInput: Omit<PensionInput, 'uttaksalder'> = useMemo(() => {
    const fasteTillegg = (profile.fixedAdditions ?? []).reduce((s, t) => s + t.amount, 0)
    const spkGrunnlag = (profile.baseMonthly + fasteTillegg) * 12
    // Folketrygd inkluderer variable tillegg/ATF — grovt anslag: +5 % over SPK-grunnlag.
    const folketrygdInntekt = spkGrunnlag * 1.05
    return {
      birthYear: settings.birthYear,
      serviceStartYear: settings.serviceStartYear,
      currentYear: new Date().getFullYear(),
      currentG: GRUNNBELOP_NOK,
      folketrygdAnnualIncome: folketrygdInntekt,
      spkAnnualGrunnlag: spkGrunnlag,
      salaryGrowthPct: settings.assumptions.salaryGrowthPct,
      gGrowthPct: settings.assumptions.gGrowthPct,
      afpEnabled: settings.afpEnabled,
      særalder: settings.særalder,
    }
  }, [profile, settings])

  const projection = useMemo(() => {
    try {
      return projectPension({ ...baseInput, uttaksalder })
    } catch {
      return null
    }
  }, [baseInput, uttaksalder])

  const sammenligning = useMemo(() => {
    return UTTAKSALDRE.flatMap((a) => {
      try {
        return [projectPension({ ...baseInput, uttaksalder: a })]
      } catch {
        return []
      }
    })
  }, [baseInput])

  if (!projection) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
        Kunne ikke beregne pensjon med gjeldende innstillinger. Sjekk at yrkesstart er satt riktig.
      </div>
    )
  }

  const total = projection.monthlyTotal
  const maxSammenligning = Math.max(...sammenligning.map((s) => s.monthlyTotal), 1)

  function updateSettings(patch: Partial<PensionSettings>) {
    setPensionSettings({ ...settings, ...patch })
  }

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 space-y-4">

      {/* ── SEKSJON 1: Hero ── */}
      <div className="rounded-xl border border-border/50 bg-card/60 p-4 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Forventet pensjon</p>
            <p className="text-3xl font-bold font-mono tabular-nums">
              {fmtNOK(total)}
              <span className="text-base font-normal text-muted-foreground">/mnd</span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Kompensasjonsgrad: <span className="text-foreground font-medium">{fmtPct(projection.replacementRate)}</span> av sluttlønn
            </p>
          </div>
          <span className={cn(
            'shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-medium',
            CONFIDENCE_COLORS[projection.confidence]
          )}>
            {CONFIDENCE_LABELS[projection.confidence]}
          </span>
        </div>

        {/* Uttaksalder-segmentkontroll */}
        <div>
          <p className="text-xs text-muted-foreground mb-2">Uttaksalder</p>
          <div className="flex gap-1.5 flex-wrap">
            {UTTAKSALDRE.map((a) => (
              <Button
                key={a}
                size="sm"
                variant={uttaksalder === a ? 'default' : 'outline'}
                className="h-8 px-3 text-xs"
                onClick={() => setUttaksalder(a)}
              >
                {a} år
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* ── SEKSJON 2: Pilar-nedbrytning ── */}
      <div className="rounded-xl border border-border/50 bg-card/60 p-4 space-y-3">
        <h3 className="text-sm font-medium">Pensjonskilder ved {uttaksalder} år</h3>
        <div className="space-y-2.5">
          {(Object.entries(projection.perPilar) as [keyof typeof projection.perPilar, number][]).map(([key, mnd]) => {
            if (key === 'særalder' && !settings.særalder.enabled) return null
            if (key === 'afp' && !settings.afpEnabled) return null
            const andel = total > 0 ? mnd / total : 0
            return (
              <div key={key} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{PILAR_LABELS[key]}</span>
                  <span className="font-mono font-medium tabular-nums">
                    {fmtNOK(mnd)}<span className="text-muted-foreground font-normal">/mnd</span>
                    <span className="ml-2 text-muted-foreground">({Math.round(andel * 100)} %)</span>
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-border/40 overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-300',
                      key === 'folketrygd' ? 'bg-blue-500' :
                      key === 'spk' ? 'bg-green-500' :
                      key === 'afp' ? 'bg-purple-500' :
                      'bg-yellow-500'
                    )}
                    style={{ width: `${Math.round(andel * 100)}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── SEKSJON 3: Uttaksalder-sammenligning ── */}
      {sammenligning.length > 0 && (
        <div className="rounded-xl border border-border/50 bg-card/60 p-4 space-y-3">
          <h3 className="text-sm font-medium">Sammenligning etter uttaksalder</h3>
          <div className="space-y-2">
            {sammenligning.map((proj) => {
              const barWidth = Math.round((proj.monthlyTotal / maxSammenligning) * 100)
              const isSelected = proj.uttaksalder === uttaksalder
              return (
                <button
                  key={proj.uttaksalder}
                  className={cn(
                    'w-full text-left rounded-lg border px-3 py-2 transition-colors',
                    isSelected
                      ? 'border-primary/40 bg-primary/5'
                      : 'border-border/30 bg-transparent hover:bg-muted/20'
                  )}
                  onClick={() => setUttaksalder(proj.uttaksalder)}
                >
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className={cn('font-medium', isSelected ? 'text-primary' : 'text-foreground')}>
                      {proj.uttaksalder} år
                    </span>
                    <span className="font-mono tabular-nums text-foreground">
                      {fmtNOK(proj.monthlyTotal)}<span className="text-muted-foreground font-normal">/mnd</span>
                    </span>
                  </div>
                  <div className="h-1 w-full rounded-full bg-border/30 overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all duration-300',
                        isSelected ? 'bg-primary' : 'bg-muted-foreground/40'
                      )}
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── SEKSJON 4: Forutsetninger ── */}
      <div className="rounded-xl border border-border/50 bg-card/60 p-4 space-y-4">
        <h3 className="text-sm font-medium">Forutsetninger</h3>

        <div className="grid grid-cols-2 gap-3">
          {/* Lønnsvekst */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Lønnsvekst per år</label>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={0}
                max={10}
                step={0.1}
                value={settings.assumptions.salaryGrowthPct}
                onChange={(e) =>
                  updateSettings({
                    assumptions: {
                      ...settings.assumptions,
                      salaryGrowthPct: parseFloat(e.target.value) || 0,
                    },
                  })
                }
                className="w-full rounded-md border border-border/50 bg-background px-2.5 py-1.5 text-xs font-mono tabular-nums"
              />
              <span className="text-xs text-muted-foreground shrink-0">%</span>
            </div>
          </div>

          {/* G-vekst */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">G-regulering per år</label>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={0}
                max={10}
                step={0.1}
                value={settings.assumptions.gGrowthPct}
                onChange={(e) =>
                  updateSettings({
                    assumptions: {
                      ...settings.assumptions,
                      gGrowthPct: parseFloat(e.target.value) || 0,
                    },
                  })
                }
                className="w-full rounded-md border border-border/50 bg-background px-2.5 py-1.5 text-xs font-mono tabular-nums"
              />
              <span className="text-xs text-muted-foreground shrink-0">%</span>
            </div>
          </div>

          {/* Yrkesstart */}
          <div className="space-y-1 col-span-2">
            <label className="text-xs text-muted-foreground">Yrkesstart (opptjeningsstart)</label>
            <input
              type="number"
              min={1980}
              max={new Date().getFullYear()}
              step={1}
              value={settings.serviceStartYear}
              onChange={(e) =>
                updateSettings({ serviceStartYear: parseInt(e.target.value) || settings.serviceStartYear })
              }
              className="w-full rounded-md border border-border/50 bg-background px-2.5 py-1.5 text-xs font-mono tabular-nums"
            />
          </div>
        </div>

        {/* AFP */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium">AFP</p>
            <p className="text-[11px] text-muted-foreground">Forutsetter oppfylt vilkår</p>
          </div>
          <button
            onClick={() => updateSettings({ afpEnabled: !settings.afpEnabled })}
            className={cn(
              'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200',
              settings.afpEnabled ? 'bg-primary' : 'bg-muted'
            )}
            role="switch"
            aria-checked={settings.afpEnabled}
          >
            <span
              className={cn(
                'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200',
                settings.afpEnabled ? 'translate-x-4' : 'translate-x-0'
              )}
            />
          </button>
        </div>

        {/* Særalder */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium">Særalder</p>
              <p className="text-[11px] text-muted-foreground">Usikkert — regelverk under utvikling</p>
            </div>
            <button
              onClick={() =>
                updateSettings({
                  særalder: { ...settings.særalder, enabled: !settings.særalder.enabled },
                })
              }
              className={cn(
                'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200',
                settings.særalder.enabled ? 'bg-primary' : 'bg-muted'
              )}
              role="switch"
              aria-checked={settings.særalder.enabled}
            >
              <span
                className={cn(
                  'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200',
                  settings.særalder.enabled ? 'translate-x-4' : 'translate-x-0'
                )}
              />
            </button>
          </div>

          {settings.særalder.enabled && (
            <div className="flex gap-1.5">
              {SÆRALDER_AGES.map((age) => (
                <Button
                  key={age}
                  size="sm"
                  variant={settings.særalder.age === age ? 'default' : 'outline'}
                  className="h-7 px-2.5 text-xs"
                  onClick={() =>
                    updateSettings({
                      særalder: { ...settings.særalder, age },
                    })
                  }
                >
                  {age} år
                </Button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Særalder-advarsel */}
      {settings.særalder.enabled && (
        <div className="flex items-start gap-2 rounded-lg border border-yellow-500/25 bg-yellow-500/10 px-3 py-2 text-[11px] text-yellow-400">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            Særalderspensjon er et foreløpig estimat — regelverket for født 1963+ er fortsatt under utvikling.
          </span>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        Estimat, ikke et løfte. Prognosen strekker seg ~40 år fram; G, delingstall og regelverk vil endre seg.
      </p>
    </div>
  )
}
