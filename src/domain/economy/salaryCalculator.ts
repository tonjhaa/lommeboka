import type {
  ParsetLonnsslipp,
  ArtskopePost,
  MonthRecord,
  HolidayPayResult,
} from '@/types/economy'
import {
  FERIEPENGER_PROSENT,
  FERIETREKK_DIVISOR,
  FERIEDAGER_TREKK,
  ARTSKODE_NAVN,
} from '@/config/economy.config'

// ------------------------------------------------------------
// PDF-PARSING — Forsvaret lønnsslipper
// ------------------------------------------------------------

/**
 * Parser norsk beløp: "55.844,40" → 55844.40, "1.150,80-" → -1150.80
 * Tusenskille = punktum, desimalskille = komma, negativt = etterfølgende bindestrek.
 */
function parseNOK(s: string): number {
  const neg = s.endsWith('-')
  const clean = s.replace(/-$/, '').replace(/\./g, '').replace(',', '.')
  const val = parseFloat(clean)
  return isNaN(val) ? 0 : neg ? -val : val
}

// Matcher norske beløp: "55.844,40", "723,00-", "28.701,06-"
const NOK_TOKEN = /\d{1,3}(?:\.\d{3})*,\d{2}-?/g

function findNOKAmounts(s: string): string[] {
  return s.match(NOK_TOKEN) ?? []
}

// Artskode i starten av en linje: "1S01 ", "7000 ", "/440 "
const ARTSKODE_START = /^([A-Z0-9]{2,5}|\/\d{3})\s+/

/**
 * Parser tekst fra PDF-lønnsslipper i Forsvaret-format.
 *
 * Format (januar 2026-eksempel):
 *   1S01 Månedslønn 01.26 670.132 55.844,40
 *   /440 Tabelltrekk 01.26 61.278,00 8010 18.478,00-   ← siste beløp er skattetrekk
 *   7000 Pensjonstrekk 01.26 1.150,80-
 *   63.078,83 28.701,06- 34.377,77                      ← netto (3 beløp, ingen artskode)
 *   57.544,40 6.905,33                                   ← feriepengegrunnlag (linje etter netto)
 */
