import type { PolicyRateEntry, SubscriptionEntry, InsuranceEntry } from '@/types/economy'

// ------------------------------------------------------------
// ATF / LØNNSKODE-SATSER
// ------------------------------------------------------------

/** Helgetillegg per time (Forsvarets særavtale) */
export const ATF_HELGE_TILLEGG_PER_TIME = 65

/** Dagsnorm for ordinær dag */
export const ATF_TIMER_PER_DAG = 7.5

/** Dagsnorm for helg/HE */
export const ATF_TIMER_HELG = 8

/** Tidskompensasjon per dag */
export const ATF_TIDSKOMPENSASJON_PER_DAG = 7.5

// ------------------------------------------------------------
// BSU-GRENSER
// ------------------------------------------------------------

export const BSU_MAX_YEARLY = 27_500
export const BSU_MAX_TOTAL = 300_000

// ------------------------------------------------------------
// FERIEPENGER — STATLIG MODELL
// ------------------------------------------------------------

/** Feriepengeprosent for statlig ansatte */
export const FERIEPENGER_PROSENT = 0.12

/** Antall feriedager som trekkes i juni (25 virkedager) */
export const FERIEDAGER_TREKK = 25

/** Trekkdivisor for ferietrekk (260 virkedager i året) */
export const FERIETREKK_DIVISOR = 260

// ------------------------------------------------------------
// FRAVÆR
// ------------------------------------------------------------

/** Forsvarets særavtale: 24 egenmeldingsdager per 12 måneder */
export const EGENMELDING_KVOTE = 24
export const ABSENCE_WARNING_THRESHOLD = 21
export const ABSENCE_CRITICAL_THRESHOLD = 23

// ------------------------------------------------------------
// SKATTEOPPGJØR
// ------------------------------------------------------------

/** Grense for anbefaling om å redusere ekstra trekk (gjennomsnitt tilgode) */
export const TAX_REFUND_RECOMMENDATION_THRESHOLD = 5_000

// ------------------------------------------------------------
// STYRINGSRENTE-HISTORIKK (Norges Bank, 1991–2024)
// ------------------------------------------------------------

export const POLICY_RATE_HISTORY: PolicyRateEntry[] = [
  { year: 1991, rate: 10.00 },
  { year: 1992, rate: 11.00 },
  { year: 1993, rate: 7.00 },
  { year: 1994, rate: 5.50 },
  { year: 1995, rate: 4.75 },
  { year: 1996, rate: 4.50 },
  { year: 1997, rate: 3.50 },
  { year: 1998, rate: 8.00 },
  { year: 1999, rate: 6.50 },
  { year: 2000, rate: 7.00 },
  { year: 2001, rate: 7.00 },
  { year: 2002, rate: 6.50 },
  { year: 2003, rate: 2.25 },
  { year: 2004, rate: 1.75 },
  { year: 2005, rate: 2.25 },
  { year: 2006, rate: 3.75 },
  { year: 2007, rate: 5.25 },
  { year: 2008, rate: 3.00 },
  { year: 2009, rate: 1.25 },
  { year: 2010, rate: 2.00 },
  { year: 2011, rate: 2.25 },
  { year: 2012, rate: 1.50 },
  { year: 2013, rate: 1.50 },
  { year: 2014, rate: 1.25 },
  { year: 2015, rate: 0.75 },
  { year: 2016, rate: 0.50 },
  { year: 2017, rate: 0.50 },
  { year: 2018, rate: 0.75 },
  { year: 2019, rate: 1.50 },
  { year: 2020, rate: 0.00 },
  { year: 2021, rate: 0.50 },
  { year: 2022, rate: 2.75 },
  { year: 2023, rate: 4.50 },
  { year: 2024, rate: 4.50 },
  { year: 2025, rate: 4.50 },
  { year: 2026, rate: 4.25 },
]

// ------------------------------------------------------------
// KPI (KONSUMPRISINDEKS) — SSB, årsgjennomsnitt
// Kilde: SSB tabell 03013 (historisk) + SSB anslag 2025-2026
// Brukes til å vise reallønnsvekst i lønnsoppgjørhistorikk
// ------------------------------------------------------------

export interface KpiEntry { year: number; index: number }

/** KPI 2015=100 — årsgjennomsnitt. */
export const KPI_HISTORIKK: KpiEntry[] = [
  { year: 2015, index: 100.0 },
  { year: 2016, index: 103.6 },
  { year: 2017, index: 105.5 },
  { year: 2018, index: 108.0 },
  { year: 2019, index: 110.9 },
  { year: 2020, index: 111.9 },
  { year: 2021, index: 114.3 },
  { year: 2022, index: 122.4 },
  { year: 2023, index: 129.5 },
  { year: 2024, index: 133.4 },
  { year: 2025, index: 137.2 }, // SSB anslag
  { year: 2026, index: 140.0 }, // SSB anslag
]

