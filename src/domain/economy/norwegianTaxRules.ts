/**
 * Norske skatteregler per inntektsår.
 * Kilde: Skatteetaten – github.com/skatteetaten/trekktabell (offisiell trekkrutine 2026)
 *
 * Trinnskatt-grenser og trygdeavgift-logikk er direkte hentet fra
 * Konstanter.java og Skatteberegning.java i det offisielle repositoriet.
 *
 * Skatteoppgjørsberegning (ikke trekkrutine):
 *  - Inntektsskatt 22 % (kommuneskatt 13.75 % + fellesskatt 8.25 %) av skattepliktig alminnelig inntekt
 *  - Trygdeavgift av personinntekt (med frigrense og overgangsregel)
 *  - Trinnskatt (progressiv av personinntekt)
 *  - Minstefradrag 46 % (trekkrutinen bruker 40.48 % — lavere for å sikre dekning)
 */

interface YearRules {
  alminneligInntektSats: number          // 22 % (kommuneskatt + fellesskatt)
  trygdeavgiftSats: number               // 7.6 % (2026)
  avgFriTrygdeavgift: number             // 99 650 — under denne: ingen trygdeavgift
  personfradrag: number
  minstefradragSats: number              // 46 %
  minstefradragMaks: number
  minstefradragMin: number
  fagforeningsfradragMaks: number
  bsuFradragSats: number                 // 10 %
  bsuMaksInnskuddPerAar: number          // 27 500
  reisefradragBunnfradrag: number        // 12 000 (2026)
  /** Trinnskatt-grenser (threshold = nedre grense for trinnet) */
  trinnskattBrackets: { threshold: number; rate: number }[]
}

const TAX_RULES: Record<number, YearRules> = {
  2024: {
    alminneligInntektSats: 22,
    trygdeavgiftSats: 7.8,
    avgFriTrygdeavgift: 99_650,
    personfradrag: 108_550,
    minstefradragSats: 46,
    minstefradragMaks: 104_450,
    minstefradragMin: 31_800,
    fagforeningsfradragMaks: 7_700,
    bsuFradragSats: 10,
    bsuMaksInnskuddPerAar: 27_500,
    reisefradragBunnfradrag: 14_400,
    // Kilde: Prop. 1 LS (2023–2024)
    trinnskattBrackets: [
      { threshold: 208_050, rate: 1.7 },
      { threshold: 292_850, rate: 4.0 },
      { threshold: 670_000, rate: 13.6 },
      { threshold: 937_900, rate: 16.6 },
      { threshold: 1_350_000, rate: 17.6 },
    ],
  },
  2025: {
    alminneligInntektSats: 22,
    trygdeavgiftSats: 7.7,
    avgFriTrygdeavgift: 99_650,
    personfradrag: 108_550,
    minstefradragSats: 46,
    minstefradragMaks: 92_000,
    minstefradragMin: 32_000,
    fagforeningsfradragMaks: 8_250,
    bsuFradragSats: 10,
    bsuMaksInnskuddPerAar: 27_500,
    reisefradragBunnfradrag: 14_400,
    trinnskattBrackets: [
      { threshold: 217_400, rate: 1.7 },
      { threshold: 306_050, rate: 4.0 },
      { threshold: 697_150, rate: 13.7 },
      { threshold: 942_400, rate: 16.7 },
      { threshold: 1_410_750, rate: 17.7 },
    ],
  },
  2026: {
    alminneligInntektSats: 22,
    trygdeavgiftSats: 7.6,
    avgFriTrygdeavgift: 99_650,
    personfradrag: 114_540,
    minstefradragSats: 46,
    minstefradragMaks: 95_700,
    minstefradragMin: 32_000,   // nedre grense for hjemmehørende lønnsmottakere — ikke publisert i satser-tabellen, uendret fra 2025
    fagforeningsfradragMaks: 8_700,
    bsuFradragSats: 10,
    bsuMaksInnskuddPerAar: 27_500,
    reisefradragBunnfradrag: 12_000,
    // Kilde (trekkrutine): https://raw.githubusercontent.com/skatteetaten/trekktabell/master/src/main/java/no/skatteetaten/fastsetting/formueinntekt/forskudd/trekkrutine2026/Konstanter.java (hentet 2026-06-16)
    // Kilde (skatteoppgjør/satser): https://www.regjeringen.no/no/tema/okonomi-og-budsjett/skatter-og-avgifter/skatte-og-avgiftssatser/skattesatser-2026/id3121978/ (hentet 2026-06-16)
    trinnskattBrackets: [
      { threshold: 226_100, rate: 1.7 },
      { threshold: 318_300, rate: 4.0 },
      { threshold: 725_050, rate: 13.7 },
      { threshold: 980_100, rate: 16.8 },
      { threshold: 1_467_200, rate: 17.8 },
    ],
  },
}

