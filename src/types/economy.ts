// ============================================================
// MIN ØKONOMI — Sentrale TypeScript-interfaces
// ============================================================

// ------------------------------------------------------------
// BUDSJETTLINJER
// ------------------------------------------------------------

export type BudgetCategory =
  // Inntekter
  | 'lonn' | 'tillegg' | 'atf' | 'feriepenger' | 'annen_inntekt'
  // Trekk (negative beløp)
  | 'skatt' | 'pensjon' | 'fagforening' | 'husleietrekk'
  // Skatteoppgjør (til gode = positivt, restskatt = negativt)
  | 'skatteoppgjor'
  // Gjeld
  | 'studielaan' | 'billaan' | 'kredittkort' | 'annen_gjeld'
  // Faste utgifter
  | 'bolig' | 'transport' | 'mat' | 'helse'
  | 'abonnement' | 'forsikring' | 'klær' | 'fritid' | 'annet_forbruk'
  // Sparing
  | 'bsu' | 'fond' | 'krypto' | 'buffer' | 'annen_sparing'

export interface BudgetLine {
  id: string
  label: string           // fritekst, f.eks. "Netflix", "Studielån"
  category: BudgetCategory
  amount: number          // negativt = utgift/trekk
  isRecurring: boolean    // false = engangshendelse
  source: 'manual' | 'imported' | 'auto'
  isLocked: boolean       // true = auto-generert fra slipp, kan ikke slettes
  isVariable: boolean     // true = beløpet varierer (f.eks. Norsk Tipping)
  notes?: string
  /** Tidsbegrenset tillegg — skjules ved "uten tillegg"-visning */
  isTemporary?: boolean
  /** Startdato for tidsbegrenset linje (ISO "YYYY-MM-DD"). Vises ikke i måneder før denne datoen. */
  temporaryFromDate?: string
  /** Sluttdato for tidsbegrenset linje (ISO "YYYY-MM-DD"). Vises ikke i måneder etter denne datoen. */
  temporaryToDate?: string
  /** Engangshendelse: kun synlig denne måneden (1–12). Krever isRecurring=false. */
  specificMonth?: number
  /** Engangshendelse: kun synlig dette året. Brukes sammen med specificMonth. */
  specificYear?: number
  /** Midlertidig beløpsendring: i perioden (YYYY-MM) brukes periodAmount; ellers gjelder amount. */
  periodOverride?: { amount: number; from: string; to: string }
}

export interface BudgetTemplate {
  lines: BudgetLine[]
  lastUpdated: string     // ISO-dato
}

// ------------------------------------------------------------
// LØNNSSLIPPER OG PROFIL
// ------------------------------------------------------------

export interface ArtskopePost {
  artskode: string        // f.eks. "1501", "/440", "7000"
  navn: string
  belop: number
}

export interface ParsetLonnsslipp {
  periode: { year: number; month: number }
  ansattnummer: string
  loennstrinn: number
  maanedslonn: number            // artskode 1S01
  fasteTillegg: ArtskopePost[]   // 1501, 1162, 106G osv.
  trekk: ArtskopePost[]          // /440, 7000, 3020, 3209, 1620, 6100
  bruttoSum: number
  nettoUtbetalt: number
  feriepengegrunnlag: number     // YTD feriepengegrunnlag
  opptjentFerie: number          // Opptjent ferie i kr (YTD)
  skattetrekk: number            // artskode /440
  ekstraTrekk: number            // artskode 1620
  husleietrekk: number           // artskode 3209
  pensjonstrekk: number          // artskode 7000
  fagforeningskontingent: number // artskode 3020
  ouFond: number                 // artskode 6100
  gruppelivspremie: number       // artskode 7005 (arbeidsgiverbetalt, informasjonslinje)
  avregningsdato?: string        // f.eks. "12.03.2026"
  hittilBrutto: number           // Hitt. Sum Norge (YTD brutto)
  hittilPensjon: number          // YTD pensjonstrekk
  hittilForskuddstrekk: number   // YTD forskuddstrekk
  /** ATF-satser funnet på slippen: artskode → sats per dag/time */
  atfRater?: Record<string, number>
  /** Sum av alle ATF/øvelse-beløp (2230/2232/2233/2236 osv.) utbetalt denne slippen */
  atfBeløp?: number
  /** Fungeringsbeløp (10P2) utbetalt denne slippen */
  fungeringBeløp?: number
  /** /440-grunnlaget (lønnsgrunnlag for tabelltrekk, f.eks. 61 278 kr) */
  tabelltrekkGrunnlag: number
  /** /440-trekk beløp (positivt tall, f.eks. 18 478 kr) */
  tabelltrekkBelop: number
  /** Trekktabellnummer fra /440-linjen (f.eks. 8010) */
  tabellnummer?: number
  /** OF11: Utbetalte feriepenger i ferieåret (kun juni) */
  feriepenger?: number
  /** Sum OF19: Ferietrekk ordinært (kun juni, summer to forekomster) */
  ferietrekk?: number
  /** Sum 2700/2713: trekk for ulønnet fravær/ferie (positivt tall, reduserer brutto) */
  fravaerstrekk?: number
}

