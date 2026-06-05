import { useState, useRef, useEffect } from 'react'
import { Calculator, Wallet, BadgePercent, LogOut, User, Users, Settings, HeartPulse } from 'lucide-react'
import { useAppStore, type AppView } from '@/store/useAppStore'
import { useAuthStore } from '@/store/useAuthStore'
import { cn } from '@/lib/utils'

const NAV_ITEMS: { view: AppView; label: string; Icon: React.FC<{ className?: string }> }[] = [
  { view: 'economy',           label: 'Økonomi',          Icon: Wallet },
  { view: 'partner',           label: 'Partner',          Icon: Users },
  { view: 'ivf',               label: 'Prosjekt',         Icon: HeartPulse },
  { view: 'calculator',        label: 'Boligkalkulator',  Icon: Calculator },
  { view: 'skattekalkulator',  label: 'Skattekalkulator', Icon: BadgePercent },
]

export function MainNav() {
  const currentView = useAppStore((s) => s.currentView)
  const setCurrentView = useAppStore((s) => s.setCurrentView)
  const setCurrentEconomyPage = useAppStore((s) => s.setCurrentEconomyPage)
  const { user, signOut } = useAuthStore()

  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close on outside click or Escape
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    if (menuOpen) {
      document.addEventListener('mousedown', handleClick)
      document.addEventListener('keydown', handleKeyDown)
    }
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [menuOpen])

  const initials = user?.email
    ? user.email.slice(0, 2).toUpperCase()
    : '?'

  return (
    <nav className="flex items-center border-b border-border bg-card px-4 shrink-0">
      {NAV_ITEMS.map(({ view, label, Icon }) => (
        <button
          key={view}
          onClick={() => setCurrentView(view)}
          className={cn(
            'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors',
            currentView === view
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
          )}
        >
          <Icon className="h-4 w-4" />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}

      {/* Spacer */}
      <div className="flex-1" />

      {/* User menu */}
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="flex items-center justify-center h-7 w-7 rounded-full bg-primary/15 text-primary text-xs font-semibold hover:bg-primary/25 transition-colors"
          aria-label="Brukermeny"
        >
          {initials}
        </button>

        {menuOpen && (
          <div
            role="menu"
            aria-label="Brukermeny"
            className="absolute right-0 top-full mt-2 w-56 rounded-lg border border-border bg-card shadow-md z-50 overflow-hidden"
          >
            <div className="px-3 py-2.5 border-b border-border">
              <div className="flex items-center gap-2">
                <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              </div>
            </div>
            <button
              role="menuitem"
              onClick={() => {
                setMenuOpen(false)
                setCurrentView('economy')
                setCurrentEconomyPage('settings')
              }}
              className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-left hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
            >
              <Settings className="h-3.5 w-3.5" />
              Innstillinger
            </button>
            <div className="border-t border-border" />
            <button
              role="menuitem"
              onClick={() => { setMenuOpen(false); signOut() }}
              className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-left hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
            >
              <LogOut className="h-3.5 w-3.5" />
              Logg ut
            </button>
          </div>
        )}
      </div>
    </nav>
  )
}
