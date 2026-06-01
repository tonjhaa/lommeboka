// src/domain/economy/foreldrepengerRules.ts
import type {
  Dekningsgrad, PermisjonInput, TilgjengeligeUker,
  PermisjonPeriode, PlanValidering, PermisjonOppsummering, FerieBlokk,
} from '@/types/permisjon'

// Alle tall er stønadsdager (arbeidsdager, 5-dagersuke). Kilde: navikt/fp-stonadskonto
const DAGER_PER_UKE = 5

const KONFIG_DAGER: Record<Dekningsgrad, {
  forTermin: number
  mødre: number
  fedre: number
  felles: number
  farRundtFodsel: number
  ekstraToBarn: number
}> = {
  100: { forTermin: 15, mødre: 75, fedre: 75, felles: 80, farRundtFodsel: 10, ekstraToBarn: 85 },
   80: { forTermin: 15, mødre: 95, fedre: 95, felles: 101, farRundtFodsel: 10, ekstraToBarn: 106 },
}

const OBLIGATORISK_ETTER_FODSEL_DAGER = 30  // 6 uker × 5 dager

function dagerTilUker(dager: number): number { return dager / DAGER_PER_UKE }

export function addWeeks(date: string, weeks: number): string {
  const d = new Date(date)
  d.setDate(d.getDate() + Math.round(weeks * 7))
  return d.toISOString().split('T')[0]
}

