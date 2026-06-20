// ============================================================
// SCENARIO-SIMULATOR — hva-skjer-hvis via eksisterende motorer
// Rene funksjoner. Transformerer input og kjører motorene to ganger.
// ============================================================

import type {
  SavingsAccount, DebtAccount, NetWorthPoint,
  ScenarioLevers, ScenarioKeyFigures, ScenarioResult, ScenarioOneTimeEvent,
  NetWorthSeries, FondPortfolio, IVFTransaction, PartnerVeikart,
} from '@/types/economy'
import { beregnSkatt } from './norwegianTaxCalc'
import { computeNetWorthSeries } from './netWorthCalculator'
import { projectPension } from './pensionCalculator'
import { calcMaxPurchaseSimple } from '@/utils/maxPurchase'
import { defaultConfig } from '@/config/default.config'

/** Legg prosentpoeng på alle rentepunkter for hver sparekonto. */
export function bumpAccountRates(accounts: SavingsAccount[], deltaPp: number): SavingsAccount[] {
  if (deltaPp === 0) return accounts
  return accounts.map((a) => ({
    ...a,
    rateHistory: a.rateHistory.map((r) => ({ ...r, rate: r.rate + deltaPp })),
    tieredRates: a.tieredRates?.map((t) => ({ ...t, rate: t.rate + deltaPp })),
    tieredRateHistory: a.tieredRateHistory?.map((h) => ({ ...h, tiers: h.tiers.map((t) => ({ ...t, rate: t.rate + deltaPp })) })),
  }))
}

/** Legg prosentpoeng på nominalRate for hver gjeld. */
export function bumpDebtRates(debts: DebtAccount[], deltaPp: number): DebtAccount[] {
  if (deltaPp === 0) return debts
  return debts.map((d) => ({
    ...d,
    rateHistory: d.rateHistory.map((r) => ({ ...r, nominalRate: r.nominalRate + deltaPp })),
  }))
}

/**
 * Netto per måned etter inntektsskatt for en gitt brutto månedslønn.
 * Brukes for Δnetto: kalles for baseline- og scenario-brutto med samme motor,
 * så pensjon/fagforening (konstante) kanselleres i differansen.
 */
export function netMonthlyFromGross(grossMonthly: number): number {
  const grossAnnual = grossMonthly * 12
  const res = beregnSkatt({
    lonnsInntekt: grossAnnual, pensjonsinntekt: 0, næringsInntekt: 0, kapitalInntekt: 0,
    andreFradrag: 0, renteutgifter: 0, arbeidsreiseFradrag: 0, fagforeningskontingent: 0,
    pensjonspremie: 0, utgiftsgodtgjørelse: 0, bsuSkattefradrag: 0,
    primaerboligVerdi: 0, sekundaerboligVerdi: 0, bankinnskudd: 0, aksjerFondVerdi: 0,
    annenFormue: 0, gjeld: 0,
  })
  return (grossAnnual - res.skattInntekt) / 12
}

/** Legg engangsbeløp på series.total fra hver hendelses (year,month) og framover. */
export function applyOneTimeEvents(series: NetWorthPoint[], events: ScenarioOneTimeEvent[]): NetWorthPoint[] {
  if (events.length === 0) return series
  return series.map((p) => {
    const ym = `${p.year}-${String(p.month).padStart(2, '0')}`
    const overlay = events
      .filter((e) => e.date.slice(0, 7) <= ym)
      .reduce((s, e) => s + e.amount, 0)
    return overlay !== 0 ? { ...p, total: p.total + overlay } : p
  })
}

/**
 * Legg månedlig sparingDelta på første rene sparekonto (ikke BSU/fond/krypto, som er
 * saldo-styrte og ignorerer monthlyContribution i projeksjonen); syntetiser én om ingen finnes.
 * `nowISO` brukes for deterministisk åpningsdato på den syntetiske kontoen.
 */
export function addSavingsDelta(accounts: SavingsAccount[], deltaPerMonth: number, nowISO?: string): SavingsAccount[] {
  if (deltaPerMonth === 0) return accounts
  const isContributionDriven = (a: SavingsAccount) => a.type !== 'BSU' && a.type !== 'fond' && a.type !== 'krypto'
  const idx = accounts.findIndex(isContributionDriven)
  if (idx === -1) {
    const date = nowISO ?? new Date().toISOString().split('T')[0]
    const synthetic: SavingsAccount = {
      id: 'scenario-savings', type: 'sparekonto', label: 'Scenario-sparing',
      openingBalance: 0, openingDate: date,
      monthlyContribution: deltaPerMonth, interestCreditFrequency: 'monthly',
      rateHistory: [{ fromDate: date, rate: 0 }],
      balanceHistory: [], withdrawals: [], contributions: [],
    }
    return [...accounts, synthetic]
  }
  return accounts.map((a, i) => i === idx ? { ...a, monthlyContribution: a.monthlyContribution + deltaPerMonth } : a)
}

// ============================================================
// SCENARIO BASELINE + SIMULATE
// ============================================================

export const DEFAULT_SCENARIO_LEVERS: ScenarioLevers = {
  salaryPct: 0, salaryKr: 0, rateDeltaPp: 0, monthlySavingsDelta: 0,
  oneTimeEvents: [], extraNetToSavingsPct: 60,
}

