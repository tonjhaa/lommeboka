import type { ScenarioInput } from '@/types'
import type { FondPortfolio } from '@/types/economy'
import { useEconomyStore } from './useEconomyStore'
import { computeEffectiveBalance } from '@/domain/economy/savingsCalculator'
import { fondValueAt } from '@/domain/economy/netWorthCalculator'
import { projectIncomeToYear, projectEquityToYear, projectDebtToYear, projectPartnerToYear } from '@/domain/economy/bridgeProjection'
import { LONNSVEKST_DEFAULT } from '@/config/economy.config'

const EMPTY_FOND: FondPortfolio = { monthlyDeposit: 0, startDate: '', funds: [], snapshots: [] }

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

/** Felles projeksjon for både felt-utfylling og summary — ett kall, ingen duplikat-divergens. */
interface BridgeProjection {
  year: number; isFuture: boolean
  grossAnnualIncome: number; totalEquity: number; existingDebt: number
  accountCount: number; fondValue: number; debtCount: number
}

function buildBridgeProjection(targetYear?: number): BridgeProjection | null {
  const { profile, savingsAccounts, fondPortfolio, debts } = useEconomyStore.getState()
  if (!profile) return null

  const now = new Date()
  const nowYear = now.getFullYear()
  const nowMonth = now.getMonth() + 1
  const year = targetYear ?? nowYear
  const nowObj = { year: nowYear, month: nowMonth }
  // targetMonth = nowMonth: projiser N HELE år fram (kjøp antas i samme måned som nå, i målåret).
  const fond = fondPortfolio ?? EMPTY_FOND

  const grossAnnualIncome = projectIncomeToYear(calcBridgeIncome(profile), nowYear, year, LONNSVEKST_DEFAULT)
  // EK: equity-kontoer (inkl. 'fond'-type savings) + fondPortfolio separat — samme semantikk som calcBridgeEquity
  const equityAccounts = (savingsAccounts ?? []).filter((a) => EQUITY_ACCOUNT_TYPES.has(a.type))
  const totalEquity = projectEquityToYear(equityAccounts, fond, year, nowMonth, nowObj)
  const fondValue = Math.round(fondValueAt(fond, year, nowMonth, nowObj))
  const activeDebts = debts.filter(d => d.status !== 'nedbetalt')
  const existingDebt = projectDebtToYear(activeDebts, year, nowMonth, nowObj)

  return {
    year, isFuture: year > nowYear, grossAnnualIncome, totalEquity, existingDebt,
    accountCount: equityAccounts.length, fondValue, debtCount: activeDebts.length,
  }
}

export function extractLoanInputFromEconomy(targetYear?: number): Partial<ScenarioInput> {
  const p = buildBridgeProjection(targetYear)
  if (!p) return {}
  return {
    household: {
      primaryApplicant: { grossIncome: p.grossAnnualIncome, existingDebt: p.existingDebt },
      adults: 1,
      children: 0,
    },
    // Kun equity er ment å brukes herfra — mottaker skal bevare egne rente-/løpetidsvalg
    loanParameters: { equity: p.totalEquity, interestRate: 5.5, loanTermYears: 25, loanType: 'annuitet' },
  }
}

/**
 * Henter tekst som forklarer hvilke felter som ble hentet og fra hvilke kilder.
 * targetYear: fremtidig kjøpsår — tekst nevner «anslag for {år}» når fremtidig.
 */
export function getProfileBridgeSummary(targetYear?: number): string[] {
  const p = buildBridgeProjection(targetYear)
  if (!p) return ['Ingen lønnsprofil registrert i Min Økonomi.']

  const anslagSuffix = p.isFuture ? ` (anslag for ${p.year})` : ''
  const lines: string[] = [
    `Bruttoårslønn: ${p.grossAnnualIncome.toLocaleString('no-NO')} kr (grunnlønn + faste tillegg, ekskl. midlertidige)${anslagSuffix}`,
  ]
  if (p.totalEquity > 0) {
    const fondPart = p.fondValue > 0 ? ` + fond ${p.fondValue.toLocaleString('no-NO')} kr` : ''
    lines.push(`Egenkapital: ${p.totalEquity.toLocaleString('no-NO')} kr (${p.accountCount} konto(er)${fondPart})${anslagSuffix}`)
  }
  if (p.existingDebt > 0) {
    lines.push(`Eksisterende gjeld: ${p.existingDebt.toLocaleString('no-NO')} kr (${p.debtCount} lån)${anslagSuffix}`)
  }
  lines.push('Rente, løpetid og lånetype beholdes som du har satt dem.')
  return lines
}

/** Gjeldende Lommeboka-verdier — brukes av ferskhets-indikatoren i kalkulatoren. */
export function getCurrentBridgeValues(): { grossIncome: number; equity: number; existingDebt: number } | null {
  const { profile, debts } = useEconomyStore.getState()
  if (!profile) return null
  return {
    grossIncome: calcBridgeIncome(profile),
    equity: calcBridgeEquity().total,
    existingDebt: debts.filter(d => d.status !== 'nedbetalt').reduce((s, d) => s + d.currentBalance, 0),
  }
}

/**
 * Henter medsøker-tall fra Partner-dataene (partnerVeikart — samme kilde som
 * Sparing-månedsoversikten og Veikart bruker).
 * targetYear: fremtidig kjøpsår — projiserer inntekt/EK/gjeld; summary nevner året.
 */
export function extractCoApplicantFromPartner(targetYear?: number): {
  grossIncome: number
  existingDebt: number
  label: string
  equityContribution: number
  summary: string[]
} | null {
  const { partnerVeikart } = useEconomyStore.getState()
  if (!partnerVeikart?.enabled) return null

  const now = new Date()
  const nowYear = now.getFullYear()
  const nowMonth = now.getMonth() + 1
  const year = targetYear ?? nowYear
  const nowObj = { year: nowYear, month: nowMonth }
  const isFuture = year > nowYear
  const anslagSuffix = isFuture ? ` (anslag for ${year})` : ''

  const projected = projectPartnerToYear(partnerVeikart, year, nowMonth, nowObj, LONNSVEKST_DEFAULT)
  if (!projected) return null

  const grossIncome = projected.grossIncome
  const existingDebt = projected.debt
  const equityContribution = projected.equity
  const label = partnerVeikart.partnerName || 'Partner'

  const summary = [
    `${label}: bruttoårslønn ${grossIncome.toLocaleString('no-NO')} kr (fra Partner-fanen)${anslagSuffix}`,
    `${label}: egenkapital ${equityContribution.toLocaleString('no-NO')} kr (kontoer + BSU + fond)${anslagSuffix}`,
  ]
  if (existingDebt > 0) {
    summary.push(`${label}: eksisterende gjeld ${existingDebt.toLocaleString('no-NO')} kr${anslagSuffix}`)
  }

  return { grossIncome, existingDebt, label, equityContribution, summary }
}
