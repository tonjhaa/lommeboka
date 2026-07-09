import { useEconomyStore } from '@/application/useEconomyStore'
import { parseSlipFromBase64 } from './slipParser'

/**
 * Bumpes når slipParser/salaryCalculator endrer beregningslogikk slik at
 * allerede importerte slipper må re-parses fra lagret PDF.
 *
 * v2 (juni 2026): signert netto for ATF/OF19/10P2 på korreksjonsslipper,
 * artskode 2250, fravaerstrekk (2700/2713).
 */
export const SLIP_PARSER_VERSION = 2

export interface ReparseResult {
  updated: number
  failed: number
  missingPdf: number
  /** true = alle slipper behandlet, versjonsflagget er satt */
  completed: boolean
}

/**
 * Re-parser alle importerte slipper fra lagret PDF (lokal base64 eller
 * Supabase Storage) med gjeldende parser, og oppdaterer slipData/netto.
 *
 * Kjøres automatisk én gang per SLIP_PARSER_VERSION-bump (fra EconomyPage).
 * Versjonsflagget settes kun når ingen nedlastinger feilet, slik at
 * transiente feil prøves på nytt neste økt.
 */
let inFlight: Promise<ReparseResult> | null = null

export function reparseAllSlips(): Promise<ReparseResult> {
  // StrictMode/dobbeltmontering: gjenbruk pågående kjøring
  inFlight ??= doReparse().finally(() => { inFlight = null })
  return inFlight
}

async function doReparse(): Promise<ReparseResult> {
  const store = useEconomyStore.getState()
  const records = store.monthHistory
    .filter((m) => m.source === 'imported_slip' && m.slipData)
    .sort((a, b) => a.year - b.year || a.month - b.month)

  const result: ReparseResult = { updated: 0, failed: 0, missingPdf: 0, completed: false }

  if (records.length === 0) {
    store.setSlipParserVersion(SLIP_PARSER_VERSION)
    result.completed = true
    return result
  }

  // Trenger innlogging for å hente PDF-er fra Supabase Storage
  const { supabase } = await import('@/lib/supabase')
  const { data: { user } } = await supabase.auth.getUser()

  const { downloadSlipPDF, slipPath } = await import('@/lib/slipStorage')

  for (const rec of records) {
    let base64 = rec.slipPdfBase64 ?? null
    let storagePath = rec.slipStoragePath

    if (!base64 && user) {
      storagePath = storagePath ?? slipPath(user.id, rec.year, rec.month)
      base64 = await downloadSlipPDF(storagePath)
    }
    if (!base64) {
      result.missingPdf++
      continue
    }

    try {
      const slip = await parseSlipFromBase64(base64)
      if (slip.periode.year !== rec.year || slip.periode.month !== rec.month) {
        console.warn(
          `[reparseSlips] ${rec.year}-${rec.month}: PDF parser til annen periode (${slip.periode.year}-${slip.periode.month}) — hopper over`
        )
        result.failed++
        continue
      }
      useEconomyStore.getState().updateMonthRecord(rec.year, rec.month, {
        slipData: slip,
        nettoUtbetalt: slip.nettoUtbetalt,
        disposable: slip.nettoUtbetalt,
        ...(storagePath && !rec.slipStoragePath ? { slipStoragePath: storagePath } : {}),
      })
      result.updated++
    } catch (e) {
      console.warn(`[reparseSlips] ${rec.year}-${rec.month}: parsing feilet`, e)
      result.failed++
    }
  }

  // Versjonsflagget settes KUN når ingen nedlastinger/parsinger faktisk feilet
  // (result.failed) — en glemt sjekk her lot forbigående nettverksfeil sette
  // flagget likevel så lenge brukeren var innlogget, og de berørte slippene
  // ble aldri prøvd på nytt (fant faktisk juni-2026-slipp med manglende
  // feriepenger/ferietrekk/ATF som følge av nettopp dette).
  // missingPdf uten innlogging = prøv igjen neste økt; ellers er vi ferdige
  // (PDF-er som ikke finnes i bucketen dukker ikke opp ved retry uansett)
  if (result.failed === 0 && (user || result.missingPdf === 0)) {
    useEconomyStore.getState().setSlipParserVersion(SLIP_PARSER_VERSION)
    result.completed = true
  }

  console.info(
    `[reparseSlips] Ferdig: ${result.updated} oppdatert, ${result.failed} feilet, ${result.missingPdf} uten PDF`
  )
  return result
}
