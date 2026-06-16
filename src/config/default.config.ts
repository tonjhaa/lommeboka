import type { AppConfig } from '@/types'

/**
 * Standard appkonfigurasjon for norske boliglaan — 2026-verdier.
 *
 * Kildegrunnlag:
 * - Boliglaanesforskriften (FOR-2024-12-18-3398), gjeldende fra 01.01.2025
 * - SIFO-referansebudsjettet 2026 (SIFO, OSLOMET)
 * - Kartverkets tinglysingsgebyrer 2026 (gjeldende fra 01.01.2026)
 * - Finansdepartementet: dokumentavgift 2.5% (uendret)
 * - Skatteetaten: Prop. 1 LS (2025–2026) — Statsbudsjettet 2026
 * - NAV: Grunnbeloep G = 124 028 kr (01.05.2026)
 */
export const defaultConfig: AppConfig = {
  version: '2.0.0',

  // ----------------------------------------------------------
  // SIFO-REFERANSEBUDSJETTET 2026
  // Kilde: SIFO/OsloMet — referansebudsjettet for forbruksutgifter
  // Dekker: mat, klær, hygiene, fritid, medier og kommunikasjon.
  // Inkluderer IKKE: boutgifter, transport eller barnehage.
  // ----------------------------------------------------------
  sifo: {
    /** Voksen 18+ ar — SIFO 2026 */
    adultMonthly: 9_850,
    /** Spedbarn 0–3 ar — SIFO 2026 */
    infantMonthly: 5_280,
    /** Barn 4–6 ar — SIFO 2026 */
    child4to6Monthly: 6_030,
    /** Barn 7–10 ar — SIFO 2026 */
    child7to10Monthly: 7_490,
    /** Barn 11–13 ar — SIFO 2026 */
    child11to13Monthly: 8_440,
    /** Barn 14–17 ar — SIFO 2026 */
    child14to17Monthly: 9_800,
  },

  // ----------------------------------------------------------
  // GEBYRER OG AVGIFTER
  // ----------------------------------------------------------
  fees: {
    /**
     * Dokumentavgift: 2.5% av kjopesummen for selveierboliger.
     * Fritatt: borettslag/andeler, aksjeboliger, og nybygg fra
     * utbygger (forstegangsomsatt innen 5 ar).
     * Kilde: Finansdepartementet (uendret 2026)
     */
    stampDutyPercent: 2.5,

    /**
     * Tinglysingsgebyr for pantedokument (laan i fast eiendom).
     * Kilde: Kartverket 2026 — NOK 500 per pantedokument.
     */
    mortgageRegistrationFee: 500,

    /**
     * Tinglysingsgebyr for skjote (hjemmelsovergang).
     * Kilde: Kartverket 2026 — NOK 500 (ned fra 585 i 2025).
     */
    propertyRegistrationFee: 500,

    /**
     * Etableringsgebyr laan — varierer mellom banker.
     * Standard estimat NOK 2 000.
     */
    loanEstablishmentFee: 2_000,

    /**
     * Termingebyr per maned — varierer mellom banker.
     * Standard estimat NOK 65.
     */
    termFee: 65,
  },

  // ----------------------------------------------------------
  // UTLAANSREGLER (Boliglaanesforskriften 2025, viderefort 2026)
  // ----------------------------------------------------------
  lendingRules: {
    /**
     * Minimum egenkapital: 10% av kjopssum inkl. fellesgjeld.
     * (15% er hovedregelen, men 10% gjelder for forstehjemslaanere — brukt som standard her)
     * Kilde: FOR-2024-12-18-3398 § 7
     */
    minEquityPercent: 10,

    /**
     * Maksimal gjeldsgrad: samlet gjeld <= 5x samlet arsinntekt (brutto).
     * Kilde: FOR-2024-12-18-3398 § 8
     */
    maxDebtRatio: 5.0,

    /**
     * Stresspaaslagg: 3 prosentpoeng over avtalerenten.
     * Kilde: FOR-2024-12-18-3398 § 9
     */
    stressTestAddition: 3.0,

    /**
     * Minimum stressrente: stressrenten settes aldri lavere enn 7%.
     * Kilde: FOR-2024-12-18-3398 § 9
     */
    minStressTestRate: 7.0,

    /**
     * Maksimal belaaningsgrad (LTV): 90% for forstehjemslaanere (standard her).
     * Ordinaere laan: 85%. Rammelaan: 60%. BSU-garantilaan: inntil 100%.
     * Kilde: FOR-2024-12-18-3398 § 7
     */
    maxLtvRatio: 90,
  },

  // ----------------------------------------------------------
  // STANDARD LAANVERDIER
  // ----------------------------------------------------------
  loanDefaults: {
    /** Nominell rente — oppdateres jevnlig */
    defaultInterestRate: 5.5,
    /** Laanetid 25 aar er vanligst i Norge */
    defaultLoanTermYears: 25,
    /** Annuitetslaan er standard hos de fleste banker */
    defaultLoanType: 'annuitet',
  },

  // ----------------------------------------------------------
  // UI-INNSTILLINGER
  // ----------------------------------------------------------
  ui: {
    /** Mork modus som standard */
    defaultTheme: 'dark',
    currencySymbol: 'kr',
    locale: 'nb-NO',
    percentDecimals: 1,
    amountDecimals: 0,
  },
}

export default defaultConfig
