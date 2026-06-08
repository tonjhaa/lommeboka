import { useRef, useState } from 'react'
import { Upload, FileText, CheckCircle, XCircle, Loader2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { parseSlipFromPDF, parseSlipFromPDFWithAI } from './slipParser'
import { useEconomyStore } from '@/application/useEconomyStore'
import type { ParsetLonnsslipp } from '@/types/economy'
import { cn } from '@/lib/utils'

interface PayslipImporterProps {
  onImported?: () => void
  compact?: boolean
}

const MONTH_NAMES = [
  '', 'Januar', 'Februar', 'Mars', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Desember',
]

interface ParseResult {
  file: File
  slip?: ParsetLonnsslipp
  error?: string
}

type State =
  | { stage: 'idle' }
  | { stage: 'processing'; current: number; total: number }
  | { stage: 'preview'; results: ParseResult[] }
  | { stage: 'done'; count: number }

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(',')[1] ?? result)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function isPartialParse(slip: ParsetLonnsslipp): boolean {
  if (slip.nettoUtbetalt === 0) return true
  // Juni-slipper har legitimt ingen skattetrekk — feriepenger er skattefrie
  if (slip.periode.month === 6 && (slip.feriepenger ?? 0) > 0) return false
  return slip.skattetrekk === 0
}

function fmtNOK(n: number): string {
  return n.toLocaleString('no-NO', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' kr'
}

export function PayslipImporter({ onImported, compact }: PayslipImporterProps) {
  const [state, setState] = useState<State>({ stage: 'idle' })
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const importSlip = useEconomyStore((s) => s.importSlip)

  async function processFiles(files: File[], useAI = false) {
    const pdfs = files
      .filter((f) => f.name.endsWith('.pdf') || f.type === 'application/pdf')
      .slice(0, 10)  // maks 10 filer per økt
    if (pdfs.length === 0) {
      setState({ stage: 'idle' })
      return
    }

    const results: ParseResult[] = []
    for (let i = 0; i < pdfs.length; i++) {
      setState({ stage: 'processing', current: i + 1, total: pdfs.length })
      try {
        let slip: import('@/types/economy').ParsetLonnsslipp
        if (useAI) {
          slip = await parseSlipFromPDFWithAI(pdfs[i])
        } else {
          slip = await parseSlipFromPDF(pdfs[i])
        }
        results.push({ file: pdfs[i], slip })
      } catch (err) {
        results.push({
          file: pdfs[i],
          error: err instanceof Error ? err.message : 'Ukjent feil',
        })
      }
    }
    setState({ stage: 'preview', results })
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) processFiles(files)
  }

  async function handleSaveAll(results: ParseResult[]) {
    const successful = results.filter((r) => r.slip)
    for (const r of successful) {
      let pdfBase64: string | undefined
      try { pdfBase64 = await fileToBase64(r.file) } catch { /* fortsett uten PDF */ }
      importSlip(r.slip!, pdfBase64)
    }
    setState({ stage: 'done', count: successful.length })
    onImported?.()
  }

  // ---- Done ----
  if (state.stage === 'done') {
    return (
      <div className="flex items-center gap-2 text-green-500 text-sm">
        <CheckCircle className="h-4 w-4" />
        {state.count === 1 ? 'Lønnsslipp importert.' : `${state.count} lønnsslipper importert.`}
      </div>
    )
  }

  // ---- Preview (results list) ----
  if (state.stage === 'preview') {
    const { results } = state
    const hasAny = results.some((r) => r.slip)
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium">
          {results.length === 1 ? 'Bekreft import' : `Bekreft import av ${results.length} slipper`}
        </p>
        <div className="space-y-1">
          {results.map((r, idx) => {
            if (r.error) {
              return (
                <div key={idx} className="flex items-start gap-2 text-sm text-red-400">
                  <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>
                    <span className="font-medium">{r.file.name}</span>
                    {' '}— {r.error}
                  </span>
                </div>
              )
            }
            const slip = r.slip!
            const partial = isPartialParse(slip)
            const monthName = MONTH_NAMES[slip.periode.month]
            return (
              <div key={idx} className="flex items-start gap-2 text-sm">
                {partial ? (
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-yellow-400" />
                ) : (
                  <CheckCircle className="h-4 w-4 mt-0.5 shrink-0 text-green-500" />
                )}
                <span className={partial ? 'text-yellow-400' : ''}>
                  <span className="font-medium">{monthName} {slip.periode.year}</span>
                  {' '}— {fmtNOK(slip.nettoUtbetalt)} netto
                  {partial && <span className="text-xs ml-1">(delvis parser)</span>}
                </span>
              </div>
            )
          })}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            size="sm"
            disabled={!hasAny}
            onClick={() => handleSaveAll(results)}
          >
            <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
            {results.length === 1 ? 'Lagre' : `Lagre alle (${results.filter(r => r.slip).length})`}
          </Button>
          {results.some((r) => r.slip && isPartialParse(r.slip)) && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => processFiles(results.map((r) => r.file), true)}
            >
              ✨ Prøv med AI
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setState({ stage: 'idle' })}>
            Avbryt
          </Button>
        </div>
      </div>
    )
  }

  // ---- Processing ----
  if (state.stage === 'processing') {
    return (
      <div className={cn('flex flex-col items-center gap-2 text-center', compact ? 'p-4' : 'p-8')}>
        <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
        <p className="text-sm text-muted-foreground">
          Behandler fil {state.current} av {state.total}...
        </p>
      </div>
    )
  }

  // ---- Idle (drop zone) ----
  return (
    <div
      className={cn(
        'border-2 border-dashed rounded-lg transition-colors cursor-pointer',
        dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50',
        compact ? 'p-4' : 'p-8'
      )}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          if (files.length > 0) processFiles(files)
          // Reset input so same files can be re-selected
          e.target.value = ''
        }}
      />

      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex items-center justify-center h-12 w-12 rounded-full bg-muted">
          <Upload className="h-5 w-5 text-muted-foreground" />
        </div>
        {!compact && <p className="font-medium text-sm">Last opp lønnsslipp(er)</p>}
        <p className="text-xs text-muted-foreground">
          Dra og slipp én eller flere PDF-er, eller klikk for å velge
        </p>
      </div>
    </div>
  )
}

