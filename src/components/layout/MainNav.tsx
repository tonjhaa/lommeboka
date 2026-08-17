import { useState, useRef, useEffect } from 'react'
import {
  LayoutDashboard, Receipt, Wallet, PiggyBank, TrendingUp, Heart,
  LogOut, User, Settings,
} from 'lucide-react'
import { useAppStore, type AppView, type EconomySubPage } from '@/store/useAppStore'
import { useAuthStore } from '@/store/useAuthStore'
import { useEconomyStore } from '@/application/useEconomyStore'
import type { EconomyTab } from '@/types/economy'
import { cn } from '@/lib/utils'

// ------------------------------------------------------------
// Gruppert navigasjon: rad 1 = livsområder, rad 2 = sider i området.
// Ett sted eier hele navigasjonen (både toppnivå-views og økonomisider),
// så EconomyPage ikke lenger har sin egen fanerad.
// ------------------------------------------------------------

type NavTarget =
  | { kind: 'economy'; page: EconomySubPage }
  | { kind: 'view'; view: AppView }

interface NavItem {
  label: string
  target: NavTarget
  /** Skjules hvis modulen ikke er aktivert i enabledTabs (Innstillinger → Moduler) */
  requiresTab?: EconomyTab
}

interface NavGroup {
  id: string
  label: string
  Icon: React.FC<{ className?: string }>
  items: NavItem[]
}

const GROUPS: NavGroup[] = [
  {
    id: 'oversikt', label: 'Oversikt', Icon: LayoutDashboard,
    items: [
      { label: 'Dashbord', target: { kind: 'economy', page: 'dashboard' } },
    ],
  },
  {
    id: 'inntekt', label: 'Inntekt', Icon: Receipt,
    items: [
      { label: 'Lønn', target: { kind: 'economy', page: 'salary' } },
      { label: 'ATF', target: { kind: 'economy', page: 'atf' }, requiresTab: 'atf' },
      { label: 'Feriepenger', target: { kind: 'economy', page: 'feriepenger' }, requiresTab: 'feriepenger' },
      { label: 'Skatteoppgjør', target: { kind: 'economy', page: 'tax' }, requiresTab: 'tax' },
      { label: 'Fravær', target: { kind: 'economy', page: 'absence' }, requiresTab: 'absence' },
    ],
  },
  {
    id: 'utgifter', label: 'Utgifter', Icon: Wallet,
    items: [
      { label: 'Budsjett', target: { kind: 'economy', page: 'budget' } },
      { label: 'Abo & forsikring', target: { kind: 'economy', page: 'subscriptions' }, requiresTab: 'subscriptions' },
    ],
  },
  {
    id: 'sparing', label: 'Sparing & gjeld', Icon: PiggyBank,
    items: [
      { label: 'Sparing', target: { kind: 'economy', page: 'savings' }, requiresTab: 'savings' },
      { label: 'Gjeld', target: { kind: 'economy', page: 'debt' }, requiresTab: 'debt' },
    ],
  },
  {
    id: 'fremtid', label: 'Fremtid', Icon: TrendingUp,
    items: [
      { label: 'Veikart', target: { kind: 'economy', page: 'veikart' }, requiresTab: 'veikart' },
      { label: 'Simulator', target: { kind: 'economy', page: 'scenario' }, requiresTab: 'scenario' },
      { label: 'Pensjon', target: { kind: 'economy', page: 'pension' }, requiresTab: 'pension' },
      { label: 'Boligkalkulator', target: { kind: 'view', view: 'calculator' } },
      { label: 'Boligsøk', target: { kind: 'view', view: 'boligsok' } },
      { label: 'Bilkalkulator', target: { kind: 'view', view: 'billan' } },
      { label: 'Skattekalkulator', target: { kind: 'view', view: 'skattekalkulator' } },
    ],
  },
  {
    id: 'livet', label: 'Livet', Icon: Heart,
    items: [
      { label: 'Ferie', target: { kind: 'economy', page: 'vacation' }, requiresTab: 'vacation' },
      { label: 'Gaver', target: { kind: 'economy', page: 'gaver' }, requiresTab: 'gaver' },
      { label: 'Prosjekt', target: { kind: 'view', view: 'ivf' }, requiresTab: 'ivf' },
      { label: 'Partner', target: { kind: 'view', view: 'partner' }, requiresTab: 'partner' },
    ],
  },
]

function isItemActive(item: NavItem, currentView: AppView, currentPage: EconomySubPage): boolean {
  if (item.target.kind === 'view') return currentView === item.target.view
  if (currentView !== 'economy') return false
  // 'fond' er et legacy-alias som rendres av Sparing-siden
  if (item.target.page === 'savings') return currentPage === 'savings' || currentPage === 'fond'
  return currentPage === item.target.page
}

export function MainNav() {
  const currentView = useAppStore((s) => s.currentView)
  const currentPage = useAppStore((s) => s.currentEconomyPage)
  const setCurrentView = useAppStore((s) => s.setCurrentView)
  const setCurrentEconomyPage = useAppStore((s) => s.setCurrentEconomyPage)
  const userPreferences = useEconomyStore((s) => s.userPreferences)
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

  const enabled = new Set(userPreferences?.enabledTabs ?? [])
  const visibleItems = (group: NavGroup) =>
    group.items.filter((i) => !i.requiresTab || enabled.has(i.requiresTab))

  const visibleGroups = GROUPS
    .map((g) => ({ group: g, items: visibleItems(g) }))
    .filter(({ items }) => items.length > 0)

  const activeGroup = visibleGroups.find(({ items }) =>
    items.some((i) => isItemActive(i, currentView, currentPage))
  )

  function navigate(target: NavTarget) {
    if (target.kind === 'view') {
      setCurrentView(target.view)
    } else {
      setCurrentView('economy')
      setCurrentEconomyPage(target.page)
    }
  }

  const initials = user?.email
    ? user.email.slice(0, 2).toUpperCase()
    : '?'

  return (
    <div className="shrink-0 border-b border-border bg-card">
      {/* Rad 1: grupper */}
      <nav className="flex items-center px-4 overflow-x-auto">
        {visibleGroups.map(({ group, items }) => {
          const isActive = activeGroup?.group.id === group.id
          const { Icon } = group
          return (
            <button
              key={group.id}
              onClick={() => navigate(items[0].target)}
              className={cn(
                'flex items-center gap-2 px-3.5 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0',
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{group.label}</span>
            </button>
          )
        })}

        {/* Spacer */}
        <div className="flex-1" />

        {/* User menu */}
        <div className="relative shrink-0" ref={menuRef}>
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

      {/* Rad 2: sider i aktiv gruppe (skjules når gruppen bare har én side) */}
      {activeGroup && activeGroup.items.length > 1 && (
        <nav className="flex items-center gap-1 border-t border-border/50 bg-card px-4 overflow-x-auto">
          {activeGroup.items.map((item) => {
            const isActive = isItemActive(item, currentView, currentPage)
            return (
              <button
                key={item.label}
                onClick={() => navigate(item.target)}
                className={cn(
                  'px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap shrink-0',
                  isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                )}
              >
                {item.label}
              </button>
            )
          })}
        </nav>
      )}
    </div>
  )
}
