// ============================================================
// SCENARIO-SIMULATOR — hva-skjer-hvis via eksisterende motorer
// Rene funksjoner. Transformerer input og kjører motorene to ganger.
// ============================================================

import type { SavingsAccount, DebtAccount, NetWorthPoint } from '@/types/economy'
import { beregnSkatt } from './norwegianTaxCalc'

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
export function applyOneTimeEvents(series: NetWorthPoint[], events: { date: string; amount: number }[]): NetWorthPoint[] {
  if (events.length === 0) return series
  return series.map((p) => {
    const ym = `${p.year}-${String(p.month).padStart(2, '0')}`
    const overlay = events
      .filter((e) => e.date.slice(0, 7) <= ym)
      .reduce((s, e) => s + e.amount, 0)
    return overlay !== 0 ? { ...p, total: p.total + overlay } : p
  })
}

/** Legg månedlig sparingDelta på første ikke-BSU sparekonto; syntetiser om ingen finnes. */
export function addSavingsDelta(accounts: SavingsAccount[], deltaPerMonth: number): SavingsAccount[] {
  if (deltaPerMonth === 0) return accounts
  const idx = accounts.findIndex((a) => a.type !== 'BSU')
  if (idx === -1) {
    const synthetic: SavingsAccount = {
      id: 'scenario-savings', type: 'sparekonto', label: 'Scenario-sparing',
      openingBalance: 0, openingDate: new Date().toISOString().split('T')[0],
      monthlyContribution: deltaPerMonth, interestCreditFrequency: 'monthly',
      rateHistory: [{ fromDate: new Date().toISOString().split('T')[0], rate: 0 }],
      balanceHistory: [], withdrawals: [], contributions: [],
    }
    return [...accounts, synthetic]
  }
  return accounts.map((a, i) => i === idx ? { ...a, monthlyContribution: a.monthlyContribution + deltaPerMonth } : a)
}
