import type {
  GiftEvent, GiftRecipient, GiftSettings, WeightRules,
  EventShare, MonthlyBreakdown, GiftCalculationResult,
} from '@/types/gifts'

// ── Hjelpere ──────────────────────────────────────────────────

export function getEventMonth(event: GiftEvent): number | null {
  if (event.date) {
    const m = parseInt(event.date.split('-')[1], 10)
    if (!isNaN(m) && m >= 1 && m <= 12) return m
  }
  if (event.month && event.month >= 1 && event.month <= 12) return event.month
  return null
}

export function roundGiftAmount(amount: number, nearest: 1 | 50 | 100): number {
  return Math.round(amount / nearest) * nearest
}

// ── Kjernekalkulator ───────────────────────────────────────────

/**
 * Beregner gavebeløp:
 * 1. Sjekk occasionOverrides[relasjon][anledning] — spesifikt beløp
 * 2. Fall tilbake på relationshipBaseAmounts[relasjon] — flat takst
 */
export function calculateGiftAmount(
  event: GiftEvent,
  recipient: GiftRecipient,
  rules: WeightRules,
): number {
  // 1. Per-person override (høyeste prioritet)
  if (recipient.occasionOverrides?.[event.occasion] !== undefined) {
    return recipient.occasionOverrides[event.occasion]!
  }
  // 2. Relasjon × anledning override
  const relOverrides = rules.occasionOverrides?.[recipient.relationshipType]
  if (relOverrides) {
    const override = relOverrides[event.occasion]
    if (override !== undefined) return override
  }
  // 3. Flat grunnbeløp for relasjon
  return rules.relationshipBaseAmounts[recipient.relationshipType] ?? 500
}

/** Returnerer en forklarende tekst for beregnet beløp */
export function giftAmountExplanation(
  event: GiftEvent,
  recipient: GiftRecipient,
  rules: WeightRules,
): string {
  const relOverrides = rules.occasionOverrides?.[recipient.relationshipType]
  if (relOverrides?.[event.occasion] !== undefined) {
    return `Spesialbeløp for denne anledningen`
  }
  const base = rules.relationshipBaseAmounts[recipient.relationshipType] ?? 500
  return `Grunnbeløp for relasjonstype: ${base.toLocaleString('no-NO')} kr`
}

// ── Inntektsandeler ────────────────────────────────────────────

export interface IncomeShares {
  pA: number  // andel 0–1
  pB: number
  totalIncome: number
  fallback50_50: boolean
}

export function calculateIncomeShares(settings: GiftSettings): IncomeShares {
  const nA = settings.memberA.monthlyNetIncome
  const nB = settings.memberB.monthlyNetIncome
  const total = nA + nB
  if (total === 0) {
    return { pA: 0.5, pB: 0.5, totalIncome: 0, fallback50_50: true }
  }
  return { pA: nA / total, pB: nB / total, totalIncome: total, fallback50_50: false }
}

// ── Familie vs venn ───────────────────────────────────────────

// Alle relasjoner som regnes som "familie" i familie_venn-modellen.
// Svigerforeldre/svigersøsken behandles likt som egne — symmetrisk for et par.
const FAMILY_RELATIONSHIPS = new Set<import('@/types/gifts').RelationshipType>([
  'partner', 'foreldre', 'svigerforeldre', 'søsken', 'svigersøsken',
  'besteforeldre', 'barn', 'stebarn', 'tante_onkel', 'niese_nevø', 'fadderbarn',
])

// ── Fordeling per hendelse ─────────────────────────────────────

/**
 * Beregner Person A og Person B sin andel av en gavehendelse.
 * recipient brukes kun for familie_venn-modellen.
 */
