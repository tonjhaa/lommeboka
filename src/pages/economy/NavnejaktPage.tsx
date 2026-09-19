import { useEffect, useState } from 'react'
import { BarChart3, Heart, HelpCircle, Layers, Shuffle, Trophy, Users } from 'lucide-react'
import { useAuthStore } from '@/store/useAuthStore'
import { usePartnershipStore } from '@/store/usePartnershipStore'
import { selectUnseenMatchCount, useNavnejaktStore } from '@/store/useNavnejaktStore'
import { useEconomyStore } from '@/application/useEconomyStore'
import { cn } from '@/lib/utils'
import { CombinationsTab } from '@/components/navnejakt/CombinationsTab'
import { FinalTab } from '@/components/navnejakt/FinalTab'
import { MatchesTab } from '@/components/navnejakt/MatchesTab'
import { MatchOverlay } from '@/components/navnejakt/MatchOverlay'
import { MaybeTab } from '@/components/navnejakt/MaybeTab'
import { StatsTab } from '@/components/navnejakt/StatsTab'
import { SwipeTab } from '@/components/navnejakt/SwipeTab'

type NavnejaktTab = 'swipe' | 'matcher' | 'kanskje' | 'kombinasjoner' | 'finalen' | 'statistikk'

export function NavnejaktPage() {
  const [tab, setTab] = useState<NavnejaktTab>('swipe')
  const user = useAuthStore((s) => s.user)
  const status = usePartnershipStore((s) => s.status)
  const partnership = usePartnershipStore((s) => s.partnership)
  const partnerLabel = useEconomyStore((s) => s.partnerVeikart?.partnerName?.trim()) || 'Partner'

  const userId = user?.id ?? null
  const partnershipId = status === 'connected' ? partnership?.id ?? null : null
  const connected = partnershipId !== null

  const loadStatus = useNavnejaktStore((s) => s.status)
  const error = useNavnejaktStore((s) => s.error)
  const matchCount = useNavnejaktStore((s) => s.matches.length)
  const unseenCount = useNavnejaktStore(selectUnseenMatchCount)
  const maybeCount = useNavnejaktStore((s) => { let n = 0; for (const v of s.votes.values()) if (v === 'maybe') n++; return n })
  const celebrate = useNavnejaktStore((s) => s.celebrate)
  const dismissCelebrate = useNavnejaktStore((s) => s.dismissCelebrate)
  const clearError = useNavnejaktStore((s) => s.clearError)

  useEffect(() => {
    if (userId) void useNavnejaktStore.getState().initialize(userId, partnershipId)
  }, [userId, partnershipId])

  // Ikke la en tidligere brukers stemmer henge igjen i minnet ved utlogging
  useEffect(() => () => { if (!useAuthStore.getState().user) useNavnejaktStore.getState().reset() }, [])

  const tabs: Array<{ id: NavnejaktTab; label: string; Icon: React.FC<{ className?: string }>; count?: number }> = [
    { id: 'swipe', label: 'Swipe', Icon: Layers },
    { id: 'matcher', label: 'Matcher', Icon: Heart, count: matchCount },
    { id: 'kanskje', label: 'Kanskje', Icon: HelpCircle, count: maybeCount },
    { id: 'kombinasjoner', label: 'Kombinasjoner', Icon: Shuffle },
    { id: 'finalen', label: 'Finalen', Icon: Trophy },
    { id: 'statistikk', label: 'Statistikk', Icon: BarChart3 },
  ]

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <nav className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-border bg-card/50 px-3" aria-label="Navnejakten">
        {tabs.map(({ id, label, Icon, count }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            aria-current={tab === id ? 'page' : undefined}
            className={cn(
              'flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-xs font-medium transition-colors',
              tab === id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{label}</span>
            {count !== undefined && count > 0 && (
              <span className={cn('rounded-full px-1.5 text-[10px] tabular-nums', id === 'matcher' && unseenCount > 0 ? 'bg-primary text-primary-foreground' : 'bg-muted')}>
                {id === 'matcher' && unseenCount > 0 ? `${unseenCount} ny${unseenCount === 1 ? '' : 'e'}` : count}
              </span>
            )}
          </button>
        ))}
        {!connected && (
          <span className="ml-auto hidden shrink-0 items-center gap-1 pl-3 text-[11px] text-muted-foreground md:flex"><Users className="h-3 w-3" /> Ikke koblet til partner</span>
        )}
      </nav>

      {error && (
        <div role="alert" className="mx-4 mt-3 flex shrink-0 items-start justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <span>{error}</span>
          <button onClick={clearError} className="text-xs underline">Lukk</button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {loadStatus === 'loading' || (loadStatus === 'idle' && userId) ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">Laster navn…</p>
        ) : loadStatus === 'error' ? (
          <p className="px-4 py-10 text-center text-sm text-destructive">Kunne ikke laste Navnejakten. Prøv å laste siden på nytt.</p>
        ) : (
          <>
            {tab === 'swipe' && <div className="h-full min-h-[30rem]"><SwipeTab /></div>}
            {tab === 'matcher' && <MatchesTab connected={connected} partnerName={partnerLabel} />}
            {tab === 'kombinasjoner' && <CombinationsTab />}
            {tab === 'kanskje' && <MaybeTab />}
            {tab === 'finalen' && userId && <FinalTab connected={connected} partnershipId={partnershipId} userId={userId} partnerName={partnerLabel} />}
            {tab === 'statistikk' && <StatsTab connected={connected} partnerName={partnerLabel} />}
          </>
        )}
      </div>

      <MatchOverlay
        name={celebrate}
        onSeeMatches={() => { dismissCelebrate(); setTab('matcher') }}
        onContinue={dismissCelebrate}
      />
    </div>
  )
}
