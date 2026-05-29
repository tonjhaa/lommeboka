import { useState, useEffect } from 'react'
import { AlertTriangle, FileText, ExternalLink, Table2, Plus, Trash2, TrendingUp, Pencil, Check, X, RefreshCw, ChevronDown, ChevronUp, Calculator } from 'lucide-react'
import { SalaryWaterfallHero } from '@/components/economy/widgets/SalaryWaterfallHero'
import { SalaryGrowthChart } from '@/components/economy/charts/SalaryGrowthChart'
import { MonthlyNettoChart } from '@/components/economy/charts/MonthlyNettoChart'
import { TaxRateChart } from '@/components/economy/charts/TaxRateChart'
import { slaaOppTrekk } from '@/utils/trekktabellLookup'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useActiveEconomyStore } from '@/contexts/EconomyStoreContext'

import { PayslipImporter } from '@/features/payslip/PayslipImporter'
import type { EmploymentProfile, MonthRecord, TemporaryPayEntry, LonnsoppgjorRecord } from '@/types/economy'
import { getKpiIndex } from '@/config/economy.config'

function fmtNOK(n: number) {
  return Math.round(n).toLocaleString('no-NO') + ' kr'
}

const MONTH_NAMES = [
  '', 'Jan', 'Feb', 'Mars', 'Apr', 'Mai', 'Jun',
  'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Des',
]

/** Beregner etterbetaling i kroner.
 *  months = antall måneder fra ikrafttredelse (inkl.) til utbetaling (ekskl.)
 *  Returnerer null hvis data mangler eller er ugyldig.
 *  Brukes i Task 4 (UI-komponenten). */
export function calcEtterbetaling(
  record: LonnsoppgjorRecord,
  etterbetalingDate: string,
): { months: number; amount: number } | null {
  if (record.forrigeMaanedslonn <= 0 || record.maanedslonn <= record.forrigeMaanedslonn) return null
  const effDate = new Date(record.effectiveDate)
  const payDate = new Date(etterbetalingDate)
  const months =
    (payDate.getFullYear() * 12 + payDate.getMonth()) -
    (effDate.getFullYear() * 12 + effDate.getMonth())
  if (months <= 0) return null
  const amount = Math.round((record.maanedslonn - record.forrigeMaanedslonn) * months)
  return { months, amount }
}

function getLocalStorageKB(): number {
  try {
    let total = 0
    for (const key in localStorage) {
      if (Object.prototype.hasOwnProperty.call(localStorage, key)) {
        total += (localStorage.getItem(key) ?? '').length
      }
    }
    return Math.round(total / 1024)
  } catch {
    return 0
  }
}

