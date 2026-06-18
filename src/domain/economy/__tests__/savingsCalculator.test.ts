import { describe, it, expect } from 'vitest'
import { checkBSULimits, calculateGoalProgress, projectSavingsGrowth } from '../savingsCalculator'
import type { SavingsAccount, SavingsGoal } from '@/types/economy'

function makeBSUAccount(overrides: Partial<SavingsAccount> = {}): SavingsAccount {
  return {
    id: 'bsu-1',
    type: 'BSU',
    label: 'BSU',
    openingBalance: 100_000,
    openingDate: '2025-01-01',
    monthlyContribution: 2_291,
    interestCreditFrequency: 'yearly',
    rateHistory: [{ fromDate: '2025-01-01', rate: 5.5 }],
    balanceHistory: [],
    withdrawals: [],
    contributions: [],
    maxYearlyContribution: 27_500,
    maxTotalBalance: 300_000,
    ...overrides,
  }
}

describe('checkBSULimits', () => {
  it('er ikke maxed under 300 000', () => {
    const account = makeBSUAccount({ openingBalance: 100_000 })
    const status = checkBSULimits(account, 2026)
    expect(status.isMaxed).toBe(false)
    expect(status.currentBalance).toBe(100_000)
  })

  it('er maxed ved 300 000', () => {
    const account = makeBSUAccount({
      openingBalance: 300_000,
      balanceHistory: [{ year: 2026, month: 1, balance: 300_000, isManual: false }],
    })
    const status = checkBSULimits(account, 2026)
    expect(status.isMaxed).toBe(true)
    expect(status.warning).toBeDefined()
  })

  it('total rom = 300 000 - saldo', () => {
    const account = makeBSUAccount({ openingBalance: 200_000 })
    const status = checkBSULimits(account, 2026)
    expect(status.totalRemainingRoom).toBe(100_000)
  })

  it('returnerer advarsel når nærmer seg tak', () => {
    const account = makeBSUAccount({
      openingBalance: 295_000,
      balanceHistory: [{ year: 2026, month: 1, balance: 295_000, isManual: false }],
    })
    const status = checkBSULimits(account, 2026)
    expect(status.warning).toBeDefined()
  })
})

describe('calculateGoalProgress', () => {
  const account = makeBSUAccount({ openingBalance: 100_000 })

  it('beregner korrekt prosent', () => {
    const goal: SavingsGoal = {
      id: 'g1',
      label: 'Egenkapital',
      icon: '🏠',
      targetAmount: 200_000,
      linkedAccountIds: ['bsu-1'],
    }
    const progress = calculateGoalProgress(goal, [account])
    expect(progress.currentTotal).toBe(100_000)
    expect(progress.percent).toBe(50)
  })

  it('returnerer 100% når mål er nådd', () => {
    const goal: SavingsGoal = {
      id: 'g1',
      label: 'Mål',
      icon: '✅',
      targetAmount: 50_000,
      linkedAccountIds: ['bsu-1'],
    }
    const progress = calculateGoalProgress(goal, [account])
    expect(progress.percent).toBe(100)
    expect(progress.monthsRemaining).toBe(0)
  })

  it('ignorerer kontoer som ikke er koblet', () => {
    const goal: SavingsGoal = {
      id: 'g1',
      label: 'Mål',
      icon: '💰',
      targetAmount: 300_000,
      linkedAccountIds: ['other-account'],
    }
    const progress = calculateGoalProgress(goal, [account])
    expect(progress.currentTotal).toBe(0)
  })
})

import { getEffectiveRateFromTiers, getEffectiveRate, getActiveTiersForDate } from '../savingsCalculator'
import type { TieredRate, TieredRateHistoryEntry } from '@/types/economy'

describe('getActiveTiersForDate', () => {
  const history: TieredRateHistoryEntry[] = [
    { fromDate: '2025-01-01', tiers: [{ fromBalance: 0, rate: 3.0 }, { fromBalance: 150_000, rate: 3.5 }] },
    { fromDate: '2026-01-01', tiers: [{ fromBalance: 0, rate: 3.4 }, { fromBalance: 100_000, rate: 3.7 }, { fromBalance: 500_000, rate: 4.35 }] },
    { fromDate: '2026-08-01', tiers: [{ fromBalance: 0, rate: 3.5 }, { fromBalance: 150_000, rate: 3.8 }] },
  ]

  it('returnerer riktig struktur for en dato i fortiden', () => {
    const tiers = getActiveTiersForDate(history, '2025-06-15')
    expect(tiers).toEqual([{ fromBalance: 0, rate: 3.0 }, { fromBalance: 150_000, rate: 3.5 }])
  })

  it('returnerer nyeste struktur for en dato etter siste innslag', () => {
    const tiers = getActiveTiersForDate(history, '2026-03-01')
    expect(tiers).toEqual([
      { fromBalance: 0, rate: 3.4 },
      { fromBalance: 100_000, rate: 3.7 },
      { fromBalance: 500_000, rate: 4.35 },
    ])
  })

  it('fremtidige innslag brukes ikke', () => {
    const tiers = getActiveTiersForDate(history, '2026-07-31')
    expect(tiers).toEqual([
      { fromBalance: 0, rate: 3.4 },
      { fromBalance: 100_000, rate: 3.7 },
      { fromBalance: 500_000, rate: 4.35 },
    ])
  })

  it('returnerer undefined for tom historikk', () => {
    expect(getActiveTiersForDate([], '2026-01-01')).toBeUndefined()
  })

  it('returnerer undefined når alle innslag er fremtidige', () => {
    const future: TieredRateHistoryEntry[] = [
      { fromDate: '2099-01-01', tiers: [{ fromBalance: 0, rate: 5.0 }] },
    ]
    expect(getActiveTiersForDate(future, '2026-01-01')).toBeUndefined()
  })

  it('bruker eksakt match på fromDate', () => {
    const tiers = getActiveTiersForDate(history, '2026-01-01')
    expect(tiers?.[0].rate).toBe(3.4)
  })
})

