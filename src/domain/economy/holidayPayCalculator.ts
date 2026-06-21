import type {
  MonthRecord,
  EmploymentProfile,
  ATFEntry,
  JuneForecast,
  AccruedHolidayBase,
  TemporaryPayEntry,
} from '@/types/economy'
import {
  FERIEPENGER_PROSENT,
  FERIEDAGER_TREKK,
  FERIETREKK_DIVISOR,
} from '@/config/economy.config'
import { estimateSalaryTrend, projectMonthlySalary } from './salaryCalculator'

// ------------------------------------------------------------
// OPPTJENING
// ------------------------------------------------------------

/**
 * Beregner opptjent feriepengegrunnlag for et gitt år.
 *
 * Desember-slippen inneholder det akkumulerte grunnlaget for hele året,
 * og er den mest presise kilden. Uten den summeres bruttoSum fra
 * tilgjengelige slipper og estimeres for manglende måneder.
 */
export function calculateAccruedHolidayBase(
  year: number,
  monthHistory: MonthRecord[],
  profile: EmploymentProfile,
): AccruedHolidayBase {
  // Desember-slipp: akkumulert feriepengegrunnlag for hele året
  const decRecord = monthHistory.find(
    (r) => r.year === year && r.month === 12 && (r.slipData?.feriepengegrunnlag ?? 0) > 0,
  )
  if (decRecord?.slipData?.feriepengegrunnlag) {
    const monthsWithSlip = monthHistory.filter(
      (r) => r.year === year && r.slipData != null,
    ).length
    return {
      actual: decRecord.slipData.feriepengegrunnlag,
      projected: 0,
      total: decRecord.slipData.feriepengegrunnlag,
      monthsWithSlip,
    }
  }

  const monthlyBase =
    profile.baseMonthly +
    (profile.fixedAdditions?.reduce((s, a) => s + a.amount, 0) ?? 0)

  let actual = 0
  let projected = 0
  let monthsWithSlip = 0

  for (let month = 1; month <= 12; month++) {
    const record = monthHistory.find((r) => r.year === year && r.month === month)
    if (record?.slipData) {
      actual += record.slipData.bruttoSum
      monthsWithSlip++
    } else {
      projected += monthlyBase
    }
  }

  return { actual, projected, total: actual + projected, monthsWithSlip }
}

// ------------------------------------------------------------
// HJELPERE
// ------------------------------------------------------------

function getMonthlyFixedAdditions(profile: EmploymentProfile): number {
  return profile.fixedAdditions?.reduce((s, a) => s + a.amount, 0) ?? 0
}

/** Sum ATF-linjer registrert på juni for gitt år. */
function getJuneATF(year: number, monthHistory: MonthRecord[]): number {
  const juneRecord = monthHistory.find((r) => r.year === year && r.month === 6)
  if (!juneRecord) return 0
  return juneRecord.lines
    .filter((l) => l.category === 'atf')
    .reduce((s, l) => s + l.amount, 0)
}

// ------------------------------------------------------------
// PROGNOSE FOR ENKELT-JUNI
// ------------------------------------------------------------

/**
 * Beregner estimert juni-utbetaling for et gitt år.
 *
 * Feriepengegrunnlaget hentes fra forrige års desember-slipp hvis tilgjengelig,
 * ellers estimeres det fra importerte slipper + profil.
 */
