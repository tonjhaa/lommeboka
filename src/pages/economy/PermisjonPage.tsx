import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  AlertTriangle, CheckCircle, GraduationCap, ChevronLeft, ChevronRight, Check, Info,
  Plus, Minus, X, Users, Clock, Sparkles, Calendar,
} from 'lucide-react'
import { usePermisjonStore } from '@/application/usePermisjonStore'
import {
  beregnTilgjengeligeUker, beregnOppsummering, beregnBarnehageStart, genererPlanFordelt,
} from '@/domain/economy/foreldrepengerRules'
import { PermisjonTimeline, PermisjonKalender } from '@/components/economy/PermisjonTimeline'
import { PermisjonAIChat } from '@/components/economy/PermisjonAIChat'

type Tab = 'oppsett' | 'tidslinje' | 'ai'
type PlanView = 'kalender' | 'tidslinje'

// Kalendervelger for gjentakende årsdag (MM-DD). Bruker native date-input med inneværende år.
function MonthDayPicker({ value, onChange, label }: { value: string; onChange: (v: string) => void; label?: string }) {
  const year = new Date().getFullYear()
  const fullDate = value ? `${year}-${value}` : ''

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value  // "YYYY-MM-DD"
    if (val) onChange(val.slice(5))  // behold bare "MM-DD"
  }

  const displayDate = fullDate
    ? new Date(fullDate).toLocaleDateString('no-NO', { day: 'numeric', month: 'long' })
    : 'Velg dato'

  return (
    <label className="relative block cursor-pointer">
      <div className="h-11 flex items-center rounded-xl border border-border bg-background px-3 text-sm text-foreground hover:border-primary transition-colors">
        <span className="flex-1">{displayDate}</span>
        <svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
      </div>
      <input
        type="date"
        aria-label={label}
        value={fullDate}
        onChange={handleChange}
        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
      />
    </label>
  )
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('no-NO', { day: 'numeric', month: 'long', year: 'numeric' })
}

/* ---------- Gjenbrukbare UI-byggeklosser ---------- */
function InfoBox({ children, variant = 'info' }: { children: React.ReactNode; variant?: 'info' | 'warn' }) {
  const styles = variant === 'warn'
    ? 'bg-yellow-500/10 border-yellow-500/30 border-l-yellow-500 text-yellow-100/90'
    : 'bg-primary/10 border-primary/25 border-l-primary text-foreground/85'
  return (
    <div className={`flex gap-3 rounded-xl border border-l-[3px] px-4 py-3 text-[13px] leading-relaxed ${styles}`}>
      <Info className={`h-4 w-4 shrink-0 mt-0.5 ${variant === 'warn' ? 'text-yellow-400' : 'text-primary'}`} />
      <span>{children}</span>
    </div>
  )
}

function ToggleRow({
  icon: IconCmp, title, desc, on, onToggle,
}: { icon: React.ElementType; title: string; desc?: string; on: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle}
      className={`flex w-full items-center gap-3.5 rounded-xl border px-4 py-3 text-left transition-colors ${
        on ? 'border-primary/60 bg-primary/10' : 'border-border bg-muted/10 hover:border-border'
      }`}>
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${on ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
        <IconCmp className="h-[18px] w-[18px]" />
      </span>
      <span className="flex-1">
        <span className="block text-sm font-medium">{title}</span>
        {desc && <span className="mt-0.5 block text-[12.5px] text-muted-foreground leading-snug">{desc}</span>}
      </span>
      <span className={`relative h-6 w-[42px] shrink-0 rounded-full border transition-colors ${on ? 'border-primary bg-primary' : 'border-border bg-muted'}`}>
        <span className={`absolute top-0.5 h-[18px] w-[18px] rounded-full bg-foreground shadow transition-transform ${on ? 'translate-x-[20px]' : 'translate-x-0.5'}`} />
      </span>
    </button>
  )
}

