import { useEffect, useMemo, useState } from 'react'
import { useNavnejaktStore } from '@/store/useNavnejaktStore'
import { fetchPartnerStats, type PartnerStats } from '@/lib/names/api'
import { computeOwnStats } from '@/lib/names/stats'
import { formatDate, formatPercent } from '@/lib/names/format'
import { LENGTH_LABEL, type LengthBucket } from '@/lib/names/filters'
import { SyncButton } from './shared'

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

function Person({ title, rated, yes, maybe }: { title: string; rated: number | null; yes: number | null; maybe: number | null }) {
  const f = (v: number | null) => (v === null ? '–' : v)
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <p className="text-sm font-semibold">{title}</p>
      <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
        {[['Vurdert', rated], ['Ja', yes], ['Kanskje', maybe]].map(([l, v]) => (
          <div key={l as string}><dt className="text-[11px] text-muted-foreground">{l}</dt><dd className="text-xl font-semibold tabular-nums">{f(v as number | null)}</dd></div>
        ))}
      </dl>
    </div>
  )
}

export function StatsTab({ connected, partnerName }: { connected: boolean; partnerName: string }) {
  const names = useNavnejaktStore((s) => s.names)
  const votes = useNavnejaktStore((s) => s.votes)
  const matches = useNavnejaktStore((s) => s.matches)
  const latestYear = useNavnejaktStore((s) => s.latestYear)
  const syncInfo = useNavnejaktStore((s) => s.syncInfo)
  const [partner, setPartner] = useState<PartnerStats | null>(null)

  useEffect(() => {
    if (!connected) return
    let cancelled = false
    fetchPartnerStats().then((p) => { if (!cancelled) setPartner(p) }).catch(() => { if (!cancelled) setPartner(null) })
    return () => { cancelled = true }
  }, [connected, matches.length])

  const own = useMemo(() => computeOwnStats(names, votes, matches, latestYear), [names, votes, matches, latestYear])
  const lengthTotal = own.yes || 1

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-4">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Statistikk for oss</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Person title="Du" rated={own.rated} yes={own.yes} maybe={own.maybe} />
          <Person title={partnerName} rated={partner?.rated ?? null} yes={partner?.yes ?? null} maybe={partner?.maybe ?? null} />
        </div>
        <p className="text-[11px] text-muted-foreground">Av partnerens vurderinger vises bare antall — aldri hvilke navn.</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Sammen" value={`${own.matches} matcher`} />
          <Stat label="Match-rate" value={formatPercent(own.matchRate)} hint="Matcher av dine ja" />
          <Stat label="Snitt-rang på matcher" value={own.avgMatchRank === null ? '–' : `#${Math.round(own.avgMatchRank)}`} hint={`Blant navn med tall for ${latestYear}`} />
        </div>
      </section>

      {own.yes > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Dine ja-navn</h3>
          <div className="rounded-xl border border-border bg-card px-4 py-3 space-y-2">
            {(Object.keys(LENGTH_LABEL) as LengthBucket[]).map((b) => (
              <div key={b} className="flex items-center gap-3 text-xs">
                <span className="w-36 shrink-0 text-muted-foreground">{LENGTH_LABEL[b]}</span>
                <div className="h-2 flex-1 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${(own.yesLength[b] / lengthTotal) * 100}%` }} /></div>
                <span className="w-8 text-right tabular-nums">{own.yesLength[b]}</span>
              </div>
            ))}
          </div>
          {own.yesTop100Share !== null && own.ratedTop100Share !== null && (
            <p className="text-xs text-muted-foreground">
              {formatPercent(own.yesTop100Share)} av navnene du sier ja til er topp 100 i {latestYear}, mot {formatPercent(own.ratedTop100Share)} av alle du har vurdert.
            </p>
          )}
        </section>
      )}

      {own.matches > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Matchene</h3>
          <p className="text-xs text-muted-foreground">{own.matchGender.girl} jentenavn og {own.matchGender.boy} guttenavn.</p>
        </section>
      )}

      <section className="space-y-2 border-t border-border pt-4">
        <h3 className="text-sm font-semibold">Datagrunnlag</h3>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Statistisk sentralbyrå, tabell 10467 «Fødte, etter jente- eller guttenavn». Tall under 4 oppgis ikke, og navnelisten omfatter fornavn brukt av minst 200 personer. Fra 2021 teller navngivningsår. Rang og trend er beregnet av Lommeboka fra SSBs tall.
        </p>
        <p className="text-xs text-muted-foreground">
          {syncInfo ? `Sist hentet ${formatDate(syncInfo.syncedAt)} · siste år ${syncInfo.latestYear ?? '–'} · ${syncInfo.namesCount ?? names.length} navn` : 'Ikke hentet ennå.'}
        </p>
        <SyncButton label="Oppdater fra SSB" />
      </section>
    </div>
  )
}