export function forecastJune(
  year: number,
  monthHistory: MonthRecord[],
  profile: EmploymentProfile,
  atfEntries: ATFEntry[] = [],
  temporaryPayEntries: TemporaryPayEntry[] = [],
  feriepengerProsent: number = FERIEPENGER_PROSENT,
  feriedagerTrekk: number = FERIEDAGER_TREKK,
  ferietrekkDivisor: number = FERIETREKK_DIVISOR,
): JuneForecast {
  // --- FERIEPENGEGRUNNLAG (opptjent forrige år) ---
  const prevDecRecord = monthHistory.find(
    (r) =>
      r.year === year - 1 &&
      r.month === 12 &&
      (r.slipData?.feriepengegrunnlag ?? 0) > 0,
  )

  let feriepengegrunnlag: number
  let grunnlagKilde: string

  if (prevDecRecord?.slipData?.feriepengegrunnlag) {
    feriepengegrunnlag = prevDecRecord.slipData.feriepengegrunnlag
    grunnlagKilde = `Slipp des ${year - 1}`
  } else {
    const prevBase = calculateAccruedHolidayBase(year - 1, monthHistory, profile)
    feriepengegrunnlag = prevBase.total
    grunnlagKilde = `Estimert (${prevBase.monthsWithSlip}/12 slipper)`
  }

  const feriepenger = Math.round(feriepengegrunnlag * feriepengerProsent)

  // --- ÅRSLØNN I JUNI ---
  const juneSlip = monthHistory.find(
    (r) => r.year === year && r.month === 6 && r.slipData != null,
  )
  // Bruk fremskrevet lønn for måneder vi ikke har slipp for (steg-funksjon fra mai)
  const trend = estimateSalaryTrend(monthHistory)
  const projectedJune = projectMonthlySalary(trend, year, 6)
  const juneMaanedslonn = juneSlip?.slipData?.maanedslonn ?? (projectedJune > 0 ? projectedJune : profile.baseMonthly)
  const juneFixedTillegg = getMonthlyFixedAdditions(profile)
  const juneArslonn = juneMaanedslonn * 12
  const juneFasteTilleggAar = juneFixedTillegg * 12

  const ferietrekkDagsats = Math.round((juneArslonn + juneFasteTilleggAar) / ferietrekkDivisor)
  const ferietrekk = ferietrekkDagsats * feriedagerTrekk

  // --- SKATTEPLIKTIG OG SKATTEGRUNNLAG ---
  // Regel: feriepenger er unntatt forskuddstrekk (skattebetalingsloven § 5-4 (3)),
  // men lønn, ATF, fungering og øvelse-betaling i juni er fortsatt skattepliktig.
  // Skattegrunnlag = (lønn + tillegg + ATF + fungering) - ferietrekk
  const skattepliktigJuni = juneMaanedslonn + juneFixedTillegg

  // ATF i juni: hent fra slipp hvis låst, ellers fra atfEntries (samme logikk som budgetTableComputer)
  const juneATFFromSlip = getJuneATF(year, monthHistory)
  const juneATFFromEntries = (() => {
    if (juneATFFromSlip > 0) return 0  // slipp har prioritet
    let total = 0
    for (const entry of atfEntries.filter((e) => !e.excludeFromBudget)) {
      let payoutYear: number, payoutMonth: number
      if (entry.payoutMonth !== undefined && entry.payoutYear !== undefined) {
        payoutYear = entry.payoutYear
        payoutMonth = entry.payoutMonth
      } else if (entry.tilDateISO) {
        const til = new Date(entry.tilDateISO)
        const d = new Date(til.getFullYear(), til.getMonth() + 1, 1)
        payoutYear = d.getFullYear()
        payoutMonth = d.getMonth() + 1
      } else {
        payoutYear = entry.year
        payoutMonth = 12
      }
      if (payoutYear === year && payoutMonth === 6) total += entry.beregnetBeløp
    }
    return total
  })()
  const juneATF = juneATFFromSlip > 0 ? juneATFFromSlip : juneATFFromEntries

  // Fungering (10P2) i juni: hent fra slipp hvis tilgjengelig, ellers beregn fra prognose
  const juneFungeringFromSlip = juneSlip?.slipData?.fungeringBeløp ?? 0
  const juneFungeringFromForecast = (() => {
    if (juneFungeringFromSlip > 0) return 0
    const juneStart = new Date(year, 5, 1)   // 1. juni
    const juneEnd   = new Date(year, 5, 30)  // 30. juni
    const entry = temporaryPayEntries.find((e) => {
      const from = new Date(e.fromDate)
      const to   = new Date(e.toDate)
      return from <= juneEnd && to >= juneStart
    })
    if (!entry) return 0
    return Math.max(0, entry.maanedslonn - (profile.baseMonthly ?? 0))
  })()
  const juneFungering = juneFungeringFromSlip > 0 ? juneFungeringFromSlip : juneFungeringFromForecast

  const skattegrunnlag = Math.max(0, skattepliktigJuni + juneATF + juneFungering - ferietrekk)

  // Utleder effektiv skatteprosent fra profil (kr/mnd → prosent)
  const taxPercent =
    skattepliktigJuni > 0
      ? Math.min(60, Math.round((profile.lastKnownTaxWithholding / skattepliktigJuni) * 100))
      : 44
  const skattetrekk =
    skattegrunnlag > 0 ? Math.round(skattegrunnlag * (taxPercent / 100)) : 0

  // --- ANDRE TREKK ---
  const pensjonstrekk =
    juneSlip?.slipData?.pensjonstrekk ??
    Math.round(skattepliktigJuni * (profile.pensionPercent / 100))
  const fagforening =
    juneSlip?.slipData?.fagforeningskontingent ?? profile.unionFee
  const husleie =
    juneSlip?.slipData?.husleietrekk ?? profile.housingDeduction
  const ouFond = juneSlip?.slipData?.ouFond ?? 33
  const ekstraTrekk =
    juneSlip?.slipData?.ekstraTrekk ?? profile.extraTaxWithholding
  const andreJuneTrekk = pensjonstrekk + fagforening + husleie + ouFond + ekstraTrekk

  // --- NETTO ---
  const nettoJuni =
    skattepliktigJuni + feriepenger - ferietrekk - skattetrekk - andreJuneTrekk

  // --- KONFIDENSGRAD ---
  const hasLastDecSlip = !!prevDecRecord
  const hasJuneSlip = !!juneSlip
  const confidence: 'høy' | 'middels' | 'lav' =
    hasLastDecSlip && hasJuneSlip ? 'høy' : hasLastDecSlip ? 'middels' : 'lav'

  return {
    year,
    feriepengegrunnlag,
    feriepenger,
    ferietrekkDagsats,
    ferietrekk,
    skattepliktigJuni,
    juneATF,
    juneFungering,
    skattegrunnlag,
    skattetrekk,
    andreJuneTrekk,
    nettoJuni,
    nettoEkstra: feriepenger - ferietrekk,
    confidence,
    kilder: {
      feriepengegrunnlag: grunnlagKilde,
      juneLonn: hasJuneSlip ? `Slipp jun ${year}` : 'Estimert fra lønnsprofil',
    },
  }
}

// ------------------------------------------------------------
// PROGNOSE FOR ALLE FREMTIDIGE JUNIER
// ------------------------------------------------------------

export function forecastAllJunes(
  currentYear: number,
  monthHistory: MonthRecord[],
  profile: EmploymentProfile,
  atfEntries: ATFEntry[] = [],
  yearsAhead = 5,
  temporaryPayEntries: TemporaryPayEntry[] = [],
): JuneForecast[] {
  const forecasts: JuneForecast[] = []
  for (let year = currentYear; year <= currentYear + yearsAhead; year++) {
    forecasts.push(forecastJune(year, monthHistory, profile, atfEntries, temporaryPayEntries))
  }
  return forecasts
}