/** Siste kjente ATF-sats fra importert slipp, for én artskode */
export interface KnownATFRate {
  sats: number          // sats per dag eller time (fra sats-kolonnen på slippen)
  fraAarslonn: number   // maanedslonn × 12 da satsen ble registrert
  dato: string          // "YYYY-MM" (slippens periode)
}

export interface EmploymentProfile {
  employer: 'forsvaret' | 'custom'
  baseMonthly: number            // grunnlønn per måned
  fixedAdditions: {
    kode: string
    label: string
    amount: number
    /** Tidsbegrenset tillegg — skjules ved "uten tillegg"-visning */
    isTemporary?: boolean
    /** Startmåned for tillegget (ISO "YYYY-MM") */
    fromDate?: string
    /** Sluttmåned for tillegget (ISO "YYYY-MM"). Undefined = løpende */
    toDate?: string
    /** Fast lønn/tillegg — vises ikke i tidsbegrenset-seksjonen */
    isPermanent?: boolean
  }[]
  lastKnownTaxWithholding: number     // siste kjente skattetrekk
  extraTaxWithholding: number          // ekstra forskuddstrekk (1620)
  housingDeduction: number             // husleietrekk forsvarsbolig (3209)
  /** Husleietrekk er tidsbegrenset — skjules ved "uten tillegg"-visning */
  housingDeductionIsTemporary?: boolean
  pensionPercent: number               // SPK-prosent
  unionFee: number                     // fagforeningskontingent
  atfEnabled: boolean
  /** Siste kjente ATF-satser fra importerte slipper, nøkkel = artskode (2230, 2232 osv.) */
  knownATFRates?: Record<string, KnownATFRate>
  /**
   * Effektiv /440-trekkprosent fra siste importerte slipp (f.eks. 30.15).
   * Brukes til ATF-skatteestimering: ATF-brutto × denne prosenten.
   */
  lastKnownTableTaxPercent?: number
  /** Trekktabellnummer fra siste importerte slipp (f.eks. 8010) */
  tabellnummer?: number
  /** Skatteprognose for inneværende år — meldt til skatteetaten */
  taxForecast?: {
    year: number
    expectedIncome: number  // forventet pensjonsgivende inntekt (lønn)
    expectedTax: number     // beregnet skatt (lagres for historikk)
    fagforeningskontingent?: number
    bsuInnskuddThisYear?: number
    pensjonspremie?: number
    gjeldsrenter?: number
    renteinntekter?: number
    reisefradragBrutto?: number
    utgiftsgodtgjoerelseOverskudd?: number
  }
  /** Ferieperioder for året */
  vacationPeriods?: VacationPeriod[]
  /** Antall feriedager per kalenderår (standard 25) */
  vacationDaysPerYear?: number
  /** Etikett brukt i IVF-prosjekttransaksjoner for å identifisere egne bidrag (lagres i Supabase) */
  ivfOwnerLabel?: string
}

export interface VacationPeriod {
  id: string
  label: string             // f.eks. "Sommerferie", "Juleferie"
  lastWorkDayBefore: string // ISO — siste arbeidsdag, nedtelling hit
  firstWorkDayAfter: string // ISO — første arbeidsdag tilbake
}

// ------------------------------------------------------------
// MÅNEDS-RECORDS
// ------------------------------------------------------------

export interface MonthRecord {
  year: number
  month: number
  isLocked: boolean                    // låst = faktiske tall, ikke prognose
  source: 'manual' | 'imported_slip' | 'forecast'
  lines: BudgetLine[]
  nettoUtbetalt: number
  disposable: number                   // beregnet disponibelt etter alle trekk
  slipData?: ParsetLonnsslipp          // raw slip-data for låste måneder
  slipPdfBase64?: string               // PDF-fil lagret som base64 (maks 12 slipper)
  slipStoragePath?: string             // Supabase Storage-sti: {userId}/{year}-{month}.pdf
}

// ------------------------------------------------------------
// ATF
// ------------------------------------------------------------

export type ATFLønnskode =
  | 'ØV_MAN_FRE'           // dagssats hverdag
  | 'ØV_LØR_SØN'           // dagssats helg
  | 'ØV_OT_50_MAN_FRE'     // overtid inntil 7t, 50% påslag
  | 'ØV_TIME_MAN_FRE'      // ordinær timesats
  | 'VAKT'
  | 'FA1' | 'FA2' | 'PK' | 'FØPP'

export interface ATFPeriode {
  kode: ATFLønnskode
  antallDager?: number     // for dagssatser
  antallTimer?: number     // for timesatser
}

