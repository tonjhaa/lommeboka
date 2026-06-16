// ------------------------------------------------------------
// Norsk skattekalkulator — bygger på den kanoniske satskilden
// i norwegianTaxRules (B). Egne, foreldede satser er fjernet.
// A legger til: flere inntektstyper, formueskatt og visnings-breakdown.
// ------------------------------------------------------------

import { getTaxRules, calcTrinnskatt, calcTrygdeavgift } from './norwegianTaxRules'

export const TAX_YEAR = 2026

// A-lokale konstanter som IKKE finnes i den kanoniske kilden
// (ingen duplisering av satser som ga avvik → ingen drift):
//   pensjon-minstefradrag, trygdeavgift pensjon/næring, formueskatt.
const PENSJON = {
  minstefradragSats: 0.40,
  minstefradragMaks: 73_150,
  trygdeavgift: 0.051,
}
const NÆRING = { trygdeavgift: 0.110 }
const FORMUE = {
  grense: 1_900_000,
  kommunal: 0.0035,
  statlig1: 0.0065,
  statlig1Grense: 21_500_000,
  statlig2: 0.0075,
}

// Visnings-satser for Skattekalkulator-siden — utledet fra den kanoniske
// kilden (B) for inntektsskatt-delen, pluss A-lokale formue/pensjon-satser.
const rules = getTaxRules(TAX_YEAR)
export const CURRENT_RATES = {
  year: TAX_YEAR,
  personfradrag: rules.personfradrag,
  minstefradragLonnSats: rules.minstefradragSats / 100,
  minstefradragLonnMaks: rules.minstefradragMaks,
  minstefradragPensjonSats: PENSJON.minstefradragSats,
  minstefradragPensjonMaks: PENSJON.minstefradragMaks,
  skattAlminneligSats: rules.alminneligInntektSats / 100,
  trygdeavgiftLonn: rules.trygdeavgiftSats / 100,
  trygdeavgiftPensjon: PENSJON.trygdeavgift,
  trygdeavgiftNæring: NÆRING.trygdeavgift,
  fagforeningskontingentMaks: rules.fagforeningsfradragMaks,
  formueskattGrense: FORMUE.grense,
  formueskattKommunal: FORMUE.kommunal,
  formueskattStatlig1: FORMUE.statlig1,
  formueskattStatlig1Grense: FORMUE.statlig1Grense,
  formueskattStatlig2: FORMUE.statlig2,
}

// ------------------------------------------------------------
// Input / Output
// ------------------------------------------------------------

export interface TaxInput {
  lonnsInntekt: number
  pensjonsinntekt: number
  næringsInntekt: number
  kapitalInntekt: number
  andreFradrag: number
  renteutgifter: number
  arbeidsreiseFradrag: number
  fagforeningskontingent: number
  pensjonspremie: number
  utgiftsgodtgjørelse: number
  bsuSkattefradrag: number
  primaerboligVerdi: number
  sekundaerboligVerdi: number
  bankinnskudd: number
  aksjerFondVerdi: number
  annenFormue: number
  gjeld: number
}

export interface TrinnskattLinje {
  trinn: number
  grenseFra: number
  grenseTil: number
  sats: number
  beløp: number
}

export interface TaxResult {
  minstefradragLonn: number
  minstefradragPensjon: number
  alminneligInntekt: number
  personinntekt: number
  skattemessigFormue: number
  nettoFormue: number
  skattepliktigFormue: number
  skattAlminneligInntekt: number
  trinnskatt: number
  trinnskattLinjer: TrinnskattLinje[]
  trygdeavgiftLonn: number
  trygdeavgiftPensjon: number
  trygdeavgiftNæring: number
  formueskattKommunal: number
  formueskattStatlig: number
  fagforeningFradrag: number
  bsuSkattefradragBeløp: number
  skattInntekt: number
  skattFormue: number
  totalSkatt: number
  totalInntekt: number
  effektivSats: number
  marginalSats: number
  estimertMånedligTrekk: number
}

// ------------------------------------------------------------
// Hjelpere
// ------------------------------------------------------------

/** Bygger trinnskatt-linjer for visning fra de kanoniske trinnskatt-grensene. */
function byggTrinnskattLinjer(
  personinntekt: number,
  brackets: { threshold: number; rate: number }[],
): TrinnskattLinje[] {
  const sorted = [...brackets].sort((a, b) => a.threshold - b.threshold)
  const linjer: TrinnskattLinje[] = []
  for (let i = 0; i < sorted.length; i++) {
    const fra = sorted[i].threshold
    if (personinntekt <= fra) break
    const til = sorted[i + 1]?.threshold ?? Infinity
    const sats = sorted[i].rate / 100
    const grunnlag = Math.min(personinntekt, til) - fra
    linjer.push({
      trinn: i + 1,
      grenseFra: fra,
      grenseTil: til === Infinity ? 0 : til,
      sats,
      beløp: Math.round(grunnlag * sats),
    })
  }
  return linjer
}

function beregnFormueskatt(nettoFormue: number): { kommunal: number; statlig: number } {
  const over = Math.max(0, nettoFormue - FORMUE.grense)
  if (over === 0) return { kommunal: 0, statlig: 0 }
  const kommunal = Math.round(over * FORMUE.kommunal)
  const statligGrunnlag1 = Math.min(over, FORMUE.statlig1Grense - FORMUE.grense)
  const statligGrunnlag2 = Math.max(0, over - (FORMUE.statlig1Grense - FORMUE.grense))
  const statlig = Math.round(statligGrunnlag1 * FORMUE.statlig1 + statligGrunnlag2 * FORMUE.statlig2)
  return { kommunal, statlig }
}