export function parseForsvarsSlipp(pdfText: string): ParsetLonnsslipp {
  const lines = pdfText.split('\n').map((l) => l.trim()).filter(Boolean)

  // ---- Periode: "Lønnsavregning for Januar 2026" ----
  let year = new Date().getFullYear()
  let month = new Date().getMonth() + 1

  const MONTH_NAMES: Record<string, number> = {
    januar: 1, februar: 2, mars: 3, april: 4, mai: 5, juni: 6,
    juli: 7, august: 8, september: 9, oktober: 10, november: 11, desember: 12,
  }

  const periodeMatch = pdfText.match(/[Ll]ønnsavregning\s+for\s+(\w+)\s+(\d{4})/i)
  if (periodeMatch) {
    const mn = MONTH_NAMES[periodeMatch[1].toLowerCase()]
    if (mn) month = mn
    year = parseInt(periodeMatch[2], 10)
  } else {
    // Fallback: "01.26" eller "01.2026"
    const fallback = pdfText.match(/(\d{2})[./](\d{2,4})/)
    if (fallback) {
      month = parseInt(fallback[1], 10)
      const y = parseInt(fallback[2], 10)
      year = y < 100 ? 2000 + y : y
    }
  }

  // ---- Ansattnummer ----
  let ansattnummer = ''
  const ansattMatch = pdfText.match(/[Aa]nsattnr\.?\s*:?\s*(\d{5,})/i)
  if (ansattMatch) ansattnummer = ansattMatch[1]

  // ---- Lønnstrinn: datarad har "61 SPENN" (LTR-verdien rett før nøkkelordet SPENN) ----
  let loennstrinn = 0
  const ltrMatch = pdfText.match(/(\d+)\s+SPENN/)
  if (ltrMatch) loennstrinn = parseInt(ltrMatch[1], 10)

  // ---- Artskode-linjer: kode + siste beløp ----
  interface ArtskodeLinje {
    kode: string
    navn: string
    lastAmount: number  // beløp (total = antall × sats)
    satsAmount: number  // sats per dag/time = første NOK-beløp på linjen
  }

  const artskodeLinjer: ArtskodeLinje[] = []

  for (const line of lines) {
    const kodeMatch = line.match(ARTSKODE_START)
    if (!kodeMatch) continue
    const kode = kodeMatch[1]
    const rest = line.slice(kodeMatch[0].length)
    const amounts = findNOKAmounts(rest)
    if (amounts.length === 0) continue
    const lastAmount = parseNOK(amounts[amounts.length - 1])
    const satsAmount = parseNOK(amounts[0])  // sats = første beløp (ved antall>1 er siste = beløp)
    const navn = rest.replace(new RegExp(NOK_TOKEN.source, 'g'), '').replace(/\s+/g, ' ').trim()
    artskodeLinjer.push({ kode, navn, lastAmount, satsAmount })
  }

  // ---- ATF-satser og -beløp: ekstraher sats og totalbeløp for øvelse-artskoder ----
  // Ta MAKSIMUM sats per artskode (des-slipper kan ha gammel+ny sats etter lønnsoppgjør)
  //
  // Alle ATF-artskoder (både dögn og timer) følger kolonneformat: ANTALL SATS BELØP
  //   → satsAmount = amounts[0] = antall, lastAmount = amounts[last] = beløp
  //   → sats per dag/time = beløp / antall = lastAmount / satsAmount
  const ATF_ARTSKODER = new Set([
    '2230', '2232', '2233', '2236', '2237', '2238', '2242', '2243', '2244', // øvelse/ATF
    '2250',                                   // Øvelse døgn IP
    '2531',                                   // Ettermiddagstillegg
    '2003', '2004', '2A05', '2A10',           // Overtid 50%/100%/avrunding
    '2572',                                   // Timelønn (Tariff)
    '2698',                                   // Kompensasjon kvote 98
  ])
  const atfRaterMap = new Map<string, number>()
  let atfBeløp = 0
  for (const l of artskodeLinjer) {
    if (!ATF_ARTSKODER.has(l.kode) || l.lastAmount === 0) continue
    // Korreksjonsslipper reverserer gamle posteringer med negativt antall/beløp —
    // signert sum gir netto faktisk utbetalt denne måneden.
    atfBeløp += l.lastAmount
    // Sats kun fra positive posteringer (reverseringer bruker gammel sats)
    if (l.satsAmount > 0 && l.lastAmount > 0) {
      const sats = l.lastAmount / l.satsAmount   // beløp / antall = sats per dag/time
      const prev = atfRaterMap.get(l.kode) ?? 0
      if (sats > prev) atfRaterMap.set(l.kode, sats)
    }
  }
  const atfRater: Record<string, number> | undefined =
    atfRaterMap.size > 0 ? Object.fromEntries(atfRaterMap) : undefined

  // ---- Fungering (10P2) ----
  // Signert sum av alle linjer: etterbetalingsslipper kan ha flere 10P2-perioder
  // (alle er faktisk utbetalt denne måneden), korreksjoner er negative.
  const fungeringBeløp = artskodeLinjer
    .filter((l) => l.kode === '10P2')
    .reduce((s, l) => s + l.lastAmount, 0)

  // Bruk SISTE forekomst av artskoden — ved flersiders slipper er siste side = inneværende måned.
  // Tidligere sider inneholder etterbetalinger fra tidligere perioder.
  function getPost(kode: string) {
    const matches = artskodeLinjer.filter((l) => l.kode === kode)
    return matches.length > 0 ? matches[matches.length - 1] : undefined
  }

  // 7005 (Gruppelivspremie) er arbeidsgiverbetalt — ikke del av brutto, vises som informasjonslinje
  // OF11 (Utbet.FP ord.) inkluderes som tillegg slik at bruttoSum stemmer i junimåneder
  const fasteTilleggKoder = ['1501', '1162', '106G', 'OF11', '1069']  // 1069 = Flyttebonus (variant)
  const trekkKoder = ['/440', '/441', '7000', '3020', '3209', '1620', '6100', '3230', '8888']
  // 3230 = Trekk fra reiseregning, 8888 = Skatt trukket på reise

  // ---- Beløp ----
  const maanedslonn = Math.abs(getPost('1S01')?.lastAmount ?? getPost('1001')?.lastAmount ?? 0)

  // /440 separat: satsAmount = grunnlag (f.eks. 61 278), lastAmount = tabelltrekk (f.eks. -18 478)
  // Tabellnummer (f.eks. 8010) er et 4-sifret tall mellom grunnlag og trekk på /440-linjen
  const post440 = getPost('/440')
  const tabelltrekkGrunnlag = post440 ? Math.abs(post440.satsAmount) : 0
  const tabelltrekkBelop = post440 ? Math.abs(post440.lastAmount) : 0

  let tabellnummer: number | undefined
  if (post440) {
    const line440 = lines.find((l) => l.match(/^\/440\s+/))
    if (line440) {
      const tabellMatch = line440.match(/\b([4-9]\d{3})\b/)
      if (tabellMatch) tabellnummer = parseInt(tabellMatch[1], 10)
    }
  }

  // Sum /440 + /441: april-slipp o.l. kan ha begge (tabelltrekk + %-trekk)
  const skattetrekk = tabelltrekkBelop + Math.abs(getPost('/441')?.lastAmount ?? 0)
  const pensjonstrekk = Math.abs(getPost('7000')?.lastAmount ?? 0)
  const fagforeningskontingent = Math.abs(getPost('3020')?.lastAmount ?? 0)
  const husleietrekk = Math.abs(getPost('3209')?.lastAmount ?? 0)
  const ekstraTrekk = Math.abs(getPost('1620')?.lastAmount ?? 0)
  const ouFond = Math.abs(getPost('6100')?.lastAmount ?? 0)
  const gruppelivspremie = Math.abs(getPost('7005')?.lastAmount ?? 0)

  // Dedupliser: behold kun siste forekomst av hver artskode i listene
  function lastPerKode(koder: string[]): ArtskodeLinje[] {
    const seen = new Map<string, ArtskodeLinje>()
    for (const l of artskodeLinjer) {
      if (koder.includes(l.kode)) seen.set(l.kode, l)
    }
    return [...seen.values()]
  }

  const fasteTillegg: ArtskopePost[] = lastPerKode(fasteTilleggKoder)
    .filter((l) => l.lastAmount > 0)
    .map((l) => ({ artskode: l.kode, navn: l.navn, belop: l.lastAmount }))

  // OF19 (Ferietrekk) har typisk to forekomster i juni — signert sum, siden
  // korreksjonsslipper (etter lønnsoppgjør) reverserer gamle trekk med positive beløp.
  // Netto negativ = reelt trekk; netto positiv (ren tilbakeføring) ignoreres.
  const of19Netto = artskodeLinjer
    .filter((l) => l.kode === 'OF19')
    .reduce((s, l) => s + l.lastAmount, 0)
  const ferietrekkTotal = of19Netto < 0 ? -of19Netto : 0

  const trekk: ArtskopePost[] = lastPerKode(trekkKoder)
    .map((l) => ({ artskode: l.kode, navn: l.navn, belop: l.lastAmount }))

  // OF19 legges til trekk-listen som navngitt rad (kun hvis tilstede)
  if (ferietrekkTotal > 0) {
    trekk.unshift({ artskode: 'OF19', navn: 'Ferietrekk', belop: -ferietrekkTotal })
  }

  // Ulønnet fravær (2700 Ferie u/lønn, 2713 Annet fravær u/lønn) reduserer brutto.
  // Signert sum — korreksjoner kan være positive.
  const fravaerNetto = artskodeLinjer
    .filter((l) => l.kode === '2700' || l.kode === '2713')
    .reduce((s, l) => s + l.lastAmount, 0)
  const fravaerstrekkTotal = fravaerNetto < 0 ? -fravaerNetto : 0

  // bruttoSum = månedslønn + tillegg (inkl. OF11 feriepenger) − ulønnet fravær
  // — OF19 er allerede ute av brutto
  const bruttoSum = maanedslonn + fasteTillegg.reduce((s, p) => s + p.belop, 0)
    - fravaerstrekkTotal

  // ---- Avregningsdato: "Avregningsdato: 12.03.2026" ----
  let avregningsdato: string | undefined
  const avregMatch = pdfText.match(/[Aa]vregningsdato:?\s+(\d{1,2}\.\d{2}\.\d{4})/)
  if (avregMatch) avregningsdato = avregMatch[1]

  // ---- Netto utbetalt ----
  // Pass 1: 4-beløps format for etterbetalingsslipper (flersiders):
  //   "59.493,63  46.595,36-  43.377,30  56.275,57"
  //   brutto     trekk        etterbetaling  netto
  // Gjentas på alle sider — bruk FØRSTE forekomst.
  //
  // Pass 2: standard 3-beløps format (enkeltmåned):
  //   "63.287,42  29.137,59-  34.149,83"
  //   brutto     trekk        netto
  let nettoUtbetalt = 0
  let nettoLineIdx = -1

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (ARTSKODE_START.test(line)) continue
    const amounts = findNOKAmounts(line)
    if (amounts.length === 4) {
      const stripped = line.replace(new RegExp(NOK_TOKEN.source, 'g'), '').trim()
      if (!stripped && parseNOK(amounts[3]) > 0) {
        nettoUtbetalt = parseNOK(amounts[3])
        nettoLineIdx = i
        break
      }
    }
  }

  if (nettoUtbetalt === 0) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (ARTSKODE_START.test(line)) continue
      const amounts = findNOKAmounts(line)
      if (amounts.length === 3) {
        const stripped = line.replace(new RegExp(NOK_TOKEN.source, 'g'), '').trim()
        // Netto må være positivt (hittil-linjen har negativt 3. beløp — skip den)
        if (!stripped && parseNOK(amounts[2]) > 0) {
          nettoUtbetalt = parseNOK(amounts[2])
          nettoLineIdx = i
          break
        }
      }
    }
  }

  if (nettoUtbetalt === 0) {
    const totalTrekk =
      skattetrekk + ekstraTrekk + husleietrekk + pensjonstrekk + fagforeningskontingent + ouFond
    nettoUtbetalt = bruttoSum - totalTrekk
  }

  // ---- Feriepengegrunnlag: første ikke-artskode-linje etter netto med ≥1 NOK-beløp ----
  // Format: "181.974,45 21.836,94"  (1. = YTD grunnlag, 2. = opptjent ferie i kr)
  let feriepengegrunnlag = 0
  let opptjentFerie = 0
  let feriepLineIdx = -1

  if (nettoLineIdx >= 0) {
    for (let i = nettoLineIdx + 1; i < lines.length; i++) {
      const line = lines[i]
      if (ARTSKODE_START.test(line)) continue
      const amounts = findNOKAmounts(line)
      if (amounts.length >= 1) {
        feriepengegrunnlag = parseNOK(amounts[0])
        if (amounts.length >= 2) opptjentFerie = parseNOK(amounts[1])
        feriepLineIdx = i
        break
      }
    }
  }

  if (feriepengegrunnlag === 0) {
    const fpMatch = pdfText.match(/[Ff]eriepengegrunnlag\s*:?\s*(\d{1,3}(?:\.\d{3})*,\d{2})/i)
    if (fpMatch) feriepengegrunnlag = parseNOK(fpMatch[1])
  }

  // ---- Hittil i år: neste rene 3-beløps-linje etter feriepengegrunnlag ----
  // Format: "198.686,34 3.452,40- 62.654,00-"  (brutto, pensjon, forskuddstrekk)
  let hittilBrutto = 0
  let hittilPensjon = 0
  let hittilForskuddstrekk = 0
  const hittilStart = feriepLineIdx >= 0 ? feriepLineIdx + 1 : nettoLineIdx >= 0 ? nettoLineIdx + 1 : 0

  for (let i = hittilStart; i < lines.length; i++) {
    const line = lines[i]
    if (ARTSKODE_START.test(line)) continue
    const amounts = findNOKAmounts(line)
    if (amounts.length === 3) {
      const stripped = line.replace(new RegExp(NOK_TOKEN.source, 'g'), '').trim()
      if (!stripped) {
        hittilBrutto = Math.abs(parseNOK(amounts[0]))
        hittilPensjon = Math.abs(parseNOK(amounts[1]))
        hittilForskuddstrekk = Math.abs(parseNOK(amounts[2]))
        break
      }
    }
  }

  // Logg ukjente artskoder
  const kjentKoder = new Set([
    ...fasteTilleggKoder, ...trekkKoder,
    '1S01', '1001', '7005', '10P2', 'OF19', '2700', '2713', '3021',
    ...ATF_ARTSKODER,
    '321H', '321P', '8180', '885F',  // motpost/husleie pendler, kost, flyttefaktura
  ])
  artskodeLinjer.forEach((l) => {
    if (!kjentKoder.has(l.kode)) {
      console.debug(`[slipParser] Ukjent artskode: ${l.kode} (${l.navn}) = ${l.lastAmount}`)
    }
  })

  return {
    periode: { year, month },
    ansattnummer,
    loennstrinn,
    maanedslonn,
    fasteTillegg,
    trekk,
    bruttoSum,
    nettoUtbetalt,
    feriepengegrunnlag,
    opptjentFerie,
    skattetrekk,
    ekstraTrekk,
    husleietrekk,
    pensjonstrekk,
    fagforeningskontingent,
    ouFond,
    gruppelivspremie,
    avregningsdato,
    hittilBrutto,
    hittilPensjon,
    hittilForskuddstrekk,
    atfRater,
    atfBeløp: atfBeløp !== 0 ? atfBeløp : undefined,
    fungeringBeløp: fungeringBeløp !== 0 ? fungeringBeløp : undefined,
    tabelltrekkGrunnlag,
    tabelltrekkBelop,
    tabellnummer,
    feriepenger: fasteTillegg.find(p => p.artskode === 'OF11')?.belop,
    ferietrekk: ferietrekkTotal > 0 ? ferietrekkTotal : undefined,
    fravaerstrekk: fravaerstrekkTotal > 0 ? fravaerstrekkTotal : undefined,
  }
}