/** Henter KPI-indeks for et gitt år (returnerer siste kjente om år ikke finnes). */
export function getKpiIndex(year: number): number {
  const sorted = [...KPI_HISTORIKK].sort((a, b) => b.year - a.year)
  return (sorted.find((e) => e.year <= year) ?? sorted[sorted.length - 1]).index
}

// ------------------------------------------------------------
// INITIAL ABONNEMENTS-DATA 2026
// ------------------------------------------------------------

export const INITIAL_SUBSCRIPTIONS: SubscriptionEntry[] = [
  {
    id: 'adobe-cc',
    name: 'Adobe Creative Cloud',
    category: 'software',
    isActive: true,
    monthlyAmounts: {},
    defaultMonthly: 238.76,
    billingCycle: 'monthly',
  },
  {
    id: 'icloud',
    name: 'iCloud+',
    category: 'tjeneste',
    isActive: true,
    monthlyAmounts: {},
    defaultMonthly: 129,
    billingCycle: 'monthly',
  },
  {
    id: 'amex',
    name: 'American Express',
    category: 'tjeneste',
    isActive: true,
    monthlyAmounts: {},
    defaultMonthly: 135,
    billingCycle: 'monthly',
  },
  {
    id: 'norsk-tipping',
    name: 'Norsk Tipping',
    category: 'annet',
    isActive: true,
    monthlyAmounts: {},
    defaultMonthly: 720,
    billingCycle: 'variable',
  },
  {
    id: 'snapchat-plus',
    name: 'Snapchat+',
    category: 'tjeneste',
    isActive: true,
    monthlyAmounts: {},
    defaultMonthly: 29,
    billingCycle: 'monthly',
  },
  {
    id: 'podme',
    name: 'Podme',
    category: 'streaming',
    isActive: true,
    monthlyAmounts: {},
    defaultMonthly: 99,
    billingCycle: 'monthly',
  },
  {
    id: 'disney-plus',
    name: 'Disney+',
    category: 'streaming',
    isActive: true,
    monthlyAmounts: {},
    defaultMonthly: 159,
    billingCycle: 'monthly',
  },
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    category: 'software',
    isActive: true,
    monthlyAmounts: {},
    defaultMonthly: 285,
    billingCycle: 'monthly',
  },
  {
    id: 'fitbod',
    name: 'Fitbod',
    category: 'tjeneste',
    isActive: true,
    monthlyAmounts: {},
    defaultMonthly: 199,
    billingCycle: 'monthly',
  },
]

// ------------------------------------------------------------
// INITIAL FORSIKRINGS-DATA 2026
// ------------------------------------------------------------

export const INITIAL_INSURANCES: InsuranceEntry[] = [
  {
    id: 'fremtind-person',
    provider: 'FREMTIND',
    type: 'Personforsikring',
    yearlyAmounts: { '2026': 403 * 12 },
    isActive: true,
    renewalMonth: 1,
  },
  {
    id: 'fremtind-forsikring',
    provider: 'FREMTIND',
    type: 'Forsikring',
    yearlyAmounts: { '2026': 209 * 12 },
    isActive: true,
    renewalMonth: 1,
  },
  {
    id: 'if-skade',
    provider: 'IF',
    type: 'Skadeforsikring',
    yearlyAmounts: { '2026': 400 * 12 },
    isActive: true,
    renewalMonth: 1,
  },
  {
    id: 'if-annen',
    provider: 'IF',
    type: 'Annen forsikring',
    yearlyAmounts: { '2026': 98 * 12 },
    isActive: true,
    renewalMonth: 1,
  },
]

// ------------------------------------------------------------
// ARTSKODE-MAPPING (Forsvaret)
// ------------------------------------------------------------

export const ARTSKODE_NAVN: Record<string, string> = {
  '1S01': 'Månedslønn',
  '1501': 'Kompensasjonstillegg husleie',
  '1162': 'HTA-tillegg',
  '106G': 'Flyttebonus (mnd)',
  '1069': 'Flyttebonus',
  'OF11': 'Feriepenger',
  'OF19': 'Ferietrekk',
  '/440': 'Skattetrekk (tabell)',
  '1620': 'Ekstra forskuddstrekk',
  '7000': 'Pensjonstrekk SPK',
  '7005': 'SPK-tillegg',
  '3020': 'Fagforeningskontingent',
  '3209': 'Husleietrekk forsvarsbolig',
  '6100': 'OU-fond',
  '10P2': 'Fungering',
}