/** Henter skatteregler for gitt år. Faller tilbake på nyeste kjente år. */
export function getTaxRules(year: number): YearRules {
  if (TAX_RULES[year]) return TAX_RULES[year]
  const latest = Math.max(...Object.keys(TAX_RULES).map(Number))
  return TAX_RULES[latest]
}

export interface TaxDeductions {
  /** Fagforeningskontingent betalt dette året */
  fagforeningskontingent?: number
  /** BSU-innskudd dette året (brukes for skattefradrag) */
  bsuInnskuddThisYear?: number
  /** Premie til pensjonsordning i arbeidsforhold */
  pensjonspremie?: number
  /** Gjeldsrenter / renteutgifter på lån */
  gjeldsrenter?: number
  /** Renteinntekter fra bank og andre */
  renteinntekter?: number
  /**
   * Brutto reiseutgifter hjem–jobb.
   * Fradraget er kun beløpet som overstiger bunnfradraget (14 400 kr i 2025, 12 000 kr i 2026).
   */
  reisefradragBrutto?: number
  /** Overskudd av utgiftsgodtgjørelse (legges til personinntekt) */
  utgiftsgodtgjoerelseOverskudd?: number
}

export interface NorwegianTaxBreakdown {
  // ── Inntekt ──
  personinntekt: number
  renteinntekter: number
  utgiftsgodtgjoerelseOverskudd: number
  // ── Fradrag fra alminnelig inntekt ──
  minstefradrag: number
  fagforeningsfradrag: number
  pensjonspremie: number
  gjeldsrenter: number
  reisefradrag: number                      // etter bunnfradrag
  // ── Beregningsgrunnlag ──
  alminneligInntekt: number
  skattepliktigAlminneligInntekt: number
  // ── Skattekomponenter ──
  inntektsskatt: number
  trygdeavgift: number
  trinnskatt: number
  // ── Skattefradrag ──
  bsuSkattefradrag: number
  // ── Totalt ──
  beregnetSkatt: number
  skattEtterFradrag: number
}

/**
 * Beregner norsk inntektsskatt for lønnsmottakere.
 * Speiler Skatteetatens skatteoppgjørskalkulator.
 *
 * Trinnskatt og trygdeavgift er implementert etter den offisielle
 * trekkrutinen publisert på github.com/skatteetaten/trekktabell.
 *
 * @param bruttolonnsinntekt  Årslønn (før godtgjørelser)
 * @param year                Inntektsår
 * @param deductions          Valgfrie fradrag og tilleggsinntekter
 */
export function calcNorwegianTax(
  bruttolonnsinntekt: number,
  year: number,
  deductions: TaxDeductions = {},
): NorwegianTaxBreakdown {
  const rules = getTaxRules(year)

  const utgiftsgodtgjoerelseOverskudd = deductions.utgiftsgodtgjoerelseOverskudd ?? 0
  const renteinntekter = deductions.renteinntekter ?? 0

  // Personinntekt = grunnlag for trygdeavgift og trinnskatt
  const personinntekt = bruttolonnsinntekt + utgiftsgodtgjoerelseOverskudd

  // --- Minstefradrag (46 % av personinntekt, min/maks) ---
  const minstefradragRaw = personinntekt * (rules.minstefradragSats / 100)
  const minstefradrag = Math.min(rules.minstefradragMaks, Math.max(rules.minstefradragMin, minstefradragRaw))

  // --- Fagforeningsfradrag ---
  const fagforeningsfradrag = Math.min(
    deductions.fagforeningskontingent ?? 0,
    rules.fagforeningsfradragMaks,
  )

  const pensjonspremie = deductions.pensjonspremie ?? 0
  const gjeldsrenter = deductions.gjeldsrenter ?? 0

  // --- Reisefradrag (kun beløp over bunnfradraget) ---
  const reisefradrag = Math.max(0, (deductions.reisefradragBrutto ?? 0) - rules.reisefradragBunnfradrag)

  // --- Alminnelig inntekt ---
  const alminneligInntekt = Math.max(0,
    personinntekt
    + renteinntekter
    - minstefradrag
    - fagforeningsfradrag
    - pensjonspremie
    - gjeldsrenter
    - reisefradrag,
  )

  const skattepliktigAlminneligInntekt = Math.max(0, alminneligInntekt - rules.personfradrag)

  // --- Inntektsskatt (22 % = kommuneskatt 13.75 % + fellesskatt 8.25 %) ---
  const inntektsskatt = Math.round(skattepliktigAlminneligInntekt * (rules.alminneligInntektSats / 100))

  // --- Trygdeavgift med frigrense og overgangsregel ---
  // Kilde: Skatteberegning.java i github.com/skatteetaten/trekktabell
  const trygdeavgift = calcTrygdeavgift(personinntekt, rules)

  // --- Trinnskatt ---
  // Kilde: Skatteberegning.java / Konstanter.java i github.com/skatteetaten/trekktabell
  const trinnskatt = Math.round(calcTrinnskatt(personinntekt, rules.trinnskattBrackets))

  // --- BSU-skattefradrag ---
  const bsuInnskudd = Math.min(deductions.bsuInnskuddThisYear ?? 0, rules.bsuMaksInnskuddPerAar)
  const bsuSkattefradrag = Math.round(bsuInnskudd * (rules.bsuFradragSats / 100))

  const beregnetSkatt = inntektsskatt + trygdeavgift + trinnskatt
  const skattEtterFradrag = Math.max(0, beregnetSkatt - bsuSkattefradrag)

  return {
    personinntekt,
    renteinntekter,
    utgiftsgodtgjoerelseOverskudd,
    minstefradrag,
    fagforeningsfradrag,
    pensjonspremie,
    gjeldsrenter,
    reisefradrag,
    alminneligInntekt,
    skattepliktigAlminneligInntekt,
    inntektsskatt,
    trygdeavgift,
    trinnskatt,
    bsuSkattefradrag,
    beregnetSkatt,
    skattEtterFradrag,
  }
}

