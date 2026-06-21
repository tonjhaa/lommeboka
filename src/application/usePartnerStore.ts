import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { EconomyState } from './useEconomyStore'
import { DEFAULT_CALIBRATION_SETTINGS } from './useEconomyStore'
import type {
  EmploymentProfile,
  BudgetTemplate,
  MonthRecord,
  SavingsAccount,
  SavingsGoal,
  DebtAccount,
  AbsenceRecord,
  AbsenceEvent,
  TaxSettlementRecord,
  BalanceHistoryEntry,
  WithdrawalEntry,
  SavingsContribution,
  RateHistoryEntry,
  DebtRateHistory,
  BudgetLine,
  TemporaryPayEntry,
  LonnsoppgjorRecord,
  UserPreferences,
  IVFSettings,
  FondPortfolio,
  ParsetLonnsslipp,
  PartnerVeikart,
} from '@/types/economy'
import { POLICY_RATE_HISTORY } from '@/config/economy.config'

const DEFAULT_TEMPLATE: BudgetTemplate = {
  lines: [],
  lastUpdated: new Date().toISOString().split('T')[0],
}

const DEFAULT_IVF_SETTINGS: IVFSettings = {
  lonPerson1: 0,
  lonPerson2: 0,
  studielaanPerson1: 0,
  studielaanPerson2: 0,
  annenEgenkapital: 0,
}

const DEFAULT_FOND_PORTFOLIO: FondPortfolio = {
  monthlyDeposit: 0,
  startDate: '',
  funds: [],
  snapshots: [],
}

const STUB_PARTNER_VEIKART: PartnerVeikart = {
  enabled: false,
  annualIncome: 0,
  annualNetIncome: 0,
  equity: 0,
  bsu: 0,
  bsuMonthlyContribution: 0,
  monthlySavings: 0,
  accounts: [],
}

// ── Partner store — implements the same EconomyState interface ──────────────
// Fields not relevant to partner (ATF, IVF, abonnementer, forsikringer, fond)
// return empty stubs. All salary/budget/savings/debt/absence/tax fields are
// fully implemented with their own persisted state.

