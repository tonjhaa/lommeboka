import { useState } from 'react'
import { cn } from '@/lib/utils'
import { IVFPage } from './IVFPage'
import { PermisjonPage } from './PermisjonPage'
import { BabyShoppingPage } from './BabyShoppingPage'
import { FlaskConical, Baby, ShoppingCart } from 'lucide-react'

type ProsjektTab = 'behandling' | 'permisjon' | 'innkjøpsliste'

const TABS: { id: ProsjektTab; label: string; Icon: React.FC<{ className?: string }> }[] = [
  { id: 'behandling', label: 'Behandling', Icon: FlaskConical },
  { id: 'permisjon', label: 'Permisjon', Icon: Baby },
  { id: 'innkjøpsliste', label: 'Innkjøpsliste', Icon: ShoppingCart },
]

export function ProsjektPage() {
  const [tab, setTab] = useState<ProsjektTab>('behandling')

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Sub-nav */}
      <div className="flex items-center gap-1 border-b border-border px-4 shrink-0 bg-card/50">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap',
              tab === id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-hidden">
        {tab === 'behandling' && <IVFPage />}
        {tab === 'permisjon' && <PermisjonPage />}
        {tab === 'innkjøpsliste' && <BabyShoppingPage />}
      </div>
    </div>
  )
}
