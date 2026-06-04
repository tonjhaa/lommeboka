import { computeEffectiveBalance, projectBalanceMonthly, getEffectiveRate } from './savingsCalculator'
import type {
  SavingsAccount, DebtAccount, EmploymentProfile,
  PartnerVeikart, PartnerAccount, PartnerDebt,
} from '@/types/economy'

export function buildPartnerVeikartPatch(
  savingsAccounts: SavingsAccount[],
  debts: DebtAccount[],
  profile: EmploymentProfile | null,
  existing: PartnerVeikart,
  now: Date,
): Partial<PartnerVeikart> & Pick<PartnerVeikart, 'enabled' | 'accounts' | 'bsu' | 'bsuMonthlyContribution' | 'annualIncome' | 'debts'> {
  function projectedBalance(a: SavingsAccount): number {
    const effectiveBalance = computeEffectiveBalance(a, now)
    const rate = [...a.rateHistory].sort((x, y) => y.fromDate.localeCompare(x.fromDate))[0]?.rate ?? 0
    const monthly = a.monthlyContribution ?? 0
    // If there's actual balance history, use computeEffectiveBalance directly
    if (a.balanceHistory.length > 0) return effectiveBalance
    // Otherwise project forward from openingDate using monthlyContribution
    const openingMs = new Date(a.openingDate).getTime()
    const months = Math.max(0, Math.round((now.getTime() - openingMs) / (1000 * 60 * 60 * 24 * 30.44)))
    if (months === 0) return effectiveBalance
    return projectBalanceMonthly(a.openingBalance, monthly, rate, months, a.type === 'BSU')
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
        monthlyContribution: a.monthlyContribution ?? 0,
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

  return {
    enabled: true,
    accounts,
    bsu: bsuAcc ? projectedBalance(bsuAcc) : existing.bsu,
    bsuMonthlyContribution: bsuAcc?.monthlyContribution ?? existing.bsuMonthlyContribution,
    annualIncome: profile ? (profile.baseMonthly ?? 0) * 12 : existing.annualIncome,
    debts: activeDebts,
  }
}
