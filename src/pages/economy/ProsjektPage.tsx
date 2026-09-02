import { cn } from '@/lib/utils'
import { IVFPage } from './IVFPage'
import { PermisjonPage } from './PermisjonPage'
import { BabyShoppingPage } from './BabyShoppingPage'
import { ClothingPage } from './ClothingPage'
import { FlaskConical, Baby, ShoppingCart, Shirt } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { useEconomyStore } from '@/application/useEconomyStore'

type ProsjektTab = 'behandling' | 'permisjon' | 'utstyr' | 'klær'

const TABS: { id: ProsjektTab; label: string; Icon: React.FC<{ className?: string }> }[] = [
  { id: 'behandling', label: 'Behandling', Icon: FlaskConical },
  { id: 'permisjon', label: 'Permisjon', Icon: Baby },
  { id: 'utstyr', label: 'Utstyr', Icon: ShoppingCart },
  { id: 'klær', label: 'Klær', Icon: Shirt },
]

export function ProsjektPage() {
  const tab = useAppStore((s) => s.prosjektTab)
  const setTab = useAppStore((s) => s.setProsjektTab)
  const alertCount = useEconomyStore((s) => (s.priceAlerts ?? []).length)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Sub-nav */}
      <div className="flex items-center gap-1 border-b border-border px-4 shrink-0 bg-card/50">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap relative',
              tab === id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
            {id === 'utstyr' && alertCount > 0 && (
              <span className="absolute -top-0.5 -right-1 h-4 min-w-4 rounded-full bg-green-500 text-[9px] font-bold text-black flex items-center justify-center px-1">
                {alertCount}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-hidden">
        <div className={cn('h-full', tab !== 'behandling' && 'hidden')}><IVFPage /></div>
        <div className={cn('h-full', tab !== 'permisjon' && 'hidden')}><PermisjonPage /></div>
        <div className={cn('h-full', tab !== 'utstyr' && 'hidden')}><BabyShoppingPage /></div>
        <div className={cn('h-full', tab !== 'klær' && 'hidden')}><ClothingPage /></div>
      </div>
    </div>
  )
}