export function calculateEventShare(
  event: GiftEvent,
  amount: number,
  settings: GiftSettings,
  incomeShares: IncomeShares,
  recipient?: GiftRecipient,
): EventShare {
  const model = settings.distributionModel
  const { pA, pB } = incomeShares
  const h = settings.primaryResponsibilityShare   // 0.80
  const s = settings.supportShare                  // 0.20

  if (model === '50_50') {
    return { personA: amount * 0.5, personB: amount * 0.5 }
  }

  if (model === 'inntekt') {
    return { personA: amount * pA, personB: amount * pB }
  }

  if (model === 'eierskap') {
    if (event.ownership === 'A') return { personA: amount, personB: 0 }
    if (event.ownership === 'B') return { personA: 0, personB: amount }
    // Felles: etter inntekt
    return { personA: amount * pA, personB: amount * pB }
  }

  if (model === 'familie_venn') {
    const isFamily = recipient ? FAMILY_RELATIONSHIPS.has(recipient.relationshipType) : false
    if (isFamily) {
      // Familie → alltid 50/50, uavhengig av eierskap
      return { personA: amount * 0.5, personB: amount * 0.5 }
    }
    if (event.ownership === 'felles') {
      // Felles venner → 50/50
      return { personA: amount * 0.5, personB: amount * 0.5 }
    }
    // Egne venner → betaler selv
    if (event.ownership === 'A') return { personA: amount, personB: 0 }
    if (event.ownership === 'B') return { personA: 0, personB: amount }
    // Fallback
    return { personA: amount * 0.5, personB: amount * 0.5 }
  }

  // Hybrid (standard)
  if (event.ownership === 'A') {
    return { personA: amount * h, personB: amount * s }
  }
  if (event.ownership === 'B') {
    return { personA: amount * s, personB: amount * h }
  }
  // Felles: etter inntekt
  return { personA: amount * pA, personB: amount * pB }
}

// ── Normalisering mot tak ──────────────────────────────────────

/**
 * Tar inn beregnede gavebeløp og normaliserer mot annualCap.
 * Låste hendelser holdes utenfor nedskalering.
 */
export function calculateNormalizedAmounts(
  events: GiftEvent[],
  recipients: GiftRecipient[],
  settings: GiftSettings,
  weights: WeightRules,
): GiftEvent[] {
  // Beregn råbeløp for alle hendelser
  const recipientMap = new Map(recipients.map((r) => [r.id, r]))

  const eventsWithAmounts = events.map((event) => {
    if (event.manualAmount !== undefined) {
      return { ...event, calculatedAmount: event.manualAmount }
    }
    const recipient = recipientMap.get(event.recipientId)
    if (!recipient) return { ...event, calculatedAmount: 0 }
    const raw = calculateGiftAmount(event, recipient, weights)
    const rounded = roundGiftAmount(raw, settings.roundingNearest)
    return { ...event, calculatedAmount: rounded }
  })

  if (!settings.annualCap) return eventsWithAmounts

  const cap = settings.annualCap
  const lockedTotal = eventsWithAmounts
    .filter((e) => e.isLocked)
    .reduce((s, e) => s + e.calculatedAmount, 0)

  if (lockedTotal >= cap) {
    // Låste hendelser overskrider allerede taket — returner som-er med advarsel
    return eventsWithAmounts
  }

  const remainingCap = cap - lockedTotal
  const unlocked = eventsWithAmounts.filter((e) => !e.isLocked)
  const unlockedTotal = unlocked.reduce((s, e) => s + e.calculatedAmount, 0)

  if (unlockedTotal <= remainingCap) return eventsWithAmounts

  const scaleFactor = remainingCap / unlockedTotal

  return eventsWithAmounts.map((event) => {
    if (event.isLocked || event.manualAmount !== undefined) return event
    return {
      ...event,
      calculatedAmount: roundGiftAmount(event.calculatedAmount * scaleFactor, settings.roundingNearest),
    }
  })
}

// ── Månedlig fordeling ─────────────────────────────────────────

