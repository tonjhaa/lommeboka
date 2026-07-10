import { useState } from 'react'
import { PiggyBank, Check, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { fmtNOK } from './carloanShared'
import { useCarLoanCalculatorStore } from '@/store/useCarLoanCalculatorStore'
import { useEconomyStore } from '@/application/useEconomyStore'
import { resolveAnnualRate, type CarLoanResult } from '@/utils/carLoanCalculator'

/**
 * «Kjøpt bilen? Legg inn i Lommeboka» — oppretter gjeldsposten (vises
 * automatisk i Gjeld-siden OG som gjeldsrad i budsjettet) og én
 * budsjettlinje for driftskostnadene. Ingen dobbeltføring: budsjettets
 * gjeldsrader hentes fra gjeldslisten, så lånet legges kun inn som gjeld.
 */
export function AddToLommeboka({ result }: { result: CarLoanResult }) {
  const inputs = useCarLoanCalculatorStore((s) => s.inputs)
  const addDebt = useEconomyStore((s) => s.addDebt)
  const addBudgetLine = useEconomyStore((s) => s.addBudgetLine)
  const debts = useEconomyStore((s) => s.debts)

  const [open, setOpen] = useState(false)
  const [done, setDone] = useState(false)

  const label = inputs.modelName ?? 'Bil'
  const hasLoan = result.loanAmount > 0
  const alreadyExists = debts.some(
    (d) => d.type === 'billaan' && d.status !== 'nedbetalt' && d.creditor.toLowerCase() === label.toLowerCase()
  )

  function handleCreate() {
    const today = new Date().toISOString().slice(0, 10)
    if (hasLoan) {
      addDebt({
        id: crypto.randomUUID(),
        creditor: label,
        type: 'billaan',
        originalAmount: result.loanAmount,
        currentBalance: result.loanAmount,
        rateHistory: [{ fromDate: today, nominalRate: resolveAnnualRate(inputs) }],
        monthlyPayment: Math.round(result.monthlyInstallment),
        termFee: inputs.termingebyr,
        startDate: today,
      })
    }
    if (result.operatingCostMonthly > 0) {
      addBudgetLine({
        id: crypto.randomUUID(),
        label: `Bilhold — ${label}`,
        category: 'transport',
        amount: -Math.round(result.operatingCostMonthly),
        isRecurring: true,
        source: 'manual',
        isLocked: false,
        isVariable: false,
      })
    }
    setDone(true)
  }

  return (
    <>
      <Button variant="outline" size="sm" className="w-full" onClick={() => { setDone(false); setOpen(true) }}>
        <PiggyBank className="h-4 w-4 mr-1.5" />
        Kjøpt bilen? Legg inn i Lommeboka
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Legg inn i Lommeboka</DialogTitle>
          </DialogHeader>

          {done ? (
            <div className="space-y-3">
              <p className="flex items-center gap-2 text-sm text-green-500">
                <Check className="h-4 w-4" /> Lagt inn!
              </p>
              <p className="text-xs text-muted-foreground">
                {hasLoan && 'Lånet ligger nå under Sparing & gjeld → Gjeld (og vises automatisk i budsjettet). '}
                Driftskostnadene ligger som budsjettlinje under Utgifter → Budsjett.
              </p>
              <Button size="sm" className="w-full" onClick={() => setOpen(false)}>Lukk</Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Dette opprettes:</p>
              <div className="rounded-md border border-border/60 divide-y divide-border/40 text-sm">
                {hasLoan && (
                  <div className="px-3 py-2">
                    <p className="font-medium">Gjeldspost: {label}</p>
                    <p className="text-xs text-muted-foreground">
                      {fmtNOK(result.loanAmount)} · {resolveAnnualRate(inputs)} % ·{' '}
                      {fmtNOK(Math.round(result.monthlyInstallment))} + {fmtNOK(inputs.termingebyr)} gebyr per mnd
                    </p>
                  </div>
                )}
                {result.operatingCostMonthly > 0 && (
                  <div className="px-3 py-2">
                    <p className="font-medium">Budsjettlinje: Bilhold — {label}</p>
                    <p className="text-xs text-muted-foreground">
                      −{fmtNOK(Math.round(result.operatingCostMonthly))}/mnd (kategori Transport)
                    </p>
                  </div>
                )}
              </div>
              {alreadyExists && (
                <p className="flex items-start gap-1.5 text-xs text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  Det finnes allerede et aktivt billån med navnet «{label}» — er du sikker på at du
                  ikke legger inn dobbelt?
                </p>
              )}
              <p className="text-[11px] text-muted-foreground">
                Lånet vises automatisk som gjeldsrad i budsjettet — det legges derfor ikke inn som
                egen budsjettlinje.
              </p>
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Avbryt</Button>
                <Button size="sm" onClick={handleCreate}>Opprett</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