// ------------------------------------------------------------
// Beregning
// ------------------------------------------------------------

export function beregnSkatt(input: TaxInput, year: number = TAX_YEAR): TaxResult {
  const r = getTaxRules(year)
  const { lonnsInntekt, pensjonsinntekt, næringsInntekt, kapitalInntekt, andreFradrag,
          renteutgifter, arbeidsreiseFradrag, fagforeningskontingent, pensjonspremie,
          utgiftsgodtgjørelse, bsuSkattefradrag } = input

  // Minstefradrag — lønn følger den kanoniske kilden (med gulv), pensjon er A-lokal
  const minstefradragLonn = Math.min(
    r.minstefradragMaks,
    Math.max(lonnsInntekt > 0 ? r.minstefradragMin : 0, Math.round(lonnsInntekt * r.minstefradragSats / 100)),
  )
  const minstefradragPensjon = Math.min(
    Math.round(pensjonsinntekt * PENSJON.minstefradragSats),
    PENSJON.minstefradragMaks,
  )

  const personinntekt = lonnsInntekt + næringsInntekt + utgiftsgodtgjørelse
  const fagforeningFradrag = Math.min(fagforeningskontingent, r.fagforeningsfradragMaks)

  const totalInntekt = lonnsInntekt + pensjonsinntekt + næringsInntekt + kapitalInntekt + utgiftsgodtgjørelse
  const samledeFradrag = andreFradrag + renteutgifter + arbeidsreiseFradrag + fagforeningFradrag + pensjonspremie
  const alminneligInntekt = Math.max(0,
    totalInntekt - minstefradragLonn - minstefradragPensjon - samledeFradrag - r.personfradrag)

  const skattAlminneligSats = r.alminneligInntektSats / 100
  const skattAlminneligInntekt = Math.round(alminneligInntekt * skattAlminneligSats)

  // Trinnskatt: total fra den kanoniske algoritmen (B), linjer for visning
  const trinnskatt = Math.round(calcTrinnskatt(personinntekt, r.trinnskattBrackets))
  const trinnskattLinjer = byggTrinnskattLinjer(personinntekt, r.trinnskattBrackets)

  // Trygdeavgift: lønn fra den kanoniske kilden (med frigrense); pensjon/næring A-lokalt
  const trygdeavgiftLonn = calcTrygdeavgift(lonnsInntekt, r)
  const trygdeavgiftPensjon = Math.round(pensjonsinntekt * PENSJON.trygdeavgift)
  const trygdeavgiftNæring = Math.round(næringsInntekt * NÆRING.trygdeavgift)

  // Formue
  const skattemessigFormue =
    Math.round(input.primaerboligVerdi * 0.25) +
    Math.round(input.sekundaerboligVerdi * 1.00) +
    Math.round(input.bankinnskudd * 1.00) +
    Math.round(input.aksjerFondVerdi * 0.80) +
    Math.round(input.annenFormue * 1.00)
  const nettoFormue = Math.max(0, skattemessigFormue - input.gjeld)
  const skattepliktigFormue = Math.max(0, nettoFormue - FORMUE.grense)
  const { kommunal: formueskattKommunal, statlig: formueskattStatlig } = beregnFormueskatt(nettoFormue)

  // BSU skattefradrag (maks 10 % av årets maks-innskudd)
  const bsuMaksFradrag = Math.round(r.bsuMaksInnskuddPerAar * r.bsuFradragSats / 100)
  const bsuSkattefradragBeløp = Math.min(Math.round(bsuSkattefradrag), bsuMaksFradrag)

  // Split: inntektsskatt (sammenlignbar med forskuddstrekk) vs formueskatt
  const skattInntekt = Math.max(0, skattAlminneligInntekt + trinnskatt
    + trygdeavgiftLonn + trygdeavgiftPensjon + trygdeavgiftNæring
    - bsuSkattefradragBeløp)
  const skattFormue = formueskattKommunal + formueskattStatlig
  const totalSkatt = skattInntekt + skattFormue

  const effektivSats = totalInntekt > 0 ? totalSkatt / totalInntekt : 0

  const topTrinnskattSats = (() => {
    const sorted = [...r.trinnskattBrackets].sort((a, b) => a.threshold - b.threshold)
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (personinntekt > sorted[i].threshold) return sorted[i].rate / 100
    }
    return 0
  })()
  const marginalSats = skattAlminneligSats + (r.trygdeavgiftSats / 100) + topTrinnskattSats

  return {
    minstefradragLonn,
    minstefradragPensjon,
    alminneligInntekt,
    personinntekt,
    skattemessigFormue,
    nettoFormue,
    skattepliktigFormue,
    skattAlminneligInntekt,
    trinnskatt,
    trinnskattLinjer,
    trygdeavgiftLonn,
    trygdeavgiftPensjon,
    trygdeavgiftNæring,
    formueskattKommunal,
    formueskattStatlig,
    fagforeningFradrag,
    bsuSkattefradragBeløp,
    skattInntekt,
    skattFormue,
    totalSkatt,
    totalInntekt,
    effektivSats,
    marginalSats,
    estimertMånedligTrekk: Math.round(skattInntekt / 10.5),
  }
}
