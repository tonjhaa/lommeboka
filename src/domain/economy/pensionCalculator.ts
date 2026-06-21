// ============================================================
// PENSJONSKALKULATOR — 2020-modellen (født 1963+)
// Rene funksjoner. Satser/tabeller injiseres for deterministisk testing.
// Kildeforankring: navikt/pensjonssimulator (se design-spec).
// ============================================================

import {
  FOLKETRYGD_OPPTJENINGSSATS,
  TAK_FOLKETRYGD_G,
  SPK_PAASLAG_SATS_LAV,
  SPK_PAASLAG_SATS_HOY,
  TAK_SPK_G,
  AFP_OPPTJENINGSSATS,
  getDelingstall,
  MIN_UTTAKSALDER,
  GRUNNBELOP_NOK,
} from '@/config/economy.config'
import type { PensionProjection, PensionSettings, EmploymentProfile } from '@/types/economy'

/**
 * Variable tillegg (ATF) teller i folketrygdgrunnlaget, men ikke i SPK-grunnlaget.
 * Grovt anslag: folketrygdinntekt ≈ SPK-grunnlag + 5 %.
 */
const FOLKETRYGD_TILLEGG_FAKTOR = 1.05

interface IncomeProjectionParams {
  currentYear: number
  currentAnnualIncome: number
  fromYear: number
  toYear: number
  growthPct: number
}

/** Årlig inntekt skalert med vekst relativt til currentYear, for [fromYear, toYear]. */
export function buildIncomeProjection(p: IncomeProjectionParams): Record<number, number> {
  const out: Record<number, number> = {}
  for (let y = p.fromYear; y <= p.toYear; y++) {
    out[y] = p.currentAnnualIncome * Math.pow(1 + p.growthPct / 100, y - p.currentYear)
  }
  return out
}

interface GProjectionParams {
  currentYear: number
  currentG: number
  fromYear: number
  toYear: number
  gGrowthPct: number
}

/** Årlig grunnbeløp framskrevet med gGrowthPct fra currentYear. */
export function buildGProjection(p: GProjectionParams): Record<number, number> {
  const out: Record<number, number> = {}
  for (let y = p.fromYear; y <= p.toYear; y++) {
    out[y] = p.currentG * Math.pow(1 + p.gGrowthPct / 100, y - p.currentYear)
  }
  return out
}

/** Folketrygdens pensjonsbeholdning: 18,1 % av inntekt ≤ 7,1G, summert over år. */
export function accrueFolketrygdBeholdning(
  incomeByYear: Record<number, number>,
  gByYear: Record<number, number>,
  opptjeningssats: number = FOLKETRYGD_OPPTJENINGSSATS,
  takG: number = TAK_FOLKETRYGD_G,
): number {
  let beholdning = 0
  for (const [yearStr, income] of Object.entries(incomeByYear)) {
    const year = Number(yearStr)
    const g = gByYear[year]
    if (!g) continue
    const tak = takG * g
    beholdning += Math.min(income, tak) * opptjeningssats
  }
  return beholdning
}

/** Årlig ytelse = beholdning / delingstall. */
export function annualFromBeholdning(beholdning: number, delingstall: number): number {
  return delingstall > 0 ? beholdning / delingstall : 0
}

/** Sum av pensjonsgivende inntekt kappet ved 7,1G per år (AFP-grunnlag). */
export function sumLivsinntektUnder7_1G(
  incomeByYear: Record<number, number>,
  gByYear: Record<number, number>,
  takG: number = TAK_FOLKETRYGD_G,
): number {
  let sum = 0
  for (const [yearStr, income] of Object.entries(incomeByYear)) {
    const g = gByYear[Number(yearStr)]
    if (!g) continue
    sum += Math.min(income, takG * g)
  }
  return sum
}

/** Ny livsvarig offentlig AFP: livsinntekt ≤ 7,1G × 4,21 % / delingstall. */
export function annualAfp(livsinntektUnder7_1G: number, delingstall: number, afpSats: number = AFP_OPPTJENINGSSATS): number {
  return delingstall > 0 ? (livsinntektUnder7_1G * afpSats) / delingstall : 0
}

