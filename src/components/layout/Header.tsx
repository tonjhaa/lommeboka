import { Moon, Sun, Menu } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { Button } from '@/components/ui/button'

export function Header() {
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)
  const sidebarOpen = useAppStore((s) => s.sidebarOpen)
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen)
  const setCurrentView = useAppStore((s) => s.setCurrentView)
  const setCurrentEconomyPage = useAppStore((s) => s.setCurrentEconomyPage)

  function toggleTheme() {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  function goHome() {
    setCurrentView('economy')
    setCurrentEconomyPage('dashboard')
  }

  return (
    <header className="flex h-14 items-center gap-3 border-b border-border bg-card px-4 shrink-0">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        <Menu className="h-5 w-5" />
      </Button>

      <button
        onClick={goHome}
        className="flex items-center gap-2.5 flex-1 hover:opacity-80 transition-opacity text-left"
      >
        <img src={`${import.meta.env.BASE_URL}lb-logo.svg`} alt="LB" className="h-8 w-8" />
        <div>
          <span className="font-semibold text-foreground leading-tight block">Lommeboka</span>
          <p className="text-xs text-muted-foreground italic leading-none">Oversikt er frihet</p>
        </div>
      </button>

      <Button variant="ghost" size="icon" onClick={toggleTheme}>
        {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </Button>
    </header>
  )
}