export function calculateMonthlyBreakdown(
  events: GiftEvent[],
  settings: GiftSettings,
  recipients: GiftRecipient[] = [],
): MonthlyBreakdown[] {
  const incomeShares = calculateIncomeShares(settings)
  const recipientMap = new Map(recipients.map((r) => [r.id, r]))
  const activeEvents = events.filter((e) => e.status !== 'droppet')

  const totalAnnual = activeEvents.reduce((s, e) => {
    const amt = e.manualAmount ?? e.calculatedAmount
    return s + amt
  }, 0)
  const avg = totalAnnual / 12

  const months: MonthlyBreakdown[] = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    totalCost: 0,
    personAShare: 0,
    personBShare: 0,
    events: [],
    isHeavy: false,
  }))

  for (const event of activeEvents) {
    const m = getEventMonth(event)
    if (m === null) continue
    const idx = m - 1
    const amount = event.manualAmount ?? event.calculatedAmount
    const share = calculateEventShare(event, amount, settings, incomeShares, recipientMap.get(event.recipientId))
    months[idx].totalCost += amount
    months[idx].personAShare += share.personA
    months[idx].personBShare += share.personB
    months[idx].events.push(event)
  }

  // Marker tunge måneder (mer enn 1.5x gjennomsnittet)
  const threshold = avg * 1.5
  for (const m of months) {
    m.isHeavy = m.totalCost > threshold && m.totalCost > 0
  }

  return months
}

// ── Hovedberegning ─────────────────────────────────────────────

export function calculateGiftResult(
  events: GiftEvent[],
  settings: GiftSettings,
  recipients: GiftRecipient[] = [],
): GiftCalculationResult {
  const incomeShares = calculateIncomeShares(settings)
  const recipientMap = new Map(recipients.map((r) => [r.id, r]))
  const activeEvents = events.filter((e) => e.status !== 'droppet')

  let personATotal = 0
  let personBTotal = 0

  for (const event of activeEvents) {
    const amount = event.manualAmount ?? event.calculatedAmount
    const share = calculateEventShare(event, amount, settings, incomeShares, recipientMap.get(event.recipientId))
    personATotal += share.personA
    personBTotal += share.personB
  }

  const annualTotal = personATotal + personBTotal
  const bufferFactor = 1 + settings.bufferPercent / 100
  const annualTotalWithBuffer = annualTotal * bufferFactor
  const personATotalWithBuffer = personATotal * bufferFactor
  const personBTotalWithBuffer = personBTotal * bufferFactor

  const monthlyBreakdown = calculateMonthlyBreakdown(events, settings, recipients)

  const warnings: string[] = []
  const insights: string[] = []

  // Cap-advarsel
  if (settings.annualCap && annualTotal > settings.annualCap) {
    warnings.push(
      `Planlagt gavebudsjett (${Math.round(annualTotal).toLocaleString('no-NO')} kr) overstiger maksrammen på ${Math.round(settings.annualCap).toLocaleString('no-NO')} kr.`
    )
  }

  // Fallback-advarsel
  if (incomeShares.fallback50_50) {
    insights.push('Nettoinntekt ikke lagt inn — benytter 50/50 fordeling.')
  }

  // Tunge måneder
  const heavyMonths = monthlyBreakdown.filter((m) => m.isHeavy)
  if (heavyMonths.length > 0) {
    const names = heavyMonths.map((m) => MONTH_NO[m.month - 1])
    insights.push(`${names.join(', ')} er gaveintensive måneder med over 1,5× gjennomsnittsbelastning.`)
  }

  // Neste 30 dager
  const today = new Date()
  const in30Days = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)
  const upcoming = activeEvents.filter((e) => {
    if (!e.date) return false
    const d = new Date(e.date)
    return d >= today && d <= in30Days
  })
  if (upcoming.length > 0) {
    const sum = upcoming.reduce((s, e) => s + (e.manualAmount ?? e.calculatedAmount), 0)
    insights.push(`Neste 30 dager: ${upcoming.length} planlagte gaver for totalt ${Math.round(sum).toLocaleString('no-NO')} kr.`)
  }

  // Familiebelastning
  const aEvents = activeEvents.filter((e) => e.ownership === 'A').length
  const bEvents = activeEvents.filter((e) => e.ownership === 'B').length
  if (aEvents > bEvents * 1.5 && bEvents > 0) {
    insights.push(`${settings.memberA.name} har vesentlig flere familiehendelser enn ${settings.memberB.name} (${aEvents} vs ${bEvents}).`)
  } else if (bEvents > aEvents * 1.5 && aEvents > 0) {
    insights.push(`${settings.memberB.name} har vesentlig flere familiehendelser enn ${settings.memberA.name} (${bEvents} vs ${aEvents}).`)
  }

  return {
    annualTotal,
    annualTotalWithBuffer,
    personATotal: personATotalWithBuffer,
    personBTotal: personBTotalWithBuffer,
    personAMonthlySaving: personATotalWithBuffer / 12,
    personBMonthlySaving: personBTotalWithBuffer / 12,
    monthlyBreakdown,
    warnings,
    insights,
  }
}

