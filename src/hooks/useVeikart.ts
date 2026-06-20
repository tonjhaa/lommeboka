import { useMemo } from 'react'
import { useEconomyStore } from '@/application/useEconomyStore'
import { computeEffectiveBalance, projectBalanceMonthly } from '@/domain/economy/savingsCalculator'
import { calcMaxPurchaseSimple } from '@/utils/maxPurchase'
import { defaultConfig } from '@/config/default.config'
import { DEFAULT_FOND_RATE } from '@/config/economy.config'

// ── Norsk boliglånsforskrift — satser fra boligkalkulatorens konfig ──
const EK_KRAV = defaultConfig.lendingRules.minEquityPercent / 100
const MAX_GJELDSGRAD = defaultConfig.lendingRules.maxDebtRatio
const BSU_MAX_YEARLY = 27500
const BSU_MAX_TOTAL = 300000
const BSU_MAX_AGE = 33         // siste år man KAN spare (fyller 34)
const BSU_TAX_BENEFIT = 0.10   // 10% av innskudd
const STRESSTEST_MIN = defaultConfig.lendingRules.minStressTestRate / 100
const STRESSTEST_PP = defaultConfig.lendingRules.stressTestAddition / 100
const CURRENT_RATE = 0.0425    // 4.25% (norges bank 2026)
const DEFAULT_SAVINGS_RATE = 3.5  // % per år, sparekonto
// DEFAULT_FOND_RATE importeres fra economy.config (delt med Formue-modulen)

/** Delegerer til boligkalkulatorens motor (EK-grense med kjøpsgebyrer + gjeldsgrad)
 *  slik at «maks kjøpesum» betyr det samme i Veikart, Sparing og kalkulatoren. */
function calcMaxPurchase(equity: number, annualIncome: number, existingDebt: number): number {
  return calcMaxPurchaseSimple(equity, annualIncome, existingDebt, defaultConfig)
}

function calcStressRate(currentRate: number): number {
  return Math.max(STRESSTEST_MIN, currentRate + STRESSTEST_PP)
}

function monthlyPayment(principal: number, annualRate: number, years: number): number {
  const r = annualRate / 12
  const n = years * 12
  if (r === 0) return principal / n
  return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)
}

/** Beregner gjeldssaldo etter `months` måneder med annuitet */
function projectDebtBalance(currentBalance: number, nominalRate: number, monthly: number, months: number): number {
  if (currentBalance <= 0) return 0
  if (monthly <= 0) return currentBalance
  const r = nominalRate / 100 / 12
  if (r === 0) return Math.max(0, currentBalance - monthly * months)
  let bal = currentBalance
  for (let i = 0; i < months; i++) {
    bal = bal * (1 + r) - monthly
    if (bal <= 0) return 0
  }
  return Math.max(0, bal)
}

export interface VeikartData {
  // Input (fra store)
  equity: number
  bsu: number
  fond: number
  fondMonthly: number         // månedlig fondsdeposit
  annualIncome: number
  existingDebt: number
  monthlySavings: number      // månedlig sparing på sparekonto/annet (eks. BSU og fond)

  // Beregnet
  totalEquity: number
  maxPurchase: number
  maxLoan: number
  stressRate: number
  stressMonthlyPayment: number

  // BSU
  bsuRemaining: number        // til BSU-taket
  bsuYearlyTaxSaving: number  // skattefordel per år
  bsuCanSave: boolean         // alder OK

  // Scenarier: { years, equity, bsu, maxPurchase }
  scenarios: VeikartScenario[]
}

export interface VeikartScenario {
  years: number
  label: string
  equity: number
  bsu: number
  maxPurchase: number
  monthlyPaymentAtStress: number
}