// ------------------------------------------------------------
// FERIEPENGER — STATLIG MODELL
// ------------------------------------------------------------

/**
 * Beregner juni-utbetaling for statlig ansatte.
 * - Feriepenger = feriepengegrunnlag (desember forrige år) × 12%
 * - Ferietrekk = årslønn_juni / 260 × 25 virkedager
 * - Ingen skatt av selve feriepengene
 */
export function calculateHolidayPay(
  basis: number,
  annualSalaryJune: number,
  feriepengerProsent: number = FERIEPENGER_PROSENT,
  feriedagerTrekk: number = FERIEDAGER_TREKK,
  ferietrekkDivisor: number = FERIETREKK_DIVISOR,
): HolidayPayResult {
  const holidayPay = basis * feriepengerProsent
  const holidayLeaveDeduction = (annualSalaryJune / ferietrekkDivisor) * feriedagerTrekk
  const netJune = annualSalaryJune / 12 + holidayPay - holidayLeaveDeduction
  return { holidayPay, holidayLeaveDeduction, netJune }
}

// ------------------------------------------------------------
// ARTSKODE → LABEL
// ------------------------------------------------------------

export function artskodeLabel(kode: string): string {
  return ARTSKODE_NAVN[kode] ?? kode
}

// ------------------------------------------------------------
// LØNNSUTVIKLING — trendestimering og fremskriving
// ------------------------------------------------------------

