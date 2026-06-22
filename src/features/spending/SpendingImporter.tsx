import { useRef, useState } from 'react'
import { Upload, Check } from 'lucide-react'
import { parseSpendingFile } from './spendingStatementReader'
import { applyCategories, seedCategoryRules, normalizeCounterparty } from '@/domain/economy/spendingCategorizer'
import { useEconomyStore } from '@/application/useEconomyStore'
import type { BankSpendingTransaction, BudgetCategory, CategoryRule } from '@/types/economy'

const SPENDING_CATEGORIES: BudgetCategory[] = ['mat', 'transport', 'bolig', 'helse', 'abonnement', 'forsikring', 'klær', 'fritid', 'annet_forbruk']
const catLabel = (c: BudgetCategory) => c.replace('_', ' ')

export function SpendingImporter({ onDone }: { onDone?: () => void }) {
  const learnedRules = useEconomyStore((s) => s.categoryRules)
  const addTxs = useEconomyStore((s) => s.addSpendingTransactions)
  const setRule = useEconomyStore((s) => s.setCategoryRule)
  const fileRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<BankSpendingTransaction[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [newRules, setNewRules] = useState<CategoryRule[]>([])

  async function handleFile(file: File) {
    setError(null)
    try {
      const parsed = await parseSpendingFile(file)
      const allRules = [...learnedRules, ...newRules, ...seedCategoryRules()]
      setRows(applyCategories(parsed, allRules))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kunne ikke lese filen')
    }
  }

  function setRowCategory(idx: number, category: BudgetCategory, applyToAll: boolean) {
    setRows((prev) => {
      if (!prev) return prev
      const row = prev[idx]
      if (applyToAll) {
        const rule: CategoryRule = { id: crypto.randomUUID(), merchantKey: row.counterpartyKey, category, source: 'learned' }
        setNewRules((r) => [...r.filter((x) => x.merchantKey !== rule.merchantKey), rule])
        return prev.map((t) => t.counterpartyKey === row.counterpartyKey ? { ...t, category, categorySource: 'learned' } : t)
      }
      return prev.map((t, i) => i === idx ? { ...t, category, categorySource: 'manual' } : t)
    })
  }

  function save() {
    if (!rows) return
    newRules.forEach(setRule)
    addTxs(rows)
    setRows(null); setNewRules([])
    onDone?.()
  }

  if (!rows) {
    return (
      <div className="space-y-3">
        <button onClick={() => fileRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border/60 py-8 text-sm text-muted-foreground hover:border-primary hover:text-foreground">
          <Upload className="h-5 w-5" /> Velg brukskonto-CSV
        </button>
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
        {error && <p className="text-[11px] text-red-400">{error}</p>}
      </div>
    )
  }

  // Ukategoriserte først
  const sorted = [...rows].sort((a, b) => (a.category ? 1 : 0) - (b.category ? 1 : 0))
  const uncategorized = rows.filter((r) => !r.category).length

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span>{rows.length} transaksjoner · <span className={uncategorized ? 'text-yellow-400' : 'text-green-400'}>{uncategorized} ukategorisert</span></span>
        <button onClick={save} className="flex items-center gap-1 rounded bg-primary/20 px-3 py-1 text-primary"><Check className="h-4 w-4" /> Lagre</button>
      </div>
      <div className="max-h-96 space-y-1 overflow-y-auto">
        {sorted.map((r) => {
          const idx = rows.indexOf(r)
          return (
            <div key={r.id} className="flex items-center gap-2 rounded-md border border-border/40 px-2 py-1 text-[11px]">
              <span className="w-20 shrink-0 text-muted-foreground">{r.date}</span>
              <span className="min-w-0 flex-1 truncate">{r.counterpartyRaw || normalizeCounterparty(r.counterpartyKey)}</span>
              <span className="w-20 shrink-0 text-right font-mono">{r.amount.toLocaleString('no-NO')}</span>
              <select value={r.category ?? ''} onChange={(e) => setRowCategory(idx, e.target.value as BudgetCategory, true)}
                className="shrink-0 rounded border border-border/50 bg-background px-1 py-0.5 text-[11px]"
                aria-label={`Kategori for ${r.counterpartyRaw}`}>
                <option value="" disabled>Velg…</option>
                {SPENDING_CATEGORIES.map((c) => <option key={c} value={c}>{catLabel(c)}</option>)}
              </select>
            </div>
          )
        })}
      </div>
      <p className="text-[10px] text-muted-foreground/60">Endring av kategori lærer regelen for motparten (brukes neste gang). Lagre for å bekrefte.</p>
    </div>
  )
}