export interface ATFDatoRad {
  dato: string            // "2026-03-09"
  dagType: 'hverdag' | 'helg' | 'helligdag'
  artskode: string        // "2230", "2232", "2236", "2242", "HTA-OT" etc.
  beskrivelse: string
  antall: number          // hours or days
  enhet: 'timer' | 'døgn'
  sats: number
  belop: number
  /** Markerer at denne raden har fått 50 % forhøyet sats (første døgn, ikke-planlagt) */
  isFirstDayBonus?: boolean
}

export type PlanningStatus = 'planned' | 'unplanned'

export interface ATFEntry {
  id: string
  year: number
  øvelsesnavn: string
  perioder: ATFPeriode[]
  beregnetBeløp: number    // sum av alle perioder
  tidskompensasjonTimer: number
  notat?: string
  fraDateISO?: string      // "2026-03-09T07:30"
  tilDateISO?: string      // "2026-03-19T15:30"
  øvelsestype?: 'døgn' | 'time'
  datoRader?: ATFDatoRad[]
  /** Måned ATF utbetales (1–12). Beregnes automatisk som måneden etter øvelsens slutt. */
  payoutMonth?: number
  /** År ATF utbetales. Kan avvike fra year hvis øvelsen slutter i desember. */
  payoutYear?: number
  /** Input-årslønn lagret for forhåndsutfylling ved redigering. */
  årslønnInput?: number
  /** Input faste tillegg lagret for forhåndsutfylling ved redigering. */
  fasteTilleggInput?: number
  /** Månedlig fungeringstillegg (10P2) aktivt under øvelsen — øker ATF-lønnsgrunnlaget. */
  fungeringMndInput?: number
  /** Skjul denne øvelsens ATF-sum fra budsjettberegninger */
  excludeFromBudget?: boolean
  /**
   * Planleggingsstatus (ATF pkt 5.2.1).
   * planned  = fremgår av arbeidsplanen → beregn normalt etter ATF.
   * unplanned = fremgår IKKE av arbeidsplanen →
   *   - døgnbasert: ATF-sats, første døgn +50 % på øk. komp.
   *   - timebasert: rutes til HTA-overtid (OT 100 %).
   */
  planningStatus?: PlanningStatus
  /**
   * Hvilken regel ble brukt for beregningen (satt av kalkulator).
   */
  appliedRule?: 'planned_atf' | 'unplanned_daily_atf_first50' | 'unplanned_hourly_hta_ot'
}

// ------------------------------------------------------------
// SPARING
// ------------------------------------------------------------

export type SavingsAccountType = 'BSU' | 'fond' | 'krypto' | 'sparekonto' | 'annet'

export interface TieredRate {
  fromBalance: number  // terskel i kr (0 = første trinn)
  rate: number         // % per år — gjelder hele saldoen når balance >= fromBalance
}

export interface TieredRateHistoryEntry {
  fromDate: string    // ISO "YYYY-MM-DD" — når strukturen gjelder fra
  tiers: TieredRate[] // hele trinnstrukturen for denne perioden
}

export interface BankAccountPreset {
  id: string
  bankName: string
  accountTypeName: string
  tieredRates: TieredRate[]
  interestCreditFrequency: 'monthly' | 'yearly'
  enabled: boolean
}

export interface RateHistoryEntry {
  fromDate: string         // ISO-dato
  rate: number             // prosent, f.eks. 6.3
}

export interface BalanceHistoryEntry {
  year: number
  month: number
  balance: number          // faktisk saldo ved månedsslutt
  isManual: boolean        // true = tastet inn (fond/krypto), false = beregnet
}

export interface WithdrawalEntry {
  id: string
  date: string             // "YYYY-MM-DD"
  amount: number           // negativt beløp
  note?: string
}

export interface SavingsContribution {
  id: string
  date: string             // "YYYY-MM-DD"
  amount: number           // positivt beløp
  note?: string
}

export interface SavingsAccount {
  id: string
  type: SavingsAccountType
  label: string
  openingBalance: number         // startbalanse da kontoen ble registrert
  openingDate: string            // ISO-dato for startbalansen
  monthlyContribution: number    // planlagt månedssparing (estimat)
  interestCreditFrequency: 'monthly' | 'yearly'  // BSU = yearly
  rateHistory: RateHistoryEntry[]  // rentesatsen endrer seg over tid
  balanceHistory: BalanceHistoryEntry[]  // faktisk saldo ved månedsslutt
  withdrawals: WithdrawalEntry[]
  contributions: SavingsContribution[]  // faktiske innskudd
  maxYearlyContribution?: number   // BSU: 27 500
  maxTotalBalance?: number         // BSU: 300 000
  /** Kontonummer fra banken, brukes for matching ved re-import */
  accountNumber?: string
  /** Fødselsår – brukes for BSU aldersgrense (siste innskuddsår = fødselsår + 33) */
  birthYear?: number
  /** Forventet årlig avkastning i prosent. Brukes i simulering for fond/krypto. */
  expectedReturn?: number
  /** Faktisk oppnådd avkastning siste 12 mnd i prosent. Null = ikke registrert. */
  actualReturn?: number | null
  /** Startdato for fast månedssparing (ISO "YYYY-MM-DD"). Ingen dato = alltid aktiv. */
  monthlyContributionFromDate?: string
  /** Sluttdato for fast månedssparing (ISO "YYYY-MM-DD"). Ingen dato = ingen sluttdato. */
  monthlyContributionToDate?: string
  /** Trinnvis rente — overstyrer rateHistory for saldobasert renteberegning */
  tieredRates?: TieredRate[]
  /** Tidsbevisst trinnvisrente — erstatter tieredRates */
  tieredRateHistory?: TieredRateHistoryEntry[]
  /** ID til bankpreset som ble valgt ved opprettelse/sist redigering */
  bankPresetId?: string
  /** Fleksible spareperioder — overskriver monthlyContribution når tilstede */
  contributionPeriods?: ContributionPeriod[]
}

