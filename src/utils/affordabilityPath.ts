import type { AppConfig, HouseholdInput, PropertyInput } from '@/types'
import type { SavingsAccount, FondPortfolio, DebtAccount, PartnerVeikart } from '@/types/economy'
import { partnerNonBsuEquity, partnerMonthlySavingsTotal } from '@/types/economy'
import {
  projectSavingsGrowth,
  projectBalanceMonthly,
  computeEffectiveBalance,
} from '@/domain/economy/savingsCalculator'
import { buildRepaymentPlan } from '@/domain/economy/debtCalculator'
import { DEFAULT_FOND_RATE, BSU_MAX_YEARLY } from '@/config/economy.config'
import { calcAcquisitionFees, calcEffectiveEquity } from './property'
import { annuityPayment } from './loan'
import {
  calcStressTestRate,
  calcExistingDebtServicing,
  calcSharedDebtStress,
  calcOtherMonthlyExpenses,
} from './affordability'
import { calcSIFOExpenses } from './sifo'
import { calcHouseholdMonthlyNetIncome, calcTotalAnnualIncome } from './tax'
import { kausjonNeededForPrice } from './maxPurchase'

/**
 * «Vei til råd»: kobler boligkalkulatoren til Lommebokas faktiske kontoer og
 * spareplaner. Projiserer egenkapitalen måned for måned (samme kontomotor som
 * Sparing-fanen: projectSavingsGrowth med renter, BSU-tak og aldersgrense,
 * fond via porteføljens månedssparing, gjeld amortisert via buildRepaymentPlan)
 * og finner FØRSTE måned der alle tre forskriftskravene er oppfylt for
 * scenarioets bolig. Tallfester i tillegg hva som mangler i dag: EK-gap,
 * nødvendig kausjon og lønnsgap.
 *
 * Antakelser (vises i UI): flat inntekt, dagens sparetempo videreføres,
 * fondavkastning DEFAULT_FOND_RATE, partnerkontoer med egne renter.
 */

/** Projeksjonshorisont: 10 år */
export const PATH_HORIZON_MONTHS = 120

export interface AffordabilityPathInput {
  property: Pick<PropertyInput, 'price' | 'sharedDebt' | 'monthlyFee' | 'propertyTax' | 'ownershipType'>
  household: HouseholdInput
  interestRate: number
  loanTermYears: number
  extraMonthlyExpenses?: number
  financeAllFees?: boolean
  /** Egne kontoer fra Lommeboka (fond/krypto holdes utenfor — fond dekkes av porteføljen) */
  savingsAccounts: SavingsAccount[]
  fondPortfolio?: FondPortfolio | null
  /** Egne gjeldsposter fra Lommeboka — amortiseres ned over tid */
  debts: DebtAccount[]
  /** Partnerens veikart-data — tas med når scenarioet har medsøker */
  partner?: PartnerVeikart | null
  config: AppConfig
  /** Nå-tidspunkt (injiserbart for tester) */
  now?: Date
}

export interface ConstraintTimeline {
  /** Måneder til kravet er oppfylt (0 = oppfylt i dag), null = ikke innen horisonten */
  equityMonths: number | null
  debtRatioMonths: number | null
  affordabilityMonths: number | null
  allMonths: number | null
}

export interface AffordabilityGapsToday {
  /** Kroner som mangler i effektiv EK i dag (0 når kravet er oppfylt) */
  equityGap: number
  /** Kausjon som ville lukket EK-gapet i dag */
  kausjonNeeded: number
  /** Kan kausjon alene nå målprisen (gjeldsgrad/betjeningsevne setter taket)? */
  kausjonReachable: boolean
  kausjonCeiling: number
  /** Brutto årsinntekt som mangler for gjeldsgradskravet (0 når oppfylt) */
  incomeGapDebtRatio: number
  /** Brutto årsinntekt som mangler for betjeningsevnen (0 når oppfylt) */
  incomeGapAffordability: number
}