/** Baseline-input som hooken samler fra storen. */
export interface ScenarioBaseline {
  now: { year: number; month: number }
  historyMonths: number
  projectionMonths: number
  grossMonthly: number
  baseMonthlyForPension: number
  pensionBirthYear: number
  pensionServiceStartYear: number
  currentG: number
  equity: number
  existingDebt: number
  savingsAccounts: SavingsAccount[]
  fondPortfolio: FondPortfolio
  ivfTransactions: IVFTransaction[]
  debts: DebtAccount[]
  partnerVeikart: PartnerVeikart
}

const NETWORTH_5Y_MONTHS = 60

function seriesValueAt(series: NetWorthSeries, monthsFromNow: number, now: { year: number; month: number }): number {
  const target = new Date(now.year, now.month - 1 + monthsFromNow, 1)
  const ty = target.getFullYear(), tm = target.getMonth() + 1
  const pt = series.find((p) => p.year === ty && p.month === tm)
  return pt?.total ?? series[series.length - 1]?.total ?? 0
}

/** Kjør motorene én gang for et gitt sett input + spaker. */
function runOnce(b: ScenarioBaseline, levers: ScenarioLevers): { series: NetWorthSeries; figures: ScenarioKeyFigures } {
  const grossMonthly = b.grossMonthly * (1 + levers.salaryPct / 100) + levers.salaryKr
  const baselineNet = netMonthlyFromGross(b.grossMonthly)
  const scenarioNet = netMonthlyFromGross(grossMonthly)
  const deltaNet = scenarioNet - baselineNet
  const savingsFromSalary = Math.max(0, deltaNet) * (levers.extraNetToSavingsPct / 100)
  const totalSavingsDelta = savingsFromSalary + levers.monthlySavingsDelta

  // Transformer input
  const nowISO = `${b.now.year}-${String(b.now.month).padStart(2, '0')}-01`
  const accounts = addSavingsDelta(bumpAccountRates(b.savingsAccounts, levers.rateDeltaPp), totalSavingsDelta, nowISO)
  const debts = bumpDebtRates(b.debts, levers.rateDeltaPp)

  const from = new Date(b.now.year, b.now.month - 1 - b.historyMonths, 1)
  const to = new Date(b.now.year, b.now.month - 1 + b.projectionMonths, 1)
  let series = computeNetWorthSeries({
    scope: 'din',
    from: { year: from.getFullYear(), month: from.getMonth() + 1 },
    to: { year: to.getFullYear(), month: to.getMonth() + 1 },
    now: b.now,
    savingsAccounts: accounts, fondPortfolio: b.fondPortfolio,
    ivfTransactions: b.ivfTransactions, debts, partnerVeikart: b.partnerVeikart,
  })
  series = applyOneTimeEvents(series, levers.oneTimeEvents)

  const annualIncome = grossMonthly * 12
  // SPK-grunnlaget skaleres proporsjonalt med den faktiske brutto-endringen, så både
  // salaryPct og flat salaryKr fordeles riktig (unngår dobbelttelling av salaryKr).
  const grossRatio = b.grossMonthly > 0 ? grossMonthly / b.grossMonthly : 1
  const pension = projectPension({
    birthYear: b.pensionBirthYear, serviceStartYear: b.pensionServiceStartYear,
    currentYear: b.now.year, currentG: b.currentG,
    folketrygdAnnualIncome: annualIncome,
    spkAnnualGrunnlag: b.baseMonthlyForPension * grossRatio * 12,
    uttaksalder: 67, salaryGrowthPct: 3, gGrowthPct: 3.5,
    afpEnabled: true, særalder: { enabled: false, age: 60 },
  })

  // Total sparerate: all månedlig sparing (eksisterende kontoers bidrag + spak-delta) / netto.
  const baselineMonthlySavings = b.savingsAccounts.reduce((s, a) => s + (a.monthlyContribution ?? 0), 0)
  const totalMonthlySavings = baselineMonthlySavings + totalSavingsDelta

  const netWorth5y = seriesValueAt(series, NETWORTH_5Y_MONTHS, b.now)
  const figures: ScenarioKeyFigures = {
    nettoPerMonth: scenarioNet,
    sparerate: scenarioNet > 0 ? Math.round(totalMonthlySavings / scenarioNet * 100) : 0,
    netWorth5y,
    // Kjøpekraft «nå»: bruker dagens egenkapital (b.equity) — du kjøper ikke med fremtidig
    // sparing i dag. Varierer derfor med inntektsspaker, ikke med sparing/engangsbeløp.
    purchasingPower: calcMaxPurchaseSimple(b.equity, annualIncome, b.existingDebt, defaultConfig),
    pensionAt67: pension.monthlyTotal,
  }
  return { series, figures }
}

/** Simuler baseline (nøytralt) og scenario (med spaker) over samme motorer. */
export function simulateScenario(b: ScenarioBaseline, levers: ScenarioLevers): ScenarioResult {
  return {
    baseline: runOnce(b, DEFAULT_SCENARIO_LEVERS),
    scenario: runOnce(b, levers),
  }
}