const QUOTAS = [
  { key: 'mødrekvote' as const,   name: 'Mødrekvote',    bar: 'bg-blue-500',  dot: 'bg-blue-500',  note: 'forbeholdt mor' },
  { key: 'fellesperiode' as const, name: 'Fellesperiode', bar: 'bg-teal-500',  dot: 'bg-teal-500',  note: 'fritt fordelt' },
  { key: 'fedrekvote' as const,   name: 'Medmorkvote',   bar: 'bg-green-600', dot: 'bg-green-600', note: 'forbeholdt partner' },
]

export function PermisjonPage() {
  const { input, perioder, setInput, genererPlan } = usePermisjonStore()
  const [tab, setTab] = useState<Tab>('oppsett')
  const [planView, setPlanView] = useState<PlanView>('kalender')
  const [step, setStep] = useState(0)
  const [minFerieFra, setMinFerieFra] = useState('')
  const [minFerieTil, setMinFerieTil] = useState('')

  const tilgjengelig = input.terminDato ? beregnTilgjengeligeUker(input) : null
  const oppsummering = input.terminDato && perioder.length > 0 ? beregnOppsummering(input, perioder) : null
  const barnehageStart = input.terminDato ? beregnBarnehageStart(input.terminDato, input.fodselsDato) : null

  function leggTilMinFerie() {
    if (!minFerieFra || !minFerieTil) return
    setInput({ mineFerieblokker: [...input.mineFerieblokker, { fra: minFerieFra, til: minFerieTil, label: 'Ferie' }] })
    setMinFerieFra(''); setMinFerieTil('')
  }
  function fjernMinFerie(i: number) {
    setInput({ mineFerieblokker: input.mineFerieblokker.filter((_, idx) => idx !== i) })
  }

  const STEG = [
    { key: 'grav', label: 'Graviditet', q: 'Fortell om graviditeten', lead: 'Termindato og dekningsgrad avgjør hvor mange uker dere har til rådighet.' },
    { key: 'partner', label: 'Partner', q: 'Har partner bunden sommerferie?', lead: 'Lærere har 5 uker tvungen sommerferie. Medmorkvoten bør legges utenom — ellers brukes uker partner er hjemme uansett.' },
    { key: 'ferie', label: 'Min ferie', q: 'Når har du ferie?', lead: 'Ferie kan forskyve permisjonen og tette gapet før barnehagestart.' },
    { key: 'fordeling', label: 'Fordeling', q: 'Hvordan fordele fellesperioden?', lead: 'Bestem hvor mange uker av fellesperioden hver av dere tar.' },
    { key: 'gen', label: 'Generer', q: 'Klar til å lage planen', lead: 'Vi setter opp et forslag basert på reglene og valgene dine.' },
  ]
  const kanGåVidere = !!input.terminDato
  const nådd = (i: number) => !!input.terminDato || i === 0

  const TABS: { key: Tab; name: string; sub: string; icon?: React.ElementType }[] = [
    { key: 'oppsett',   name: 'Oppsett',     sub: 'Termin, partner & ferie' },
    { key: 'tidslinje', name: 'Tidslinje',   sub: 'Hele permisjonen visuelt' },
    { key: 'ai',        name: 'AI-rådgiver', sub: 'Spør om regelverket', icon: Sparkles },
  ]

  // Fellesperiode-fordeling
  const fellesUker = tilgjengelig ? Math.round(tilgjengelig.fellesperiode) : 0
  const tilMor = input.fellesTilMor == null ? Math.round(fellesUker / 2) : Math.max(0, Math.min(fellesUker, input.fellesTilMor))
  const tilPartner = fellesUker - tilMor
  const setFordeling = (v: number) => setInput({ fellesTilMor: Math.max(0, Math.min(fellesUker, v)) })
  const forhåndsplan = tilgjengelig ? genererPlanFordelt({ ...input, fellesTilMor: tilMor }) : []
  const morBlokk = forhåndsplan.filter((p) => p.owner === 'meg')
  const parBlokk = forhåndsplan.filter((p) => p.owner === 'partner')
  const morFra = morBlokk.map((p) => p.fra).sort()[0]
  const morTil = morBlokk.map((p) => p.til).sort().at(-1)
  const parFra = parBlokk.map((p) => p.fra).sort()[0]
  const parTil = parBlokk.map((p) => p.til).sort().at(-1)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Tab-navigasjon — underline-stil med undertittel */}
      <div className="flex gap-1 px-5 pt-4 border-b border-border shrink-0">
        {TABS.map((t) => {
          const active = tab === t.key
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`relative flex flex-col gap-0.5 rounded-t-lg px-4 pb-3 pt-1 text-left transition-colors ${
                active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}>
              <span className="flex items-center gap-1.5 text-sm font-semibold">{t.icon && <t.icon className="h-3.5 w-3.5" />}{t.name}</span>
              <span className="text-[11.5px] opacity-80">{t.sub}</span>
              {active && <span className="absolute inset-x-2.5 -bottom-px h-0.5 rounded bg-primary" />}
            </button>
          )
        })}
      </div>

      <div className="flex-1 overflow-y-auto p-6">

        {/* ============ OPPSETT — stegbasert wizard ============ */}
        {tab === 'oppsett' && (
          <div className="mx-auto max-w-2xl">
            <div className="mb-7 flex items-center">
              {STEG.map((s, i) => (
                <div key={s.key} className="flex items-center" style={{ flex: i < STEG.length - 1 ? '1' : '0 0 auto' }}>
                  <button type="button" onClick={() => nådd(i) && setStep(i)} disabled={!nådd(i)}
                    className={`flex items-center gap-2.5 transition-colors ${step === i ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'} disabled:opacity-40 disabled:hover:text-muted-foreground`}>
                    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-semibold transition-all ${
                      step === i ? 'bg-primary text-primary-foreground ring-4 ring-primary/20'
                      : nådd(i) && i < step ? 'bg-primary/20 text-primary border border-primary/50'
                      : 'bg-muted text-muted-foreground'
                    }`}>
                      {nådd(i) && i < step ? <Check className="h-4 w-4" /> : i + 1}
                    </span>
                    <span className="hidden md:block text-[13px] font-medium whitespace-nowrap">{s.label}</span>
                  </button>
                  {i < STEG.length - 1 && <span className={`mx-2.5 h-0.5 flex-1 rounded ${i < step ? 'bg-primary/50' : 'bg-border'}`} />}
                </div>
              ))}
            </div>

            <Card className="rounded-2xl">
              <CardContent className="px-7 py-7">
                <p className="text-xs font-semibold uppercase tracking-wider text-primary mb-2.5">{STEG[step].label}</p>
                <h2 className="text-[23px] font-bold tracking-tight">{STEG[step].q}</h2>
                {STEG[step].lead && <p className="mt-1 mb-6 max-w-[56ch] text-sm text-muted-foreground leading-relaxed">{STEG[step].lead}</p>}

                {/* --- Steg 1: Graviditet & dekningsgrad --- */}
                {step === 0 && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>Når har du termin?</Label>
                        <Input type="date" className="h-11" value={input.terminDato} onChange={(e) => setInput({ terminDato: e.target.value })} />
                        <p className="text-[12.5px] text-muted-foreground">Datoen legen har beregnet. Permisjonen kan starte 3 uker før.</p>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Fødselsdato <span className="font-normal text-muted-foreground">· hvis allerede født</span></Label>
                        <Input type="date" className="h-11" value={input.fodselsDato ?? ''} onChange={(e) => setInput({ fodselsDato: e.target.value || undefined })} />
                        <p className="text-[12.5px] text-muted-foreground">La stå tom hvis barnet ikke er født ennå.</p>
                      </div>
                    </div>

                    <div className="space-y-2.5">
                      <Label>Velg dekningsgrad</Label>
                      <p className="-mt-1 text-[12.5px] text-muted-foreground">Avgjør hvor lenge og hvor mye du får utbetalt. Valget gjelder begge foreldre.</p>
                      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                        {[
                          { d: 100 as const, uker: 49, main: 'Kortere periode', sub: 'Full lønn hele veien' },
                          { d: 80 as const,  uker: 61, main: 'Lengre periode',  sub: '80 % av lønn hele veien' },
                        ].map((o) => {
                          const sel = input.dekningsgrad === o.d
                          return (
                            <button key={o.d} type="button" onClick={() => setInput({ dekningsgrad: o.d })}
                              className={`relative rounded-2xl border-[1.5px] px-5 py-4 text-left transition-all ${
                                sel ? 'border-primary bg-primary/10 ring-[3px] ring-primary/15' : 'border-border bg-muted/10 hover:border-muted-foreground/40'
                              }`}>
                              <span className={`absolute right-3.5 top-3.5 grid h-[22px] w-[22px] place-items-center rounded-full border-[1.5px] ${sel ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-transparent'}`}>
                                <Check className="h-3 w-3" />
                              </span>
                              <span className="block text-[30px] font-bold tracking-tight leading-none">{o.d}<span className="ml-0.5 text-base font-semibold opacity-70">%</span></span>
                              <span className="mt-2 block text-[13.5px] font-semibold">{o.main} · {o.uker} uker</span>
                              <span className="mt-0.5 block text-[12.5px] text-muted-foreground">{o.sub}</span>
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {tilgjengelig && (
                      <div className="space-y-3.5">
                        <div className="flex items-baseline justify-between">
                          <p className="text-[13px] font-semibold">Tilgjengelige uker ved {input.dekningsgrad}%</p>
                          <span className="text-[12.5px] text-muted-foreground">{Math.round(tilgjengelig.total)} uker totalt</span>
                        </div>
                        {QUOTAS.map((q) => {
                          const max = Math.max(...QUOTAS.map((qq) => tilgjengelig[qq.key]))
                          return (
                            <div key={q.key}>
                              <div className="mb-1.5 flex items-baseline justify-between">
                                <span className="flex items-center gap-2 text-[13px] font-medium">
                                  <span className={`h-2.5 w-2.5 rounded-[3px] ${q.dot}`} />{q.name}
                                  <span className="text-[11.5px] font-normal text-muted-foreground">· {q.note}</span>
                                </span>
                                <span className="text-[13px]"><b className="text-[14.5px]">{Math.round(tilgjengelig[q.key])}</b> uker</span>
                              </div>
                              <div className="h-2.5 overflow-hidden rounded-full bg-muted/60">
                                <div className={`h-full rounded-full transition-all duration-500 ${q.bar}`} style={{ width: `${(tilgjengelig[q.key] / max) * 100}%` }} />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    <div className="space-y-2.5">
                      <ToggleRow icon={Users} title="Tvillinger eller flere"
                        desc={`Gir ekstra uker (+${input.dekningsgrad === 100 ? 17 : 21} uker fellesperiode).`}
                        on={input.tvillinger} onToggle={() => setInput({ tvillinger: !input.tvillinger })} />
                      <ToggleRow icon={Clock} title="Født før uke 33"
                        desc="For tidlig fødsel gir ekstra uker tilsvarende tiden før termin."
                        on={input.forTidligFodsel} onToggle={() => setInput({ forTidligFodsel: !input.forTidligFodsel })} />
                    </div>

                    <InfoBox>
                      De første <b>3 ukene før termin</b> og <b>6 ukene etter fødsel</b> er forbeholdt mor. Resten kan fordeles fritt mellom dere.
                      {barnehageStart && <> Med dette valget rekker dere <b>{fmtDate(barnehageStart)}</b> (barnehagestart).</>}
                    </InfoBox>
                  </div>
                )}

                {/* --- Steg 2: Partner --- */}
                {step === 1 && (
                  <div className="space-y-5">
                    <InfoBox>
                      <b>Om lærere og ferie:</b> Lærere har <b>5 uker tvungen sommerferie</b> — det er den eneste ferien som kan "kollidere" med foreldrepenger. Vinterferie, påskeferie, høstferie og juleferie er <i>avspasering / undervisningsfri</i> og teller ikke som ordinær ferie i NAV-sammenheng.<br /><br />
                      Tar medmor/far medmorkvoten i de 5 sommerukene, brukes permisjons­uker i en periode der partner er hjemme uansett — en dårlig deal. Legg heller medmorkvoten til skoleåret.
                    </InfoBox>

                    <ToggleRow icon={GraduationCap} title="Partner har bunden sommerferie"
                      desc="Partner er f.eks. lærer eller har annen tvungen sommerferie. Vi legger medmorkvoten utenfor ferieperioden."
                      on={input.partnerErLærer} onToggle={() => setInput({ partnerErLærer: !input.partnerErLærer })} />

                    {input.partnerErLærer && (
                      <div className="space-y-3">
                        <p className="text-[13px] text-muted-foreground">Når er sommerferien? (Brukes til å plassere medmorkvoten optimalt.)</p>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <Label>Sommerferie starter</Label>
                            <MonthDayPicker label="Sommerferie starter" value={input.partnerSommerFraManedDag} onChange={(v) => setInput({ partnerSommerFraManedDag: v })} />
                          </div>
                          <div className="space-y-1.5">
                            <Label>Sommerferie slutter</Label>
                            <MonthDayPicker label="Sommerferie slutter" value={input.partnerSommerTilManedDag} onChange={(v) => setInput({ partnerSommerTilManedDag: v })} />
                          </div>
                        </div>
                      </div>
                    )}

                    <InfoBox>Medmor/far kan tidligst starte sin permisjon <b>uke 7 etter fødsel</b>. Medmorkvoten kan tas uten at mor trenger å dokumentere aktivitet.</InfoBox>
                  </div>
                )}

                {/* --- Steg 3: Mine ferieblokker --- */}
                {step === 2 && (
                  <div className="space-y-4">
                    <p className="max-w-[60ch] text-[13.5px] text-muted-foreground leading-relaxed">
                      Legg inn planlagte ferieperioder. Ferie kan brukes som <b>pause</b> fra foreldrepenger, slik at ukene forskyves og du strekker permisjonen lenger.
                    </p>
                    {input.mineFerieblokker.length > 0 && (
                      <div className="space-y-2">
                        {input.mineFerieblokker.map((f, i) => (
                          <div key={i} className="flex items-center gap-3 rounded-xl border border-border bg-muted/10 px-4 py-2.5 text-[13.5px]">
                            <span className="h-2.5 w-2.5 shrink-0 rounded-[3px] bg-orange-500" />
                            <span className="font-mono">{f.fra}</span>
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="font-mono">{f.til}</span>
                            <button className="ml-auto grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-red-500/15 hover:text-red-400" onClick={() => fjernMinFerie(i)} aria-label="Fjern"><X className="h-4 w-4" /></button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="flex-1 min-w-[150px] space-y-1.5">
                        <Label>Fra</Label>
                        <Input type="date" className="h-11" value={minFerieFra} onChange={(e) => setMinFerieFra(e.target.value)} />
                      </div>
                      <div className="flex-1 min-w-[150px] space-y-1.5">
                        <Label>Til</Label>
                        <Input type="date" className="h-11" value={minFerieTil} onChange={(e) => setMinFerieTil(e.target.value)} />
                      </div>
                      <Button variant="outline" className="h-11 gap-1.5" onClick={leggTilMinFerie} disabled={!minFerieFra || !minFerieTil}><Plus className="h-4 w-4" /> Legg til</Button>
                    </div>
                    <InfoBox>De fleste har <b>5 uker ferie</b> i året. Lagt inn her vises feriene som oransje felt på tidslinjen.</InfoBox>
                  </div>
                )}

                {/* --- Steg 4: Fordeling av fellesperioden --- */}
                {step === 3 && (
                  tilgjengelig ? (
                    <div className="space-y-5">
                      <p className="max-w-[60ch] text-[13.5px] text-muted-foreground leading-relaxed">
                        Foreldrepengene er delt i tre: en del til hver av dere og en fellesperiode på <b>{fellesUker} uker</b> som dere fordeler fritt. Dra glidebryteren eller bruk pluss/minus.
                      </p>
                      <div className="rounded-2xl border border-primary/25 bg-primary/[0.07] px-5 py-5">
                        <div className="flex justify-between text-[13.5px] font-semibold">
                          <span className="text-blue-400">Mor</span><span className="text-green-400">Partner</span>
                        </div>
                        <div className="mt-3.5 flex items-center gap-3">
                          <button className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border bg-muted/20 hover:bg-muted/40 disabled:opacity-40" onClick={() => setFordeling(tilMor - 1)} disabled={tilMor <= 0} aria-label="Mindre til mor"><Minus className="h-4 w-4" /></button>
                          <div className="relative flex-1">
                            <div className="h-3 overflow-hidden rounded-full bg-green-600">
                              <div className="h-full bg-blue-500 transition-all" style={{ width: `${(tilMor / fellesUker) * 100}%` }} />
                            </div>
                            <input type="range" min={0} max={fellesUker} value={tilMor} onChange={(e) => setFordeling(parseInt(e.target.value))}
                              className="absolute inset-x-0 -top-1.5 h-6 w-full cursor-pointer appearance-none bg-transparent [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-[3px] [&::-webkit-slider-thumb]:border-background [&::-webkit-slider-thumb]:shadow-lg" />
                          </div>
                          <button className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border bg-muted/20 hover:bg-muted/40 disabled:opacity-40" onClick={() => setFordeling(tilMor + 1)} disabled={tilMor >= fellesUker} aria-label="Mer til mor"><Plus className="h-4 w-4" /></button>
                        </div>
                        <div className="mt-3 flex justify-between text-[13px] text-muted-foreground">
                          <span><b className="text-[17px] text-foreground">{tilMor}</b> uker til mor</span>
                          <span><b className="text-[17px] text-foreground">{tilPartner}</b> uker til partner</span>
                        </div>
                      </div>

                      <div>
                        <p className="mb-2 text-[13px] font-semibold">Perioden deres</p>
                        <div className="space-y-2">
                          <div className="flex items-center gap-3 rounded-xl border border-blue-500/30 bg-muted/10 px-4 py-2.5 text-[13.5px]">
                            <span className="h-2.5 w-2.5 rounded-[3px] bg-blue-500" /><span className="font-semibold">Mor</span>
                            <span className="ml-auto text-muted-foreground">{morFra && morTil ? `${fmtDate(morFra)} – ${fmtDate(morTil)}` : '—'}</span>
                          </div>
                          <div className="flex items-center gap-3 rounded-xl border border-green-600/30 bg-muted/10 px-4 py-2.5 text-[13.5px]">
                            <span className="h-2.5 w-2.5 rounded-[3px] bg-green-600" /><span className="font-semibold">Partner{input.partnerErLærer ? ' (lærer)' : ''}</span>
                            <span className="ml-auto text-muted-foreground">{parFra && parTil ? `${fmtDate(parFra)} – ${fmtDate(parTil)}` : '—'}</span>
                          </div>
                        </div>
                      </div>

                      <InfoBox>Når partner tar fellesperiode, må mor være <b>i aktivitet</b> (jobbe eller studere). Tar mor hele fellesperioden, gjelder ikke aktivitetskravet.</InfoBox>
                    </div>
                  ) : (
                    <InfoBox>Fyll inn termindato i steg 1 først.</InfoBox>
                  )
                )}

                {/* --- Steg 5: Generer --- */}
                {step === 4 && (
                  <div className="space-y-5">
                    <Card className="rounded-xl bg-muted/10">
                      <CardContent className="grid grid-cols-1 gap-x-6 gap-y-3.5 py-5 sm:grid-cols-2">
                        {[
                          ['Termin', input.terminDato ? fmtDate(input.terminDato) : '—'],
                          ['Dekningsgrad', `${input.dekningsgrad} %`],
                          ['Totalt tilgjengelig', tilgjengelig ? `${Math.round(tilgjengelig.total)} uker` : '—'],
                          ['Barnehagestart', barnehageStart ? fmtDate(barnehageStart) : '—'],
                          ['Fellesperiode', `${tilMor} uker mor / ${tilPartner} uker partner`],
                          ['Mine ferieuker', `${input.mineFerieblokker.length} blokk${input.mineFerieblokker.length === 1 ? '' : 'er'}`],
                        ].map(([k, v]) => (
                          <div key={k} className="flex items-baseline justify-between gap-3 border-b border-border/50 pb-2">
                            <span className="text-[13px] text-muted-foreground">{k}</span>
                            <span className="text-right text-[13.5px] font-semibold">{v}</span>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                    {input.terminDato ? (
                      <Button size="lg" className="gap-2" onClick={() => { genererPlan(); setTab('tidslinje') }}>
                        <Sparkles className="h-[18px] w-[18px]" />{perioder.length === 0 ? 'Generer plan' : 'Regenerer plan'}
                      </Button>
                    ) : (
                      <InfoBox>Fyll inn termindato i steg 1 for å generere planen.</InfoBox>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="mt-6 flex items-center justify-between">
              <Button variant="ghost" className="gap-1.5" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}><ChevronLeft className="h-4 w-4" /> Forrige</Button>
              {step < STEG.length - 1 && (
                <Button className="gap-1.5" onClick={() => setStep(step + 1)} disabled={!kanGåVidere}>Neste <ChevronRight className="h-4 w-4" /></Button>
              )}
            </div>
          </div>
        )}

        {/* ============ TIDSLINJE ============ */}
        {tab === 'tidslinje' && (
          <div className="mx-auto max-w-4xl">
            {perioder.length === 0 ? (
              <div className="py-16 text-center">
                <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-border bg-card text-muted-foreground"><Calendar className="h-6 w-6" /></div>
                <p className="mb-4 text-sm text-muted-foreground">Ingen plan ennå. Fyll inn oppsettet, så tegner vi opp tidslinjen.</p>
                <Button onClick={() => setTab('oppsett')}>Gå til oppsett</Button>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="inline-flex gap-1 rounded-xl border border-border bg-muted/20 p-1">
                    {([['kalender', 'Kalender', Calendar], ['tidslinje', 'Tidslinje', Clock]] as const).map(([v, lbl, Ic]) => (
                      <button key={v} onClick={() => setPlanView(v)}
                        className={`flex items-center gap-2 rounded-lg px-4 py-1.5 text-[13px] font-medium transition-colors ${planView === v ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                        <Ic className="h-3.5 w-3.5" /> {lbl}
                      </button>
                    ))}
                  </div>
                  <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={() => setTab('oppsett')}>Endre oppsett</Button>
                </div>

                <Card className="rounded-2xl">
                  <CardContent className="px-6 py-6">
                    {planView === 'kalender'
                      ? <PermisjonKalender input={input} perioder={perioder} />
                      : <PermisjonTimeline input={input} perioder={perioder} />}
                  </CardContent>
                </Card>

                {oppsummering && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <Card className="rounded-2xl">
                        <CardContent className="px-5 py-5">
                          <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide"><span className="h-2.5 w-2.5 rounded-[4px] bg-blue-500" /> Meg</p>
                          <div className="flex items-baseline justify-between border-b border-border/60 py-1.5"><span className="text-[13px] text-muted-foreground">Brukt</span><span className="text-[15px] font-semibold">{oppsummering.ukerdBruktMeg} uker</span></div>
                          <div className="flex items-baseline justify-between border-b border-border/60 py-1.5"><span className="text-[13px] text-muted-foreground">Igjen</span><span className={`text-[15px] font-semibold ${oppsummering.ukerIgjenMeg > 0 ? 'text-amber-400' : 'text-green-400'}`}>{oppsummering.ukerIgjenMeg} uker</span></div>
                          {oppsummering.sluttdatoMeg && <div className="flex items-baseline justify-between py-1.5"><span className="text-[13px] text-muted-foreground">Slutter</span><span className="text-[15px] font-semibold">{fmtDate(oppsummering.sluttdatoMeg)}</span></div>}
                        </CardContent>
                      </Card>
                      <Card className="rounded-2xl">
                        <CardContent className="px-5 py-5">
                          <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide"><span className="h-2.5 w-2.5 rounded-[4px] bg-green-600" /> Partner</p>
                          <div className="flex items-baseline justify-between border-b border-border/60 py-1.5"><span className="text-[13px] text-muted-foreground">Brukt</span><span className="text-[15px] font-semibold">{oppsummering.ukerBruktPartner} uker</span></div>
                          <div className="flex items-baseline justify-between border-b border-border/60 py-1.5"><span className="text-[13px] text-muted-foreground">Igjen</span><span className={`text-[15px] font-semibold ${oppsummering.ukerIgjenPartner > 0 ? 'text-amber-400' : 'text-green-400'}`}>{oppsummering.ukerIgjenPartner} uker</span></div>
                          {oppsummering.sluttdatoPartner && <div className="flex items-baseline justify-between border-b border-border/60 py-1.5"><span className="text-[13px] text-muted-foreground">Slutter</span><span className="text-[15px] font-semibold">{fmtDate(oppsummering.sluttdatoPartner)}</span></div>}
                          {oppsummering.partnerUkerISommerFerie > 0 && <div className="flex items-baseline justify-between py-1.5"><span className="text-[13px] text-amber-400">I sommerferie</span><span className="text-[15px] font-semibold text-amber-400">{oppsummering.partnerUkerISommerFerie} uker</span></div>}
                        </CardContent>
                      </Card>
                    </div>

                    <div className={`flex items-center gap-2.5 rounded-2xl border px-5 py-3.5 text-[13.5px] font-medium ${
                      oppsummering.dekkerTilBarnehageStart ? 'border-green-500/40 bg-green-500/10 text-green-300' : 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                    }`}>
                      {oppsummering.dekkerTilBarnehageStart
                        ? <><CheckCircle className="h-[18px] w-[18px]" /> Dekker hele veien til barnehagestart ({fmtDate(oppsummering.barnehageStart)}) — ingen gap.</>
                        : <><AlertTriangle className="h-[18px] w-[18px]" /> Gap før barnehagestart ({fmtDate(oppsummering.barnehageStart)}). Vurder ferie eller gradert uttak.</>}
                    </div>

                    {(oppsummering.validering.feil.length > 0 || oppsummering.validering.advarsler.length > 0) && (
                      <Card className="rounded-2xl">
                        <CardContent className="space-y-2 px-5 py-4">
                          {oppsummering.validering.feil.map((f, i) => (<p key={`f${i}`} className="flex items-start gap-2 text-[12.5px] leading-relaxed text-red-400"><AlertTriangle className="h-4 w-4 shrink-0 mt-px" />{f}</p>))}
                          {oppsummering.validering.advarsler.map((a, i) => (<p key={`a${i}`} className="flex items-start gap-2 text-[12.5px] leading-relaxed text-amber-400"><AlertTriangle className="h-4 w-4 shrink-0 mt-px" />{a}</p>))}
                        </CardContent>
                      </Card>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ============ AI-RÅDGIVER ============ */}
        {tab === 'ai' && (
          <div className="mx-auto max-w-3xl h-full">
            <PermisjonAIChat input={input} perioder={perioder} oppsummering={oppsummering} />
          </div>
        )}
      </div>
    </div>
  )
}
