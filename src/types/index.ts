// ============================================================
// BOLIGKALKULATOR - Sentrale TypeScript-interfaces
// ============================================================

// ------------------------------------------------------------
// INPUT-TYPER
// ------------------------------------------------------------

/** Informasjon om boligen som vurderes kjøpt */
export interface PropertyInput {
  /** Prisantydning / kjøpspris i NOK */
  price: number
  /** Adresse (valgfri for visning) */
  address?: string
  /** Eierform: selveier (dok.avgift 2.5%), andel/borettslag (0%), aksje (0%) */
  ownershipType?: 'selveier' | 'andel' | 'aksje'
  /** Boligtype */
  type: 'leilighet' | 'enebolig' | 'rekkehus' | 'tomannsbolig' | 'fritidsbolig'
  /** Areal i kvm */
  size?: number
  /** Byggeår */
  builtYear?: number
  /** Kommunenummer (for kommunale gebyrer) */
  municipalityCode?: string
  /** Kommunenavn */
  municipalityName?: string
  /** Andel fellesgjeld (for seksjon/andel) */
  sharedDebt?: number
  /** Andel fellesformue */
  sharedAssets?: number
  /** Fellesutgifter per måned i NOK */
  monthlyFee?: number
  /** Eiendomsskatt per år i NOK */
  propertyTax?: number
}

/** Informasjon om en enkelt søker */
export interface ApplicantInput {
  /** Årsbruttoinntekt i NOK */
  grossIncome: number
  /** Annen årsinntekt (leieinntekt, utbytte, etc.) */
  otherIncome?: number
  /** Eksisterende gjeld i NOK (billån, studielån, etc.) */
  existingDebt?: number
  /** Alder */
  age?: number
  /** Navn/etikett for visning */
  label?: string
}

/** Husstandsinformasjon */
export interface HouseholdInput {
  /** Primær søker */
  primaryApplicant: ApplicantInput
  /** Medsøker (valgfri) */
  coApplicant?: ApplicantInput
  /** Antall barn (0-17 år) */
  children: number
  /** Antall småbarn (0-3 år) - subset av children */
  infantsUnder4?: number
  /** Antall barn 4-10 år - subset av children */
  childrenAge4to10?: number
  /** Totalt antall voksne i husstanden (inkl. søkere) */
  adults: number
}

/** Lånevurderingsparametere */
export interface LoanParametersInput {
  /** Egenkapital søkerne stiller med i NOK */
  equity: number
  /** Nominalrente i prosent (f.eks. 5.5) */
  interestRate: number
  /** Lånetid i år */
  loanTermYears: number
  /** Type lån */
  loanType: 'annuitet' | 'serie'
  /** Bankens krav til betjeningsevne (stresstest-rente) - overstyr config */
  stressTestRate?: number
  /** Ekstra månedlige kostnader husstanden har (barnehage, bilkostnader, etc.) */
  extraMonthlyExpenses?: number
  /** Kausjon (realkausjon) i NOK — løfter egenkapitalkravet i kalkulatoren. */
  kausjon?: number
  /** Kausjonistens boligverdi i NOK (for sjekk av fri pantesikkerhet). */
  guarantorHomeValue?: number
  /** Kausjonistens restgjeld på egen bolig i NOK. */
  guarantorMortgage?: number
  /** Valgfri målpris (NOK): regn ut hvor mye kausjon som trengs for å nå denne. */
  kausjonTargetPrice?: number
  /** Finansier alle kjøpsgebyrer i lånets saldo (true) eller betal kontant av EK (false) */
  financeAllFees?: boolean
  /** Renteendring i nedbetalingsplanen (simulering) */
  rateChange?: { fromMonth: number; newRate: number }
  /** Ekstra innbetaling i nedbetalingsplanen (simulering) */
  extraPayment?: { fromMonth: number; amount: number; strategy: 'shorten' | 'reduce' }
}

/** Ekstra scenario-justeringer (Plan B / hva-om) */
export interface ExtraScenarioInput {
  /** Ny årsbruttoinntekt for primær søker */
  primaryIncome?: number
  /** Ny årsbruttoinntekt for medsøker */
  coApplicantIncome?: number
  /** Ny egenkapital */
  equity?: number
  /** Ny rente */
  interestRate?: number
  /** Ny lånetid */
  loanTermYears?: number
  /** Ny boligpris */
  propertyPrice?: number
  /** Ny eksisterende gjeld */
  existingDebt?: number
}

/** Planlagte livsendringer for fremtidsscenario */
export interface PlanChangesInput {
  /** Antall måneder frem i tid fra kjøpstidspunkt */
  monthsFromNow: number
  /** Inntektsendring i NOK (positiv = økning) */
  incomeDelta?: number
  /** Ekstra engangsutgift i NOK (oppussing, etc.) */
  oneTimeExpense?: number
  /** Endring i månedlige utgifter i NOK */
  monthlyExpenseDelta?: number
  /** Beskrivelse av endringen */
  description?: string
}

