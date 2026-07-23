import { useState } from 'react'
import type React from 'react'
import { Plus, Trash2, ToggleLeft, ToggleRight, Pencil, ChevronDown, ChevronRight, TrendingUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useEconomyStore } from '@/application/useEconomyStore'
import type { SubscriptionEntry, InsuranceEntry } from '@/types/economy'

function fmtNOK(n: number) {
  return Math.round(n).toLocaleString('no-NO') + ' kr'
}

const SUBSCRIPTION_CATEGORY_LABELS: Record<SubscriptionEntry['category'], string> = {
  streaming: 'Streaming',
  software: 'Software',
  spill: 'Spill',
  tjeneste: 'Tjeneste',
  annet: 'Annet',
}

const BILLING_CYCLE_LABELS: Record<SubscriptionEntry['billingCycle'], string> = {
  monthly: 'Månedlig',
  yearly: 'Årlig',
  variable: 'Variabel',
}

export function SubscriptionsPage() {
  const {
    subscriptions,
    insurances,
    addSubscription,
    updateSubscription,
    removeSubscription,
    addInsurance,
    updateInsurance,
    removeInsurance,
  } = useEconomyStore()

  const [showAddSub, setShowAddSub] = useState(false)
  const [showAddIns, setShowAddIns] = useState(false)
  const [editingInsId, setEditingInsId] = useState<string | null>(null)
  const [expandedInsId, setExpandedInsId] = useState<string | null>(null)
  const [cancellingInsId, setCancellingInsId] = useState<string | null>(null)
  const [showCancelledIns, setShowCancelledIns] = useState(false)

  const now = new Date()
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const currentYear = String(now.getFullYear())

  const activeSubscriptions = subscriptions.filter(
    (s) => s.isActive && (!s.activeUntil || s.activeUntil >= currentMonthKey)
  )
  const expiredSubscriptions = subscriptions.filter(
    (s) => s.isActive && s.activeUntil && s.activeUntil < currentMonthKey
  )
  const inactiveSubscriptions = subscriptions.filter((s) => !s.isActive)

  const monthlySubTotal = activeSubscriptions.reduce((s, sub) => s + effectivePrice(sub, currentMonthKey), 0)
  const yearlySubTotal = monthlySubTotal * 12
  const activeInsurances = insurances.filter((i) => i.isActive && !isInsuranceExpired(i, currentMonthKey))
  const expiredInsurances = insurances.filter((i) => i.isActive && isInsuranceExpired(i, currentMonthKey))
  const yearlyInsTotal = activeInsurances
    .reduce((s, ins) => s + (ins.yearlyAmounts[currentYear] ?? 0), 0)
  const monthlyInsTotal = yearlyInsTotal / 12

  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full">
      <h2 className="font-semibold">Abonnement og forsikringer</h2>

      {/* Oversikt */}
      <div className="grid grid-cols-3 gap-2">
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-muted-foreground mb-1">Abonnement</p>
            <p className="font-mono font-semibold text-sm">{fmtNOK(monthlySubTotal)}<span className="text-muted-foreground font-normal">/mnd</span></p>
            <p className="font-mono text-xs text-muted-foreground">{fmtNOK(yearlySubTotal)}/år</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-muted-foreground mb-1">Forsikringer</p>
            <p className="font-mono font-semibold text-sm">{fmtNOK(Math.round(monthlyInsTotal))}<span className="text-muted-foreground font-normal">/mnd</span></p>
            <p className="font-mono text-xs text-muted-foreground">{fmtNOK(yearlyInsTotal)}/år</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-muted-foreground mb-1">Totalt</p>
            <p className="font-mono font-semibold text-sm">{fmtNOK(Math.round(monthlySubTotal + monthlyInsTotal))}<span className="text-muted-foreground font-normal">/mnd</span></p>
            <p className="font-mono text-xs text-muted-foreground">{fmtNOK(Math.round(yearlySubTotal + yearlyInsTotal))}/år</p>
          </CardContent>
        </Card>
      </div>

      {/* Abonnement */}
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-sm">Abonnement</h3>
        <Button size="sm" variant="outline" onClick={() => setShowAddSub(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Legg til
        </Button>
      </div>

      {showAddSub && (
        <AddSubscriptionForm
          onSave={(s) => { addSubscription(s); setShowAddSub(false) }}
          onCancel={() => setShowAddSub(false)}
        />
      )}

      {subscriptions.length === 0 && !showAddSub && (
        <Card>
          <CardContent className="py-6 text-center">
            <p className="text-sm text-muted-foreground mb-2">Ingen abonnement registrert.</p>
            <Button size="sm" onClick={() => setShowAddSub(true)}>Legg til abonnement</Button>
          </CardContent>
        </Card>
      )}

      {activeSubscriptions.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 bg-muted/30">
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Abonnement</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Kategori</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Pris</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {activeSubscriptions.map((sub) => (
                  <SubscriptionRow
                    key={sub.id}
                    sub={sub}
                    currentMonthKey={currentMonthKey}
                    onToggle={() => updateSubscription(sub.id, { isActive: false })}
                    onRemove={() => removeSubscription(sub.id)}
                    onPriceChange={(fromMonth, amount) => updateSubscription(sub.id, {
                      priceChanges: [...(sub.priceChanges ?? []).filter(c => c.fromMonth !== fromMonth), { fromMonth, amount }]
                    })}
                    onSave={(updates) => updateSubscription(sub.id, updates)}
                  />
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/20">
                  <td className="px-3 py-2 font-medium text-xs" colSpan={2}>Sum aktive</td>
                  <td className="px-3 py-2 text-right font-mono font-semibold">
                    {fmtNOK(monthlySubTotal)}/mnd
                    <div className="text-xs text-muted-foreground font-normal">
                      {fmtNOK(Math.round(monthlySubTotal * 12))}/år
                    </div>
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </CardContent>
        </Card>
      )}

      {expiredSubscriptions.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-2">Utløpte kjøp</p>
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm opacity-50">
                <tbody>
                  {expiredSubscriptions.map((sub) => (
                    <SubscriptionRow
                      key={sub.id}
                      sub={sub}
                      currentMonthKey={currentMonthKey}
                      onToggle={() => updateSubscription(sub.id, { activeUntil: undefined })}
                      onRemove={() => removeSubscription(sub.id)}
                      onPriceChange={(fromMonth, amount) => updateSubscription(sub.id, {
                        priceChanges: [...(sub.priceChanges ?? []).filter(c => c.fromMonth !== fromMonth), { fromMonth, amount }]
                      })}
                    />
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {inactiveSubscriptions.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-2">Inaktive abonnement</p>
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm opacity-60">
                <tbody>
                  {inactiveSubscriptions.map((sub) => (
                    <SubscriptionRow
                      key={sub.id}
                      sub={sub}
                      currentMonthKey={currentMonthKey}
                      onToggle={() => updateSubscription(sub.id, { isActive: true })}
                      onRemove={() => removeSubscription(sub.id)}
                      onPriceChange={(fromMonth, amount) => updateSubscription(sub.id, {
                        priceChanges: [...(sub.priceChanges ?? []).filter(c => c.fromMonth !== fromMonth), { fromMonth, amount }]
                      })}
                    />
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Forsikringer */}
      <div className="flex items-center justify-between mt-2">
        <h3 className="font-medium text-sm">Forsikringer</h3>
        <Button size="sm" variant="outline" onClick={() => setShowAddIns(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Legg til
        </Button>
      </div>

      {showAddIns && (
        <AddInsuranceForm
          onSave={(ins) => { addInsurance(ins); setShowAddIns(false) }}
          onCancel={() => setShowAddIns(false)}
        />
      )}

      {insurances.length === 0 && !showAddIns && (
        <Card>
          <CardContent className="py-6 text-center">
            <p className="text-sm text-muted-foreground mb-2">Ingen forsikringer registrert.</p>
          </CardContent>
        </Card>
      )}

      {insurances.filter(i => i.status === 'avsluttet').length > 0 && (
        <div>
          <button
            className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground mb-2"
            onClick={() => setShowCancelledIns(v => !v)}
          >
            {showCancelledIns ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Avsluttede forsikringer ({insurances.filter(i => i.status === 'avsluttet').length})
          </button>
          {showCancelledIns && (
            <Card className="opacity-60 mb-2">
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <tbody>
                    {insurances.filter(i => i.status === 'avsluttet').map((ins) => (
                      <tr key={ins.id} className="border-b border-border/50 last:border-0">
                        <td className="px-3 py-2">
                          <p className="line-through text-muted-foreground">{ins.type}</p>
                          <p className="text-xs text-muted-foreground">{ins.cancelledDate ? `Avsluttet ${ins.cancelledDate}` : 'Avsluttet'}</p>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground text-xs">{ins.provider}</td>
                        <td className="px-3 py-2 text-right text-xs text-muted-foreground">
                          {ins.bonus != null && <span>Bonus: {ins.bonus}%</span>}
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground"
                              onClick={() => updateInsurance(ins.id, { status: 'aktiv', isActive: true, cancelledDate: undefined })}>
                              <ToggleRight className="h-3.5 w-3.5 text-green-500" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-red-400"
                              onClick={() => removeInsurance(ins.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {activeInsurances.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="text-left px-3 py-2 font-medium text-xs">Forsikring</th>
                  <th className="text-left px-3 py-2 font-medium text-xs">Leverandør</th>
                  <th className="text-right px-3 py-2 font-medium text-xs">{currentYear}/år</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {activeInsurances.map((ins) => {
                  const yearlyAmt = ins.yearlyAmounts[currentYear] ?? 0
                  if (editingInsId === ins.id) {
                    return (
                      <tr key={ins.id}>
                        <td colSpan={4} className="px-3 py-2">
                          <EditInsuranceForm
                            ins={ins}
                            currentYear={currentYear}
                            onSave={(updates) => { updateInsurance(ins.id, updates); setEditingInsId(null) }}
                            onCancel={() => setEditingInsId(null)}
                          />
                        </td>
                      </tr>
                    )
                  }
                  const allYears = Object.keys(ins.yearlyAmounts).sort()
                  const prevYear = String(parseInt(currentYear) - 1)
                  const prevAmt = ins.yearlyAmounts[prevYear]
                  const diff = prevAmt != null && yearlyAmt > 0 ? yearlyAmt - prevAmt : null
                  const isExpanded = expandedInsId === ins.id
                  return (
                    <>
                      <tr key={ins.id} className={`border-b border-border/50 ${isExpanded ? '' : 'last:border-0'} ${!ins.isActive ? 'opacity-50' : ''}`}>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            {allYears.length > 1 && (
                              <button
                                className="text-muted-foreground hover:text-foreground"
                                onClick={() => setExpandedInsId(isExpanded ? null : ins.id)}
                              >
                                {isExpanded
                                  ? <ChevronDown className="h-3 w-3" />
                                  : <ChevronRight className="h-3 w-3" />}
                              </button>
                            )}
                            {ins.type}
                          </div>
                          {ins.activeUntil && (
                            <span className="text-xs text-muted-foreground">
                              {monthsRemaining(ins.activeUntil, currentMonthKey) === 0
                                ? 'Siste måned'
                                : `Utløper om ${monthsRemaining(ins.activeUntil, currentMonthKey)} mnd`}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground text-xs">{ins.provider}</td>
                        <td className="px-3 py-2 text-right font-mono">
                          <div>
                            {yearlyAmt > 0 ? fmtNOK(yearlyAmt) : '—'}
                            {diff !== null && (
                              <span className={`ml-1.5 text-xs font-normal ${diff > 0 ? 'text-red-400' : diff < 0 ? 'text-green-500' : 'text-muted-foreground'}`}>
                                {diff > 0 ? '+' : ''}{Math.round(diff).toLocaleString('no-NO')}
                              </span>
                            )}
                          </div>
                          {yearlyAmt > 0 && (
                            <div className="text-xs text-muted-foreground font-normal">
                              {fmtNOK(Math.round(yearlyAmt / 12))}/mnd
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                              onClick={() => setEditingInsId(ins.id)}
                              title="Rediger"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 text-muted-foreground hover:text-amber-400"
                              onClick={() => setCancellingInsId(cancellingInsId === ins.id ? null : ins.id)}
                              title="Avslutt forsikring"
                            >
                              <ToggleLeft className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 text-muted-foreground hover:text-red-400"
                              onClick={() => removeInsurance(ins.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="border-b border-border/50 bg-muted/20">
                          <td colSpan={4} className="px-6 py-2">
                            <div className="flex gap-6 text-xs">
                              {allYears.map((yr) => {
                                const amt = ins.yearlyAmounts[yr]
                                const prevAmt = ins.yearlyAmounts[String(parseInt(yr) - 1)]
                                const d = prevAmt != null ? amt - prevAmt : null
                                return (
                                  <div key={yr} className="text-center">
                                    <p className="text-muted-foreground">{yr}</p>
                                    <p className="font-mono font-medium">{Math.round(amt).toLocaleString('no-NO')}</p>
                                    {d !== null && (
                                      <p className={d > 0 ? 'text-red-400' : d < 0 ? 'text-green-500' : 'text-muted-foreground'}>
                                        {d > 0 ? '+' : ''}{Math.round(d).toLocaleString('no-NO')}
                                      </p>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </td>
                        </tr>
                      )}
                      {cancellingInsId === ins.id && (
                        <tr className="border-b border-border/50 bg-amber-500/5">
                          <td colSpan={4} className="px-3 py-2">
                            <CancelInsuranceForm
                              ins={ins}
                              onSave={(updates) => {
                                updateInsurance(ins.id, updates)
                                setCancellingInsId(null)
                              }}
                              onCancel={() => setCancellingInsId(null)}
                            />
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/20">
                  <td className="px-3 py-2 font-medium text-xs" colSpan={2}>Sum aktive</td>
                  <td className="px-3 py-2 text-right font-mono font-semibold">
                    {fmtNOK(yearlyInsTotal)}/år
                    <span className="text-muted-foreground font-normal ml-1 text-xs">
                      ({fmtNOK(Math.round(yearlyInsTotal / 12))}/mnd)
                    </span>
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </CardContent>
        </Card>
      )}

      {expiredInsurances.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-2">Utløpte forsikringer</p>
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm opacity-50">
                <tbody>
                  {expiredInsurances.map((ins) => (
                    <tr key={ins.id} className="border-b border-border/50 last:border-0">
                      <td className="px-3 py-2">
                        <p>{ins.type}</p>
                        <span className="text-xs text-muted-foreground">Utløpt {ins.activeUntil}</span>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{ins.provider}</td>
                      <td className="px-3 py-2 text-right font-mono">
                        {fmtNOK(ins.yearlyAmounts[currentYear] ?? 0)}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex gap-1 justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-muted-foreground"
                            onClick={() => updateInsurance(ins.id, { activeUntil: undefined })}
                            title="Fjern sluttdato (gjør løpende igjen)"
                          >
                            <ToggleRight className="h-3.5 w-3.5 text-green-500" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-red-400"
                            onClick={() => removeInsurance(ins.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------
// SUB-KOMPONENTER
// ------------------------------------------------------------

function monthsRemaining(activeUntil: string, currentMonthKey: string): number {
  const [uy, um] = activeUntil.split('-').map(Number)
  const [cy, cm] = currentMonthKey.split('-').map(Number)
  return (uy - cy) * 12 + (um - cm)
}

export function isInsuranceExpired(ins: InsuranceEntry, currentMonthKey: string): boolean {
  return !!ins.activeUntil && ins.activeUntil < currentMonthKey
}

function effectivePrice(sub: SubscriptionEntry, monthKey: string): number {
  if (sub.monthlyAmounts[monthKey] !== undefined) return sub.monthlyAmounts[monthKey]
  if (sub.priceChanges && sub.priceChanges.length > 0) {
    const applicable = [...sub.priceChanges]
      .filter((c) => c.fromMonth <= monthKey)
      .sort((a, b) => b.fromMonth.localeCompare(a.fromMonth))
    if (applicable.length > 0) return applicable[0].amount
  }
  return sub.defaultMonthly
}

function SubscriptionRow({
  sub,
  currentMonthKey,
  onToggle,
  onRemove,
  onPriceChange,
  onSave,
}: {
  sub: SubscriptionEntry
  currentMonthKey: string
  onToggle: () => void
  onRemove: () => void
  onPriceChange: (fromMonth: string, amount: number) => void
  onSave?: (updates: Partial<SubscriptionEntry>) => void
}) {
  const [showPriceForm, setShowPriceForm] = useState(false)
  const [showEditForm, setShowEditForm] = useState(false)
  const [newPrice, setNewPrice] = useState('')
  const [fromMonth, setFromMonth] = useState(currentMonthKey)

  const remaining = sub.activeUntil ? monthsRemaining(sub.activeUntil, currentMonthKey) : null
  const isExpired = remaining !== null && remaining < 0
  const currentPrice = effectivePrice(sub, currentMonthKey)
  const hasHistory = (sub.priceChanges?.length ?? 0) > 0

  let badge: React.ReactNode = null
  if (sub.activeUntil && !isExpired) {
    if (remaining === 0) {
      badge = <span className="text-xs text-amber-400 font-medium">Siste måned</span>
    } else {
      badge = <span className="text-xs text-muted-foreground">Utløper om {remaining} mnd</span>
    }
  } else if (isExpired) {
    badge = <span className="text-xs text-muted-foreground">Utløpt {sub.activeUntil}</span>
  }

  function handleSavePrice() {
    const amount = parseFloat(newPrice)
    if (!amount || amount <= 0) return
    onPriceChange(fromMonth, amount)
    setShowPriceForm(false)
    setNewPrice('')
  }

  return (
    <>
      <tr className="border-b border-border/50 last:border-0">
        <td className="px-3 py-2">
          <p className="font-medium">{sub.name}</p>
          {badge}
          {hasHistory && <span className="text-[10px] text-amber-400/70">prisendring</span>}
        </td>
        <td className="px-3 py-2 text-xs text-muted-foreground">
          {SUBSCRIPTION_CATEGORY_LABELS[sub.category]}<br />
          <span className="text-[10px]">{BILLING_CYCLE_LABELS[sub.billingCycle]}</span>
        </td>
        <td className="px-3 py-2 text-right font-mono">
          <div>{Math.round(currentPrice).toLocaleString('no-NO')} kr/mnd</div>
          <div className="text-xs text-muted-foreground font-normal">
            {Math.round(currentPrice * 12).toLocaleString('no-NO')} kr/år
          </div>
        </td>
        <td className="px-2 py-2">
          <div className="flex gap-1 justify-end">
            {onSave && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                onClick={() => { setShowEditForm((v) => !v); setShowPriceForm(false) }}
                title="Rediger"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-muted-foreground hover:text-amber-400"
              onClick={() => { setShowPriceForm((v) => !v); setShowEditForm(false) }}
              title="Endre pris"
            >
              <TrendingUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-muted-foreground"
              onClick={onToggle}
              title={sub.isActive ? 'Deaktiver' : 'Aktiver'}
            >
              {sub.isActive
                ? <ToggleRight className="h-3.5 w-3.5 text-green-500" />
                : <ToggleLeft className="h-3.5 w-3.5" />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-muted-foreground hover:text-red-400"
              onClick={onRemove}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </td>
      </tr>
      {showEditForm && onSave && (
        <tr className="border-b border-border/50 bg-muted/20">
          <td colSpan={4} className="px-3 py-2">
            <EditSubscriptionForm
              sub={sub}
              currentMonthKey={currentMonthKey}
              onSave={(updates) => { onSave(updates); setShowEditForm(false) }}
              onCancel={() => setShowEditForm(false)}
            />
          </td>
        </tr>
      )}
      {showPriceForm && (
        <tr className="border-b border-border/50 bg-muted/20">
          <td colSpan={4} className="px-3 py-2">
            <div className="flex flex-wrap items-end gap-2 text-xs">
              <div className="space-y-0.5">
                <Label className="text-xs">Ny pris (kr/mnd)</Label>
                <Input
                  type="number"
                  className="h-7 w-28 text-xs"
                  placeholder="f.eks. 159"
                  value={newPrice}
                  onChange={(e) => setNewPrice(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="space-y-0.5">
                <Label className="text-xs">Fra og med</Label>
                <Input
                  type="month"
                  className="h-7 w-36 text-xs"
                  value={fromMonth}
                  onChange={(e) => setFromMonth(e.target.value)}
                />
              </div>
              <Button size="sm" className="h-7 text-xs" onClick={handleSavePrice} disabled={!newPrice}>
                Lagre
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowPriceForm(false)}>
                Avbryt
              </Button>
            </div>
            <div className="mt-2 space-y-0.5">
              <p className="text-[10px] text-muted-foreground">Prishistorikk:</p>
              <p className="text-[10px] text-muted-foreground font-mono">
                Fra start: {Math.round(sub.defaultMonthly).toLocaleString('no-NO')} kr/mnd
              </p>
              {[...(sub.priceChanges ?? [])].sort((a, b) => a.fromMonth.localeCompare(b.fromMonth)).map((c) => (
                <p key={c.fromMonth} className="text-[10px] text-muted-foreground font-mono">
                  {c.fromMonth}: {Math.round(c.amount).toLocaleString('no-NO')} kr/mnd
                </p>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function EditSubscriptionForm({
  sub,
  currentMonthKey,
  onSave,
  onCancel,
}: {
  sub: SubscriptionEntry
  currentMonthKey: string
  onSave: (updates: Partial<SubscriptionEntry>) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState({
    name: sub.name,
    category: sub.category,
    billingCycle: sub.billingCycle,
    activeUntil: sub.activeUntil ?? '',
  })

  return (
    <div className="rounded-md border border-border bg-muted/20 p-3 space-y-3">
      <p className="text-xs font-medium">Rediger abonnement</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1">
          <Label className="text-xs">Navn</Label>
          <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Kategori</Label>
          <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v as SubscriptionEntry['category'] }))}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.entries(SUBSCRIPTION_CATEGORY_LABELS) as [SubscriptionEntry['category'], string][]).map(([k, v]) => (
                <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Fakturering</Label>
          <Select value={form.billingCycle} onValueChange={(v) => setForm((f) => ({ ...f, billingCycle: v as SubscriptionEntry['billingCycle'] }))}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.entries(BILLING_CYCLE_LABELS) as [SubscriptionEntry['billingCycle'], string][]).map(([k, v]) => (
                <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Aktiv t.o.m. (valgfritt)</Label>
          <Input
            type="month"
            className="h-8 text-xs"
            min={currentMonthKey}
            value={form.activeUntil}
            onChange={(e) => setForm((f) => ({ ...f, activeUntil: e.target.value }))}
          />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={onCancel}>Avbryt</Button>
        <Button
          size="sm"
          disabled={!form.name.trim()}
          onClick={() => onSave({
            name: form.name.trim(),
            category: form.category,
            billingCycle: form.billingCycle,
            activeUntil: form.activeUntil || undefined,
          })}
        >
          Lagre
        </Button>
      </div>
    </div>
  )
}

function AddSubscriptionForm({ onSave, onCancel }: { onSave: (s: SubscriptionEntry) => void; onCancel: () => void }) {
  const now = new Date()
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const [form, setForm] = useState({
    name: '',
    category: 'tjeneste' as SubscriptionEntry['category'],
    defaultMonthly: 0,
    billingCycle: 'monthly' as SubscriptionEntry['billingCycle'],
    activeUntil: '',   // tom = løpende
  })

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">Nytt abonnement</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1">
            <Label className="text-xs">Navn</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="f.eks. Netflix"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Kategori</Label>
            <Select
              value={form.category}
              onValueChange={(v) => setForm((f) => ({ ...f, category: v as SubscriptionEntry['category'] }))}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.entries(SUBSCRIPTION_CATEGORY_LABELS) as [SubscriptionEntry['category'], string][]).map(([k, v]) => (
                  <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Fakturering</Label>
            <Select
              value={form.billingCycle}
              onValueChange={(v) => setForm((f) => ({ ...f, billingCycle: v as SubscriptionEntry['billingCycle'] }))}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.entries(BILLING_CYCLE_LABELS) as [SubscriptionEntry['billingCycle'], string][]).map(([k, v]) => (
                  <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Beløp/mnd</Label>
            <Input
              type="number"
              value={form.defaultMonthly}
              onChange={(e) => setForm((f) => ({ ...f, defaultMonthly: parseFloat(e.target.value) || 0 }))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Aktiv t.o.m. (valgfritt)</Label>
            <Input
              type="month"
              className="h-8 text-xs"
              min={currentMonthKey}
              value={form.activeUntil}
              onChange={(e) => setForm((f) => ({ ...f, activeUntil: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">La stå tom for løpende abonnement</p>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onCancel}>Avbryt</Button>
          <Button
            size="sm"
            disabled={!form.name.trim()}
            onClick={() =>
              onSave({
                id: crypto.randomUUID(),
                name: form.name.trim(),
                category: form.category,
                isActive: true,
                monthlyAmounts: {},
                defaultMonthly: form.defaultMonthly,
                billingCycle: form.billingCycle,
                ...(form.activeUntil ? { activeUntil: form.activeUntil } : {}),
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

function EditInsuranceForm({
  ins,
  currentYear,
  onSave,
  onCancel,
}: {
  ins: InsuranceEntry
  currentYear: string
  onSave: (updates: Partial<InsuranceEntry>) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState({
    provider: ins.provider,
    type: ins.type,
    year: currentYear,
    yearlyAmount: ins.yearlyAmounts[currentYear] ?? 0,
    activeFrom: ins.activeFrom ?? '',
    activeUntil: ins.activeUntil ?? '',
  })

  // Oppdater beløpet når år endres
  function handleYearChange(year: string) {
    setForm((f) => ({ ...f, year, yearlyAmount: ins.yearlyAmounts[year] ?? 0 }))
  }

  const allYears = [...new Set([
    ...Object.keys(ins.yearlyAmounts),
    currentYear,
    String(parseInt(currentYear) + 1),
  ])].sort()

  return (
    <div className="rounded-md border border-border bg-muted/20 p-3 space-y-3">
      <p className="text-xs font-medium">Rediger forsikring</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Leverandør</Label>
          <Input value={form.provider} onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Type</Label>
          <Input value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">År</Label>
          <select
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={form.year}
            onChange={(e) => handleYearChange(e.target.value)}
          >
            {allYears.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Årsbeløp (kr)</Label>
          <Input
            type="number"
            value={form.yearlyAmount}
            onChange={(e) => setForm((f) => ({ ...f, yearlyAmount: parseFloat(e.target.value) || 0 }))}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Aktiv fra (valgfritt)</Label>
          <Input
            type="month"
            className="h-8 text-xs"
            value={form.activeFrom}
            onChange={(e) => setForm((f) => ({ ...f, activeFrom: e.target.value }))}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Aktiv t.o.m. (valgfritt)</Label>
          <Input
            type="month"
            className="h-8 text-xs"
            value={form.activeUntil}
            onChange={(e) => setForm((f) => ({ ...f, activeUntil: e.target.value }))}
          />
        </div>
      </div>
      {Object.keys(ins.yearlyAmounts).length > 0 && (
        <div className="text-[10px] text-muted-foreground space-y-0.5">
          <p>Prishistorikk:</p>
          {Object.entries(ins.yearlyAmounts).sort(([a], [b]) => a.localeCompare(b)).map(([yr, amt]) => (
            <p key={yr} className="font-mono">{yr}: {Math.round(amt).toLocaleString('no-NO')} kr/år ({Math.round(amt / 12).toLocaleString('no-NO')} kr/mnd)</p>
          ))}
        </div>
      )}
      <div className="flex gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={onCancel}>Avbryt</Button>
        <Button
          size="sm"
          disabled={!form.provider.trim() || !form.type.trim()}
          onClick={() =>
            onSave({
              provider: form.provider.trim(),
              type: form.type.trim(),
              yearlyAmounts: { ...ins.yearlyAmounts, [form.year]: form.yearlyAmount },
              activeFrom: form.activeFrom || undefined,
              activeUntil: form.activeUntil || undefined,
            })
          }
        >
          Lagre
        </Button>
      </div>
    </div>
  )
}

function CancelInsuranceForm({
  ins,
  onSave,
  onCancel,
}: {
  ins: InsuranceEntry
  onSave: (updates: Partial<InsuranceEntry>) => void
  onCancel: () => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [cancelledDate, setCancelledDate] = useState(today)
  const [bonus, setBonus] = useState(ins.bonus != null ? String(ins.bonus) : '')

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-amber-400">Avslutt forsikring</p>
      <div className="flex flex-wrap items-end gap-2 text-xs">
        <div className="space-y-0.5">
          <Label className="text-xs">Avslutningsdato</Label>
          <Input
            type="date"
            className="h-7 w-36 text-xs"
            value={cancelledDate}
            onChange={(e) => setCancelledDate(e.target.value)}
          />
        </div>
        <div className="space-y-0.5">
          <Label className="text-xs">Bonus ved avslutning (%)</Label>
          <Input
            type="number"
            className="h-7 w-24 text-xs"
            placeholder="f.eks. 70"
            value={bonus}
            onChange={(e) => setBonus(e.target.value)}
          />
        </div>
        <Button
          size="sm"
          className="h-7 text-xs bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30"
          variant="ghost"
          onClick={() => onSave({
            status: 'avsluttet',
            isActive: false,
            cancelledDate,
            bonus: bonus ? parseFloat(bonus) : undefined,
          })}
        >
          Avslutt
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onCancel}>
          Avbryt
        </Button>
      </div>
    </div>
  )
}

function AddInsuranceForm({ onSave, onCancel }: { onSave: (ins: InsuranceEntry) => void; onCancel: () => void }) {
  const currentYear = String(new Date().getFullYear())
  const [form, setForm] = useState({ provider: '', type: '', yearlyAmount: 0, activeFrom: '', activeUntil: '' })

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">Ny forsikring</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Leverandør</Label>
            <Input value={form.provider} onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))} placeholder="f.eks. FREMTIND" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Type</Label>
            <Input value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} placeholder="f.eks. Personforsikring" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Årsbeløp {currentYear}</Label>
            <Input
              type="number"
              value={form.yearlyAmount}
              onChange={(e) => setForm((f) => ({ ...f, yearlyAmount: parseFloat(e.target.value) || 0 }))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Aktiv fra (valgfritt)</Label>
            <Input
              type="month"
              className="h-8 text-xs"
              value={form.activeFrom}
              onChange={(e) => setForm((f) => ({ ...f, activeFrom: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Aktiv t.o.m. (valgfritt)</Label>
            <Input
              type="month"
              className="h-8 text-xs"
              value={form.activeUntil}
              onChange={(e) => setForm((f) => ({ ...f, activeUntil: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">La stå tom for løpende forsikring</p>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onCancel}>Avbryt</Button>
          <Button
            size="sm"
            disabled={!form.provider.trim() || !form.type.trim()}
            onClick={() =>
              onSave({
                id: crypto.randomUUID(),
                provider: form.provider.trim(),
                type: form.type.trim(),
                yearlyAmounts: { [currentYear]: form.yearlyAmount },
                isActive: true,
                ...(form.activeFrom ? { activeFrom: form.activeFrom } : {}),
                ...(form.activeUntil ? { activeUntil: form.activeUntil } : {}),
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
