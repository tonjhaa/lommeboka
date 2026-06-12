import type { ScenarioInput } from '@/types'
import { useEconomyStore } from './useEconomyStore'
import { computeEffectiveBalance } from '@/domain/economy/savingsCalculator'

/**
 * Henter relevante felt fra EconomyStore til boligkalkulator.
 * Brukes av "Bruk min profil"-knappen i boligkalkulatoren.
 *
 * Henter KUN inntekt, egenkapital og eksisterende gjeld — aldri rente,
 * løpetid eller lånetype (de er brukerens egne valg i scenarioet).
 */

/** Kontotyper som regnes som realiserbar egenkapital ved boligkjøp */
const EQUITY_ACCOUNT_TYPES = new Set(['sparekonto', 'BSU', 'fond', 'buffer'])

function calcBridgeIncome(profile: NonNullable<ReturnType<typeof useEconomyStore.getState>['profile']>): number {
  // Midlertidige tillegg holdes utenfor — de er ikke varig inntekt banken regner med
  return Math.round(
    profile.baseMonthly * 12 +
    profile.fixedAdditions
      .filter((a) => !a.isTemporary && a.amount > 0)
      .reduce((s, a) => s + a.amount * 12, 0)
  )
}

function calcBridgeEquity(): { total: number; accountCount: number; fondValue: number } {
  const { savingsAccounts, fondPortfolio } = useEconomyStore.getState()
  const now = new Date()
  const accounts = savingsAccounts.filter((a) => EQUITY_ACCOUNT_TYPES.has(a.type))
  const accountSum = accounts.reduce((s, a) => s + computeEffectiveBalance(a, now), 0)
  const fondValue = [...(fondPortfolio?.snapshots ?? [])]
    .sort((a, b) => b.date.localeCompare(a.date))[0]?.totalValue ?? 0
  return { total: Math.round(accountSum + fondValue), accountCount: accounts.length, fondValue }
}

export function extractLoanInputFromEconomy(): Partial<ScenarioInput> {
  const state = useEconomyStore.getState()
  const { profile, debts } = state

  if (!profile) return {}

  const grossAnnualIncome = calcBridgeIncome(profile)
  const { total: totalEquity } = calcBridgeEquity()
  const existingDebt = debts.filter(d => d.status !== 'nedbetalt').reduce((s, d) => s + d.currentBalance, 0)

  return {
    household: {
      primaryApplicant: {
        grossIncome: grossAnnualIncome,
        existingDebt,
      },
      adults: 1,
      children: 0,
    },
    // Kun equity er ment å brukes herfra — mottaker skal bevare egne rente-/løpetidsvalg
    loanParameters: {
      equity: totalEquity,
      interestRate: 5.5,
      loanTermYears: 25,
      loanType: 'annuitet',
    },
  }
}

/**
 * Henter tekst som forklarer hvilke felter som ble hentet og fra hvilke kilder.
 */
export function getProfileBridgeSummary(): string[] {
  const state = useEconomyStore.getState()
  const { profile, debts } = state
  const lines: string[] = []

  if (!profile) {
    lines.push('Ingen lønnsprofil registrert i Min Økonomi.')
    return lines
  }

  const grossAnnualIncome = calcBridgeIncome(profile)
  lines.push(
    `Bruttoårslønn: ${grossAnnualIncome.toLocaleString('no-NO')} kr (grunnlønn + faste tillegg, ekskl. midlertidige)`
  )

  const { total: totalEquity, accountCount, fondValue } = calcBridgeEquity()
  if (totalEquity > 0) {
    lines.push(
      `Egenkapital: ${totalEquity.toLocaleString('no-NO')} kr (${accountCount} konto(er)` +
      `${fondValue > 0 ? ` + fond ${fondValue.toLocaleString('no-NO')} kr` : ''})`
    )
  }

  const existingDebt = debts.filter(d => d.status !== 'nedbetalt').reduce((s, d) => s + d.currentBalance, 0)
  if (existingDebt > 0) {
    lines.push(
      `Eksisterende gjeld: ${existingDebt.toLocaleString('no-NO')} kr (${debts.filter(d => d.status !== 'nedbetalt').length} lån)`
    )
  }

  lines.push('Rente, løpetid og lånetype beholdes som du har satt dem.')
  return lines
}