export interface ContributionPeriod {
  id: string
  amount: number         // kr/mnd
  fromDate?: string      // YYYY-MM-DD, ingen = alltid fra start
  toDate?: string        // YYYY-MM-DD, ingen = ingen sluttdato
}

export interface SavingsGoal {
  id: string
  label: string
  icon: string             // emoji
  targetAmount: number
  targetDate?: string      // ISO-dato
  linkedAccountIds: string[]
  includeFond?: boolean    // inkluder KRON-portefølje i fremgangen
  notes?: string
}

export interface BSUStatus {
  currentBalance: number
  yearlyContributionSoFar: number
  remainingYearlyQuota: number   // maks 27 500 - bidrag hittil i år
  totalRemainingRoom: number     // maks 300 000 - nåværende saldo
  isMaxed: boolean               // saldo >= 300 000
  warning?: string
}

export interface GoalProgress {
  currentTotal: number
  targetAmount: number
  percent: number
  monthsRemaining: number | null
  monthlyNeeded: number | null
}

// ------------------------------------------------------------
// GJELD
// ------------------------------------------------------------

export interface DebtRateHistory {
  fromDate: string
  nominalRate: number
}

export interface DebtAccount {
  id: string
  creditor: string
  type: 'studielaan' | 'billaan' | 'kredittkort' | 'boliglaan' | 'annet'
  originalAmount: number
  currentBalance: number
  rateHistory: DebtRateHistory[]
  monthlyPayment: number
  termFee: number
  startDate: string
  expectedPayoffDate?: string
  effectiveRate?: number
  loanSubtype?: string                            // f.eks. "Omgjøringslån"
  paymentHistory?: { date: string; amount: number }[]  // fakturaarkiv
  /** 'nedbetalt' = soft-slettet med dato, vises i historikk men teller ikke i beregninger */
  status?: 'aktiv' | 'nedbetalt'
  paidOffDate?: string  // "YYYY-MM-DD"
  /** Dag i måneden terminbeløpet forfaller (f.eks. 15 for Lånekassen). Default: 1 */
  paymentDay?: number
  /** Bruk daglig renteberegning (rente/365 × faktiske dager) istedenfor månedlig */
  dailyInterestCalc?: boolean
}

export interface RepaymentRow {
  month: number
  payment: number
  interest: number
  principal: number
  balance: number
  rate: number
}

export interface RepaymentPlan {
  rows: RepaymentRow[]
  payoffDate: Date
  totalInterestCost: number
}

// ------------------------------------------------------------
// LØNNSOPPGJØR-HISTORIKK
// ------------------------------------------------------------

export interface LonnsoppgjorRecord {
  id: string
  year: number
  effectiveDate: string         // "YYYY-MM-DD", typisk 1. mai
  maanedslonn: number           // ny grunnlønn etter oppgjør
  forrigeMaanedslonn: number    // grunnlønn før oppgjøret (0 = ukjent/første registrerte)
  htaTillegg: number            // HTA-tillegg inkludert i økningen (0 = ukjent)
  notes: string
  source: 'slip' | 'manual' | 'forventet'
  /** Kun relevant for source:'forventet'. Absent/false = ekskludert fra
   *  budsjettprognosen, true = inkludert. slip/manual brukes alltid. */
  activeInProjection?: boolean
  /** Forventet utbetalingsdato for etterbetaling (ISO "YYYY-MM-DD") */
  etterbetalingDate?: string
  /** ID til BudgetLine i budgetTemplate hvis etterbetalingen er bokført */
  etterbetalingBudgetLineId?: string
}

// ------------------------------------------------------------
// MIDLERTIDIG LØNN (FUNGERING)
// ------------------------------------------------------------

export interface TemporaryPayEntry {
  id: string
  label: string        // f.eks. "Fungering som major"
  fromDate: string     // "YYYY-MM-DD"
  toDate: string       // "YYYY-MM-DD"
  maanedslonn: number  // midlertidig lønn per måned i perioden
}

// ------------------------------------------------------------
// FRAVÆR
// ------------------------------------------------------------

