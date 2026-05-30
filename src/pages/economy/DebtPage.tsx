import { useState } from 'react'
import { Plus, Trash2, ChevronDown, ChevronUp, CheckCircle2, Calculator } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area,
} from 'recharts'
import { Progress } from '@/components/ui/progress'
import { useActiveEconomyStore } from '@/contexts/EconomyStoreContext'
import {
  buildRepaymentPlan,
  calculateTotalMonthlyDebtCost,
  getCurrentRate,
} from '@/domain/economy/debtCalculator'
import type { DebtAccount, DebtRateHistory } from '@/types/economy'

function fmtNOK(n: number) {
  return Math.round(n).toLocaleString('no-NO') + ' kr'
}

const DEBT_TYPE_LABELS: Record<DebtAccount['type'], string> = {
  studielaan: 'Studielån',
  billaan: 'Billån',
  kredittkort: 'Kredittkort',
  boliglaan: 'Boliglån',
  annet: 'Annet',
}

export function DebtPage() {
  const { debts, addDebt, removeDebt, updateDebtRate, markDebtPaid } = useActiveEconomyStore()
  const [showAddForm, setShowAddForm] = useState(false)
  const [updatingRateFor, setUpdatingRateFor] = useState<string | null>(null)
  const [showAmortFor, setShowAmortFor] = useState<string | null>(null)
  const [confirmDeleteFor, setConfirmDeleteFor] = useState<string | null>(null)
  const [paidOffDate, setPaidOffDate] = useState(new Date().toISOString().split('T')[0])

  const activeDebts = debts.filter((d) => d.status !== 'nedbetalt')
  const paidDebts = debts.filter((d) => d.status === 'nedbetalt')

  const totalMonthly = calculateTotalMonthlyDebtCost(activeDebts)
  const totalBalance = activeDebts.reduce((s, d) => s + d.currentBalance, 0)

  // Forventet rentekostnad neste 12 måneder (sum av interest fra nedbetalingsplan)
  const annualInterest = activeDebts.reduce((sum, d) => {
    const plan = buildRepaymentPlan(d)
    return sum + plan.rows.slice(0, 12).reduce((s, r) => s + r.interest, 0)
  }, 0)

  // Samlet gjeld ved slutten av inneværende år
  const now = new Date()
  const monthsLeftThisYear = 12 - now.getMonth() // måneder igjen inkl. inneværende
  const balanceEndOfYear = activeDebts.reduce((sum, d) => {
    const plan = buildRepaymentPlan(d)
    const row = plan.rows[monthsLeftThisYear - 1]
    return sum + (row?.balance ?? 0)
  }, 0)

  // Graf: samlet gjeld over tid (neste 5 år)
  const maxMonths = 60
  const chartData = Array.from({ length: maxMonths + 1 }, (_, i) => {
    const totalBal = activeDebts.reduce((s, d) => {
      const plan = buildRepaymentPlan(d)
      const row = plan.rows[i - 1]
      return s + (i === 0 ? d.currentBalance : (row?.balance ?? 0))
    }, 0)
    return { month: i, totalBalance: Math.round(totalBal) }
  })

  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Gjeld</h2>
        <Button size="sm" onClick={() => setShowAddForm(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Legg til lån
        </Button>
      </div>

      {showAddForm && (
        <AddDebtForm
          onSave={(d) => { addDebt(d); setShowAddForm(false) }}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {/* Oversikt */}
      {activeDebts.length > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card>
              <CardContent className="py-3">
                <p className="text-xs text-muted-foreground">Total gjeld nå</p>
                <p className="font-mono font-semibold text-red-400">{fmtNOK(totalBalance)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-3">
                <p className="text-xs text-muted-foreground">Gjeld ved årsslutt</p>
                <p className="font-mono font-semibold text-red-300">{fmtNOK(Math.round(balanceEndOfYear))}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-3">
                <p className="text-xs text-muted-foreground">Samlet terminbeløp/mnd</p>
                <p className="font-mono font-semibold">{fmtNOK(totalMonthly)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-3">
                <p className="text-xs text-muted-foreground">Renter neste 12 mnd</p>
                <p className="font-mono font-semibold text-orange-400">{fmtNOK(Math.round(annualInterest))}</p>
              </CardContent>
            </Card>
          </div>

          {/* Graf */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Samlet gjeld over tid</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v) => v % 12 === 0 ? `År ${v / 12}` : ''}
                  />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                  <Tooltip formatter={(v) => [fmtNOK(Number(v)), 'Gjeld']} labelFormatter={(l) => `Mnd ${l}`} />
                  <Line type="monotone" dataKey="totalBalance" stroke="#EF4444" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </>
      )}

      {/* Lån-kort */}
      {activeDebts.length === 0 && !showAddForm ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm text-muted-foreground mb-3">Ingen aktive lån registrert.</p>
            <Button size="sm" onClick={() => setShowAddForm(true)}>Legg til lån</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {activeDebts.map((debt) => {
            const currentRate = getCurrentRate(debt)
            const plan = buildRepaymentPlan(debt)
            const payoffYear = plan.payoffDate.getFullYear()
            const payoffMonth = plan.payoffDate.getMonth() + 1
            const interestNext12 = plan.rows.slice(0, 12).reduce((s, r) => s + r.interest, 0)
            const isConfirming = confirmDeleteFor === debt.id

            return (
              <Card key={debt.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-sm">{debt.creditor}</CardTitle>
                      <p className="text-xs text-muted-foreground">{DEBT_TYPE_LABELS[debt.type]}</p>
                    </div>
                    {!isConfirming && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400"
                        onClick={() => { setPaidOffDate(new Date().toISOString().split('T')[0]); setConfirmDeleteFor(debt.id) }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  {isConfirming && (
                    <div className="mt-2 p-3 rounded-md bg-muted/40 border border-border space-y-2">
                      <p className="text-xs font-medium">Når ble {debt.creditor} nedbetalt?</p>
                      <div className="flex items-center gap-2">
                        <Input
                          type="date"
                          className="h-7 text-xs w-36"
                          value={paidOffDate}
                          onChange={(e) => setPaidOffDate(e.target.value)}
                        />
                        <Button
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => { markDebtPaid(debt.id, paidOffDate); setConfirmDeleteFor(null) }}
                        >
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Marker som nedbetalt
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => setConfirmDeleteFor(null)}
                        >
                          Avbryt
                        </Button>
                      </div>
                    </div>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
                    <MiniStat label="Saldo" value={fmtNOK(debt.currentBalance)} />
                    <MiniStat label="Rente" value={`${currentRate.toFixed(2)}%`} />
                    <MiniStat label="Terminbeløp" value={fmtNOK(debt.monthlyPayment)} />
                    <MiniStat label="Renter/år" value={fmtNOK(Math.round(interestNext12))} highlight />
                    <MiniStat label="Innfris" value={`${String(payoffMonth).padStart(2, '0')}/${payoffYear}`} />
                  </div>

                  {/* Nedbetalt progressbar */}
                  {debt.originalAmount > 0 && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Nedbetalt {fmtNOK(debt.originalAmount - debt.currentBalance)}</span>
                        <span>{Math.round((debt.originalAmount - debt.currentBalance) / debt.originalAmount * 100)}% av {fmtNOK(debt.originalAmount)}</span>
                      </div>
                      <Progress
                        value={(debt.originalAmount - debt.currentBalance) / debt.originalAmount * 100}
                        className="h-2"
                      />
                    </div>
                  )}

                  {/* Rentehistorikk — linjediagram */}
                  {(debt.rateHistory?.length ?? 0) > 1 && (() => {
                    const sorted = [...debt.rateHistory].sort((a, b) => a.fromDate.localeCompare(b.fromDate))
                    const chartData = sorted.map((r) => ({
                      label: r.fromDate.slice(0, 7),
                      rate: r.nominalRate,
                    }))
                    const minR = Math.min(...sorted.map((r) => r.nominalRate))
                    const maxR = Math.max(...sorted.map((r) => r.nominalRate))
                    return (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1.5">Rentehistorikk</p>
                        <ResponsiveContainer width="100%" height={90}>
                          <LineChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                            <XAxis dataKey="label" tick={{ fontSize: 8 }} interval={Math.floor(chartData.length / 6)} />
                            <YAxis
                              domain={[Math.floor(minR * 10) / 10 - 0.2, Math.ceil(maxR * 10) / 10 + 0.2]}
                              tick={{ fontSize: 8 }}
                              tickFormatter={(v) => `${v}%`}
                              width={32}
                            />
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(215 20.2% 15%)" />
                            <Tooltip
                              contentStyle={{ fontSize: 11, background: 'var(--card)', border: '1px solid var(--border)' }}
                              formatter={(v) => [`${v}%`, 'Rente']}
                            />
                            <Line type="monotone" dataKey="rate" stroke="#3b82f6" strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )
                  })()}

                  <div className="flex gap-2">
                    {updatingRateFor === debt.id ? (
                      <UpdateRateForm
                        onSave={(entry) => {
                          updateDebtRate(debt.id, entry)
                          setUpdatingRateFor(null)
                        }}
                        onCancel={() => setUpdatingRateFor(null)}
                      />
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        onClick={() => setUpdatingRateFor(debt.id)}
                      >
                        Registrer renteendring
                      </Button>
                    )}
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Total rentekostnad: {fmtNOK(plan.totalInterestCost)}
                  </p>

                  {/* Ekstra info for Lånekassen */}
                  {debt.effectiveRate && (
                    <p className="text-xs text-muted-foreground">
                      Effektiv rente: {debt.effectiveRate.toFixed(3)}%
                      {debt.loanSubtype && ` · ${debt.loanSubtype}`}
                    </p>
                  )}

                  {/* Betalingshistorikk */}
                  {debt.paymentHistory && debt.paymentHistory.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Betalingshistorikk</p>
                      <ResponsiveContainer width="100%" height={80}>
                        <AreaChart
                          data={debt.paymentHistory.map((p) => ({
                            label: p.date.slice(0, 7),
                            beløp: p.amount,
                          }))}
                          margin={{ top: 2, right: 2, left: 0, bottom: 0 }}
                        >
                          <defs>
                            <linearGradient id="payGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={5} />
                          <YAxis hide domain={['auto', 'auto']} />
                          <Tooltip
                            contentStyle={{ fontSize: 11, background: 'var(--card)', border: '1px solid var(--border)' }}
                            formatter={(v) => [fmtNOK(Number(v)), 'Terminbeløp']}
                          />
                          <Area type="monotone" dataKey="beløp" stroke="#f97316" strokeWidth={1.5} fill="url(#payGrad)" dot={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* Fremtidig amortisering */}
                  <button
                    className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground transition-colors"
                    onClick={() => setShowAmortFor(showAmortFor === debt.id ? null : debt.id)}
                  >
                    {showAmortFor === debt.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    Vis nedbetalingsplan
                  </button>

                  {showAmortFor === debt.id && (() => {
                    const now = new Date()
                    // Subsampler: vis maks én rad per kvartal for chartet
                    const step = Math.max(1, Math.floor(plan.rows.length / 60))
                    const chartData = plan.rows
                      .filter((_, i) => i % step === 0 || i === plan.rows.length - 1)
                      .map((row, i, arr) => {
                        const d = new Date(now)
                        const origIdx = plan.rows.indexOf(arr[i] === row ? row : plan.rows[i * step])
                        d.setMonth(d.getMonth() + (origIdx >= 0 ? origIdx : i * step) + 1)
                        return {
                          label: `${d.getFullYear()}`,
                          saldo: Math.round(row.balance / 1000),
                        }
                      })
                    return (
                      <div className="space-y-3">
                        {/* Saldokurve til 0 */}
                        <div>
                          <p className="text-[10px] text-muted-foreground mb-1">Saldo over tid (tusen kr)</p>
                          <ResponsiveContainer width="100%" height={100}>
                            <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                              <defs>
                                <linearGradient id={`debtGrad-${debt.id}`} x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#f97316" stopOpacity={0.25} />
                                  <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                                </linearGradient>
                              </defs>
                              <XAxis dataKey="label" tick={{ fontSize: 8 }} interval={Math.floor(chartData.length / 5)} />
                              <YAxis tick={{ fontSize: 8 }} tickFormatter={(v) => `${v}k`} width={30} />
                              <CartesianGrid strokeDasharray="3 3" stroke="hsl(215 20.2% 15%)" />
                              <Tooltip
                                contentStyle={{ fontSize: 11, background: 'var(--card)', border: '1px solid var(--border)' }}
                                formatter={(v) => [`${v} 000 kr`, 'Saldo']}
                              />
                              <Area type="monotone" dataKey="saldo" stroke="#f97316" strokeWidth={1.5} fill={`url(#debtGrad-${debt.id})`} dot={false} />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                        {/* Detaljert tabell — alle rader, scrollbar */}
                        <div className="rounded-md border border-border overflow-hidden max-h-64 overflow-y-auto">
                          <table className="w-full text-xs">
                            <thead className="sticky top-0 bg-muted/80">
                              <tr className="border-b border-border">
                                <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Mnd</th>
                                <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">Terminbeløp</th>
                                <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">Renter</th>
                                <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">Avdrag</th>
                                <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">Saldo</th>
                              </tr>
                            </thead>
                            <tbody>
                              {plan.rows.map((row, i) => {
                                const d = new Date(now)
                                d.setMonth(d.getMonth() + i + 1)
                                const label = `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
                                return (
                                  <tr key={i} className="border-b border-border/40 last:border-0">
                                    <td className="px-2 py-1 text-muted-foreground">{label}</td>
                                    <td className="px-2 py-1 text-right font-mono">{fmtNOK(row.payment)}</td>
                                    <td className="px-2 py-1 text-right font-mono text-red-400">{fmtNOK(row.interest)}</td>
                                    <td className="px-2 py-1 text-right font-mono text-green-400">{fmtNOK(row.principal)}</td>
                                    <td className="px-2 py-1 text-right font-mono">{fmtNOK(row.balance)}</td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )
                  })()}

                  <ExtraPaymentCalc
                    debt={debt}
                    basePlan={{ months: plan.rows.length, totalInterestCost: plan.totalInterestCost }}
                    currentRate={currentRate}
                  />
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Nedbetalt gjeld */}
      {paidDebts.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
            Nedbetalt gjeld
          </h3>
          {paidDebts.map((debt) => (
            <div
              key={debt.id}
              className="flex items-center justify-between rounded-md border border-border/50 px-3 py-2 bg-muted/20"
            >
              <div>
                <p className="text-sm text-muted-foreground line-through">{debt.creditor}</p>
                <p className="text-xs text-muted-foreground">
                  {DEBT_TYPE_LABELS[debt.type]}
                  {debt.paidOffDate && ` · nedbetalt ${debt.paidOffDate}`}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400"
                onClick={() => removeDebt(debt.id)}
                title="Slett permanent"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------
// SUB-KOMPONENTER
// ------------------------------------------------------------

function MiniStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`font-mono font-medium text-sm ${highlight ? 'text-orange-400' : ''}`}>{value}</p>
    </div>
  )
}

function AddDebtForm({ onSave, onCancel }: { onSave: (d: DebtAccount) => void; onCancel: () => void }) {
  const [form, setForm] = useState({
    creditor: '',
    type: 'studielaan' as DebtAccount['type'],
    originalAmount: 0,
    currentBalance: 0,
    rate: 5.5,
    monthlyPayment: 0,
    termFee: 0,
    startDate: new Date().toISOString().split('T')[0],
  })

  function f(k: keyof typeof form) {
    return {
      value: String(form[k]),
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm((prev) => ({ ...prev, [k]: e.target.value })),
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Legg til lån</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1">
            <Label className="text-xs">Kreditor / navn</Label>
            <Input {...f('creditor')} placeholder="f.eks. Lånekassen" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Type</Label>
            <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v as DebtAccount['type'] }))}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(DEBT_TYPE_LABELS) as DebtAccount['type'][]).map((t) => (
                  <SelectItem key={t} value={t} className="text-xs">{DEBT_TYPE_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Rente %</Label>
            <Input
              type="number"
              step="0.1"
              value={form.rate}
              onChange={(e) => setForm((f) => ({ ...f, rate: parseFloat(e.target.value) || 0 }))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Nåværende saldo</Label>
            <Input
              type="number"
              value={form.currentBalance}
              onChange={(e) => setForm((f) => ({ ...f, currentBalance: parseFloat(e.target.value) || 0 }))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Terminbeløp/mnd (total faktura)</Label>
            <Input
              type="number"
              placeholder="inkl. renter, avdrag og gebyr"
              value={form.monthlyPayment}
              onChange={(e) => setForm((f) => ({ ...f, monthlyPayment: parseFloat(e.target.value) || 0 }))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">herav termingebyr</Label>
            <Input
              type="number"
              placeholder="f.eks. 50"
              value={form.termFee}
              onChange={(e) => setForm((f) => ({ ...f, termFee: parseFloat(e.target.value) || 0 }))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Startdato</Label>
            <Input type="date" {...f('startDate')} />
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onCancel}>Avbryt</Button>
          <Button
            size="sm"
            disabled={!form.creditor.trim() || form.currentBalance === 0}
            onClick={() =>
              onSave({
                id: crypto.randomUUID(),
                creditor: form.creditor.trim(),
                type: form.type,
                originalAmount: form.originalAmount || form.currentBalance,
                currentBalance: form.currentBalance,
                rateHistory: [{ fromDate: form.startDate, nominalRate: form.rate }],
                monthlyPayment: form.monthlyPayment,
                termFee: form.termFee,
                startDate: form.startDate,
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

// ------------------------------------------------------------
// EKSTRA INNBETALING-KALKULATOR
// ------------------------------------------------------------

function simulateExtra(debt: DebtAccount, extraMonthly: number, currentRate: number): { months: number; interestCost: number } {
  const monthlyRate = currentRate / 100 / 12
  let balance = debt.currentBalance
  let interestCost = 0
  const totalPayment = debt.monthlyPayment + extraMonthly
  let months = 0
  const maxMonths = 600
  while (balance > 0.01 && months < maxMonths) {
    const interest = balance * monthlyRate
    let principal = totalPayment - interest - debt.termFee
    if (principal > balance) principal = balance
    balance = Math.max(0, balance - principal)
    interestCost += interest
    months++
  }
  return { months, interestCost: Math.round(interestCost) }
}

function ExtraPaymentCalc({ debt, basePlan, currentRate }: { debt: DebtAccount; basePlan: { months: number; totalInterestCost: number }; currentRate: number }) {
  const [extra, setExtra] = useState(0)
  if (debt.monthlyPayment <= 0) return null

  const result = extra > 0 ? simulateExtra(debt, extra, currentRate) : null
  const savedMonths = result ? basePlan.months - result.months : 0
  const savedInterest = result ? basePlan.totalInterestCost - result.interestCost : 0

  return (
    <div className="rounded-md border border-border/50 bg-muted/20 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Calculator className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">Ekstra innbetaling</span>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">kr/mnd ekstra</Label>
          <Input
            type="number"
            className="h-7 text-xs w-28"
            placeholder="f.eks. 500"
            value={extra || ''}
            onChange={(e) => setExtra(Math.max(0, parseFloat(e.target.value) || 0))}
          />
        </div>
        {result && extra > 0 && (
          <div className="flex gap-4 text-xs">
            <span className="text-green-400 font-medium">
              {savedMonths > 0 ? `−${savedMonths} mnd` : 'Ingen effekt'}
            </span>
            {savedInterest > 0 && (
              <span className="text-green-400">
                Spar {fmtNOK(savedInterest)} renter
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function UpdateRateForm({ onSave, onCancel }: { onSave: (e: DebtRateHistory) => void; onCancel: () => void }) {
  const [rate, setRate] = useState(0)
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  return (
    <div className="flex items-center gap-2 flex-1">
      <Input type="date" className="h-8 text-xs w-36" value={date} onChange={(e) => setDate(e.target.value)} />
      <Input
        type="number"
        step="0.1"
        className="h-8 text-xs w-20"
        placeholder="Rente %"
        value={rate}
        onChange={(e) => setRate(parseFloat(e.target.value) || 0)}
      />
      <Button size="sm" className="h-8 text-xs" onClick={() => onSave({ fromDate: date, nominalRate: rate })}>OK</Button>
      <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={onCancel}>×</Button>
    </div>
  )
}
