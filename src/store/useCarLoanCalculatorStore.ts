// src/store/useCarLoanCalculatorStore.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  defaultCarLoanInputs,
  type CarLoanInputs,
  type CostItem,
  type FuelEconomyOverrides,
  type SharingMode,
} from '@/utils/carLoanCalculator'
import type { CostKey } from '@/config/carCost.config'
import type { TollInputs } from '@/domain/toll/tollEstimator'

interface CarLoanCalculatorState {
  inputs: CarLoanInputs
  /** Har brukeren selv skrevet inn "disponibelt til bil"? Hvis true, slutter
   *  useCarLoanCalculator å overstyre feltet med budsjett-forslaget. */
  availableMonthlyBudgetIsManual: boolean
  /** Frosset oppsett for A/B-sammenligning (null = ingen sammenligning aktiv) */
  comparisonSnapshot: { label: string; inputs: CarLoanInputs } | null
  setComparisonSnapshot: (snapshot: { label: string; inputs: CarLoanInputs } | null) => void
  setInputs: (patch: Partial<CarLoanInputs>) => void
  setFuelEconomy: (patch: Partial<FuelEconomyOverrides>) => void
  setEnergyOverride: (patch: Partial<{ enabled: boolean; monthlyAmount: number }>) => void
  setCost: (key: CostKey, patch: Partial<CostItem>) => void
  setToll: (patch: Partial<TollInputs>) => void
  setDepreciation: (patch: Partial<{ enabled: boolean; annualPct: number | null }>) => void
  setSharing: (patch: Partial<{ mode: SharingMode; myPct: number; myFixedAmount: number }>) => void
  setAvailableMonthlyBudget: (amount: number, isManual: boolean) => void
  resetAll: () => void
}

/** Gammel v1-form (før persist-versjonering) — kun for migrering */
interface LegacyV1State {
  inputs?: {
    price?: number
    equity?: number
    annualRate?: number
    termYears?: number
    loanType?: 'annuitet' | 'serie'
    fuelType?: 'bensin' | 'diesel' | 'el' | 'hybrid' | null
    year?: number | null
    mileageKm?: number | null
    availableMonthlyBudget?: number
    runningCosts?: {
      insurance?: { enabled?: boolean; monthlyAmount?: number }
      fuel?: { enabled?: boolean; monthlyAmount?: number }
      maintenance?: { enabled?: boolean; yearlyAmount?: number }
    }
  }
  availableMonthlyBudgetIsManual?: boolean
}

export const useCarLoanCalculatorStore = create<CarLoanCalculatorState>()(
  persist(
    (set) => ({
      inputs: defaultCarLoanInputs(),
      availableMonthlyBudgetIsManual: false,
      comparisonSnapshot: null,

      setComparisonSnapshot: (snapshot) => set({ comparisonSnapshot: snapshot }),

      setInputs: (patch) => set((s) => ({ inputs: { ...s.inputs, ...patch } })),

      setFuelEconomy: (patch) =>
        set((s) => ({ inputs: { ...s.inputs, fuelEconomy: { ...s.inputs.fuelEconomy, ...patch } } })),

      setEnergyOverride: (patch) =>
        set((s) => ({ inputs: { ...s.inputs, energyOverride: { ...s.inputs.energyOverride, ...patch } } })),

      setCost: (key, patch) =>
        set((s) => ({
          inputs: {
            ...s.inputs,
            costs: { ...s.inputs.costs, [key]: { ...s.inputs.costs[key], ...patch } },
          },
        })),

      setToll: (patch) =>
        set((s) => ({ inputs: { ...s.inputs, toll: { ...s.inputs.toll, ...patch } } })),

      setDepreciation: (patch) =>
        set((s) => ({ inputs: { ...s.inputs, depreciation: { ...s.inputs.depreciation, ...patch } } })),

      setSharing: (patch) =>
        set((s) => ({ inputs: { ...s.inputs, sharing: { ...s.inputs.sharing, ...patch } } })),

      setAvailableMonthlyBudget: (amount, isManual) =>
        set((s) => ({
          inputs: { ...s.inputs, availableMonthlyBudget: amount },
          availableMonthlyBudgetIsManual: isManual,
        })),

      resetAll: () => set({
        inputs: defaultCarLoanInputs(),
        availableMonthlyBudgetIsManual: false,
        comparisonSnapshot: null,
      }),
    }),
    {
      name: 'lommeboka-bilkalkulator-v1',
      version: 3,
      migrate: (persisted: unknown, fromVersion: number) => {
        if (fromVersion >= 3) return persisted as CarLoanCalculatorState

        // v2 → v3: fast annualRate erstattet av annualRateOverride (null =
        // følg EK-basert rente-estimat). 6.5 var gammel default → null.
        if (fromVersion === 2) {
          const s = persisted as CarLoanCalculatorState & { inputs: { annualRate?: number } }
          const oldRate = s.inputs.annualRate
          const inputs: CarLoanCalculatorState['inputs'] = {
            ...defaultCarLoanInputs(),
            ...s.inputs,
            annualRateOverride: oldRate !== undefined && oldRate !== 6.5 ? oldRate : null,
          }
          delete (inputs as { annualRate?: number }).annualRate
          return { ...s, inputs }
        }

        // v0/v1 → v3: behold skalarer, map gamle driftskostnad-toggles.
        const old = (persisted ?? {}) as LegacyV1State
        const oi = old.inputs ?? {}
        const inputs = defaultCarLoanInputs()

        inputs.price = oi.price ?? 0
        inputs.equity = oi.equity ?? 0
        inputs.annualRateOverride =
          oi.annualRate !== undefined && oi.annualRate !== 6.5 ? oi.annualRate : null
        inputs.termYears = oi.termYears ?? inputs.termYears
        inputs.loanType = oi.loanType ?? inputs.loanType
        inputs.fuelType = oi.fuelType ?? null
        inputs.year = oi.year ?? null
        inputs.mileageKm = oi.mileageKm ?? null
        inputs.availableMonthlyBudget = oi.availableMonthlyBudget ?? 0

        const rc = oi.runningCosts
        if (rc?.insurance) {
          inputs.costs.insurance = {
            enabled: rc.insurance.enabled ?? false,
            overriddenAmount: (rc.insurance.monthlyAmount ?? 0) > 0 ? rc.insurance.monthlyAmount! : null,
          }
        }
        // Gammel flat drivstoffkostnad blir flat overstyring i ny modell
        if (rc?.fuel?.enabled) {
          inputs.energyOverride = { enabled: true, monthlyAmount: rc.fuel.monthlyAmount ?? 0 }
        }
        // Gammel «service/vedlikehold + årsavgift» (kr/år) blir service-post (kr/mnd)
        if (rc?.maintenance) {
          inputs.costs.service = {
            enabled: rc.maintenance.enabled ?? inputs.costs.service.enabled,
            overriddenAmount: (rc.maintenance.yearlyAmount ?? 0) > 0
              ? Math.round(rc.maintenance.yearlyAmount! / 12)
              : null,
          }
        }

        return {
          inputs,
          availableMonthlyBudgetIsManual: old.availableMonthlyBudgetIsManual ?? false,
        }
      },
    }
  )
)
