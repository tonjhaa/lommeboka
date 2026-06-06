import { useState, useMemo, Fragment } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { usePartnerStore } from '@/application/usePartnerStore'
import { usePartnershipStore } from '@/store/usePartnershipStore'
import { buildPartnerVeikartPatch } from '@/domain/economy/syncPartnerToVeikart'
import { useEconomyStore } from '@/application/useEconomyStore'
import { Plus, Trash2, Upload, ChevronDown, ChevronUp, Repeat2, Pencil, Check, X, AlertTriangle } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Progress } from '@/components/ui/progress'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { useActiveEconomyStore } from '@/contexts/EconomyStoreContext'
import { BSU_MAX_YEARLY } from '@/config/economy.config'
import {
  checkBSULimits,
  calculateGoalProgress,
  projectSavingsGrowth,
  computeMonthlyContributionEstimate,
  computeYTDContributions,
  computeYearlyInterestIncome,
  computeBSUForecast,
  computeEffectiveBalance,
  getEffectiveRateFromTiers,
} from '@/domain/economy/savingsCalculator'
import { calcMaxPurchase, BSU_MAX_TOTAL } from '@/hooks/useVeikart'
import type {
  SavingsAccount,
  SavingsGoal,
  SavingsAccountType,
  BalanceHistoryEntry,
  RateHistoryEntry,
  SavingsContribution,
  WithdrawalEntry,
  PartnerVeikart,
  EmploymentProfile,
  DebtAccount,
  BudgetTemplate,
  PartnerAccount,
  ContributionPeriod,
  BankAccountPreset,
  TieredRate,
} from '@/types/economy'
import { partnerNonBsuEquity } from '@/types/economy'
import { SavingsImporter } from '@/features/savings/SavingsImporter'
import { FondPage } from '@/pages/economy/FondPage'
import { cn } from '@/lib/utils'