/** Innstillinger for fordeling av eierskap/gjeld mellom søkerne */
export interface DistributionInput {
  /** Prosentandel for primær søker (0-100) */
  primaryShare: number
  /** Om fordelingen skal være lik uavhengig av inntekt */
  equalSplit?: boolean
  /** Manuell overstyring av egenkapitalbidrag per søker i NOK */
  primaryEquityContribution?: number
  coApplicantEquityContribution?: number
}

/** Komplett scenarioinput */
export interface ScenarioInput {
  id: string
  label: string
  property: PropertyInput
  household: HouseholdInput
  loanParameters: LoanParametersInput
  distribution?: DistributionInput
  planChanges?: PlanChangesInput[]
  extraScenario?: ExtraScenarioInput
  /** Kjøpsår — styrer år-bevisst forhåndsfyll fra profil/partner. Default = inneværende år. */
  purchaseYear?: number
  /** Tidsstempel for når scenariet ble opprettet */
  createdAt: number
  /** Om dette er basisscenario */
  isBase?: boolean
  /** Øyeblikksbilde fra «Bruk min profil» — grunnlag for ferskhets-indikatoren */
  bridgeSnapshot?: {
    syncedAt: number
    equity: number
    grossIncome: number
    existingDebt: number
  }
}

// ------------------------------------------------------------
// ANALYSE-TYPER (OUTPUT)
// ------------------------------------------------------------

/** Egenkapitalanalyse */
export interface EquityAnalysis {
  /** Tilgjengelig egenkapital i NOK */
  availableEquity: number
  /** Påkrevd minimum egenkapital i NOK */
  requiredEquity: number
  /** Egenkapitalprosent (availableEquity / propertyPrice) */
  equityPercent: number
  /** Minimum egenkapitalprosent ifølge reglene (typisk 15%) */
  requiredEquityPercent: number
  /** Godkjent: nok EK */
  approved: boolean
  /** Overskudd/underskudd av EK i NOK */
  equityBuffer: number
  /** Fellesgjeld inkludert i totalpris */
  sharedDebtIncluded: number
}

/** Gjeldsgradsanalyse */
export interface DebtRatioAnalysis {
  /** Total gjeld etter kjøp (lån + eksisterende gjeld) */
  totalDebt: number
  /** Total årsinntekt for husstanden */
  totalAnnualIncome: number
  /** Gjeldsgrad (totalDebt / totalAnnualIncome) */
  debtRatio: number
  /** Maksimal tillatt gjeldsgrad ifølge reglene (typisk 5.0) */
  maxDebtRatio: number
  /** Godkjent: gjeldsgrad innenfor grensen */
  approved: boolean
  /** Maksimalt tillatt total gjeld gitt inntekten */
  maxAllowedDebt: number
  /** Rommet i NOK for mer gjeld */
  debtBuffer: number
}

/** Betjeningsevneanalyse (stresstest) */
export interface AffordabilityAnalysis {
  /** Månedlig nettoinntekt etter skatt (estimert) */
  monthlyNetIncome: number
  /** Månedlig terminbeløp ved normal rente */
  monthlyPaymentNormal: number
  /** Månedlig terminbeløp ved stresstestrente */
  monthlyPaymentStress: number
  /** Stresstestrente brukt i beregningen */
  stressTestRate: number
  /** SIFO-referansebudsjett for husstanden */
  sifoExpenses: number
  /** Andre månedlige utgifter (boligkostnader, fellesutgifter, etc.) */
  otherMonthlyExpenses: number
  /** Beregnet månedlig betjening av eksisterende gjeld ved stressrente (annuitet) */
  existingDebtServicing: number
  /** Beregnet disponibelt beløp etter alle kostnader (stresstest) */
  disposableAmount: number
  /** Godkjent: positiv betjeningsevne ved stresstest */
  approved: boolean
  /** Nedre grense for akseptabelt disponibelt beløp */
  minimumDisposable: number
}

/** Analyse av boligpris i forhold til EK og regler */
export interface PropertyAnalysis {
  /** Kjøpspris */
  purchasePrice: number
  /** Dokumentavgift i NOK */
  stampDuty: number
  /** Tinglysingsgebyr lån */
  mortgageRegistrationFee: number
  /** Tinglysingsgebyr eiendom */
  propertyRegistrationFee: number
  /** Meglerkostnader (typisk 0 for kjøper) */
  buyerCosts: number
  /** Total anskaffelseskost (pris + alle gebyrer) */
  totalAcquisitionCost: number
  /** Lånebeløp */
  loanAmount: number
  /** Belåningsgrad (loanAmount / purchasePrice) */
  ltvRatio: number
  /** Maksimal tillatt belåningsgrad */
  maxLtvRatio: number
}