export interface AbsenceRecord {
  period: string           // ISO-dato, første dag i måneden
  selfCertDays: number     // egenmeldingsdager denne måneden
  sickLeaveDays: number    // sykemeldingsdager (teller ikke mot kvote)
  notat?: string
}

export type AbsenceStatus = 'ok' | 'warning' | 'critical' | 'over'

/** Individuell fraværshendelse med faktiske datoer (for eligibilitetssjekk) */
export interface AbsenceEvent {
  id: string
  startDate: string             // "YYYY-MM-DD"
  endDate: string               // "YYYY-MM-DD"
  type: 'egenmelding' | 'sykmelding'
  grade: number                 // 1–100, 100 = helt fravær
  source: 'manual' | 'imported'
  notat?: string
}

/** Resultat fra eligibilitetssjekken */
export interface AbsenceEligibility {
  canUse: boolean
  earliest: string | null       // ISO-dato eller null
  explain: string
  kpiEgen12m: number            // egenmeldingsdager siste 12 mnd
  kpiEgen16d: number            // egenmeldingsdager siste 16 kalenderdager
  lastPeriodSickDays: number    // sykedager i siste sammenhengende periode
  employerLeft: number          // dager igjen i arbeidsgiverperioden (av 16)
}

// ------------------------------------------------------------
// SKATTEOPPGJØR
// ------------------------------------------------------------

export interface TaxSettlementRecord {
  year: number
  pensjonsgivendeInntekt?: number
  alminneligInntekt?: number
  skattInnbetalt?: number
  skattTilGodeEllerRest: number   // positivt = til gode (du får penger), negativt = restskatt (du skylder)
  skattBetalt?: number
  nettoInntekt?: number
  displayOverride?: number        // manuell overstyring — brukes i stedet for skattTilGodeEllerRest i beregninger/visning
}

export interface TaxSettlementAnalysis {
  records: TaxSettlementRecord[]
  avgYearlyRefund: number
  recommendation: 'reduce_extra' | 'keep' | 'increase_extra'
  recommendedExtraAdjustment: number  // kr/mnd å endre ekstra trekk med
  reasoning: string
}

// ------------------------------------------------------------
// ABONNEMENT OG FORSIKRINGER
// ------------------------------------------------------------

export interface SubscriptionEntry {
  id: string
  name: string
  category: 'streaming' | 'software' | 'spill' | 'tjeneste' | 'annet'
  isActive: boolean
  monthlyAmounts: {
    [monthKey: string]: number   // format: "2026-01", "2026-02" osv.
  }
  defaultMonthly: number
  billingCycle: 'monthly' | 'yearly' | 'variable'
  activeUntil?: string  // YYYY-MM — siste aktive måned. Udefinert = løpende
  /** Prishistorikk — gjeldende pris avgjøres av siste oppføring ≤ aktuell måned */
  priceChanges?: { fromMonth: string; amount: number }[]
}

export interface InsuranceProviderHistory {
  provider: string
  from: string        // "YYYY-MM-DD" eller "YYYY"
  to?: string
  bonus?: number      // bonus-nivå i % ved avslutning
}

export interface InsuranceEntry {
  id: string
  provider: string
  type: string
  yearlyAmounts: {
    [year: string]: number
  }
  isActive: boolean
  renewalMonth?: number   // 1–12
  /** 'avsluttet' = soft-slettet, vises i historikk */
  status?: 'aktiv' | 'avsluttet'
  cancelledDate?: string  // "YYYY-MM-DD"
  /** Bonus-nivå i % (f.eks. 70 = 70% bonus) */
  bonus?: number
  /** Leverandørhistorikk */
  providerHistory?: InsuranceProviderHistory[]
}

// ------------------------------------------------------------
// FOND (KRON-PORTEFØLJE)
// ------------------------------------------------------------

export interface FondEntry {
  id: string
  name: string
  type: 'aktivt' | 'indeks' | 'rente' | 'annet'
  allocationPercent: number
  color: string
  returnPercent?: number  // siste kjente avkastning %
  isin?: string           // ISIN for norske fond (Morningstar)
  yahooTicker?: string    // Yahoo Finance ticker for ETFer (f.eks. DFNS.AS)
}

export interface FondPortfolioSnapshot {
  date: string  // YYYY-MM-DD
  totalValue: number
  totalDeposited?: number  // totalt innskutt beløp
}

export interface FondPortfolio {
  monthlyDeposit: number
  startDate: string  // YYYY-MM-DD
  funds: FondEntry[]
  snapshots: FondPortfolioSnapshot[]
  contributionPeriods?: ContributionPeriod[]
  contributions?: SavingsContribution[]  // enkeltinnskudd (fremtidige planlagte)
}

// ------------------------------------------------------------
// STYRINGSRENTE
// ------------------------------------------------------------

export interface PolicyRateEntry {
  year: number
  rate: number            // Norges Banks styringsrente (%)
}