export interface SalaryTrend {
  /** Estimert årlig lønnsøkning som desimal, f.eks. 0.042 = 4.2%. null = for lite data. */
  annualGrowthRate: number | null
  /** Antall datapunkter (importerte slipper med lønn) */
  dataPoints: number
  /** Grunnlaget: siste importerte månedssats */
  latestMonthly: number
  /** Siste slipps år/måned */
  latestPeriod: { year: number; month: number } | null
}

/**
 * Estimerer årlig lønnsøkning fra historiske lønnsslipper.
 * Krever minst 3 måneder mellom første og siste slipp.
 * Returnerer null som vekst hvis datagrunnlaget er for tynt.
 */
export function estimateSalaryTrend(monthHistory: MonthRecord[]): SalaryTrend {
  const points = monthHistory
    .filter((m) => (m.slipData?.maanedslonn ?? 0) > 0)
    .map((m) => ({ year: m.year, month: m.month, salary: m.slipData!.maanedslonn }))
    .sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month)

  if (points.length === 0) {
    return { annualGrowthRate: null, dataPoints: 0, latestMonthly: 0, latestPeriod: null }
  }

  const latest = points[points.length - 1]

  if (points.length < 2) {
    return { annualGrowthRate: null, dataPoints: 1, latestMonthly: latest.salary, latestPeriod: { year: latest.year, month: latest.month } }
  }

  const oldest = points[0]
  const monthsDiff = (latest.year - oldest.year) * 12 + (latest.month - oldest.month)

  if (monthsDiff < 3 || oldest.salary <= 0) {
    return { annualGrowthRate: null, dataPoints: points.length, latestMonthly: latest.salary, latestPeriod: { year: latest.year, month: latest.month } }
  }

  const raw = Math.pow(latest.salary / oldest.salary, 12 / monthsDiff) - 1
  const annualGrowthRate = Math.max(0, Math.min(0.20, raw))

  return { annualGrowthRate, dataPoints: points.length, latestMonthly: latest.salary, latestPeriod: { year: latest.year, month: latest.month } }
}

