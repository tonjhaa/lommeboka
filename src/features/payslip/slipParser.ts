import type { ParsetLonnsslipp } from '@/types/economy'
import { parseForsvarsSlipp } from '@/domain/economy/salaryCalculator'
import { parseGenericSlipp, isForsvarsSlipp } from '@/domain/economy/genericSlipParser'
// Vite løser dette til en hashed lokal URL i bundles — ingen CDN-avhengighet
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

async function extractTextFromPDF(data: ArrayBuffer | Uint8Array): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc

  const pdf = await pdfjsLib.getDocument({ data }).promise

  const allLines: string[] = []

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    const content = await page.getTextContent()

    // Grupper items etter Y-posisjon (transform[5]).
    // PDF-koordinater øker oppover, så vi sorterer synkende (øverst = størst Y).
    // Runder til nærmeste 2pt for å slå sammen items som er minimalt vertikalt forskjøvet.
    const lineMap = new Map<number, string[]>()
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue
      const y = Math.round((item as { str: string; transform: number[] }).transform[5] / 2) * 2
      if (!lineMap.has(y)) lineMap.set(y, [])
      lineMap.get(y)!.push(item.str.trim())
    }

    const sortedYs = [...lineMap.keys()].sort((a, b) => b - a)
    for (const y of sortedYs) {
      allLines.push(lineMap.get(y)!.join(' '))
    }
  }

  return allLines.join('\n')
}

/**
 * Ekstraherer tekst fra PDF og parser lønnsslippen.
 * Velger automatisk parser basert på format-deteksjon.
 */
export async function parseSlipFromPDF(file: File): Promise<ParsetLonnsslipp> {
  return parseSlipFromData(await file.arrayBuffer())
}

/** Parser lønnsslipp fra rå PDF-bytes (brukes ved re-parsing av lagrede slipper). */
export async function parseSlipFromData(data: ArrayBuffer | Uint8Array): Promise<ParsetLonnsslipp> {
  const fullText = await extractTextFromPDF(data)
  if (isForsvarsSlipp(fullText)) {
    return parseForsvarsSlipp(fullText)
  }
  return parseGenericSlipp(fullText)
}

/** Dekoder en (data-URL eller ren) base64-PDF til bytes og parser den. */
export async function parseSlipFromBase64(base64: string): Promise<ParsetLonnsslipp> {
  const clean = base64.replace(/^data:application\/pdf;base64,/, '')
  const binary = atob(clean)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return parseSlipFromData(bytes)
}

/**
 * Parser lønnsslipp med AI via Supabase Edge Function.
 * Bruker utviklerens Anthropic-nøkkel (Supabase secret) — ingen kostnad for bruker.
 * Rate-begrenset til 20 slipper per bruker per dag.
 */
export async function parseSlipFromPDFWithAI(file: File): Promise<ParsetLonnsslipp> {
  const { supabase } = await import('@/lib/supabase')
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Ikke innlogget')

  const fullText = await extractTextFromPDF(await file.arrayBuffer())

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-payslip`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ text: fullText }),
    }
  )

  if (!response.ok) {
    const err = await response.text().catch(() => 'Ukjent feil')
    throw new Error(`AI-parsing feilet: ${err}`)
  }

  return response.json() as Promise<ParsetLonnsslipp>
}
