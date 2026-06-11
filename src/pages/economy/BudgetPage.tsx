import { useState, useMemo, useEffect, useCallback } from 'react'
import { Lock, LockOpen, Upload, Plus, LayoutDashboard, Table2, Pencil, Undo2, ChevronDown, ChevronRight, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useActiveEconomyStore } from '@/contexts/EconomyStoreContext'
import { PayslipImporter } from '@/features/payslip/PayslipImporter'
import { computeBudgetTable } from '@/domain/economy/budgetTableComputer'
import type { BudgetRow, MonthMeta } from '@/domain/economy/budgetTableComputer'
import { forecastJune } from '@/domain/economy/holidayPayCalculator'
import { slaaOppTrekk, slaaOppTrekkSync } from '@/utils/trekktabellLookup'
import type { BudgetCategory, BudgetLine } from '@/types/economy'
import { cn } from '@/lib/utils'

// ----------------------------------------------------------------
// Constants
// ----------------------------------------------------------------

const MONTH_SHORT = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Des']

const CATEGORY_GROUPS: { label: string; categories: BudgetCategory[] }[] = [
  { label: 'Inntekter', categories: ['lonn', 'tillegg', 'atf', 'feriepenger', 'annen_inntekt'] },
  { label: 'Trekk', categories: ['skatt', 'pensjon', 'fagforening', 'husleietrekk'] },
  { label: 'Skatteoppgjør', categories: ['skatteoppgjor'] },
  { label: 'Gjeld', categories: ['studielaan', 'billaan', 'kredittkort', 'annen_gjeld'] },
  { label: 'Faste utgifter', categories: ['bolig', 'forsikring', 'abonnement'] },
  { label: 'Variable utgifter', categories: ['mat', 'transport', 'helse', 'klær', 'fritid', 'annet_forbruk'] },
  { label: 'Sparing', categories: ['bsu', 'fond', 'krypto', 'buffer', 'annen_sparing'] },
]

const CATEGORY_LABELS: Record<BudgetCategory, string> = {
  lonn: 'Lønn', tillegg: 'Tillegg', atf: 'ATF', feriepenger: 'Feriepenger', annen_inntekt: 'Annen inntekt',
  skatt: 'Skatt', pensjon: 'Pensjon', fagforening: 'Fagforening', husleietrekk: 'Husleietrekk',
  skatteoppgjor: 'Skatteoppgjør',
  studielaan: 'Studielån', billaan: 'Billån', kredittkort: 'Kredittkort', annen_gjeld: 'Annen gjeld',
  bolig: 'Bolig', transport: 'Transport', mat: 'Mat', helse: 'Helse', abonnement: 'Abonnement',
  forsikring: 'Forsikring', klær: 'Klær', fritid: 'Fritid', annet_forbruk: 'Annet forbruk',
  bsu: 'BSU', fond: 'Fond', krypto: 'Krypto', buffer: 'Buffer', annen_sparing: 'Annen sparing',
}

function fmtNOK(n: number): string {
  if (n === 0) return '—'
  return Math.round(n).toLocaleString('no-NO')
}

function amountClass(n: number, bold = false): string {
  return cn(
    'tabular-nums',
    bold && 'font-semibold',
    n < 0 ? 'text-red-400' : n > 0 ? 'text-foreground' : 'text-muted-foreground',
  )
}

// ----------------------------------------------------------------
// BudgetPage
// ----------------------------------------------------------------

