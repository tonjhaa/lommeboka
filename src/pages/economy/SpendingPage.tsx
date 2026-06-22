import { useState, useMemo } from 'react'
import { Trash2 } from 'lucide-react'
import { useActiveEconomyStore } from '@/contexts/EconomyStoreContext'
import { aggregateByCategory } from '@/domain/economy/spendingCategorizer'
import { lineAmt, monthInDateRange } from '@/domain/economy/budgetTableComputer'
import { SpendingImporter } from '@/features/spending/SpendingImporter'
import type { BudgetCategory } from '@/types/economy'

const SPENDING_CATEGORIES: BudgetCategory[] = ['mat', 'transport', 'bolig', 'helse', 'abonnement', 'forsikring', 'klær', 'fritid', 'annet_forbruk']
const fmt = (n: number) => Math.round(n).toLocaleString('no-NO') + ' kr'
const nowYear = new Date().getFullYear()

export function SpendingPage() {
  const txs = useActiveEconomyStore((s) => s.spendingTransactions)
  const budgetLines = useActiveEconomyStore((s) => s.budgetTemplate.lines)
  const learnedRules = useActiveEconomyStore((s) => s.categoryRules)
  const removeRule = useActiveEconomyStore((s) => s.removeCategoryRule)
  const [year, setYear] = useState(nowYear)
  const [month, setMonth] = useState(new Date().getMonth() + 1)

  const actual = useMemo(() => aggregateByCategory(txs, year, month), [txs, year, month])
  // Budsjett per kategori for VALGT måned — samme aktiveringslogikk som budsjettabellen
  // (isRecurring/specificMonth/temporary-periode/periodOverride), ellers blir sammenligningen feil.
  const budgetByCat = useMemo(() => {
    const out: Partial<Record<BudgetCategory, number>> = {}
    for (const l of budgetLines) {
      const active = l.isRecurring || (l.specificMonth === month && (!l.specificYear || l.specificYear === year))
      if (!active) continue
      if (!monthInDateRange(year, month, l.temporaryFromDate, l.temporaryToDate)) continue
      const amt = lineAmt(l, year, month)
      if (amt < 0) out[l.category] = (out[l.category] ?? 0) + Math.abs(amt)
    }
    return out
  }, [budgetLines, year, month])

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Forbruk</h2>
        <div className="flex items-center gap-2 text-sm">
          <select value={month} onChange={(e) => setMonth(parseInt(e.target.value, 10))} className="rounded border border-border/50 bg-background px-2 py-1" aria-label="Måned">
            {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
          </select>
          <select value={year} onChange={(e) => setYear(parseInt(e.target.value, 10))} className="rounded border border-border/50 bg-background px-2 py-1" aria-label="År">
            {[nowYear, nowYear - 1].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      <div className="rounded-xl border border-border/50 bg-card/60 p-4">
        <h3 className="mb-2 text-sm font-medium">Importer brukskonto</h3>
        <SpendingImporter />
      </div>

      <div className="rounded-xl border border-border/50 bg-card/60 p-4">
        <h3 className="mb-2 text-sm font-medium">Forbruk vs budsjett — {month}/{year}</h3>
        <div className="space-y-1.5">
          {SPENDING_CATEGORIES.map((c) => {
            const a = actual[c] ?? 0
            const b = budgetByCat[c] ?? 0
            if (a === 0 && b === 0) return null
            const diff = a - b
            return (
              <div key={c} className="flex items-center justify-between text-[12px]">
                <span className="capitalize">{c.replace('_', ' ')}</span>
                <span className="flex items-center gap-3 font-mono">
                  <span className="text-muted-foreground">{fmt(b)}</span>
                  <span>{fmt(a)}</span>
                  <span className={diff > 0 ? 'text-red-400' : 'text-green-400'}>{diff > 0 ? '+' : ''}{fmt(diff)}</span>
                </span>
              </div>
            )
          })}
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground/60">Budsjett · faktisk · avvik. Kalibrering av prognosen mot dette kommer senere.</p>
      </div>

      {learnedRules.length > 0 && (
        <div className="rounded-xl border border-border/50 bg-card/60 p-4">
          <h3 className="mb-2 text-sm font-medium">Lærte kategoriregler</h3>
          <div className="space-y-1">
            {learnedRules.map((r) => (
              <div key={r.id} className="flex items-center justify-between text-[11px]">
                <span className="min-w-0 flex-1 truncate"><span className="text-muted-foreground">{r.merchantKey}</span> → <span className="capitalize">{r.category.replace('_', ' ')}</span></span>
                <button onClick={() => removeRule(r.merchantKey)} className="shrink-0 text-muted-foreground hover:text-red-400" aria-label={`Fjern regel for ${r.merchantKey}`}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground/60">Å fjerne en regel re-kategoriserer lagrede transaksjoner for motparten.</p>
        </div>
      )}
    </div>
  )
}