/** SPK påslagsbeholdning: 5,7 % av grunnlag ≤ 12G + 18,1 % av båndet 7,1G–12G. */
export function accrueSpkPaaslagBeholdning(
  grunnlagByYear: Record<number, number>,
  gByYear: Record<number, number>,
  spkLav: number = SPK_PAASLAG_SATS_LAV,
  spkHoy: number = SPK_PAASLAG_SATS_HOY,
  takSpkG: number = TAK_SPK_G,
  takFtG: number = TAK_FOLKETRYGD_G,
): number {
  let beholdning = 0
  for (const [yearStr, grunnlag] of Object.entries(grunnlagByYear)) {
    const year = Number(yearStr)
    const g = gByYear[year]
    if (!g) continue
    const lavtGrunnlag = Math.min(grunnlag, takSpkG * g)
    const baandStart = takFtG * g
    const baand = Math.max(0, Math.min(grunnlag, takSpkG * g) - baandStart)
    beholdning += lavtGrunnlag * spkLav + baand * spkHoy
  }
  return beholdning
}

/**
 * Domenelagets input. Bevisst «flatet» variant av PensionSettings (assumptions
 * pakket ut til salaryGrowthPct/gGrowthPct) + avledede inntektsgrunnlag, slik at
 * funksjonen er enkel å teste isolert.
 */
export interface PensionInput {
  birthYear: number
  serviceStartYear: number
  currentYear: number
  currentG: number
  folketrygdAnnualIncome: number   // dagens årsinntekt inkl. ATF/tillegg (folketrygdgrunnlag)
  spkAnnualGrunnlag: number        // dagens SPK-grunnlag (fast lønn + faste tillegg)
  uttaksalder: number
  salaryGrowthPct: number
  gGrowthPct: number
  afpEnabled: boolean
  særalder: { enabled: boolean; age: 57 | 60 | 63 }
  /** Valgfri delingstall-tabell (fra register). Default = DELINGSTALL_BASELINE via getDelingstall. */
  delingstallTable?: Record<number, number>
  /** Valgfrie satser (fra register). Default = kode-konstantene. */
  rates?: {
    folketrygd?: number; spkLav?: number; spkHoy?: number; afp?: number
    takFolketrygdG?: number; takSpkG?: number
  }
}

const MIN_BIRTH_YEAR_NY_MODELL = 1963

/** Tilnærmet særalderspåslag — FORELØPIG, regelverk under utvikling. */
function estimateSæralder(input: PensionInput, folketrygdAarlig: number): number {
  if (!input.særalder.enabled) return 0
  // Forenklet: et livsvarig påslag som kompenserer for tidligere uttak,
  // grovt anslått som 10 % av folketrygdytelsen. Merkes «usikker» i UI.
  return folketrygdAarlig * 0.10
}

