import { useState, useRef } from 'react'
import { TrendingDown, TrendingUp, CheckCircle2, AlertTriangle, Info, ExternalLink, Upload } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { NumberInput } from '@/components/ui/number-input'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Cell,
} from 'recharts'
import { useActiveEconomyStore } from '@/contexts/EconomyStoreContext'
import { analyzeTaxSettlements, settlementBalance, resolveProjectedWithholding } from '@/domain/economy/taxSettlementCalc'
import { calcNorwegianTax, getTaxRules } from '@/domain/economy/norwegianTaxRules'
import type { NorwegianTaxBreakdown } from '@/domain/economy/norwegianTaxRules'
import { parseTaxSettlementFromPDF } from '@/features/taxSettlement/taxSettlementParser'
import { computeBudgetTable } from '@/domain/economy/budgetTableComputer'
import { forecastJune } from '@/domain/economy/holidayPayCalculator'
import { cn } from '@/lib/utils'
import type { TaxSettlementRecord } from '@/types/economy'

function fmtNOK(n: number) {
  return Math.round(n).toLocaleString('no-NO') + ' kr'
}

export function TaxSettlementPage() {
  const {
    taxSettlements,
    addTaxSettlement,
    updateTaxSettlement,
    removeTaxSettlement,
    addBudgetLine,
    budgetTemplate,
    profile,
    setProfile,
    monthHistory,
    atfEntries,
    savingsAccounts,
    debts,
    subscriptions,
    insurances,
    temporaryPayEntries,
    budgetOverrides,
    fondPortfolio,
  } = useActiveEconomyStore()

  const [showAddForm, setShowAddForm] = useState(false)
  const [importing, setImporting] = useState(false)
  const [budgetPickFor, setBudgetPickFor] = useState<number | null>(null)
  const [budgetPickMonth, setBudgetPickMonth] = useState(new Date().getMonth() + 1)
  const [budgetPickYear, setBudgetPickYear] = useState(new Date().getFullYear())
  const [editingOverride, setEditingOverride] = useState<number | null>(null) // year
  const [overrideInput, setOverrideInput] = useState('')
  const [importMsg, setImportMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handlePDFImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    // Reset input so same file can be re-selected if needed
    e.target.value = ''
    setImporting(true)
    setImportMsg(null)
    try {
      const result = await parseTaxSettlementFromPDF(file)
      const alreadyExists = taxSettlements.some((r) => r.year === result.year)
      if (alreadyExists) {
        setImportMsg({ type: 'error', text: `Skatteoppgjør for ${result.year} er allerede registrert.` })
      } else {
        addTaxSettlement(result)
        setImportMsg({ type: 'ok', text: `Skatteoppgjør for ${result.year} ble importert.` })
      }
    } catch (err) {
      setImportMsg({ type: 'error', text: err instanceof Error ? err.message : 'Kunne ikke lese PDF-filen.' })
    } finally {
      setImporting(false)
    }
  }

  function effectiveAmount(r: TaxSettlementRecord) {
    return r.displayOverride !== undefined ? r.displayOverride : r.skattTilGodeEllerRest
  }

  function addSettlementToBudget(r: TaxSettlementRecord, month: number, year: number) {
    const amount = effectiveAmount(r)
    const isRestskatt = amount < 0
    const settlementLabel = isRestskatt ? `Restskatt ${r.year}` : `Skattetilgode ${r.year}`
    const exists = budgetTemplate.lines.some((l) => l.label === settlementLabel)
    if (exists) return
    addBudgetLine({
      id: crypto.randomUUID(),
      label: settlementLabel,
      category: 'skatteoppgjor',
      amount,
      isRecurring: false,
      source: 'manual',
      isLocked: false,
      isVariable: false,
      specificMonth: month,
      specificYear: year,
    })
  }

  const analysis = analyzeTaxSettlements(taxSettlements, profile?.extraTaxWithholding ?? 0)

  const chartData = [...taxSettlements]
    .sort((a, b) => a.year - b.year)
    .map((r) => ({
      year: r.year,
      beløp: effectiveAmount(r),
    }))

  function handleReduceExtra() {
    if (!profile) return
    const newExtra = Math.max(
      0,
      profile.extraTaxWithholding - analysis.recommendedExtraAdjustment
    )
    setProfile({ ...profile, extraTaxWithholding: newExtra })
  }

  const currentYear = new Date().getFullYear()
  const taxForecast = profile?.taxForecast?.year === currentYear ? profile.taxForecast : null

  // Summer faktisk skatt per måned fra alle slipper dette året (matcher budsjettfanen)
  const slipsThisYear = monthHistory
    .filter((m) => m.year === currentYear && m.slipData != null)
    .sort((a, b) => a.month - b.month)

  const skattetrekkYTD = slipsThisYear.reduce((sum, m) => sum + (m.slipData!.skattetrekk ?? 0), 0)
  const ekstraTrekkYTD = slipsThisYear.reduce((sum, m) => sum + (m.slipData!.ekstraTrekk ?? 0), 0)

  const grossYTD = slipsThisYear.reduce((sum, m) => sum + (m.slipData!.bruttoSum ?? 0), 0)
  const slipMonth = slipsThisYear.length > 0
    ? Math.max(...slipsThisYear.map((m) => m.month))
    : 0

  // Prognose: hent direkte fra budsjettabellen, identisk med hva budsjettfanen viser
  const juneForecast = profile ? forecastJune(currentYear, monthHistory, profile, atfEntries) : null
  const yearOverrides: Record<string, number> = {}
  for (const [k, v] of Object.entries(budgetOverrides)) {
    const prefix = `${currentYear}:`
    if (k.startsWith(prefix)) yearOverrides[k.slice(prefix.length)] = v
  }
  const budgetTable = profile
    ? computeBudgetTable(currentYear, profile, budgetTemplate, monthHistory, atfEntries, savingsAccounts, debts, subscriptions, insurances, yearOverrides, temporaryPayEntries, juneForecast ?? undefined, false, [], fondPortfolio)
    : null
  const allRows = budgetTable?.sections.flatMap((s) => s.rows) ?? []
  const skattRow = allRows.find((r) => r.id === 'skatt')
  const ekstraRow = allRows.find((r) => r.id === 'ekstra')
  const bruttoRow = allRows.find((r) => r.id === 'brutto')
  // Bruk budsjettets trekktabell-projeksjon (samme tall som Budsjett-fanen) når den
  // finnes; den teller ATF-topper kun i utbetalingsmånedene. Fall tilbake på
  // slipp-snitt kun uten budsjett-tabell (ingen profil).
  const projectedWithheld = resolveProjectedWithholding({
    budgetSkattAnnual: skattRow ? skattRow.annualActual : null,
    budgetEkstraAnnual: ekstraRow?.annualActual ?? 0,
    slips: slipsThisYear.map((m) => ({
      month: m.month,
      skattetrekk: m.slipData!.skattetrekk ?? 0,
      ekstraTrekk: m.slipData!.ekstraTrekk ?? 0,
    })),
  })
  const projectedIncome = bruttoRow
    ? Math.abs(bruttoRow.annualActual)
    : slipMonth > 0 ? Math.round((grossYTD / slipMonth) * 12) : 0

  // ── Auto-fill: hent verdier fra resten av verktøyet ──
  // Fagforeningskontingent: fra slipper (annualisert) eller profil
  const ytdFagforening = slipsThisYear.reduce((sum, m) => sum + (m.slipData!.fagforeningskontingent ?? 0), 0)
  const autoFagforening = ytdFagforening > 0 && slipMonth > 0
    ? Math.round(ytdFagforening / slipMonth * 12)
    : Math.round((profile?.unionFee ?? 0) * 12)

  // Pensjonspremie (artskode 7000): fra slipper (annualisert) eller profil
  const ytdPensjon = slipsThisYear.reduce((sum, m) => sum + (m.slipData!.pensjonstrekk ?? 0), 0)
  const autoPensjon = ytdPensjon > 0 && slipMonth > 0
    ? Math.round(ytdPensjon / slipMonth * 12)
    : Math.round((profile?.pensionPercent ?? 0) / 100 * (profile?.baseMonthly ?? 0) * 12)

  // Gjeldsrenter: fra gjeld (saldo × siste nominelle rente)
  const autoGjeldsrenter = Math.round(debts.reduce((sum, d) => {
    const latestRate = d.rateHistory.length > 0
      ? [...d.rateHistory].sort((a, b) => a.fromDate.localeCompare(b.fromDate)).at(-1)!.nominalRate
      : 0
    return sum + d.currentBalance * latestRate / 100
  }, 0))

  // Renteinntekter: fra sparekontoer (ikke BSU, fond, krypto)
  const autoRenteinntekter = Math.round(savingsAccounts
    .filter(a => a.type === 'sparekonto' || a.type === 'annet')
    .reduce((sum, a) => {
      const lastBalance = a.balanceHistory.length > 0
        ? [...a.balanceHistory].sort((x, y) => x.year !== y.year ? x.year - y.year : x.month - y.month).at(-1)!.balance
        : a.openingBalance
      const currentRate = a.rateHistory.length > 0
        ? [...a.rateHistory].sort((x, y) => x.fromDate.localeCompare(y.fromDate)).at(-1)!.rate
        : 0
      return sum + lastBalance * currentRate / 100
    }, 0))

  // BSU innskudd dette år: faktiske innskudd eller planlagt månedsbidrag × 12
  const bsuAccount = savingsAccounts.find(a => a.type === 'BSU')
  const bsuContributionsThisYear = bsuAccount
    ? bsuAccount.contributions
        .filter(c => c.date.startsWith(String(currentYear)))
        .reduce((sum, c) => sum + c.amount, 0)
    : 0
  const autoBsuInnskudd = bsuAccount
    ? Math.min(
        bsuContributionsThisYear > 0 ? bsuContributionsThisYear : bsuAccount.monthlyContribution * 12,
        bsuAccount.maxYearlyContribution ?? 27_500,
      )
    : 0

  const taxAutoFill = {
    expectedIncome: projectedIncome > 0 ? projectedIncome : (profile?.baseMonthly ?? 0) * 12,
    fagforeningskontingent: autoFagforening,
    bsuInnskuddThisYear: autoBsuInnskudd,
    pensjonspremie: autoPensjon,
    gjeldsrenter: autoGjeldsrenter,
    renteinntekter: autoRenteinntekter,
    reisefradragBrutto: 0,          // krever manuell inndata (km-beregning)
    utgiftsgodtgjoerelseOverskudd: 0, // krever manuell inndata
  }



  // KPI-tall for header
  const withheldYTD = skattetrekkYTD + ekstraTrekkYTD
  const expectedTax = taxAutoFill.expectedIncome > 0
    ? calcNorwegianTax(
        taxForecast?.expectedIncome ?? taxAutoFill.expectedIncome,
        currentYear,
        {
          fagforeningskontingent: taxForecast?.fagforeningskontingent ?? taxAutoFill.fagforeningskontingent,
          bsuInnskuddThisYear: taxForecast?.bsuInnskuddThisYear ?? taxAutoFill.bsuInnskuddThisYear,
          pensjonspremie: taxForecast?.pensjonspremie ?? taxAutoFill.pensjonspremie,
          gjeldsrenter: taxForecast?.gjeldsrenter ?? taxAutoFill.gjeldsrenter,
          renteinntekter: taxForecast?.renteinntekter ?? taxAutoFill.renteinntekter,
          reisefradragBrutto: taxForecast?.reisefradragBrutto ?? 0,
          utgiftsgodtgjoerelseOverskudd: taxForecast?.utgiftsgodtgjoerelseOverskudd ?? 0,
        },
      ).skattEtterFradrag
    : null
  const projectedGap = expectedTax !== null ? settlementBalance(projectedWithheld, expectedTax) : null
  const avgHistorical = analysis.records.length > 0 ? Math.round(analysis.avgYearlyRefund) : null

  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Skatteoppgjør</h2>
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={handlePDFImport}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={importing}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5 mr-1" />
            {importing ? 'Laster...' : 'Last opp PDF'}
          </Button>
          <Button size="sm" onClick={() => setShowAddForm(true)}>
            + Legg til
          </Button>
        </div>
      </div>

      {/* KPI-chips */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="rounded-lg border border-border bg-card/60 px-3 py-2.5">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Betalt hittil {currentYear}</p>
          <p className="text-sm font-semibold font-mono tabular-nums">
            {withheldYTD > 0 ? fmtNOK(withheldYTD) : '—'}
          </p>
          {slipMonth > 0 && <p className="text-[10px] text-muted-foreground">{slipMonth} mnd med slip</p>}
        </div>
        <div className="rounded-lg border border-border bg-card/60 px-3 py-2.5">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Årsestimert skattetrekk</p>
          <p className="text-sm font-semibold font-mono tabular-nums">
            {projectedWithheld > 0 ? fmtNOK(projectedWithheld) : '—'}
          </p>
          {projectedWithheld > 0 && taxForecast === null && (
            <p className="text-[10px] text-amber-400/80">Ingen prognose lagt inn</p>
          )}
        </div>
        <div className={`rounded-lg border px-3 py-2.5 ${
          projectedGap === null ? 'border-border bg-card/60' :
          projectedGap > 500 ? 'border-green-500/30 bg-green-500/5' :
          projectedGap < -500 ? 'border-red-500/30 bg-red-500/5' :
          'border-border bg-card/60'
        }`}>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Forventet saldo</p>
          {projectedGap !== null ? (
            <>
              <p className={`text-sm font-semibold font-mono tabular-nums ${projectedGap >= 0 ? 'text-green-500' : 'text-red-400'}`}>
                {projectedGap >= 0 ? '+' : ''}{fmtNOK(projectedGap)}
              </p>
              <p className="text-[10px] text-muted-foreground">{projectedGap >= 0 ? 'til gode' : 'restskatt'}</p>
            </>
          ) : (
            <p className="text-sm font-semibold text-muted-foreground">—</p>
          )}
        </div>
        <div className={`rounded-lg border px-3 py-2.5 ${
          avgHistorical === null ? 'border-border bg-card/60' :
          avgHistorical > 500 ? 'border-green-500/30 bg-green-500/5' :
          avgHistorical < -500 ? 'border-red-500/30 bg-red-500/5' :
          'border-border bg-card/60'
        }`}>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Snitt siste {analysis.records.length} år</p>
          {avgHistorical !== null ? (
            <>
              <p className={`text-sm font-semibold font-mono tabular-nums ${avgHistorical >= 0 ? 'text-green-500' : 'text-red-400'}`}>
                {avgHistorical >= 0 ? '+' : ''}{fmtNOK(avgHistorical)}
              </p>
              <p className="text-[10px] text-muted-foreground">{avgHistorical >= 0 ? 'tilbake i snitt' : 'restskatt i snitt'}</p>
            </>
          ) : (
            <p className="text-sm font-semibold text-muted-foreground">—</p>
          )}
        </div>
      </div>

      {importMsg && (
        <div className={`text-xs rounded-md px-3 py-2 ${importMsg.type === 'ok' ? 'bg-green-500/10 text-green-600' : 'bg-destructive/10 text-destructive'}`}>
          {importMsg.text}
        </div>
      )}

      {/* ── Prognose for inneværende år ── */}
      <TaxForecastSection
        currentYear={currentYear}
        taxForecast={taxForecast}
        skattetrekkYTD={skattetrekkYTD}
        ekstraTrekkYTD={ekstraTrekkYTD}
        projectedWithheld={projectedWithheld}
        autoFill={taxAutoFill}
        slipMonth={slipMonth}
        onSaveForecast={(d) => {
          if (!profile) return
          const taxCalc = calcNorwegianTax(d.expectedIncome, currentYear, d)
          setProfile({
            ...profile,
            taxForecast: {
              year: currentYear,
              expectedIncome: d.expectedIncome,
              expectedTax: taxCalc.skattEtterFradrag,
              fagforeningskontingent: d.fagforeningskontingent || undefined,
              bsuInnskuddThisYear: d.bsuInnskuddThisYear || undefined,
              pensjonspremie: d.pensjonspremie || undefined,
              gjeldsrenter: d.gjeldsrenter || undefined,
              renteinntekter: d.renteinntekter || undefined,
              reisefradragBrutto: d.reisefradragBrutto || undefined,
              utgiftsgodtgjoerelseOverskudd: d.utgiftsgodtgjoerelseOverskudd || undefined,
            },
          })
        }}
        onClearForecast={() => {
          if (!profile) return
          setProfile({ ...profile, taxForecast: undefined })
        }}
      />

      {/* Skattemelding-sjekkliste */}
      <SkattemeldingSjekkliste
        autoFill={taxAutoFill}
        hasBsu={!!bsuAccount}
        atfSum={atfEntries.filter(e => e.year === currentYear).reduce((s, e) => s + e.beregnetBeløp, 0)}
        hasDebt={debts.filter(d => d.status !== 'nedbetalt').length > 0}
        currentYear={currentYear}
      />

      {/* Anbefaling */}
      {analysis.recommendation !== 'keep' && taxSettlements.length >= 2 && (
        <div className={`rounded-md p-3 border text-sm ${
          analysis.recommendation === 'reduce_extra'
            ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400'
            : 'bg-red-500/10 border-red-500/30 text-red-400'
        }`}>
          <div className="flex items-center gap-2 mb-2">
            {analysis.recommendation === 'reduce_extra'
              ? <TrendingDown className="h-4 w-4 shrink-0" />
              : <TrendingUp className="h-4 w-4 shrink-0" />
            }
            <span className="font-medium">Anbefaling</span>
          </div>
          <p className="text-xs">{analysis.reasoning}</p>
          {analysis.recommendation === 'reduce_extra' && profile && (
            <div className="mt-3 flex items-center gap-3">
              <div className="text-xs">
                <span className="text-muted-foreground">Nåværende ekstra trekk: </span>
                <span className="font-mono">{fmtNOK(profile.extraTaxWithholding)}/mnd</span>
              </div>
              <Button size="sm" variant="outline" onClick={handleReduceExtra}>
                Reduser med {fmtNOK(analysis.recommendedExtraAdjustment)}/mnd
              </Button>
            </div>
          )}
          {analysis.recommendation === 'reduce_extra' && analysis.recommendedExtraAdjustment > 0 && (
            <p className="text-xs mt-2 text-green-400">
              Dette gir deg ~{fmtNOK(analysis.recommendedExtraAdjustment)} mer disponibelt per måned.
            </p>
          )}
        </div>
      )}

      {/* Graf */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Til gode / restskatt per år</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="year" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
                <Tooltip
                  formatter={(v) => [
                    fmtNOK(Number(v)),
                    Number(v) >= 0 ? 'Til gode' : 'Restskatt',
                  ]}
                />
                <ReferenceLine y={0} stroke="var(--muted-foreground)" />
                <Bar dataKey="beløp" radius={[3, 3, 0, 0]}>
                  {chartData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.beløp >= 0 ? '#22C55E' : '#EF4444'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Legg til skjema */}
      {showAddForm && (
        <AddSettlementForm
          onSave={(r) => { addTaxSettlement(r); setShowAddForm(false) }}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {/* Tabell */}
      {taxSettlements.length === 0 && !showAddForm ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm text-muted-foreground mb-3">
              Ingen skatteoppgjør registrert. Legg til for å få anbefalinger om ekstra trekk.
            </p>
            <Button size="sm" onClick={() => setShowAddForm(true)}>Legg til skatteoppgjør</Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Historikk</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="text-left px-3 py-2 font-medium text-xs">År</th>
                    <th className="text-right px-3 py-2 font-medium text-xs">Pensjonsgivende inntekt</th>
                    <th className="text-right px-3 py-2 font-medium text-xs">Til gode / Restskatt</th>
                    <th className="px-3 py-2 text-xs text-muted-foreground font-normal">Budsjett</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {[...taxSettlements]
                    .sort((a, b) => b.year - a.year)
                    .map((r) => {
                      const tilgode = effectiveAmount(r)
                      const isOverridden = r.displayOverride !== undefined
                      return (
                        <tr key={r.year} className="border-b border-border last:border-0">
                          <td className="px-3 py-2 text-xs font-medium">{r.year}</td>
                          <td className="px-3 py-2 text-right font-mono text-xs">
                            {r.pensjonsgivendeInntekt ? fmtNOK(r.pensjonsgivendeInntekt) : '—'}
                          </td>
                          <td className="px-3 py-2 text-right text-xs">
                            {editingOverride === r.year ? (
                              <div className="flex items-center gap-1 justify-end">
                                <input
                                  type="number"
                                  className="h-6 w-24 rounded border border-border bg-background px-1.5 text-xs font-mono text-right"
                                  value={overrideInput}
                                  onChange={(e) => setOverrideInput(e.target.value)}
                                  placeholder="f.eks. -4200"
                                  autoFocus
                                />
                                <button className="text-green-400 hover:text-green-300 text-xs px-1"
                                  onClick={() => {
                                    const val = parseFloat(overrideInput)
                                    if (!isNaN(val)) updateTaxSettlement(r.year, { displayOverride: val })
                                    setEditingOverride(null)
                                  }}>✓</button>
                                <button className="text-muted-foreground hover:text-foreground text-xs px-1"
                                  onClick={() => setEditingOverride(null)}>✕</button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1 justify-end group">
                                <span className={`font-mono font-medium ${tilgode >= 0 ? 'text-green-500' : 'text-red-400'}`}>
                                  {tilgode >= 0 ? '+' : ''}{fmtNOK(tilgode)}
                                </span>
                                {isOverridden && (
                                  <span className="text-[9px] text-amber-400/70">(overstyrt)</span>
                                )}
                                <button
                                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity text-[10px] ml-0.5"
                                  title="Endre beløp"
                                  onClick={() => { setOverrideInput(String(tilgode)); setEditingOverride(r.year) }}
                                >✎</button>
                                {isOverridden && (
                                  <button
                                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity text-[10px]"
                                    title="Tilbakestill til originalverdi"
                                    onClick={() => updateTaxSettlement(r.year, { displayOverride: undefined })}
                                  >↩</button>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {(() => {
                              const lbl = r.skattTilGodeEllerRest < 0 ? `Restskatt ${r.year}` : `Skattetilgode ${r.year}`
                              const alreadyAdded = budgetTemplate.lines.some((l) => l.label === lbl)
                              if (alreadyAdded) {
                                return (
                                  <span className="text-xs text-green-500 px-2">✓ Lagt til</span>
                                )
                              }
                              if (budgetPickFor === r.year) {
                                return (
                                  <div className="flex items-center gap-1 flex-wrap">
                                    <select
                                      className="h-6 text-xs rounded border border-border bg-background px-1"
                                      value={budgetPickMonth}
                                      onChange={(e) => setBudgetPickMonth(parseInt(e.target.value))}
                                    >
                                      {['Jan','Feb','Mar','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Des'].map((m, i) => (
                                        <option key={i + 1} value={i + 1}>{m}</option>
                                      ))}
                                    </select>
                                    <select
                                      className="h-6 text-xs rounded border border-border bg-background px-1"
                                      value={budgetPickYear}
                                      onChange={(e) => setBudgetPickYear(parseInt(e.target.value))}
                                    >
                                      {[-1, 0, 1].map((d) => {
                                        const y = new Date().getFullYear() + d
                                        return <option key={y} value={y}>{y}</option>
                                      })}
                                    </select>
                                    <Button
                                      size="sm"
                                      className="h-6 px-2 text-xs"
                                      onClick={() => {
                                        addSettlementToBudget(r, budgetPickMonth, budgetPickYear)
                                        setBudgetPickFor(null)
                                      }}
                                    >
                                      OK
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 px-1 text-xs text-muted-foreground"
                                      onClick={() => setBudgetPickFor(null)}
                                    >
                                      ✕
                                    </Button>
                                  </div>
                                )
                              }
                              return (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
                                  onClick={() => {
                                    setBudgetPickFor(r.year)
                                    setBudgetPickMonth(new Date().getMonth() + 1)
                                    setBudgetPickYear(new Date().getFullYear())
                                  }}
                                >
                                  <ExternalLink className="h-3 w-3" />
                                  → Budsjett
                                </Button>
                              )
                            })()}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-xs text-muted-foreground"
                              onClick={() => removeTaxSettlement(r.year)}
                            >
                              Fjern
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>

            {taxSettlements.length >= 2 && (
              <p className="text-xs text-muted-foreground mt-2">
                Snitt siste {Math.min(3, taxSettlements.length)} år:{' '}
                <span className={analysis.avgYearlyRefund >= 0 ? 'text-green-500' : 'text-red-400'}>
                  {analysis.avgYearlyRefund >= 0 ? '+' : ''}{fmtNOK(analysis.avgYearlyRefund)}
                </span>
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ------------------------------------------------------------
// SKATTEBEREGNING-TABELL (Skatteetaten-modell)
// ------------------------------------------------------------

function TaxBreakdownTable({ breakdown: b, label, dimmed }: {
  breakdown: NorwegianTaxBreakdown
  label: string
  dimmed?: boolean
}) {
  const cls = dimmed ? 'text-muted-foreground/60' : ''
  return (
    <div className={`text-xs space-y-1 border border-border rounded-md p-3 ${dimmed ? 'opacity-70' : ''}`}>
      <div className="flex justify-between font-medium text-muted-foreground mb-1">
        <span>{label}</span>
        <span className="italic font-normal">Skatteetaten-modell</span>
      </div>

      {/* Lønn */}
      <div className={`flex justify-between ${cls}`}>
        <span className="text-muted-foreground">Lønn</span>
        <span className="font-mono">{fmtNOK(b.personinntekt - b.utgiftsgodtgjoerelseOverskudd)}</span>
      </div>
      {b.utgiftsgodtgjoerelseOverskudd > 0 && (
        <div className={`flex justify-between ${cls}`}>
          <span className="text-muted-foreground pl-2">+ Overskudd utgiftsgodtgjørelse</span>
          <span className="font-mono">+{fmtNOK(b.utgiftsgodtgjoerelseOverskudd)}</span>
        </div>
      )}
      {b.renteinntekter > 0 && (
        <div className={`flex justify-between ${cls}`}>
          <span className="text-muted-foreground pl-2">+ Renteinntekter</span>
          <span className="font-mono">+{fmtNOK(b.renteinntekter)}</span>
        </div>
      )}

      {/* Fradrag */}
      <div className={`flex justify-between ${cls}`}>
        <span className="text-muted-foreground pl-2">− Minstefradrag</span>
        <span className="font-mono text-green-400">−{fmtNOK(b.minstefradrag)}</span>
      </div>
      {b.fagforeningsfradrag > 0 && (
        <div className={`flex justify-between ${cls}`}>
          <span className="text-muted-foreground pl-2">− Fagforeningsfradrag</span>
          <span className="font-mono text-green-400">−{fmtNOK(b.fagforeningsfradrag)}</span>
        </div>
      )}
      {b.pensjonspremie > 0 && (
        <div className={`flex justify-between ${cls}`}>
          <span className="text-muted-foreground pl-2">− Pensjonspremie</span>
          <span className="font-mono text-green-400">−{fmtNOK(b.pensjonspremie)}</span>
        </div>
      )}
      {b.gjeldsrenter > 0 && (
        <div className={`flex justify-between ${cls}`}>
          <span className="text-muted-foreground pl-2">− Gjeldsrenter</span>
          <span className="font-mono text-green-400">−{fmtNOK(b.gjeldsrenter)}</span>
        </div>
      )}
      {b.reisefradrag > 0 && (
        <div className={`flex justify-between ${cls}`}>
          <span className="text-muted-foreground pl-2">− Reisefradrag</span>
          <span className="font-mono text-green-400">−{fmtNOK(b.reisefradrag)}</span>
        </div>
      )}
      <div className={`flex justify-between ${cls}`}>
        <span className="text-muted-foreground pl-2">− Personfradrag</span>
        <span className="font-mono text-green-400">−{fmtNOK(b.alminneligInntekt - b.skattepliktigAlminneligInntekt)}</span>
      </div>
      <div className={`flex justify-between border-t border-border/30 pt-1 ${cls}`}>
        <span className="text-muted-foreground">Skattepliktig alminnelig inntekt</span>
        <span className="font-mono">{fmtNOK(b.skattepliktigAlminneligInntekt)}</span>
      </div>

      {/* Skattekomponenter */}
      <div className={`flex justify-between border-t border-border/30 pt-1 ${cls}`}>
        <span className="text-muted-foreground">Inntektsskatt 22 %</span>
        <span className="font-mono">{fmtNOK(b.inntektsskatt)}</span>
      </div>
      <div className={`flex justify-between ${cls}`}>
        <span className="text-muted-foreground">Trygdeavgift</span>
        <span className="font-mono">{fmtNOK(b.trygdeavgift)}</span>
      </div>
      {b.trinnskatt > 0 && (
        <div className={`flex justify-between ${cls}`}>
          <span className="text-muted-foreground">Trinnskatt</span>
          <span className="font-mono">{fmtNOK(b.trinnskatt)}</span>
        </div>
      )}
      {b.bsuSkattefradrag > 0 && (
        <div className={`flex justify-between ${cls}`}>
          <span className="text-muted-foreground pl-2">− BSU skattefradrag</span>
          <span className="font-mono text-green-400">−{fmtNOK(b.bsuSkattefradrag)}</span>
        </div>
      )}
      <div className="flex justify-between font-semibold border-t border-border/50 pt-1">
        <span>Beregnet skatt</span>
        <span className="font-mono">{fmtNOK(b.skattEtterFradrag)}</span>
      </div>
    </div>
  )
}

// ------------------------------------------------------------
// SKATTEPROGNOSE — live kalkulator
// ------------------------------------------------------------

type TaxFillData = {
  expectedIncome: number
  fagforeningskontingent: number
  bsuInnskuddThisYear: number
  pensjonspremie: number
  gjeldsrenter: number
  renteinntekter: number
  reisefradragBrutto: number
  utgiftsgodtgjoerelseOverskudd: number
}

function TaxForecastSection({
  currentYear,
  taxForecast,
  skattetrekkYTD,
  ekstraTrekkYTD,
  projectedWithheld,
  autoFill,
  slipMonth,
  onSaveForecast,
  onClearForecast,
}: {
  currentYear: number
  taxForecast: {
    year: number
    expectedIncome: number
    expectedTax: number
    fagforeningskontingent?: number
    bsuInnskuddThisYear?: number
    pensjonspremie?: number
    gjeldsrenter?: number
    renteinntekter?: number
    reisefradragBrutto?: number
    utgiftsgodtgjoerelseOverskudd?: number
  } | null
  skattetrekkYTD: number
  ekstraTrekkYTD: number
  projectedWithheld: number
  autoFill: TaxFillData
  slipMonth: number
  onSaveForecast: (d: TaxFillData) => void
  onClearForecast: () => void
}) {
  // Bruk lagrede verdier hvis tilgjengelig, ellers auto-fyll fra verktøyet
  const initial: TaxFillData = taxForecast
    ? {
        expectedIncome: taxForecast.expectedIncome,
        fagforeningskontingent: taxForecast.fagforeningskontingent ?? autoFill.fagforeningskontingent,
        bsuInnskuddThisYear: taxForecast.bsuInnskuddThisYear ?? autoFill.bsuInnskuddThisYear,
        pensjonspremie: taxForecast.pensjonspremie ?? autoFill.pensjonspremie,
        gjeldsrenter: taxForecast.gjeldsrenter ?? autoFill.gjeldsrenter,
        renteinntekter: taxForecast.renteinntekter ?? autoFill.renteinntekter,
        reisefradragBrutto: taxForecast.reisefradragBrutto ?? 0,
        utgiftsgodtgjoerelseOverskudd: taxForecast.utgiftsgodtgjoerelseOverskudd ?? 0,
      }
    : autoFill

  const [income, setIncome] = useState(initial.expectedIncome)
  const [fagfradrag, setFagfradrag] = useState(initial.fagforeningskontingent)
  const [bsuInnskudd, setBsuInnskudd] = useState(initial.bsuInnskuddThisYear)
  const [pensjonspremie, setPensjonspremie] = useState(initial.pensjonspremie)
  const [gjeldsrenter, setGjeldsrenter] = useState(initial.gjeldsrenter)
  const [renteinntekter, setRenteinntekter] = useState(initial.renteinntekter)
  const [reisefradrag, setReisefradrag] = useState(initial.reisefradragBrutto)
  const [utgiftsgodtgjoerelse, setUtgiftsgodtgjoerelse] = useState(initial.utgiftsgodtgjoerelseOverskudd)

  // Live skatteberegning — oppdateres automatisk når felt endres
  const liveBreakdown: NorwegianTaxBreakdown | null = income > 0
    ? calcNorwegianTax(income, currentYear, {
        fagforeningskontingent: fagfradrag,
        bsuInnskuddThisYear: bsuInnskudd,
        pensjonspremie,
        gjeldsrenter,
        renteinntekter,
        reisefradragBrutto: reisefradrag,
        utgiftsgodtgjoerelseOverskudd: utgiftsgodtgjoerelse,
      })
    : null

  const estimatedTax = liveBreakdown?.skattEtterFradrag ?? 0
  const saldo = estimatedTax > 0 && projectedWithheld > 0 ? settlementBalance(projectedWithheld, estimatedTax) : null
  const monthsRemaining = 12 - slipMonth
  const monthlyAdjustment = saldo !== null && monthsRemaining > 0 ? Math.round(-saldo / monthsRemaining) : null
  const onTrack = saldo !== null && Math.abs(saldo) < 2000
  const overPaying = saldo !== null && saldo > 2000
  const underPaying = saldo !== null && saldo < -2000
  const progressPct = estimatedTax > 0 ? Math.min(100, (projectedWithheld / estimatedTax) * 100) : 0

  function applyAutoFill() {
    setIncome(autoFill.expectedIncome)
    setFagfradrag(autoFill.fagforeningskontingent)
    setBsuInnskudd(autoFill.bsuInnskuddThisYear)
    setPensjonspremie(autoFill.pensjonspremie)
    setGjeldsrenter(autoFill.gjeldsrenter)
    setRenteinntekter(autoFill.renteinntekter)
    // Reisefradrag og utgiftsgodtgjørelse beholdes — krever manuell inndata
  }

  const saved = taxForecast
  const isDirty = income !== (saved?.expectedIncome ?? autoFill.expectedIncome)
    || fagfradrag !== (saved?.fagforeningskontingent ?? autoFill.fagforeningskontingent)
    || bsuInnskudd !== (saved?.bsuInnskuddThisYear ?? autoFill.bsuInnskuddThisYear)
    || pensjonspremie !== (saved?.pensjonspremie ?? autoFill.pensjonspremie)
    || gjeldsrenter !== (saved?.gjeldsrenter ?? autoFill.gjeldsrenter)
    || renteinntekter !== (saved?.renteinntekter ?? autoFill.renteinntekter)
    || reisefradrag !== (saved?.reisefradragBrutto ?? 0)
    || utgiftsgodtgjoerelse !== (saved?.utgiftsgodtgjoerelseOverskudd ?? 0)

  function handleSave() {
    onSaveForecast({
      expectedIncome: income,
      fagforeningskontingent: fagfradrag,
      bsuInnskuddThisYear: bsuInnskudd,
      pensjonspremie,
      gjeldsrenter,
      renteinntekter,
      reisefradragBrutto: reisefradrag,
      utgiftsgodtgjoerelseOverskudd: utgiftsgodtgjoerelse,
    })
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Skattekalkulator {currentYear}</CardTitle>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" className="text-xs h-6 px-2" onClick={applyAutoFill} title="Fyll inn fra lønnsslipper, gjeld og sparing">
              Synkroniser fra verktøy
            </Button>
            {taxForecast && (
              <Button variant="ghost" size="sm" className="text-xs h-6 px-2 text-muted-foreground" onClick={onClearForecast}>
                Nullstill
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* ── Inntekt ── */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Inntekt</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1 col-span-2">
              <Label className="text-xs">Lønn (pensjonsgivende inntekt)</Label>
              <NumberInput value={income} onChange={setIncome} suffix="kr" step={10000} min={0} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Overskudd utgiftsgodtgjørelse</Label>
              <NumberInput value={utgiftsgodtgjoerelse} onChange={setUtgiftsgodtgjoerelse} suffix="kr" step={500} min={0} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Renteinntekter (bank m.m.)</Label>
              <NumberInput value={renteinntekter} onChange={setRenteinntekter} suffix="kr" step={500} min={0} />
            </div>
          </div>
        </div>

        {/* ── Fradrag ── */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Fradrag</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Fagforeningskontingent</Label>
              <NumberInput value={fagfradrag} onChange={setFagfradrag} suffix="kr" step={100} min={0} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Pensjonspremie (arbeidsforhold)</Label>
              <NumberInput value={pensjonspremie} onChange={setPensjonspremie} suffix="kr" step={1000} min={0} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Gjeldsrenter (lån)</Label>
              <NumberInput value={gjeldsrenter} onChange={setGjeldsrenter} suffix="kr" step={1000} min={0} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">
                Arbeidsreiser hjem–jobb (brutto)
                <span className="text-muted-foreground font-normal ml-1">– {getTaxRules(currentYear).reisefradragBunnfradrag.toLocaleString('no-NO')} kr trekkes fra</span>
              </Label>
              <NumberInput value={reisefradrag} onChange={setReisefradrag} suffix="kr" step={500} min={0} />
            </div>
          </div>
        </div>

        {/* ── Skattefradrag ── */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Skattefradrag</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">BSU innskudd dette år</Label>
              <NumberInput value={bsuInnskudd} onChange={setBsuInnskudd} suffix="kr" step={1000} min={0} />
            </div>
          </div>
        </div>

        {/* Lagre-knapp — vises kun når det er ulagrede endringer */}
        {isDirty && (
          <Button size="sm" onClick={handleSave} disabled={income <= 0}>
            Lagre beregningsgrunnlag
          </Button>
        )}

        {/* ── Live skatteberegning ── */}
        {liveBreakdown && (
          <TaxBreakdownTable breakdown={liveBreakdown} label={`Beregnet skatt ${currentYear}`} />
        )}

        {/* ── Sammenligning mot faktisk skattetrekk ── */}
        {liveBreakdown && (
          <div className="space-y-3">
            {slipMonth === 0 ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground rounded-md bg-muted/30 px-3 py-2">
                <Info className="h-3.5 w-3.5 shrink-0" />
                Last opp lønnsslipper for {currentYear} for å se om du betaler for mye eller for lite.
              </div>
            ) : onTrack ? (
              <div className="flex items-center gap-2 text-xs text-green-400 rounded-md bg-green-500/10 border border-green-500/20 px-3 py-2">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                Du er på skiva — trekket treffer beregnet skatt innenfor ±2 000 kr.
              </div>
            ) : overPaying ? (
              <div className="flex items-center gap-2 text-xs text-yellow-400 rounded-md bg-yellow-500/10 border border-yellow-500/20 px-3 py-2">
                <TrendingDown className="h-3.5 w-3.5 shrink-0" />
                Du betaler for mye. Prognosen tilsier {fmtNOK(Math.abs(saldo!))} til gode ved oppgjør.
                {monthlyAdjustment !== null && monthlyAdjustment < 0 && (
                  <span> Du kan redusere trekk med ca. {fmtNOK(Math.abs(monthlyAdjustment))}/mnd.</span>
                )}
              </div>
            ) : underPaying ? (
              <div className="flex items-center gap-2 text-xs text-red-400 rounded-md bg-red-500/10 border border-red-500/20 px-3 py-2">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Du risikerer restskatt på ~{fmtNOK(Math.abs(saldo!))} ved årets slutt.
                {monthlyAdjustment !== null && monthlyAdjustment > 0 && (
                  <span> Øk trekk med ca. {fmtNOK(monthlyAdjustment)}/mnd.</span>
                )}
              </div>
            ) : null}

            {slipMonth > 0 && (
              <div className="space-y-2">
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Innbetalt trekk (prognose hele år)</span>
                    <span className={cn(
                      'font-mono font-medium',
                      onTrack ? 'text-green-400' : underPaying ? 'text-red-400' : 'text-yellow-400'
                    )}>
                      {fmtNOK(projectedWithheld)} / {fmtNOK(estimatedTax)}
                    </span>
                  </div>
                  <Progress
                    value={progressPct}
                    className={cn(
                      'h-2',
                      onTrack ? '[&>div]:bg-green-500' : underPaying ? '[&>div]:bg-red-500' : '[&>div]:bg-yellow-500'
                    )}
                  />
                </div>
                <div className="text-xs space-y-1 border-t border-border/50 pt-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Skattetrekk hittil ({slipMonth} mnd)</span>
                    <span className="font-mono">{fmtNOK(skattetrekkYTD)}</span>
                  </div>
                  {ekstraTrekkYTD > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Ekstra trekk hittil</span>
                      <span className="font-mono">{fmtNOK(ekstraTrekkYTD)}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-border/50 pt-1 font-semibold">
                    <span>Estimert restskatt / til gode</span>
                    <span className={cn(
                      'font-mono',
                      onTrack ? 'text-green-400' : underPaying ? 'text-red-400' : 'text-yellow-400'
                    )}>
                      {saldo! >= 0 ? '+' : ''}{fmtNOK(saldo!)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ------------------------------------------------------------
// SKJEMA
// ------------------------------------------------------------

function AddSettlementForm({
  onSave,
  onCancel,
}: {
  onSave: (r: TaxSettlementRecord) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState({
    year: new Date().getFullYear() - 1,
    skattTilGodeEllerRest: 0,
    pensjonsgivendeInntekt: '' as string | number,
    skattInnbetalt: '' as string | number,
  })

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Legg til skatteoppgjør</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Inntektsår</Label>
            <Input
              type="number"
              value={form.year}
              onChange={(e) => setForm((f) => ({ ...f, year: parseInt(e.target.value) || f.year }))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Til gode (negativt = restskatt)</Label>
            <Input
              type="number"
              value={form.skattTilGodeEllerRest}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  skattTilGodeEllerRest: parseFloat(e.target.value) || 0,
                }))
              }
              placeholder="-5000 = 5 000 kr tilgode"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Pensjonsgivende inntekt (valgfritt)</Label>
            <Input
              type="number"
              value={form.pensjonsgivendeInntekt}
              onChange={(e) =>
                setForm((f) => ({ ...f, pensjonsgivendeInntekt: parseFloat(e.target.value) || '' }))
              }
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Skatt innbetalt (valgfritt)</Label>
            <Input
              type="number"
              value={form.skattInnbetalt}
              onChange={(e) =>
                setForm((f) => ({ ...f, skattInnbetalt: parseFloat(e.target.value) || '' }))
              }
            />
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onCancel}>Avbryt</Button>
          <Button
            size="sm"
            onClick={() =>
              onSave({
                year: form.year,
                skattTilGodeEllerRest: form.skattTilGodeEllerRest,
                pensjonsgivendeInntekt:
                  typeof form.pensjonsgivendeInntekt === 'number' ? form.pensjonsgivendeInntekt : undefined,
                skattInnbetalt:
                  typeof form.skattInnbetalt === 'number' ? form.skattInnbetalt : undefined,
              })
            }
          >
            Lagre
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Skattemelding-sjekkliste ──────────────────────────────────

const SKATTEETATEN_URL = 'https://www.skatteetaten.no/person/skatt/skattemelding/'

function SkattemeldingSjekkliste({
  autoFill,
  hasBsu,
  atfSum,
  hasDebt,
  currentYear,
}: {
  autoFill: { fagforeningskontingent: number; bsuInnskuddThisYear: number; gjeldsrenter: number; renteinntekter: number }
  hasBsu: boolean
  atfSum: number
  hasDebt: boolean
  currentYear: number
}) {
  type Item = { id: string; text: string; detail?: string; done?: boolean; warn?: boolean }
  const items: Item[] = [
    {
      id: 'bsu',
      text: 'BSU-fradrag',
      detail: hasBsu && autoFill.bsuInnskuddThisYear > 0
        ? `Sjekk at BSU-innskudd (${Math.round(autoFill.bsuInnskuddThisYear).toLocaleString('no-NO')} kr) er med i skattemeldingen`
        : 'Ingen BSU-konto registrert',
      warn: !hasBsu || autoFill.bsuInnskuddThisYear === 0,
    },
    {
      id: 'fagforening',
      text: 'Fagforeningsfradrag',
      detail: autoFill.fagforeningskontingent > 0
        ? `Maks fradrag ${getTaxRules(currentYear).fagforeningsfradragMaks.toLocaleString('no-NO')} kr/år — du har betalt ca. ${Math.round(autoFill.fagforeningskontingent).toLocaleString('no-NO')} kr`
        : 'Ingen fagforeningskontingent registrert',
      warn: autoFill.fagforeningskontingent === 0,
    },
    {
      id: 'gjeld',
      text: 'Renteutgifter (gjeldsrenter)',
      detail: hasDebt && autoFill.gjeldsrenter > 0
        ? `Estimerte renteutgifter: ${Math.round(autoFill.gjeldsrenter).toLocaleString('no-NO')} kr — sjekk at dette stemmer`
        : hasDebt ? 'Gjeld registrert, men ingen renteutgifter beregnet' : 'Ingen gjeld registrert',
      warn: hasDebt && autoFill.gjeldsrenter === 0,
    },
    {
      id: 'atf',
      text: 'ATF / militær godtgjørelse',
      detail: atfSum > 0
        ? `Du har ${Math.round(atfSum).toLocaleString('no-NO')} kr i ATF-bonus for ${currentYear} — sjekk at dette er innrapportert`
        : `Ingen ATF-utbetalinger registrert for ${currentYear}`,
      warn: false,
    },
    {
      id: 'renter',
      text: 'Renteinntekter',
      detail: autoFill.renteinntekter > 0
        ? `Estimerte renteinntekter: ${Math.round(autoFill.renteinntekter).toLocaleString('no-NO')} kr — forhåndsutfylt av banken`
        : 'Ingen renteinntekter beregnet',
      warn: false,
    },
  ]

  const [checked, setChecked] = useState<Set<string>>(new Set())
  const toggle = (id: string) => setChecked(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  const done = checked.size
  const total = items.length

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm">Skattemelding-sjekkliste {currentYear}</CardTitle>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">{done}/{total} sjekket</span>
            <a
              href={SKATTEETATEN_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              Åpne skattemelding
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
        <Progress value={(done / total) * 100} className="h-1 mt-2" />
      </CardHeader>
      <CardContent>
        <div className="space-y-1.5">
          {items.map((item) => (
            <button
              key={item.id}
              className={cn(
                'w-full flex items-start gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors',
                checked.has(item.id) ? 'bg-green-500/10' : item.warn ? 'bg-yellow-500/5' : 'bg-muted/20',
                'hover:bg-muted/40',
              )}
              onClick={() => toggle(item.id)}
            >
              {checked.has(item.id) ? (
                <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
              ) : item.warn ? (
                <AlertTriangle className="h-4 w-4 text-yellow-400 mt-0.5 shrink-0" />
              ) : (
                <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              )}
              <div className="min-w-0">
                <p className={cn('text-xs font-medium', checked.has(item.id) && 'line-through text-muted-foreground')}>{item.text}</p>
                {item.detail && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">{item.detail}</p>
                )}
              </div>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