// ---- Enkelt-fil preview (brukes ikke lenger direkte, beholdes for bakoverkompatibilitet) ----
export function SlipPreviewCard({
  slip,
  onClose,
}: {
  slip: ParsetLonnsslipp
  onClose: () => void
}) {
  const rows = [
    { label: 'Periode', value: `${MONTH_NAMES[slip.periode.month]} ${slip.periode.year}`, highlight: true },
    { label: 'Netto utbetalt', value: fmtNOK(slip.nettoUtbetalt), highlight: true },
    { label: 'Bruttosum', value: fmtNOK(slip.bruttoSum) },
    { label: 'Månedslønn (1S01)', value: fmtNOK(slip.maanedslonn) },
    { label: 'Skattetrekk', value: `-${fmtNOK(slip.skattetrekk)}`, highlight: true },
    ...(slip.pensjonstrekk > 0 ? [{ label: 'Pensjonstrekk', value: `-${fmtNOK(slip.pensjonstrekk)}` }] : []),
    ...(slip.husleietrekk > 0 ? [{ label: 'Husleietrekk', value: `-${fmtNOK(slip.husleietrekk)}` }] : []),
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <FileText className="h-4 w-4" />
          Slipp-detaljer
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-md border border-border overflow-hidden">
          <table className="w-full text-sm">
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className={cn('border-b border-border last:border-0', row.highlight && 'bg-muted/50')}>
                  <td className="px-3 py-2 text-muted-foreground">{row.label}</td>
                  <td className="px-3 py-2 text-right font-mono font-medium">{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Button variant="outline" size="sm" onClick={onClose}>Lukk</Button>
      </CardContent>
    </Card>
  )
}