// ── Arkivering ──────────────────────────────────────────────────

/**
 * Avgjør om en hendelse er "arkivert" — dvs. hører til et tidligere år og
 * ikke lenger skal telle som den aktive hendelsen for mottaker+anledning.
 * Beregnet fra dato, ikke lagret som flagg — historikk forblir redigerbar.
 * Gjelder kun bursdag og jul; andre anledninger arkiveres ikke automatisk.
 */
export function isEventArchived(event: GiftEvent, today: Date = new Date()): boolean {
  if (event.occasion === 'jul') {
    const y = event.year ?? today.getFullYear()
    return today >= new Date(y + 1, 0, 1)
  }
  if (event.occasion === 'bursdag' && event.date) {
    const d = new Date(event.date)
    d.setMonth(d.getMonth() + 3)
    return today >= d
  }
  return false
}

/**
 * Utleder auto-genererte gavehendelser fra mottakerdata.
 * - receivesBirthdayGift + birthDate  → neste bursdag
 * - receivesChristmasGift             → jul (desember)
 * Returnerer kun hendelser som ikke allerede finnes i storedEvents (per recipientId + occasion).
 * Filtrerer ut arkiverte hendelser slik at gamle kjøpte gaver ikke blokkerer regenerering.
 */
export function deriveAutoEvents(
  recipients: GiftRecipient[],
  storedEvents: GiftEvent[],
  weightRules: WeightRules,
  settings: GiftSettings,
): GiftEvent[] {
  const today = new Date()
  const activeKeys = new Set(
    storedEvents
      .filter((e) => !isEventArchived(e, today))
      .map((e) => `${e.recipientId}-${e.occasion}`)
  )
  const auto: GiftEvent[] = []
  const currentYear = today.getFullYear()

  for (const r of recipients) {
    if (r.receivesBirthdayGift && r.birthDate && !activeKeys.has(`${r.id}-bursdag`)) {
      const [, mo, day] = r.birthDate.split('-').map(Number)
      const thisYearDate = new Date(currentYear, mo - 1, day)
      const bYear = thisYearDate < today ? currentYear + 1 : currentYear
      const date = `${bYear}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const event: GiftEvent = {
        id: `auto-bursdag-${r.id}`,
        recipientId: r.id,
        occasion: 'bursdag',
        date,
        ownership: r.ownership,
        calculatedAmount: 0,
        isLocked: false,
        status: 'planlagt',
      }
      const raw = calculateGiftAmount(event, r, weightRules)
      auto.push({ ...event, calculatedAmount: roundGiftAmount(raw, settings.roundingNearest) })
    }

    if (r.receivesChristmasGift && !activeKeys.has(`${r.id}-jul`)) {
      const event: GiftEvent = {
        id: `auto-jul-${r.id}`,
        recipientId: r.id,
        occasion: 'jul',
        month: 12,
        year: currentYear,
        ownership: r.ownership,
        calculatedAmount: 0,
        isLocked: false,
        status: 'planlagt',
      }
      const raw = calculateGiftAmount(event, r, weightRules)
      auto.push({ ...event, calculatedAmount: roundGiftAmount(raw, settings.roundingNearest) })
    }
  }
  return auto
}

/** Beregner faktisk vs planlagt avvik */
export function calculateActualVsPlanned(events: GiftEvent[]): {
  planned: number
  actual: number
  deviation: number
} {
  const purchased = events.filter((e) => e.status === 'kjøpt')
  const planned = purchased.reduce((s, e) => s + (e.manualAmount ?? e.calculatedAmount), 0)
  const actual = purchased.reduce((s, e) => s + (e.actualAmount ?? 0), 0)
  return { planned, actual, deviation: actual - planned }
}

const MONTH_NO = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des']
export { MONTH_NO }