export interface AffordabilityPath {
  /** Har husstanden data nok til en tidslinje (minst én konto/fond med sparing)? */
  hasSavingsData: boolean
  /** Projisert samlet EK i dag fra Lommeboka-kontoene (inkl. partner når med) */
  equityNow: number
  /** Samlet sparetempo nå: kontoer + fond-månedssparing (+ partner) */
  monthlySavingsRate: number
  timeline: ConstraintTimeline
  gaps: AffordabilityGapsToday
  horizonMonths: number
}

// ── Hjelpere ────────────────────────────────────────────────

function monthsBetween(from: { y: number; m: number }, to: { y: number; m: number }): number {
  return (to.y - from.y) * 12 + (to.m - from.m)
}

function latestRate(account: SavingsAccount): number {
  const sorted = [...(account.rateHistory ?? [])].sort((a, b) => a.fromDate.localeCompare(b.fromDate))
  return sorted.at(-1)?.rate ?? 3.5
}

/**
 * EK-serie for én egen konto: verdier[t] = saldo t måneder frem fra nå.
 * Primært via projectSavingsGrowth (kanonisk motor med rentehistorikk/BSU) —
 * faller tilbake til enkel projeksjon hvis kontoens historikk ikke dekker nå.
 */
function accountSeries(account: SavingsAccount, now: Date, horizon: number): number[] {
  const opening = new Date(account.openingDate)
  const from = { y: opening.getFullYear(), m: opening.getMonth() + 1 }
  const nowYM = { y: now.getFullYear(), m: now.getMonth() + 1 }
  const nowIdx = monthsBetween(from, nowYM)

  if (nowIdx >= 0) {
    const target = { year: nowYM.y + Math.floor((nowYM.m - 1 + horizon) / 12), month: ((nowYM.m - 1 + horizon) % 12) + 1 }
    const grown = projectSavingsGrowth(account, target)
    if (grown.length > nowIdx + horizon) {
      return Array.from({ length: horizon + 1 }, (_, t) => grown[nowIdx + t] ?? grown.at(-1) ?? 0)
    }
  }
  // Fallback: dagens effektive saldo + flat plan med siste kjente rente
  const start = computeEffectiveBalance(account, now)
  const isBSU = account.type === 'BSU'
  const monthly = isBSU ? Math.min(account.monthlyContribution, BSU_MAX_YEARLY / 12) : account.monthlyContribution
  return Array.from({ length: horizon + 1 }, (_, t) =>
    projectBalanceMonthly(start, monthly, latestRate(account), t, isBSU)
  )
}

/** Gjeldssaldo-serie for én egen gjeldspost via kanonisk nedbetalingsplan */
function debtSeries(debt: DebtAccount, horizon: number): number[] {
  const plan = buildRepaymentPlan(debt)
  return Array.from({ length: horizon + 1 }, (_, t) =>
    t === 0 ? debt.currentBalance : plan.rows[t - 1]?.balance ?? 0
  )
}

/** Partner-EK-serie: kontoer med egne renter + BSU med tak og aldersgrense */
function partnerEquitySeries(p: PartnerVeikart, now: Date, horizon: number): number[] {
  const bsuCutoffYear = p.bsuBirthYear ? p.bsuBirthYear + 33 : null
  const bsuMonthsLeft = bsuCutoffYear === null
    ? horizon
    : Math.max(0, (bsuCutoffYear - now.getFullYear() + 1) * 12 - now.getMonth())

  return Array.from({ length: horizon + 1 }, (_, t) => {
    const accounts = (p.accounts?.length ?? 0) > 0
      ? p.accounts.reduce((s, a) => s + projectBalanceMonthly(a.balance, a.monthlyContribution, a.rate ?? 3.5, t), 0)
      : projectBalanceMonthly(partnerNonBsuEquity(p), partnerMonthlySavingsTotal(p), 3.5, t)
    const bsuContribMonths = Math.min(t, bsuMonthsLeft)
    const bsu = projectBalanceMonthly(
      p.bsu ?? 0,
      Math.min(p.bsuMonthlyContribution ?? 0, BSU_MAX_YEARLY / 12),
      0, bsuContribMonths, true,
    )
    return accounts + bsu
  })
}

