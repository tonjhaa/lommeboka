import { useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Chip, GenderTag } from './shared'
import { useNavnejaktStore } from '@/store/useNavnejaktStore'
import { buildCombos, FLAG_LABEL } from '@/lib/names/combinations'
import type { NameRow } from '@/lib/names/types'

export function CombinationsTab() {
  const matches = useNavnejaktStore((s) => s.matches)
  const namesById = useNavnejaktStore((s) => s.namesById)
  const surname = useNavnejaktStore((s) => s.surname)
  const setSurname = useNavnejaktStore((s) => s.setSurname)
  const [chosenId, setChosenId] = useState<string | null>(null)

  const pool = useMemo(() => {
    const rows: NameRow[] = []
    for (const m of matches) {
      const n = namesById.get(m.nameId)
      if (n) rows.push(n)
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name, 'nb'))
  }, [matches, namesById])

  const first = pool.find((n) => n.id === chosenId) ?? pool[0]
  const combos = useMemo(() => (first ? buildCombos(first, pool, surname) : []), [first, pool, surname])

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 px-4 py-4">
      <div>
        <h2 className="text-lg font-semibold">Kombinasjoner</h2>
        <p className="text-xs text-muted-foreground">Sett sammen matchene til fornavn og mellomnavn, og se hvordan de ser ut med etternavnet deres.</p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="surname" className="text-xs font-medium text-muted-foreground">Etternavn</label>
        <Input id="surname" value={surname} onChange={(e) => setSurname(e.target.value)} placeholder="Etternavn" autoComplete="off" className="max-w-xs" />
        <p className="text-[11px] text-muted-foreground/80">Lagres bare i denne nettleseren — ikke i databasen og ikke hos partneren din.</p>
      </div>

      {pool.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
          Ingen matcher ennå. Kombinasjonene bygges av navnene dere begge har sagt ja til.
        </div>
      ) : (
        <>
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Fornavn</h3>
            <div className="flex flex-wrap gap-2">
              {pool.map((n) => (
                <Chip key={n.id} active={first?.id === n.id} onClick={() => setChosenId(n.id)}>{n.name}</Chip>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Mellomnavn</h3>
            {pool.length < 2 && <p className="text-xs text-muted-foreground">Dere trenger minst to matcher for å se mellomnavn-kombinasjoner.</p>}
            <ul className="space-y-2">
              {combos.map((c) => (
                <li key={c.middle?.id ?? 'ingen'} className="rounded-2xl border border-border bg-card px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="min-w-0 break-words text-xl font-semibold tracking-tight">{c.text}</p>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{c.initials}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>{c.middle ? 'Med mellomnavn' : 'Uten mellomnavn'}</span>
                    <span>{c.letters} bokstaver</span>
                    {c.middle && <GenderTag gender={c.middle.gender} className="tracking-[0.12em]" />}
                    {c.flags.map((f) => <span key={f} className="rounded-full border border-border px-2 py-0.5">{FLAG_LABEL[f]}</span>)}
                  </div>
                </li>
              ))}
            </ul>
            <p className="text-[11px] leading-relaxed text-muted-foreground/80">
              Merkene er rent mekaniske: samme forbokstav på for- og mellomnavn, og samme bokstav der to navn møtes (f.eks. «Anna Astrid»). De sier ikke noe om hvordan navnene låter.
            </p>
          </section>
        </>
      )}
    </div>
  )
}
