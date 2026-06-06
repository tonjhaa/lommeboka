import { computeEffectiveBalance, projectBalanceMonthly, getEffectiveRate, getBaseContribForPeriod } from './savingsCalculator'
import type {
  SavingsAccount, DebtAccount, EmploymentProfile,
  PartnerVeikart, PartnerAccount, PartnerDebt, PartnerFondHolding, FondPortfolio,
} from '@/types/economy'

export function buildPartnerVeikartPatch(
  savingsAccounts: SavingsAccount[],
  debts: DebtAccount[],
  profile: EmploymentProfile | null,
  existing: PartnerVeikart,
  now: Date,
  fondPortfolio?: FondPortfolio | null,
): Partial<PartnerVeikart> & Pick<PartnerVeikart, 'enabled' | 'accounts' | 'bsu' | 'bsuMonthlyContribution' | 'annualIncome' | 'debts'> {
  const nowISO = now.toISOString().slice(0, 10)

  function currentRate(a: SavingsAccount): number {
    return [...a.rateHistory].filter(r => r.fromDate <= nowISO).sort((x, y) => y.fromDate.localeCompare(x.fromDate))[0]?.rate ?? 0
  }

  function projectedBalance(a: SavingsAccount): number {
    const effectiveBalance = computeEffectiveBalance(a, now)
    const rate = currentRate(a)

    if (a.balanceHistory.length > 0) {
      // Project interest from the last balance entry to now
      const sorted = [...a.balanceHistory].sort((x, y) => x.year !== y.year ? x.year - y.year : x.month - y.month)
      const last = sorted.at(-1)!
      const lastDate = new Date(last.year, last.month - 1, 1)
      const monthsSinceEntry = Math.max(0, Math.round((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44)))
      if (monthsSinceEntry > 0 && rate > 0) {
        return Math.round(projectBalanceMonthly(effectiveBalance, 0, rate, monthsSinceEntry, a.type === 'BSU'))
      }
      return Math.round(effectiveBalance)
    }

    // No balance history: project forward from opening date
    const monthly = getBaseContribForPeriod(a, now.getFullYear(), now.getMonth() + 1)
    const openingMs = new Date(a.openingDate).getTime()
    const months = Math.max(0, Math.round((now.getTime() - openingMs) / (1000 * 60 * 60 * 24 * 30.44)))
    if (months === 0) return Math.round(effectiveBalance)
    return Math.round(projectBalanceMonthly(a.openingBalance, monthly, rate, months, a.type === 'BSU'))
  }

  const accounts: PartnerAccount[] = savingsAccounts
    .filter((a) => a.type !== 'BSU' && a.type !== 'fond')
    .map((a) => {
      const balance = projectedBalance(a)
      return {
        id: a.id,
        label: a.label,
        balance,
        rate: getEffectiveRate(a, balance),
        monthlyContribution: getBaseContribForPeriod(a, now.getFullYear(), now.getMonth() + 1),
        ...(a.tieredRates?.length ? { tieredRates: a.tieredRates } : {}),
      }
    })

  const bsuAcc = savingsAccounts.find((a) => a.type === 'BSU')

  const activeDebts: PartnerDebt[] = debts
    .filter((d) => d.status !== 'nedbetalt')
    .map((d) => ({
      id: d.id,
      label: d.creditor,
      currentBalance: d.currentBalance,
      interestRate: [...d.rateHistory].sort((x, y) => y.fromDate.localeCompare(x.fromDate))[0]?.nominalRate ?? 0,
      monthlyPayment: d.monthlyPayment,
    }))

  // Fond — synker totalverdi fra siste snapshot i partners fondPortfolio
  const lastSnapshot = fondPortfolio?.snapshots?.length
    ? [...fondPortfolio.snapshots].sort((a, b) => b.date.localeCompare(a.date))[0]
    : null
  const syncedFondValue = lastSnapshot?.totalValue ?? existing.fondCurrentValue

  // Beregn per-fond verdier fra allokering × totalverdi
  const fondHoldings: PartnerFondHolding[] | undefined =
    fondPortfolio?.funds?.length && lastSnapshot?.totalValue
      ? fondPortfolio.funds.map((f) => ({
          id: f.id,
          name: f.name,
          type: f.type as PartnerFondHolding['type'],
          currentValue: Math.round(lastSnapshot.totalValue * (f.allocationPercent / 100)),
          returnPct: f.returnPercent,
          monthlyContribution: undefined,
        }))
      : existing.fondHoldings

  return {
    enabled: true,
    accounts,
    bsu: bsuAcc ? projectedBalance(bsuAcc) : existing.bsu,
    bsuMonthlyContribution: bsuAcc?.monthlyContribution ?? existing.bsuMonthlyContribution,
    annualIncome: profile ? (profile.baseMonthly ?? 0) * 12 : existing.annualIncome,
    debts: activeDebts,
    ...(fondHoldings ? { fondHoldings } : {}),
    ...(syncedFondValue != null ? { fondCurrentValue: syncedFondValue } : {}),
  }
}