/** Hovedfunksjon: prognose for én uttaksalder. */
export function projectPension(input: PensionInput): PensionProjection {
  if (input.birthYear < MIN_BIRTH_YEAR_NY_MODELL) {
    throw new Error(`Pensjonsmodulen støtter kun ny modell (født ${MIN_BIRTH_YEAR_NY_MODELL}+)`)
  }
  const uttaksaar = input.birthYear + Math.max(input.uttaksalder, MIN_UTTAKSALDER)
  const fromYear = input.serviceStartYear
  const toYear = uttaksaar - 1 // opptjening til og med året før uttak
  if (toYear < fromYear) {
    throw new Error(`Ugyldig yrkesstart: serviceStartYear ${fromYear} er etter uttaksår ${uttaksaar}`)
  }

  const gByYear = buildGProjection({
    currentYear: input.currentYear, currentG: input.currentG,
    fromYear, toYear, gGrowthPct: input.gGrowthPct,
  })
  const ftIncome = buildIncomeProjection({
    currentYear: input.currentYear, currentAnnualIncome: input.folketrygdAnnualIncome,
    fromYear, toYear, growthPct: input.salaryGrowthPct,
  })
  const spkGrunnlag = buildIncomeProjection({
    currentYear: input.currentYear, currentAnnualIncome: input.spkAnnualGrunnlag,
    fromYear, toYear, growthPct: input.salaryGrowthPct,
  })

  const delingstall = getDelingstall(input.uttaksalder, input.delingstallTable)

  const r = input.rates ?? {}
  const ftSats = r.folketrygd ?? FOLKETRYGD_OPPTJENINGSSATS
  const takFtG = r.takFolketrygdG ?? TAK_FOLKETRYGD_G
  const spkLav = r.spkLav ?? SPK_PAASLAG_SATS_LAV
  const spkHoy = r.spkHoy ?? SPK_PAASLAG_SATS_HOY
  const takSpkG = r.takSpkG ?? TAK_SPK_G
  const afpSats = r.afp ?? AFP_OPPTJENINGSSATS

  const folketrygdAarlig = annualFromBeholdning(accrueFolketrygdBeholdning(ftIncome, gByYear, ftSats, takFtG), delingstall)
  const spkAarlig = annualFromBeholdning(accrueSpkPaaslagBeholdning(spkGrunnlag, gByYear, spkLav, spkHoy, takSpkG, takFtG), delingstall)
  const afpAarlig = input.afpEnabled
    ? annualAfp(sumLivsinntektUnder7_1G(ftIncome, gByYear, takFtG), delingstall, afpSats)
    : 0
  const særalderAarlig = estimateSæralder(input, folketrygdAarlig)

  const perPilar = {
    folketrygd: folketrygdAarlig / 12,
    spk: spkAarlig / 12,
    afp: afpAarlig / 12,
    særalder: særalderAarlig / 12,
  }
  const monthlyTotal = perPilar.folketrygd + perPilar.spk + perPilar.afp + perPilar.særalder

  // Kompensasjonsgrad måles mot faktisk lønn (SPK-grunnlag), ikke det ATF-oppblåste
  // folketrygdgrunnlaget.
  const sluttlonnMnd = (input.spkAnnualGrunnlag *
    Math.pow(1 + input.salaryGrowthPct / 100, toYear - input.currentYear)) / 12

  return {
    uttaksalder: input.uttaksalder,
    perPilar,
    monthlyTotal,
    replacementRate: sluttlonnMnd > 0 ? monthlyTotal / sluttlonnMnd : 0,
    // TODO (fase 2): sett 'lav' når uttak ligger svært langt fram (stor usikkerhet
    // i delingstall og G-vekst). Hardkodet 'middels' inntil videre.
    confidence: 'middels',
  }
}

/**
 * Utleder domeneinput fra lønnsprofil + pensjonsinnstillinger (uten uttaksalder).
 * Felles kilde for PensionPage og dashboard-chipen, slik at inntektsantakelsene
 * (SPK-grunnlag + ATF-faktor) bare finnes ett sted.
 */
export function buildPensionInputFromProfile(
  profile: EmploymentProfile,
  settings: PensionSettings,
  currentYear: number,
  currentG: number = GRUNNBELOP_NOK,
  delingstallTable?: Record<number, number>,
  rates?: PensionInput['rates'],
): Omit<PensionInput, 'uttaksalder'> {
  const fasteTillegg = (profile.fixedAdditions ?? []).reduce((s, t) => s + t.amount, 0)
  const spkGrunnlag = (profile.baseMonthly + fasteTillegg) * 12
  return {
    birthYear: settings.birthYear,
    serviceStartYear: settings.serviceStartYear,
    currentYear,
    currentG,
    folketrygdAnnualIncome: spkGrunnlag * FOLKETRYGD_TILLEGG_FAKTOR,
    spkAnnualGrunnlag: spkGrunnlag,
    salaryGrowthPct: settings.assumptions.salaryGrowthPct,
    gGrowthPct: settings.assumptions.gGrowthPct,
    afpEnabled: settings.afpEnabled,
    særalder: settings.særalder,
    delingstallTable,
    rates,
  }
}