/** Beregning av maksimalt kjøpsbeløp */
export interface MaxPurchaseAnalysis {
  /** Maks kjøpspris basert på EK-krav */
  maxByEquity: number
  /** Maks kjøpspris basert på gjeldsgrad */
  maxByDebtRatio: number
  /** Maks kjøpspris basert på betjeningsevne */
  maxByAffordability: number
  /** Bindende maks (minimum av alle tre) */
  maxPurchasePrice: number
  /** Hvilken faktor som begrenser */
  limitingFactor: 'equity' | 'debtRatio' | 'affordability'
  /** Tilhørende maksimalt lånebeløp */
  maxLoanAmount: number
  /** Kausjon (realkausjon) brukt som egenkapital-ekvivalent i EK-regelen. 0 = ingen. */
  kausjonApplied: number
  /** Maks kjøpspris UTEN kausjon (samme tre grenser, kausjon=0) — for å vise løftet. */
  maxPriceWithoutKausjon: number
  /** Taket kausjon ikke kommer forbi = min(gjeldsgrad, betjeningsevne). */
  kausjonCeiling: number
  /** Kausjonistens frie pantesikkerhet (homeValue×0.9 − restgjeld). Kun satt når kausjonist-bolig er oppgitt. */
  guarantorFreeCollateral?: number
  /** Revers: hvor mye kausjon trengs for en målpris. Kun satt når målpris er oppgitt. */
  kausjonForTarget?: { targetPrice: number; kausjonNeeded: number; reachable: boolean; ceiling: number }
}

/** Regelmelding fra vurderingen */
export interface RuleMessage {
  /** Unikt id */
  id: string
  /** Alvorlighetsgrad */
  severity: 'error' | 'warning' | 'info' | 'success'
  /** Kode for regelen (f.eks. "EK_INSUFFICIENT") */
  code: string
  /** Leselig tittel */
  title: string
  /** Detaljert melding */
  message: string
  /** Tallopplysninger koblet til meldingen */
  value?: number
  /** Terskel/grense koblet til meldingen */
  threshold?: number
}

/** Overordnet status for et scenario */
export interface ScenarioStatus {
  /** Om låneopptaket totalt sett er godkjent av alle regler */
  approved: boolean
  /** Individuelle regelresultater */
  equityApproved: boolean
  debtRatioApproved: boolean
  affordabilityApproved: boolean
  /** Belåningsgrad innenfor maksgrensen */
  ltvApproved: boolean
  /** Alle regelmeldinger */
  messages: RuleMessage[]
  /** Antall feil */
  errorCount: number
  /** Antall advarsler */
  warningCount: number
}

/** Komplett låneanalyse for ett scenario */
export interface LoanAnalysis {
  scenarioId: string
  scenarioLabel: string
  /** Analyserte boligdata */
  property: PropertyAnalysis
  /** Egenkapitalanalyse */
  equity: EquityAnalysis
  /** Gjeldsgradsanalyse */
  debtRatio: DebtRatioAnalysis
  /** Betjeningsevneanalyse */
  affordability: AffordabilityAnalysis
  /** Maksimalt kjøpsbeløp */
  maxPurchase: MaxPurchaseAnalysis
  /** Overordnet status */
  status: ScenarioStatus
  /** Beregnet tidsstempel */
  calculatedAt: number
}

// ------------------------------------------------------------
// AMORTISERINGSPLAN
// ------------------------------------------------------------

/** En enkelt rad i amortiseringsplanen */
export interface AmortizationRow {
  /** Månedsnummer (1-basert) */
  month: number
  /** År (1-basert) */
  year: number
  /** Terminbeløp (renter + avdrag) */
  payment: number
  /** Rentedel av terminbeløpet */
  interest: number
  /** Avdragsdel av terminbeløpet */
  principal: number
  /** Gjenstående gjeld etter betaling */
  balance: number
  /** Akkumulert betalt rente hittil */
  cumulativeInterest: number
  /** Akkumulert betalt avdrag hittil */
  cumulativePrincipal: number
}

