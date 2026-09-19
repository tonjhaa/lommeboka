import { ArrowDownRight, ArrowRight, ArrowUpRight, RefreshCw } from 'lucide-react'
import { useNavnejaktStore } from '@/store/useNavnejaktStore'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { GENDER_LABEL, type Gender, type Trend } from '@/lib/names/types'

export function TrendIcon({ trend, className }: { trend: Trend | null; className?: string }) {
  if (trend === 'rising') return <ArrowUpRight className={cn('h-3.5 w-3.5 text-success', className)} aria-hidden />
  if (trend === 'falling') return <ArrowDownRight className={cn('h-3.5 w-3.5 text-warning', className)} aria-hidden />
  if (trend === 'stable') return <ArrowRight className={cn('h-3.5 w-3.5 text-muted-foreground', className)} aria-hidden />
  return null
}

export function GenderTag({ gender, className }: { gender: Gender; className?: string }) {
  return (
    <span className={cn('text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground', className)}>
      {GENDER_LABEL[gender]}
    </span>
  )
}

/** Vises når det ikke finnes navnedata: henter dem fra SSB via edge-funksjonen. */
export function SyncButton({ label = 'Hent navnedata fra SSB' }: { label?: string }) {
  const syncing = useNavnejaktStore((s) => s.syncing)
  const message = useNavnejaktStore((s) => s.syncMessage)
  const syncFromSsb = useNavnejaktStore((s) => s.syncFromSsb)
  return (
    <div className="flex flex-col items-center gap-2">
      <Button onClick={() => void syncFromSsb()} disabled={syncing} size="sm" variant="outline">
        <RefreshCw className={cn('h-4 w-4', syncing && 'animate-spin')} />
        {syncing ? 'Henter fra SSB…' : label}
      </Button>
      {message && <p role="status" className="text-xs text-muted-foreground max-w-xs text-center">{message}</p>}
    </div>
  )
}

export function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors min-h-8',
        active ? 'border-primary bg-primary/15 text-primary' : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30',
      )}
    >
      {children}
    </button>
  )
}