/** Partner-gjeld-serie: annuitetsnedbetaling med postens rente/terminbeløp */
function partnerDebtSeries(p: PartnerVeikart, horizon: number): number[] {
  const debts = p.debts?.length ? p.debts : (p.debt ? [{ currentBalance: p.debt, interestRate: 0, monthlyPayment: 0 }] : [])
  return Array.from({ length: horizon + 1 }, (_, t) =>
    debts.reduce((s, d) => {
      let bal = d.currentBalance
      const r = (d.interestRate ?? 0) / 100 / 12
      if (d.monthlyPayment <= 0) return s + bal
      for (let i = 0; i < t && bal > 0; i++) bal = bal * (1 + r) - d.monthlyPayment
      return s + Math.max(0, bal)
    }, 0)
  )
}

/** Brutto årsinntekt som trengs (utover dagens) for at netto/mnd skal nå kravet */
function grossIncomeGapForNet(
  requiredMonthlyNet: number,
  primaryGross: number,
  coGross: number | undefined,
): number {
  if (calcHouseholdMonthlyNetIncome(primaryGross, coGross) >= requiredMonthlyNet) return 0
  // Binærsøk på ekstra bruttolønn lagt på hovedsøker (progressiv skatt)
  let lo = 0
  let hi = 20_000_000
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (calcHouseholdMonthlyNetIncome(primaryGross + mid, coGross) >= requiredMonthlyNet) hi = mid
    else lo = mid
  }
  return Math.round(hi)
}

// ── Hovedanalyse ────────────────────────────────────────────