/** Komplett amortiseringsplan */
export interface AmortizationPlan {
  scenarioId: string
  /** Opprinnelig lånebeløp */
  loanAmount: number
  /** Rente brukt */
  interestRate: number
  /** Lånetype */
  loanType: 'annuitet' | 'serie'
  /** Antall måneder */
  termMonths: number
  /** Alle rader */
  rows: AmortizationRow[]
  /** Totalt betalt rente over hele lånets levetid */
  totalInterestPaid: number
  /** Totalt betalt (renter + avdrag) */
  totalPaid: number
  /** Årlige sammendrag */
  yearlyTotals: {
    year: number
    totalPayment: number
    totalInterest: number
    totalPrincipal: number
    endBalance: number
    /** Merket som renteendringsår (for grafvisning) */
    isRateChangeYear?: boolean
  }[]
  /** Simuleringsmetadata */
  rateChangeMonth?: number
  newRateAfterChange?: number
  extraPaymentFromMonth?: number
  interestSavedByExtraPayment?: number
  monthsSavedByExtraPayment?: number
  originalTermMonths?: number
}

// ------------------------------------------------------------
// FORDELINGSPLAN (mellom søkerne)
// ------------------------------------------------------------

/** En rad i fordelingsplanen */
export interface DistributionRow {
  /** Etikett */
  label: string
  /** Primær søkers andel i NOK */
  primaryAmount: number
  /** Medsøkers andel i NOK */
  coApplicantAmount?: number
  /** Primær søkers andel i prosent */
  primaryPercent: number
  /** Medsøkers andel i prosent */
  coApplicantPercent?: number
}

/** Komplett fordelingsplan mellom søkerne */
export interface DistributionPlan {
  scenarioId: string
  primaryLabel: string
  coApplicantLabel?: string
  /** Eierbrøken */
  ownershipSplit: DistributionRow
  /** Gjeldsfordeling */
  debtSplit: DistributionRow
  /** EK-bidrag */
  equitySplit: DistributionRow
  /** Månedlig terminbetaling fordelt */
  paymentSplit: DistributionRow
  /** Anbefalt eierbrøk basert på EK-bidrag og inntekt */
  recommendedOwnershipPercent: number
  /** Notater / forklaringer */
  notes: string[]
}

// ------------------------------------------------------------
// APP-KONFIGURASJON
// ------------------------------------------------------------

/** SIFO-referansebudsjett satser */
export interface SIFOConfig {
  /** Voksen (18+ år) per måned */
  adultMonthly: number
  /** Barn 0-3 år per måned */
  infantMonthly: number
  /** Barn 4-6 år per måned */
  child4to6Monthly: number
  /** Barn 7-10 år per måned */
  child7to10Monthly: number
  /** Barn 11-13 år per måned */
  child11to13Monthly: number
  /** Barn 14-17 år per måned */
  child14to17Monthly: number
}

/** Gebyrkonfigurasjon */
export interface FeesConfig {
  /** Dokumentavgift i prosent (typisk 2.5%) */
  stampDutyPercent: number
  /** Tinglysingsgebyr for pantedokument i NOK */
  mortgageRegistrationFee: number
  /** Tinglysingsgebyr for skjøte i NOK */
  propertyRegistrationFee: number
  /** Etableringsgebyr lån i NOK */
  loanEstablishmentFee: number
  /** Termingebyr per måned i NOK */
  termFee: number
}

/** Regler for lånopptak */
export interface LendingRulesConfig {
  /** Minimum egenkapitalprosent (15 = 15%) */
  minEquityPercent: number
  /** Maksimal gjeldsgrad (5.0 = 5x årsinntekt) */
  maxDebtRatio: number
  /** Stresspåslag i prosentpoeng over nominell rente (typisk 3.0) */
  stressTestAddition: number
  /** Minimum nominell rente for stresstest (slik at stressrenten aldri er lavere) */
  minStressTestRate: number
  /** Maksimal belåningsgrad (LTV) for lån uten tilleggssikkerhet */
  maxLtvRatio: number
}

/** Standardverdier for lån */
export interface LoanDefaultsConfig {
  /** Standard nominell rente i prosent */
  defaultInterestRate: number
  /** Standard lånetid i år */
  defaultLoanTermYears: number
  /** Standard lånetype */
  defaultLoanType: 'annuitet' | 'serie'
}

/** UI-konfigurasjon */
export interface UIConfig {
  /** Standard tema */
  defaultTheme: 'dark' | 'light' | 'system'
  /** Valuta-symbol */
  currencySymbol: string
  /** Locale for tallformatering */
  locale: string
  /** Antall desimaler for prosenter */
  percentDecimals: number
  /** Antall desimaler for NOK-beløp */
  amountDecimals: number
}

/** Komplett appkonfigurasjon */
export interface AppConfig {
  /** Versjon av konfigurasjonen */
  version: string
  /** SIFO-satser */
  sifo: SIFOConfig
  /** Gebyrer */
  fees: FeesConfig
  /** Utlånsregler */
  lendingRules: LendingRulesConfig
  /** Standardverdier for lån */
  loanDefaults: LoanDefaultsConfig
  /** UI-konfigurasjon */
  ui: UIConfig
}