// ------------------------------------------------------------
// IVF-PROSJEKT
// ------------------------------------------------------------

export type IVFTransactionType = 'SPARING' | 'SVEA' | 'KJØP' | 'FAKTURA' | 'FAKTURA_DONOR' | 'ANNET' | 'UTLEGG'

export interface IVFTransaction {
  id: string
  date: string                  // "YYYY-MM-DD"
  label: string
  type: IVFTransactionType
  amount: number                // positivt = inn, negativt = ut
  merknad?: string
}

export interface IVFSettings {
  lonPerson1: number            // din lønn
  lonPerson2: number            // partners lønn
  studielaanPerson1: number
  studielaanPerson2: number
  annenEgenkapital: number      // BSU, fond, sparekonto osv. utenom IVF-konto
  selfLabel?: string            // Ditt navn i transaksjoner, brukes for å filtrere egne sparetransaksjoner i budsjettet
}

// ------------------------------------------------------------
// HJELPETYPER
// ------------------------------------------------------------

export interface HolidayPayResult {
  holidayPay: number
  holidayLeaveDeduction: number
  netJune: number
}

export interface ATFBreakdown {
  kode: ATFLønnskode
  antallDager?: number
  antallTimer?: number
  sats: number
  belop: number
  beskrivelse: string
}

export interface ATFResult {
  totalEconomy: number
  breakdown: ATFBreakdown[]
  tidskompensasjonTimer: number
  timesatsATab: number
}

// ------------------------------------------------------------
// FERIEPENGER
// ------------------------------------------------------------

export interface AccruedHolidayBase {
  actual: number            // Sum bruttoSum fra importerte slipper
  projected: number         // Estimert for måneder uten slipp
  total: number
  monthsWithSlip: number    // 0–12
}

export interface JuneForecast {
  year: number
  feriepengegrunnlag: number
  feriepenger: number
  ferietrekkDagsats: number
  ferietrekk: number
  skattepliktigJuni: number
  juneATF: number
  /** Fungeringsinntekt i juni (fra slipp eller prognose fra midlertidig-stillings-data) */
  juneFungering: number
  skattegrunnlag: number
  skattetrekk: number
  andreJuneTrekk: number
  nettoJuni: number
  nettoEkstra: number       // feriepenger - ferietrekk (positivt = ekstra penger)
  confidence: 'høy' | 'middels' | 'lav'
  kilder: {
    feriepengegrunnlag: string
    juneLonn: string
  }
}


// ------------------------------------------------------------
// BRUKERINNSTILLINGER / ONBOARDING
// ------------------------------------------------------------

export type EconomyTab =
  | 'dashboard' | 'budget' | 'salary' | 'atf' | 'feriepenger'
  | 'savings' | 'fond' | 'debt' | 'absence' | 'tax'
  | 'subscriptions' | 'ivf' | 'vacation' | 'settings' | 'veikart' | 'gaver' | 'partner' | 'permisjon'
  | 'pension' | 'formue' | 'calibration' | 'scenario' | 'forbruk'

export interface UserPreferences {
  onboardingCompleted: boolean
  enabledTabs: EconomyTab[]
  payDay?: number       // dag i måneden lønn utbetales (1-28), standard 12
  birthYear?: number    // fødselsår — brukes til BSU-aldersgrense og andre beregninger
  housingStatus?: 'leier' | 'eier'  // nåværende boligsituasjon
}

/** Enkel sparekonto for partner — ingen full transaksjonshistorikk */
export interface PartnerAccount {
  id: string
  label: string
  balance: number
  monthlyContribution: number
  rate: number   // % per år
  fromDate?: string   // ISO "YYYY-MM-DD" — innskudd starter fra denne måneden
  toDate?: string     // ISO "YYYY-MM-DD" — innskudd slutter etter denne måneden
  tieredRates?: TieredRate[]
  tieredRateHistory?: TieredRateHistoryEntry[]
  contributionPeriods?: ContributionPeriod[]  // alle perioder, for fullstendig simulering
  monthlyOverrides?: Record<string, number>   // key: "YYYY-M", value: kr/mnd — fra partners savingsOverrides
  futureContributions?: { date: string; amount: number }[]  // planlagte fremtidige innskudd
}

export interface PartnerDebt {
  id: string
  label: string
  currentBalance: number
  interestRate: number    // % per år
  monthlyPayment: number
}

export type PartnerBudgetCategory =
  | 'bolig' | 'transport' | 'mat' | 'helse' | 'abonnement'
  | 'forsikring' | 'klær' | 'fritid' | 'annet'

export interface PartnerBudgetLine {
  id: string
  label: string
  category: PartnerBudgetCategory
  amount: number   // månedlig beløp (positiv = utgift)
}

export interface PartnerAbsenceRecord {
  id: string
  type: 'syk' | 'egenmelding' | 'permisjon' | 'ferie' | 'annet'
  fromDate: string   // YYYY-MM-DD
  toDate: string     // YYYY-MM-DD
  days?: number
  notes?: string
}

