import { useState, useMemo, useEffect } from 'react'
import {
  Gift, Plus, Trash2, Pencil, AlertTriangle,
  Users, SlidersHorizontal, TrendingUp, Wallet, ChevronDown, ChevronUp, Share2,
} from 'lucide-react'
import * as RadixSlider from '@radix-ui/react-slider'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useGiftStore, giftSharedSlice, giftSliceIsEmpty } from '@/application/useGiftStore'
import { useSharedGaverStore } from '@/store/useSharedGaverStore'
import {
  OCCASION_LABELS, RELATIONSHIP_LABELS,
  STATUS_LABELS, DISTRIBUTION_LABELS,
  DEFAULT_WEIGHT_RULES,
} from '@/domain/gifts/defaultWeights'
import {
  calculateGiftAmount, calculateGiftResult, calculateActualVsPlanned,
  giftAmountExplanation, roundGiftAmount, deriveAutoEvents,
} from '@/domain/gifts/giftCalculator'
import type {
  GiftRecipient, GiftEvent, Occasion, RelationshipType,
  LifePhase, Ownership, EventStatus,
} from '@/types/gifts'

// ─── Formattering ───────────────────────────────────────────────

function ownershipLabelsFor(settings: { memberA: { name: string }; memberB: { name: string } }) {
  return {
    A: settings.memberA.name || 'Person A',
    B: settings.memberB.name || 'Person B',
    felles: 'Felles',
  } as Record<import('@/types/gifts').Ownership, string>
}

function fmtNOK(v: number) {
  return Math.round(v).toLocaleString('no-NO') + ' kr'
}

function fmtMonth(m: number) {
  const names = ['Januar', 'Februar', 'Mars', 'April', 'Mai', 'Juni',
    'Juli', 'August', 'September', 'Oktober', 'November', 'Desember']
  return names[m - 1] ?? ''
}


/** Returnerer alderen ved neste bursdag hvis den er rund (delelig med 10), ellers null */
function roundBirthdayAge(birthDate: string): number | null {
  const parts = birthDate.split('-').map(Number)
  if (parts.length < 3) return null
  const [year, mo, day] = parts
  const today = new Date()
  const thisYear = today.getFullYear()
  const thisYearDate = new Date(thisYear, mo - 1, day)
  const nextBirthYear = thisYearDate < today ? thisYear + 1 : thisYear
  const age = nextBirthYear - year
  return age % 10 === 0 ? age : null
}

function lifePhaseFromBirthDate(dateStr: string): LifePhase | null {
  if (!dateStr) return null
  const birth = new Date(dateStr)
  if (isNaN(birth.getTime())) return null
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  if (age < 0) return null
  if (age <= 12) return 'barn_0_12'
  if (age <= 17) return 'tenåring'
  if (age <= 25) return 'ung_voksen'
  if (age <= 66) return 'voksen'
  return 'senior'
}

// ─── Interne tabs ───────────────────────────────────────────────

type GiftTab = 'oversikt' | 'mottakere' | 'fordeling' | 'spareplan' | 'satser'

const TABS: { id: GiftTab; label: string; Icon: React.FC<{ className?: string }> }[] = [
  { id: 'oversikt', label: 'Oversikt', Icon: TrendingUp },
  { id: 'mottakere', label: 'Mottakere', Icon: Users },
  { id: 'fordeling', label: 'Fordeling', Icon: Wallet },
  { id: 'spareplan', label: 'Spareplan', Icon: Gift },
  { id: 'satser', label: 'Tilpass', Icon: SlidersHorizontal },
]

// ─── Oversikt ───────────────────────────────────────────────────