function TrekktabellKort({
  tabellnummer,
  grunnlag,
  faktiskTrekk,
}: {
  tabellnummer: number
  grunnlag: number
  faktiskTrekk: number
}) {
  const [estimert, setEstimert] = useState<number | null>(null)
  const [laster, setLaster] = useState(true)
  const [feil, setFeil] = useState<string | null>(null)

  useEffect(() => {
    setLaster(true)
    setFeil(null)
    slaaOppTrekk(tabellnummer, grunnlag, 1)
      .then((trekk) => {
        setEstimert(trekk)
        setLaster(false)
      })
      .catch(() => {
        setFeil('Kunne ikke hente trekktabell')
        setLaster(false)
      })
  }, [tabellnummer, grunnlag])

  const differanse = estimert !== null ? faktiskTrekk - estimert : null

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Table2 className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm">Trekktabell {tabellnummer}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {laster ? (
          <p className="text-sm text-muted-foreground">Henter trekktabell…</p>
        ) : feil ? (
          <p className="text-sm text-destructive">{feil}</p>
        ) : (
          <div className="space-y-2 text-sm">
            <InfoRow label="Grunnlag (lønn + tillegg)" value={fmtNOK(grunnlag)} />
            <InfoRow label="Estimert trekk (tabell)" value={estimert !== null ? fmtNOK(estimert) : '—'} />
            <InfoRow label="Faktisk trekk (siste slipp)" value={fmtNOK(faktiskTrekk)} />
            {differanse !== null && Math.abs(differanse) > 10 && (
              <div className={`text-xs mt-1 ${differanse > 0 ? 'text-orange-500' : 'text-green-600'}`}>
                {differanse > 0
                  ? `Trekkes ${fmtNOK(differanse)} mer enn tabellen tilsier`
                  : `Trekkes ${fmtNOK(Math.abs(differanse))} mindre enn tabellen tilsier`}
              </div>
            )}
            {differanse !== null && Math.abs(differanse) <= 10 && (
              <div className="text-xs text-green-600">Stemmer med trekktabellen</div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function SalaryPage() {
  const {
    profile,
    setProfile,
    monthHistory,
    temporaryPayEntries,
    addTemporaryPay,
    removeTemporaryPay,
    lonnsoppgjor,
    addLonnsoppgjor,
    updateLonnsoppgjor,
    removeLonnsoppgjor,
    deriveLonnsoppgjorFromSlips,
  } = useActiveEconomyStore()

  const [editingProfile, setEditingProfile] = useState(false)
  const [storageKB, setStorageKB] = useState(0)
  const [advanced, setAdvanced] = useState(false)

  useEffect(() => {
    setStorageKB(getLocalStorageKB())
  }, [monthHistory])

  const importedSlips = monthHistory
    .filter((m) => m.source === 'imported_slip')
    .sort((a, b) => b.year - a.year || b.month - a.month)

  const latestSlipRecord = importedSlips[0] ?? null

  // CAGR fra lønnsoppgjør
  const sortedOppgjor = [...lonnsoppgjor]
    .filter((r) => r.maanedslonn > 0)
    .sort((a, b) => a.year !== b.year ? a.year - b.year : a.effectiveDate.localeCompare(b.effectiveDate))
  const cagr = sortedOppgjor.length >= 2
    ? Math.pow(
        sortedOppgjor[sortedOppgjor.length - 1].maanedslonn / sortedOppgjor[0].maanedslonn,
        1 / Math.max(1, sortedOppgjor[sortedOppgjor.length - 1].year - sortedOppgjor[0].year)
      ) - 1
    : null

  // Effektiv skattesats per år
  const taxByYear = new Map<number, { total: number; count: number }>()
  importedSlips.forEach((m) => {
    if (m.slipData && m.slipData.bruttoSum > 0) {
      const pct = (m.slipData.skattetrekk / m.slipData.bruttoSum) * 100
      const prev = taxByYear.get(m.year) ?? { total: 0, count: 0 }
      taxByYear.set(m.year, { total: prev.total + pct, count: prev.count + 1 })
    }
  })
  const taxHistory = [...taxByYear.entries()]
    .sort(([a], [b]) => a - b)
    .map(([year, { total, count }]) => ({ year, pct: total / count }))
  // Bruk gjennomsnitt av siste 3 slipp for å unngå at én atypisk måned blåser opp satsen
  const recentSlips = [...importedSlips]
    .sort((a, b) => a.year !== b.year ? b.year - a.year : b.month - a.month)
    .filter(m => m.slipData && m.slipData.bruttoSum > 0)
    .slice(0, 3)
  const currentTaxRate = recentSlips.length > 0
    ? recentSlips.reduce((s, m) => s + (m.slipData!.skattetrekk / m.slipData!.bruttoSum) * 100, 0) / recentSlips.length
    : null

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── VENSTRE — Lønnssammensetning ── */}
      <div className="w-[320px] shrink-0 border-r border-border overflow-y-auto p-4 space-y-4">

        {/* Waterfall-hero */}
        <SalaryWaterfallHero
          profile={profile}
          latestSlip={latestSlipRecord?.slipData ?? null}
          advanced={advanced}
        />

        {/* Advanced-toggle */}
        {profile && (
          <button
            onClick={() => setAdvanced(!advanced)}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {advanced ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {advanced ? 'Skjul detaljer' : 'Vis detaljer (SPK, fagforening, husleie)'}
          </button>
        )}

        {/* Lønnsprofil */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Lønnsprofil</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setEditingProfile(!editingProfile)}>
                {editingProfile ? 'Avbryt' : 'Rediger'}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {!profile && !editingProfile ? (
              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground mb-3">
                  Ingen lønnsprofil. Sett opp profilen din eller importer en lønnsslipp.
                </p>
                <Button size="sm" onClick={() => setEditingProfile(true)}>Sett opp profil</Button>
              </div>
            ) : editingProfile ? (
              <ProfileForm
                initial={profile}
                onSave={(p) => { setProfile(p); setEditingProfile(false) }}
                onCancel={() => setEditingProfile(false)}
              />
            ) : profile ? (
              <div className="space-y-2 text-sm">
                <InfoRow label="Arbeidsgiver" value={profile.employer === 'forsvaret' ? 'Forsvaret' : 'Annen'} />
                <InfoRow
                  label="Grunnlønn/mnd"
                  value={fmtNOK(profile.baseMonthly)}
                  sub={`${fmtNOK(profile.baseMonthly * 12)}/år`}
                />
                {profile.fixedAdditions.filter((a) => a.amount > 0).map((a) => (
                  <InfoRow key={a.kode} label={`${a.label} (${a.kode})`} value={`${fmtNOK(a.amount)}/mnd`} />
                ))}
                <InfoRow label="Skattetrekk/mnd" value={fmtNOK(profile.lastKnownTaxWithholding)} />
                {profile.tabellnummer && <InfoRow label="Trekktabell" value={String(profile.tabellnummer)} />}
                {profile.extraTaxWithholding > 0 && <InfoRow label="Ekstra trekk" value={`${fmtNOK(profile.extraTaxWithholding)}/mnd`} />}
                {profile.housingDeduction > 0 && <InfoRow label="Husleietrekk" value={`${fmtNOK(profile.housingDeduction)}/mnd`} />}
                <InfoRow label="Pensjon" value={`${profile.pensionPercent}%`} />
                <InfoRow label="Fagforening" value={`${fmtNOK(profile.unionFee)}/mnd`} />
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Trekktabell */}
        {profile?.tabellnummer && (
          <TrekktabellKort
            tabellnummer={profile.tabellnummer}
            grunnlag={profile.baseMonthly + profile.fixedAdditions.reduce((s, a) => s + Math.max(0, a.amount), 0)}
            faktiskTrekk={profile.lastKnownTaxWithholding}
          />
        )}

        {/* Fungering */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Midlertidig lønn (fungering)</CardTitle>
          </CardHeader>
          <CardContent>
            <FungeringPanel
              entries={temporaryPayEntries}
              baseMonthly={profile?.baseMonthly ?? 0}
              onAdd={addTemporaryPay}
              onRemove={removeTemporaryPay}
            />
          </CardContent>
        </Card>
      </div>

      {/* ── HØYRE — Grafer + historikk ── */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">

        {/* Lønnsutvikling */}
        <SalaryGrowthChart records={lonnsoppgjor} cagr={cagr} />

        {/* Netto per måned */}
        {importedSlips.length >= 2 && <MonthlyNettoChart slips={importedSlips} />}

        {/* Effektiv skattesats */}
        {taxHistory.length >= 2 && (
          <TaxRateChart data={taxHistory} currentRate={currentTaxRate} />
        )}

        {/* Lønnssimulator */}
        {profile && (
          <LønnssimulatorCard
            profile={profile}
            effectiveTaxRate={currentTaxRate}
            latestNetto={latestSlipRecord?.slipData?.nettoUtbetalt ?? latestSlipRecord?.nettoUtbetalt ?? 0}
          />
        )}

        {/* Lønnshistorikk – slip-tabell */}
        {importedSlips.length > 0 && (
          <LønnshistorikkTabell slips={importedSlips} />
        )}

        {/* Lønnsoppgjør & lønnsvekst */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm">Lønnsoppgjør & lønnsvekst</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <LonnsoppgjorSection
              records={lonnsoppgjor}
              hasSlips={monthHistory.some((m) => m.source === 'imported_slip')}
              onAdd={addLonnsoppgjor}
              onUpdate={updateLonnsoppgjor}
              onRemove={removeLonnsoppgjor}
              onDerive={deriveLonnsoppgjorFromSlips}
            />
          </CardContent>
        </Card>

        {/* Importer slipp */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Importer lønnsslipp</CardTitle>
          </CardHeader>
          <CardContent>
            <PayslipImporter />
          </CardContent>
        </Card>

        {/* Lagringsplass-advarsel */}
        {storageKB > 4500 && (
          <div className="flex items-center gap-2 rounded-md bg-yellow-500/10 border border-yellow-500/30 p-2 text-xs text-yellow-400">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Lagringsplass nærmer seg grensen ({storageKB} KB / ~5 120 KB). PDF-er for eldre slipper er automatisk fjernet.
          </div>
        )}
      </div>

    </div>
  )
}

// ------------------------------------------------------------
// SUB-KOMPONENTER
// ------------------------------------------------------------

function InfoRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-start justify-between gap-2 min-w-0">
      <span className="text-muted-foreground text-xs shrink truncate">{label}</span>
      <span className="font-mono font-medium text-xs text-right shrink-0">
        {value}
        {sub && <span className="block text-[10px] text-muted-foreground font-normal">{sub}</span>}
      </span>
    </div>
  )
}

function ProfileForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: EmploymentProfile | null
  onSave: (p: EmploymentProfile) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<EmploymentProfile>({
    employer: 'forsvaret',
    baseMonthly: 0,
    fixedAdditions: [],
    lastKnownTaxWithholding: 0,
    extraTaxWithholding: 0,
    housingDeduction: 0,
    pensionPercent: 2,
    unionFee: 0,
    atfEnabled: true,
    ...initial,
  })

  function field(k: keyof EmploymentProfile) {
    return {
      value: String(form[k] ?? ''),
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm((f) => ({ ...f, [k]: parseFloat(e.target.value) || e.target.value })),
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Grunnlønn/mnd</Label>
          <Input type="number" {...field('baseMonthly')} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Skattetrekk/mnd</Label>
          <Input type="number" {...field('lastKnownTaxWithholding')} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Ekstra trekk/mnd</Label>
          <Input type="number" {...field('extraTaxWithholding')} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Husleietrekk/mnd</Label>
          <Input type="number" {...field('housingDeduction')} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Pensjonstrekk %</Label>
          <Input type="number" {...field('pensionPercent')} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Fagforeningskontingent/mnd</Label>
          <Input type="number" {...field('unionFee')} />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={onCancel}>Avbryt</Button>
        <Button size="sm" onClick={() => onSave(form)}>Lagre</Button>
      </div>
    </div>
  )
}

// ------------------------------------------------------------
// SLIPP-DETALJER MODAL
// ------------------------------------------------------------

function pdfBlobUrl(base64: string): string {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const blob = new Blob([bytes], { type: 'application/pdf' })
  return URL.createObjectURL(blob)
}

function SlipDetailModal({ record, onClose }: { record: MonthRecord; onClose: () => void }) {
  const slip = record.slipData
  const hasPdf = !!record.slipPdfBase64

  function openPdf() {
    if (!record.slipPdfBase64) return
    const url = pdfBlobUrl(record.slipPdfBase64)
    window.open(url, '_blank')
    // Rydder opp blob-URL etter 60 sekunder
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-background rounded-lg border border-border w-full max-w-md space-y-4 overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-between px-5 pt-5">
          <div>
            <p className="font-semibold text-sm">
              {MONTH_NAMES[record.month]} {record.year}
            </p>
            <p className="text-xs text-muted-foreground">Lønnsslipp-detaljer</p>
          </div>
          <div className="flex gap-2">
            {hasPdf && (
              <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={openPdf}>
                <ExternalLink className="h-3 w-3" />
                Åpne PDF
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={onClose}>Lukk</Button>
          </div>
        </div>

        {slip ? (
          <div className="px-5 pb-5 space-y-3">
            <div className="rounded-md border border-border overflow-hidden">
              <table className="w-full text-sm">
                <tbody>
                  {[
                    { label: 'Netto utbetalt', value: fmtNOK(slip.nettoUtbetalt), bold: true },
                    { label: 'Bruttosum', value: fmtNOK(slip.bruttoSum) },
                    { label: 'Månedslønn', value: fmtNOK(slip.maanedslonn) },
                    { label: 'Skattetrekk', value: `-${fmtNOK(slip.skattetrekk)}` },
                    slip.pensjonstrekk > 0 && { label: 'Pensjonstrekk SPK', value: `-${fmtNOK(slip.pensjonstrekk)}` },
                    slip.fagforeningskontingent > 0 && { label: 'Fagforening', value: `-${fmtNOK(slip.fagforeningskontingent)}` },
                    slip.husleietrekk > 0 && { label: 'Husleietrekk', value: `-${fmtNOK(slip.husleietrekk)}` },
                    slip.ekstraTrekk > 0 && { label: 'Ekstra trekk', value: `-${fmtNOK(slip.ekstraTrekk)}` },
                    slip.ouFond > 0 && { label: 'OU-fond', value: `-${fmtNOK(slip.ouFond)}` },
                    slip.feriepengegrunnlag > 0 && { label: 'Feriepengegrunnlag (YTD)', value: fmtNOK(slip.feriepengegrunnlag) },
                    slip.hittilBrutto > 0 && { label: 'Hittil brutto (YTD)', value: fmtNOK(slip.hittilBrutto) },
                    slip.avregningsdato && { label: 'Avregningsdato', value: slip.avregningsdato },
                  ].filter(Boolean).map((row) => {
                    if (!row) return null
                    return (
                      <tr key={row.label} className="border-b border-border last:border-0">
                        <td className="px-3 py-2 text-muted-foreground">{row.label}</td>
                        <td className={`px-3 py-2 text-right font-mono ${'bold' in row && row.bold ? 'font-semibold text-foreground' : ''}`}>
                          {row.value}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {slip.fasteTillegg.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Faste tillegg</p>
                <div className="space-y-1">
                  {slip.fasteTillegg.map((t) => (
                    <div key={t.artskode} className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{t.artskode} – {t.navn}</span>
                      <span className="font-mono">{fmtNOK(t.belop)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!hasPdf && (
              <p className="text-xs text-muted-foreground italic">
                PDF ikke lagret for denne slippen. Re-importer for å lagre PDF.
              </p>
            )}
          </div>
        ) : (
          <div className="px-5 pb-5">
            <p className="text-sm text-muted-foreground">Ingen slipp-data tilgjengelig.</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ------------------------------------------------------------
// LØNNSOPPGJØR-SEKSJON
// ------------------------------------------------------------

function LonnsoppgjorSection({
  records,
  hasSlips,
  onAdd,
  onUpdate,
  onRemove,
  onDerive,
}: {
  records: LonnsoppgjorRecord[]
  hasSlips: boolean
  onAdd: (r: LonnsoppgjorRecord) => void
  onUpdate: (id: string, updates: Partial<LonnsoppgjorRecord>) => void
  onRemove: (id: string) => void
  onDerive: () => void
}) {
  const currentYear = new Date().getFullYear()
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({
    year: currentYear,
    effectiveDate: `${currentYear}-05-01`,
    maanedslonn: 0,
    htaTillegg: 0,
    notes: '',
    source: 'forventet' as LonnsoppgjorRecord['source'],
  })
  const [editForm, setEditForm] = useState<Partial<LonnsoppgjorRecord>>({})

  const sorted = [...records].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate))

  function handleAdd() {
    if (form.maanedslonn <= 0) return
    const prev = sorted.filter((r) => r.effectiveDate < `${form.year}-${String(new Date(form.effectiveDate).getMonth() + 1).padStart(2,'0')}-01`).at(-1)
    onAdd({
      id: crypto.randomUUID(),
      year: form.year,
      effectiveDate: form.effectiveDate,
      maanedslonn: form.maanedslonn,
      forrigeMaanedslonn: prev?.maanedslonn ?? 0,
      htaTillegg: form.htaTillegg,
      notes: form.notes,
      source: form.source,
    })
    setAdding(false)
    setForm({ year: currentYear, effectiveDate: `${currentYear}-05-01`, maanedslonn: 0, htaTillegg: 0, notes: '', source: 'forventet' })
  }

  function startEdit(r: LonnsoppgjorRecord) {
    setEditingId(r.id)
    setEditForm({ maanedslonn: r.maanedslonn, htaTillegg: r.htaTillegg, notes: r.notes, effectiveDate: r.effectiveDate, source: r.source })
  }

  function saveEdit(id: string) {
    onUpdate(id, editForm)
    setEditingId(null)
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2 justify-between">
        <div className="flex gap-2">
          {hasSlips && (
            <Button
              size="sm"
              variant="outline"
              className="text-xs h-7 gap-1"
              onClick={onDerive}
            >
              <RefreshCw className="h-3 w-3" /> Avled fra slipper
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="text-xs h-7 gap-1"
            onClick={() => { setAdding((v) => !v); setEditingId(null) }}
          >
            <Plus className="h-3 w-3" /> Legg til
          </Button>
        </div>
        {sorted.length >= 2 && (() => {
          const first = sorted[0]
          const last = sorted[sorted.length - 1]
          const yearDiff = last.year - first.year
          if (yearDiff > 0 && first.maanedslonn > 0 && last.maanedslonn > 0) {
            const cagr = (Math.pow(last.maanedslonn / first.maanedslonn, 1 / yearDiff) - 1) * 100
            return (
              <span className="text-xs text-muted-foreground">
                Snitt: <span className="text-green-500 font-medium">+{cagr.toFixed(1)} %/år</span>
              </span>
            )
          }
          return null
        })()}
      </div>

      {/* Legg til-skjema */}
      {adding && (
        <div className="border border-border rounded-md p-3 space-y-3 text-xs">
          <p className="font-medium">Nytt lønnsoppgjør</p>
          <div className="flex flex-wrap gap-3">
            <div className="space-y-0.5">
              <Label className="text-xs">Type</Label>
              <select
                className="h-7 text-xs border border-border rounded px-1.5 bg-background"
                value={form.source}
                onChange={(e) => setForm((f) => ({ ...f, source: e.target.value as LonnsoppgjorRecord['source'] }))}
              >
                <option value="forventet">Forventet</option>
                <option value="manual">Manuelt (historisk)</option>
              </select>
            </div>
            <div className="space-y-0.5">
              <Label className="text-xs">Ikrafttreden</Label>
              <Input
                type="date"
                className="h-7 text-xs w-36"
                value={form.effectiveDate}
                onChange={(e) => {
                  const d = new Date(e.target.value)
                  setForm((f) => ({ ...f, effectiveDate: e.target.value, year: d.getFullYear() }))
                }}
              />
            </div>
            <div className="space-y-0.5">
              <Label className="text-xs">Ny grunnlønn/mnd (kr)</Label>
              <Input
                type="number"
                className="h-7 text-xs w-36"
                placeholder="f.eks. 62000"
                value={form.maanedslonn || ''}
                onChange={(e) => setForm((f) => ({ ...f, maanedslonn: parseInt(e.target.value) || 0 }))}
              />
            </div>
            <div className="space-y-0.5">
              <Label className="text-xs">HTA-tillegg inkl. (kr/mnd)</Label>
              <Input
                type="number"
                className="h-7 text-xs w-36"
                placeholder="f.eks. 1200"
                value={form.htaTillegg || ''}
                onChange={(e) => setForm((f) => ({ ...f, htaTillegg: parseInt(e.target.value) || 0 }))}
              />
            </div>
            <div className="space-y-0.5">
              <Label className="text-xs">Notat</Label>
              <Input
                className="h-7 text-xs w-48"
                placeholder="f.eks. Sentralt oppgjør 2025"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          {form.maanedslonn > 0 && (
            <p className="text-muted-foreground">
              = <span className="text-foreground font-mono">{(form.maanedslonn * 12).toLocaleString('no-NO')} kr/år</span>
            </p>
          )}
          <div className="flex gap-2">
            <Button size="sm" className="h-7 text-xs" onClick={handleAdd} disabled={form.maanedslonn <= 0}>Lagre</Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAdding(false)}>Avbryt</Button>
          </div>
        </div>
      )}

      {/* Tabell */}
      {sorted.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {hasSlips
            ? 'Trykk "Avled fra slipper" for å hente lønnshistorikk automatisk, eller legg til manuelt.'
            : 'Importer slipper eller legg til oppgjør manuelt.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground border-b border-border">
                <th className="text-left py-1 pr-3 font-normal">År</th>
                <th className="text-left py-1 pr-3 font-normal">Dato</th>
                <th className="text-right py-1 pr-3 font-normal">Grunnlønn/mnd</th>
                <th className="text-right py-1 pr-3 font-normal">Økning kr</th>
                <th className="text-right py-1 pr-3 font-normal">Økning %</th>
                <th className="text-right py-1 pr-3 font-normal">Reallønn %</th>
                <th className="text-right py-1 pr-3 font-normal">HTA-tillegg</th>
                <th className="text-left py-1 pr-3 font-normal">Notat</th>
                <th className="text-left py-1 font-normal">Kilde</th>
                <th className="py-1" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const oekningKr = r.forrigeMaanedslonn > 0 ? r.maanedslonn - r.forrigeMaanedslonn : null
                const oekningPst = r.forrigeMaanedslonn > 0 ? ((r.maanedslonn / r.forrigeMaanedslonn - 1) * 100) : null
                // Reallønnsvekst = nominell økning - KPI-vekst mellom de to årene
                const prevYear = sorted.find((x) => x.maanedslonn === r.forrigeMaanedslonn)?.year ?? (r.year - 1)
                const kpiNaa = getKpiIndex(r.year)
                const kpiForrige = getKpiIndex(prevYear)
                const kpiVekst = r.forrigeMaanedslonn > 0 ? ((kpiNaa / kpiForrige - 1) * 100) : null
                const realloennPst = oekningPst !== null && kpiVekst !== null ? oekningPst - kpiVekst : null
                const isEditing = editingId === r.id
                const isForventet = r.source === 'forventet'

                return (
                  <tr
                    key={r.id}
                    className={`border-b border-border/40 ${isForventet ? 'opacity-70' : ''}`}
                  >
                    <td className="py-1.5 pr-3 font-medium">{r.year}{isForventet && ' *'}</td>
                    <td className="py-1.5 pr-3 text-muted-foreground">
                      {isEditing ? (
                        <Input
                          type="date"
                          className="h-6 text-xs w-32"
                          value={editForm.effectiveDate ?? r.effectiveDate}
                          onChange={(e) => setEditForm((f) => ({ ...f, effectiveDate: e.target.value }))}
                        />
                      ) : r.effectiveDate}
                    </td>
                    <td className="py-1.5 pr-3 text-right font-mono">
                      {isEditing ? (
                        <Input
                          type="number"
                          className="h-6 text-xs w-28 text-right"
                          value={editForm.maanedslonn ?? r.maanedslonn}
                          onChange={(e) => setEditForm((f) => ({ ...f, maanedslonn: parseInt(e.target.value) || 0 }))}
                        />
                      ) : (
                        <>{r.maanedslonn.toLocaleString('no-NO')} kr</>
                      )}
                    </td>
                    <td className="py-1.5 pr-3 text-right">
                      {oekningKr !== null ? (
                        <span className={oekningKr >= 0 ? 'text-green-500' : 'text-red-400'}>
                          {oekningKr >= 0 ? '+' : ''}{oekningKr.toLocaleString('no-NO')} kr
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-1.5 pr-3 text-right">
                      {oekningPst !== null ? (
                        <span className={oekningPst >= 0 ? 'text-green-500' : 'text-red-400'}>
                          {oekningPst >= 0 ? '+' : ''}{oekningPst.toFixed(2)} %
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-1.5 pr-3 text-right">
                      {realloennPst !== null ? (
                        <span className={realloennPst >= 0 ? 'text-emerald-400' : 'text-orange-400'} title="Nominell økning minus KPI-vekst">
                          {realloennPst >= 0 ? '+' : ''}{realloennPst.toFixed(2)} %
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-1.5 pr-3 text-right">
                      {isEditing ? (
                        <Input
                          type="number"
                          className="h-6 text-xs w-24 text-right"
                          value={editForm.htaTillegg ?? r.htaTillegg}
                          onChange={(e) => setEditForm((f) => ({ ...f, htaTillegg: parseInt(e.target.value) || 0 }))}
                        />
                      ) : r.htaTillegg > 0 ? (
                        <span className="text-blue-400">{r.htaTillegg.toLocaleString('no-NO')} kr</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-1.5 pr-3 text-muted-foreground max-w-[160px] truncate">
                      {isEditing ? (
                        <Input
                          className="h-6 text-xs w-40"
                          value={editForm.notes ?? r.notes}
                          onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                        />
                      ) : r.notes || '—'}
                    </td>
                    <td className="py-1.5 pr-3">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        r.source === 'slip' ? 'bg-green-900/30 text-green-400' :
                        r.source === 'forventet' ? 'bg-yellow-900/30 text-yellow-400' :
                        'bg-muted text-muted-foreground'
                      }`}>
                        {r.source === 'slip' ? 'slipp' : r.source === 'forventet' ? 'forventet' : 'manuelt'}
                      </span>
                    </td>
                    <td className="py-1.5">
                      <div className="flex items-center gap-1">
                        {isEditing ? (
                          <>
                            <button className="text-green-500 hover:text-green-400" onClick={() => saveEdit(r.id)}>
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button className="text-muted-foreground hover:text-foreground" onClick={() => setEditingId(null)}>
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button className="text-muted-foreground hover:text-foreground" onClick={() => startEdit(r)}>
                              <Pencil className="h-3 w-3" />
                            </button>
                            <button className="text-muted-foreground hover:text-red-400" onClick={() => onRemove(r.id)}>
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {sorted.some((r) => r.source === 'forventet') && (
            <p className="text-xs text-muted-foreground mt-1">* Forventet oppgjør</p>
          )}
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------
// LØNNSSIMULATOR
// ------------------------------------------------------------

function LønnssimulatorCard({
  profile,
  effectiveTaxRate,
  latestNetto,
}: {
  profile: EmploymentProfile
  effectiveTaxRate: number | null
  latestNetto: number
}) {
  const tillegg = profile.fixedAdditions.reduce((s, a) => s + Math.max(0, a.amount), 0)
  const [nyGrunnlonn, setNyGrunnlonn] = useState(profile.baseMonthly)

  const brutto = nyGrunnlonn + tillegg
  const pensjon = Math.round(brutto * (profile.pensionPercent / 100))
  const fagforening = profile.unionFee
  const husleie = profile.housingDeduction
  const ekstraTrekk = profile.extraTaxWithholding
  // Bruk faktisk skatteprosent fra siste slipp om tilgjengelig, ellers 30 %
  const skatteRate = effectiveTaxRate !== null ? effectiveTaxRate / 100 : 0.30
  const skatt = Math.round(brutto * skatteRate)
  const estimertNetto = brutto - skatt - pensjon - fagforening - husleie - ekstraTrekk

  const delta = latestNetto > 0 ? estimertNetto - latestNetto : null

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Calculator className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm">Lønnssimulator</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Label className="text-xs text-muted-foreground w-36 shrink-0">Ny grunnlønn/mnd</Label>
            <Input
              type="number"
              className="h-7 text-xs w-36"
              value={nyGrunnlonn || ''}
              onChange={(e) => setNyGrunnlonn(parseFloat(e.target.value) || 0)}
            />
            {nyGrunnlonn !== profile.baseMonthly && (
              <button
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setNyGrunnlonn(profile.baseMonthly)}
              >
                Tilbakestill
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
            <InfoRow label="Brutto (inkl. tillegg)" value={fmtNOK(brutto)} />
            <InfoRow label={`Skatt (~${Math.round(skatteRate * 100)} %)`} value={`−${fmtNOK(skatt)}`} />
            <InfoRow label={`Pensjon (${profile.pensionPercent} %)`} value={`−${fmtNOK(pensjon)}`} />
            {fagforening > 0 && <InfoRow label="Fagforening" value={`−${fmtNOK(fagforening)}`} />}
            {husleie > 0 && <InfoRow label="Husleie" value={`−${fmtNOK(husleie)}`} />}
            {ekstraTrekk > 0 && <InfoRow label="Ekstra trekk" value={`−${fmtNOK(ekstraTrekk)}`} />}
          </div>
          <div className="flex items-baseline justify-between border-t border-border pt-2">
            <span className="text-xs font-medium">Estimert netto</span>
            <div className="flex items-baseline gap-2">
              <span className="font-mono font-semibold text-sm">{fmtNOK(estimertNetto)}</span>
              {delta !== null && Math.abs(delta) > 100 && (
                <span className={`text-xs font-semibold tabular-nums ${delta > 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {delta > 0 ? '+' : '−'}{fmtNOK(Math.abs(delta))}
                </span>
              )}
            </div>
          </div>
          {effectiveTaxRate === null && (
            <p className="text-[10px] text-muted-foreground">* Skatteestimat basert på 30 %. Importer slipp for nøyaktig sats.</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ------------------------------------------------------------
// LØNNSHISTORIKK TABELL
// ------------------------------------------------------------

function LønnshistorikkTabell({
  slips,
}: {
  slips: MonthRecord[]
}) {
  const [viewingSlip, setViewingSlip] = useState<MonthRecord | null>(null)

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Lønnshistorikk — importerte slipper</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto max-h-72 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card">
                <tr className="text-muted-foreground border-b border-border">
                  <th className="text-left py-1 pr-3 font-normal">Måned</th>
                  <th className="text-right py-1 pr-3 font-normal">Netto</th>
                  <th className="text-right py-1 pr-3 font-normal">Δ netto</th>
                  <th className="text-right py-1 pr-3 font-normal">Brutto</th>
                  <th className="text-right py-1 pr-3 font-normal">Skattesats</th>
                  <th className="py-1" />
                </tr>
              </thead>
              <tbody>
                {slips.map((m, i) => {
                  const netto = m.slipData?.nettoUtbetalt ?? m.nettoUtbetalt
                  const brutto = m.slipData?.bruttoSum ?? 0
                  const taxRate = brutto > 0 && m.slipData ? (m.slipData.skattetrekk / brutto) * 100 : null
                  const prevNetto = slips[i + 1]?.slipData?.nettoUtbetalt ?? slips[i + 1]?.nettoUtbetalt
                  const delta = prevNetto ? netto - prevNetto : null
                  return (
                    <tr key={`${m.year}-${m.month}`} className="border-b border-border/40 hover:bg-muted/10">
                      <td className="py-1.5 pr-3 text-muted-foreground">{MONTH_NAMES[m.month]} {m.year}</td>
                      <td className="py-1.5 pr-3 text-right font-mono font-medium">{fmtNOK(netto)}</td>
                      <td className="py-1.5 pr-3 text-right font-mono">
                        {delta !== null && Math.abs(delta) > 50 ? (
                          <span className={delta > 0 ? 'text-green-400' : 'text-red-400'}>
                            {delta > 0 ? '+' : '−'}{fmtNOK(Math.abs(delta))}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-1.5 pr-3 text-right font-mono text-muted-foreground">
                        {brutto > 0 ? fmtNOK(brutto) : '—'}
                      </td>
                      <td className="py-1.5 pr-3 text-right">
                        {taxRate !== null ? (
                          <span className="text-muted-foreground">{taxRate.toFixed(1)} %</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-1.5">
                        {(m.slipData || m.slipPdfBase64) && (
                          <button
                            className="text-muted-foreground hover:text-foreground"
                            onClick={() => setViewingSlip(m)}
                          >
                            <FileText className="h-3 w-3" />
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      {viewingSlip && <SlipDetailModal record={viewingSlip} onClose={() => setViewingSlip(null)} />}
    </>
  )
}

// ----------------------------------------------------------------

function FungeringPanel({
  entries,
  baseMonthly,
  onAdd,
  onRemove,
}: {
  entries: TemporaryPayEntry[]
  baseMonthly: number
  onAdd: (e: TemporaryPayEntry) => void
  onRemove: (id: string) => void
}) {
  const today = new Date().toISOString().split('T')[0]
  const [form, setForm] = useState({ label: '', fromDate: today, toDate: today, aarslonn: 0 })
  const [adding, setAdding] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  function handleSave() {
    if (!form.label.trim()) { setSaveError('Beskrivelse mangler'); return }
    if (!form.fromDate || !form.toDate) { setSaveError('Datoer mangler'); return }
    if (form.toDate < form.fromDate) { setSaveError('Til-dato må være etter fra-dato'); return }
    if (form.aarslonn <= 0) { setSaveError('Årslønn må være større enn 0'); return }
    setSaveError(null)
    onAdd({ id: crypto.randomUUID(), label: form.label.trim(), fromDate: form.fromDate, toDate: form.toDate, maanedslonn: Math.round(form.aarslonn / 12) })
    setForm({ label: '', fromDate: today, toDate: today, aarslonn: 0 })
    setAdding(false)
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={() => setAdding((v) => !v)}>
          <Plus className="h-3 w-3" /> Legg til
        </Button>
      </div>

      {adding && (
        <>
          <div className="flex flex-wrap items-end gap-2 text-xs">
            <div className="space-y-0.5">
              <Label className="text-xs">Beskrivelse</Label>
              <Input
                className="h-7 text-xs w-48"
                placeholder="f.eks. Fungering som major"
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              />
            </div>
            <div className="space-y-0.5">
              <Label className="text-xs">Fra dato</Label>
              <Input type="date" className="h-7 text-xs w-36" value={form.fromDate} onChange={(e) => setForm((f) => ({ ...f, fromDate: e.target.value }))} />
            </div>
            <div className="space-y-0.5">
              <Label className="text-xs">Til dato</Label>
              <Input type="date" className="h-7 text-xs w-36" value={form.toDate} onChange={(e) => setForm((f) => ({ ...f, toDate: e.target.value }))} />
            </div>
            <div className="space-y-0.5">
              <Label className="text-xs">Årslønn (kr)</Label>
              <Input
                type="number"
                className="h-7 text-xs w-36"
                placeholder="f.eks. 700000"
                value={form.aarslonn || ''}
                onChange={(e) => setForm((f) => ({ ...f, aarslonn: parseFloat(e.target.value) || 0 }))}
              />
            </div>
            {form.aarslonn > 0 && (
              <div className="space-y-0.5 self-end pb-1.5">
                <p className="text-muted-foreground text-xs">
                  = {Math.round(form.aarslonn / 12).toLocaleString('no-NO')} kr/mnd
                  {baseMonthly > 0 && (
                    <span className="text-green-500 ml-1">
                      (+{Math.max(0, Math.round(form.aarslonn / 12 - baseMonthly)).toLocaleString('no-NO')} tillegg)
                    </span>
                  )}
                </p>
              </div>
            )}
            <Button size="sm" className="h-7 text-xs" onClick={handleSave}>Lagre</Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setAdding(false); setSaveError(null) }}>Avbryt</Button>
          </div>
          {saveError && <p className="text-xs text-red-400">{saveError}</p>}
        </>
      )}

      {entries.length > 0 && (
        <div className="space-y-1">
          {entries.map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-3 text-xs rounded border border-border/50 px-2 py-1.5">
              <span className="font-medium">{e.label}</span>
              <span className="text-muted-foreground">{e.fromDate} → {e.toDate}</span>
              <span className="font-mono text-green-500">
                {Math.round(e.maanedslonn * 12).toLocaleString('no-NO')} kr/år
                <span className="text-muted-foreground font-normal"> ({Math.round(e.maanedslonn).toLocaleString('no-NO')} kr/mnd</span>
                {baseMonthly > 0 && (
                  <span className="text-green-400 font-normal">
                    , +{Math.max(0, Math.round(e.maanedslonn - baseMonthly)).toLocaleString('no-NO')} tillegg
                  </span>
                )}
                <span className="text-muted-foreground font-normal">)</span>
              </span>
              <button
                className="text-muted-foreground hover:text-red-400 transition-colors ml-2"
                onClick={() => onRemove(e.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {entries.length === 0 && !adding && (
        <p className="text-xs text-muted-foreground">Ingen fungeringsperioder registrert.</p>
      )}
    </div>
  )
}
