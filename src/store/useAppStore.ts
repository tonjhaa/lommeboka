import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  ScenarioInput,
  LoanAnalysis,
  AmortizationPlan,
  DistributionPlan,
  AppConfig,
} from '@/types'
import { defaultConfig } from '@/config/default.config'

export type AppView = 'calculator' | 'comparison' | 'settings' | 'economy' | 'skattekalkulator' | 'veikart' | 'partner'
export type EconomySubPage = 'dashboard' | 'budget' | 'salary' | 'atf' | 'savings' | 'debt' | 'absence' | 'tax' | 'subscriptions' | 'feriepenger' | 'fond' | 'ivf' | 'vacation' | 'settings' | 'veikart' | 'gaver' | 'partner'

interface AppState {
  config: AppConfig
  scenarios: ScenarioInput[]
  activeScenarioId: string | null
  analyses: Record<string, LoanAnalysis>
  amortizationPlans: Record<string, AmortizationPlan>
  distributionPlans: Record<string, DistributionPlan>
  theme: 'dark' | 'light' | 'system'
  sidebarOpen: boolean
  currentView: AppView
  currentEconomyPage: EconomySubPage
  savingsTab: 'kontoer' | 'fond' | 'måneder' | 'råd'

  setTheme: (theme: 'dark' | 'light' | 'system') => void
  setSidebarOpen: (open: boolean) => void
  setCurrentView: (view: AppView) => void
  setCurrentEconomyPage: (page: EconomySubPage) => void
  setSavingsTab: (tab: 'kontoer' | 'fond' | 'måneder' | 'råd') => void

  addScenario: (scenario: ScenarioInput) => void
  updateScenario: (id: string, updates: Partial<ScenarioInput>) => void
  removeScenario: (id: string) => void
  setActiveScenario: (id: string | null) => void
  duplicateScenario: (id: string) => void

  setAnalysis: (scenarioId: string, analysis: LoanAnalysis) => void
  setAmortizationPlan: (scenarioId: string, plan: AmortizationPlan) => void
  setDistributionPlan: (scenarioId: string, plan: DistributionPlan) => void

  updateConfig: (updates: Partial<AppConfig>) => void
  resetConfig: () => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      config: defaultConfig,
      scenarios: [],
      activeScenarioId: null,
      analyses: {},
      amortizationPlans: {},
      distributionPlans: {},
      theme: defaultConfig.ui.defaultTheme,
      sidebarOpen: true,
      currentView: 'economy',
      currentEconomyPage: 'dashboard',
      savingsTab: 'kontoer',

      setTheme: (theme) => set({ theme }),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      setCurrentView: (view) => set({ currentView: view }),
      setCurrentEconomyPage: (page) => set({ currentEconomyPage: page }),
      setSavingsTab: (tab) => set({ savingsTab: tab }),

      addScenario: (scenario) =>
        set((state) => ({
          scenarios: [...state.scenarios, scenario],
          activeScenarioId: scenario.id,
        })),

      updateScenario: (id, updates) =>
        set((state) => ({
          scenarios: state.scenarios.map((s) =>
            s.id === id ? { ...s, ...updates } : s
          ),
        })),

      removeScenario: (id) =>
        set((state) => {
          const remaining = state.scenarios.filter((s) => s.id !== id)
          const { [id]: _a, ...analyses } = state.analyses
          const { [id]: _b, ...amortizationPlans } = state.amortizationPlans
          const { [id]: _c, ...distributionPlans } = state.distributionPlans
          return {
            scenarios: remaining,
            activeScenarioId:
              state.activeScenarioId === id
                ? (remaining[0]?.id ?? null)
                : state.activeScenarioId,
            analyses,
            amortizationPlans,
            distributionPlans,
          }
        }),

      setActiveScenario: (id) => set({ activeScenarioId: id }),

      duplicateScenario: (id) => {
        const original = get().scenarios.find((s) => s.id === id)
        if (!original) return
        const duplicate: ScenarioInput = {
          ...original,
          id: crypto.randomUUID(),
          label: `${original.label} (kopi)`,
          createdAt: Date.now(),
          isBase: false,
        }
        set((state) => ({
          scenarios: [...state.scenarios, duplicate],
          activeScenarioId: duplicate.id,
        }))
      },

      setAnalysis: (scenarioId, analysis) =>
        set((state) => ({
          analyses: { ...state.analyses, [scenarioId]: analysis },
        })),

      setAmortizationPlan: (scenarioId, plan) =>
        set((state) => ({
          amortizationPlans: { ...state.amortizationPlans, [scenarioId]: plan },
        })),

      setDistributionPlan: (scenarioId, plan) =>
        set((state) => ({
          distributionPlans: { ...state.distributionPlans, [scenarioId]: plan },
        })),

      updateConfig: (updates) =>
        set((state) => ({
          config: { ...state.config, ...updates },
        })),

      resetConfig: () => set({ config: defaultConfig }),
    }),
    {
      name: 'boligkalkulator-storage',
      version: 2,
      migrate: (persisted: unknown, version: number) => {
        const state = persisted as Record<string, unknown>
        if (version < 2 && state.config) {
          // Deep-merge stored config with defaultConfig so new fields get populated
          state.config = {
            ...defaultConfig,
            ...(state.config as object),
            tax: {
              ...defaultConfig.tax,
              ...((state.config as Record<string, unknown>).tax as object | undefined),
            },
          }
        }
        return state
      },
      partialize: (state) => ({
        scenarios: state.scenarios,
        activeScenarioId: state.activeScenarioId,
        theme: state.theme,
        config: state.config,
        currentView: state.currentView,
        currentEconomyPage: state.currentEconomyPage,
        savingsTab: state.savingsTab,
      }),
    }
  )
)
