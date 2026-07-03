import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  ScenarioInput,
  LoanAnalysis,
  AmortizationPlan,
  DistributionPlan,
  AppConfig,
} from '@/types'
import type { ScenarioLevers } from '@/types/economy'
import { defaultConfig } from '@/config/default.config'
import { DEFAULT_SCENARIO_LEVERS } from '@/domain/economy/scenarioSimulator'

export type AppView = 'calculator' | 'economy' | 'skattekalkulator' | 'partner' | 'ivf'
export type EconomySubPage = 'dashboard' | 'budget' | 'salary' | 'atf' | 'savings' | 'debt' | 'absence' | 'tax' | 'subscriptions' | 'feriepenger' | 'fond' | 'vacation' | 'settings' | 'veikart' | 'gaver' | 'pension' | 'scenario'

interface AppState {
  config: AppConfig
  scenarios: ScenarioInput[]
  activeScenarioId: string | null
  analyses: Record<string, LoanAnalysis>
  amortizationPlans: Record<string, AmortizationPlan>
  distributionPlans: Record<string, DistributionPlan>
  theme: 'dark' | 'light' | 'system'
  sidebarOpen: boolean
  /** Scenario-sidebaren i boligkalkulatoren: kollapset til smal stripe (desktop) */
  sidebarCollapsed: boolean
  setSidebarCollapsed: (collapsed: boolean) => void
  currentView: AppView
  currentEconomyPage: EconomySubPage
  savingsTab: 'kontoer' | 'fond' | 'måneder' | 'råd'
  prosjektTab: 'behandling' | 'permisjon' | 'innkjøpsliste'

  /** Avviste Pengepuls-chips: chip-id → ISO-dato chipen er skjult til */
  dismissedChips: Record<string, string>
  dismissChip: (id: string) => void

  scenarioLevers: ScenarioLevers
  setScenarioLevers: (levers: ScenarioLevers) => void

  setTheme: (theme: 'dark' | 'light' | 'system') => void
  setSidebarOpen: (open: boolean) => void
  setCurrentView: (view: AppView) => void
  setCurrentEconomyPage: (page: EconomySubPage) => void
  setSavingsTab: (tab: 'kontoer' | 'fond' | 'måneder' | 'råd') => void
  setProsjektTab: (tab: 'behandling' | 'permisjon' | 'innkjøpsliste') => void

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
      prosjektTab: 'behandling',
      scenarioLevers: DEFAULT_SCENARIO_LEVERS,

      dismissedChips: {},
      dismissChip: (id) =>
        set((state) => ({
          dismissedChips: {
            ...state.dismissedChips,
            // Skjul i 7 dager — deretter dukker chipen opp igjen om den fortsatt gjelder
            [id]: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
          },
        })),

      sidebarCollapsed: false,
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

      setTheme: (theme) => set({ theme }),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      setCurrentView: (view) => set({ currentView: view }),
      setCurrentEconomyPage: (page) => set({ currentEconomyPage: page }),
      setSavingsTab: (tab) => set({ savingsTab: tab }),
      setProsjektTab: (tab) => set({ prosjektTab: tab }),
      setScenarioLevers: (levers) => set({ scenarioLevers: levers }),

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
      version: 3,
      migrate: (persisted: unknown, version: number) => {
        const state = persisted as Record<string, unknown>
        if (version < 2 && state.config) {
          // Deep-merge stored config with defaultConfig so new fields get populated
          state.config = {
            ...defaultConfig,
            ...(state.config as object),
          }
        }
        if (version < 3) {
          // Døde/fjernede views og undersider: koble persisted navigasjon
          // over på gyldige mål så ingen lander på blank side.
          const view = state.currentView as string
          if (view === 'veikart') {
            state.currentView = 'economy'
            state.currentEconomyPage = 'veikart'
          } else if (!['calculator', 'economy', 'skattekalkulator', 'partner', 'ivf'].includes(view)) {
            state.currentView = 'economy'
          }
          const pageMap: Record<string, string> = {
            ivf: 'dashboard', partner: 'dashboard', permisjon: 'dashboard',
            formue: 'dashboard', calibration: 'budget', forbruk: 'budget',
          }
          const page = state.currentEconomyPage as string
          if (page in pageMap) state.currentEconomyPage = pageMap[page]
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
        prosjektTab: state.prosjektTab,
        scenarioLevers: state.scenarioLevers,
        dismissedChips: state.dismissedChips,
        sidebarCollapsed: state.sidebarCollapsed,
      }),
    }
  )
)
