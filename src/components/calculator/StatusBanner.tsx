import { CheckCircle2, XCircle, AlertTriangle, Info } from 'lucide-react'
import type { LoanAnalysis } from '@/types'
import { cn } from '@/lib/utils'
import { formatCurrency, formatPercent } from '@/lib/utils'

interface Props {
  analysis: LoanAnalysis
}

function Stat({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="text-center">
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p
        className={cn(
          'text-sm font-semibold',
          ok === true ? 'text-green-400' : ok === false ? 'text-red-400' : 'text-foreground'
        )}
      >
        {value}
      </p>
    </div>
  )
}

export function StatusBanner({ analysis }: Props) {
  const { status, equity, debtRatio, affordability, affordability: aff } = analysis
  const approved = status.approved

  return (
    <div
      className={cn(
        'rounded-lg border p-4',
        approved
          ? 'border-green-400/30 bg-green-400/5'
          : 'border-red-400/30 bg-red-400/5'
      )}
    >
      <div className="flex items-center gap-3 mb-4">
        {approved ? (
          <CheckCircle2 className="h-6 w-6 text-green-400 shrink-0" />
        ) : (
          <XCircle className="h-6 w-6 text-red-400 shrink-0" />
        )}
        <div>
          <p className={cn('font-semibold text-base', approved ? 'text-green-400' : 'text-red-400')}>
            {approved ? 'Lånesøknaden er innenfor reglene' : 'Lånesøknaden oppfyller ikke kravene'}
          </p>
          <p className="text-xs text-muted-foreground">
            {status.errorCount > 0
              ? `${status.errorCount} krav ikke oppfylt${status.warningCount > 0 ? `, ${status.warningCount} ${status.warningCount === 1 ? 'advarsel' : 'advarsler'}` : ''}`
              : status.warningCount > 0
              ? `${status.warningCount} ${status.warningCount === 1 ? 'advarsel' : 'advarsler'}`
              : 'Alle krav er oppfylt'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 pt-3 border-t border-border/50">
        <Stat
          label="Egenkapital"
          value={formatPercent(equity.equityPercent)}
          ok={equity.approved}
        />
        <Stat
          label="Gjeldsgrad"
          value={`${debtRatio.debtRatio.toFixed(1)}×`}
          ok={debtRatio.approved}
        />
        <Stat
          label="Disponibelt"
          value={formatCurrency(aff.disposableAmount)}
          ok={affordability.approved}
        />
      </div>
    </div>
  )
}

interface MessageListProps {
  analysis: LoanAnalysis
}

export function RuleMessageList({ analysis }: MessageListProps) {
  const errors = analysis.status.messages.filter((m) => m.severity === 'error')
  const warnings = analysis.status.messages.filter((m) => m.severity === 'warning')
  const infos = analysis.status.messages.filter((m) => m.severity === 'info' || m.severity === 'success')

  if (errors.length === 0 && warnings.length === 0 && infos.length === 0) return null

  return (
    <div className="space-y-2">
      {[...errors, ...warnings, ...infos].map((msg) => {
        const icon =
          msg.severity === 'error' ? (
            <XCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
          ) : msg.severity === 'warning' ? (
            <AlertTriangle className="h-4 w-4 text-yellow-400 shrink-0 mt-0.5" />
          ) : (
            <Info className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
          )

        return (
          <div
            key={msg.id}
            className={cn(
              'flex gap-2.5 rounded-md border px-3 py-2.5 text-sm',
              msg.severity === 'error'
                ? 'border-red-400/20 bg-red-400/5'
                : msg.severity === 'warning'
                ? 'border-yellow-400/20 bg-yellow-400/5'
                : 'border-border bg-card'
            )}
          >
            {icon}
            <div>
              <p className="font-medium text-foreground">{msg.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{msg.message}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