export function addDays(date: string, days: number): string {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

export function weeksBetween(fra: string, til: string): number {
  const ms = new Date(til).getTime() - new Date(fra).getTime()
  return ms / (1000 * 60 * 60 * 24 * 7)
}

export function daysBetween(fra: string, til: string): number {
  return Math.round((new Date(til).getTime() - new Date(fra).getTime()) / (1000 * 60 * 60 * 24))
}

export function ukerOverlapMedFerie(periode: { fra: string; til: string }, ferie: FerieBlokk): number {
  const start = new Date(Math.max(new Date(periode.fra).getTime(), new Date(ferie.fra).getTime()))
  const slutt = new Date(Math.min(new Date(periode.til).getTime(), new Date(ferie.til).getTime()))
  if (slutt <= start) return 0
  return (slutt.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 7)
}

export function beregnTilgjengeligeUker(input: PermisjonInput): TilgjengeligeUker {
  const k = KONFIG_DAGER[input.dekningsgrad]
  const ekstraDagerFlerbarns = input.tvillinger ? k.ekstraToBarn : 0

  let ekstraForTidligDager = 0
  if (input.forTidligFodsel && input.fodselsDato && input.terminDato) {
    const kalenderDager = daysBetween(input.fodselsDato, input.terminDato)
    ekstraForTidligDager = Math.max(0, Math.round(kalenderDager * 5 / 7))
  }

  const møreDager = k.mødre + ekstraDagerFlerbarns + ekstraForTidligDager
  const fedreDager = k.fedre + ekstraDagerFlerbarns
  const fellesDager = k.felles + ekstraDagerFlerbarns

  return {
    forTermin: dagerTilUker(k.forTermin),
    mødrekvote: dagerTilUker(møreDager),
    fedrekvote: dagerTilUker(fedreDager),
    farRundtFodsel: dagerTilUker(k.farRundtFodsel),
    fellesperiode: dagerTilUker(fellesDager),
    total: dagerTilUker(k.forTermin + møreDager + fedreDager + fellesDager),
    totalMor: dagerTilUker(k.forTermin + møreDager + fellesDager),
    totalPartner: dagerTilUker(fedreDager + fellesDager),
    obligatorisk: {
      forTermin: dagerTilUker(k.forTermin),
      etterFodsel: dagerTilUker(OBLIGATORISK_ETTER_FODSEL_DAGER),
    },
    ekstraFlerbarns: dagerTilUker(ekstraDagerFlerbarns),
    ekstraForTidlig: dagerTilUker(ekstraForTidligDager),
  }
}

export function beregnBarnehageStart(terminDato: string, fodselsDato?: string): string {
  const refDato = fodselsDato ?? terminDato
  const refYear = new Date(refDato).getFullYear()
  return `${refYear + 1}-08-01`
}

export function genererStandardPlan(input: PermisjonInput): PermisjonPeriode[] {
  const fodsel = input.fodselsDato ?? input.terminDato
  const tilgjengelig = beregnTilgjengeligeUker(input)
  const perioder: PermisjonPeriode[] = []

  // 1. Mor: 3 uker før termin (FORELDREPENGER_FØR_FØDSEL — separat konto)
  perioder.push({
    id: 'mor-for-termin',
    type: 'mor_før_termin',
    owner: 'meg',
    fra: addWeeks(input.terminDato, -tilgjengelig.forTermin),
    til: addDays(fodsel, -1),
  })

  // 2. Mor: 6 obligatoriske uker etter fødsel (del av mødrekvote)
  const morObligSlutt = addWeeks(fodsel, tilgjengelig.obligatorisk.etterFodsel)
  perioder.push({
    id: 'mor-obligatorisk',
    type: 'mor_obligatorisk',
    owner: 'meg',
    fra: fodsel,
    til: addDays(morObligSlutt, -1),
  })

  // 3. Mor: resterende mødrekvote (mødrekvote - 6 obligatoriske uker)
  // NB: forTermin er separat, trekkes IKKE fra her
  const morFleksibel = tilgjengelig.mødrekvote - tilgjengelig.obligatorisk.etterFodsel
  if (morFleksibel > 0) {
    perioder.push({
      id: 'mor-kvote',
      type: 'mor_kvote',
      owner: 'meg',
      fra: morObligSlutt,
      til: addDays(addWeeks(morObligSlutt, morFleksibel), -1),
    })
  }

  // 4. Fellesperiode — mor tar den (ingen aktivitetskrav fra mor)
  const fellesMorStart = addWeeks(morObligSlutt, morFleksibel)
  perioder.push({
    id: 'felles-mor',
    type: 'felles_mor',
    owner: 'meg',
    fra: fellesMorStart,
    til: addDays(addWeeks(fellesMorStart, tilgjengelig.fellesperiode), -1),
  })

  // 5. Partner: fedrekvote
  // For lærere: start etter sommerferie for å ikke "kaste bort" uker
  const uke7EtterFodsel = addWeeks(fodsel, 7)
  let farStart: string

  if (input.partnerErLærer) {
    const fodselYear = new Date(fodsel).getFullYear()
    const sommerSlutter = [fodselYear, fodselYear + 1]
      .map((y) => `${y}-${input.partnerSommerTilManedDag}`)
      .find((d) => d > uke7EtterFodsel)
    farStart = sommerSlutter && sommerSlutter > uke7EtterFodsel ? sommerSlutter : uke7EtterFodsel
  } else {
    farStart = uke7EtterFodsel
  }

  perioder.push({
    id: 'far-kvote',
    type: 'far_kvote',
    owner: 'partner',
    fra: farStart,
    til: addDays(addWeeks(farStart, tilgjengelig.fedrekvote), -1),
  })

  return perioder
}

export function validerPlan(input: PermisjonInput, perioder: PermisjonPeriode[]): PlanValidering {
  const advarsler: string[] = []
  const feil: string[] = []
  const fodsel = input.fodselsDato ?? input.terminDato
  const tilgjengelig = beregnTilgjengeligeUker(input)

  if (!perioder.some((p) => p.type === 'mor_før_termin'))
    feil.push('Mor mangler 3 uker før termin (obligatorisk)')
  if (!perioder.some((p) => p.type === 'mor_obligatorisk'))
    feil.push('Mor mangler 6 obligatoriske uker etter fødsel')

  const uke7 = addWeeks(fodsel, 7)
  perioder.filter((p) => p.owner === 'partner' && !p.erPause).forEach((p) => {
    if (p.fra < uke7)
      feil.push(`Partner-periode starter ${p.fra}, men fedrekvote kan tidligst starte ${uke7} (uke 7)`)
  })

  const morUker = perioder
    .filter((p) => p.owner === 'meg' && !p.erPause)
    .reduce((s, p) => s + weeksBetween(p.fra, addDays(p.til, 1)), 0)
  const farUker = perioder
    .filter((p) => p.owner === 'partner' && !p.erPause)
    .reduce((s, p) => s + weeksBetween(p.fra, addDays(p.til, 1)), 0)

  // Mor maks inkl. forTermin
  const morMaks = tilgjengelig.forTermin + tilgjengelig.mødrekvote + tilgjengelig.fellesperiode
  const farMaks = tilgjengelig.fedrekvote + tilgjengelig.fellesperiode

  if (morUker > morMaks + 0.5)
    feil.push(`Mor bruker ${Math.round(morUker)} uker, maks er ${Math.round(morMaks)} uker`)
  if (farUker > farMaks + 0.5)
    feil.push(`Partner bruker ${Math.round(farUker)} uker, maks er ${Math.round(farMaks)} uker`)

  if (input.partnerErLærer) {
    const fodselYear = new Date(fodsel).getFullYear()
    const sommerBlokker: FerieBlokk[] = [fodselYear, fodselYear + 1].map((y) => ({
      fra: `${y}-${input.partnerSommerFraManedDag}`,
      til: `${y}-${input.partnerSommerTilManedDag}`,
    }))
    let sommerUker = 0
    perioder.filter((p) => p.owner === 'partner' && !p.erPause).forEach((p) =>
      sommerBlokker.forEach((s) => { sommerUker += ukerOverlapMedFerie(p, s) })
    )
    if (sommerUker > 0.5)
      advarsler.push(
        `${Math.round(sommerUker)} av partnerens permisjonsukene faller i sommerferie — partner er hjemme uansett. Vurder å flytte disse til skoleåret.`
      )
  }

  const barnehageStart = beregnBarnehageStart(input.terminDato, input.fodselsDato)
  const sisteSlutt = perioder.filter((p) => !p.erPause).map((p) => p.til).sort().at(-1)
  if (sisteSlutt && sisteSlutt < barnehageStart)
    advarsler.push(
      `Permisjonen slutter ${sisteSlutt}, men barnehagestart er ${barnehageStart}. Det er et gap på ${Math.round(weeksBetween(sisteSlutt, barnehageStart))} uker uten verken permisjon eller barnehage.`
    )

  return { ok: feil.length === 0, advarsler, feil }
}

export function beregnOppsummering(input: PermisjonInput, perioder: PermisjonPeriode[]): PermisjonOppsummering {
  const tilgjengelig = beregnTilgjengeligeUker(input)
  const barnehageStart = beregnBarnehageStart(input.terminDato, input.fodselsDato)
  const fodsel = input.fodselsDato ?? input.terminDato

  const morPerioder = perioder.filter((p) => p.owner === 'meg' && !p.erPause)
  const farPerioder = perioder.filter((p) => p.owner === 'partner' && !p.erPause)

  const morUker = morPerioder.reduce((s, p) => s + weeksBetween(p.fra, addDays(p.til, 1)), 0)
  const farUker = farPerioder.reduce((s, p) => s + weeksBetween(p.fra, addDays(p.til, 1)), 0)

  const morMaks = tilgjengelig.forTermin + tilgjengelig.mødrekvote + tilgjengelig.fellesperiode
  const farMaks = tilgjengelig.fedrekvote + tilgjengelig.fellesperiode

  const sisteSlutt = [...morPerioder, ...farPerioder].map((p) => p.til).sort().at(-1) ?? null

  const fodselYear = new Date(fodsel).getFullYear()
  const sommerBlokker: FerieBlokk[] = input.partnerErLærer
    ? [fodselYear, fodselYear + 1].map((y) => ({
        fra: `${y}-${input.partnerSommerFraManedDag}`,
        til: `${y}-${input.partnerSommerTilManedDag}`,
      }))
    : []

  let sommerUker = 0
  farPerioder.forEach((p) =>
    sommerBlokker.forEach((s) => { sommerUker += ukerOverlapMedFerie(p, s) })
  )

  return {
    barnehageStart,
    dekkerTilBarnehageStart: sisteSlutt !== null && sisteSlutt >= barnehageStart,
    sluttdatoMeg: morPerioder.map((p) => p.til).sort().at(-1) ?? null,
    sluttdatoPartner: farPerioder.map((p) => p.til).sort().at(-1) ?? null,
    ukerdBruktMeg: Math.round(morUker),
    ukerBruktPartner: Math.round(farUker),
    ukerIgjenMeg: Math.max(0, Math.round(morMaks - morUker)),
    ukerIgjenPartner: Math.max(0, Math.round(farMaks - farUker)),
    partnerUkerISommerFerie: Math.round(sommerUker * 10) / 10,
    validering: validerPlan(input, perioder),
  }
}
