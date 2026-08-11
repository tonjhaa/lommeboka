import { useRef, useState } from 'react'
import { Upload, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { parseSavingsStatement } from './savingsStatementParser'
import { useEconomyStore } from '@/application/useEconomyStore'
import type { ParsedBankStatement } from '@/domain/economy/bankTransactionParser'
import { findStatementAccount } from '@/domain/economy/savingsStatementHistory'
import { cn } from '@/lib/utils'

function fmtNOK(n: number) {
  return Math.round(n).toLocaleString('no-NO') + ' kr'
}

type State =
  | { stage: 'idle' }
  | { stage: 'processing' }
  | { stage: 'preview'; parsed: ParsedBankStatement; isUpdate: boolean }
  | { stage: 'done'; label: string; isUpdate: boolean }
  | { stage: 'error'; message: string }

export function SavingsImporter({ onDone }: { onDone?: () => void }) {
  const [state, setState] = useState<State>({ stage: 'idle' })
  const [dragging, setDragging] = useState(false)
  const [saldobOverride, setSaldoOverride] = useState<string>('')
  const inputRef = useRef<HTMLInputElement>(null)
  const { savingsAccounts, importSavingsStatement } = useEconomyStore()

  async function processFile(file: File) {
    setState({ stage: 'processing' })
    try {
      const parsed = await parseSavingsStatement(file)
      const rawText = (parsed as ParsedBankStatement & { _rawText?: string })._rawText ?? ''

      if (parsed.closingBalance === 0 && parsed.accountNumber === '') {
        // Vis de første 300 tegnene av ekstrahert tekst for debugging
        const preview = rawText.slice(0, 300).replace(/\n/g, ' ↵ ')
        throw new Error(
          `Fant ingen kontoinformasjon. Kontroller at dette er en Trøndelag Sparebank transaksjonsrapport.\n\nEkstrahert tekst (start): ${preview}`
        )
      }
      const isUpdate = findStatementAccount(savingsAccounts, parsed) !== undefined
      setSaldoOverride(String(Math.round(parsed.closingBalance)))
      setState({ stage: 'preview', parsed, isUpdate })
    } catch (err) {
      setState({ stage: 'error', message: err instanceof Error ? err.message : 'Ukjent feil' })
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = Array.from(e.dataTransfer.files).find(
      (f) =>
        f.name.endsWith('.pdf') || f.type === 'application/pdf' ||
        f.name.endsWith('.csv') || f.type === 'text/csv'
    )
    if (file) processFile(file)
  }

  function handleConfirm(parsed: ParsedBankStatement, isUpdate: boolean) {
    const overrideVal = parseFloat(saldobOverride.replace(/\s/g, '').replace(',', '.'))
    const finalParsed = !isNaN(overrideVal) && overrideVal > 0
      ? { ...parsed, closingBalance: overrideVal }
      : parsed
    importSavingsStatement(finalParsed)
    setState({ stage: 'done', label: parsed.accountLabel, isUpdate })
    setSaldoOverride('')
    onDone?.()
  }

  // ---- Done ----
  if (state.stage === 'done') {
    return (
      <div className="flex items-center gap-2 text-green-500 text-sm py-2">
        <CheckCircle className="h-4 w-4 shrink-0" />
        {state.isUpdate
          ? `${state.label} oppdatert med ny saldo.`
          : `${state.label} lagt til som ny sparekonto.`}
      </div>
    )
  }

  // ---- Error ----
  if (state.stage === 'error') {
    return (
      <div className="space-y-2">
        <div className="flex items-start gap-2 text-red-400 text-sm">
          <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <pre className="whitespace-pre-wrap break-words font-sans max-h-48 overflow-y-auto text-xs">
            {state.message}
          </pre>
        </div>
        <Button variant="outline" size="sm" onClick={() => setState({ stage: 'idle' })}>
          Prøv igjen
        </Button>
      </div>
    )
  }

  // ---- Preview ----
  if (state.stage === 'preview') {
    const { parsed, isUpdate } = state
    const computedBalance = parsed.closingBalance
    const overrideVal = parseFloat(saldobOverride.replace(/\s/g, '').replace(',', '.'))
    const effectiveBalance = !isNaN(overrideVal) && overrideVal > 0 ? overrideVal : computedBalance

    const infoRows = [
      { label: 'Kontonummer', value: parsed.accountNumber || '—' },
      { label: 'Kontotype', value: parsed.accountLabel },
      { label: 'Siste dato', value: parsed.printDate },
      { label: 'Estimert månedssparing', value: fmtNOK(parsed.estimatedMonthlyContribution) },
      ...(parsed.estimatedAnnualInterestRate != null
        ? [{ label: 'Estimert rente', value: `${parsed.estimatedAnnualInterestRate} %` }]
        : []),
      { label: 'Transaksjoner funnet', value: String(parsed.transactions.length) },
    ]
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium">
          {isUpdate ? 'Oppdater eksisterende konto' : 'Importer ny sparekonto'}
        </p>
        <div className="rounded-md border border-border overflow-hidden text-sm">
          <table className="w-full">
            <tbody>
              {infoRows.map((row) => (
                <tr key={row.label} className="border-b border-border/50 last:border-0">
                  <td className="px-3 py-1.5 text-muted-foreground">{row.label}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{row.value}</td>
                </tr>
              ))}
              {/* Saldo — redigerbar */}
              <tr className="border-b border-border/50 last:border-0 bg-muted/10">
                <td className="px-3 py-1.5 text-muted-foreground">
                  <div>Nåværende saldo</div>
                  <div className="text-xs text-yellow-500/80">Sjekk mot nettbanken og korriger om nødvendig</div>
                </td>
                <td className="px-3 py-1.5 text-right">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={saldobOverride}
                    onChange={(e) => setSaldoOverride(e.target.value)}
                    className="w-32 text-right font-mono text-sm bg-input border border-primary/50 rounded px-2 py-1 focus:outline-none focus:border-primary"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        {!isNaN(overrideVal) && Math.round(overrideVal) !== Math.round(computedBalance) && (
          <p className="text-xs text-yellow-500">
            Beregnet fra transaksjoner: {fmtNOK(computedBalance)} — vil importere {fmtNOK(effectiveBalance)}
          </p>
        )}
        {isUpdate && (
          <p className="text-xs text-muted-foreground">
            Fant eksisterende konto. Utskriften er fasit for perioden den dekker, så
            innskudd du har lagt inn manuelt der blir erstattet. Planlagte innskudd
            fram i tid, rentesatser og resten av oppsettet står urørt.
          </p>
        )}
        <div className="flex gap-2">
          <Button size="sm" onClick={() => handleConfirm(parsed, isUpdate)}>
            <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
            {isUpdate ? 'Oppdater' : 'Importer'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setState({ stage: 'idle' }); setSaldoOverride('') }}>
            Avbryt
          </Button>
        </div>
      </div>
    )
  }

  // ---- Processing ----
  if (state.stage === 'processing') {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center">
        <Loader2 className="h-7 w-7 text-muted-foreground animate-spin" />
        <p className="text-sm text-muted-foreground">Leser kontorapport...</p>
      </div>
    )
  }

  // ---- Idle drop zone ----
  return (
    <div
      className={cn(
        'border-2 border-dashed rounded-lg transition-colors cursor-pointer p-6',
        dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50',
      )}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf,.csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) processFile(file)
          e.target.value = ''
        }}
      />
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex items-center justify-center h-10 w-10 rounded-full bg-muted">
          <Upload className="h-4 w-4 text-muted-foreground" />
        </div>
        <p className="font-medium text-sm">Last opp kontorapport (PDF)</p>
        <p className="text-xs text-muted-foreground">
          Trøndelag Sparebank CSV (anbefalt) eller PDF. Dra og slipp eller klikk.
        </p>
      </div>
    </div>
  )
}
