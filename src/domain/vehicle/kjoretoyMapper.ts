/**
 * Mapper svar fra Statens vegvesens kjøretøyoppslag (Autosys
 * akfell-datautlevering, enkeltoppslag) til bilkalkulatorens felter.
 *
 * Selve API-kallet skjer server-side i api/kjoretoy.ts (krever gratis
 * API-nøkkel fra Vegvesenet). Denne mapperen er ren og testbar mot
 * fixture av den nestede responsstrukturen.
 *
 * NB: bevisst uten imports (også type-imports) — fila brukes fra både
 * api/ (Vercel/esbuild) og vite.config-dev-middlewaren (node-tsconfig
 * uten @-alias). Drivstofftypen er en lokal literal-union som er
 * strukturelt kompatibel med kalkulatorens FuelType.
 */

/** Delmengde av kalkulatorens FuelType — ladbar hybrid kan ikke skilles ut fra Autosys-data */
export type KjoretoyFuelType = 'bensin' | 'diesel' | 'el' | 'hybrid'

export interface KjoretoyData {
  /** F.eks. "NISSAN LEAF" */
  modelName: string | null
  /** Førstegangsregistrert år */
  year: number | null
  fuelType: KjoretoyFuelType | null
  /** Frist for neste EU-kontroll (ISO-dato) */
  euControlDeadline: string | null
}

/** Minimal strukturell typing av Autosys-responsen — kun feltene vi leser */
interface AutosysResponse {
  kjoretoydataListe?: Array<{
    forstegangsregistrering?: { registrertForstegangNorgeDato?: string }
    periodiskKjoretoyKontroll?: { kontrollfrist?: string }
    godkjenning?: {
      forstegangsGodkjenning?: { forstegangRegistrertDato?: string }
      tekniskGodkjenning?: {
        tekniskeData?: {
          generelt?: {
            merke?: Array<{ merke?: string }>
            handelsbetegnelse?: string[]
          }
          motorOgDrivverk?: {
            motor?: Array<{
              drivstoff?: Array<{ drivstoffKode?: { kodeNavn?: string } }>
            }>
          }
        }
      }
    }
  }>
}

function mapFuel(kodeNavnListe: string[]): KjoretoyFuelType | null {
  const lower = kodeNavnListe.map((n) => n.toLowerCase())
  const hasElectric = lower.some((n) => n.includes('elektrisk'))
  const hasFossil = lower.some((n) => n.includes('bensin') || n.includes('diesel'))
  // Kombinasjon el + fossil = hybrid. Autosys skiller ikke tydelig ladbar/
  // ikke-ladbar her — brukeren kan endre til «Ladbar hybrid» selv.
  if (hasElectric && hasFossil) return 'hybrid'
  if (hasElectric) return 'el'
  if (lower.some((n) => n.includes('diesel'))) return 'diesel'
  if (lower.some((n) => n.includes('bensin'))) return 'bensin'
  return null
}

export function mapKjoretoyResponse(response: unknown): KjoretoyData {
  const entry = (response as AutosysResponse).kjoretoydataListe?.[0]
  const generelt = entry?.godkjenning?.tekniskGodkjenning?.tekniskeData?.generelt

  const merke = generelt?.merke?.[0]?.merke ?? null
  const handelsbetegnelse = generelt?.handelsbetegnelse?.[0] ?? null
  const modelName = merke && handelsbetegnelse
    ? `${merke} ${handelsbetegnelse}`
    : merke ?? handelsbetegnelse

  const regDato =
    entry?.forstegangsregistrering?.registrertForstegangNorgeDato ??
    entry?.godkjenning?.forstegangsGodkjenning?.forstegangRegistrertDato ??
    null
  const year = regDato ? parseInt(regDato.slice(0, 4), 10) : null

  const fuelNames =
    entry?.godkjenning?.tekniskGodkjenning?.tekniskeData?.motorOgDrivverk?.motor
      ?.flatMap((m) => m.drivstoff ?? [])
      .map((d) => d.drivstoffKode?.kodeNavn)
      .filter((n): n is string => Boolean(n)) ?? []

  return {
    modelName,
    year: year !== null && year >= 1950 && year <= 2040 ? year : null,
    fuelType: mapFuel(fuelNames),
    euControlDeadline: entry?.periodiskKjoretoyKontroll?.kontrollfrist ?? null,
  }
}

/** Norske kjennemerker: 2 bokstaver + 4–5 sifre (personbil), tåler mellomrom/små bokstaver */
export function isValidRegnr(value: string): boolean {
  return /^[A-ZÆØÅ]{2}\s?\d{4,5}$/i.test(value.trim())
}
