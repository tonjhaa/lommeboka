import { useState } from 'react'
import {
  Wallet, TrendingUp, Calculator, Home, PiggyBank,
  BarChart3, ShieldCheck, Zap,
} from 'lucide-react'
import { useAuthStore } from '@/store/useAuthStore'
import { LegalModal } from '@/pages/LegalPage'

// ------------------------------------------------------------
// Feature highlights
// ------------------------------------------------------------

const FEATURES = [
  {
    icon: Wallet,
    title: 'Budsjett',
    desc: 'Månedsoversikt basert på lønnsslipper — automatisk beregning av bruttolønn, trekk og disponibelt.',
  },
  {
    icon: TrendingUp,
    title: 'Sparing & fond',
    desc: 'BSU, sparekonto, fond og krypto samlet. Live kurspriser og renteprognoser for hele året.',
  },
  {
    icon: Calculator,
    title: 'Skattekalkulator',
    desc: '2026-regler: trinnskatt, trygdeavgift, BSU-fradrag, renteutgifter og pensjonspremie. Auto-fylt fra dine data.',
  },
  {
    icon: Home,
    title: 'Boligkalkulator',
    desc: 'Sammenlign kjøpsscenarier, beregn lånekostnad og se amortiseringsplan.',
  },
  {
    icon: PiggyBank,
    title: 'Feriepenger & ATF',
    desc: 'Prognose for juni og desember basert på faktiske slipper og gjeldende satser.',
  },
  {
    icon: ShieldCheck,
    title: 'Privat og sikker',
    desc: 'All data lagres kryptert i din private konto. Ingen tall i kildekoden, ingen deling med tredjeparter.',
  },
]

// ------------------------------------------------------------
// Auth form
// ------------------------------------------------------------

function AuthForm() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const { signIn, signUp, loading } = useAuthStore()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setMessage(null)

    if (mode === 'login') {
      const err = await signIn(email, password)
      if (err) setError(err)
    } else {
      const err = await signUp(email, password)
      if (err) {
        setError(err)
      } else {
        setMessage('Sjekk e-posten din for å bekrefte kontoen.')
      }
    }
  }

  return (
    <div className="w-full max-w-sm">
      <h2 className="text-xl font-semibold mb-1">
        {mode === 'login' ? 'Logg inn' : 'Opprett konto'}
      </h2>
      <p className="text-sm text-muted-foreground mb-6">
        {mode === 'login'
          ? 'Velkommen tilbake'
          : 'Kom i gang på under ett minutt'}
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="email">E-post</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="deg@eksempel.no"
            className="h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="password">Passord</label>
          <input
            id="password"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {message && <p className="text-sm text-green-500">{message}</p>}

        <button
          type="submit"
          disabled={loading}
          className="h-9 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Venter…' : mode === 'login' ? 'Logg inn' : 'Opprett konto'}
        </button>
      </form>

      <p className="text-sm text-muted-foreground mt-4 text-center">
        {mode === 'login' ? 'Har du ikke konto?' : 'Har du allerede konto?'}{' '}
        <button
          className="underline hover:text-foreground transition-colors"
          onClick={() => {
            setMode(mode === 'login' ? 'signup' : 'login')
            setError(null)
            setMessage(null)
          }}
        >
          {mode === 'login' ? 'Opprett konto' : 'Logg inn'}
        </button>
      </p>

      <div className="mt-6 pt-5 border-t border-border">
        <button
          type="button"
          className="w-full h-9 rounded-md border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
          onClick={() => {
            setEmail('demo@lommeboka.com')
            setPassword('Demo1234!')
            setMode('login')
            setError(null)
            setMessage(null)
          }}
        >
          Prøv med demokonto
        </button>
        <p className="text-xs text-muted-foreground text-center mt-2">
          Ferdig utfylt — klikk «Logg inn» for å utforske appen
        </p>
      </div>
    </div>
  )
}

// ------------------------------------------------------------
// Landing page
// ------------------------------------------------------------

export function LoginPage() {
  const [legal, setLegal] = useState<'privacy' | 'terms' | null>(null)

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-background">

      {/* ── Venstre: pitch ── */}
      <div className="flex-1 flex flex-col justify-between p-8 lg:p-12 bg-card border-b lg:border-b-0 lg:border-r border-border">

        {/* Logo */}
        <div className="flex items-center gap-2 mb-8 lg:mb-0">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
            <BarChart3 className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-semibold text-lg">Lommeboka</span>
        </div>

        {/* Hero */}
        <div className="py-8 lg:py-0">
          <div className="flex items-center gap-2 mb-4">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
              <Zap className="h-3 w-3" />
              Personlig økonomiverktøy
            </span>
          </div>

          <h1 className="text-3xl lg:text-4xl font-bold tracking-tight mb-4 leading-tight">
            Full kontroll over<br />
            <span className="text-primary">din økonomi</span>
          </h1>
          <p className="text-muted-foreground text-base lg:text-lg max-w-md leading-relaxed">
            Importer lønnsslipper, følg sparing og fond, beregn skatten din og
            planlegg boligkjøp — alt samlet, automatisert og synkronisert.
          </p>

          {/* Features grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-8 max-w-xl">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex gap-3">
                <div className="shrink-0 h-8 w-8 rounded-md bg-muted flex items-center justify-center mt-0.5">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">{title}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <p className="text-xs text-muted-foreground mt-8 lg:mt-0">
          Data lagres kryptert og privat — ingen tall i kildekoden.{' '}
          <button onClick={() => setLegal('privacy')} className="underline hover:text-foreground transition-colors">Personvern</button>
          {' · '}
          <button onClick={() => setLegal('terms')} className="underline hover:text-foreground transition-colors">Vilkår</button>
        </p>
      </div>

      {/* ── Høyre: innlogging ── */}
      <div className="flex items-center justify-center p-8 lg:p-12 lg:w-[420px] shrink-0">
        <AuthForm />
      </div>

      {legal && <LegalModal initialTab={legal} onClose={() => setLegal(null)} />}
    </div>
  )
}
