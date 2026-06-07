import { computeEffectiveBalance, getEffectiveRate } from './savingsCalculator'
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
  savingsOverrides?: Record<string, number>,
): Partial<PartnerVeikart> & Pick<PartnerVeikart, 'enabled' | 'accounts' | 'bsu' | 'bsuMonthlyContribution' | 'annualIncome' | 'debts'> {
  const nowISO = now.toISOString().slice(0, 10)

  // Find the most relevant contribution period for an account:
  // active this month, or if none, the next upcoming one.
  function relevantPeriod(a: SavingsAccount) {
    const periods = a.contributionPeriods ?? []
    if (periods.length === 0) return null
    const active = periods.find(p => {
      const from = p.fromDate ? p.fromDate.slice(0, 7) : '0000-00'
      const to = p.toDate ? p.toDate.slice(0, 7) : '9999-99'
      return nowISO.slice(0, 7) >= from && nowISO.slice(0, 7) <= to
    })
    if (active) return active
    return [...periods]
      .filter(p => (p.fromDate ?? '0000-00') > nowISO.slice(0, 7))
      .sort((x, y) => (x.fromDate ?? '').localeCompare(y.fromDate ?? ''))[0] ?? null
  }

  const accounts: PartnerAccount[] = savingsAccounts
    .filter((a) => a.type !== 'BSU' && a.type !== 'fond')
    .map((a) => {
      const balance = Math.round(computeEffectiveBalance(a, now))
      const period = relevantPeriod(a)
      const legacy = a.monthlyContribution ?? 0
      const periods = a.contributionPeriods ?? []
      // Embedder per-måneds-overrides fra partners savingsOverrides
      const monthlyOverrides: Record<string, number> = {}
      if (savingsOverrides) {
        const prefix = `${a.id}-`
        for (const [key, val] of Object.entries(savingsOverrides)) {
          if (key.startsWith(prefix)) {
            // key = "{uuid}-{year}-{month}" → ymPart = "{year}-{month}"
            monthlyOverrides[key.slice(prefix.length)] = val
          }
        }
      }

      // Planlagte fremtidige innskudd (contributions med dato > i dag)
      const futureContributions = (a.contributions ?? [])
        .filter(c => c.date > nowISO)
        .map(c => ({ date: c.date, amount: c.amount }))

      return {
        id: a.id,
        label: a.label,
        balance,
        rate: getEffectiveRate(a, balance),
        // Legacy single-period fields for backwards compat
        monthlyContribution: period ? Math.round(period.amount) : legacy,
        ...(period?.fromDate ? { fromDate: period.fromDate } : {}),
        ...(period?.toDate ? { toDate: period.toDate } : {}),
        ...(a.tieredRates?.length ? { tieredRates: a.tieredRates } : {}),
        // All periods for accurate monthly simulation
        ...(periods.length > 0 ? { contributionPeriods: periods } : {}),
        // Per-month overrides embedded for reliable display uten separate store-oppslag
        ...(Object.keys(monthlyOverrides).length > 0 ? { monthlyOverrides } : {}),
        // Planlagte fremtidige innskudd
        ...(futureContributions.length > 0 ? { futureContributions } : {}),
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

  // Synk månedlig fondinnskudd fra contributionPeriods eller monthlyDeposit
  const fondMonthlyContribution = (() => {
    if (!fondPortfolio) return existing.fondMonthlyContribution
    const periods = fondPortfolio.contributionPeriods ?? []
    if (periods.length > 0) {
      const activePeriod = periods.find(p => {
        const from = p.fromDate ? p.fromDate.slice(0, 7) : '0000-00'
        const to = p.toDate ? p.toDate.slice(0, 7) : '9999-99'
        return nowISO.slice(0, 7) >= from && nowISO.slice(0, 7) <= to
      })
      return activePeriod?.amount ?? fondPortfolio.monthlyDeposit ?? existing.fondMonthlyContribution
    }
    return fondPortfolio.monthlyDeposit ?? existing.fondMonthlyContribution
  })()

  return {
    enabled: true,
    accounts,
    // Sett til 0 når partner ikke har BSU (fall ikke tilbake på existing — kan inneholde brukerens egen BSU)
    bsu: bsuAcc ? Math.round(computeEffectiveBalance(bsuAcc, now)) : 0,
    bsuMonthlyContribution: bsuAcc?.monthlyContribution ?? 0,
    annualIncome: profile ? (profile.baseMonthly ?? 0) * 12 : existing.annualIncome,
    debts: activeDebts,
    ...(fondHoldings ? { fondHoldings } : {}),
    ...(syncedFondValue != null ? { fondCurrentValue: syncedFondValue } : {}),
    ...(fondMonthlyContribution != null ? { fondMonthlyContribution } : {}),
  }
}