export function useVeikart(): VeikartData {
  const { savingsAccounts, fondPortfolio, debts, profile, userPreferences } = useEconomyStore()

  return useMemo(() => {
    const now = new Date()
    const currentYear = now.getFullYear()

    // Egenkapital fra sparekonto (ikke BSU) — bruker effektiv saldo inkl. bidrag etter siste snapshot
    const equity = savingsAccounts
      .filter((a) => a.type === 'sparekonto')
      .reduce((s, a) => s + computeEffectiveBalance(a, now), 0)

    const bsu = savingsAccounts
      .filter((a) => a.type === 'BSU')
      .reduce((s, a) => s + computeEffectiveBalance(a, now), 0)

    const fondSnapshots = [...(fondPortfolio?.snapshots ?? [])].sort((a, b) => b.date.localeCompare(a.date))
    const fond = fondSnapshots[0]?.totalValue ?? 0
    const fondMonthly = fondPortfolio?.monthlyDeposit ?? 0

    const annualIncome =
      (profile?.baseMonthly ?? 0) * 12 +
      (profile?.fixedAdditions.reduce((s, a) => s + a.amount, 0) ?? 0) * 12

    const existingDebt = debts.filter(d => d.status !== 'nedbetalt').reduce((s, d) => s + d.currentBalance, 0)

    // Månedlig sparing på sparekonto/annet — fond og BSU holdes separat
    const monthlySavings = savingsAccounts
      .filter(a => a.type !== 'BSU')
      .reduce((s, a) => s + (a.monthlyContribution ?? 0), 0)

    const totalEquity = equity + bsu + fond
    const maxPurchase = calcMaxPurchase(totalEquity, annualIncome, existingDebt)
    const maxLoan = maxPurchase - totalEquity
    const stressRate = calcStressRate(CURRENT_RATE)
    const stressMonthlyPayment = maxLoan > 0 ? monthlyPayment(maxLoan, stressRate, 25) : 0

    const bsuRemaining = Math.max(0, BSU_MAX_TOTAL - bsu)
    const bsuYearlyTaxSaving = Math.min(BSU_MAX_YEARLY, bsuRemaining) * BSU_TAX_BENEFIT

    // BSU aldersgrense
    const bsuAccount = savingsAccounts.find(a => a.type === 'BSU')
    const bsuBirthYear = userPreferences?.birthYear ?? bsuAccount?.birthYear ?? null
    const bsuCutoffYear = bsuBirthYear ? bsuBirthYear + BSU_MAX_AGE : null

    // Scenarier: nå, 1 år, 2 år, 3 år, 5 år
    const yearSteps = [0, 1, 2, 3, 5]
    const scenarios: VeikartScenario[] = yearSteps.map((years) => {
      // Rentes-rente på sparekonto
      const futureEquity = projectBalanceMonthly(equity, monthlySavings, DEFAULT_SAVINGS_RATE, years * 12)

      // Fond med avkastning
      const futureFond = projectBalanceMonthly(fond, fondMonthly, DEFAULT_FOND_RATE, years * 12)

      // BSU med aldersgrense
      const bsuYearsLeft = bsuCutoffYear ? Math.max(0, bsuCutoffYear - currentYear) : years
      const effectiveBsuYears = Math.min(years, bsuYearsLeft)
      let futureBsu = bsu
      for (let y = 0; y < effectiveBsuYears; y++) {
        const room = Math.max(0, BSU_MAX_TOTAL - futureBsu)
        futureBsu = Math.min(BSU_MAX_TOTAL, futureBsu + Math.min(BSU_MAX_YEARLY, room))
      }

      // Gjeld amortisert ned
      const futureDebt = debts.filter(d => d.status !== 'nedbetalt').reduce((s, d) => {
        const sorted = [...d.rateHistory].sort((a, b) => b.fromDate.localeCompare(a.fromDate))
        const rate = sorted[0]?.nominalRate ?? 0
        return s + projectDebtBalance(d.currentBalance, rate, d.monthlyPayment, years * 12)
      }, 0)

      const futureTotal = futureEquity + futureBsu + futureFond
      const futureMax = calcMaxPurchase(futureTotal, annualIncome, futureDebt)
      const futureLoan = futureMax - futureTotal
      const futureStressPayment = futureLoan > 0 ? monthlyPayment(futureLoan, stressRate, 25) : 0
      return {
        years,
        label: years === 0 ? 'I dag' : years === 1 ? '1 år' : `${years} år`,
        equity: futureEquity,
        bsu: futureBsu,
        maxPurchase: futureMax,
        monthlyPaymentAtStress: futureStressPayment,
      }
    })

    return {
      equity, bsu, fond, fondMonthly, annualIncome, existingDebt, monthlySavings,
      totalEquity, maxPurchase, maxLoan, stressRate, stressMonthlyPayment,
      bsuRemaining, bsuYearlyTaxSaving, bsuCanSave: bsu < BSU_MAX_TOTAL,
      scenarios,
    }
  }, [savingsAccounts, fondPortfolio, debts, profile, userPreferences])
}

export { calcMaxPurchase, monthlyPayment, BSU_MAX_YEARLY, BSU_MAX_TOTAL, BSU_MAX_AGE, BSU_TAX_BENEFIT, EK_KRAV, MAX_GJELDSGRAD }
