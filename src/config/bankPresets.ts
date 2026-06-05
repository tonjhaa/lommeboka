import type { BankAccountPreset } from '@/types/economy'

export const DEFAULT_BANK_PRESETS: BankAccountPreset[] = [
  {
    id: 'trondelag-gullkonto',
    bankName: 'Trøndelag Sparebank',
    accountTypeName: 'Gullkonto',
    tieredRates: [
      { fromBalance: 0,           rate: 3.25 },
      { fromBalance: 100_000,     rate: 3.55 },
      { fromBalance: 500_000,     rate: 3.80 },
      { fromBalance: 1_000_000,   rate: 4.05 },
    ],
    interestCreditFrequency: 'monthly',
    enabled: true,
  },
  {
    id: 'trondelag-gullkonto-ung',
    bankName: 'Trøndelag Sparebank',
    accountTypeName: 'Gullkonto UNG (under 34)',
    tieredRates: [
      { fromBalance: 0, rate: 4.10 },
    ],
    interestCreditFrequency: 'monthly',
    enabled: true,
  },
  {
    id: 'trondelag-saervilkaar',
    bankName: 'Trøndelag Sparebank',
    accountTypeName: 'Særvilkår',
    tieredRates: [
      { fromBalance: 0,           rate: 3.00 },
      { fromBalance: 100_000,     rate: 3.50 },
      { fromBalance: 1_000_000,   rate: 4.05 },
    ],
    interestCreditFrequency: 'monthly',
    enabled: true,
  },
  {
    id: 'trondelag-bsu-pluss',
    bankName: 'Trøndelag Sparebank',
    accountTypeName: 'BSU Pluss',
    tieredRates: [
      { fromBalance: 0, rate: 4.75 },
    ],
    interestCreditFrequency: 'yearly',
    enabled: true,
  },
  {
    id: 'dnb-sparekonto-pluss',
    bankName: 'DNB',
    accountTypeName: 'Sparekonto Pluss',
    tieredRates: [
      { fromBalance: 0,           rate: 2.50 },
      { fromBalance: 100_000,     rate: 3.65 },
      { fromBalance: 500_000,     rate: 4.10 },
      { fromBalance: 2_000_000,   rate: 0.80 },
    ],
    interestCreditFrequency: 'monthly',
    enabled: true,
  },
  {
    id: 'dnb-hoyrentekonto',
    bankName: 'DNB',
    accountTypeName: 'Høyrentekonto',
    tieredRates: [
      { fromBalance: 0, rate: 3.50 },
    ],
    interestCreditFrequency: 'monthly',
    enabled: true,
  },
  {
    id: 'storebrand-hoyrentekonto',
    bankName: 'Storebrand',
    accountTypeName: 'Høyrentekonto',
    tieredRates: [
      { fromBalance: 0,       rate: 3.50 },
      { fromBalance: 100_000, rate: 3.75 },
      { fromBalance: 500_000, rate: 4.40 },
    ],
    interestCreditFrequency: 'monthly',
    enabled: true,
  },
  {
    id: 'nordea-bufferspar',
    bankName: 'Nordea',
    accountTypeName: 'BufferSpar',
    tieredRates: [
      { fromBalance: 0,       rate: 3.05 },
      { fromBalance: 100_000, rate: 0.90 },
    ],
    interestCreditFrequency: 'monthly',
    enabled: true,
  },
  {
    id: 'nordea-sparekonto-ekstra',
    bankName: 'Nordea',
    accountTypeName: 'Sparekonto Ekstra',
    tieredRates: [
      { fromBalance: 0,         rate: 3.40 },
      { fromBalance: 100_000,   rate: 3.70 },
      { fromBalance: 500_000,   rate: 4.35 },
      { fromBalance: 2_000_000, rate: 3.90 },
    ],
    interestCreditFrequency: 'yearly',
    enabled: true,
  },
  {
    id: 'sparebank1-sparekonto',
    bankName: 'SpareBank 1',
    accountTypeName: 'Sparekonto',
    tieredRates: [
      { fromBalance: 0,       rate: 3.50 },
      { fromBalance: 500_000, rate: 2.45 },
    ],
    interestCreditFrequency: 'monthly',
    enabled: true,
  },
]