function fmtNOK(n: number) {
  return Math.round(n).toLocaleString('no-NO') + '\u00A0kr'
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('no-NO', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// computeEffectiveBalance er eksportert fra savingsCalculator og importert over

const ACCOUNT_TYPE_LABELS: Record<SavingsAccountType, string> = {
  BSU: 'BSU',
  fond: 'Fond',
  krypto: 'Krypto',
  sparekonto: 'Sparekonto',
  annet: 'Annet',
}

// ------------------------------------------------------------
// MAIN PAGE
// ------------------------------------------------------------

export function SavingsPage() {
  const {
    savingsAccounts,
    savingsGoals,
    budgetTemplate,
    addSavingsAccount,
    removeSavingsAccount,
    updateSavingsAccount,
    updateSavingsBalance,
    updateSavingsRate,
    addContribution,
    removeContribution,
    addWithdrawal,
    removeWithdrawal,
    addSavingsGoal,
    removeSavingsGoal,
    fondPortfolio,
    partnerVeikart,
    profile,
    debts,
    savingsPlanTarget,
    setSavingsPlanTarget,
  } = useActiveEconomyStore()

  const { savingsTab: tab, setSavingsTab: setTab } = useAppStore()
  const bankPresets = useEconomyStore((s) => s.bankPresets)

  const [showAddAccount, setShowAddAccount] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [showAddGoal, setShowAddGoal] = useState(false)
  const now = new Date()
  const currentYear = now.getFullYear()

  const sortedFondSnapshots = [...(fondPortfolio?.snapshots ?? [])].sort((a, b) => b.date.localeCompare(a.date))
  const fondCurrentValue = sortedFondSnapshots[0]?.totalValue ?? 0
  const fondMonthlyDeposit = fondPortfolio?.monthlyDeposit ?? 0

  // Summary stats for Kontoer tab
  const totalBalance = savingsAccounts.reduce((s, a) => s + computeEffectiveBalance(a, now), 0)
  const bsuAccount = savingsAccounts.find((a) => a.type === 'BSU')
  const bsuStatus = bsuAccount ? checkBSULimits(bsuAccount, currentYear) : null
  const bsuSkattefradrag = bsuAccount
    ? Math.round(Math.min(bsuStatus!.yearlyContributionSoFar, 27500) * 0.1) : 0
  const totalInterestIncome = savingsAccounts
    .filter((a) => a.type !== 'fond' && a.type !== 'krypto')
    .reduce((s, a) => s + computeYearlyInterestIncome(a, currentYear), 0)
  const totalInterestForecast = savingsAccounts
    .filter((a) => a.type !== 'fond' && a.type !== 'krypto')
    .reduce((s, a) => s + computeYearlyInterestIncome(a, currentYear, true), 0)

  const SAVINGS_CATS = new Set(['bsu', 'fond', 'krypto', 'buffer', 'annen_sparing'])
  const budgetSavingsLines = (budgetTemplate?.lines ?? []).filter(
    (l) => SAVINGS_CATS.has(l.category) && l.isRecurring && Math.abs(l.amount) > 0
  )

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Flat 4-tab bar with contextual actions */}
      <div className="flex items-center gap-1 border-b border-border bg-card/40 px-4 shrink-0">
        {([
          ['kontoer', 'Kontoer & mål'],
          ['fond', 'Fond'],
          ['måneder', 'Månedsoversikt'],
          ['råd', 'Råd & varsler'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              'px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap',
              tab === key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            )}
          >{label}</button>
        ))}
        {/* Contextual action buttons */}
        <div className="ml-auto flex items-center gap-2 py-1">
          {tab === 'kontoer' && (
            <>
              <Button variant="outline" size="sm" onClick={() => setShowImport((v) => !v)}>
                <Upload className="h-3.5 w-3.5 mr-1" />Importer
              </Button>
              <Button size="sm" onClick={() => setShowAddAccount(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" />Ny konto
              </Button>
            </>
          )}
          {tab === 'kontoer' && (
            <Button size="sm" variant="outline" onClick={() => setShowAddGoal(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" />Nytt mål
            </Button>
          )}
        </div>
      </div>

      {/* ── KONTOER TAB ── */}
      {tab === 'kontoer' && (
        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          {showImport && <SavingsImporter onDone={() => setShowImport(false)} />}
          {showAddAccount && (
            <AccountForm
              bankPresets={bankPresets}
              onSave={(a) => { addSavingsAccount(a); setShowAddAccount(false) }}
              onCancel={() => setShowAddAccount(false)}
            />
          )}

          {/* Summary bar */}
          {savingsAccounts.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <SummaryCard label="Total saldo" value={fmtNOK(totalBalance)} />
              {bsuStatus && (
                <SummaryCard
                  label={`BSU-kvote ${currentYear}`}
                  value={`${fmtNOK(bsuStatus.yearlyContributionSoFar)} / 27 500 kr`}
                  subvalue={`${Math.round((bsuStatus.yearlyContributionSoFar / 27500) * 100)}%`}
                />
              )}
              {bsuAccount && (
                <SummaryCard label="BSU skattefradrag" value={fmtNOK(bsuSkattefradrag)} subvalue="10% av innskudd" />
              )}
              {totalInterestForecast > 0 && (
                <SummaryCard
                  label={`Renteinntekter ${currentYear}`}
                  value={fmtNOK(totalInterestForecast)}
                  subvalue={totalInterestIncome > 0 && totalInterestIncome < totalInterestForecast
                    ? `${fmtNOK(totalInterestIncome)} opptjent hittil` : 'prognose hele året'}
                />
              )}
            </div>
          )}

          {/* Account cards */}
          {savingsAccounts.length === 0 && !showAddAccount ? (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-sm text-muted-foreground mb-3">Ingen sparekontoer registrert.</p>
                <Button size="sm" onClick={() => setShowAddAccount(true)}>Legg til sparekonto</Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {savingsAccounts.map((account) => (
                <AccountCard
                  key={account.id}
                  account={account}
                  now={now}
                  bankPresets={bankPresets}
                  onRemove={() => removeSavingsAccount(account.id)}
                  onUpdate={(patch) => updateSavingsAccount(account.id, patch)}
                  onUpdateBalance={(entry) => updateSavingsBalance(account.id, entry)}
                  onUpdateRate={(entry) => updateSavingsRate(account.id, entry)}
                  onAddContribution={(c) => addContribution(account.id, c)}
                  onRemoveContribution={(id) => removeContribution(account.id, id)}
                  onAddWithdrawal={(w) => addWithdrawal(account.id, w)}
                  onRemoveWithdrawal={(id) => removeWithdrawal(account.id, id)}
                  onUpdateBirthYear={(year) => updateSavingsAccount(account.id, { birthYear: year })}
                  onUpdateMonthlyContribution={(amount) => updateSavingsAccount(account.id, { monthlyContribution: amount })}
                />
              ))}
            </div>
          )}

          {/* Budget savings lines */}
          {budgetSavingsLines.length > 0 && (
            <div>
              <h3 className="font-medium text-sm mb-2">Spareposter fra budsjett</h3>
              <div className="rounded-md border border-border bg-muted/10 divide-y divide-border/50">
                {budgetSavingsLines.map((line) => {
                  const linkedAccount = savingsAccounts.find((a) => a.id === (line as { linkedSavingsAccountId?: string }).linkedSavingsAccountId)
                  return (
                    <div key={line.id} className="flex items-center justify-between px-3 py-2 text-xs">
                      <div>
                        <p className="font-medium">{line.label}</p>
                        {linkedAccount
                          ? <p className="text-[10px] text-green-500">→ {linkedAccount.label}</p>
                          : <p className="text-[10px] text-muted-foreground">Ikke koblet til konto</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <Repeat2 className="h-3 w-3 text-muted-foreground" />
                        <span className="font-mono">{Math.abs(line.amount).toLocaleString('no-NO')} kr/mnd</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Goals */}
          <div>
            <h3 className="font-medium text-sm mb-2">Sparemål</h3>
            {showAddGoal && (
              <AddGoalForm
                accounts={savingsAccounts}
                fondMonthlyDeposit={fondMonthlyDeposit}
                onSave={(g) => { addSavingsGoal(g); setShowAddGoal(false) }}
                onCancel={() => setShowAddGoal(false)}
              />
            )}
            {savingsGoals.length === 0 && !showAddGoal ? (
              <Card>
                <CardContent className="py-4 text-center">
                  <p className="text-sm text-muted-foreground">Ingen sparemål registrert.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {savingsGoals.map((goal) => {
                  const progress = calculateGoalProgress(goal, savingsAccounts, fondCurrentValue, fondMonthlyDeposit)
                  return (
                    <Card key={goal.id}>
                      <CardContent className="py-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{goal.icon}</span>
                            <span className="font-medium text-sm">{goal.label}</span>
                          </div>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400"
                            onClick={() => removeSavingsGoal(goal.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <Progress value={progress.percent} className="h-2" />
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>{fmtNOK(progress.currentTotal)} / {fmtNOK(progress.targetAmount)}</span>
                          <span>{Math.round(progress.percent)}%</span>
                        </div>
                        {goal.includeFond && <p className="text-xs text-muted-foreground">Inkl. KRON Fond</p>}
                        {progress.monthsRemaining !== null && progress.monthsRemaining > 0 && (
                          <p className="text-xs text-muted-foreground">
                            Mangler {fmtNOK(progress.targetAmount - progress.currentTotal)} —
                            spar {fmtNOK(progress.monthlyNeeded ?? 0)}/mnd = {progress.monthsRemaining} mnd
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── FOND TAB ── */}
      {tab === 'fond' && <FondPage />}

      {/* ── MÅNEDSOVERSIKT TAB ── */}
      {tab === 'måneder' && (
        <MånedsoversiktTable
          accounts={savingsAccounts}
          fondCurrentValue={fondCurrentValue}
          fondPortfolio={fondPortfolio ?? null}
          debts={debts}
          profile={profile}
          partnerVeikart={partnerVeikart}
          now={now}
        />
      )}

      {/* ── RÅD TAB ── */}
      {tab === 'råd' && (
        <RådTab
          savingsAccounts={savingsAccounts}
          profile={profile}
          partnerVeikart={partnerVeikart}
          debts={debts}
          fondCurrentValue={fondCurrentValue}
          budgetTemplate={budgetTemplate}
          updateSavingsAccount={updateSavingsAccount}
          savingsPlanTarget={savingsPlanTarget}
          setSavingsPlanTarget={setSavingsPlanTarget}
        />
      )}
    </div>
  )
}

// ─── Shared helpers ───────────────────────────────────────────

type InsightColor = 'green' | 'blue' | 'amber' | 'red'

function InsightCard({ icon, text, color }: { icon: string; text: string; color: InsightColor }) {
  const bg = { green: 'bg-green-950/40 border-green-800/40', blue: 'bg-blue-950/40 border-blue-800/40', amber: 'bg-amber-950/40 border-amber-800/40', red: 'bg-red-950/40 border-red-800/40' }[color]
  const txt = { green: 'text-green-300', blue: 'text-blue-300', amber: 'text-amber-300', red: 'text-red-300' }[color]
  return (
    <div className={`rounded-lg border p-3 flex items-start gap-2 ${bg}`}>
      <span className="text-sm">{icon}</span>
      <p className={`text-xs leading-relaxed ${txt}`}>{text}</p>
    </div>
  )
}

function projectDebtBalance(d: DebtAccount, months: number): number {
  if (d.currentBalance <= 0) return 0
  const rate = [...d.rateHistory].sort((a, b) => b.fromDate.localeCompare(a.fromDate))[0]?.nominalRate ?? 0
  const monthly = d.monthlyPayment
  if (monthly <= 0) return d.currentBalance
  const r = rate / 100 / 12
  if (r === 0) return Math.max(0, d.currentBalance - monthly * months)
  let bal = d.currentBalance
  for (let i = 0; i < months; i++) {
    bal = bal * (1 + r) - monthly
    if (bal <= 0) return 0
  }
  return Math.max(0, bal)
}

// ─── Råd & varsler ───────────────────────────────────────────

function RådTab({
  savingsAccounts, profile, partnerVeikart, debts, fondCurrentValue, budgetTemplate,
  updateSavingsAccount, savingsPlanTarget, setSavingsPlanTarget,
}: {
  savingsAccounts: SavingsAccount[]
  profile: EmploymentProfile | null
  partnerVeikart: PartnerVeikart
  debts: DebtAccount[]
  fondCurrentValue: number
  budgetTemplate: BudgetTemplate | null
  updateSavingsAccount: (id: string, patch: Partial<SavingsAccount>) => void
  savingsPlanTarget: number
  setSavingsPlanTarget: (v: number) => void
}) {
  const [showWizard, setShowWizard] = useState(false)
  const now = new Date()

  const userMonthly = profile?.baseMonthly ?? 0
  const partnerMonthly = (partnerVeikart?.annualIncome ?? 0) / 12
  const combinedMonthly = userMonthly + (partnerVeikart?.enabled ? partnerMonthly : 0)

  const totalSavingsMonthly = savingsAccounts.reduce((s, a) => s + (a.monthlyContribution ?? 0), 0)
  const totalDebt = debts.filter(d => d.status !== 'nedbetalt').reduce((s, d) => s + d.currentBalance, 0)

  const SAVINGS_CATS = new Set(['bsu', 'fond', 'krypto', 'buffer', 'annen_sparing'])
  const budgetSavingsTotal = (budgetTemplate?.lines ?? [])
    .filter(l => SAVINGS_CATS.has(l.category) && l.isRecurring)
    .reduce((s, l) => s + Math.abs(l.amount), 0)

  const insights: { icon: string; color: InsightColor; text: string }[] = []
  const pctIncome = combinedMonthly > 0 ? (totalSavingsMonthly / combinedMonthly) * 100 : 0

  if (pctIncome >= 20)
    insights.push({ icon: '🏆', color: 'green', text: `Dere sparer ${pctIncome.toFixed(0)} % av samlet inntekt – over anbefalt 20 %.` })
  else if (pctIncome >= 10)
    insights.push({ icon: '👍', color: 'blue', text: `Dere sparer ${pctIncome.toFixed(0)} % av samlet inntekt. Anbefalt minstemål er 20 % – øk med ${fmtNOK(combinedMonthly * 0.2 - totalSavingsMonthly)}/mnd.` })
  else if (combinedMonthly > 0)
    insights.push({ icon: '⚠️', color: 'amber', text: `Kun ${pctIncome.toFixed(0)} % av inntekten spares. Vurder å øke månedlig sparing.` })

  const bsuAcc = savingsAccounts.find(a => a.type === 'BSU')
  if (bsuAcc) {
    const balance = computeEffectiveBalance(bsuAcc, now)
    if (balance >= BSU_MAX_TOTAL)
      insights.push({ icon: '✅', color: 'green', text: 'BSU er fylt opp! Flytt BSU-sparingen til fond eller sparekonto.' })
    else if ((bsuAcc.monthlyContribution ?? 0) < BSU_MAX_YEARLY / 12 * 0.9)
      insights.push({ icon: '💡', color: 'blue', text: `Du kan øke BSU til ${fmtNOK(Math.round(BSU_MAX_YEARLY / 12))}/mnd. Skattefradrag: ${fmtNOK(Math.min((bsuAcc.monthlyContribution ?? 0) * 12, BSU_MAX_YEARLY) * 0.1)}/år.` })
  }

  if (budgetSavingsTotal > 0 && Math.abs(budgetSavingsTotal - totalSavingsMonthly) > 500)
    insights.push({ icon: '📊', color: 'amber', text: `Budsjettet sier ${fmtNOK(budgetSavingsTotal)}/mnd til sparing, men kontoene har ${fmtNOK(totalSavingsMonthly)}/mnd. Sjekk at tallene stemmer overens.` })

  if (totalDebt > 0 && totalSavingsMonthly > 0 && totalDebt / (totalSavingsMonthly * 12) > 5)
    insights.push({ icon: '⚖️', color: 'amber', text: `Gjelden (${fmtNOK(totalDebt)}) er høy relativt til sparingen. Vurder ekstra nedbetaling av dyr gjeld.` })

  const totalEKNow = savingsAccounts.reduce((s, a) => s + computeEffectiveBalance(a, now), 0) + fondCurrentValue
    + (partnerVeikart?.enabled ? partnerNonBsuEquity(partnerVeikart) + (partnerVeikart.bsu ?? 0) + (partnerVeikart.fondCurrentValue ?? 0) : 0)
  const requiredEK = savingsPlanTarget > 0 ? Math.max(savingsPlanTarget * 0.1, 0) : 0
  if (requiredEK > 0) {
    const pctGoal = Math.min(100, (totalEKNow / requiredEK) * 100)
    insights.push({
      icon: pctGoal >= 100 ? '🏠' : '🚧',
      color: pctGoal >= 100 ? 'green' : 'blue',
      text: pctGoal >= 100
        ? `Dere har nok EK til ${fmtNOK(savingsPlanTarget)}-boligen (${fmtNOK(totalEKNow)} ≥ ${fmtNOK(requiredEK)}).`
        : `EK-fremgang mot ${fmtNOK(savingsPlanTarget)}-boligen: ${fmtNOK(totalEKNow)} av ${fmtNOK(requiredEK)} (${pctGoal.toFixed(0)} %).`,
    })
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {/* Boligmål */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <p className="text-xs font-semibold">🏠 Boligmål</p>
        <div className="flex items-center gap-3">
          <label className="text-xs text-muted-foreground whitespace-nowrap">Ønsket boligpris</label>
          <input
            type="number"
            step={50000}
            value={savingsPlanTarget || ''}
            placeholder="f.eks. 4 500 000"
            onChange={e => setSavingsPlanTarget(parseFloat(e.target.value) || 0)}
            className="h-8 flex-1 rounded border border-border bg-background px-2 text-xs font-mono outline-none focus:border-primary"
          />
        </div>
        {savingsPlanTarget > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Nødvendig EK (10 %):</span>
              <span className="font-mono font-semibold">{fmtNOK(requiredEK)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Nåværende samlet EK:</span>
              <span className="font-mono font-semibold text-blue-400">{fmtNOK(totalEKNow)}</span>
            </div>
            <Progress value={Math.min(100, (totalEKNow / requiredEK) * 100)} className="h-1.5" />
          </div>
        )}
      </div>

      {/* Insights */}
      <div className="space-y-2">
        <p className="text-xs font-semibold">Råd & varsler</p>
        {insights.length === 0
          ? <p className="text-xs text-muted-foreground">Ingen varsler. Alt ser bra ut!</p>
          : insights.map((ins, i) => <InsightCard key={i} icon={ins.icon} text={ins.text} color={ins.color} />)
        }
      </div>

      {/* Cross-tool links */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <p className="text-xs font-semibold">🔗 Sammenheng med resten av verktøyet</p>
        {[
          { icon: '📊', label: 'Budsjett', value: `${fmtNOK(budgetSavingsTotal)}/mnd satt av til sparing` },
          { icon: '💰', label: 'Inntekt', value: combinedMonthly > 0 ? `${pctIncome.toFixed(0)} % av samlet inntekt spares` : 'Ingen inntekt registrert' },
          { icon: '🧾', label: 'BSU skattefradrag', value: (() => {
            if (!bsuAcc) return 'Ingen BSU registrert'
            return `Estimert ${fmtNOK(Math.min((bsuAcc.monthlyContribution ?? 0) * 12, BSU_MAX_YEARLY) * 0.1)} refundert`
          })() },
          { icon: '⚖️', label: 'Gjeld', value: totalDebt > 0 ? `${fmtNOK(totalDebt)} total gjeld` : 'Ingen gjeld registrert' },
          { icon: '🗺️', label: 'Veikart', value: `${fmtNOK(totalEKNow)} samlet EK` },
        ].map(row => (
          <div key={row.label} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
            <span className="text-base">{row.icon}</span>
            <div>
              <p className="text-xs font-medium">{row.label}</p>
              <p className="text-xs text-muted-foreground">{row.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Wizard */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-2">
        <p className="text-xs font-semibold">📋 Sparewizard</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Steg-for-steg: koble kontoer mot budsjett, sett BSU-kvote, velg fondstrategi og beregn optimalt oppsett.
        </p>
        <Button size="sm" onClick={() => setShowWizard(true)}>Start wizard</Button>
      </div>

      {showWizard && (
        <SavingsPlanWizard
          accounts={savingsAccounts}
          onClose={() => setShowWizard(false)}
          onUpdateAccount={updateSavingsAccount}
          onSetTarget={setSavingsPlanTarget}
          currentTarget={savingsPlanTarget}
        />
      )}
    </div>
  )
}
// ─── Månedsoversikt ───────────────────────────────────────────

// FOND_RATE_TABLE removed: fond uses faktisk snapshots, ikke automatisk avkastning
const SAVINGS_RATE_TABLE = 3.5
const FULL_MONTH_NAMES = ['Januar', 'Februar', 'Mars', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Desember']

/** Sjekker om et gitt år/måned faller innenfor en valgfri from/to-periode */
function getBaseContribForMonth(acc: SavingsAccount, year: number, month: number, nowISO?: string): number {
  // Fremtidige registrerte transaksjoner (etter today) som faller i denne måneden
  const futureTxDelta = nowISO
    ? [
        ...(acc.contributions ?? []).map(c => ({ date: c.date, amount: c.amount })),
        ...(acc.withdrawals ?? []).map(w => ({ date: w.date, amount: w.amount })),
      ]
        .filter(t => {
          const d = new Date(t.date)
          return d.getFullYear() === year && d.getMonth() + 1 === month && t.date > nowISO
        })
        .reduce((s, t) => s + t.amount, 0)
    : 0

  const periods = acc.contributionPeriods
  if (periods && periods.length > 0) {
    const ym = `${year}-${String(month).padStart(2, '0')}`
    const period = periods.find(p => {
      const from = p.fromDate ? p.fromDate.slice(0, 7) : '0000-00'
      const to = p.toDate ? p.toDate.slice(0, 7) : '9999-99'
      return ym >= from && ym <= to
    })
    return (period ? Math.round(period.amount) : 0) + futureTxDelta
  }
  const active = isActiveMonth(year, month, acc.monthlyContributionFromDate, acc.monthlyContributionToDate)
  return (active ? Math.round(acc.monthlyContribution ?? 0) : 0) + futureTxDelta
}

function isActiveMonth(year: number, month: number, fromDate?: string, toDate?: string): boolean {
  if (!fromDate && !toDate) return true
  const ym = year * 100 + month
  const from = fromDate ? parseInt(fromDate.slice(0, 4)) * 100 + parseInt(fromDate.slice(5, 7)) : 0
  const to = toDate ? parseInt(toDate.slice(0, 4)) * 100 + parseInt(toDate.slice(5, 7)) : 999999
  return ym >= from && ym <= to
}

function InnskuddCell({ value, onChange, isOverridden, onFillDown }: {
  value: number
  onChange: (v: number) => void
  isOverridden?: boolean
  onFillDown?: (v: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [tmp, setTmp] = useState('')
  const rounded = Math.round(value)

  function commit() {
    const v = parseFloat(tmp) || 0
    onChange(v)
    setEditing(false)
  }

  if (editing) {
    return (
      <span className="flex items-center gap-0.5">
        <input
          autoFocus
          type="number"
          value={tmp}
          onChange={e => setTmp(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') setEditing(false)
          }}
          className="w-full text-right bg-primary/10 border border-primary rounded px-1 py-0.5 text-xs font-mono outline-none"
        />
        {onFillDown && (
          <button
            onMouseDown={e => { e.preventDefault(); const v = parseFloat(tmp) || 0; onChange(v); onFillDown(v); setEditing(false) }}
            title="Fyll ned til slutten av året"
            className="shrink-0 px-1 text-muted-foreground hover:text-amber-400 transition-colors"
          >↓</button>
        )}
      </span>
    )
  }
  return (
    <span className="relative flex items-center justify-end w-full group/cell">
      {onFillDown && (
        <button
          onClick={() => onFillDown(rounded)}
          title="Fyll ned til slutten av året med dette beløpet"
          className="absolute left-0 opacity-0 group-hover/cell:opacity-100 px-0.5 text-muted-foreground hover:text-amber-400 transition-opacity text-[10px]"
        >↓</button>
      )}
      <button
        onClick={() => { setTmp(String(rounded)); setEditing(true) }}
        title="Klikk for å endre"
        className={cn(
          'tabular-nums text-right hover:text-foreground hover:underline decoration-dashed underline-offset-2 transition-colors',
          isOverridden ? 'text-amber-400' : 'text-muted-foreground',
        )}
      >
        {rounded.toLocaleString('no-NO')}
      </button>
    </span>
  )
}

function getFondContribForMonth(portfolio: import('@/types/economy').FondPortfolio, year: number, month: number): number {
  const periods = portfolio.contributionPeriods
  if (periods && periods.length > 0) {
    const ym = `${year}-${String(month).padStart(2, '0')}`
    const period = periods.find(p => {
      const from = p.fromDate ? p.fromDate.slice(0, 7) : '0000-00'
      const to = p.toDate ? p.toDate.slice(0, 7) : '9999-99'
      return ym >= from && ym <= to
    })
    return period ? Math.round(period.amount) : 0
  }
  return Math.round(portfolio.monthlyDeposit)
}

function MånedsoversiktTable({
  accounts, fondCurrentValue, fondPortfolio, debts, profile, partnerVeikart, now,
}: {
  accounts: SavingsAccount[]
  fondCurrentValue: number
  fondPortfolio: import('@/types/economy').FondPortfolio | null
  debts: DebtAccount[]
  profile: EmploymentProfile | null
  partnerVeikart: PartnerVeikart
  now: Date
}) {
  const HORIZON = 72
  const { setSavingsTab } = useAppStore()
  const { savingsOverrides: contribOverrides, setSavingsOverride, clearAllSavingsOverrides } = useActiveEconomyStore()
  const [editingRateId, setEditingRateId] = useState<string | null>(null)

  const setCurrentView = useAppStore((s) => s.setCurrentView)
  const partnerStatus = usePartnershipStore((s) => s.status)
  const setPartnerVeikart = useEconomyStore((s) => s.setPartnerVeikart)
  const [syncDone, setSyncDone] = useState(false)

  function syncPartner() {
    const ps = usePartnerStore.getState()
    const patch = buildPartnerVeikartPatch(
      ps.savingsAccounts,
      ps.debts,
      ps.profile,
      partnerVeikart,
      now,
      ps.fondPortfolio,
    )
    setPartnerVeikart({ ...partnerVeikart, ...patch })
    setSyncDone(true)
    setTimeout(() => setSyncDone(false), 2000)
  }

  function setMonthOverride(accId: string, year: number, month: number, value: number) {
    setSavingsOverride(`${accId}-${year}-${month}`, value)
  }

  function setContribOverrides(updater: (prev: Record<string, number>) => Record<string, number>) {
    // Brukes kun for startsaldo-overrides
    const next = updater(contribOverrides)
    Object.entries(next).forEach(([k, v]) => {
      if (!(k in contribOverrides) || contribOverrides[k] !== v) setSavingsOverride(k, v)
    })
    Object.keys(contribOverrides).forEach(k => { if (!(k in next)) setSavingsOverride(k, null) })
  }

  // Fyll ned: sett samme beløp for alle måneder fra (year, month) til slutten av året
  function fillDown(accId: string, fromYear: number, fromMonth: number, value: number) {
    for (let m = fromMonth; m <= 12; m++) {
      setSavingsOverride(`${accId}-${fromYear}-${m}`, value)
    }
  }

  const fondMonthlyDeposit = fondPortfolio?.monthlyDeposit ?? 0
  const hasFond = fondCurrentValue > 0 || fondMonthlyDeposit > 0
  const hasPartner = partnerVeikart.enabled

  const myAnnualIncome = ((profile?.baseMonthly ?? 0) + (profile?.fixedAdditions?.reduce((s, a) => s + a.amount, 0) ?? 0)) * 12
  const partnerOnlyAnnualIncome = hasPartner ? partnerVeikart.annualIncome : 0
  const annualIncome = myAnnualIncome + partnerOnlyAnnualIncome
  const salaryGrowthPct = contribOverrides['salary-growth'] ?? 3

  const { accMeta, partnerAccMeta, monthRows } = useMemo(() => {
    const nowISO = now.toISOString().split('T')[0]
    const accMeta = accounts.map(acc => ({
      id: acc.id,
      label: acc.label,
      type: acc.type,
      startBalance: contribOverrides[`start-${acc.id}`] ?? computeEffectiveBalance(acc, now),
      rate: contribOverrides[`rate-${acc.id}`] ?? ([...acc.rateHistory].sort((a, b) => b.fromDate.localeCompare(a.fromDate))[0]?.rate ?? 0),
      tieredRates: acc.tieredRates,
      getBase: (year: number, month: number) => getBaseContribForMonth(acc, year, month, nowISO),
    }))

    // Partner accounts meta — startBalance from overrides
    const partnerAccMeta: (PartnerAccount & { runningBal: number })[] = hasPartner
      ? (partnerVeikart.accounts ?? []).map(a => ({
          ...a,
          rate: contribOverrides[`rate-p-${a.id}`] ?? a.rate,
          runningBal: contribOverrides[`start-p-${a.id}`] ?? a.balance,
        }))
      : []

    // Month-by-month simulation — handles BSU cap correctly
    const runningBals = accMeta.map(a => a.startBalance)
    // Påløpte renter per konto — krediteres i januar neste år
    const accruedInterest = accMeta.map(() => 0)
    const partnerAccruedInterest = partnerAccMeta.map(() => 0)
    let fondBal = contribOverrides['start-fond'] ?? fondCurrentValue
    let partnerBsuBal = hasPartner ? (contribOverrides['start-p-bsu'] ?? partnerVeikart.bsu ?? 0) : 0
    const currentYear = now.getFullYear()

    const monthRows = Array.from({ length: HORIZON }, (_, i) => {
      const date = new Date(now.getFullYear(), now.getMonth() + i, 1)
      const year = date.getFullYear()
      const month = date.getMonth() + 1

      // User accounts — per-month override lookup
      const accountBalances = accMeta.map((acc, j) => {
        const bal0 = runningBals[j]
        const overrideKey = `${acc.id}-${year}-${month}`
        const baseContrib = acc.getBase(year, month)
        let contrib = overrideKey in contribOverrides ? contribOverrides[overrideKey] : baseContrib
        let bal: number
        let interest: number
        {
          if (acc.type === 'BSU') {
            const room = Math.max(0, BSU_MAX_TOTAL - bal0)
            contrib = Math.min(contrib, room)
          }
          // Trinnvis rente: beregn effektiv rente mot løpende saldo inkl. påløpte renter
          const effectiveBal = bal0 + accruedInterest[j]
          const effectiveRate = (acc.tieredRates?.length && !(`rate-${acc.id}` in contribOverrides))
            ? getEffectiveRateFromTiers(acc.tieredRates, effectiveBal)
            : acc.rate
          const monthlyInterest = effectiveBal * effectiveRate / 100 / 12
          interest = monthlyInterest
          accruedInterest[j] += monthlyInterest
          // Norsk bankstandard: renter krediteres 31. desember
          if (month === 12) {
            bal = bal0 + accruedInterest[j] + contrib
            accruedInterest[j] = 0
          } else {
            bal = bal0 + contrib
          }
        }
        runningBals[j] = bal
        return { id: acc.id, balance: bal, contribution: contrib, overrideKey, interest }
      })

      // Fond — basert på faktiske snapshots, ingen automatisk avkastning
      const fondKey = `fond-${year}-${month}`
      const ym = `${year}-${String(month).padStart(2, '0')}`
      const activeFondPeriod = fondPortfolio?.contributionPeriods?.find(p => {
        const from = p.fromDate ? p.fromDate.slice(0, 7) : '0000-00'
        const to = p.toDate ? p.toDate.slice(0, 7) : '9999-99'
        return ym >= from && ym <= to
      }) ?? null
      const baseFondMnd = fondPortfolio ? getFondContribForMonth(fondPortfolio, year, month) : fondMonthlyDeposit
      const effectiveFondMnd = fondKey in contribOverrides ? contribOverrides[fondKey] : baseFondMnd
      // Bruk faktisk snapshot for denne måneden hvis det finnes
      const snapshotThisMonth = fondPortfolio?.snapshots?.find(s => s.date.slice(0, 7) === ym)
      const prevFondBal = fondBal
      let fondInterest: number
      if (snapshotThisMonth) {
        fondBal = snapshotThisMonth.totalValue
        fondInterest = fondBal - prevFondBal - effectiveFondMnd  // derivert avkastning
      } else {
        fondBal = prevFondBal + effectiveFondMnd  // ingen automatisk avkastning
        fondInterest = 0
      }

      // Partner accounts — per-month overrides + januar-rentekreditt
      const partnerAccBalances = partnerAccMeta.map((acc, j) => {
        const active = isActiveMonth(year, month, acc.fromDate, acc.toDate)
        const baseContrib = active ? Math.round(acc.monthlyContribution) : 0
        const overrideKey = `p-${acc.id}-${year}-${month}`
        const contrib = overrideKey in contribOverrides ? contribOverrides[overrideKey] : baseContrib
        const rate = (acc.tieredRates?.length && !(`rate-p-${acc.id}` in contribOverrides))
          ? getEffectiveRateFromTiers(acc.tieredRates, acc.runningBal)
          : (acc.rate || SAVINGS_RATE_TABLE)
        const monthlyInterest = acc.runningBal * rate / 100 / 12
        let bal: number
        if (month === 1) {
          bal = acc.runningBal + partnerAccruedInterest[j] + contrib
          partnerAccruedInterest[j] = monthlyInterest
        } else {
          bal = acc.runningBal + contrib
          partnerAccruedInterest[j] += monthlyInterest
        }
        acc.runningBal = bal
        return { id: acc.id, balance: bal, contribution: contrib, overrideKey, interest: monthlyInterest }
      })

      // Partner BSU — simple deposit, capped at BSU_MAX_TOTAL
      const rawPartnerBsuMnd = hasPartner ? Math.round(partnerVeikart.bsuMonthlyContribution ?? 0) : 0
      const partnerBsuRoom = Math.max(0, BSU_MAX_TOTAL - partnerBsuBal)
      const partnerBsuMnd = Math.min(rawPartnerBsuMnd, partnerBsuRoom)
      if (hasPartner) partnerBsuBal = partnerBsuBal + partnerBsuMnd

      const partnerFondVal = hasPartner ? (partnerVeikart.fondCurrentValue ?? 0) : 0
      const totalEK =
        accountBalances.reduce((s, a) => s + a.balance, 0) +
        (hasFond ? fondBal : 0) +
        (hasPartner ? partnerAccBalances.reduce((s, a) => s + a.balance, 0) + partnerBsuBal + partnerFondVal : 0)

      const partnerDebtBase = hasPartner
        ? ((partnerVeikart.debts ?? []).length > 0
            ? (partnerVeikart.debts ?? []).reduce((s, d) => s + d.currentBalance, 0)
            : partnerVeikart.debt ?? 0)
        : 0
      const partnerDebt = 'partner-debt' in contribOverrides ? contribOverrides['partner-debt'] : partnerDebtBase
      const myDebtBalance = Math.round(debts
        .filter(d => d.status !== 'nedbetalt')
        .reduce((s, d) => s + projectDebtBalance(d, i + 1), 0))
      const debtBalance = myDebtBalance + partnerDebt
      // Lønnsvekst: 3% (eller override) per år fra nåværende år
      const growthFactor = Math.pow(1 + salaryGrowthPct / 100, year - currentYear)
      const projectedMyIncome = myAnnualIncome * growthFactor
      const projectedPartnerIncome = partnerOnlyAnnualIncome * growthFactor
      const projectedAnnualIncome = projectedMyIncome + projectedPartnerIncome
      const myEK = accountBalances.reduce((s, a) => s + a.balance, 0) + (hasFond ? fondBal : 0)
      const partnerEK = hasPartner ? partnerAccBalances.reduce((s, a) => s + a.balance, 0) + partnerBsuBal + partnerFondVal : 0
      const maxKjøpesum = projectedAnnualIncome > 0 ? calcMaxPurchase(totalEK, projectedAnnualIncome, debtBalance) : 0
      const maxKjøpesumMeg = projectedMyIncome > 0 ? calcMaxPurchase(myEK, projectedMyIncome, debtBalance) : 0
      const maxKjøpesumPartner = projectedPartnerIncome > 0 ? calcMaxPurchase(partnerEK, projectedPartnerIncome, debtBalance) : 0

      return {
        year, month,
        accountBalances,
        fondBalance: fondBal,
        fondContrib: Math.round(effectiveFondMnd),
        fondInterest: Math.round(fondInterest),
        fondPeriod: activeFondPeriod,
        partnerAccBalances,
        partnerBsuBalance: partnerBsuBal,
        partnerBsuContrib: partnerBsuMnd,
        totalEK,
        maxKjøpesum,
        maxKjøpesumMeg,
        maxKjøpesumPartner,
        debtBalance: Math.round(debtBalance),
        myDebtBalance,
        partnerDebtBalance: Math.round(partnerDebt),
      }
    })

    return { accMeta, partnerAccMeta: partnerAccMeta as PartnerAccount[], monthRows }
  }, [accounts, fondCurrentValue, fondPortfolio, fondMonthlyDeposit, debts, annualIncome, myAnnualIncome, partnerOnlyAnnualIncome, salaryGrowthPct, hasFond, hasPartner, partnerVeikart, now, contribOverrides])

  const years = [...new Set(monthRows.map(r => r.year))]

  // Column spans for group headers
  const userCols = accMeta.length * 2 + (hasFond ? 2 : 0)
  const hasBsu = hasPartner && (partnerVeikart.bsu > 0 || partnerVeikart.bsuMonthlyContribution > 0)
  const partnerCols = hasPartner ? (hasBsu ? 2 : 0) + partnerAccMeta.length * 2 : 0

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Action toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-muted/20 shrink-0 text-xs">
        <span className="text-muted-foreground">Legg til data:</span>
        <button
          onClick={() => setSavingsTab('kontoer')}
          className="flex items-center gap-1 px-2 py-1 rounded border border-border hover:bg-muted/40 transition-colors text-foreground"
        >
          + Min konto
        </button>
        <button
          onClick={() => setSavingsTab('fond')}
          className="flex items-center gap-1 px-2 py-1 rounded border border-border hover:bg-muted/40 transition-colors text-foreground"
        >
          + Fond
        </button>
        <button
          onClick={() => setCurrentView('partner')}
          className="flex items-center gap-1 px-2 py-1 rounded border border-border hover:bg-muted/40 transition-colors text-violet-400"
        >
          + Partner konto
        </button>
        {partnerStatus === 'connected' && (
          <button
            onClick={syncPartner}
            className="flex items-center gap-1 px-2 py-1 rounded border border-border hover:bg-muted/40 transition-colors text-violet-400"
          >
            {syncDone ? '✓ Importert' : '⟳ Synk'}
          </button>
        )}
        {!partnerVeikart.enabled && (
          <span className="text-muted-foreground italic ml-1">Partner ikke aktivert — aktiver i Innstillinger</span>
        )}
        <span className="ml-auto flex items-center gap-2 text-muted-foreground">
          {myAnnualIncome > 0 && (
            <span className="flex items-center gap-1">
              <span>Årslønn:</span>
              <span className="text-foreground font-medium">{Math.round(myAnnualIncome / 1000)}k</span>
            </span>
          )}
          <span className="flex items-center gap-1">
            <span>Lønnsvekst:</span>
            <input
              type="number"
              value={salaryGrowthPct}
              onChange={e => setSavingsOverride('salary-growth', parseFloat(e.target.value) || 0)}
              className="w-10 bg-muted/30 text-right rounded px-1 py-0.5 text-xs outline-none border border-border focus:border-primary"
            />
            <span>%/år</span>
          </span>
          {hasPartner && (() => {
            const debtBase = (partnerVeikart.debts ?? []).length > 0
              ? (partnerVeikart.debts ?? []).reduce((s, d) => s + d.currentBalance, 0)
              : partnerVeikart.debt ?? 0
            return (
              <span className="flex items-center gap-1 text-violet-400/80">
                <span>Partner gjeld:</span>
                <input
                  type="number"
                  min={0}
                  step={10000}
                  value={contribOverrides['partner-debt'] ?? debtBase}
                  onChange={e => {
                    const val = parseFloat(e.target.value) || 0
                    setSavingsOverride('partner-debt', val)
                  }}
                  className="w-20 bg-muted/30 text-right rounded px-1 py-0.5 text-xs outline-none border border-border focus:border-primary text-violet-300"
                />
                <span>kr</span>
              </span>
            )
          })()}
        </span>
        {Object.keys(contribOverrides).length > 0 && (
          <button
            onClick={() => clearAllSavingsOverrides()}
            className="flex items-center gap-1 px-2 py-1 rounded border border-amber-500/40 text-amber-400 hover:bg-amber-500/10 transition-colors"
          >
            ↺ Tilbakestill ({Object.keys(contribOverrides).length})
          </button>
        )}
      </div>
      {hasFond && (() => {
        const d = now.getDate()
        const isNearTwelfth = d >= 10 && d <= 14
        const lastSnapshotYm = [...(fondPortfolio?.snapshots ?? [])].sort((a, b) => b.date.localeCompare(a.date))[0]?.date.slice(0, 7) ?? ''
        const thisYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
        const missingThisMonth = lastSnapshotYm < thisYm
        if (!isNearTwelfth && !missingThisMonth) return null
        return (
          <div className="mx-0 px-3 py-2 flex items-center gap-2 bg-teal-900/20 border-b border-teal-500/20 text-teal-300 text-xs">
            <span>📊</span>
            <span>Husk å legge inn fondsaldo for {thisYm.replace('-', '/')} i <b>Fond-fanen</b></span>
            {lastSnapshotYm && <span className="text-teal-500/60 ml-auto">Siste: {lastSnapshotYm}</span>}
          </div>
        )
      })()}
      <div className="overflow-auto flex-1 text-xs">
      <table className="border-collapse w-full min-w-max">
        <thead className="sticky top-0 z-10 bg-background backdrop-blur-none [&_th]:bg-background">
          {/* Row 1: Person groups */}
          <tr>
            <th className="sticky left-0 bg-background z-20 px-3 py-1 border-r border-border border-b border-border/40" />
            <th colSpan={userCols} className="bg-background px-3 py-1 text-center border-r-2 border-r-primary/30 border-b-2 border-b-primary/40 text-xs font-bold tracking-wide text-primary/80 uppercase">
              Meg
            </th>
            {hasPartner && (
              <th colSpan={partnerCols} className="bg-background px-3 py-1 text-center border-r-2 border-r-violet-400/30 border-b-2 border-b-violet-400/40 text-xs font-bold tracking-wide text-violet-400/80 uppercase">
                {partnerVeikart.partnerName ?? 'Partner'}
              </th>
            )}
            <th colSpan={hasPartner ? 4 : 2} className="bg-background px-2 py-1 text-center border-r-2 border-r-red-400/30 border-b-2 border-b-red-400/40 text-xs font-bold tracking-wide text-red-400/60 uppercase">Gjeld</th>
            <th colSpan={1 + (myAnnualIncome > 0 ? 1 : 0) + (hasPartner && partnerOnlyAnnualIncome > 0 ? 1 : 0)} className="bg-background px-2 py-1 text-center border-b-2 border-b-green-400/40 text-xs font-bold tracking-wide text-green-400/60 uppercase">Kjøpekraft</th>
          </tr>
          {/* Row 2: Account names */}
          <tr className="border-b border-border">
            <th className="sticky left-0 bg-background z-20 px-3 py-1.5 text-left border-r border-border w-24" />
            {accMeta.map(acc => (
              <th key={acc.id} colSpan={2} className="px-3 py-1.5 text-center border-r border-border font-semibold whitespace-nowrap">
                {acc.label}
                {editingRateId === acc.id ? (
                  <input
                    autoFocus
                    type="number"
                    step="0.01"
                    min={0}
                    max={20}
                    defaultValue={acc.rate}
                    className="ml-1 w-12 text-[10px] font-normal rounded border border-border bg-background px-1 outline-none focus:border-primary text-center"
                    onBlur={(e) => {
                      const v = parseFloat(e.target.value)
                      if (!isNaN(v)) setSavingsOverride(`rate-${acc.id}`, v)
                      setEditingRateId(null)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                      if (e.key === 'Escape') setEditingRateId(null)
                    }}
                  />
                ) : (
                  <button
                    className="ml-1 text-[10px] text-muted-foreground font-normal hover:text-primary transition-colors"
                    onClick={() => setEditingRateId(acc.id)}
                    title="Klikk for å endre rente"
                  >
                    {acc.rate.toFixed(2)}%
                  </button>
                )}
              </th>
            ))}
            {hasFond && (
              <th colSpan={2} className="px-3 py-1.5 text-center border-r border-border text-teal-400 font-semibold whitespace-nowrap">
                Fond
              </th>
            )}
            {hasPartner && hasBsu && (
              <th colSpan={2} className="px-3 py-1.5 text-center border-r border-border text-violet-300 font-semibold whitespace-nowrap">BSU</th>
            )}
            {partnerAccMeta.map(acc => (
              <th key={acc.id} colSpan={2} className="px-3 py-1.5 text-center border-r border-border text-violet-300 font-semibold whitespace-nowrap">
                {acc.label}
                {acc.rate > 0 && <span className="ml-1 text-[10px] text-muted-foreground font-normal">{acc.rate}%</span>}
                {(acc.fromDate || acc.toDate) && (
                  <span className="ml-1 text-[10px] text-amber-400 font-normal">
                    {acc.fromDate ? acc.fromDate.slice(0, 7) : '…'}–{acc.toDate ? acc.toDate.slice(0, 7) : '…'}
                  </span>
                )}
              </th>
            ))}
            <th className="bg-background px-3 py-1.5 text-right border-l-2 border-l-red-400/30 border-r border-border text-blue-400 font-semibold whitespace-nowrap">Total EK</th>
            <th className="bg-background px-2 py-1.5 text-right border-r border-border text-red-400/50 font-semibold whitespace-nowrap">Meg</th>
            {hasPartner && <th className="bg-background px-2 py-1.5 text-right border-r border-border text-red-400/50 font-semibold whitespace-nowrap">{partnerVeikart.partnerName ?? 'Partner'}</th>}
            <th className="bg-background px-2 py-1.5 text-right border-r-2 border-r-red-400/30 text-red-400/70 font-semibold whitespace-nowrap">∑</th>
            <th className="bg-background px-3 py-1.5 text-right border-l-2 border-l-green-400/30 border-r border-border text-green-400 font-semibold whitespace-nowrap">Samlet</th>
            {myAnnualIncome > 0 && <th className="bg-background px-3 py-1.5 text-right border-r border-border text-green-400/70 font-semibold whitespace-nowrap">Meg</th>}
            {hasPartner && partnerOnlyAnnualIncome > 0 && <th className="bg-background px-3 py-1.5 text-right text-violet-400/70 font-semibold whitespace-nowrap">{partnerVeikart.partnerName ?? 'Partner'}</th>}
          </tr>
          {/* Row 3: Innskudd / Saldo sub-headers */}
          <tr className="border-b-2 border-border">
            <th className="sticky left-0 bg-background z-20 px-3 py-1 text-left text-muted-foreground border-r border-border">Måned</th>
            {accMeta.map(acc => (
              <th key={acc.id} colSpan={2} className="border-r border-border p-0">
                <div className="flex">
                  <span className="flex-1 px-3 py-1 text-right text-muted-foreground font-normal" title="Innskudd per måned / Renteopptjening per år">Innskudd</span>
                  <span className="flex-1 px-3 py-1 flex items-center justify-end font-medium"><span className="flex-1 text-right">Saldo</span><span className="shrink-0 min-w-[3.5rem]" /></span>
                </div>
              </th>
            ))}
            {hasFond && (
              <th colSpan={2} className="border-r border-border p-0">
                <div className="flex">
                  <span className="flex-1 px-3 py-1 text-right text-muted-foreground font-normal" title="Innskudd per måned / Renteopptjening per år">Innskudd</span>
                  <span className="flex-1 px-3 py-1 flex items-center justify-end text-teal-400 font-medium"><span className="flex-1 text-right">Saldo</span><span className="shrink-0 min-w-[3.5rem]" /></span>
                </div>
              </th>
            )}
            {hasPartner && hasBsu && (
              <th colSpan={2} className="border-r border-border p-0">
                <div className="flex">
                  <span className="flex-1 px-3 py-1 text-right text-muted-foreground font-normal" title="Innskudd per måned / Renteopptjening per år">Innskudd</span>
                  <span className="flex-1 px-3 py-1 flex items-center justify-end text-violet-300 font-medium"><span className="flex-1 text-right">Saldo</span><span className="shrink-0 min-w-[3.5rem]" /></span>
                </div>
              </th>
            )}
            {partnerAccMeta.map(acc => (
              <th key={acc.id} colSpan={2} className="border-r border-border p-0">
                <div className="flex">
                  <span className="flex-1 px-3 py-1 text-right text-muted-foreground font-normal" title="Innskudd per måned / Renteopptjening per år">Innskudd</span>
                  <span className="flex-1 px-3 py-1 flex items-center justify-end text-violet-300 font-medium"><span className="flex-1 text-right">Saldo</span><span className="shrink-0 min-w-[3.5rem]" /></span>
                </div>
              </th>
            ))}
            <th className="bg-background px-3 py-1 border-l-2 border-l-red-400/30 border-r border-border" />
            <th className="bg-background px-3 py-1 border-r border-border" />
            {hasPartner && <th className="bg-background px-3 py-1 border-r border-border" />}
            <th className="bg-background px-3 py-1 border-r-2 border-r-red-400/30" />
            <th className="bg-background px-3 py-1 border-l-2 border-l-green-400/30 border-r border-border" />
            {myAnnualIncome > 0 && <th className="bg-background px-3 py-1 border-r border-border" />}
            {hasPartner && partnerOnlyAnnualIncome > 0 && <th className="bg-background px-3 py-1" />}
          </tr>
        </thead>
        <tbody>
          {years.map(year => {
            const yearData = monthRows.filter(r => r.year === year)
            const isFirstYear = year === years[0]
            const prevYearRows = isFirstYear ? [] : monthRows.filter(r => r.year === year - 1)
            const prevYearLast = prevYearRows[prevYearRows.length - 1]
            return (
              <Fragment key={year}>
                {/* Year row: første år = startsaldo (redigerbar); påfølgende år = forrige år summary */}
                <tr className="bg-muted/60 border-y-2 border-border">
                  <td className="sticky left-0 bg-muted/60 px-3 py-2 font-bold text-sm border-r border-border">{year}</td>
                  {accMeta.map(acc => {
                    if (isFirstYear) {
                      return (
                        <td key={acc.id} colSpan={2} className="border-r border-border p-0">
                          <div className="flex items-center">
                            <span className="flex-1" />
                            <span className="flex-1 px-3 py-2 text-right font-semibold">
                              <InnskuddCell
                                value={acc.startBalance}
                                isOverridden={`start-${acc.id}` in contribOverrides}
                                onChange={v => setContribOverrides(prev => ({ ...prev, [`start-${acc.id}`]: v }))}
                              />
                            </span>
                          </div>
                        </td>
                      )
                    }
                    const openingBal = prevYearLast?.accountBalances.find(a => a.id === acc.id)?.balance ?? 0
                    const prevRente = Math.round(prevYearRows.reduce((s, r) => s + (r.accountBalances.find(a => a.id === acc.id)?.interest ?? 0), 0))
                    const prevInnskudd = Math.round(prevYearRows.reduce((s, r) => s + (r.accountBalances.find(a => a.id === acc.id)?.contribution ?? 0), 0))
                    return (
                      <td key={acc.id} colSpan={2} className="border-r border-border p-0">
                        <div className="flex items-baseline">
                          <span className="flex-1 px-3 py-2 text-right tabular-nums text-muted-foreground">
                            {prevInnskudd > 0 ? prevInnskudd.toLocaleString('no-NO') : '—'}
                          </span>
                          <span className="flex-1 px-3 py-2 text-right font-semibold whitespace-nowrap flex items-baseline justify-end">
                            <span>{fmtNOK(openingBal)}</span>
                            <span className="text-[10px] text-green-400/80 ml-1 min-w-[3.5rem] text-right shrink-0">
                              {prevRente > 0 ? `(+${prevRente.toLocaleString('no-NO')})` : ''}
                            </span>
                          </span>
                        </div>
                      </td>
                    )
                  })}
                  {hasFond && (() => {
                    if (isFirstYear) {
                      return (
                        <td colSpan={2} className="border-r border-border p-0">
                          <div className="flex items-center">
                            <span className="flex-1" />
                            <span className="flex-1 px-3 py-2 text-right font-semibold text-teal-400">
                              <InnskuddCell
                                value={contribOverrides['start-fond'] ?? fondCurrentValue}
                                isOverridden={'start-fond' in contribOverrides}
                                onChange={v => setContribOverrides(prev => ({ ...prev, 'start-fond': v }))}
                              />
                            </span>
                          </div>
                        </td>
                      )
                    }
                    const fondOpening = prevYearLast?.fondBalance ?? 0
                    const prevFondRente = Math.round(prevYearRows.reduce((s, r) => s + r.fondInterest, 0))
                    const prevFondInnskudd = Math.round(prevYearRows.reduce((s, r) => s + r.fondContrib, 0))
                    return (
                      <td colSpan={2} className="border-r border-border p-0">
                        <div className="flex items-baseline">
                          <span className="flex-1 px-3 py-2 text-right tabular-nums text-muted-foreground">
                            {prevFondInnskudd > 0 ? prevFondInnskudd.toLocaleString('no-NO') : '—'}
                          </span>
                          <span className="flex-1 px-3 py-2 text-right text-teal-400 font-semibold whitespace-nowrap flex items-baseline justify-end">
                            <span>{fmtNOK(fondOpening)}</span>
                            <span className="text-[10px] text-green-400/80 ml-1 min-w-[3.5rem] text-right shrink-0">
                              {prevFondRente > 0 ? `(+${prevFondRente.toLocaleString('no-NO')})` : ''}
                            </span>
                          </span>
                        </div>
                      </td>
                    )
                  })()}
                  {hasPartner && hasBsu && (() => {
                    if (isFirstYear) {
                      return (
                        <td colSpan={2} className="border-r border-border p-0">
                          <div className="flex items-center">
                            <span className="flex-1" />
                            <span className="flex-1 px-3 py-2 text-right font-semibold text-violet-300">
                              <InnskuddCell
                                value={contribOverrides['start-p-bsu'] ?? (partnerVeikart.bsu ?? 0)}
                                isOverridden={'start-p-bsu' in contribOverrides}
                                onChange={v => setSavingsOverride('start-p-bsu', v)}
                              />
                            </span>
                          </div>
                        </td>
                      )
                    }
                    const bsuOpening = prevYearLast?.partnerBsuBalance ?? 0
                    const prevBsuInnskudd = Math.round(prevYearRows.reduce((s, r) => s + r.partnerBsuContrib, 0))
                    return (
                      <td colSpan={2} className="border-r border-border p-0">
                        <div className="flex items-baseline">
                          <span className="flex-1 px-3 py-2 text-right tabular-nums text-muted-foreground">
                            {prevBsuInnskudd > 0 ? prevBsuInnskudd.toLocaleString('no-NO') : '—'}
                          </span>
                          <span className="flex-1 px-3 py-2 text-right text-violet-300 font-semibold whitespace-nowrap">{fmtNOK(bsuOpening)}</span>
                        </div>
                      </td>
                    )
                  })()}
                  {partnerAccMeta.map(acc => {
                    if (isFirstYear) {
                      return (
                        <td key={acc.id} colSpan={2} className="border-r border-border p-0">
                          <div className="flex items-center">
                            <span className="flex-1" />
                            <span className="flex-1 px-3 py-2 text-right font-semibold text-violet-300">
                              <InnskuddCell
                                value={contribOverrides[`start-p-${acc.id}`] ?? acc.balance}
                                isOverridden={`start-p-${acc.id}` in contribOverrides}
                                onChange={v => setSavingsOverride(`start-p-${acc.id}`, v)}
                              />
                            </span>
                          </div>
                        </td>
                      )
                    }
                    const openingBal = prevYearLast?.partnerAccBalances.find(a => a.id === acc.id)?.balance ?? 0
                    const prevRente = Math.round(prevYearRows.reduce((s, r) => s + (r.partnerAccBalances.find(a => a.id === acc.id)?.interest ?? 0), 0))
                    const prevInnskudd = Math.round(prevYearRows.reduce((s, r) => s + (r.partnerAccBalances.find(a => a.id === acc.id)?.contribution ?? 0), 0))
                    return (
                      <td key={acc.id} colSpan={2} className="border-r border-border p-0">
                        <div className="flex items-baseline">
                          <span className="flex-1 px-3 py-2 text-right tabular-nums text-muted-foreground">
                            {prevInnskudd > 0 ? prevInnskudd.toLocaleString('no-NO') : '—'}
                          </span>
                          <span className="flex-1 px-3 py-2 text-right text-violet-300 font-semibold whitespace-nowrap flex items-baseline justify-end">
                            <span>{fmtNOK(openingBal)}</span>
                            <span className="text-[10px] text-green-400/80 ml-1 min-w-[3.5rem] text-right shrink-0">
                              {prevRente > 0 ? `(+${prevRente.toLocaleString('no-NO')})` : ''}
                            </span>
                          </span>
                        </div>
                      </td>
                    )
                  })}
                  {/* Summary columns: show previous year-end values (= this year's opening EK/debt/kjøpekraft) */}
                  <td className="px-3 py-2 text-right font-mono text-blue-400 font-semibold border-l-2 border-l-red-400/20 border-r border-border whitespace-nowrap">{prevYearLast ? fmtNOK(prevYearLast.totalEK) : '—'}</td>
                  <td className="px-2 py-2 text-right font-mono text-red-400/50 font-semibold border-r border-border whitespace-nowrap">{prevYearLast?.myDebtBalance ? '-' + fmtNOK(prevYearLast.myDebtBalance) : '—'}</td>
                  {hasPartner && <td className="px-2 py-2 text-right font-mono text-red-400/50 font-semibold border-r border-border whitespace-nowrap">{prevYearLast?.partnerDebtBalance ? '-' + fmtNOK(prevYearLast.partnerDebtBalance) : '—'}</td>}
                  <td className="px-2 py-2 text-right font-mono text-red-400/70 font-semibold border-r-2 border-r-red-400/30 whitespace-nowrap">{prevYearLast?.debtBalance ? '-' + fmtNOK(prevYearLast.debtBalance) : '—'}</td>
                  <td className="px-3 py-2 text-right font-mono text-green-400 font-semibold border-l-2 border-l-green-400/20 border-r border-border whitespace-nowrap">{prevYearLast?.maxKjøpesum ? fmtNOK(prevYearLast.maxKjøpesum) : '—'}</td>
                  {myAnnualIncome > 0 && <td className="px-3 py-2 text-right font-mono text-green-400/70 font-semibold border-r border-border whitespace-nowrap">{prevYearLast?.maxKjøpesumMeg ? fmtNOK(prevYearLast.maxKjøpesumMeg) : '—'}</td>}
                  {hasPartner && partnerOnlyAnnualIncome > 0 && <td className="px-3 py-2 text-right font-mono text-violet-400/70 font-semibold whitespace-nowrap">{prevYearLast?.maxKjøpesumPartner ? fmtNOK(prevYearLast.maxKjøpesumPartner) : '—'}</td>}
                </tr>
                {/* Monthly rows */}
                {yearData.map(row => (
                  <tr key={`${row.year}-${row.month}`} className="border-b border-border/20 hover:bg-muted/10">
                    <td className="sticky left-0 bg-background px-3 py-1 text-muted-foreground border-r border-border whitespace-nowrap">
                      {FULL_MONTH_NAMES[row.month - 1]}
                    </td>
                    {accMeta.map(acc => {
                      const ab = row.accountBalances.find(a => a.id === acc.id)!
                      return (
                        <td key={acc.id} colSpan={2} className="border-r border-border p-0">
                          <div className="flex items-center">
                            <span className="flex-1 px-3 py-1 flex items-center justify-end">
                              <InnskuddCell
                                value={ab.contribution}
                                isOverridden={ab.overrideKey in contribOverrides}
                                onChange={v => setMonthOverride(acc.id, row.year, row.month, v)}
                                onFillDown={v => fillDown(acc.id, row.year, row.month, v)}
                              />
                            </span>
                            <span className="flex-1 px-3 py-1 flex items-baseline justify-end font-mono whitespace-nowrap">
                              <span>{fmtNOK(ab.balance)}</span>
                              <span className="text-[10px] text-green-400/60 ml-1 inline-block min-w-[3.5rem] text-right shrink-0">
                                {ab.interest > 0 ? `(+${Math.round(ab.interest).toLocaleString('no-NO')})` : ''}
                              </span>
                            </span>
                          </div>
                        </td>
                      )
                    })}
                    {hasFond && (
                      <td colSpan={2} className="border-r border-border p-0">
                        <div className="flex items-center">
                          <span className="flex-1 px-3 py-1 flex items-center justify-end">
                            {row.fondPeriod && !(`fond-${row.year}-${row.month}` in contribOverrides) ? (
                              <span
                                className="flex items-center gap-1"
                                title={`Spareperiode: ${Math.round(row.fondPeriod.amount).toLocaleString('no-NO')} kr/mnd${row.fondPeriod.fromDate ? ` · fra ${row.fondPeriod.fromDate.slice(0, 7)}` : ''}${row.fondPeriod.toDate ? ` → ${row.fondPeriod.toDate.slice(0, 7)}` : ''}`}
                              >
                                <InnskuddCell
                                  value={row.fondContrib}
                                  isOverridden={false}
                                  onChange={v => setMonthOverride('fond', row.year, row.month, v)}
                                  onFillDown={v => fillDown('fond', row.year, row.month, v)}
                                />
                                <span className="shrink-0 rounded px-1 py-0.5 text-[9px] font-medium bg-teal-900/40 text-teal-400 leading-none">P</span>
                              </span>
                            ) : (
                            <InnskuddCell
                              value={row.fondContrib}
                              isOverridden={`fond-${row.year}-${row.month}` in contribOverrides}
                              onChange={v => setMonthOverride('fond', row.year, row.month, v)}
                              onFillDown={v => fillDown('fond', row.year, row.month, v)}
                            />
                            )}
                          </span>
                          <span className="flex-1 px-3 py-1 flex items-baseline justify-end font-mono text-teal-400 whitespace-nowrap">
                            <span>{fmtNOK(row.fondBalance)}</span>
                            <span className="text-[10px] text-green-400/60 ml-1 inline-block min-w-[3.5rem] text-right shrink-0">
                              {row.fondInterest > 0 ? `(+${row.fondInterest.toLocaleString('no-NO')})` : ''}
                            </span>
                          </span>
                        </div>
                      </td>
                    )}
                    {hasPartner && hasBsu && (
                      <td colSpan={2} className="border-r border-border p-0">
                        <div className="flex items-center">
                          <span className="flex-1 px-3 py-1 text-right text-muted-foreground whitespace-nowrap">{Math.round(row.partnerBsuContrib).toLocaleString('no-NO')}</span>
                          <span className="flex-1 px-3 py-1 text-right font-mono text-violet-300 whitespace-nowrap">{fmtNOK(row.partnerBsuBalance)}</span>
                        </div>
                      </td>
                    )}
                    {row.partnerAccBalances.map(ab => (
                        <td key={ab.id} colSpan={2} className="border-r border-border p-0">
                          <div className="flex items-center">
                            <span className="flex-1 px-3 py-1 flex items-center justify-end">
                              <InnskuddCell
                                value={ab.contribution}
                                isOverridden={ab.overrideKey in contribOverrides}
                                onChange={v => setSavingsOverride(ab.overrideKey, v)}
                                onFillDown={v => fillDown(`p-${ab.id}`, row.year, row.month, v)}
                              />
                            </span>
                            <span className="flex-1 px-3 py-1 flex items-baseline justify-end font-mono text-violet-300 whitespace-nowrap">
                              <span>{fmtNOK(ab.balance)}</span>
                              <span className="text-[10px] text-green-400/60 ml-1 inline-block min-w-[3.5rem] text-right shrink-0">
                                {ab.interest > 0 ? `(+${Math.round(ab.interest).toLocaleString('no-NO')})` : ''}
                              </span>
                            </span>
                          </div>
                        </td>
                    ))}
                    <td className="px-3 py-1 text-right font-mono text-blue-300 border-l-2 border-l-red-400/20 border-r border-border whitespace-nowrap">{fmtNOK(row.totalEK)}</td>
                    <td className="px-2 py-1 text-right font-mono text-red-400/40 border-r border-border whitespace-nowrap">{row.myDebtBalance > 0 ? '-' + fmtNOK(row.myDebtBalance) : '—'}</td>
                    {hasPartner && <td className="px-2 py-1 text-right font-mono text-red-400/40 border-r border-border whitespace-nowrap">{row.partnerDebtBalance > 0 ? '-' + fmtNOK(row.partnerDebtBalance) : '—'}</td>}
                    <td className="px-2 py-1 text-right font-mono text-red-400/50 border-r-2 border-r-red-400/30 whitespace-nowrap">{row.debtBalance > 0 ? '-' + fmtNOK(row.debtBalance) : '—'}</td>
                    <td className="px-3 py-1 text-right font-mono text-green-300/60 border-l-2 border-l-green-400/20 border-r border-border whitespace-nowrap">{row.maxKjøpesum > 0 ? fmtNOK(row.maxKjøpesum) : '—'}</td>
                    {myAnnualIncome > 0 && <td className="px-3 py-1 text-right font-mono text-green-300/40 border-r border-border whitespace-nowrap">{row.maxKjøpesumMeg > 0 ? fmtNOK(row.maxKjøpesumMeg) : '—'}</td>}
                    {hasPartner && partnerOnlyAnnualIncome > 0 && <td className="px-3 py-1 text-right font-mono text-violet-300/40 whitespace-nowrap">{row.maxKjøpesumPartner > 0 ? fmtNOK(row.maxKjøpesumPartner) : '—'}</td>}
                  </tr>
                ))}
              </Fragment>
            )
          })}
        </tbody>
      </table>
      </div>
    </div>
  )
}

// ─── Sparewizard ──────────────────────────────────────────────
function SavingsPlanWizard({
  accounts, onClose, onUpdateAccount, onSetTarget, currentTarget,
}: {
  accounts: SavingsAccount[]
  onClose: () => void
  onUpdateAccount: (id: string, patch: Partial<SavingsAccount>) => void
  onSetTarget: (price: number) => void
  currentTarget: number
}) {
  const [step, setStep] = useState(0)
  const steps = ['BSU-optimering', 'Fondstrategi', 'Buffer', 'Boligmål']
  const bsu = accounts.find((a) => a.type === 'BSU')
  const fond = accounts.find((a) => a.type === 'fond')
  const buffer = accounts.find((a) => a.type === 'sparekonto')
  const [bsuMonthly, setBsuMonthly] = useState(bsu?.monthlyContribution ?? 0)
  const [fondReturn, setFondReturn] = useState(fond?.expectedReturn ?? 6)
  const [bufferTarget, setBufferTarget] = useState(buffer?.monthlyContribution ?? 0)
  const [targetInput, setTargetInput] = useState(String(currentTarget || ''))

  function finish() {
    if (bsu) onUpdateAccount(bsu.id, { monthlyContribution: bsuMonthly })
    if (fond) onUpdateAccount(fond.id, { expectedReturn: fondReturn })
    if (buffer) onUpdateAccount(buffer.id, { monthlyContribution: bufferTarget })
    onSetTarget(parseFloat(targetInput) || 0)
    onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent
        showCloseButton={false}
        className="max-w-md p-0 rounded-t-2xl sm:rounded-2xl fixed bottom-0 sm:bottom-auto left-[50%] top-auto sm:top-[50%] translate-x-[-50%] translate-y-0 sm:translate-y-[-50%]"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h3 className="font-semibold text-sm">Sparewizard</h3>
            <p className="text-xs text-muted-foreground">Steg {step + 1} av {steps.length}: {steps[step]}</p>
          </div>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex gap-1 px-5 py-3">
          {steps.map((s, i) => (
            <div key={s} className={cn('h-1 flex-1 rounded-full transition-all',
              i < step ? 'bg-green-500' : i === step ? 'bg-primary' : 'bg-border')} />
          ))}
        </div>

        <div className="px-5 py-4 space-y-4 min-h-40">
          {step === 0 && (
            <>
              <p className="text-sm font-medium">BSU-optimering</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Du kan sette inn opptil <b>27 500 kr/år</b> på BSU og få <b>10 % skattefradrag</b>.
                Anbefalt månedlig innskudd: {fmtNOK(Math.round(27500 / 12))}.
              </p>
              {bsu ? (
                <div className="space-y-1">
                  <Label className="text-xs">Månedlig BSU-innskudd</Label>
                  <div className="flex items-center gap-2">
                    <Input type="number" step={100} value={bsuMonthly}
                      onChange={(e) => setBsuMonthly(parseFloat(e.target.value) || 0)}
                      className="h-8 text-xs w-32" />
                    <span className="text-xs text-muted-foreground">
                      → skattefradrag: <span className="text-green-400 font-mono">{fmtNOK(Math.min(bsuMonthly * 12, 27500) * 0.1)}/år</span>
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-amber-400">Ingen BSU-konto registrert. Legg til i «Kontoer».</p>
              )}
            </>
          )}
          {step === 1 && (
            <>
              <p className="text-sm font-medium">Fondstrategi</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Sett forventet gjennomsnittlig avkastning for simulering. Norsk historisk børssnitt er ca. 8–10 %, globalt ca. 6–8 %.
              </p>
              {fond ? (
                <div className="space-y-1">
                  <Label className="text-xs">Forventet avkastning</Label>
                  <div className="flex items-center gap-2">
                    <input type="range" min={2} max={14} step={0.5} value={fondReturn}
                      onChange={(e) => setFondReturn(parseFloat(e.target.value))}
                      className="flex-1 accent-primary" />
                    <span className="font-mono text-sm w-12 text-right">{fondReturn.toFixed(1)} %</span>
                  </div>
                  <div className="flex justify-between text-[9px] text-muted-foreground">
                    <span>Konservativ (2 %)</span><span>Historisk snitt (8 %)</span><span>Aggressiv (14 %)</span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-amber-400">Ingen fondkonto registrert. Legg til i «Kontoer».</p>
              )}
            </>
          )}
          {step === 2 && (
            <>
              <p className="text-sm font-medium">Buffer-konto</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Anbefalt buffer er 3–6 måneders faste utgifter. Sett månedlig innskudd til bufferkontoen.
              </p>
              {buffer ? (
                <div className="space-y-1">
                  <Label className="text-xs">Månedlig innskudd buffer</Label>
                  <Input type="number" step={100} value={bufferTarget}
                    onChange={(e) => setBufferTarget(parseFloat(e.target.value) || 0)}
                    className="h-8 text-xs w-32" />
                </div>
              ) : (
                <p className="text-xs text-amber-400">Ingen sparekonto registrert.</p>
              )}
            </>
          )}
          {step === 3 && (
            <>
              <p className="text-sm font-medium">Boligmål</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Sett ønsket boligpris. Simulatoren beregner når dere har nok egenkapital.
              </p>
              <div className="space-y-1">
                <Label className="text-xs">Ønsket boligpris</Label>
                <Input type="number" step={50000} placeholder="f.eks. 4 500 000"
                  value={targetInput}
                  onChange={(e) => setTargetInput(e.target.value)}
                  className="h-8 text-xs" />
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-t border-border">
          <Button variant="ghost" size="sm" disabled={step === 0}
            onClick={() => setStep((s) => s - 1)}>
            Forrige
          </Button>
          {step < steps.length - 1 ? (
            <Button size="sm" onClick={() => setStep((s) => s + 1)}>Neste</Button>
          ) : (
            <Button size="sm" className="bg-green-600 hover:bg-green-500" onClick={finish}>
              <Check className="h-3.5 w-3.5 mr-1" /> Ferdig
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ------------------------------------------------------------
// ACCOUNT CARD
// ------------------------------------------------------------

type AccountTab = 'innskudd' | 'uttak' | 'saldo' | 'rente'

function AccountCard({
  account,
  now,
  bankPresets,
  onRemove,
  onUpdate,
  onUpdateBalance,
  onUpdateRate,
  onAddContribution,
  onRemoveContribution,
  onAddWithdrawal,
  onRemoveWithdrawal,
  onUpdateBirthYear,
  onUpdateMonthlyContribution,
}: {
  account: SavingsAccount
  now: Date
  bankPresets: BankAccountPreset[]
  onRemove: () => void
  onUpdate: (patch: Partial<SavingsAccount>) => void
  onUpdateBalance: (e: BalanceHistoryEntry) => void
  onUpdateRate: (e: RateHistoryEntry) => void
  onAddContribution: (c: SavingsContribution) => void
  onRemoveContribution: (id: string) => void
  onAddWithdrawal: (w: WithdrawalEntry) => void
  onRemoveWithdrawal: (id: string) => void
  onUpdateBirthYear: (year: number) => void
  onUpdateMonthlyContribution: (amount: number) => void
}) {
  const [activeTab, setActiveTab] = useState<AccountTab | null>(null)
  const [showLog, setShowLog] = useState(false)
  const [editingAccount, setEditingAccount] = useState(false)
  const [bsuPickYear, setBsuPickYear] = useState<string>(String(now.getFullYear() + 2))
  const [bsuPickMonth, setBsuPickMonth] = useState<number>(now.getMonth() + 1)
  const [bsuPostRate, setBsuPostRate] = useState(3.0)
  const [editingBirthYear, setEditingBirthYear] = useState(false)
  const [birthYearInput, setBirthYearInput] = useState('')

  const currentYear = now.getFullYear()
  const currentBalance = computeEffectiveBalance(account, now)
  const sortedRates = [...account.rateHistory].sort((a, b) => b.fromDate.localeCompare(a.fromDate))
  const currentRate = sortedRates[0]?.rate ?? 0
  const isBSU = account.type === 'BSU'
  const bsuStatus = isBSU ? checkBSULimits(account, currentYear) : null
  const monthlyEstimate = computeMonthlyContributionEstimate(account)
  const ytdContribs = computeYTDContributions(account, currentYear)
  const bsuForecast = (isBSU && account.birthYear)
    ? computeBSUForecast(account, account.birthYear, currentBalance, bsuPostRate)
    : null
  const bsuMaxForecast = (isBSU && account.birthYear)
    ? computeBSUForecast(account, account.birthYear, currentBalance, bsuPostRate, BSU_MAX_YEARLY / 12)
    : null
  const interestIncome = (account.type !== 'fond' && account.type !== 'krypto')
    ? computeYearlyInterestIncome(account, currentYear)
    : 0
  const interestForecast = (account.type !== 'fond' && account.type !== 'krypto')
    ? computeYearlyInterestIncome(account, currentYear, true)
    : 0

  // Prognose: neste 24 måneder
  const projections = projectSavingsGrowth(account, {
    year: now.getFullYear() + 1,
    month: now.getMonth() + 1,
  })
  const chartData = projections.slice(0, 24).map((bal, i) => ({ month: i + 1, saldo: bal }))

  // Contributions sorted newest first
  const sortedContribs = [...(account.contributions ?? [])].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  )
  const sortedWithdrawals = [...(account.withdrawals ?? [])].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  )

  function handleTabClick(tab: AccountTab) {
    setActiveTab((v) => (v === tab ? null : tab))
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm">{account.label}</CardTitle>
            <p className="text-xs text-muted-foreground">
              {ACCOUNT_TYPE_LABELS[account.type]}
              {account.accountNumber && ` · ${account.accountNumber}`}
            </p>
          </div>
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              onClick={() => setEditingAccount(v => !v)}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400"
              onClick={onRemove}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
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
        {/* Stats grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
          <MiniStat label="Saldo" value={fmtNOK(currentBalance)} highlight />
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
          <MiniStat label="Årets innskudd" value={fmtNOK(ytdContribs || 0)} />
          {interestForecast > 0 ? (
            <MiniStat
              label={`Renteinntekter ${currentYear}`}
              value={fmtNOK(interestForecast)}
              subvalue={
                isBSU
                  ? `${fmtNOK(interestIncome)} opptjent hittil`
                  : interestIncome < interestForecast
                    ? `${fmtNOK(interestIncome)} kreditert hittil`
                    : 'prognose hele året'
              }
            />
          ) : (
            <MiniStat
              label="Est. månedsspar"
              value={fmtNOK(monthlyEstimate)}
              subvalue={ytdContribs > 0 ? 'snitt siste 12 mnd' : 'planlagt bidrag'}
            />
          )}
        </div>


        {/* Rentehistorikk */}
        {sortedRates.length > 1 && (
          <div className="rounded-md border border-border/50 overflow-hidden">
            <div className="bg-muted/20 px-3 py-1.5 text-xs font-medium text-muted-foreground">Rentehistorikk</div>
            {sortedRates.map((r, i) => (
              <div key={r.fromDate} className="flex items-center justify-between px-3 py-1.5 text-xs border-t border-border/30">
                <span className="text-muted-foreground">Fra {fmtDate(r.fromDate)}</span>
                <span className={i === 0 ? 'font-medium text-foreground' : 'text-muted-foreground'}>
                  {r.rate.toFixed(2)} %
                </span>
              </div>
            ))}
          </div>
        )}

        {/* BSU-spesifikk */}
        {bsuStatus && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>BSU-kvote {currentYear}</span>
              <span>{fmtNOK(bsuStatus.yearlyContributionSoFar)} / 27 500 kr</span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Total BSU-tak</span>
              <span>{fmtNOK(currentBalance)} / 300 000 kr</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">
                Skattefradrag {currentYear}: <span className="text-green-500 font-medium">{fmtNOK(Math.round(Math.min(bsuStatus.yearlyContributionSoFar, 27500) * 0.1))}</span>
              </span>
            </div>
            {bsuStatus.warning && (
              <p className="text-xs text-yellow-400">{bsuStatus.warning}</p>
            )}

            {/* BSU aldersprognose */}
            {bsuForecast && (() => {
              const pickY = parseInt(bsuPickYear)
              const validPickY = pickY && pickY >= currentYear && pickY <= 2060 ? pickY : null
              const displayYear = validPickY ?? bsuForecast.cutoffYear
              const displayMonth = bsuPickMonth // 1–12

              // Lineær interpolasjon mellom år-slutt verdier for månedlig prognose
              function interpolate(atYear: (y: number) => number, year: number, month: number) {
                const prev = year === currentYear ? currentBalance : atYear(year - 1)
                const next = atYear(year)
                return Math.round(prev + (next - prev) * (month / 12))
              }

              const balance = interpolate(bsuForecast.balanceAtYear, displayYear, displayMonth)
              const contribs = interpolate(bsuForecast.contributionsAtYear, displayYear, displayMonth)
              const interest = interpolate(bsuForecast.interestAtYear, displayYear, displayMonth)
              const maxBalance = interpolate(bsuMaxForecast!.balanceAtYear, displayYear, displayMonth)
              const maxContribs = interpolate(bsuMaxForecast!.contributionsAtYear, displayYear, displayMonth)
              const maxInterest = interpolate(bsuMaxForecast!.interestAtYear, displayYear, displayMonth)

              const MONTH_NAMES_NO = ['jan','feb','mar','apr','mai','jun','jul','aug','sep','okt','nov','des']
              return (
                <div className="rounded-md border border-border/50 mt-2 overflow-hidden">
                  <div className="bg-muted/20 px-3 py-1.5 text-xs font-medium text-muted-foreground flex items-center justify-between">
                    <span>BSU-prognose</span>
                    <div className="flex items-center gap-1.5 text-muted-foreground font-normal">
                      <span>Sparerente etter {bsuForecast.rateDropYear}:</span>
                      <input
                        type="number"
                        step="0.1"
                        min={0}
                        max={10}
                        className="h-5 w-12 text-xs rounded border border-border/60 bg-background px-1.5"
                        value={bsuPostRate}
                        onChange={(e) => setBsuPostRate(parseFloat(e.target.value) || 0)}
                      />
                      <span>%</span>
                    </div>
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border/30">
                        <th className="text-left px-3 py-1.5 font-normal text-muted-foreground w-1/2">
                          <div className="flex items-center gap-1 flex-wrap">
                            <span>Per</span>
                            <select
                              className="h-5 text-xs rounded border border-border bg-background px-1 font-normal text-foreground"
                              value={bsuPickMonth}
                              onChange={(e) => setBsuPickMonth(parseInt(e.target.value))}
                            >
                              {MONTH_NAMES_NO.map((mn, i) => (
                                <option key={i + 1} value={i + 1}>{mn}</option>
                              ))}
                            </select>
                            <input
                              type="number"
                              min={currentYear}
                              max={2060}
                              className="h-5 w-14 rounded border border-border bg-background px-1.5 font-normal text-foreground text-xs"
                              value={bsuPickYear}
                              onChange={(e) => setBsuPickYear(e.target.value)}
                            />
                          </div>
                        </th>
                        <th className="text-right px-3 py-1.5 font-normal text-muted-foreground">Ditt tempo</th>
                        <th className="text-right px-3 py-1.5 font-normal text-muted-foreground">Maks (27 500/år)</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="px-3 py-1 text-muted-foreground">Innskudd</td>
                        <td className="px-3 py-1 text-right">+ {fmtNOK(contribs)}</td>
                        <td className="px-3 py-1 text-right text-muted-foreground">+ {fmtNOK(maxContribs)}</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-1 text-muted-foreground">
                          Renter
                          {displayYear >= bsuForecast.rateDropYear && (
                            <span className="ml-1 text-yellow-500/80">(inkl. lavere sats fra {bsuForecast.rateDropYear})</span>
                          )}
                        </td>
                        <td className="px-3 py-1 text-right text-green-500">+ {fmtNOK(interest)}</td>
                        <td className="px-3 py-1 text-right text-green-500/70">+ {fmtNOK(maxInterest)}</td>
                      </tr>
                      <tr className="border-t border-border/30 font-medium">
                        <td className="px-3 py-1.5">Saldo ved {displayYear}</td>
                        <td className="px-3 py-1.5 text-right">{fmtNOK(balance)}</td>
                        <td className="px-3 py-1.5 text-right text-muted-foreground">{fmtNOK(maxBalance)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )
            })()}
            {!account.birthYear && !editingBirthYear && (
              <button
                className="text-xs text-muted-foreground underline underline-offset-2 text-left hover:text-foreground"
                onClick={() => setEditingBirthYear(true)}
              >
                + Legg til fødselsår for BSU-aldersprognose
              </button>
            )}
            {!account.birthYear && editingBirthYear && (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  type="number"
                  placeholder="f.eks. 1995"
                  className="h-7 w-24 text-xs rounded border border-border bg-background px-2"
                  value={birthYearInput}
                  onChange={(e) => setBirthYearInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const y = parseInt(birthYearInput)
                      if (y > 1900 && y < 2100) { onUpdateBirthYear(y); setEditingBirthYear(false) }
                    }
                    if (e.key === 'Escape') setEditingBirthYear(false)
                  }}
                />
                <Button size="sm" className="h-7 text-xs" onClick={() => {
                  const y = parseInt(birthYearInput)
                  if (y > 1900 && y < 2100) { onUpdateBirthYear(y); setEditingBirthYear(false) }
                }}>OK</Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditingBirthYear(false)}>×</Button>
              </div>
            )}
          </div>
        )}

        {/* Mini-chart */}
        {chartData.length > 1 && (
          <ResponsiveContainer width="100%" height={80}>
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" hide />
              <YAxis hide />
              <Tooltip formatter={(v) => [fmtNOK(Number(v)), 'Saldo']} labelFormatter={(l) => `Mnd ${l}`} />
              <Area
                type="monotone"
                dataKey="saldo"
                stroke="#22C55E"
                fill="#22C55E20"
                strokeWidth={1.5}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}

        {/* Action tabs */}
        <div className="flex gap-2">
          {(['innskudd', 'uttak', 'saldo', 'rente'] as AccountTab[]).map((tab) => (
            <Button
              key={tab}
              variant={activeTab === tab ? 'default' : 'outline'}
              size="sm"
              className="text-xs capitalize"
              onClick={() => handleTabClick(tab)}
            >
              {tab === 'innskudd' ? 'Legg til innskudd' :
               tab === 'uttak' ? 'Registrer uttak' :
               tab === 'saldo' ? 'Oppdater saldo' : 'Ny rentesats'}
            </Button>
          ))}
        </div>

        {activeTab === 'innskudd' && (
          <AddContributionForm
            onSave={(c) => { onAddContribution(c); setActiveTab(null) }}
            onCancel={() => setActiveTab(null)}
            existingContributions={account.contributions ?? []}
            existingWithdrawals={account.withdrawals ?? []}
          />
        )}
        {activeTab === 'uttak' && (
          <AddWithdrawalForm
            onSave={(w) => { onAddWithdrawal(w); setActiveTab(null) }}
            onCancel={() => setActiveTab(null)}
            existingContributions={account.contributions ?? []}
            existingWithdrawals={account.withdrawals ?? []}
          />
        )}
        {activeTab === 'saldo' && (
          <UpdateBalanceForm
            onSave={(e) => { onUpdateBalance(e); setActiveTab(null) }}
            onCancel={() => setActiveTab(null)}
          />
        )}
        {activeTab === 'rente' && (
          <UpdateRateForm
            onSave={(e) => { onUpdateRate(e); setActiveTab(null) }}
            onCancel={() => setActiveTab(null)}
          />
        )}

        {/* Transaction log toggle */}
        {(sortedContribs.length > 0 || sortedWithdrawals.length > 0 || account.monthlyContribution > 0) && (
          <button
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setShowLog((v) => !v)}
          >
            {showLog ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {showLog ? 'Skjul' : 'Vis'} transaksjonslogg
            ({sortedContribs.length + sortedWithdrawals.length})
          </button>
        )}

        {showLog && (
          <TransactionLog
            contributions={sortedContribs}
            withdrawals={sortedWithdrawals}
            monthlyContribution={account.monthlyContribution}
            onRemoveContribution={onRemoveContribution}
            onRemoveWithdrawal={onRemoveWithdrawal}
            onClearMonthlyContribution={() => onUpdateMonthlyContribution(0)}
          />
        )}
      </CardContent>
    </Card>
  )
}

// ------------------------------------------------------------
// TRANSACTION LOG
// ------------------------------------------------------------

function TransactionLog({
  contributions,
  withdrawals,
  monthlyContribution,
  onRemoveContribution,
  onRemoveWithdrawal,
  onClearMonthlyContribution,
}: {
  contributions: SavingsContribution[]
  withdrawals: WithdrawalEntry[]
  monthlyContribution: number
  onRemoveContribution: (id: string) => void
  onRemoveWithdrawal: (id: string) => void
  onClearMonthlyContribution: () => void
}) {
  // Merge and sort all entries newest first
  type Entry =
    | { kind: 'contribution'; data: SavingsContribution }
    | { kind: 'withdrawal'; data: WithdrawalEntry }

  const entries: Entry[] = [
    ...contributions.map((c) => ({ kind: 'contribution' as const, data: c })),
    ...withdrawals.map((w) => ({ kind: 'withdrawal' as const, data: w })),
  ].sort((a, b) => new Date(b.data.date).getTime() - new Date(a.data.date).getTime())

  return (
    <div className="rounded-md border border-border overflow-hidden text-xs">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            <th className="px-2 py-1 text-left font-medium text-muted-foreground">Dato</th>
            <th className="px-2 py-1 text-left font-medium text-muted-foreground">Type</th>
            <th className="px-2 py-1 text-right font-medium text-muted-foreground">Beløp</th>
            <th className="px-2 py-1 text-left font-medium text-muted-foreground">Notat</th>
            <th className="w-6" />
          </tr>
        </thead>
        <tbody>
          {monthlyContribution > 0 && (
            <tr className="border-b border-border/50 bg-muted/10">
              <td className="px-2 py-1 text-muted-foreground italic">Månedlig</td>
              <td className="px-2 py-1">
                <span className="flex items-center gap-1 text-blue-400">
                  <Repeat2 className="h-3 w-3" />
                  Fast bidrag
                </span>
              </td>
              <td className="px-2 py-1 text-right font-mono text-blue-400">
                +{Math.round(monthlyContribution).toLocaleString('no-NO')} kr
              </td>
              <td className="px-2 py-1 text-muted-foreground text-[10px]">Planlagt · vises i budsjett</td>
              <td className="px-1 py-1">
                <button
                  className="text-muted-foreground hover:text-red-400 transition-colors"
                  title="Fjern fast bidrag"
                  onClick={onClearMonthlyContribution}
                >×</button>
              </td>
            </tr>
          )}
          {entries.map((entry) => {
            const isContrib = entry.kind === 'contribution'
            const amount = isContrib ? entry.data.amount : entry.data.amount
            return (
              <tr key={entry.data.id} className="border-b border-border/50 last:border-0">
                <td className="px-2 py-1 text-muted-foreground">{fmtDate(entry.data.date)}</td>
                <td className="px-2 py-1">
                  <span className={isContrib ? 'text-green-500' : 'text-red-400'}>
                    {isContrib ? 'Innskudd' : 'Uttak'}
                  </span>
                </td>
                <td className={`px-2 py-1 text-right font-mono ${isContrib ? 'text-green-500' : 'text-red-400'}`}>
                  {isContrib ? '+' : ''}{fmtNOK(amount)}
                </td>
                <td className="px-2 py-1 text-muted-foreground">{entry.data.note ?? ''}</td>
                <td className="px-1 py-1">
                  <button
                    className="text-muted-foreground hover:text-red-400 transition-colors"
                    onClick={() =>
                      isContrib
                        ? onRemoveContribution(entry.data.id)
                        : onRemoveWithdrawal(entry.data.id)
                    }
                  >
                    ×
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ------------------------------------------------------------
// FORMS
// ------------------------------------------------------------

function MiniStat({
  label,
  value,
  highlight,
  subvalue,
}: {
  label: string
  value: string
  highlight?: boolean
  subvalue?: string
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`font-mono font-medium text-sm ${highlight ? 'text-green-500' : ''}`}>{value}</p>
      {subvalue && <p className="text-xs text-muted-foreground">{subvalue}</p>}
    </div>
  )
}

function SummaryCard({ label, value, subvalue }: { label: string; value: string; subvalue?: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-mono font-semibold text-sm">{value}</p>
      {subvalue && <p className="text-xs text-muted-foreground">{subvalue}</p>}
    </div>
  )
}

function dupWarning(date: string, existing: { date: string }[]): string | null {
  const [y, m] = date.split('-').map(Number)
  const hit = existing.find(e => {
    const d = new Date(e.date)
    return d.getFullYear() === y && d.getMonth() + 1 === m
  })
  return hit ? `Det finnes allerede en oppføring for ${new Date(date).toLocaleDateString('no-NO', { month: 'long', year: 'numeric' })}` : null
}

function AddContributionForm({
  onSave, onCancel, existingContributions = [], existingWithdrawals = [],
}: {
  onSave: (c: SavingsContribution) => void
  onCancel: () => void
  existingContributions?: SavingsContribution[]
  existingWithdrawals?: WithdrawalEntry[]
}) {
  const today = new Date().toISOString().split('T')[0]
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today)
  const [note, setNote] = useState('')

  const warning = date ? dupWarning(date, [...existingContributions, ...existingWithdrawals]) : null

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-end gap-2 rounded-md border border-border p-2">
        <div className="space-y-0.5">
          <Label className="text-xs">Dato</Label>
          <Input type="date" className="h-8 text-xs w-36" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-0.5">
          <Label className="text-xs">Beløp (kr)</Label>
          <Input type="number" className="h-8 text-xs w-28" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
        </div>
        <div className="space-y-0.5 flex-1">
          <Label className="text-xs">Notat (valgfritt)</Label>
          <Input className="h-8 text-xs" value={note} onChange={(e) => setNote(e.target.value)} placeholder="f.eks. lønning" />
        </div>
        <Button size="sm" className="h-8 text-xs" onClick={() => onSave({ id: crypto.randomUUID(), date, amount: parseFloat(amount) || 0, note: note || undefined })}>
          Lagre
        </Button>
        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={onCancel}>Avbryt</Button>
      </div>
      {warning && (
        <p className="flex items-center gap-1 text-[11px] text-amber-400">
          <AlertTriangle className="h-3 w-3 shrink-0" />{warning}
        </p>
      )}
    </div>
  )
}

function AddWithdrawalForm({
  onSave, onCancel, existingContributions = [], existingWithdrawals = [],
}: {
  onSave: (w: WithdrawalEntry) => void
  onCancel: () => void
  existingContributions?: SavingsContribution[]
  existingWithdrawals?: WithdrawalEntry[]
}) {
  const today = new Date().toISOString().split('T')[0]
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today)
  const [note, setNote] = useState('')

  const warning = date ? dupWarning(date, [...existingContributions, ...existingWithdrawals]) : null

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-end gap-2 rounded-md border border-border p-2">
        <div className="space-y-0.5">
          <Label className="text-xs">Dato</Label>
          <Input type="date" className="h-8 text-xs w-36" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-0.5">
          <Label className="text-xs">Beløp (kr)</Label>
          <Input type="number" className="h-8 text-xs w-28" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
        </div>
        <div className="space-y-0.5 flex-1">
          <Label className="text-xs">Notat (valgfritt)</Label>
          <Input className="h-8 text-xs" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Årsak" />
        </div>
        <Button size="sm" className="h-8 text-xs" onClick={() => onSave({ id: crypto.randomUUID(), date, amount: -(parseFloat(amount) || 0), note: note || undefined })}>
          Lagre
        </Button>
        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={onCancel}>Avbryt</Button>
      </div>
      {warning && (
        <p className="flex items-center gap-1 text-[11px] text-amber-400">
          <AlertTriangle className="h-3 w-3 shrink-0" />{warning}
        </p>
      )}
    </div>
  )
}

function UpdateBalanceForm({ onSave, onCancel }: { onSave: (e: BalanceHistoryEntry) => void; onCancel: () => void }) {
  const now = new Date()
  const [balance, setBalance] = useState('')
  return (
    <div className="flex items-center gap-2 flex-1">
      <Input
        type="number"
        className="h-8 text-xs flex-1"
        placeholder="Ny saldo"
        value={balance}
        onChange={(e) => setBalance(e.target.value)}
      />
      <Button size="sm" className="h-8 text-xs" onClick={() => onSave({ year: now.getFullYear(), month: now.getMonth() + 1, balance: parseFloat(balance) || 0, isManual: true })}>
        OK
      </Button>
      <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={onCancel}>×</Button>
    </div>
  )
}

function UpdateRateForm({ onSave, onCancel }: { onSave: (e: RateHistoryEntry) => void; onCancel: () => void }) {
  const today = new Date().toISOString().split('T')[0]
  const [rate, setRate] = useState(0)
  const [fromDate, setFromDate] = useState(today)
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-md border border-border p-2">
      <div className="space-y-0.5">
        <Label className="text-xs">Gyldig fra</Label>
        <Input type="date" className="h-8 text-xs w-36" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
      </div>
      <div className="space-y-0.5">
        <Label className="text-xs">Ny rente %</Label>
        <Input
          type="number"
          step="0.01"
          className="h-8 text-xs w-24"
          placeholder="f.eks. 5.25"
          value={rate || ''}
          onChange={(e) => setRate(parseFloat(e.target.value) || 0)}
        />
      </div>
      <Button size="sm" className="h-8 text-xs" onClick={() => onSave({ fromDate, rate })} disabled={!rate || !fromDate}>
        Lagre
      </Button>
      <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={onCancel}>Avbryt</Button>
    </div>
  )
}

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

  const [label, setLabel] = useState(initial?.label ?? '')
  const [type, setType] = useState<SavingsAccountType>(initial?.type ?? 'sparekonto')
  const [openingBalance, setOpeningBalance] = useState(initial?.openingBalance ?? 0)
  const [openingDate, setOpeningDate] = useState(
    initial?.openingDate ?? new Date().toISOString().split('T')[0]
  )
  const [accountNumber, setAccountNumber] = useState(initial?.accountNumber ?? '')
  const [birthYear, setBirthYear] = useState(String(initial?.birthYear ?? ''))

  const initialPresetId = initial?.bankPresetId ?? 'manual'
  const [selectedPresetId, setSelectedPresetId] = useState<string>(initialPresetId)
  const enabledPresets = bankPresets.filter((p) => p.enabled)
  const initialPreset = initialPresetId !== 'manual' ? enabledPresets.find((p) => p.id === initialPresetId) : undefined
  const [tieredRates, setTieredRates] = useState<TieredRate[]>(
    initialPreset?.tieredRates
      ? [...initialPreset.tieredRates]
      : (initial?.tieredRates ?? [{ fromBalance: 0, rate: initial?.rateHistory?.slice().sort((a, b) => b.fromDate.localeCompare(a.fromDate))[0]?.rate ?? 3.5 }])
  )
  const [interestFreq, setInterestFreq] = useState<'monthly' | 'yearly'>(
    initialPreset?.interestCreditFrequency ?? initial?.interestCreditFrequency ?? 'monthly'
  )

  const [periods, setPeriods] = useState<ContributionPeriod[]>(
    initial?.contributionPeriods ?? []
  )
  const [defaultMonthly, setDefaultMonthly] = useState(initial?.monthlyContribution ?? 0)

  const [showDeposits, setShowDeposits] = useState(false)
  const [deposits, setDeposits] = useState<SavingsContribution[]>(
    initial?.contributions ?? []
  )

  const isBSU = type === 'BSU'

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
      bankPresetId: selectedPresetId !== 'manual' ? selectedPresetId : undefined,
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

function AddGoalForm({
  accounts,
  fondMonthlyDeposit,
  onSave,
  onCancel,
}: {
  accounts: SavingsAccount[]
  fondMonthlyDeposit: number
  onSave: (g: SavingsGoal) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState({
    label: '', icon: '🏠', targetAmount: 0,
    linkedAccountIds: [] as string[], includeFond: false,
  })

  function toggleAccount(id: string) {
    setForm((f) => ({
      ...f,
      linkedAccountIds: f.linkedAccountIds.includes(id)
        ? f.linkedAccountIds.filter((x) => x !== id)
        : [...f.linkedAccountIds, id],
    }))
  }

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">Nytt sparemål</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Ikon</Label>
            <Input value={form.icon} onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))} className="text-center" />
          </div>
          <div className="col-span-3 space-y-1">
            <Label className="text-xs">Navn</Label>
            <Input value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Målbeløp</Label>
          <Input
            type="number"
            placeholder="0"
            value={form.targetAmount || ''}
            onChange={(e) => setForm((f) => ({ ...f, targetAmount: parseFloat(e.target.value) || 0 }))}
          />
        </div>
        {accounts.length > 0 && (
          <div className="space-y-1">
            <Label className="text-xs">Koblede kontoer</Label>
            <div className="flex flex-wrap gap-2">
              {accounts.map((a) => (
                <button
                  key={a.id}
                  onClick={() => toggleAccount(a.id)}
                  className={`text-xs px-2 py-1 rounded border transition-colors ${
                    form.linkedAccountIds.includes(a.id)
                      ? 'border-primary text-primary bg-primary/10'
                      : 'border-border text-muted-foreground hover:border-border/80'
                  }`}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {fondMonthlyDeposit > 0 && (
          <button
            onClick={() => setForm((f) => ({ ...f, includeFond: !f.includeFond }))}
            className={`text-xs px-2 py-1 rounded border transition-colors ${
              form.includeFond
                ? 'border-primary text-primary bg-primary/10'
                : 'border-border text-muted-foreground hover:border-border/80'
            }`}
          >
            📈 KRON Fond ({fondMonthlyDeposit.toLocaleString('no-NO')} kr/mnd)
          </button>
        )}
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onCancel}>Avbryt</Button>
          <Button size="sm" onClick={() => onSave({ id: crypto.randomUUID(), ...form })} disabled={!form.label.trim()}>Lagre</Button>
        </div>
      </CardContent>
    </Card>
  )
}


