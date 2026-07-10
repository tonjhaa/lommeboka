// src/store/useCarLoanCalculatorStore.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CarLoanInputs } from '@/utils/carLoanCalculator'

interface CarLoanCalculatorState {
  inputs: CarLoanInputs
  /** Har brukeren selv skrevet inn "disponibelt til bil"? Hvis true, slutter
   *  useCarLoanCalculator å overstyre feltet med budsjett-forslaget. */
  availableMonthlyBudgetIsManual: boolean
  setInputs: (patch: Partial<CarLoanInputs>) => void
  setAvailableMonthlyBudget: (amount: number, isManual: boolean) => void
  setRunningCostToggle: (key: 'insurance' | 'fuel', patch: Partial<{ enabled: boolean; monthlyAmount: number }>) => void
  setMaintenanceToggle: (patch: Partial<{ enabled: boolean; yearlyAmount: number }>) => void
}

const DEFAULT_INPUTS: CarLoanInputs = {
  price: 0,
  equity: 0,
  annualRate: 6.5,
  termYears: 5,
  loanType: 'annuitet',
  fuelType: null,
  year: null,
  mileageKm: null,
  runningCosts: {
    insurance: { enabled: false, monthlyAmount: 0 },
    fuel: { enabled: false, monthlyAmount: 0 },
    maintenance: { enabled: false, yearlyAmount: 12_000 },
  },
  availableMonthlyBudget: 0,
}

export const useCarLoanCalculatorStore = create<CarLoanCalculatorState>()(
  persist(
    (set) => ({
      inputs: DEFAULT_INPUTS,
      availableMonthlyBudgetIsManual: false,

      setInputs: (patch) => set((s) => ({ inputs: { ...s.inputs, ...patch } })),

      setAvailableMonthlyBudget: (amount, isManual) =>
        set((s) => ({
          inputs: { ...s.inputs, availableMonthlyBudget: amount },
          availableMonthlyBudgetIsManual: isManual,
        })),

      setRunningCostToggle: (key, patch) =>
        set((s) => ({
          inputs: {
            ...s.inputs,
            runningCosts: {
              ...s.inputs.runningCosts,
              [key]: { ...s.inputs.runningCosts[key], ...patch },
            },
          },
        })),

      setMaintenanceToggle: (patch) =>
        set((s) => ({
          inputs: {
            ...s.inputs,
            runningCosts: {
              ...s.inputs.runningCosts,
              maintenance: { ...s.inputs.runningCosts.maintenance, ...patch },
            },
          },
        })),
    }),
    { name: 'lommeboka-bilkalkulator-v1' }
  )
)