export function analyzeAffordabilityPath(input: AffordabilityPathInput): AffordabilityPath {
  const {
    property, household, interestRate, loanTermYears, config,
    savingsAccounts, fondPortfolio, debts, partner,
  } = input
  const now = input.now ?? new Date()
  const H = PATH_HORIZON_MONTHS
  const rules = config.lendingRules
  const sharedDebt = property.sharedDebt ?? 0
  const includePartner = Boolean(partner?.enabled && household.coApplicant)

  // ── EK-serie: egne kontoer (eks. fond/krypto) + fondportefølje (+ partner) ──
  const ownAccounts = savingsAccounts.filter((a) => a.type !== 'fond' && a.type !== 'krypto')
  const accountSerier = ownAccounts.map((a) => accountSeries(a, now, H))

  const fondStart = [...(fondPortfolio?.snapshots ?? [])]
    .sort((a, b) => b.date.localeCompare(a.date))[0]?.totalValue ?? 0
  const fondMonthly = fondPortfolio?.monthlyDeposit ?? 0

  const partnerSerie = includePartner && partner ? partnerEquitySeries(partner, now, H) : null

  const equityAt = (t: number): number =>
    accountSerier.reduce((s, serie) => s + (serie[t] ?? 0), 0) +
    projectBalanceMonthly(fondStart, fondMonthly, DEFAULT_FOND_RATE, t) +
    (partnerSerie?.[t] ?? 0)

  // ── Gjeldsserie: Lommeboka-gjeld amortisert (+ partner); fallback: flat fra skjemaet ──
  const ownDebtSerier = debts
    .filter((d) => d.status !== 'nedbetalt')
    .map((d) => debtSeries(d, H))
  const partnerDebtSerie = includePartner && partner ? partnerDebtSeries(partner, H) : null
  const scenarioExistingDebt =
    (household.primaryApplicant.existingDebt ?? 0) + (household.coApplicant?.existingDebt ?? 0)

  const existingDebtAt = (t: number): number =>
    ownDebtSerier.length > 0 || partnerDebtSerie
      ? ownDebtSerier.reduce((s, serie) => s + (serie[t] ?? 0), 0) + (partnerDebtSerie?.[t] ?? 0)
      : scenarioExistingDebt

  // ── Faste størrelser (flat inntekt-antakelse) ──
  const totalAnnualIncome = calcTotalAnnualIncome(
    household.primaryApplicant.grossIncome,
    household.primaryApplicant.otherIncome,
    household.coApplicant?.grossIncome,
    household.coApplicant?.otherIncome,
  )
  const primaryGrossTotal = household.primaryApplicant.grossIncome + (household.primaryApplicant.otherIncome ?? 0)
  const coGrossTotal = household.coApplicant
    ? household.coApplicant.grossIncome + (household.coApplicant.otherIncome ?? 0)
    : undefined
  const monthlyNetIncome = calcHouseholdMonthlyNetIncome(primaryGrossTotal, coGrossTotal)

  const financeAllFees = input.financeAllFees ?? false
  const fees = calcAcquisitionFees(property.price, config.fees, property.ownershipType, financeAllFees)
  const stressRate = calcStressTestRate(interestRate, rules)
  const sifo = calcSIFOExpenses(household, config.sifo)
  const otherExpenses = calcOtherMonthlyExpenses(
    property.monthlyFee, property.propertyTax, input.extraMonthlyExpenses, config.fees.termFee,
  )
  const sharedDebtStress = calcSharedDebtStress(sharedDebt, rules)
  const requiredEquity = (property.price + sharedDebt) * (rules.minEquityPercent / 100)

  // ── Kravsjekk per måned ──
  const check = (t: number) => {
    const effEq = calcEffectiveEquity(equityAt(t), fees.totalFees)
    const ownLoan = Math.max(0, property.price - effEq + fees.financedFees)
    const existingDebt = existingDebtAt(t)

    const equityOk = effEq >= requiredEquity
    const debtOk = ownLoan + sharedDebt + existingDebt <= totalAnnualIncome * rules.maxDebtRatio
    const disposable =
      monthlyNetIncome -
      annuityPayment(ownLoan, stressRate, loanTermYears) -
      sifo - otherExpenses -
      calcExistingDebtServicing(existingDebt, stressRate) -
      sharedDebtStress
    return { equityOk, debtOk, affordOk: disposable >= 0, effEq, ownLoan, existingDebt, disposable }
  }

  let equityMonths: number | null = null
  let debtRatioMonths: number | null = null
  let affordabilityMonths: number | null = null
  let allMonths: number | null = null
  for (let t = 0; t <= H; t++) {
    const c = check(t)
    if (equityMonths === null && c.equityOk) equityMonths = t
    if (debtRatioMonths === null && c.debtOk) debtRatioMonths = t
    if (affordabilityMonths === null && c.affordOk) affordabilityMonths = t
    if (allMonths === null && c.equityOk && c.debtOk && c.affordOk) allMonths = t
    if (allMonths !== null) break
  }

  // ── Gap i dag ──
  const today = check(0)
  const equityNow = equityAt(0)
  const equityGap = Math.max(0, Math.round(requiredEquity - today.effEq))

  const kausjon = kausjonNeededForPrice(
    property.price, equityNow, today.existingDebt, household, config,
    interestRate, loanTermYears, property.ownershipType, financeAllFees, sharedDebt,
  )

  const incomeNeededDebtRatio = (today.ownLoan + sharedDebt + today.existingDebt) / rules.maxDebtRatio
  const incomeGapDebtRatio = Math.max(0, Math.round(incomeNeededDebtRatio - totalAnnualIncome))

  const requiredMonthlyNet =
    annuityPayment(today.ownLoan, stressRate, loanTermYears) +
    sifo + otherExpenses +
    calcExistingDebtServicing(today.existingDebt, stressRate) +
    sharedDebtStress
  const incomeGapAffordability = grossIncomeGapForNet(requiredMonthlyNet, primaryGrossTotal, coGrossTotal)

  const monthlySavingsRate = Math.round(
    ownAccounts.reduce((s, a) => s + (a.monthlyContribution ?? 0), 0) +
    fondMonthly +
    (includePartner && partner
      ? partnerMonthlySavingsTotal(partner) + Math.min(partner.bsuMonthlyContribution ?? 0, BSU_MAX_YEARLY / 12)
      : 0),
  )

  const hasSavingsData = ownAccounts.length > 0 || fondStart > 0 || Boolean(partnerSerie)

  return {
    hasSavingsData,
    equityNow: Math.round(equityNow),
    monthlySavingsRate,
    timeline: { equityMonths, debtRatioMonths, affordabilityMonths, allMonths },
    gaps: {
      equityGap,
      kausjonNeeded: kausjon.kausjonNeeded,
      kausjonReachable: kausjon.reachable,
      kausjonCeiling: kausjon.ceiling,
      incomeGapDebtRatio,
      incomeGapAffordability,
    },
    horizonMonths: H,
  }
}