describe('getEffectiveRateFromTiers', () => {
  const tiers: TieredRate[] = [
    { fromBalance: 0,         rate: 3.25 },
    { fromBalance: 100_000,   rate: 3.55 },
    { fromBalance: 500_000,   rate: 3.80 },
    { fromBalance: 1_000_000, rate: 4.05 },
  ]

  it('bruker første trinn for saldo 0', () => {
    expect(getEffectiveRateFromTiers(tiers, 0)).toBe(3.25)
  })

  it('bruker riktig trinn for saldo 50 000', () => {
    expect(getEffectiveRateFromTiers(tiers, 50_000)).toBe(3.25)
  })

  it('bruker neste trinn ved eksakt terskel 100 000', () => {
    expect(getEffectiveRateFromTiers(tiers, 100_000)).toBe(3.55)
  })

  it('bruker riktig trinn for saldo 450 000', () => {
    expect(getEffectiveRateFromTiers(tiers, 450_000)).toBe(3.55)
  })

  it('bruker øverste trinn for saldo over 1M', () => {
    expect(getEffectiveRateFromTiers(tiers, 1_500_000)).toBe(4.05)
  })

  it('håndterer enkelt trinn (flat rente)', () => {
    expect(getEffectiveRateFromTiers([{ fromBalance: 0, rate: 4.10 }], 999_999)).toBe(4.10)
  })
})

describe('getEffectiveRate', () => {
  it('faller tilbake på rateHistory når tieredRateHistory mangler', () => {
    const acc = makeBSUAccount({
      rateHistory: [{ fromDate: '2025-01-01', rate: 6.3 }],
    })
    expect(getEffectiveRate(acc, 50_000)).toBe(6.3)
  })

  it('bruker tieredRateHistory når tilstede', () => {
    const acc = makeBSUAccount({
      rateHistory: [{ fromDate: '2025-01-01', rate: 6.3 }],
      tieredRateHistory: [
        {
          fromDate: '2025-01-01',
          tiers: [
            { fromBalance: 0,       rate: 3.25 },
            { fromBalance: 100_000, rate: 3.55 },
          ],
        },
      ],
    })
    expect(getEffectiveRate(acc, 150_000)).toBe(3.55)
  })

  it('faller tilbake på tieredRates (gammel data) hvis tieredRateHistory mangler', () => {
    const acc = makeBSUAccount({
      rateHistory: [{ fromDate: '2025-01-01', rate: 6.3 }],
      tieredRates: [
        { fromBalance: 0,       rate: 3.25 },
        { fromBalance: 100_000, rate: 3.55 },
      ],
    })
    expect(getEffectiveRate(acc, 150_000)).toBe(3.55)
  })
})

describe('projectSavingsGrowth — BSU rente krediteres yearly', () => {
  it('krediterer rente i desember, ikke månedlig', () => {
    const account = makeBSUAccount({
      openingBalance: 100_000,
      monthlyContribution: 0,
      rateHistory: [{ fromDate: '2025-01-01', rate: 5.5 }],
    })

    // Kjør jan–des 2025
    const projections = projectSavingsGrowth(account, { year: 2025, month: 12 })

    // Saldo i november (mnd 11) skal være lik åpningsbalanse (rente ennå ikke kreditert)
    const novemberBalance = projections[10] // 0-basert, mnd 11 = index 10
    const desemberBalance = projections[11]

    // Desember skal være høyere (rente kreditert)
    expect(desemberBalance).toBeGreaterThan(novemberBalance)

    // Saldo januar–november skal vokse bare med innskudd (0 her) — dvs. være ca. lik åpning
    // Men i praksis akkumulerer vi renteberegning inne. Sjekk at november == åpning (ingen innskudd, rente ikke kreditert ennå)
    expect(novemberBalance).toBe(100_000)
  })
})