function OverviewTab({ setTab }: { setTab: (tab: GiftTab) => void }) {
  const events = useGiftStore((s) => s.events)
  const settings = useGiftStore((s) => s.settings)
  const recipients = useGiftStore((s) => s.recipients)
  const addEvent = useGiftStore((s) => s.addEvent)
  const updateEvent = useGiftStore((s) => s.updateEvent)
  const weightRules = useGiftStore((s) => s.weightRules)
  const [prefill, setPrefill] = useState<{ recipientId: string; occasion: Occasion } | null>(null)

  const autoEvents = useMemo(
    () => deriveAutoEvents(recipients, events, weightRules, settings),
    [recipients, events, weightRules, settings]
  )

  const effectiveEvents = useMemo(() => [...events, ...autoEvents], [events, autoEvents])

  const excludeXmas = settings.excludeChristmasFromSavings ?? false

  const savingsEvents = useMemo(
    () => excludeXmas ? effectiveEvents.filter((e) => e.occasion !== 'jul') : effectiveEvents,
    [effectiveEvents, excludeXmas]
  )

  // Sparepuls-beregning (respekterer jul-ekskludering)
  const result = useMemo(() => calculateGiftResult(savingsEvents, settings, recipients), [savingsEvents, settings, recipients])

  // Totalkostnad inkl. jul (til månedsgraf og kostnadsdrivere)
  const fullResult = useMemo(() => calculateGiftResult(effectiveEvents, settings, recipients), [effectiveEvents, settings, recipients])

  const recipientMap = useMemo(
    () => new Map(recipients.map((r) => [r.id, r])),
    [recipients]
  )

  const hasRecipients = recipients.length > 0
  const hasEvents = effectiveEvents.filter((e) => e.status !== 'droppet').length > 0

  // Neste hendelser med dato, sortert — bursdager fremhevet
  const upcoming = useMemo(() => {
    const today = new Date()
    const nextYear = new Date(today.getFullYear() + 1, today.getMonth(), today.getDate())
    return effectiveEvents
      .filter((e) => e.status !== 'droppet' && e.date)
      .map((e) => {
        const d = new Date(e.date!)
        // Beregn neste forekomst av datoen (hvis i fortid, bruk neste år for bursdager)
        let next = new Date(d)
        if (e.occasion === 'bursdag') {
          next = new Date(today.getFullYear(), d.getMonth(), d.getDate())
          if (next < today) next = new Date(today.getFullYear() + 1, d.getMonth(), d.getDate())
        }
        return { event: e, nextDate: next }
      })
      .filter(({ nextDate }) => nextDate <= nextYear)
      .sort((a, b) => a.nextDate.getTime() - b.nextDate.getTime())
      .slice(0, 8)
  }, [effectiveEvents])

  // Foreslåtte hendelser: kun de som IKKE dekkes av auto-events (dvs. mangler birthDate)
  const missingEvents = useMemo(() => {
    const suggestions: { recipient: GiftRecipient; occasion: Occasion }[] = []
    for (const r of recipients) {
      const hasB = effectiveEvents.some((e) => e.recipientId === r.id && e.occasion === 'bursdag')
      if (r.receivesBirthdayGift && r.birthDate && !hasB) {
        suggestions.push({ recipient: r, occasion: 'bursdag' })
      }
      const hasJ = effectiveEvents.some((e) => e.recipientId === r.id && e.occasion === 'jul')
      if (r.receivesChristmasGift && !hasJ) {
        suggestions.push({ recipient: r, occasion: 'jul' })
      }
    }
    return suggestions
  }, [recipients, effectiveEvents])

  const nameA = settings.memberA.name || 'Person A'
  const nameB = settings.memberB.name || 'Person B'
  const monthlyA = result.personAMonthlySaving
  const monthlyB = result.personBMonthlySaving
  const monthlyTotal = monthlyA + monthlyB

  function daysUntil(d: Date) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  }

  function fmtRelDate(d: Date) {
    const days = daysUntil(d)
    if (days === 0) return 'I dag'
    if (days === 1) return 'I morgen'
    if (days < 7) return `Om ${days} dager`
    if (days < 14) return 'Neste uke'
    if (days < 31) return `Om ${Math.round(days / 7)} uker`
    const months = Math.round(days / 30)
    return `Om ${months} mnd`
  }

  // State A: helt tom
  if (!hasRecipients && !hasEvents) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-16 text-center gap-4 px-6">
        <Gift className="h-12 w-12 opacity-20" />
        <div>
          <p className="font-medium text-sm">Kom i gang</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-xs">
            Legg til mottakere — folk du gir gaver til — og hendelsene vil hjelpe deg planlegge og spare.
          </p>
        </div>
        <Button size="sm" onClick={() => setTab('mottakere')}>
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Legg til mottaker
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-5 p-4">
      {/* Advarsler */}
      {result.warnings.map((w, i) => (
        <div key={i} className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          {w}
        </div>
      ))}

      {/* State B: mottakere men ingen hendelser */}
      {hasRecipients && !hasEvents && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mottakere ({recipients.length})</p>
          <div className="grid grid-cols-2 gap-2">
            {recipients.slice(0, 6).map((r) => (
              <div key={r.id} className="flex items-center gap-2 rounded border border-border/40 bg-muted/10 px-2.5 py-2">
                <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-xs font-semibold shrink-0">
                  {r.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">{r.name}</p>
                  <p className="text-xs text-muted-foreground">{RELATIONSHIP_LABELS[r.relationshipType]}</p>
                </div>
              </div>
            ))}
          </div>
          {recipients.length > 6 && (
            <p className="text-xs text-muted-foreground">+{recipients.length - 6} til</p>
          )}
        </div>
      )}

      {/* Sparepuls */}
      {hasEvents && (() => {
        const countA = recipients.filter((r) => r.ownership === 'A').length
        const countB = recipients.filter((r) => r.ownership === 'B').length
        const countFelles = recipients.filter((r) => r.ownership === 'felles').length
        return (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Sparepuls</p>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg border border-border bg-muted/10 px-3 py-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">Totalt / mnd</p>
                <p className="text-lg font-semibold font-mono">{fmtNOK(monthlyTotal)}</p>
                <p className="text-xs text-muted-foreground/60 mt-1">{recipients.length} mottakere</p>
              </div>
              <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-3 text-center">
                <p className="text-xs text-blue-400/70 mb-1">{nameA}</p>
                <p className="text-lg font-semibold font-mono text-blue-400">{fmtNOK(monthlyA)}</p>
                <p className="text-xs text-blue-400/40 mt-1">
                  {countA} mottakere{countFelles > 0 ? ` + ${countFelles} felles` : ''}
                </p>
              </div>
              <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 px-3 py-3 text-center">
                <p className="text-xs text-violet-400/70 mb-1">{nameB}</p>
                <p className="text-lg font-semibold font-mono text-violet-400">{fmtNOK(monthlyB)}</p>
                <p className="text-xs text-violet-400/40 mt-1">
                  {countB} mottakere{countFelles > 0 ? ` + ${countFelles} felles` : ''}
                </p>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Foreslåtte hendelser */}
      {missingEvents.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Foreslåtte hendelser
          </p>
          <div className="space-y-1.5">
            {missingEvents.slice(0, 5).map(({ recipient: r, occasion }) => (
              <div
                key={r.id + occasion}
                className="flex items-center justify-between rounded border border-dashed border-border/50 px-3 py-2 text-xs bg-muted/5"
              >
                <div>
                  <span className="font-medium">{r.name}</span>
                  <span className="text-muted-foreground ml-1.5">
                    mangler {OCCASION_LABELS[occasion]}
                    {occasion === 'bursdag' && r.birthDate && (
                      <> — {new Date().getFullYear() - parseInt(r.birthDate.split('-')[0])} år</>
                    )}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-xs px-2"
                  onClick={() => setPrefill({ recipientId: r.id, occasion })}
                >
                  <Plus className="h-3 w-3 mr-1" /> Legg til
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Kommende hendelser / bursdager */}
      {upcoming.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Kommende hendelser</p>
          <div className="space-y-1.5">
            {upcoming.map(({ event: e, nextDate }) => {
              const rec = recipientMap.get(e.recipientId)
              const amount = e.manualAmount ?? e.calculatedAmount
              const days = daysUntil(nextDate)
              const isSoon = days <= 14
              const isAuto = e.id.startsWith('auto-')
              const storedStatus = isAuto
                ? events.find((se) => se.recipientId === e.recipientId && se.occasion === e.occasion)?.status
                : e.status
              const status = storedStatus ?? 'planlagt'

              function promoteOrUpdate(newStatus: import('@/types/gifts').EventStatus) {
                const stored = events.find((se) => se.recipientId === e.recipientId && se.occasion === e.occasion)
                if (stored) {
                  updateEvent(stored.id, { status: newStatus })
                } else {
                  addEvent({ ...e, id: crypto.randomUUID(), status: newStatus })
                }
              }

              return (
                    <div
                      key={e.id}
                      className={cn(
                        'flex items-center justify-between rounded border px-3 py-2 text-xs',
                        status === 'kjøpt' ? 'border-green-500/20 bg-green-500/5 opacity-70' :
                        isSoon ? 'border-amber-500/30 bg-amber-500/5' :
                        'border-border/40 bg-muted/10'
                      )}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={cn('font-medium', status === 'kjøpt' && 'line-through opacity-60')}>{rec?.name ?? '—'}</span>
                          <span className="text-muted-foreground">{OCCASION_LABELS[e.occasion]}</span>
                          {isSoon && status === 'planlagt' && <span className="text-amber-400 font-bold">!</span>}
                          {status === 'kjøpt' && <span className="text-green-400">✓</span>}
                        </div>
                        <p className={cn('mt-0.5', isSoon && status === 'planlagt' ? 'text-amber-400' : 'text-muted-foreground')}>
                          {fmtRelDate(nextDate)}
                          <span className="ml-1.5 opacity-50">
                            {nextDate.toLocaleDateString('no-NO', { day: 'numeric', month: 'short', year: nextDate.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined })}
                          </span>
                          {e.occasion === 'bursdag' && rec?.birthDate && (() => {
                            const age = nextDate.getFullYear() - parseInt(rec.birthDate.split('-')[0])
                            const isRound = age % 10 === 0
                            return (
                              <span className={cn('ml-1', isRound ? 'text-amber-400 font-medium' : 'opacity-50')}>
                                · {age} år{isRound ? ' ★' : ''}
                              </span>
                            )
                          })()}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 ml-3 shrink-0">
                        <span className="font-mono font-medium">{fmtNOK(amount)}</span>
                        {status === 'kjøpt' ? (
                          <button
                            className="px-1.5 py-0.5 rounded border border-green-500/30 text-green-400 bg-green-500/10 hover:bg-green-500/20"
                            onClick={() => promoteOrUpdate('planlagt')}
                            title="Angre kjøpt"
                          >✓</button>
                        ) : (
                          <button
                            className="px-1.5 py-0.5 rounded border border-border/30 text-muted-foreground/50 hover:border-green-500/40 hover:text-green-400"
                            onClick={() => promoteOrUpdate('kjøpt')}
                            title="Merk som kjøpt"
                          >✓</button>
                        )}
                        <button
                          className="px-1.5 py-0.5 rounded border border-border/20 text-muted-foreground/30 hover:border-red-500/30 hover:text-red-400"
                          onClick={() => promoteOrUpdate('droppet')}
                          title="Dropp denne gaven"
                        >✕</button>
                      </div>
                    </div>
                  )
            })}
          </div>
        </div>
      )}

      {hasEvents && upcoming.length === 0 && (
        <p className="text-xs text-muted-foreground bg-muted/20 rounded px-3 py-2">
          Ingen kommende hendelser med dato. Legg til datoer på hendelsene dine.
        </p>
      )}

      {/* Gavebelastning per måned */}
      {hasEvents && fullResult.monthlyBreakdown.some((m) => m.totalCost > 0) && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Utgifter per måned</p>
          <MonthLoadChart months={fullResult.monthlyBreakdown} />
        </div>
      )}

      {/* Kostnadsdrivere */}
      {hasEvents && (() => {
        const annual = fullResult.annualTotal
        if (annual === 0) return null
        const drivers = recipients
          .map((r) => {
            const bVal = r.receivesBirthdayGift ? (r.occasionOverrides?.bursdag ?? weightRules.occasionOverrides?.[r.relationshipType]?.bursdag ?? weightRules.relationshipBaseAmounts[r.relationshipType] ?? 0) : 0
            const jVal = r.receivesChristmasGift ? (r.occasionOverrides?.jul ?? weightRules.occasionOverrides?.[r.relationshipType]?.jul ?? weightRules.relationshipBaseAmounts[r.relationshipType] ?? 0) : 0
            return { name: r.name, total: bVal + jVal }
          })
          .filter((d) => d.total > 0)
          .sort((a, b) => b.total - a.total)
          .slice(0, 5)
        const monthly = Math.round(annual / 12)
        return (
          <div className="rounded border border-border/30 bg-muted/10 px-3 py-2.5 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Totalt per år</span>
              <span className="font-mono font-medium">{fmtNOK(annual)} <span className="text-muted-foreground font-normal">→ {fmtNOK(monthly)}/mnd</span></span>
            </div>
            <div className="space-y-1">
              {drivers.map((d) => (
                <div key={d.name} className="flex items-center justify-between text-muted-foreground">
                  <span>{d.name}</span>
                  <span className="font-mono">{fmtNOK(d.total)}/år</span>
                </div>
              ))}
            </div>
            <p className="text-muted-foreground/50 text-xs">Juster satser i Tilpass, eller dropp gaver i mottakerlisten.</p>
          </div>
        )
      })()}

      {/* EventModal for suggestions */}
      {prefill && (
        <EventModal
          open
          defaultRecipientId={prefill.recipientId}
          defaultOccasion={prefill.occasion}
          recipients={recipients}
          settings={settings}
          weightRules={weightRules}
          onSave={(ev) => { addEvent({ ...ev, id: crypto.randomUUID() }); setPrefill(null) }}
          onClose={() => setPrefill(null)}
        />
      )}
    </div>
  )
}

function MonthLoadChart({ months }: { months: import('@/types/gifts').MonthlyBreakdown[] }) {
  const MONTH_SHORT = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des']
  const active = months.filter((m) => m.totalCost > 0)
  const maxCost = Math.max(...active.map((m) => m.totalCost), 1)
  const currentMonth = new Date().getMonth() + 1

  if (active.length === 0) return null

  return (
    <div className="space-y-2">
      {active.map((m) => {
        const pct = m.totalCost / maxCost
        const tags = Object.entries(
          m.events.reduce<Record<string, number>>((acc, e) => { acc[e.occasion] = (acc[e.occasion] ?? 0) + 1; return acc }, {})
        ).map(([occ, count]) => (count > 1 ? `${count} × ${OCCASION_LABELS[occ as import('@/types/gifts').Occasion]}` : OCCASION_LABELS[occ as import('@/types/gifts').Occasion]))
        return (
          <div key={m.month} className="flex items-center gap-2 text-xs">
            <span className={cn('w-7 shrink-0 font-medium', m.month === currentMonth ? 'text-primary' : 'text-muted-foreground/70')}>
              {MONTH_SHORT[m.month - 1]}
            </span>
            <div className="flex-1 h-3.5 bg-muted/20 rounded overflow-hidden">
              <div
                className={cn('h-full rounded transition-all', m.isHeavy ? 'bg-amber-500/60' : m.month === currentMonth ? 'bg-primary/50' : 'bg-muted-foreground/35')}
                style={{ width: `${Math.max(pct * 100, 2)}%` }}
              />
            </div>
            <span className="font-mono w-16 text-right shrink-0 text-muted-foreground">{fmtNOK(m.totalCost)}</span>
            <span className="text-muted-foreground/40 text-xs truncate max-w-[120px]">{tags.join(', ')}{m.isHeavy ? ' ⚡' : ''}</span>
          </div>
        )
      })}
    </div>
  )
}

function MetricCard({ label, value, sub, colorClass }: {
  label: string; value: string; sub?: string; colorClass?: string
}) {
  return (
    <div className="rounded-lg border border-border bg-card/50 p-3">
      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">{label}</p>
      <p className={cn('text-lg font-bold font-mono', colorClass ?? 'text-foreground')}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  )
}

// ─── Mottakere ──────────────────────────────────────────────────

function RecipientsTab() {
  const recipients = useGiftStore((s) => s.recipients)
  const addRecipient = useGiftStore((s) => s.addRecipient)
  const updateRecipient = useGiftStore((s) => s.updateRecipient)
  const removeRecipient = useGiftStore((s) => s.removeRecipient)
  const settings = useGiftStore((s) => s.settings)
  const weightRules = useGiftStore((s) => s.weightRules)

  function calcOccasionAmount(r: GiftRecipient, occasion: import('@/types/gifts').Occasion): number {
    const event: import('@/types/gifts').GiftEvent = {
      id: '', recipientId: r.id, occasion,
      ownership: r.ownership, calculatedAmount: 0,
      isLocked: false, status: 'planlagt',
    }
    return roundGiftAmount(calculateGiftAmount(event, r, weightRules), settings.roundingNearest)
  }

  const events = useGiftStore((s) => s.events)
  const addEvent = useGiftStore((s) => s.addEvent)
  const updateEvent = useGiftStore((s) => s.updateEvent)

  const [editing, setEditing] = useState<GiftRecipient | null>(null)
  const [adding, setAdding] = useState(false)
  const [modalKey, setModalKey] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [specialEventRecipient, setSpecialEventRecipient] = useState<string | null>(null)
  const [specialEventKey, setSpecialEventKey] = useState(0)

  function openAdding() { setModalKey((k) => k + 1); setAdding(true) }
  function openEditing(r: GiftRecipient) { setModalKey((k) => k + 1); setEditing(r) }

  function toggleSelected(id: string) { setSelectedId((prev) => prev === id ? null : id) }

  function promoteEvent(autoEvent: import('@/types/gifts').GiftEvent, status: import('@/types/gifts').EventStatus) {
    const stored = events.find((e) => e.recipientId === autoEvent.recipientId && e.occasion === autoEvent.occasion)
    if (stored) {
      updateEvent(stored.id, { status })
    } else {
      addEvent({ ...autoEvent, id: crypto.randomUUID(), status })
    }
  }

  function resetEventStatus(recipientId: string, occasion: Occasion) {
    const stored = events.find((e) => e.recipientId === recipientId && e.occasion === occasion)
    if (stored) updateEvent(stored.id, { status: 'planlagt' })
  }

  function handleSave(r: GiftRecipient) {
    if (r.id && recipients.find((x) => x.id === r.id)) {
      updateRecipient(r.id, r)
    } else {
      addRecipient({ ...r, id: crypto.randomUUID() })
    }
    setEditing(null)
    setAdding(false)
  }

  type SortMode = 'eierskap' | 'bursdag' | 'gaveverdi' | 'relasjon'
  const [sort, setSort] = useState<SortMode>('eierskap')

  const FAMILY_RELS = new Set<RelationshipType>(['partner', 'foreldre', 'svigerforeldre', 'søsken', 'svigersøsken', 'besteforeldre', 'barn', 'stebarn', 'tante_onkel', 'niese_nevø', 'fadderbarn'])
  const FRIEND_RELS = new Set<RelationshipType>(['nær_venn', 'venn'])

  function nextBDays(r: GiftRecipient): number {
    if (!r.birthDate) return 9999
    const [, mo, day] = r.birthDate.split('-').map(Number)
    const today = new Date(); today.setHours(0,0,0,0)
    let next = new Date(today.getFullYear(), mo - 1, day)
    if (next < today) next = new Date(today.getFullYear() + 1, mo - 1, day)
    return Math.round((next.getTime() - today.getTime()) / 86400000)
  }

  function nextBStr(r: GiftRecipient): string | null {
    if (!r.birthDate) return null
    const days = nextBDays(r)
    if (days === 9999) return null
    if (days === 0) return 'I dag! 🎉'
    if (days === 1) return 'I morgen'
    if (days < 14) return `Om ${days} dager`
    if (days < 60) return `Om ${Math.round(days / 7)} uker`
    return `Om ${Math.round(days / 30.5)} mnd`
  }

  function totalValue(r: GiftRecipient): number {
    return (r.receivesBirthdayGift ? calcOccasionAmount(r, 'bursdag') : 0)
      + (r.receivesChristmasGift ? calcOccasionAmount(r, 'jul') : 0)
  }

  const nameA = settings.memberA.name || 'Person A'
  const nameB = settings.memberB.name || 'Person B'

  const sections = useMemo(() => {
    type Section = { title: string; items: GiftRecipient[] }
    const sorted = [...recipients]

    if (sort === 'bursdag') {
      sorted.sort((a, b) => nextBDays(a) - nextBDays(b))
      return [{ title: '', items: sorted }] as Section[]
    }
    if (sort === 'gaveverdi') {
      sorted.sort((a, b) => totalValue(b) - totalValue(a))
      return [{ title: '', items: sorted }] as Section[]
    }
    if (sort === 'relasjon') {
      const groups: Record<string, GiftRecipient[]> = { Familie: [], Venner: [], Andre: [] }
      for (const r of sorted) {
        if (FAMILY_RELS.has(r.relationshipType)) groups.Familie.push(r)
        else if (FRIEND_RELS.has(r.relationshipType)) groups.Venner.push(r)
        else groups.Andre.push(r)
      }
      return Object.entries(groups).filter(([, v]) => v.length > 0).map(([t, v]) => ({ title: t, items: v })) as Section[]
    }
    // eierskap (default)
    return [
      { title: nameA, items: sorted.filter((r) => r.ownership === 'A') },
      { title: nameB, items: sorted.filter((r) => r.ownership === 'B') },
      { title: 'Felles', items: sorted.filter((r) => r.ownership === 'felles') },
    ].filter((s) => s.items.length > 0) as Section[]
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipients, sort, nameA, nameB])

  return (
    <div className="p-4 space-y-4">
      {/* Topplinje */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1 flex-wrap">
          {([
            ['eierskap', 'Eierskap'],
            ['bursdag', 'Bursdag'],
            ['gaveverdi', 'Gaveverdi'],
            ['relasjon', 'Relasjon'],
          ] as [SortMode, string][]).map(([m, label]) => (
            <button
              key={m}
              onClick={() => setSort(m)}
              className={cn(
                'text-xs px-2.5 py-1 rounded-full border transition-colors',
                sort === m
                  ? 'border-primary/50 bg-primary/10 text-foreground'
                  : 'border-border/40 text-muted-foreground hover:text-foreground'
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <Button size="sm" onClick={openAdding} className="shrink-0">
          <Plus className="h-3.5 w-3.5 mr-1" /> Legg til
        </Button>
      </div>

      {/* Seksjoner */}
      {recipients.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          <Users className="h-8 w-8 mx-auto mb-2 opacity-20" />
          <p className="text-sm mb-3">Ingen mottakere ennå</p>
          <Button size="sm" variant="outline" onClick={openAdding}>Legg til mottaker</Button>
        </div>
      ) : (
        sections.map(({ title, items }) => (
          <div key={title || '_'}>
            {title && (
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                {title} <span className="font-normal opacity-60">({items.length})</span>
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              {items.map((r) => {
                const initials = r.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
                const roundAge = r.birthDate ? roundBirthdayAge(r.birthDate) : null
                const nextB = nextBStr(r)
                const bVal = calcOccasionAmount(r, 'bursdag')
                const jVal = calcOccasionAmount(r, 'jul')
                const hasOverride = r.occasionOverrides && Object.keys(r.occasionOverrides).length > 0
                return (
                  <div key={r.id}
                    onClick={() => toggleSelected(r.id)}
                    className={cn(
                    'relative rounded-lg border bg-card/40 p-2.5 flex flex-col gap-1.5 cursor-pointer transition-colors',
                    selectedId === r.id
                      ? r.ownership === 'A' ? 'border-blue-500/50 bg-blue-500/5'
                        : r.ownership === 'B' ? 'border-violet-500/50 bg-violet-500/5'
                        : 'border-primary/40 bg-muted/20'
                      : r.ownership === 'A' ? 'border-blue-500/20 hover:border-blue-500/35'
                      : r.ownership === 'B' ? 'border-violet-500/20 hover:border-violet-500/35'
                      : 'border-border/60 hover:border-border'
                  )}>
                    {/* Avatar + navn */}
                    <div className="flex items-start gap-2">
                      <div className={cn(
                        'h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5',
                        r.ownership === 'A' ? 'bg-blue-500/20 text-blue-400' :
                        r.ownership === 'B' ? 'bg-violet-500/20 text-violet-400' :
                        'bg-muted/50 text-muted-foreground'
                      )}>
                        {initials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-tight truncate" title={r.name}>{r.name}</p>
                        <p className="text-xs text-muted-foreground leading-tight truncate">
                          {RELATIONSHIP_LABELS[r.relationshipType]}
                        </p>
                      </div>
                      {/* Edit/delete */}
                      <div className="flex gap-0.5 shrink-0">
                        <button className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground/50 hover:text-foreground" onClick={(e) => { e.stopPropagation(); openEditing(r) }}>
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground/50 hover:text-red-400" onClick={(e) => { e.stopPropagation(); removeRecipient(r.id) }}>
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>

                    {/* Rund dag badge */}
                    {roundAge && (
                      <span className="self-start text-xs px-1.5 py-0.5 rounded border border-amber-500/50 text-amber-400 bg-amber-500/10 leading-tight">
                        ★ {roundAge} år
                      </span>
                    )}

                    {/* Gave-beløp */}
                    <div className="flex gap-2 text-xs">
                      <span className={r.receivesBirthdayGift ? 'text-foreground/80' : 'text-muted-foreground/25'}>
                        🎂 {fmtNOK(bVal)}
                      </span>
                      <span className={r.receivesChristmasGift ? 'text-foreground/80' : 'text-muted-foreground/25'}>
                        🎄 {fmtNOK(jVal)}
                      </span>
                      {hasOverride && <span className="text-primary/60 text-xs">✎</span>}
                    </div>

                    {/* Neste bursdag */}
                    {nextB && (
                      <p className="text-xs text-muted-foreground/60 leading-tight">{nextB}</p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))
      )}

      {/* Person-hendelser panel */}
      {selectedId && (() => {
        const person = recipients.find((r) => r.id === selectedId)
        if (!person) return null
        const autoEvs = deriveAutoEvents([person], events, weightRules, settings)
        const storedEvs = events.filter((e) => e.recipientId === selectedId)
        const allEvs: import('@/types/gifts').GiftEvent[] = [
          ...storedEvs,
          ...autoEvs.filter((ae) => !storedEvs.some((se) => se.occasion === ae.occasion)),
        ]
        return (
          <div className="rounded-lg border border-border/60 bg-card/30 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">{person.name} — hendelser</p>
              <button className="text-xs text-muted-foreground/50 hover:text-muted-foreground" onClick={() => setSelectedId(null)}>✕</button>
            </div>
            <div className="space-y-1.5">
              {allEvs.length === 0 && (
                <p className="text-xs text-muted-foreground/60 py-1">Ingen hendelser ennå</p>
              )}
              {allEvs.map((ev) => {
                const isAuto = !storedEvs.some((se) => se.id === ev.id)
                const amount = ev.manualAmount ?? ev.calculatedAmount
                const status = storedEvs.find((se) => se.occasion === ev.occasion)?.status ?? 'planlagt'
                return (
                  <div key={ev.id} className={cn(
                    'flex items-center justify-between rounded border px-2.5 py-1.5 text-xs transition-colors',
                    status === 'kjøpt' ? 'border-green-500/20 bg-green-500/5' :
                    status === 'droppet' ? 'border-border/20 bg-muted/5 opacity-50' :
                    'border-border/30 bg-card/20'
                  )}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium">{OCCASION_LABELS[ev.occasion]}</span>
                      <span className="text-muted-foreground">
                        {ev.date
                          ? new Date(ev.date).toLocaleDateString('no-NO', { day: 'numeric', month: 'short' })
                          : ev.month ? fmtMonth(ev.month) : '—'}
                      </span>
                      <span className="font-mono text-muted-foreground">{fmtNOK(amount)}</span>
                      {isAuto && <span className="text-muted-foreground/30">auto</span>}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {status === 'kjøpt' ? (
                        <button
                          className="px-2 py-0.5 rounded border border-green-500/30 text-green-400 bg-green-500/10"
                          onClick={() => resetEventStatus(selectedId, ev.occasion)}
                        >✓ Kjøpt</button>
                      ) : (
                        <button
                          className="px-2 py-0.5 rounded border border-border/30 text-muted-foreground/60 hover:border-green-500/30 hover:text-green-400"
                          onClick={() => promoteEvent(ev, 'kjøpt')}
                        >Kjøpt</button>
                      )}
                      {status === 'droppet' ? (
                        <button
                          className="px-2 py-0.5 rounded border border-red-500/20 text-red-400/70 hover:text-muted-foreground"
                          onClick={() => resetEventStatus(selectedId, ev.occasion)}
                        >↩ Angre</button>
                      ) : (
                        <button
                          className="px-2 py-0.5 rounded border border-border/20 text-muted-foreground/40 hover:text-red-400 hover:border-red-500/20"
                          onClick={() => promoteEvent(ev, 'droppet')}
                        >Dropp</button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            <button
              className="text-xs text-muted-foreground/50 hover:text-muted-foreground border border-dashed border-border/30 rounded px-3 py-1.5 w-full"
              onClick={() => { setSpecialEventKey((k) => k + 1); setSpecialEventRecipient(selectedId) }}
            >
              + Legg til spesiell hendelse
            </button>
          </div>
        )
      })()}

      <RecipientModal
        key={modalKey}
        open={adding || editing !== null}
        initial={editing ?? undefined}
        onSave={handleSave}
        onClose={() => { setAdding(false); setEditing(null) }}
      />

      {/* EventModal for spesielle hendelser */}
      <EventModal
        key={specialEventKey}
        open={specialEventRecipient !== null}
        defaultRecipientId={specialEventRecipient ?? undefined}
        recipients={recipients}
        settings={settings}
        weightRules={weightRules}
        onSave={(ev) => { addEvent({ ...ev, id: ev.id || crypto.randomUUID() }); setSpecialEventRecipient(null) }}
        onClose={() => setSpecialEventRecipient(null)}
      />
    </div>
  )
}

function RecipientModal({
  open, initial, onSave, onClose,
}: {
  open: boolean
  initial?: GiftRecipient
  onSave: (r: GiftRecipient) => void
  onClose: () => void
}) {
  const settings = useGiftStore((s) => s.settings)
  const weightRules = useGiftStore((s) => s.weightRules)
  const ownershipLabels = ownershipLabelsFor(settings)

  const [name, setName] = useState(initial?.name ?? '')
  const [relType, setRelType] = useState<RelationshipType>(initial?.relationshipType ?? 'venn')
  const [lifePhase, setLifePhase] = useState<LifePhase>(initial?.lifePhase ?? 'voksen')
  const [ownership, setOwnership] = useState<Ownership>(initial?.ownership ?? 'felles')
  const [birthDate, setBirthDate] = useState(
    initial?.birthDate ?? (initial?.birthYear
      ? `${initial.birthYear}-${String(initial.birthMonth ?? 1).padStart(2, '0')}-01`
      : '')
  )
  const [birthday, setBirthday] = useState(initial?.receivesBirthdayGift ?? true)
  const [christmas, setChristmas] = useState(initial?.receivesChristmasGift ?? false)
  const [birthdayAmt, setBirthdayAmt] = useState(
    initial?.occasionOverrides?.bursdag !== undefined ? String(initial.occasionOverrides.bursdag) : ''
  )
  const [christmasAmt, setChristmasAmt] = useState(
    initial?.occasionOverrides?.jul !== undefined ? String(initial.occasionOverrides.jul) : ''
  )
  const [notes, setNotes] = useState(initial?.notes ?? '')

  useEffect(() => {
    setName(initial?.name ?? '')
    setRelType(initial?.relationshipType ?? 'venn')
    setLifePhase(initial?.lifePhase ?? 'voksen')
    setOwnership(initial?.ownership ?? 'felles')
    setBirthDate(initial?.birthDate ?? (initial?.birthYear
      ? `${initial.birthYear}-${String(initial.birthMonth ?? 1).padStart(2, '0')}-01`
      : ''))
    setBirthday(initial?.receivesBirthdayGift ?? true)
    setChristmas(initial?.receivesChristmasGift ?? false)
    setBirthdayAmt(initial?.occasionOverrides?.bursdag !== undefined ? String(initial.occasionOverrides.bursdag) : '')
    setChristmasAmt(initial?.occasionOverrides?.jul !== undefined ? String(initial.occasionOverrides.jul) : '')
    setNotes(initial?.notes ?? '')
  }, [initial])

  useEffect(() => {
    const auto = lifePhaseFromBirthDate(birthDate)
    if (auto) setLifePhase(auto)
  }, [birthDate])

  function defaultAmtFor(occasion: 'bursdag' | 'jul'): number {
    return weightRules.occasionOverrides?.[relType]?.[occasion]
      ?? weightRules.relationshipBaseAmounts[relType]
      ?? 500
  }

  function handleSave() {
    if (!name.trim()) return
    const overrides: Partial<Record<import('@/types/gifts').Occasion, number>> = {}
    const bAmt = parseInt(birthdayAmt)
    if (!isNaN(bAmt) && birthdayAmt !== '') overrides.bursdag = bAmt
    const cAmt = parseInt(christmasAmt)
    if (!isNaN(cAmt) && christmasAmt !== '') overrides.jul = cAmt
    const r: GiftRecipient = {
      id: initial?.id ?? '',
      name: name.trim(),
      relationshipType: relType,
      lifePhase,
      ownership,
      birthDate: birthDate || undefined,
      birthYear: birthDate ? parseInt(birthDate.split('-')[0]) : undefined,
      birthMonth: birthDate ? parseInt(birthDate.split('-')[1]) : undefined,
      receivesBirthdayGift: birthday,
      receivesChristmasGift: christmas,
      occasionOverrides: Object.keys(overrides).length > 0 ? overrides : undefined,
      notes: notes.trim() || undefined,
    }
    onSave(r)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial?.id ? 'Rediger mottaker' : 'Ny mottaker'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Navn</Label>
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="f.eks. Mamma" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Relasjon</Label>
            <Select value={relType} onValueChange={(v) => setRelType(v as RelationshipType)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(RELATIONSHIP_LABELS) as RelationshipType[]).map((k) => (
                  <SelectItem key={k} value={k} className="text-xs">{RELATIONSHIP_LABELS[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Eierskap</Label>
            <Select value={ownership} onValueChange={(v) => setOwnership(v as Ownership)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(['A', 'B', 'felles'] as Ownership[]).map((k) => (
                  <SelectItem key={k} value={k} className="text-xs">{ownershipLabels[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Fødselsdato</Label>
            <Input
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          {/* Gave-toggles med beløpsoverride */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs cursor-pointer w-32">
                <Switch checked={birthday} onCheckedChange={setBirthday} />
                Bursdagsgave
              </label>
              {birthday && (
                <Input
                  type="number"
                  value={birthdayAmt}
                  onChange={(e) => setBirthdayAmt(e.target.value)}
                  placeholder={String(defaultAmtFor('bursdag'))}
                  className="h-7 text-xs w-24"
                />
              )}
              {birthday && (
                <span className="text-xs text-muted-foreground/60">
                  {birthdayAmt === '' ? `standard: ${fmtNOK(defaultAmtFor('bursdag'))}` : 'kr'}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs cursor-pointer w-32">
                <Switch checked={christmas} onCheckedChange={setChristmas} />
                Julegave
              </label>
              {christmas && (
                <Input
                  type="number"
                  value={christmasAmt}
                  onChange={(e) => setChristmasAmt(e.target.value)}
                  placeholder={String(defaultAmtFor('jul'))}
                  className="h-7 text-xs w-24"
                />
              )}
              {christmas && (
                <span className="text-xs text-muted-foreground/60">
                  {christmasAmt === '' ? `standard: ${fmtNOK(defaultAmtFor('jul'))}` : 'kr'}
                </span>
              )}
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Notater</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Valgfritt" className="h-8 text-xs" />
          </div>
        </div>
        <div className="flex gap-2 justify-end mt-4">
          <Button variant="outline" size="sm" onClick={onClose}>Avbryt</Button>
          <Button size="sm" disabled={!name.trim()} onClick={handleSave}>Lagre</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Hendelser ──────────────────────────────────────────────────


function EventModal({
  open, initial, defaultRecipientId, defaultOccasion, recipients, settings, weightRules, onSave, onClose,
}: {
  open: boolean
  initial?: GiftEvent
  defaultRecipientId?: string
  defaultOccasion?: Occasion
  recipients: GiftRecipient[]
  settings: ReturnType<typeof useGiftStore.getState>['settings']
  weightRules: ReturnType<typeof useGiftStore.getState>['weightRules']
  onSave: (ev: GiftEvent) => void
  onClose: () => void
}) {
  const ownershipLabels = ownershipLabelsFor(settings)
  const [recipientId, setRecipientId] = useState(initial?.recipientId ?? (recipients[0]?.id ?? ''))
  const [occasion, setOccasion] = useState<Occasion>(initial?.occasion ?? 'bursdag')
  const [date, setDate] = useState(initial?.date ?? '')
  const [month, setMonth] = useState(initial?.month ? String(initial.month) : '')
  const [ownership, setOwnership] = useState<Ownership>(initial?.ownership ?? 'felles')
  const [manualAmount, setManualAmount] = useState(initial?.manualAmount != null ? String(initial.manualAmount) : '')
  const [isLocked, setIsLocked] = useState(initial?.isLocked ?? false)
  const [status, setStatus] = useState<EventStatus>(initial?.status ?? 'planlagt')
  const [actualAmount, setActualAmount] = useState(initial?.actualAmount != null ? String(initial.actualAmount) : '')
  const [notes, setNotes] = useState(initial?.notes ?? '')

  useEffect(() => {
    setRecipientId(initial?.recipientId ?? defaultRecipientId ?? (recipients[0]?.id ?? ''))
    setOccasion(initial?.occasion ?? defaultOccasion ?? 'bursdag')
    setDate(initial?.date ?? '')
    setMonth(initial?.month ? String(initial.month) : '')
    setOwnership(initial?.ownership ?? 'felles')
    setManualAmount(initial?.manualAmount != null ? String(initial.manualAmount) : '')
    setIsLocked(initial?.isLocked ?? false)
    setStatus(initial?.status ?? 'planlagt')
    setActualAmount(initial?.actualAmount != null ? String(initial.actualAmount) : '')
    setNotes(initial?.notes ?? '')
  }, [initial, defaultRecipientId, defaultOccasion, recipients])

  const recipient = recipients.find((r) => r.id === recipientId)

  const suggestedAmount = useMemo(() => {
    if (!recipient) return 0
    const tempEvent: GiftEvent = {
      id: '', recipientId, occasion,
      ownership, calculatedAmount: 0, isLocked: false, status: 'planlagt',
      date: date || undefined, month: month ? parseInt(month) : undefined,
    }
    const raw = calculateGiftAmount(tempEvent, recipient, weightRules)
    return roundGiftAmount(raw, settings.roundingNearest)
  }, [recipient, occasion, ownership, date, month, weightRules, settings.roundingNearest, recipientId])

  function handleSave() {
    if (!recipientId) return
    const ev: GiftEvent = {
      id: initial?.id ?? '',
      recipientId,
      occasion,
      date: date || undefined,
      month: month ? parseInt(month) : undefined,
      ownership,
      calculatedAmount: suggestedAmount,
      manualAmount: manualAmount ? parseFloat(manualAmount) : undefined,
      isLocked,
      status,
      actualAmount: actualAmount ? parseFloat(actualAmount) : undefined,
      notes: notes.trim() || undefined,
    }
    onSave(ev)
  }

  const finalAmount = manualAmount ? parseFloat(manualAmount) || 0 : suggestedAmount

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial?.id ? 'Rediger hendelse' : 'Ny gavehendelse'}</DialogTitle>
        </DialogHeader>
        {recipients.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Legg til en mottaker under «Mottakere» før du oppretter en gavehendelse.
          </p>
        ) : null}
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Mottaker</Label>
            <Select value={recipientId} onValueChange={(v) => {
              setRecipientId(v)
              const r = recipients.find((x) => x.id === v)
              if (r) setOwnership(r.ownership)
            }}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {recipients.map((r) => (
                  <SelectItem key={r.id} value={r.id} className="text-xs">{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Anledning</Label>
              <Select value={occasion} onValueChange={(v) => setOccasion(v as Occasion)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(OCCASION_LABELS) as Occasion[]).map((k) => (
                    <SelectItem key={k} value={k} className="text-xs">{OCCASION_LABELS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Eierskap</Label>
              <Select value={ownership} onValueChange={(v) => setOwnership(v as Ownership)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(['A', 'B', 'felles'] as Ownership[]).map((k) => (
                    <SelectItem key={k} value={k} className="text-xs">{ownershipLabels[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Dato</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 text-xs" />
              {!date && !month && (
                <p className="text-xs text-muted-foreground">Uten dato vises ikke gaven i månedsoversikten.</p>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Eller måned</Label>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Velg" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="" className="text-xs">— Ingen —</SelectItem>
                  {Array.from({ length: 12 }, (_, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)} className="text-xs">{fmtMonth(i + 1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Beregnet beløp */}
          <div className="rounded bg-muted/20 px-3 py-2 text-xs">
            <p className="text-muted-foreground">Foreslått beløp: <span className="font-mono text-foreground font-semibold">{fmtNOK(suggestedAmount)}</span></p>
            {recipient && (
              <p className="text-muted-foreground mt-0.5 text-xs">
                {giftAmountExplanation(
                  { id: '', recipientId, occasion, ownership, calculatedAmount: 0, isLocked: false, status: 'planlagt' },
                  recipient, weightRules
                )}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Manuelt beløp (overstyrer forslag)</Label>
            <Input
              type="number"
              value={manualAmount}
              onChange={(e) => setManualAmount(e.target.value)}
              placeholder={String(suggestedAmount)}
              className="h-8 text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as EventStatus)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(['planlagt', 'kjøpt', 'droppet'] as EventStatus[]).map((k) => (
                    <SelectItem key={k} value={k} className="text-xs">{STATUS_LABELS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {status === 'kjøpt' && (
              <div className="space-y-1">
                <Label className="text-xs">Faktisk beløp</Label>
                <Input
                  type="number"
                  value={actualAmount}
                  onChange={(e) => setActualAmount(e.target.value)}
                  placeholder={String(finalAmount)}
                  className="h-8 text-xs"
                />
              </div>
            )}
          </div>

          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <Switch checked={isLocked} onCheckedChange={setIsLocked} />
            Lås beløp (ekskluder fra tak-normalisering)
          </label>

          <div className="space-y-1">
            <Label className="text-xs">Notater</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Valgfritt" className="h-8 text-xs" />
          </div>
        </div>
        <div className="flex gap-2 justify-end mt-4">
          <Button variant="outline" size="sm" onClick={onClose}>Avbryt</Button>
          <Button size="sm" disabled={!recipientId} onClick={handleSave}>Lagre</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Fordeling ──────────────────────────────────────────────────

function DistributionTab() {
  const settings = useGiftStore((s) => s.settings)
  const updateSettings = useGiftStore((s) => s.updateSettings)

  const [nameA, setNameA] = useState(settings.memberA.name)
  const [incomeA, setIncomeA] = useState(settings.memberA.monthlyNetIncome > 0 ? String(settings.memberA.monthlyNetIncome) : '')
  const [nameB, setNameB] = useState(settings.memberB.name)
  const [incomeB, setIncomeB] = useState(settings.memberB.monthlyNetIncome > 0 ? String(settings.memberB.monthlyNetIncome) : '')

  function saveMembers() {
    updateSettings({
      memberA: { name: nameA.trim() || 'Person A', monthlyNetIncome: parseFloat(incomeA) || 0 },
      memberB: { name: nameB.trim() || 'Person B', monthlyNetIncome: parseFloat(incomeB) || 0 },
    })
  }

  const totalIncome = (parseFloat(incomeA) || 0) + (parseFloat(incomeB) || 0)
  const pA = totalIncome > 0 ? ((parseFloat(incomeA) || 0) / totalIncome * 100).toFixed(0) : 50
  const pB = totalIncome > 0 ? ((parseFloat(incomeB) || 0) / totalIncome * 100).toFixed(0) : 50

  return (
    <div className="p-4 space-y-5">
      {/* Hvem er dere? */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-muted-foreground">Hvem er dere?</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <div className="space-y-1">
              <Label className="text-xs">Ditt navn</Label>
              <Input value={nameA} onChange={(e) => setNameA(e.target.value)} onBlur={saveMembers} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Netto lønn per måned</Label>
              <Input
                type="number"
                value={incomeA}
                onChange={(e) => setIncomeA(e.target.value)}
                onBlur={saveMembers}
                placeholder="f.eks. 38 000"
                className="h-8 text-xs"
              />
            </div>
          </div>
          <div className="space-y-2">
            <div className="space-y-1">
              <Label className="text-xs">Partners navn</Label>
              <Input value={nameB} onChange={(e) => setNameB(e.target.value)} onBlur={saveMembers} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Netto lønn per måned</Label>
              <Input
                type="number"
                value={incomeB}
                onChange={(e) => setIncomeB(e.target.value)}
                onBlur={saveMembers}
                placeholder="f.eks. 30 000"
                className="h-8 text-xs"
              />
            </div>
          </div>
        </div>
        {totalIncome > 0 && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Inntektsfordeling</p>
            <div className="flex items-center gap-3">
              <span className="text-xs text-blue-400 w-8 text-right tabular-nums">{pA}%</span>
              <div className="w-40 h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pA}%` }} />
              </div>
              <span className="text-xs text-violet-400 w-8 tabular-nums">{pB}%</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-8 text-right truncate" title={nameA || 'A'}>{nameA || 'A'}</span>
              <div className="w-40" />
              <span className="text-xs text-muted-foreground w-8 truncate" title={nameB || 'B'}>{nameB || 'B'}</span>
            </div>
          </div>
        )}
      </div>

      {/* Hvordan deles utgiftene? */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground">Hvordan deles gaveutgiftene?</p>
        <div className="space-y-2">
          {(Object.keys(DISTRIBUTION_LABELS) as import('@/types/gifts').DistributionModel[]).map((model) => (
            <button
              key={model}
              onClick={() => updateSettings({ distributionModel: model })}
              className={cn(
                'w-full text-left rounded border px-3 py-2.5 text-xs transition-colors',
                settings.distributionModel === model
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border text-muted-foreground hover:text-foreground'
              )}
            >
              <p className="font-medium">{DISTRIBUTION_LABELS[model]}</p>
              <p className="text-xs mt-0.5 text-muted-foreground">
                {model === '50_50' && 'Dere deler likt på alle gaver, uansett hvem som kjenner mottakeren.'}
                {model === 'inntekt' && 'Den med høyest inntekt betaler mer. Rettferdig hvis dere tjener ulikt.'}
                {model === 'eierskap' && 'Du betaler egne familiegaver, partneren sine. Felles gaver deles etter inntekt.'}
                {model === 'hybrid' && 'Egne gaver: du betaler 80 %, partner 20 %. Felles gaver etter inntekt. Anbefalt.'}
                {model === 'familie_venn' && 'Familie deles alltid 50/50. Egne venner betaler du selv. Felles venner deles 50/50.'}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Budsjettgrenser */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-muted-foreground">Budsjettgrenser</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Buffer for uforutsette gaver</Label>
            <Input
              type="number"
              value={settings.bufferPercent}
              onChange={(e) => updateSettings({ bufferPercent: parseFloat(e.target.value) || 0 })}
              className="h-8 text-xs"
            />
            <p className="text-xs text-muted-foreground">Anbefalt: 12 %</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Maks å bruke på gaver i år</Label>
            <Input
              type="number"
              value={settings.annualCap ?? ''}
              onChange={(e) => updateSettings({ annualCap: e.target.value ? parseFloat(e.target.value) : undefined })}
              placeholder="Ingen grense"
              className="h-8 text-xs"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Avrund beløp til nærmeste</Label>
            <Select
              value={String(settings.roundingNearest)}
              onValueChange={(v) => updateSettings({ roundingNearest: parseInt(v) as 1 | 50 | 100 })}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1" className="text-xs">Ingen avrunding</SelectItem>
                <SelectItem value="50" className="text-xs">50 kr</SelectItem>
                <SelectItem value="100" className="text-xs">100 kr</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Fordeling ved egne gaver</Label>
            <Select
              value={String(settings.primaryResponsibilityShare)}
              onValueChange={(v) => {
                const h = parseFloat(v)
                updateSettings({ primaryResponsibilityShare: h, supportShare: 1 - h })
              }}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="0.6" className="text-xs">60/40</SelectItem>
                <SelectItem value="0.7" className="text-xs">70/30</SelectItem>
                <SelectItem value="0.8" className="text-xs">80/20 (anbefalt)</SelectItem>
                <SelectItem value="0.9" className="text-xs">90/10</SelectItem>
                <SelectItem value="1.0" className="text-xs">100/0</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="rounded bg-muted/20 px-3 py-2 text-xs text-muted-foreground space-y-0.5">
        <p>Felles gaver deles etter inntekt. Egne familiegaver deles {Math.round(settings.primaryResponsibilityShare * 100)}/{Math.round(settings.supportShare * 100)}.</p>
        <p>Du kan alltid justere beløpet manuelt på hver enkelt gave.</p>
      </div>
    </div>
  )
}

// ─── Spareplan ──────────────────────────────────────────────────

function SavingsPlanTab() {
  const events = useGiftStore((s) => s.events)
  const settings = useGiftStore((s) => s.settings)
  const recipients = useGiftStore((s) => s.recipients)
  const weightRules = useGiftStore((s) => s.weightRules)
  const updateSettings = useGiftStore((s) => s.updateSettings)

  const excludeXmas = settings.excludeChristmasFromSavings ?? false

  const allEffectiveEvents = useMemo(
    () => [...events, ...deriveAutoEvents(recipients, events, weightRules, settings)],
    [events, recipients, weightRules, settings]
  )

  const effectiveEvents = useMemo(
    () => excludeXmas ? allEffectiveEvents.filter((e) => e.occasion !== 'jul') : allEffectiveEvents,
    [allEffectiveEvents, excludeXmas]
  )

  const xmasEvents = useMemo(
    () => allEffectiveEvents.filter((e) => e.occasion === 'jul' && e.status !== 'droppet'),
    [allEffectiveEvents]
  )

  const xmasTotal = useMemo(
    () => xmasEvents.reduce((s, e) => s + (e.manualAmount ?? e.calculatedAmount), 0),
    [xmasEvents]
  )

  const result = useMemo(() => calculateGiftResult(effectiveEvents, settings, recipients), [effectiveEvents, settings, recipients])
  const [showAll, setShowAll] = useState(false)

  const nameA = settings.memberA.name
  const nameB = settings.memberB.name

  const months = showAll ? result.monthlyBreakdown : result.monthlyBreakdown.filter((m) => m.totalCost > 0)

  return (
    <div className="p-4 space-y-4">
      {/* Jul-toggle */}
      <div className="flex items-center justify-between rounded border border-border/40 bg-muted/10 px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-xs font-medium">Ekskluder julegaver fra spareplan</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {excludeXmas && xmasTotal > 0
              ? `Julegaver holdes utenfor — ${fmtNOK(xmasTotal)}/år betales separat`
              : 'Spar kun til bursdager og andre hendelser'}
          </p>
        </div>
        <Switch
          checked={excludeXmas}
          onCheckedChange={(v) => updateSettings({ excludeChristmasFromSavings: v })}
        />
      </div>

      {/* Spareoppsummering */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <MetricCard label="Totalt per mnd" value={fmtNOK(result.personAMonthlySaving + result.personBMonthlySaving)} />
        <MetricCard label={`${nameA} per mnd`} value={fmtNOK(result.personAMonthlySaving)} colorClass="text-blue-400" />
        <MetricCard label={`${nameB} per mnd`} value={fmtNOK(result.personBMonthlySaving)} colorClass="text-violet-400" />
        <MetricCard label="Årsbudsjett" value={fmtNOK(result.annualTotal)} />
        <MetricCard label="Med buffer" value={fmtNOK(result.annualTotalWithBuffer)} />
        <MetricCard label={`${nameA} år`} value={fmtNOK(result.personATotal)} colorClass="text-blue-400" />
      </div>

      {excludeXmas && xmasTotal > 0 && (
        <div className="rounded border border-border/30 bg-muted/5 px-3 py-2 text-xs text-muted-foreground">
          + Julegaver ikke inkludert: <span className="font-mono text-foreground">{fmtNOK(xmasTotal)}/år</span>
          <span className="ml-1">({fmtNOK(xmasTotal / 12)}/mnd · {xmasEvents.length} mottakere)</span>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Flat månedlig sparing anbefales som utgangspunkt. Månedlig beløp er jevnt fordelt over 12 måneder, inkludert {settings.bufferPercent} % buffer.
      </p>

      {/* Månedsoversikt */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Gavebelastning per måned</p>
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            {showAll ? <><ChevronUp className="h-3 w-3" />Skjul tomme</> : <><ChevronDown className="h-3 w-3" />Vis alle</>}
          </button>
        </div>
        <div className="space-y-1.5">
          {months.map((m) => (
            <div
              key={m.month}
              className={cn(
                'rounded border px-3 py-2 text-xs',
                m.isHeavy ? 'border-amber-500/30 bg-amber-500/5' : 'border-border/40 bg-muted/10'
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-medium w-20">{fmtMonth(m.month)}</span>
                  {m.isHeavy && <span className="text-amber-400 text-xs">Gaveintensiv</span>}
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-muted-foreground text-blue-400/70">{fmtNOK(m.personAShare)}</span>
                  <span className="text-muted-foreground text-violet-400/70">{fmtNOK(m.personBShare)}</span>
                  <span className="font-mono font-medium w-20 text-right">{fmtNOK(m.totalCost)}</span>
                </div>
              </div>
              {m.events.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {Object.entries(m.events.reduce<Record<string, number>>((acc, e) => {
                    acc[e.occasion] = (acc[e.occasion] ?? 0) + 1; return acc
                  }, {})).map(([occ, count]) => (
                    <span key={occ} className="text-xs text-muted-foreground border border-border/30 rounded px-1 py-0.5">
                      {count > 1 ? `${count} × ` : ''}{OCCASION_LABELS[occ as Occasion]}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
          {months.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-6">Ingen hendelser med dato</p>
          )}
        </div>
      </div>

      {/* Avvik */}
      {(() => {
        const avp = calculateActualVsPlanned(events)
        if (avp.planned === 0) return null
        return (
          <div className="rounded border border-border bg-muted/10 px-3 py-2.5 text-xs">
            <p className="font-semibold mb-1">Faktisk vs planlagt (kjøpte gaver)</p>
            <div className="flex gap-6">
              <div>
                <p className="text-muted-foreground">Planlagt</p>
                <p className="font-mono">{fmtNOK(avp.planned)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Faktisk</p>
                <p className="font-mono">{fmtNOK(avp.actual)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Avvik</p>
                <p className={cn('font-mono', avp.deviation > 0 ? 'text-red-400' : 'text-green-400')}>
                  {avp.deviation > 0 ? '+' : ''}{fmtNOK(avp.deviation)}
                </p>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

// ─── Satser ─────────────────────────────────────────────────────


function SliderRow({
  label, value, min, max, step, onChange, displayValue,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  displayValue: string
}) {
  return (
    <div className="space-y-1.5 py-0.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-foreground leading-tight">{label}</span>
        <span className="text-xs font-medium text-primary tabular-nums shrink-0">{displayValue}</span>
      </div>
      <RadixSlider.Root
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => onChange(v)}
        className="relative flex items-center select-none touch-none w-full h-5"
      >
        <RadixSlider.Track className="bg-border relative grow rounded-full h-1">
          <RadixSlider.Range className="absolute bg-primary rounded-full h-full" />
        </RadixSlider.Track>
        <RadixSlider.Thumb className="block w-3.5 h-3.5 bg-background border-2 border-primary rounded-full shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50" />
      </RadixSlider.Root>
    </div>
  )
}

function WeightSection({
  title, expanded, onToggle, children,
}: {
  title: string; expanded: boolean; onToggle: () => void; children: React.ReactNode
}) {
  return (
    <div className="rounded border border-border overflow-hidden">
      <button
        onClick={onToggle}
        className="flex items-center justify-between w-full px-3 py-2.5 text-xs font-medium hover:bg-muted/30 transition-colors"
      >
        {title}
        {expanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>
      {expanded && <div className="px-3 py-3 border-t border-border bg-muted/10">{children}</div>}
    </div>
  )
}

function RatesTab() {
  const weightRules = useGiftStore((s) => s.weightRules)
  const updateWeightRules = useGiftStore((s) => s.updateWeightRules)

  const [expanded, setExpanded] = useState<string | null>('relasjon')
  const [newOverride, setNewOverride] = useState<{ rel: RelationshipType; occasion: Occasion; amount: string } | null>(null)

  function toggleSection(s: string) {
    setExpanded(expanded === s ? null : s)
  }

  function saveOverride() {
    if (!newOverride) return
    const amount = parseInt(newOverride.amount)
    if (isNaN(amount) || amount < 0) return
    updateWeightRules({
      occasionOverrides: {
        ...weightRules.occasionOverrides,
        [newOverride.rel]: {
          ...(weightRules.occasionOverrides?.[newOverride.rel] ?? {}),
          [newOverride.occasion]: amount,
        },
      },
    })
    setNewOverride(null)
  }

  function removeOverride(rel: RelationshipType, occasion: Occasion) {
    const relOverrides = { ...(weightRules.occasionOverrides?.[rel] ?? {}) }
    delete relOverrides[occasion]
    const updated = { ...weightRules.occasionOverrides }
    if (Object.keys(relOverrides).length === 0) delete updated[rel]
    else updated[rel] = relOverrides
    updateWeightRules({ occasionOverrides: updated })
  }

  const SLIDER_GROUPS: { label: string; keys: RelationshipType[] }[] = [
    { label: 'Partner/samboer',           keys: ['partner'] },
    { label: 'Foreldre / svigerforeldre', keys: ['foreldre', 'svigerforeldre'] },
    { label: 'Søsken / svigersøsken',     keys: ['søsken', 'svigersøsken'] },
    { label: 'Besteforeldre',             keys: ['besteforeldre'] },
    { label: 'Barn / stebarn',            keys: ['barn', 'stebarn'] },
    { label: 'Tante/onkel',               keys: ['tante_onkel'] },
    { label: 'Niese/nevø',                keys: ['niese_nevø'] },
    { label: 'Fadderbarn',                keys: ['fadderbarn'] },
    { label: 'Nær venn',                  keys: ['nær_venn'] },
    { label: 'Venn',                      keys: ['venn'] },
    { label: 'Kollega',                   keys: ['kollega'] },
    { label: 'Nabo',                      keys: ['nabo'] },
    { label: 'Vertskap',                  keys: ['vertskap'] },
    { label: 'Annet',                     keys: ['annet'] },
  ]

  return (
    <div className="p-4 space-y-2">
      <WeightSection
        title="Hva bruker du typisk på..."
        expanded={expanded === 'relasjon'}
        onToggle={() => toggleSection('relasjon')}
      >
        <div className="space-y-4">
          {SLIDER_GROUPS.map(({ label, keys }) => {
            const primaryKey = keys[0]
            const value = weightRules.relationshipBaseAmounts[primaryKey]
            const julAmount = weightRules.occasionOverrides?.[primaryKey]?.['jul']
            const rundDagAmount = weightRules.occasionOverrides?.[primaryKey]?.['rund_dag']
            // Other overrides (not jul/rund_dag)
            const otherOverrides = keys.flatMap((k) =>
              Object.entries(weightRules.occasionOverrides?.[k] ?? {})
                .filter(([occ]) => occ !== 'jul' && occ !== 'rund_dag')
                .map(([occ, amt]) => ({ rel: k, occasion: occ as Occasion, amount: amt as number }))
            )
            const isAdding = newOverride?.rel === primaryKey

            function saveQuickOverride(occasion: 'jul' | 'rund_dag', amount: number) {
              if (isNaN(amount) || amount < 0) return
              updateWeightRules({
                occasionOverrides: {
                  ...weightRules.occasionOverrides,
                  [primaryKey]: { ...(weightRules.occasionOverrides?.[primaryKey] ?? {}), [occasion]: amount },
                },
              })
            }

            return (
              <div key={primaryKey} className="space-y-2 pb-1 border-b border-border/20 last:border-0">
                <SliderRow
                  label={label}
                  value={value}
                  min={0}
                  max={5000}
                  step={50}
                  onChange={(v) => {
                    const updates = Object.fromEntries(keys.map((k) => [k, v])) as Record<RelationshipType, number>
                    updateWeightRules({ relationshipBaseAmounts: { ...weightRules.relationshipBaseAmounts, ...updates } })
                  }}
                  displayValue={fmtNOK(value)}
                />
                {/* Jul + Rund dag quick toggles */}
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 pl-0.5">
                  {/* Jul */}
                  <div className="flex items-center gap-2">
                    <Switch
                      id={`jul-${primaryKey}`}
                      checked={julAmount !== undefined}
                      onCheckedChange={(checked) => {
                        if (checked) saveQuickOverride('jul', value + 200)
                        else removeOverride(primaryKey, 'jul')
                      }}
                      className="scale-75 origin-left"
                    />
                    <label htmlFor={`jul-${primaryKey}`} className="text-xs text-muted-foreground cursor-pointer select-none">Jul</label>
                    {julAmount !== undefined && (
                      <Input
                        type="number"
                        value={julAmount}
                        onChange={(e) => saveQuickOverride('jul', parseInt(e.target.value) || 0)}
                        className="h-6 text-xs w-20 px-2"
                      />
                    )}
                  </div>
                  {/* Rund dag */}
                  <div className="flex items-center gap-2">
                    <Switch
                      id={`rund-${primaryKey}`}
                      checked={rundDagAmount !== undefined}
                      onCheckedChange={(checked) => {
                        if (checked) saveQuickOverride('rund_dag', value * 2)
                        else removeOverride(primaryKey, 'rund_dag')
                      }}
                      className="scale-75 origin-left"
                    />
                    <label htmlFor={`rund-${primaryKey}`} className="text-xs text-muted-foreground cursor-pointer select-none">Rund dag</label>
                    {rundDagAmount !== undefined && (
                      <Input
                        type="number"
                        value={rundDagAmount}
                        onChange={(e) => saveQuickOverride('rund_dag', parseInt(e.target.value) || 0)}
                        className="h-6 text-xs w-20 px-2"
                      />
                    )}
                  </div>
                </div>
                {/* Other overrides + add button */}
                {(otherOverrides.length > 0 || isAdding) && (
                  <div className="flex flex-wrap items-center gap-1.5 pl-0.5">
                    {otherOverrides.map(({ rel, occasion, amount }) => (
                      <span key={rel + occasion}
                        className="inline-flex items-center gap-1 text-xs border border-border/40 rounded-full px-2 py-0.5 bg-muted/20"
                      >
                        {OCCASION_LABELS[occasion]} {fmtNOK(amount)}
                        <button className="ml-0.5 opacity-50 hover:opacity-100 hover:text-red-400" onClick={() => removeOverride(rel, occasion)}>×</button>
                      </span>
                    ))}
                    {isAdding && (
                      <div className="flex items-center gap-1.5 w-full mt-0.5">
                        <Select value={newOverride!.occasion} onValueChange={(v) => setNewOverride({ ...newOverride!, occasion: v as Occasion })}>
                          <SelectTrigger className="h-7 text-xs flex-1"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {(Object.keys(OCCASION_LABELS) as Occasion[]).filter((k) => k !== 'jul' && k !== 'rund_dag').map((k) => (
                              <SelectItem key={k} value={k} className="text-xs">{OCCASION_LABELS[k]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input type="number" placeholder="kr" value={newOverride!.amount} onChange={(e) => setNewOverride({ ...newOverride!, amount: e.target.value })} className="h-7 text-xs w-20" />
                        <Button size="sm" className="h-7 text-xs px-2.5" onClick={saveOverride}>Lagre</Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => setNewOverride(null)}>✕</Button>
                      </div>
                    )}
                  </div>
                )}
                {!isAdding && (
                  <button
                    className="text-xs text-muted-foreground/50 hover:text-muted-foreground pl-0.5"
                    onClick={() => setNewOverride({ rel: primaryKey, occasion: 'jubileum', amount: '' })}
                  >
                    + annen anledning
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </WeightSection>

      <Button
        variant="outline"
        size="sm"
        className="w-full text-xs mt-2"
        onClick={() => updateWeightRules(DEFAULT_WEIGHT_RULES)}
      >
        Tilbakestill til standardverdier
      </Button>
    </div>
  )
}

// ─── Hovede-komponent ────────────────────────────────────────────

export function GiftPage() {
  const [activeTab, setActiveTab] = useState<GiftTab>('oversikt')
  const [migrating, setMigrating] = useState(false)
  const recipients = useGiftStore((s) => s.recipients)
  const events = useGiftStore((s) => s.events)
  const isShared = useSharedGaverStore((s) => s.partnershipId !== null)
  const migrated = useSharedGaverStore((s) => s.migrated)
  const sharedIsEmpty = useSharedGaverStore((s) => (s.data === null || giftSliceIsEmpty(s.data)) && !s.loading)
  const needsMigration = isShared && (recipients.length > 0 || events.length > 0) && sharedIsEmpty && !migrated

  async function handleMigrate() {
    setMigrating(true)
    try {
      await useSharedGaverStore.getState().migrateFrom(giftSharedSlice(), giftSliceIsEmpty)
    } finally {
      setMigrating(false)
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Intern sub-nav */}
      <nav className="flex items-center gap-0.5 border-b border-border bg-card/50 px-3 shrink-0 overflow-x-auto">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap shrink-0',
              activeTab === id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </nav>

      {/* Del med partner */}
      {needsMigration && (
        <div className="mx-4 mt-4 rounded-lg border border-violet-500/40 bg-violet-500/10 px-4 py-3 flex items-center justify-between gap-3 shrink-0">
          <div>
            <p className="text-sm font-medium text-violet-300 flex items-center gap-1.5">
              <Share2 className="h-4 w-4" />
              Del gaveplanleggeren med partner
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {recipients.length} mottakere og {events.length} hendelser er klare til å flyttes til den felles planleggeren.
            </p>
          </div>
          <button
            onClick={handleMigrate}
            disabled={migrating}
            className="text-xs px-3 py-1.5 rounded bg-violet-600 hover:bg-violet-500 text-white font-medium transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {migrating ? 'Flytter…' : 'Flytt til felles'}
          </button>
        </div>
      )}

      {/* Innhold */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'oversikt' && <OverviewTab setTab={setActiveTab} />}
        {activeTab === 'mottakere' && <RecipientsTab />}
        {activeTab === 'fordeling' && <DistributionTab />}
        {activeTab === 'spareplan' && <SavingsPlanTab />}
        {activeTab === 'satser' && <RatesTab />}
      </div>
    </div>
  )
}