/**
 * Trygdeavgift med frigrense og overgangsregel.
 * Under avgFriTrygdeavgift (99 650 kr): ingen avgift.
 * I overgangszone (99 650–143 175 kr): 25 % av beløpet over frigrensen
 *   — sikrer at skattyter ikke taper på å tjene litt over grensen.
 * Over grensen: ordinær sats (7.6 % i 2026).
 * Kilde: Skatteberegning.java / Konstanter.java, skatteetaten/trekktabell
 */
export function calcTrygdeavgift(income: number, rules: YearRules): number {
  const fri = rules.avgFriTrygdeavgift
  const sats = rules.trygdeavgiftSats / 100
  // Øvre grense for overgangsregelen: fri * 25% / (25% - sats)
  const hoyGrense = Math.round((fri * 0.25) / (0.25 - sats))

  if (income < fri) return 0
  if (income > hoyGrense) return Math.round(income * sats)
  // Overgangsregel: 25 % av (inntekt - frigrense)
  return Math.round((income - fri) * 0.25)
}

/**
 * Beregner forventet månedlig skattetrekk etter Skatteetatens trekkrutine.
 *
 * Trekkrutinen annualiserer månedsinntekten, beregner årskatten og deler på 12.
 * Den bruker et lavere minstefradrag (40.48 %) enn skatteoppgjøret (46 %) for å
 * sikre at trekket dekker den endelige skatten.
 *
 * Kilde: Skatteberegning.java / Konstanter.java, skatteetaten/trekktabell
 *
 * @param monthlyIncome  Månedlig bruttoinntekt (lønn + tillegg)
 * @param year           Inntektsår
 * @returns              Forventet månedlig skattetrekk (positivt tall, avrundet)
 */
export function calcMonthlyTaxWithholding(monthlyIncome: number, year: number): number {
  if (monthlyIncome <= 0) return 0
  const rules = getTaxRules(year)

  // Trekkrutinen annualiserer for å finne riktig skatteklasse og -sats
  const annualIncome = monthlyIncome * 12

  // Minstefradrag: 40.48 % (trekkrutine) — lavere enn 46 % (skatteoppgjøret)
  // Kilde: Konstanter.java MINSTEFRADRAGSSATS_LONN = 40.48
  const TREKKRUTINE_MINSTEFRADRAG_SATS = 40.48
  const minstefradragRaw = annualIncome * (TREKKRUTINE_MINSTEFRADRAG_SATS / 100)
  const minstefradrag = Math.min(
    rules.minstefradragMaks,
    Math.max(rules.minstefradragMin, minstefradragRaw),
  )

  const skattepliktig = Math.max(0, annualIncome - minstefradrag - rules.personfradrag)
  const inntektsskatt = Math.round(skattepliktig * (rules.alminneligInntektSats / 100))
  const trygdeavgift = calcTrygdeavgift(annualIncome, rules)
  const trinnskatt = Math.round(calcTrinnskatt(annualIncome, rules.trinnskattBrackets))

  return Math.round((inntektsskatt + trygdeavgift + trinnskatt) / 12)
}

/**
 * Trinnskatt beregnet etter Skatteetatens offisielle metode.
 * Kilde: Skatteberegning.java, skatteetaten/trekktabell
 */
export function calcTrinnskatt(income: number, brackets: { threshold: number; rate: number }[]): number {
  const sorted = [...brackets].sort((a, b) => a.threshold - b.threshold)
  let tax = 0
  for (let i = 0; i < sorted.length; i++) {
    const lower = sorted[i].threshold
    if (income <= lower) break
    const upper = sorted[i + 1]?.threshold ?? Infinity
    const taxable = Math.min(income, upper) - lower
    tax += taxable * (sorted[i].rate / 100)
  }
  return Math.max(0, tax)
}