export interface PartnerTaxSettlement {
  id: string
  year: number
  amount: number   // positiv = til gode, negativ = restskatt
  paidDate?: string
}

export interface PartnerFondHolding {
  id: string
  name: string
  type: 'indeks' | 'aktivt' | 'rente' | 'annet'
  currentValue: number   // kr
  returnPct?: number     // avkastning % (positiv eller negativ)
  monthlyContribution?: number
}

/** Partners tall brukt i Veikart og Dashboard */
export interface PartnerVeikart {
  enabled: boolean
  partnerName?: string         // visningsnavn for partner (f.eks. "Ane")
  annualIncome: number         // årslønn (brutto) — brukes til låneevne
  annualNetIncome: number      // årslønn (netto) — brukes til sparekraft
  equity: number               // legacy — erstattet av accounts
  bsu: number                  // BSU-saldo
  bsuMonthlyContribution: number // BSU-innskudd per måned
  bsuBirthYear?: number        // fødselsår — for BSU-aldersgrense
  monthlySavings: number       // legacy — erstattet av accounts
  accounts: PartnerAccount[]   // navngitte sparekontoer
  debt?: number                // legacy — samlet gjeld, erstattet av debts
  debts?: PartnerDebt[]        // gjeldsposter med beløp, rente og terminbeløp
  // Lønn / profil
  employer?: string
  taxWithholding?: number      // månedlig skattetrekk (kr)
  pensionPercent?: number      // pensjonsprosent (f.eks. 2)
  unionFee?: number            // fagforeningskontingent (kr/mnd)
  // Feriepenger
  feriepengerGrunnlag?: number // brutto lønn forrige år
  feriepengerRate?: number     // sats, f.eks. 10.2 eller 12
  // Fond
  fondCurrentValue?: number       // total fondverdi (manuelt eller synket)
  fondMonthlyContribution?: number // månedlig fondinnskudd
  fondHoldings?: PartnerFondHolding[]
  // Budsjett — månedlige utgiftsposter
  budgetLines?: PartnerBudgetLine[]
  // Fravær
  absenceRecords?: PartnerAbsenceRecord[]
  // Skatt
  taxSettlements?: PartnerTaxSettlement[]
}

/** Samlet ikke-BSU sparing for partner (fra accounts, faller tilbake på legacy-felt) */
export function partnerNonBsuEquity(p: PartnerVeikart): number {
  return (p.accounts?.length ?? 0) > 0 ? p.accounts.reduce((s, a) => s + (a.balance ?? 0), 0) : (p.equity ?? 0)
}

/** Samlet månedlig sparing eks. BSU for partner */
export function partnerMonthlySavingsTotal(p: PartnerVeikart): number {
  return (p.accounts?.length ?? 0) > 0 ? p.accounts.reduce((s, a) => s + (a.monthlyContribution ?? 0), 0) : (p.monthlySavings ?? 0)
}

// ------------------------------------------------------------
// PENSJON (2020-modellen, født 1963+)
// ------------------------------------------------------------

export interface PensionSettings {
  birthYear: number               // default fra userPreferences
  serviceStartYear: number        // yrkesstart / opptjeningsstart
  særalder: { enabled: boolean; age: 57 | 60 | 63 }  // FLAGGES USIKKER i UI
  afpEnabled: boolean             // antas oppfylt; kan skrus av
  assumptions: {
    salaryGrowthPct: number       // forventet årlig lønnsvekst, f.eks. 3
    gGrowthPct: number            // forventet G-regulering, f.eks. 3.5
  }
  officialEstimate?: number       // valgfritt norskpensjon.no-tall (krok for senere kalibrering)
}

export interface PensionPillarBreakdown {
  folketrygd: number              // kr/mnd
  spk: number                     // kr/mnd
  afp: number                     // kr/mnd
  særalder: number                // kr/mnd (0 hvis av)
}

export interface PensionProjection {
  uttaksalder: number
  perPilar: PensionPillarBreakdown
  monthlyTotal: number            // sum perPilar
  replacementRate: number         // monthlyTotal / (sluttlønn per mnd)
  confidence: 'lav' | 'middels'   // alltid ≤ middels (~40 års horisont)
}

// ------------------------------------------------------------
// FORMUE OVER TID
// ------------------------------------------------------------

export type NetWorthScope = 'din' | 'felles'

export interface NetWorthPoint {
  year: number
  month: number              // 1–12
  sparing: number
  fond: number
  ivf: number                // maks(0, kassesaldo)
  gjeld: number              // positivt tall (trekkes fra)
  total: number              // sparing + fond + ivf − gjeld
  isProjected: boolean       // false = faktisk (≤ nå), true = fremskrevet
}

export type NetWorthSeries = NetWorthPoint[]

