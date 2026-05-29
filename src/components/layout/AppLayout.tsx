import { useEffect, useState } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { Header } from './Header'
import { Sidebar } from './Sidebar'
import { cn } from '@/lib/utils'
import { LegalModal } from '@/pages/LegalPage'

interface AppLayoutProps {
  children: React.ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  const [legal, setLegal] = useState<'privacy' | 'terms' | null>(null)
  const theme = useAppStore((s) => s.theme)
  const sidebarOpen = useAppStore((s) => s.sidebarOpen)
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen)
  const currentView = useAppStore((s) => s.currentView)
  const showSidebar = currentView === 'calculator'

  useEffect(() => {
    const root = document.documentElement
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    if (theme === 'system') {
      root.classList.toggle('light', !prefersDark)
    } else {
      root.classList.toggle('light', theme === 'light')
    }
  }, [theme])

  // Sett sidebar åpen på store skjermer som standard
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    if (mq.matches) setSidebarOpen(true)
    const handler = (e: MediaQueryListEvent) => setSidebarOpen(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [setSidebarOpen])

  return (
    <div className="flex flex-col h-dvh overflow-hidden bg-background text-foreground">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar-overlay for mobil */}
        {showSidebar && sidebarOpen && (
          <div
            className="fixed inset-0 z-20 bg-black/50 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar – kun synlig i Boligkalkulator-visningen */}
        {showSidebar && (
          <div
            className={cn(
              'fixed lg:relative z-30 lg:z-auto h-full transition-transform duration-200',
              sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
              !sidebarOpen && 'lg:hidden'
            )}
          >
            <Sidebar />
          </div>
        )}

        {/* Hovedinnhold */}
        <main className="flex-1 overflow-hidden">
          {children}
        </main>
      </div>

      <footer className="shrink-0 flex justify-end gap-3 px-4 py-1 border-t border-border/40">
        <button onClick={() => setLegal('privacy')} className="text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors">
          Personvern
        </button>
        <button onClick={() => setLegal('terms')} className="text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors">
          Vilkår
        </button>
      </footer>

      {legal && <LegalModal initialTab={legal} onClose={() => setLegal(null)} />}
    </div>
  )
}