export const usePartnerStore = create<EconomyState>()(
  persist(
    (set, get) => ({
      storeVersion: 1,
      slipParserVersion: 1,
      setSlipParserVersion: (v: number) => set({ slipParserVersion: v }),

      // ── Profil ─────────────────────────────────────────────────────────────
      profile: null,
      setProfile: (profile: EmploymentProfile) => set({ profile }),

      // ── Budsjett ───────────────────────────────────────────────────────────
      budgetTemplate: DEFAULT_TEMPLATE,
      budgetOverrides: {},
      monthHistory: [] as MonthRecord[],

      addMonthRecord: (record: MonthRecord) =>
        set((s) => {
          const filtered = s.monthHistory.filter(
            (m) => !(m.year === record.year && m.month === record.month)
          )
          return { monthHistory: [...filtered, record] }
        }),

      updateMonthRecord: (year: number, month: number, updates: Partial<MonthRecord>) =>
        set((s) => ({
          monthHistory: s.monthHistory.map((m) =>
            m.year === year && m.month === month ? { ...m, ...updates } : m
          ),
        })),

      lockMonth: (year: number, month: number) =>
        set((s) => ({
          monthHistory: s.monthHistory.map((m) =>
            m.year === year && m.month === month ? { ...m, isLocked: true } : m
          ),
        })),

      unlockMonth: (year: number, month: number) =>
        set((s) => ({
          monthHistory: s.monthHistory.filter(
            (m) => !(m.year === year && m.month === month)
          ),
        })),

      importSlip: (_slip: ParsetLonnsslipp, _pdfBase64?: string) => {
        // Partner slip parser TBD — noop for now
      },

      updateBudgetTemplate: (template) =>
        set((s) => ({
          budgetTemplate: {
            ...s.budgetTemplate,
            ...template,
            lastUpdated: new Date().toISOString().split('T')[0],
          },
        })),

      addBudgetLine: (line: BudgetLine) =>
        set((s) => ({
          budgetTemplate: {
            ...s.budgetTemplate,
            lines: [...s.budgetTemplate.lines, line],
            lastUpdated: new Date().toISOString().split('T')[0],
          },
        })),

      updateBudgetLine: (id: string, updates: Partial<BudgetLine>) =>
        set((s) => ({
          budgetTemplate: {
            ...s.budgetTemplate,
            lines: s.budgetTemplate.lines.map((l) => l.id === id ? { ...l, ...updates } : l),
            lastUpdated: new Date().toISOString().split('T')[0],
          },
        })),

      removeBudgetLine: (id: string) =>
        set((s) => ({
          budgetTemplate: {
            ...s.budgetTemplate,
            lines: s.budgetTemplate.lines.filter((l) => l.id !== id),
            lastUpdated: new Date().toISOString().split('T')[0],
          },
        })),

      setBudgetOverride: (year: number, month: number, rowId: string, value: number) =>
        set((s) => ({ budgetOverrides: { ...s.budgetOverrides, [`${year}:${month}:${rowId}`]: value } })),

      clearBudgetOverride: (year: number, month: number, rowId: string) =>
        set((s) => {
          const next = { ...s.budgetOverrides }
          delete next[`${year}:${month}:${rowId}`]
          return { budgetOverrides: next }
        }),

      _budgetUndoStack: [],
      undoBudget: () => {},

      // ── ATF — stubs ────────────────────────────────────────────────────────
      atfEntries: [],
      addATFEntry: () => {},
      updateATFEntry: () => {},
      removeATFEntry: () => {},

      // ── Sparing ────────────────────────────────────────────────────────────
      savingsAccounts: [] as SavingsAccount[],
      savingsGoals: [] as SavingsGoal[],
      savingsPlanTarget: 0,
      savingsPlanHorizon: 48,
      savingsOverrides: {},

      setSavingsPlanTarget: (price: number) => set({ savingsPlanTarget: price }),
      setSavingsPlanHorizon: (months: number) => set({ savingsPlanHorizon: months }),

      addSavingsAccount: (account: SavingsAccount) =>
        set((s) => ({ savingsAccounts: [...s.savingsAccounts, account] })),

      importSavingsStatement: () => {
        // Same implementation available if needed; stub for now
      },

      updateSavingsAccount: (id: string, updates: Partial<SavingsAccount>) =>
        set((s) => ({
          savingsAccounts: s.savingsAccounts.map((a) =>
            a.id === id ? { ...a, ...updates } : a
          ),
        })),

      updateSavingsBalance: (accountId: string, entry: BalanceHistoryEntry) =>
        set((s) => ({
          savingsAccounts: s.savingsAccounts.map((a) => {
            if (a.id !== accountId) return a
            const history = a.balanceHistory.filter(
              (b) => !(b.year === entry.year && b.month === entry.month)
            )
            return { ...a, balanceHistory: [...history, entry] }
          }),
        })),

      addWithdrawal: (accountId: string, withdrawal: WithdrawalEntry) =>
        set((s) => ({
          savingsAccounts: s.savingsAccounts.map((a) =>
            a.id === accountId
              ? { ...a, withdrawals: [...(a.withdrawals ?? []), withdrawal] }
              : a
          ),
        })),

      removeWithdrawal: (accountId: string, withdrawalId: string) =>
        set((s) => ({
          savingsAccounts: s.savingsAccounts.map((a) =>
            a.id === accountId
              ? { ...a, withdrawals: (a.withdrawals ?? []).filter((w) => w.id !== withdrawalId) }
              : a
          ),
        })),

      addContribution: (accountId: string, contribution: SavingsContribution) =>
        set((s) => ({
          savingsAccounts: s.savingsAccounts.map((a) =>
            a.id === accountId
              ? { ...a, contributions: [...(a.contributions ?? []), contribution] }
              : a
          ),
        })),

      removeContribution: (accountId: string, contributionId: string) =>
        set((s) => ({
          savingsAccounts: s.savingsAccounts.map((a) =>
            a.id === accountId
              ? { ...a, contributions: (a.contributions ?? []).filter((c) => c.id !== contributionId) }
              : a
          ),
        })),

      updateSavingsRate: (accountId: string, entry: RateHistoryEntry) =>
        set((s) => ({
          savingsAccounts: s.savingsAccounts.map((a) => {
            if (a.id !== accountId) return a
            const history = a.rateHistory.filter((r) => r.fromDate !== entry.fromDate)
            return { ...a, rateHistory: [...history, entry] }
          }),
        })),

      removeSavingsAccount: (id: string) =>
        set((s) => ({ savingsAccounts: s.savingsAccounts.filter((a) => a.id !== id) })),

      addSavingsGoal: (goal: SavingsGoal) =>
        set((s) => ({ savingsGoals: [...s.savingsGoals, goal] })),

      updateSavingsGoal: (id: string, updates: Partial<SavingsGoal>) =>
        set((s) => ({
          savingsGoals: s.savingsGoals.map((g) => (g.id === id ? { ...g, ...updates } : g)),
        })),

      removeSavingsGoal: (id: string) =>
        set((s) => ({ savingsGoals: s.savingsGoals.filter((g) => g.id !== id) })),

      setSavingsOverride: (key: string, value: number | null) =>
        set((s) => {
          if (value === null) {
            const next = { ...s.savingsOverrides }
            delete next[key]
            return { savingsOverrides: next }
          }
          return { savingsOverrides: { ...s.savingsOverrides, [key]: value } }
        }),

      clearAllSavingsOverrides: () => set({ savingsOverrides: {} }),

      // ── Gjeld ──────────────────────────────────────────────────────────────
      debts: [] as DebtAccount[],

      addDebt: (debt: DebtAccount) =>
        set((s) => ({ debts: [...s.debts, debt] })),

      updateDebt: (id: string, updates: Partial<DebtAccount>) =>
        set((s) => ({
          debts: s.debts.map((d) => (d.id === id ? { ...d, ...updates } : d)),
        })),

      updateDebtRate: (debtId: string, entry: DebtRateHistory) =>
        set((s) => ({
          debts: s.debts.map((d) => {
            if (d.id !== debtId) return d
            const history = d.rateHistory.filter((r) => r.fromDate !== entry.fromDate)
            return { ...d, rateHistory: [...history, entry] }
          }),
        })),

      removeDebt: (id: string) =>
        set((s) => ({ debts: s.debts.filter((d) => d.id !== id) })),

      markDebtPaid: (id: string, date: string) =>
        set((s) => ({
          debts: s.debts.map((d) =>
            d.id === id ? { ...d, status: 'nedbetalt' as const, paidOffDate: date } : d
          ),
        })),

      // ── Fravær ─────────────────────────────────────────────────────────────
      absenceRecords: [] as AbsenceRecord[],
      absenceEvents: [] as AbsenceEvent[],
      absenceHireDate: null as string | null,

      addAbsenceRecord: (record: AbsenceRecord) =>
        set((s) => {
          const filtered = s.absenceRecords.filter((r) => r.period !== record.period)
          return { absenceRecords: [...filtered, record] }
        }),

      updateAbsenceRecord: (period: string, updates: Partial<AbsenceRecord>) =>
        set((s) => ({
          absenceRecords: s.absenceRecords.map((r) =>
            r.period === period ? { ...r, ...updates } : r
          ),
        })),

      removeAbsenceRecord: (period: string) =>
        set((s) => ({ absenceRecords: s.absenceRecords.filter((r) => r.period !== period) })),

      addAbsenceEvent: (event: AbsenceEvent) =>
        set((s) => ({
          absenceEvents: [...s.absenceEvents.filter((e) => e.id !== event.id), event],
        })),

      removeAbsenceEvent: (id: string) =>
        set((s) => ({ absenceEvents: s.absenceEvents.filter((e) => e.id !== id) })),

      setAbsenceHireDate: (date: string | null) => set({ absenceHireDate: date }),

      clearAbsenceData: () =>
        set({ absenceRecords: [], absenceEvents: [], absenceHireDate: null }),

      replaceImportedAbsenceEvents: (events: AbsenceEvent[]) =>
        set((s) => ({
          absenceEvents: [
            ...s.absenceEvents.filter((e) => e.source !== 'imported'),
            ...events,
          ],
        })),

      // ── Skatteoppgjør ──────────────────────────────────────────────────────
      taxSettlements: [] as TaxSettlementRecord[],

      addTaxSettlement: (record: TaxSettlementRecord) =>
        set((s) => {
          const filtered = s.taxSettlements.filter((r) => r.year !== record.year)
          return { taxSettlements: [...filtered, record] }
        }),

      updateTaxSettlement: (year: number, updates: Partial<TaxSettlementRecord>) =>
        set((s) => ({
          taxSettlements: s.taxSettlements.map((r) =>
            r.year === year ? { ...r, ...updates } : r
          ),
        })),

      removeTaxSettlement: (year: number) =>
        set((s) => ({ taxSettlements: s.taxSettlements.filter((r) => r.year !== year) })),

      // ── Abonnement/forsikring — stubs ──────────────────────────────────────
      subscriptions: [],
      insurances: [],
      addSubscription: () => {},
      updateSubscription: () => {},
      removeSubscription: () => {},
      addInsurance: () => {},
      updateInsurance: () => {},
      removeInsurance: () => {},

      // ── Styringsrente ──────────────────────────────────────────────────────
      policyRateHistory: POLICY_RATE_HISTORY,

      // ── Lønnsoppgjør ───────────────────────────────────────────────────────
      lonnsoppgjor: [] as LonnsoppgjorRecord[],

      addLonnsoppgjor: (record: LonnsoppgjorRecord) =>
        set((s) => ({
          lonnsoppgjor: [...s.lonnsoppgjor, record].sort((a, b) =>
            a.effectiveDate.localeCompare(b.effectiveDate)
          ),
        })),

      updateLonnsoppgjor: (id: string, updates: Partial<LonnsoppgjorRecord>) =>
        set((s) => ({
          lonnsoppgjor: s.lonnsoppgjor.map((r) => (r.id === id ? { ...r, ...updates } : r)),
        })),

      removeLonnsoppgjor: (id: string) =>
        set((s) => ({ lonnsoppgjor: s.lonnsoppgjor.filter((r) => r.id !== id) })),

      deriveLonnsoppgjorFromSlips: () => {
        // Partner slips not yet imported — noop
      },

      bookEtterbetaling: () => {},
      removeEtterbetalingBooking: () => {},

      // ── Midlertidig lønn ───────────────────────────────────────────────────
      temporaryPayEntries: [] as TemporaryPayEntry[],

      addTemporaryPay: (entry: TemporaryPayEntry) =>
        set((s) => ({ temporaryPayEntries: [...s.temporaryPayEntries, entry] })),

      updateTemporaryPay: (id: string, updates: Partial<TemporaryPayEntry>) =>
        set((s) => ({
          temporaryPayEntries: s.temporaryPayEntries.map((e) =>
            e.id === id ? { ...e, ...updates } : e
          ),
        })),

      removeTemporaryPay: (id: string) =>
        set((s) => ({
          temporaryPayEntries: s.temporaryPayEntries.filter((e) => e.id !== id),
        })),

      // ── IVF — stubs ────────────────────────────────────────────────────────
      ivfTransactions: [],
      ivfSettings: DEFAULT_IVF_SETTINGS,
      addIvfTransaction: () => {},
      updateIvfTransaction: () => {},
      removeIvfTransaction: () => {},
      setIvfSettings: () => {},
      babyShoppingItems: [],
      setBabyShoppingItems: () => {},
      priceAlerts: [],
      lastGlobalPriceCheckAt: 0,
      addPriceAlerts: () => {},
      dismissPriceAlert: () => {},
      setLastGlobalPriceCheckAt: () => {},

      // ── Fond ──────────────────────────────────────────────────────────────
      fondPortfolio: DEFAULT_FOND_PORTFOLIO,
      setFondPortfolio: (p) => set({ fondPortfolio: p }),
      addFondSnapshot: (snapshot) =>
        set((s) => ({
          fondPortfolio: {
            ...s.fondPortfolio,
            snapshots: [
              ...s.fondPortfolio.snapshots.filter((snap) => snap.date !== snapshot.date),
              snapshot,
            ],
          },
        })),
      removeFondSnapshot: (date) =>
        set((s) => ({
          fondPortfolio: {
            ...s.fondPortfolio,
            snapshots: s.fondPortfolio.snapshots.filter((snap) => snap.date !== date),
          },
        })),
      addFondContribution: (c) =>
        set((s) => ({
          fondPortfolio: {
            ...s.fondPortfolio,
            contributions: [...(s.fondPortfolio.contributions ?? []).filter(x => x.id !== c.id), c]
              .sort((a, b) => a.date.localeCompare(b.date)),
          },
        })),
      removeFondContribution: (id) =>
        set((s) => ({
          fondPortfolio: {
            ...s.fondPortfolio,
            contributions: (s.fondPortfolio.contributions ?? []).filter(c => c.id !== id),
          },
        })),

      // ── Partner-veikart — stub (partner doesn't have a sub-partner) ────────
      partnerVeikart: STUB_PARTNER_VEIKART,
      setPartnerVeikart: () => {},
      addPartnerAccount: () => {},
      updatePartnerAccount: () => {},
      removePartnerAccount: () => {},
      addPartnerDebt: () => {},
      updatePartnerDebt: () => {},
      removePartnerDebt: () => {},

      // ── Spareplan ──────────────────────────────────────────────────────────
      // (already declared above in sparing section)

      // ── Bankpresets — stubs ────────────────────────────────────────────────
      bankPresets: [],
      setBankPresets: () => {},
      updateBankPreset: () => {},
      addBankPreset: () => {},
      removeBankPreset: () => {},

      // ── Brukerinnstillinger ────────────────────────────────────────────────
      userPreferences: {
        onboardingCompleted: true,
        enabledTabs: [
          'dashboard', 'budget', 'salary', 'feriepenger',
          'savings', 'debt', 'absence', 'tax',
        ],
      } as UserPreferences,

      setUserPreferences: (prefs: UserPreferences) => set({ userPreferences: prefs }),

      pensionSettings: null,
      setPensionSettings: () => {},

      keyFigureOverrides: [],
      setKeyFigureOverride: () => {},
      removeKeyFigureOverride: () => {},

      calibrationSettings: DEFAULT_CALIBRATION_SETTINGS,
      calibrationLog: [],
      lockedCalibrationKeys: [],
      setCalibrationSettings: () => {},
      lockCalibration: () => {},
      unlockCalibration: () => {},

      // ── Export / import / reset ────────────────────────────────────────────
      exportData: () => JSON.stringify(get(), null, 2),

      importData: (json: string) => {
        try {
          const data = JSON.parse(json)
          set({
            profile: data.profile ?? null,
            budgetTemplate: data.budgetTemplate ?? DEFAULT_TEMPLATE,
            monthHistory: data.monthHistory ?? [],
            savingsAccounts: data.savingsAccounts ?? [],
            savingsGoals: data.savingsGoals ?? [],
            debts: data.debts ?? [],
            absenceRecords: data.absenceRecords ?? [],
            absenceEvents: data.absenceEvents ?? [],
            absenceHireDate: data.absenceHireDate ?? null,
            taxSettlements: data.taxSettlements ?? [],
            budgetOverrides: data.budgetOverrides ?? {},
            savingsOverrides: data.savingsOverrides ?? {},
            lonnsoppgjor: data.lonnsoppgjor ?? [],
            temporaryPayEntries: data.temporaryPayEntries ?? [],
            userPreferences: data.userPreferences ?? null,
            fondPortfolio: data.fondPortfolio ?? DEFAULT_FOND_PORTFOLIO,
          })
        } catch {
          console.error('[PartnerStore] importData: ugyldig JSON')
        }
      },

      clearAllSlips: () =>
        set((s) => ({
          monthHistory: s.monthHistory.filter((m) => m.source !== 'imported_slip'),
        })),

      resetAll: () =>
        set({
          profile: null,
          budgetTemplate: DEFAULT_TEMPLATE,
          monthHistory: [],
          savingsAccounts: [],
          savingsGoals: [],
          debts: [],
          absenceRecords: [],
          absenceEvents: [],
          absenceHireDate: null,
          taxSettlements: [],
          subscriptions: [],
          insurances: [],
          lonnsoppgjor: [],
          temporaryPayEntries: [],
          budgetOverrides: {},
          savingsOverrides: {},
          userPreferences: null,
        }),

      restoreProfileFromSlips: () => {
        // noop — partner profile is set manually
      },
    }),
    {
      name: 'lommeboka-partner-v1',
      version: 1,
    }
  )
)