export function BudgetPage() {
  const {
    profile,
    budgetTemplate,
    monthHistory,
    atfEntries,
    savingsAccounts,
    debts,
    subscriptions,
    insurances,
    temporaryPayEntries,
    ivfTransactions,
    ivfSettings,
    fondPortfolio,
    lockMonth,
    unlockMonth,
    addBudgetLine,
    updateBudgetLine,
    removeBudgetLine,
    budgetOverrides,
    setBudgetOverride,
    clearBudgetOverride,
    _budgetUndoStack,
    undoBudget,
    addContribution,
    removeContribution,
    updateSavingsAccount: updateSavingsAccountInBudget,
    removeWithdrawal,
    absenceHireDate,
  } = useActiveEconomyStore()

  const now = new Date()
  const [activeYear, setActiveYear] = useState(now.getFullYear())
  const [selectedView, setSelectedView] = useState<'oversikt' | 'tabell'>('tabell')
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1)
  const [showSlipFor, setShowSlipFor] = useState<number | null>(null)
  const [addingLinePrefill, setAddingLinePrefill] = useState<Partial<BudgetLine> | null>(null)
  const [editingLine, setEditingLine] = useState<BudgetLine | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState<{ lineId: string; label: string } | null>(null)
  const [contribDialog, setContribDialog] = useState<{ accId: string; month: number } | null>(null)
  const [trekktabellLoaded, setTrekktabellLoaded] = useState(false)

  // Last trekktabelldata for brukerens tabellnummer inn i minne-cachen
  useEffect(() => {
    const tabellnummer = profile?.tabellnummer
    if (!tabellnummer) return
    const baseMonthly = (profile?.baseMonthly ?? 0)
    if (baseMonthly <= 0) return
    slaaOppTrekk(tabellnummer, Math.round(baseMonthly), 1)
      .then(() => setTrekktabellLoaded(true))
      .catch(() => { /* ignorer nettverksfeil — trekkrutinen brukes som fallback */ })
  }, [profile?.tabellnummer, profile?.baseMonthly])

  const trekktabellLookup = useMemo(() => {
    const tabellnummer = profile?.tabellnummer
    if (!trekktabellLoaded || !tabellnummer) return undefined
    return (grunnlag: number) => slaaOppTrekkSync(tabellnummer, grunnlag, 1) ?? undefined
  }, [trekktabellLoaded, profile?.tabellnummer])

  const canUndo = _budgetUndoStack.length > 0

  const handleUndo = useCallback(() => {
    if (canUndo) undoBudget()
  }, [canUndo, undoBudget])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        handleUndo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleUndo])
  const [highlightedMonth, setHighlightedMonth] = useState<number | null>(null)
  const [hideTemporary, setHideTemporary] = useState(false)
  

  const yearOverrides = useMemo(() => {
    const prefix = `${activeYear}:`
    const result: Record<string, number> = {}
    for (const [k, v] of Object.entries(budgetOverrides)) {
      if (k.startsWith(prefix)) result[k.slice(prefix.length)] = v
    }
    return result
  }, [budgetOverrides, activeYear])

  const juneForecast = profile
    ? forecastJune(activeYear, monthHistory, profile, atfEntries, temporaryPayEntries)
    : undefined

  const tableData = computeBudgetTable(
    activeYear,
    profile,
    budgetTemplate,
    monthHistory,
    atfEntries,
    savingsAccounts,
    debts,
    subscriptions,
    insurances,
    yearOverrides,
    temporaryPayEntries,
    juneForecast ?? undefined,
    hideTemporary,
    ivfTransactions,
    fondPortfolio,
    ivfSettings?.selfLabel,
    trekktabellLookup,
    absenceHireDate,
  )

  const { metas, sections } = tableData

  const COLLAPSIBLE_SECTIONS = new Set(['INNTEKTER', 'TREKK', 'FASTE', 'VARIABLE', 'GJELD', 'SPARING'])
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())

  function toggleSection(key: string) {
    setCollapsedSections((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // T-merking for manuelle budsjettlinjer (ikke tillegg/husleie — de er auto-styrt av toggle)
  const EXPENSE_CATS_SET = new Set([
    'bolig', 'transport', 'mat', 'helse', 'abonnement', 'forsikring', 'klær', 'fritid', 'annet_forbruk',
  ])
  const SAVINGS_CATS_SET = new Set(['bsu', 'fond', 'krypto', 'buffer', 'annen_sparing'])
  const INCOME_CATS_SET = new Set(['lonn', 'tillegg', 'atf', 'feriepenger', 'annen_inntekt'])
  const TREKK_CATS_SET = new Set(['skatt', 'pensjon', 'fagforening', 'husleietrekk'])
  const GJELD_CATS_SET = new Set(['studielaan', 'billaan', 'kredittkort', 'annen_gjeld'])

  // RowId-konvensjonen må matche computeBudgetTable
  function lineRowId(line: BudgetLine): string | null {
    if (line.category === 'skatteoppgjor') return `skattoppgjor-${line.id}`
    if (INCOME_CATS_SET.has(line.category)) return `income-${line.id}`
    if (TREKK_CATS_SET.has(line.category)) return `trekk-${line.id}`
    if (GJELD_CATS_SET.has(line.category)) return `debt-t-${line.id}`
    if (EXPENSE_CATS_SET.has(line.category)) return line.isVariable ? `var-${line.id}` : `exp-${line.id}`
    if (SAVINGS_CATS_SET.has(line.category)) return `sav-t-${line.id}`
    return null
  }

  // Alle manuelle (ikke-låste) rader: map fra rowId → lineId/linje for sletting/redigering
  const { deletableRowMap, editableRowMap } = useMemo(() => {
    const deletable: Record<string, string> = {}
    const editable: Record<string, BudgetLine> = {}
    for (const line of budgetTemplate.lines) {
      if (line.isLocked) continue
      const rowId = lineRowId(line)
      if (rowId) { deletable[rowId] = line.id; editable[rowId] = line }
    }
    return { deletableRowMap: deletable, editableRowMap: editable }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budgetTemplate.lines])
  const temporaryMap = useMemo(() => {
    const map: Record<string, { isTemporary: boolean; onToggle: () => void }> = {}
    for (const line of budgetTemplate.lines) {
      const rowId = lineRowId(line)
      if (!rowId || line.category === 'skatteoppgjor') continue
      const lineId = line.id
      map[rowId] = {
        isTemporary: !!line.isTemporary,
        onToggle: () => updateBudgetLine(lineId, { isTemporary: !line.isTemporary }),
      }
    }
    return map
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budgetTemplate.lines])

  function handleOverride(rowId: string, month: number, value: number | null) {
    if (value === null) clearBudgetOverride(activeYear, month, rowId)
    else setBudgetOverride(activeYear, month, rowId, value)
  }

  // Kun overrides på manuelle budsjettlinjer kan bakes inn i malen.
  // Overrides på beregnede rader (lønn, tillegg, skatt …) er varige og skal aldri slettes her.
  const hasUnsavedOverrides = Object.keys(yearOverrides).some((key) => {
    const rowId = key.slice(key.indexOf(':') + 1)
    return rowId in editableRowMap
  })

  function handleSaveBudget() {
    // Baker overrides inn i malen: oppdaterer linjenes basisverdi og fjerner yellow-merket
    const lineUpdates = new Map<string, number>()
    const toClear: [number, string][] = []

    for (const [key, value] of Object.entries(yearOverrides)) {
      const colonIdx = key.indexOf(':')
      const month = parseInt(key.slice(0, colonIdx))
      const rowId = key.slice(colonIdx + 1)
      const line = editableRowMap[rowId]
      if (!line) continue
      // Bruk første måneds verdi som ny basisverdi for linjen
      if (!lineUpdates.has(line.id)) {
        lineUpdates.set(line.id, value)
      }
      toClear.push([month, rowId])
    }

    for (const [lineId, amount] of lineUpdates) {
      updateBudgetLine(lineId, { amount })
    }
    for (const [month, rowId] of toClear) {
      clearBudgetOverride(activeYear, month, rowId)
    }
  }

  const minYear = monthHistory.length > 0
    ? Math.min(...monthHistory.map((m) => m.year))
    : now.getFullYear()

  const years = [activeYear - 1, activeYear, activeYear + 1].filter((y) => y >= minYear)

  // Total cols = 1 (label) + 12 × 2 (months) + 1 (årssum) = 26
  const TOTAL_COLS = 26

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ---- Top bar ---- */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border shrink-0 flex-wrap">
        {/* Year selector */}
        <div className="flex gap-1 shrink-0">
          {years.map((y) => (
            <Button
              key={y}
              variant={activeYear === y ? 'default' : 'outline'}
              size="sm"
              className="text-xs h-7 px-2.5"
              onClick={() => setActiveYear(y)}
            >
              {y}
            </Button>
          ))}
        </div>

        {/* Divider */}
        <div className="h-5 w-px bg-border shrink-0" />

        {/* Month pills */}
        <div className="flex gap-0.5 flex-wrap">
          {metas.map((meta) => (
            <button
              key={meta.month}
              onClick={() => setSelectedMonth(meta.month)}
              className={cn(
                'relative flex items-center gap-1 text-[11px] px-2 py-1 rounded-md transition-colors',
                selectedMonth === meta.month
                  ? 'bg-primary text-primary-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/40',
              )}
            >
              {MONTH_SHORT[meta.month]}
              {(meta.hasSlip || meta.isLocked) && (
                <span className={cn(
                  'h-1 w-1 rounded-full',
                  selectedMonth === meta.month ? 'bg-primary-foreground/70' : 'bg-green-500/70',
                )} />
              )}
            </button>
          ))}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* View toggle */}
        <div className="flex gap-0.5 bg-muted/40 rounded-md p-0.5">
          <button
            onClick={() => setSelectedView('oversikt')}
            className={cn(
              'flex items-center gap-1 text-[11px] px-2.5 py-1 rounded transition-colors',
              selectedView === 'oversikt'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <LayoutDashboard className="h-3 w-3" /> Oversikt
          </button>
          <button
            onClick={() => setSelectedView('tabell')}
            className={cn(
              'flex items-center gap-1 text-[11px] px-2.5 py-1 rounded transition-colors',
              selectedView === 'tabell'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Table2 className="h-3 w-3" /> Tabell
          </button>
        </div>

        {/* Action buttons */}
        {selectedView === 'tabell' && (
          <>
            <Button
              variant={hideTemporary ? 'default' : 'outline'}
              size="sm"
              className="text-xs h-7 gap-1"
              onClick={() => setHideTemporary(!hideTemporary)}
              title="Skjul tidsbegrensede tillegg"
            >
              {hideTemporary ? 'Uten tillegg' : 'Med tillegg'}
            </Button>
          </>
        )}
        {hasUnsavedOverrides && (
          <Button
            size="sm"
            className="text-xs h-7 gap-1 bg-amber-500/15 text-amber-400 border border-amber-500/40 hover:bg-amber-500/25 hover:text-amber-300"
            onClick={handleSaveBudget}
            title="Bekreft endringer og fjern gul markering"
          >
            Lagre endringer
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          className="text-xs h-7 gap-1"
          onClick={handleUndo}
          disabled={!canUndo}
          title="Angre (⌘Z)"
        >
          <Undo2 className="h-3.5 w-3.5" />
          Angre
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="text-xs h-7 gap-1"
          onClick={() => setAddingLinePrefill({})}
        >
          <Plus className="h-3 w-3" /> Ny linje
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="text-xs h-7 gap-1"
          onClick={() => setShowSlipFor(selectedMonth)}
        >
          <Upload className="h-3 w-3" /> Last opp slipp
        </Button>
      </div>

      {/* ---- Oversikt view ---- */}
      {selectedView === 'oversikt' && (
        <OversiktView
          sections={sections}
          metas={metas}
          selectedMonth={selectedMonth}
          activeYear={activeYear}
        />
      )}

      {/* ---- Tabell view ---- */}
      {selectedView === 'tabell' && (
      <div className="overflow-auto flex-1">
        <table className="text-xs border-separate border-spacing-0 min-w-max">
          {/* === HEADER === */}
          <thead className="sticky top-0 z-30 bg-muted [&_th]:bg-muted">
            {/* Row 1: Month names (each spans 2 cols) */}
            <tr className="bg-muted border-b border-border">
              <th className="sticky left-0 z-40 bg-muted px-3 py-2 text-left font-medium w-[180px] min-w-[180px] border-r border-border">
                Post
              </th>
              {metas.map((meta) => (
                <th
                  key={meta.month}
                  colSpan={2}
                  className={cn(
                    'px-2 py-2 text-right font-medium min-w-[96px] border-r border-border/40',
                    highlightedMonth === meta.month && 'bg-sky-500/15',
                  )}
                >
                  <div className="flex items-center justify-end gap-1">
                    <button
                      className={cn(
                        'hover:text-sky-400 transition-colors',
                        highlightedMonth === meta.month && 'text-sky-400',
                      )}
                      onClick={() => setHighlightedMonth(highlightedMonth === meta.month ? null : meta.month)}
                    >
                      {MONTH_SHORT[meta.month]}
                    </button>
                    {meta.isLocked ? (
                      <button
                        title="Lås opp måned"
                        onClick={() => unlockMonth(activeYear, meta.month)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <Lock className="h-2.5 w-2.5" />
                      </button>
                    ) : (
                      <button
                        title="Last opp lønnsslipp"
                        onClick={() => setShowSlipFor(meta.month)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <LockOpen className="h-2.5 w-2.5" />
                      </button>
                    )}
                  </div>
                </th>
              ))}
              <th className="px-3 py-2 text-right font-medium min-w-[80px]">Årssum</th>
            </tr>

            {/* Row 2: Sub-headers (Bud | Fak or Prog) */}
            <tr className="bg-muted border-b border-border">
              <th className="sticky left-0 z-40 bg-muted px-3 py-1 w-[180px] min-w-[180px] border-r border-border" />
              {metas.map((meta) => (
                meta.hasSlip ? (
                  <th
                    key={`${meta.month}-fak`}
                    colSpan={2}
                    className={cn('px-2 py-1 text-right font-normal min-w-[96px] border-r border-border/40', highlightedMonth === meta.month && 'bg-sky-500/15')}
                  >
                    Faktisk
                  </th>
                ) : (
                  <th
                    key={`${meta.month}-prog`}
                    colSpan={2}
                    className={cn(
                      'px-2 py-1 text-right font-normal min-w-[96px] border-r border-border/40',
                      meta.isLocked ? 'text-foreground' : 'text-muted-foreground italic',
                      highlightedMonth === meta.month && 'bg-sky-500/15',
                    )}
                  >
                    {meta.isLocked ? 'Faktisk' : 'Prog'}
                  </th>
                )
              ))}
              <th className="px-3 py-1 text-right text-muted-foreground font-normal">År</th>
            </tr>
          </thead>

          {/* === BODY === */}
          <tbody>
            {sections.map((section) => {
              const isReadOnly = section.key === 'NETTO' || section.key === 'BUNN' || section.key === 'OPPSUMMERING'
              const SECTION_ADD_PREFILL: Record<string, Partial<BudgetLine>> = {
                INNTEKTER:     { category: 'annen_inntekt' },
                TREKK:         { category: 'skatt' },
                SKATTEOPPGJOR: { category: 'skatteoppgjor', isRecurring: false, label: `Skattetilgode ${activeYear - 1}` },
                FASTE:         { category: 'annet_forbruk', isVariable: false },
                VARIABLE:      { category: 'annet_forbruk', isVariable: true },
                GJELD:         { category: 'annen_gjeld' },
                SPARING:       { category: 'annen_sparing' },
              }
              const isCollapsible = COLLAPSIBLE_SECTIONS.has(section.key)
              const isCollapsed = collapsedSections.has(section.key)
              const hideHeader = false

              return (
                <>
                  {/* Seksjonsoverskrift */}
                  {!hideHeader && (
                    <tr key={`sh-${section.key}`} className="border-t-2 border-border/60 bg-muted/15">
                      <td
                        className={cn(
                          'sticky left-0 z-10 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest border-r border-border bg-muted',
                          section.colorClass,
                          isCollapsible && 'cursor-pointer select-none hover:bg-muted/30',
                        )}
                        onClick={isCollapsible ? () => toggleSection(section.key) : undefined}
                      >
                        <span className="flex items-center gap-2">
                          {isCollapsible && (
                            isCollapsed
                              ? <ChevronRight className="h-3 w-3 shrink-0" />
                              : <ChevronDown className="h-3 w-3 shrink-0" />
                          )}
                          {!isCollapsible && !isReadOnly && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setAddingLinePrefill(SECTION_ADD_PREFILL[section.key] ?? {}) }}
                              className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
                              title={`Legg til rad i ${section.label}`}
                            ><Plus className="h-3 w-3" /></button>
                          )}
                          {section.label}
                          {isCollapsed && (
                            <span className="ml-1 text-muted-foreground font-normal normal-case tracking-normal">
                              ({section.rows.length} rader)
                            </span>
                          )}
                        </span>
                      </td>
                      {isCollapsed
                        ? metas.map((meta) => {
                            // Sumrader (isBold) ekskluderes — ellers dobbelttelles seksjonen
                            const sum = section.rows.reduce((acc, row) => {
                              if (row.isBold) return acc
                              const cell = row.cells[meta.month - 1]
                              const val = cell?.actual ?? cell?.budget ?? 0
                              return acc + val
                            }, 0)
                            return (
                              <td
                                key={meta.month}
                                colSpan={2}
                                className={cn(
                                  'px-2 py-1 text-right text-xs tabular-nums border-r border-border/40',
                                  sum < 0 ? 'text-red-400' : sum > 0 ? 'text-green-400' : 'text-muted-foreground/40',
                                  highlightedMonth === meta.month && 'bg-sky-500/15',
                                )}
                              >
                                {sum !== 0 ? sum.toLocaleString('no-NO') : '—'}
                              </td>
                            )
                          })
                        : <td colSpan={TOTAL_COLS - 2} />
                      }
                      {isCollapsed && (
                        <td className="px-3 py-1 text-right text-xs tabular-nums border-l border-border/40 text-muted-foreground">
                          {section.rows.reduce((acc, row) => {
                            if (row.isBold) return acc
                            const annual = row.cells.reduce((s, cell) => s + (cell?.actual ?? cell?.budget ?? 0), 0)
                            return acc + annual
                          }, 0).toLocaleString('no-NO')}
                        </td>
                      )}
                    </tr>
                  )}

                  {/* Datarader — skjules når kollapsert */}
                  {!isCollapsed && section.rows.map((row) => {
                    // Sparekonto-rader: celle-input oppretter ekte innskudd på kontoen
                    // (synlig i Sparing-fanen) i stedet for et budsjett-override.
                    const savingsAccId = row.id.startsWith('sav-') && !row.id.startsWith('sav-t-')
                      ? row.id.slice(4)
                      : null
                    return (
                    <DataRow
                      key={row.id}
                      row={row}
                      metas={metas}
                      dualColumn={section.dualColumn}
                      isEditable={!isReadOnly && !row.isBold}
                      yearOverrides={yearOverrides}
                      onOverride={(month, value) => handleOverride(row.id, month, value)}
                      onCopyForward={savingsAccId ? undefined : (fromMonth, value) => {
                        for (let m = fromMonth; m <= 12; m++) handleOverride(row.id, m, value)
                      }}
                      onDeposit={savingsAccId
                        ? (month, amount) => {
                            const now = new Date()
                            const day = activeYear === now.getFullYear() && month === now.getMonth() + 1
                              ? now.getDate() : 1
                            addContribution(savingsAccId, {
                              id: crypto.randomUUID(),
                              date: `${activeYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
                              amount,
                              note: 'Lagt inn fra budsjettet',
                            })
                          }
                        : undefined}
                      highlightedMonth={highlightedMonth}
                      temporaryInfo={temporaryMap[row.id]}
                      onEdit={editableRowMap[row.id]
                        ? () => setEditingLine(editableRowMap[row.id])
                        : undefined}
                      onDelete={deletableRowMap[row.id]
                        ? () => setConfirmingDelete({ lineId: deletableRowMap[row.id], label: row.label })
                        : undefined}
                      onActualCellClick={savingsAccId
                        ? (month) => setContribDialog({ accId: savingsAccId, month })
                        : undefined}
                    />
                    )
                  })}

                  {/* "+ Legg til"-knapp under seksjonen når utvidet */}
                  {!isCollapsed && !isReadOnly && isCollapsible && (
                    <tr className="border-b border-border/10">
                      <td className="sticky left-0 z-10 bg-background border-r border-border px-3 py-0.5">
                        <button
                          onClick={() => setAddingLinePrefill(SECTION_ADD_PREFILL[section.key] ?? {})}
                          className="flex items-center gap-1 text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                        >
                          <Plus className="h-2.5 w-2.5" /> Legg til
                        </button>
                      </td>
                      <td colSpan={TOTAL_COLS - 2} />
                    </tr>
                  )}
                </>
              )
            })}
          </tbody>
        </table>
      </div>
      )}

      {/* ---- Payslip modal ---- */}
      <Dialog open={showSlipFor !== null} onOpenChange={(open) => { if (!open) setShowSlipFor(null) }}>
        <DialogContent className="max-w-lg space-y-4">
          <DialogHeader>
            <DialogTitle>
              Last opp lønnsslipp — {showSlipFor != null ? `${MONTH_SHORT[showSlipFor]} ${activeYear}` : ''}
            </DialogTitle>
          </DialogHeader>
          {showSlipFor != null && <PayslipImporter onImported={() => setShowSlipFor(null)} />}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (showSlipFor != null && !monthHistory.find((m) => m.year === activeYear && m.month === showSlipFor)) {
                  lockMonth(activeYear, showSlipFor)
                }
                setShowSlipFor(null)
              }}
            >
              <Lock className="h-3 w-3 mr-1" /> Lås uten slipp
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowSlipFor(null)}>Avbryt</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ---- Edit budget line modal ---- */}
      {editingLine && (
        <AddBudgetLineModal
          activeYear={activeYear}
          prefill={editingLine}
          editMode
          onSave={(saved) => {
            updateBudgetLine(editingLine.id, {
              label: saved.label,
              category: saved.category,
              amount: saved.amount,
              isRecurring: saved.isRecurring,
              isVariable: saved.isVariable,
              isTemporary: saved.isTemporary,
              temporaryFromDate: saved.temporaryFromDate,
              temporaryToDate: saved.temporaryToDate,
              specificMonth: saved.specificMonth,
              specificYear: saved.specificYear,
              periodOverride: saved.periodOverride,
            })
            setEditingLine(null)
          }}
          onCancel={() => setEditingLine(null)}
        />
      )}

      {/* ---- Add budget line modal ---- */}
      {addingLinePrefill !== null && (
        <AddBudgetLineModal
          activeYear={activeYear}
          prefill={addingLinePrefill}
          onSave={(line) => { addBudgetLine(line); setAddingLinePrefill(null) }}
          onCancel={() => setAddingLinePrefill(null)}
        />
      )}

      {/* ---- Bekreft sletting ---- */}
      {confirmingDelete && (
        <Dialog open onOpenChange={(open) => { if (!open) setConfirmingDelete(null) }}>
          <DialogContent className="max-w-xs">
            <DialogHeader>
              <DialogTitle>Fjern rad</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Er du sikker på at du vil fjerne <span className="font-medium text-foreground">«{confirmingDelete.label}»</span>?
            </p>
            <div className="flex gap-2 justify-end pt-1">
              <Button variant="outline" size="sm" onClick={() => setConfirmingDelete(null)}>Avbryt</Button>
              <Button variant="destructive" size="sm" onClick={() => {
                removeBudgetLine(confirmingDelete.lineId)
                setConfirmingDelete(null)
              }}>Fjern</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}


      {/* Contributions dialog for savings rows */}
      {contribDialog && (() => {
        const acc = savingsAccounts.find(a => a.id === contribDialog.accId)
        if (!acc) return null
        const allContribs = [...(acc.contributions ?? [])].sort((a, b) => b.date.localeCompare(a.date))
        const allWithdrawals = [...(acc.withdrawals ?? [])].sort((a, b) => b.date.localeCompare(a.date))
        const allPeriods = [...(acc.contributionPeriods ?? [])].sort((a, b) =>
          (b.fromDate ?? '').localeCompare(a.fromDate ?? ''))
        const isEmpty = allContribs.length === 0 && allWithdrawals.length === 0 && allPeriods.length === 0
        return (
          <Dialog open onOpenChange={() => setContribDialog(null)}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle className="text-sm">{acc.label}</DialogTitle>
              </DialogHeader>
              {isEmpty ? (
                <p className="text-xs text-muted-foreground italic">Ingen registrerte innskudd eller perioder.</p>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {allPeriods.length > 0 && (
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Spareperioder</p>
                  )}
                  {allPeriods.map(p => (
                    <div key={p.id} className="flex items-center justify-between gap-3 rounded border border-border bg-muted/10 px-3 py-2">
                      <div className="min-w-0 text-xs">
                        <span className="font-mono font-medium">{Math.round(p.amount).toLocaleString('no-NO')} kr/mnd</span>
                        <span className="text-muted-foreground ml-2 text-[10px]">
                          {p.fromDate ? p.fromDate.slice(0, 7) : 'start'} → {p.toDate ? p.toDate.slice(0, 7) : 'ingen slutt'}
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          updateSavingsAccountInBudget(acc.id, {
                            contributionPeriods: (acc.contributionPeriods ?? []).filter(x => x.id !== p.id),
                          })
                          setContribDialog(null)
                        }}
                        className="shrink-0 text-muted-foreground hover:text-red-400 transition-colors"
                        title="Slett periode"
                      ><X className="h-4 w-4" /></button>
                    </div>
                  ))}
                  {allWithdrawals.length > 0 && (
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide pt-1">Uttak</p>
                  )}
                  {allWithdrawals.map(w => (
                    <div key={w.id} className="flex items-center justify-between gap-3 rounded border border-border bg-muted/10 px-3 py-2">
                      <div className="min-w-0 text-xs">
                        <span className="font-mono font-medium">{Math.abs(w.amount).toLocaleString('no-NO')} kr</span>
                        <span className="text-muted-foreground ml-2">{w.date}</span>
                        {w.note && <p className="text-muted-foreground text-[11px] mt-0.5">{w.note}</p>}
                      </div>
                      <button
                        onClick={() => { removeWithdrawal(acc.id, w.id); setContribDialog(null) }}
                        className="shrink-0 text-muted-foreground hover:text-red-400 transition-colors"
                        title="Slett uttak"
                      ><X className="h-4 w-4" /></button>
                    </div>
                  ))}
                  {allContribs.length > 0 && (
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide pt-1">Enkeltinnskudd</p>
                  )}
                  {allContribs.map(c => (
                    <div key={c.id} className="flex items-center justify-between gap-3 rounded border border-border bg-muted/10 px-3 py-2">
                      <div className="min-w-0 text-xs">
                        <span className="font-mono font-medium">{c.amount.toLocaleString('no-NO')} kr</span>
                        <span className="text-muted-foreground ml-2">{c.date}</span>
                        {c.note && <p className="text-muted-foreground text-[11px] mt-0.5">{c.note}</p>}
                      </div>
                      <button
                        onClick={() => { removeContribution(acc.id, c.id); setContribDialog(null) }}
                        className="shrink-0 text-muted-foreground hover:text-red-400 transition-colors"
                        title="Slett"
                      ><X className="h-4 w-4" /></button>
                    </div>
                  ))}
                </div>
              )}
            </DialogContent>
          </Dialog>
        )
      })()}
    </div>
  )
}

// ----------------------------------------------------------------
// OversiktView
// ----------------------------------------------------------------

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg - 90) * Math.PI / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function DonutChart({ segments }: { segments: { value: number; color: string; label: string }[] }) {
  const total = segments.reduce((s, g) => s + g.value, 0)
  if (total <= 0) return null
  const cx = 50, cy = 50, outerR = 44, innerR = 28
  let cumAngle = 0
  const paths = segments
    .filter(s => s.value > 0)
    .map(seg => {
      const pct = seg.value / total
      const start = cumAngle * 360
      cumAngle += pct
      const end = cumAngle * 360
      const oStart = polarToCartesian(cx, cy, outerR, start)
      const oEnd = polarToCartesian(cx, cy, outerR, end)
      const iStart = polarToCartesian(cx, cy, innerR, end)
      const iEnd = polarToCartesian(cx, cy, innerR, start)
      const large = pct > 0.5 ? 1 : 0
      const d = `M${oStart.x.toFixed(2)} ${oStart.y.toFixed(2)} A${outerR} ${outerR} 0 ${large} 1 ${oEnd.x.toFixed(2)} ${oEnd.y.toFixed(2)} L${iStart.x.toFixed(2)} ${iStart.y.toFixed(2)} A${innerR} ${innerR} 0 ${large} 0 ${iEnd.x.toFixed(2)} ${iEnd.y.toFixed(2)} Z`
      return { d, color: seg.color, label: seg.label, pct }
    })
  return (
    <svg viewBox="0 0 100 100" className="w-28 h-28">
      {paths.map((p, i) => <path key={i} d={p.d} fill={p.color} />)}
    </svg>
  )
}

function OversiktView({
  sections,
  metas,
  selectedMonth,
  activeYear,
}: {
  sections: ReturnType<typeof computeBudgetTable>['sections']
  metas: MonthMeta[]
  selectedMonth: number
  activeYear: number
}) {
  const mi = selectedMonth - 1
  const meta = metas[mi]

  function getVal(row: BudgetRow): number {
    const cell = row.cells[mi]
    if (!cell) return 0
    return (meta?.hasSlip || meta?.isLocked) ? (cell.actual ?? cell.budget) : cell.budget
  }

  // Netto inn
  const nettoSection = sections.find(s => s.key === 'NETTO')
  const nettoRow = nettoSection?.rows.find(r => r.isBold)
  const nettoInn = nettoRow ? getVal(nettoRow) : 0

  // BUNN: overskudd
  const bunnSection = sections.find(s => s.key === 'BUNN')
  const overskuddRow = bunnSection?.rows.find(r => r.id === 'overskudd')
  const ledig = overskuddRow ? getVal(overskuddRow) : 0

  // Expenses
  const fasteRows = sections.find(s => s.key === 'FASTE')?.rows.filter(r => !r.isBold) ?? []
  const varRows = sections.find(s => s.key === 'VARIABLE')?.rows.filter(r => !r.isBold) ?? []
  const sparingRows = sections.find(s => s.key === 'SPARING')?.rows.filter(r => !r.isBold && !r.isCumulative) ?? []
  const gjeldRows = sections.find(s => s.key === 'GJELD')?.rows.filter(r => !r.isBold) ?? []

  const totalUtgifter = [...fasteRows, ...varRows].reduce((s, r) => s + Math.abs(getVal(r)), 0)
  const totalSparing = sparingRows.reduce((s, r) => s + Math.abs(getVal(r)), 0)
  const totalGjeld = gjeldRows.reduce((s, r) => s + Math.abs(getVal(r)), 0)
  const sparerate = nettoInn > 0 ? totalSparing / nettoInn : 0

  // 12-month netto bar chart
  const nettoByMonth = metas.map((m, i) => {
    if (!nettoRow) return 0
    const cell = nettoRow.cells[i]
    if (!cell) return 0
    return (m.hasSlip || m.isLocked) ? (cell.actual ?? cell.budget) : cell.budget
  })
  const maxNetto = Math.max(...nettoByMonth.map(Math.abs), 1)

  // Category group totals
  const categoryGroups = useMemo(() => {
    const groupTotals: { label: string; budget: number; actual: number | null }[] = [
      { label: 'Faste utgifter', budget: 0, actual: null },
      { label: 'Variable utgifter', budget: 0, actual: null },
      { label: 'Gjeld', budget: 0, actual: null },
      { label: 'Sparing', budget: 0, actual: null },
    ]

    function addToGroup(label: string, budget: number, actual: number | null) {
      const g = groupTotals.find(x => x.label === label)
      if (!g) return
      g.budget += budget
      if (actual !== null) g.actual = (g.actual ?? 0) + actual
    }

    for (const row of fasteRows) {
      const cell = row.cells[mi]
      if (!cell) continue
      addToGroup('Faste utgifter', Math.abs(cell.budget), cell.actual !== null ? Math.abs(cell.actual) : null)
    }
    for (const row of varRows) {
      const cell = row.cells[mi]
      if (!cell) continue
      addToGroup('Variable utgifter', Math.abs(cell.budget), cell.actual !== null ? Math.abs(cell.actual) : null)
    }
    for (const row of gjeldRows) {
      const cell = row.cells[mi]
      if (!cell) continue
      addToGroup('Gjeld', Math.abs(cell.budget), cell.actual !== null ? Math.abs(cell.actual) : null)
    }
    for (const row of sparingRows) {
      const cell = row.cells[mi]
      if (!cell) continue
      addToGroup('Sparing', Math.abs(cell.budget), cell.actual !== null ? Math.abs(cell.actual) : null)
    }

    return groupTotals.filter(g => g.budget > 0 || (g.actual ?? 0) > 0)
  }, [sections, mi, fasteRows, varRows, gjeldRows, sparingRows])

  const maxCatBudget = Math.max(...categoryGroups.map(g => Math.max(g.budget, g.actual ?? 0)), 1)

  // Donut segments
  const donutSegments = [
    { value: totalUtgifter, color: '#3b82f6', label: 'Utgifter' },
    { value: totalGjeld, color: '#f97316', label: 'Gjeld' },
    { value: totalSparing, color: '#22c55e', label: 'Sparing' },
    { value: Math.max(0, ledig), color: '#6b7280', label: 'Ledig' },
  ]

  const monthName = ['Januar', 'Februar', 'Mars', 'April', 'Mai', 'Juni',
    'Juli', 'August', 'September', 'Oktober', 'November', 'Desember'][selectedMonth - 1]

  function fmt(n: number): string {
    if (n === 0) return '—'
    return Math.round(n).toLocaleString('no-NO')
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left panel */}
      <div className="w-[260px] shrink-0 border-r border-border overflow-y-auto p-4 space-y-4">
        {/* Header */}
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Månedsoppsummering</p>
          <p className="text-base font-semibold mt-0.5">{monthName} {activeYear}</p>
          {meta && (meta.hasSlip || meta.isLocked) && (
            <span className="text-[10px] bg-green-500/15 text-green-400 px-1.5 py-0.5 rounded-sm">Faktisk</span>
          )}
          {meta && !meta.hasSlip && !meta.isLocked && (
            <span className="text-[10px] bg-muted/40 text-muted-foreground px-1.5 py-0.5 rounded-sm italic">Prognose</span>
          )}
        </div>

        {/* Key metrics */}
        <div className="space-y-2.5">
          <MetricRow label="Netto inn" value={fmt(nettoInn)} color={nettoInn >= 0 ? 'text-green-400' : 'text-red-400'} bold />
          <MetricRow label="Utgifter" value={`−${fmt(totalUtgifter)}`} color="text-blue-400" />
          <MetricRow label="Gjeld" value={`−${fmt(totalGjeld)}`} color="text-orange-400" />
          <MetricRow label="Sparing" value={`−${fmt(totalSparing)}`} color="text-purple-400" />
          <div className="border-t border-border/40 pt-2">
            <MetricRow
              label="Ledig"
              value={fmt(ledig)}
              color={ledig >= 0 ? 'text-foreground' : 'text-red-400'}
              bold
            />
            {nettoInn > 0 && (
              <MetricRow
                label="Sparerate"
                value={`${(sparerate * 100).toFixed(0)} %`}
                color="text-muted-foreground"
              />
            )}
          </div>
        </div>

        {/* 12-month netto mini chart */}
        <div className="rounded-lg border border-border/40 bg-muted/10 p-3">
          <p className="text-[10px] text-muted-foreground mb-2 uppercase tracking-wide">Netto siste 12 mnd</p>
          <div className="flex items-end gap-0.5 h-10">
            {nettoByMonth.map((val, i) => {
              const meta = metas[i]
              const hasData = meta?.hasSlip || meta?.isLocked
              const h = Math.max(2, (Math.abs(val) / maxNetto) * 40)
              const isSelected = i === mi
              return (
                <div
                  key={i}
                  className="flex-1 rounded-sm transition-colors cursor-pointer"
                  style={{
                    height: `${h}px`,
                    background: isSelected
                      ? 'hsl(var(--primary))'
                      : hasData
                        ? val >= 0 ? 'hsl(142 76% 36% / 0.7)' : 'hsl(0 84% 60% / 0.6)'
                        : 'hsl(215 20.2% 28%)',
                  }}
                  title={`${MONTH_SHORT[i + 1]}: ${fmt(val)}`}
                />
              )
            })}
          </div>
          <div className="flex justify-between text-[9px] text-muted-foreground mt-1">
            <span>Jan</span><span>Des</span>
          </div>
        </div>

        {/* Sparing breakdown */}
        {sparingRows.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Sparing denne måneden</p>
            {sparingRows.map(row => {
              const v = Math.abs(getVal(row))
              if (v === 0) return null
              return (
                <div key={row.id} className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground truncate">{row.label}</span>
                  <span className="font-mono text-purple-400">{fmt(v)}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Right panel */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Category bars */}
        <div className="rounded-xl border border-border/50 bg-card/60 px-4 py-3 space-y-3">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
            Utgiftskategorier
          </p>
          {categoryGroups.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">Ingen utgifter budsjettert.</p>
          ) : (
            <div className="space-y-3">
              {categoryGroups.map(g => {
                const budgetPct = g.budget / maxCatBudget
                const actualPct = g.actual !== null ? g.actual / maxCatBudget : null
                const overrun = g.actual !== null && g.actual > g.budget
                const isSaving = g.label === 'Sparing'
                // Sparing: overskridelse er bra (grønn). Utgifter: overskridelse er dårlig (rød).
                const overrunColor = isSaving ? 'text-green-400' : 'text-red-400'
                const overrunBg = isSaving ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
                const barColor = overrun ? (isSaving ? 'bg-green-400' : 'bg-red-400') : (isSaving ? 'bg-green-500' : 'bg-blue-500')
                return (
                  <div key={g.label} className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-muted-foreground">{g.label}</span>
                      <div className="flex items-center gap-2">
                        {g.actual !== null ? (
                          <>
                            <span className={cn('font-mono', overrun ? overrunColor : 'text-foreground')}>
                              {fmt(g.actual)}
                            </span>
                            <span className="text-muted-foreground/50">/</span>
                            <span className="font-mono text-muted-foreground">{fmt(g.budget)}</span>
                            {overrun && (
                              <span className={cn('text-[9px] px-1 py-0.5 rounded-sm leading-none', overrunBg)}>
                                +{fmt(g.actual - g.budget)}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="font-mono text-muted-foreground italic">{fmt(g.budget)}</span>
                        )}
                      </div>
                    </div>
                    {/* Bar */}
                    <div className="relative h-1.5 rounded-full bg-muted/30">
                      <div
                        className={cn('absolute inset-y-0 left-0 rounded-full', isSaving ? 'bg-green-500/30' : 'bg-blue-500/40')}
                        style={{ width: `${budgetPct * 100}%` }}
                      />
                      {actualPct !== null && (
                        <div
                          className={cn('absolute inset-y-0 left-0 rounded-full', barColor)}
                          style={{ width: `${actualPct * 100}%` }}
                        />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Donut chart */}
        {nettoInn > 0 && (
          <div className="rounded-xl border border-border/50 bg-card/60 px-4 py-3">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Fordeling av netto lønn
            </p>
            <div className="flex items-center gap-6">
              <DonutChart segments={donutSegments} />
              <div className="space-y-1.5">
                {donutSegments.filter(s => s.value > 0).map((s) => (
                  <div key={s.label} className="flex items-center gap-2 text-[11px]">
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: s.color }} />
                    <span className="text-muted-foreground">{s.label}</span>
                    <span className="font-mono ml-auto">
                      {((s.value / nettoInn) * 100).toFixed(0)}%
                    </span>
                    <span className="font-mono text-muted-foreground/60 text-[10px]">
                      {fmt(s.value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* No data hint */}
        {nettoInn === 0 && totalUtgifter === 0 && (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
            <p className="text-sm text-muted-foreground">
              Last opp en lønnsslipp eller sett opp lønnsprofil for å se oversikt.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function MetricRow({ label, value, color, bold }: { label: string; value: string; color: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between text-[12px]">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('font-mono', color, bold && 'font-semibold text-[13px]')}>{value}</span>
    </div>
  )
}

// ----------------------------------------------------------------
// DataRow component
// ----------------------------------------------------------------

function DataRow({
  row,
  metas,
  dualColumn,
  isEditable = false,
  yearOverrides,
  onOverride,
  highlightedMonth,
  temporaryInfo,
  onEdit,
  onDelete,
  onCopyForward,
  onActualCellClick,
  onDeposit,
}: {
  row: BudgetRow
  metas: MonthMeta[]
  dualColumn: boolean
  isEditable?: boolean
  yearOverrides?: Record<string, number>
  onOverride?: (month: number, value: number | null) => void
  highlightedMonth?: number | null
  temporaryInfo?: { isTemporary: boolean; onToggle: () => void }
  onEdit?: () => void
  onDelete?: () => void
  onCopyForward?: (fromMonth: number, value: number) => void
  onActualCellClick?: (month: number) => void
  /** Sparekonto-rader: opprett innskudd (positivt beløp) i stedet for budsjett-override */
  onDeposit?: (month: number, amount: number) => void
}) {
  const [editingMonth, setEditingMonth] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')

  function startEdit(month: number, val: number) {
    setEditingMonth(month)
    setEditValue(String(Math.round(val)))
  }
  function commitEdit() {
    if (editingMonth === null) return
    const v = parseFloat(editValue)
    if (!isNaN(v)) {
      if (onDeposit) {
        if (Math.abs(v) > 0) onDeposit(editingMonth, Math.abs(v))
      } else {
        onOverride?.(editingMonth, v)
      }
    }
    setEditingMonth(null)
  }
  function cancelEdit() { setEditingMonth(null) }

  const hasAnyNonZero = row.cells.some((c) => c.budget !== 0 || c.actual !== null)
  if (!hasAnyNonZero) return null

  // Årssum som reflekterer nøyaktig hva som vises per celle
  const displayAnnualSum = row.isCumulative
    // YTD-rader: årssum = desember-verdi (= full årstotal)
    ? (() => {
        const decMeta = metas[11]
        const decCell = row.cells[11]
        if (!decMeta || !decCell) return 0
        if (decMeta.hasSlip) return decCell.actual ?? decCell.budget
        if (decMeta.isLocked) return decCell.actual ?? decCell.budget
        return decCell.budget
      })()
    : metas.reduce((s, meta) => {
        const cell = row.cells[meta.month - 1]
        const overrideKey = `${meta.month}:${row.id}`
        const hasOverride = yearOverrides && overrideKey in yearOverrides
        if (dualColumn) {
          // Dual-column: actual alltid prioritert (som i celle-visningen)
          if (meta.hasSlip || cell.actual !== null) return s + (cell.actual ?? 0)
          if (hasOverride) return s + yearOverrides![overrideKey]
          if (meta.isLocked) return s + (cell.actual ?? cell.budget)
          return s + cell.budget
        }
        // Enkelt-kolonne: override vinner, så budsjett
        if (hasOverride) return s + yearOverrides![overrideKey]
        return s + cell.budget
      }, 0)

  // Kumulative rader (YTD): alltid positiv farge, uten avviksmarkering
  if (row.isCumulative) {
    return (
      <tr className="border-b border-border/20 hover:bg-muted/10">
        <td className="sticky left-0 z-10 bg-background px-3 py-1.5 border-r border-border w-[180px] text-muted-foreground text-xs" title={row.label}>
          {row.label}
        </td>
        {metas.map((meta) => {
          const cell = row.cells[meta.month - 1]
          const hl = highlightedMonth === meta.month
          if (meta.hasSlip) {
            return (
              <td key={`${meta.month}-a`} colSpan={2}
                className={cn('px-2 py-1.5 text-right border-r border-border/40 tabular-nums text-xs font-medium', hl && 'bg-sky-500/15')}
              >
                {fmtNOK(cell.actual ?? cell.budget)}
              </td>
            )
          }
          return (
            <td
              key={`${meta.month}-p`}
              colSpan={2}
              className={cn('px-2 py-1.5 text-right border-r border-border/40 tabular-nums text-xs italic text-muted-foreground', hl && 'bg-sky-500/15')}
            >
              {fmtNOK(cell.budget)}
            </td>
          )
        })}
        <td className="px-3 py-1.5 text-right font-medium border-l border-border/40 tabular-nums text-xs text-muted-foreground">
          {fmtNOK(displayAnnualSum)}
        </td>
      </tr>
    )
  }

  const isHidden = !!row.isHidden

  return (
    <tr className={cn(
      'border-b hover:bg-muted/10 group/row',
      row.isBold ? 'border-border/60 bg-muted/20' : 'border-border/20',
      isHidden && 'opacity-40',
    )}>
      <td className={cn(
        'sticky left-0 z-10 bg-background px-3 py-1.5 border-r border-border w-[180px]',
        row.isBold ? 'font-bold bg-muted text-[11px] uppercase tracking-wide' : '',
      )}>
        <span className="flex items-center justify-between gap-1">
          <span className={cn('flex items-center gap-1', isHidden && 'line-through')}>
            <span title={row.label}>{row.label}</span>
          </span>
          <span className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover/row:opacity-100 transition-opacity">
            {temporaryInfo && !isHidden && (
              <button
                onClick={(e) => { e.stopPropagation(); temporaryInfo.onToggle() }}
                className={cn(
                  'text-[9px] px-1 py-0.5 rounded leading-none transition-colors',
                  temporaryInfo.isTemporary
                    ? 'bg-amber-500/20 text-amber-400 hover:bg-red-500/20 hover:text-red-400 !opacity-100'
                    : 'bg-muted/40 text-muted-foreground hover:text-amber-400',
                )}
                title={temporaryInfo.isTemporary ? 'Fjern tidsbegrenset-merke' : 'Merk som tidsbegrenset'}
              >T</button>
            )}
            {onEdit && (
              <button
                onClick={(e) => { e.stopPropagation(); onEdit() }}
                className="text-[9px] px-1 py-0.5 rounded leading-none text-muted-foreground hover:text-foreground transition-colors"
                title="Rediger linje"
              ><Pencil className="h-2.5 w-2.5 inline" /></button>
            )}
            {onDelete && (
              <button
                onClick={(e) => { e.stopPropagation(); onDelete() }}
                className="text-[9px] px-1 py-0.5 rounded leading-none text-muted-foreground hover:text-red-400 transition-colors"
                title="Fjern rad"
              >✕</button>
            )}
          </span>
        </span>
      </td>

      {metas.map((meta) => {
        const cell = row.cells[meta.month - 1]
        const hl = highlightedMonth === meta.month

        if (!dualColumn) {
          if (editingMonth === meta.month && isEditable) {
            return (
              <td key={`${meta.month}-edit`} colSpan={2} className={cn('px-1 py-0.5 border-r border-border/40', hl && 'bg-sky-500/15')}>
                <div className="flex items-center gap-0.5">
                  <input
                    type="number"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') cancelEdit() }}
                    autoFocus
                    className="flex-1 min-w-0 bg-muted/30 text-right text-xs px-1 py-0.5 rounded outline-none tabular-nums"
                  />
                  {onCopyForward && meta.month < 12 && (
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault()
                        const v = parseFloat(editValue)
                        if (!isNaN(v)) { onCopyForward(meta.month, v); cancelEdit() }
                      }}
                      className="shrink-0 text-[9px] px-1 py-0.5 rounded bg-muted/40 text-muted-foreground hover:text-foreground leading-none transition-colors"
                      title={`Kopier ${editValue} til alle måneder fra og med ${MONTH_SHORT[meta.month]}`}
                    >→</button>
                  )}
                </div>
              </td>
            )
          }
          const overrideKey = `${meta.month}:${row.id}`
          const hasOverride = yearOverrides && overrideKey in yearOverrides
          const displayVal = hasOverride ? yearOverrides![overrideKey] : cell.budget
          return (
            <td
              key={meta.month}
              colSpan={2}
              className={cn(
                'px-2 py-1.5 text-right border-r border-border/40 tabular-nums',
                isHidden ? 'line-through text-muted-foreground/50' :
                  displayVal === 0 ? 'text-muted-foreground' : displayVal < 0 ? 'text-red-400' : 'text-foreground',
                hasOverride && 'text-amber-400',
                !isHidden && isEditable && 'cursor-text hover:bg-muted/20',
                hl && 'bg-sky-500/15',
              )}
              onClick={() => isEditable && startEdit(meta.month, displayVal)}
            >
              {hasOverride && displayVal === 0 ? '0' : fmtNOK(displayVal)}
            </td>
          )
        }

        if (meta.hasSlip || cell.actual !== null) {
          if (editingMonth === meta.month && onDeposit) {
            return (
              <td key={`${meta.month}-edit`} colSpan={2} className={cn('px-1 py-0.5 border-r border-border/40', hl && 'bg-sky-500/15')}>
                <input
                  type="number"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') cancelEdit() }}
                  autoFocus
                  placeholder="innskudd"
                  className="w-full bg-muted/30 text-right text-xs px-1 py-0.5 rounded outline-none tabular-nums"
                />
              </td>
            )
          }
          const actual = cell.actual ?? 0
          const deviation = !isHidden && actual !== 0 && cell.budget !== 0 ? actual - cell.budget : null
          const deviationPct = deviation !== null && cell.budget !== 0 ? Math.abs(deviation) / Math.abs(cell.budget) : 0
          // Markeres kun ved >10 % avvik OG minst 500 kr — småbeløp gir bare støy
          const bigDeviation = deviationPct > 0.1 && deviation !== null && Math.abs(deviation) > 500
          const deviationDir = deviation !== null && deviation > 0 ? 'over' : 'under'
          return (
            <td
              key={`${meta.month}-fak`}
              colSpan={2}
              className={cn(
                'px-2 py-1.5 text-right border-r border-border/40 font-medium tabular-nums relative group/cell',
                isHidden ? 'line-through text-muted-foreground/50' :
                  actual < 0 ? 'text-red-400' : actual > 0 ? 'text-foreground' : 'text-muted-foreground',
                !isHidden && bigDeviation && deviationDir === 'over' && 'bg-emerald-500/8',
                !isHidden && bigDeviation && deviationDir === 'under' && 'bg-red-500/8',
                onDeposit && 'cursor-text hover:bg-muted/20',
                hl && '!bg-sky-500/15',
              )}
              onClick={onDeposit ? () => startEdit(meta.month, 0) : undefined}
              title={deviation !== null
                ? `Avvik fra budsjett: ${deviation > 0 ? '+' : ''}${Math.round(deviation).toLocaleString('no-NO')} kr (${deviationPct >= 0.01 ? (deviationPct * 100).toFixed(0) + '%' : '<1%'})`
                : onDeposit ? 'Klikk for å registrere innskudd' : undefined}
            >
              {fmtNOK(actual)}
              {onActualCellClick && actual !== 0 && (
                <button
                  onClick={(e) => { e.stopPropagation(); onActualCellClick(meta.month) }}
                  className="absolute right-0.5 top-1/2 -translate-y-1/2 opacity-0 group-hover/cell:opacity-60 hover:!opacity-100 text-muted-foreground hover:text-red-400 transition-opacity p-0.5"
                  title="Administrer innskudd"
                ><X className="h-2.5 w-2.5" /></button>
              )}
            </td>
          )
        }

        if (editingMonth === meta.month && isEditable) {
          return (
            <td key={`${meta.month}-edit`} colSpan={2} className={cn('px-1 py-0.5 border-r border-border/40', hl && 'bg-sky-500/15')}>
              <input
                type="number"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') cancelEdit() }}
                autoFocus
                className="w-full bg-muted/30 text-right text-xs px-1 py-0.5 rounded outline-none tabular-nums"
              />
            </td>
          )
        }

        const overrideKey = `${meta.month}:${row.id}`
        const hasOverride = yearOverrides && overrideKey in yearOverrides
        const displayVal = hasOverride ? yearOverrides![overrideKey] : (meta.isLocked ? (cell.actual ?? cell.budget) : cell.budget)

        return (
          <td
            key={`${meta.month}-prog`}
            colSpan={2}
            className={cn(
              'px-2 py-1.5 text-right border-r border-border/40 tabular-nums group/cell',
              isHidden ? 'italic line-through text-muted-foreground/50' : [
                !meta.isLocked && !hasOverride && 'italic text-muted-foreground',
                meta.isLocked && displayVal < 0 && 'text-red-400',
                meta.isLocked && displayVal > 0 && 'text-foreground',
                hasOverride && 'text-amber-400 not-italic',
              ],
              !isHidden && isEditable && !meta.isLocked && 'cursor-text hover:bg-muted/20',
              hl && 'bg-sky-500/15',
            )}
            onClick={() => isEditable && !meta.isLocked && startEdit(meta.month, onDeposit ? Math.abs(displayVal) : displayVal)}
          >
            <span className="flex items-center justify-end gap-1">
              {hasOverride && displayVal === 0 ? '0' : fmtNOK(displayVal)}
              {isEditable && !meta.isLocked && !onDeposit && (
                <button
                  className={cn(
                    'text-xs leading-none transition-colors',
                    hasOverride
                      ? 'text-amber-400 hover:text-red-400'
                      : 'opacity-0 group-hover/cell:opacity-100 text-muted-foreground hover:text-red-400',
                  )}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (hasOverride && displayVal === 0) onOverride?.(meta.month, null)
                    else onOverride?.(meta.month, 0)
                  }}
                  title={hasOverride && displayVal === 0 ? 'Tilbakestill til beregnet' : 'Sett til 0'}
                >×</button>
              )}
            </span>
          </td>
        )
      })}

      <td className={cn('px-3 py-1.5 text-right font-medium border-l border-border/40 tabular-nums', amountClass(displayAnnualSum))}>
        {fmtNOK(displayAnnualSum)}
      </td>
    </tr>
  )
}

// ----------------------------------------------------------------
// Add Budget Line Modal
// ----------------------------------------------------------------

const MONTH_NAMES = ['Januar', 'Februar', 'Mars', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Desember']

function AddBudgetLineModal({
  activeYear,
  onSave,
  onCancel,
  prefill,
  editMode,
}: {
  activeYear: number
  onSave: (line: BudgetLine) => void
  onCancel: () => void
  prefill?: Partial<BudgetLine>
  editMode?: boolean
}) {
  const now = new Date()
  const [label, setLabel] = useState(prefill?.label ?? '')
  const [category, setCategory] = useState<BudgetCategory>(prefill?.category ?? 'annet_forbruk')
  const [amount, setAmount] = useState(prefill?.amount != null ? String(prefill.amount) : '')
  const [isRecurring, setIsRecurring] = useState(prefill?.isRecurring ?? true)
  const [isVariable, setIsVariable] = useState(prefill?.isVariable ?? false)
  const [isTemporary, setIsTemporary] = useState(prefill?.isTemporary ?? false)
  const [temporaryFromDate, setTemporaryFromDate] = useState(prefill?.temporaryFromDate ?? '')
  const [temporaryToDate, setTemporaryToDate] = useState(prefill?.temporaryToDate ?? '')
  const [specificMonth, setSpecificMonth] = useState<number>(prefill?.specificMonth ?? now.getMonth() + 1)
  const [specificYear, setSpecificYear] = useState<number>(prefill?.specificYear ?? activeYear)
  const [hasPeriodOverride, setHasPeriodOverride] = useState(!!prefill?.periodOverride)
  const [periodAmount, setPeriodAmount] = useState(prefill?.periodOverride ? String(prefill.periodOverride.amount) : '')
  const [periodFrom, setPeriodFrom] = useState(prefill?.periodOverride?.from ?? '')
  const [periodTo, setPeriodTo] = useState(prefill?.periodOverride?.to ?? '')

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{editMode ? 'Rediger budsjettlinje' : 'Ny budsjettlinje'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Navn</Label>
            <Input
              autoFocus
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="f.eks. Netflix, Treningssenter"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Kategori</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as BudgetCategory)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORY_GROUPS.map((g) =>
                  g.categories.map((c) => (
                    <SelectItem key={c} value={c} className="text-xs">
                      {g.label}: {CATEGORY_LABELS[c]}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Beløp (negativt = utgift, f.eks. -450)</Label>
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="-450"
            />
          </div>

          {/* Gjentakende / Engangshendelse */}
          <div className="space-y-2">
            <div className="flex gap-2">
              <button
                type="button"
                className={cn(
                  'flex-1 text-xs py-1.5 rounded border transition-colors',
                  isRecurring
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border text-muted-foreground hover:border-border/80',
                )}
                onClick={() => setIsRecurring(true)}
              >
                Gjentakende
                <span className="block text-[10px] text-muted-foreground font-normal">hver måned</span>
              </button>
              <button
                type="button"
                className={cn(
                  'flex-1 text-xs py-1.5 rounded border transition-colors',
                  !isRecurring
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border text-muted-foreground hover:border-border/80',
                )}
                onClick={() => setIsRecurring(false)}
              >
                Engang
                <span className="block text-[10px] text-muted-foreground font-normal">velg måned</span>
              </button>
            </div>

            {!isRecurring && (
              <div className="flex gap-2">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">Måned</Label>
                  <Select value={String(specificMonth)} onValueChange={(v) => setSpecificMonth(parseInt(v))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MONTH_NAMES.map((name, i) => (
                        <SelectItem key={i + 1} value={String(i + 1)} className="text-xs">{name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-24 space-y-1">
                  <Label className="text-xs">År</Label>
                  <Select value={String(specificYear)} onValueChange={(v) => setSpecificYear(parseInt(v))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[activeYear - 1, activeYear, activeYear + 1].map((y) => (
                        <SelectItem key={y} value={String(y)} className="text-xs">{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>

          {isRecurring && (
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="checkbox" checked={isVariable} onChange={(e) => setIsVariable(e.target.checked)} className="h-3 w-3" />
                Variabelt beløp
              </label>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="checkbox" checked={isTemporary} onChange={(e) => setIsTemporary(e.target.checked)} className="h-3 w-3" />
                <span>Tidsbegrenset <span className="text-muted-foreground">(skjules med «Uten tillegg»)</span></span>
              </label>
              {isTemporary && (
                <div className="flex gap-2 pl-5">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs text-muted-foreground">Fra dato</Label>
                    <Input type="date" className="h-7 text-xs" value={temporaryFromDate} onChange={(e) => setTemporaryFromDate(e.target.value)} />
                  </div>
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs text-muted-foreground">Til dato</Label>
                    <Input type="date" className="h-7 text-xs" value={temporaryToDate} onChange={(e) => setTemporaryToDate(e.target.value)} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ---- Midlertidig beløpsendring ---- */}
        {isRecurring && (
          <div className="border-t border-border/40 pt-3 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={hasPeriodOverride}
                onChange={(e) => setHasPeriodOverride(e.target.checked)}
                className="rounded"
              />
              <span className="text-xs font-medium">Midlertidig beløpsendring</span>
            </label>
            {hasPeriodOverride && (
              <div className="space-y-2 pl-5">
                <div className="space-y-1">
                  <Label className="text-xs">Beløp i perioden</Label>
                  <Input
                    type="number"
                    value={periodAmount}
                    onChange={(e) => setPeriodAmount(e.target.value)}
                    placeholder={amount || '-1000'}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Fra (måned)</Label>
                    <Input type="month" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Til (måned)</Label>
                    <Input type="month" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} />
                  </div>
                </div>
                {amount && periodAmount && (
                  <p className="text-[10px] text-muted-foreground">
                    Etter perioden fortsetter det opprinnelige beløpet ({amount} kr/mnd).
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2 justify-end mt-4">
          <Button variant="outline" size="sm" onClick={onCancel}>Avbryt</Button>
          <Button
            size="sm"
            disabled={!label.trim() || !amount}
            onClick={() =>
              onSave({
                id: crypto.randomUUID(),
                label: label.trim(),
                category,
                amount: parseFloat(amount) || 0,
                isRecurring,
                source: 'manual',
                isLocked: false,
                isVariable: isRecurring ? isVariable : false,
                isTemporary: isRecurring && isTemporary ? true : undefined,
                temporaryFromDate: isRecurring && isTemporary && temporaryFromDate ? temporaryFromDate : undefined,
                temporaryToDate: isRecurring && isTemporary && temporaryToDate ? temporaryToDate : undefined,
                specificMonth: !isRecurring ? specificMonth : undefined,
                specificYear: !isRecurring ? specificYear : undefined,
                periodOverride: isRecurring && hasPeriodOverride && periodAmount && periodFrom && periodTo
                  ? { amount: parseFloat(periodAmount) || 0, from: periodFrom, to: periodTo }
                  : undefined,
              })
            }
          >
            Lagre
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