/**
 * Fremskriver månedssats fra siste kjente punkt til en fremtidig periode.
 *
 * Modell: statlig lønnsoppgjør gjelder fra 1. mai hvert år (trappetrinn).
 * Lønn er flat jan–apr, hopper i mai, flat mai–des — ikke jevn månedsvekst.
 *
 * «mai-år» = det siste mai-tidspunktet som er passert eller er i gjeldende måned.
 * Antall hopp = antall mai-til-mai intervaller mellom siste kjente slipp og målmåned.
 */
export function projectMonthlySalary(
  trend: SalaryTrend,
  targetYear: number,
  targetMonth: number,
): number {
  if (!trend.latestPeriod || trend.latestMonthly <= 0) return 0

  // «mai-år» for siste kjente slipp: hvis slippen er mai–des reflekterer den allerede årets oppgjør
  const latestMayYear = trend.latestPeriod.month >= 5
    ? trend.latestPeriod.year
    : trend.latestPeriod.year - 1

  // «mai-år» for målmåneden
  const targetMayYear = targetMonth >= 5 ? targetYear : targetYear - 1

  const steps = Math.max(0, targetMayYear - latestMayYear)
  if (steps === 0) return trend.latestMonthly

  const rate = trend.annualGrowthRate ?? 0
  return Math.round(trend.latestMonthly * Math.pow(1 + rate, steps))
}
