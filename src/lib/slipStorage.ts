import { supabase } from './supabase'

const BUCKET = 'payslips'

async function getUserId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

export function slipPath(userId: string, year: number, month: number): string {
  return `${userId}/${year}-${String(month).padStart(2, '0')}.pdf`
}

export async function uploadSlipPDF(
  year: number,
  month: number,
  pdfBase64: string
): Promise<string | null> {
  const userId = await getUserId()
  if (!userId) return null

  try {
    const path = slipPath(userId, year, month)
    const binary = atob(pdfBase64.replace(/^data:application\/pdf;base64,/, ''))
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const blob = new Blob([bytes], { type: 'application/pdf' })

    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
      upsert: true,
      contentType: 'application/pdf',
    })
    if (error) {
      console.error('[slipStorage] upload feil:', error.message)
      return null
    }
    return path
  } catch (e) {
    console.error('[slipStorage] upload exception:', e)
    return null
  }
}

export async function downloadSlipPDF(storagePath: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage.from(BUCKET).download(storagePath)
    if (error || !data) {
      if (error) console.error('[slipStorage] download feil:', error.message)
      return null
    }

    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.readAsDataURL(data)
    })
  } catch (e) {
    console.error('[slipStorage] download exception:', e)
    return null
  }
}

export async function migrateLocalPDFs(
  monthHistory: Array<{ year: number; month: number; slipPdfBase64?: string; slipStoragePath?: string }>,
  updateRecord: (year: number, month: number, storagePath: string) => void
): Promise<void> {
  const userId = await getUserId()
  if (!userId) return

  const toMigrate = monthHistory.filter(
    (m) => m.slipPdfBase64 && !m.slipStoragePath
  )

  for (const m of toMigrate) {
    const path = await uploadSlipPDF(m.year, m.month, m.slipPdfBase64!)
    if (path) {
      updateRecord(m.year, m.month, path)
    }
  }
}
