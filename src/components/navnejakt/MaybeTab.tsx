import { useMemo, useState } from 'react'
import { Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useNavnejaktStore } from '@/store/useNavnejaktStore'
import { rankLine } from '@/lib/names/format'
import type { NameRow } from '@/lib/names/types'
import { NameDetailDialog } from './NameDetailDialog'
import { GenderTag } from './shared'

export function MaybeTab() {
  const votes = useNavnejaktStore((s) => s.votes)
  const namesById = useNavnejaktStore((s) => s.namesById)
  const latestYear = useNavnejaktStore((s) => s.latestYear)
  const vote = useNavnejaktStore((s) => s.vote)
  const [detail, setDetail] = useState<NameRow | null>(null)

  const maybes = useMemo(() => {
    const rows: NameRow[] = []
    for (const [id, v] of votes) {
      const n = v === 'maybe' ? namesById.get(id) : undefined
      if (n) rows.push(n)
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name, 'nb'))
  }, [votes, namesById])

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 px-4 py-4">
      <div>
        <h2 className="text-lg font-semibold">Kanskje</h2>
        <p className="text-xs text-muted-foreground">Navn du ikke har bestemt deg for. Bare du ser denne listen.</p>
      </div>
      {maybes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
          Ingen navn i Kanskje-listen.
        </div>
      ) : (
        <ul className="space-y-2">
          {maybes.map((n) => (
            <li key={n.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
              <button type="button" onClick={() => setDetail(n)} className="min-w-0 flex-1 text-left rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Vis detaljer for ${n.name}`}>
                <GenderTag gender={n.gender} />
                <p className="truncate text-2xl font-semibold tracking-tight">{n.name}</p>
                <p className="text-xs text-muted-foreground">{rankLine(n, latestYear) ?? `Ikke registrert i ${latestYear}`}</p>
              </button>
              <Button variant="outline" size="icon" aria-label={`Nei til ${n.name}`} onClick={() => void vote(n.id, 'no')} className="border-destructive/50 text-destructive hover:bg-destructive/10"><X /></Button>
              <Button variant="outline" size="icon" aria-label={`Ja til ${n.name}`} onClick={() => void vote(n.id, 'yes')} className="border-success/60 text-success hover:bg-success/10"><Check /></Button>
            </li>
          ))}
        </ul>
      )}
      <NameDetailDialog name={detail} latestYear={latestYear} onClose={() => setDetail(null)} />
    </div>
  )
}