export interface NetWorthInput {
  scope: NetWorthScope
  from: { year: number; month: number }
  to: { year: number; month: number }
  now: { year: number; month: number }
  savingsAccounts: SavingsAccount[]
  fondPortfolio: FondPortfolio
  ivfTransactions: IVFTransaction[]
  debts: DebtAccount[]
  partnerVeikart: PartnerVeikart
}

// ------------------------------------------------------------
// TREFFSIKKERHET / KALIBRERING
// ------------------------------------------------------------

export type CalibrationKey =
  | 'skattetrekk' | 'tabelltrekkProsent' | 'baseMonthly'
  | 'extraTaxWithholding' | 'housingDeduction' | 'unionFee'
  | `atf:${string}`

export interface CalibrationEntry {
  key: CalibrationKey
  label: string
  previous: number
  calibrated: number
  sampleCount: number
  asOf: string               // "YYYY-MM-DD"
  locked: boolean
}

/** Kalibrerte verdier som storen merger inn i profilen. */
export interface CalibratedValues {
  baseMonthly: number
  skattetrekk: number
  extraTaxWithholding: number
  housingDeduction: number
  unionFee: number
  tabelltrekkProsent: number | null
  atfRates: Record<string, number>   // artskode → snittet sats
}

export interface CalibrationResult {
  values: CalibratedValues
  entries: CalibrationEntry[]
}

export interface AccuracyReport {
  rows: {
    key: string
    label: string
    avgBudget: number
    avgActual: number
    deviation: number
    deviationPct: number
    sampleCount: number
  }[]
  overallHitRate: number     // 0–100: andel innenfor toleranse
  monthsWithData: number
}

export interface CalibrationSettings {
  enabled: boolean
  horizonSlips: number
}

// ------------------------------------------------------------
// SCENARIO-SIMULATOR (hva-skjer-hvis)
// ------------------------------------------------------------

export interface ScenarioOneTimeEvent {
  id: string
  label: string
  date: string               // "YYYY-MM-DD"
  amount: number             // + arv/bonus, − stor utgift
}

export interface ScenarioLevers {
  salaryPct: number           // ±% på brutto månedslønn
  salaryKr: number            // ±kr flat på brutto månedslønn
  rateDeltaPp: number         // ±prosentpoeng på rente (gjeld + sparing)
  monthlySavingsDelta: number // ±kr/mnd ekstra sparing
  oneTimeEvents: ScenarioOneTimeEvent[]
  extraNetToSavingsPct: number // andel av ekstra netto antatt spart (0–100)
}

export interface ScenarioKeyFigures {
  nettoPerMonth: number
  sparerate: number           // %
  netWorth5y: number
  purchasingPower: number     // maks kjøpesum
  pensionAt67: number         // kr/mnd
}

export interface ScenarioResult {
  baseline: { series: NetWorthSeries; figures: ScenarioKeyFigures }
  scenario: { series: NetWorthSeries; figures: ScenarioKeyFigures }
}

// ------------------------------------------------------------
// NØKKELTALL-REGISTER
// ------------------------------------------------------------

export type KeyFigureKey =
  | 'grunnbelop' | 'feriepengerProsent' | 'egenmeldingKvote'
  | 'folketrygdOpptjeningssats' | 'spkPaaslagLav' | 'spkPaaslagHoy' | 'afpOpptjeningssats'
  | 'takFolketrygdG' | 'takSpkG'
  | 'delingstall'
  // vises read-only i v1 (wires senere)
  | 'bsuMaxYearly' | 'bsuMaxTotal' | 'taxRules'

export type KeyFigureKind = 'scalar' | 'table'

export interface KeyFigureMeta {
  key: KeyFigureKey
  label: string
  group: 'pensjon' | 'sparing' | 'feriepenger' | 'fravaer' | 'skatt'
  unit: 'kr' | 'pst' | 'G' | 'antall' | 'tabell'
  kind: KeyFigureKind
  editable: boolean          // false = vises read-only i v1
  sourceUrl: string
  defaultVerifiedAt: string  // "YYYY-MM-DD"
}

export interface KeyFigureOverride {
  key: KeyFigureKey
  year: number               // gjelder fra dette året
  value: number | Record<number, number>  // scalar = number; table = blob
  verifiedAt: string         // "YYYY-MM-DD"
  source?: string
}

// ------------------------------------------------------------
// FORBRUKS-IMPORT + KATEGORISERING
// ------------------------------------------------------------

export interface BankSpendingTransaction {
  id: string
  date: string                 // "YYYY-MM-DD"
  counterpartyRaw: string      // "REMA 1000 OSLO 1234"
  counterpartyKey: string      // "rema 1000" (normalisert)
  amount: number               // signert; utgift = negativt
  category: BudgetCategory | null
  categorySource: 'seed' | 'learned' | 'manual' | 'none'
  importBatchId: string
}

export interface CategoryRule {
  id: string
  merchantKey: string          // normalisert motpart (learned: eksakt, seed: substring)
  category: BudgetCategory
  source: 'seed' | 'learned'
}
