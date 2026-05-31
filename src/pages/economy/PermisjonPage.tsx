import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertTriangle, CheckCircle, Baby, GraduationCap, RefreshCw } from 'lucide-react'
import { usePermisjonStore } from '@/application/usePermisjonStore'
import { beregnTilgjengeligeUker, beregnOppsummering, beregnBarnehageStart } from '@/domain/economy/foreldrepengerRules'
import { PermisjonTimeline } from '@/components/economy/PermisjonTimeline'
import { PermisjonAIChat } from '@/components/economy/PermisjonAIChat'

type Tab = 'oppsett' | 'tidslinje' | 'ai'

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('no-NO', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function PermisjonPage() {
  const { input, perioder, setInput, genererPlan } = usePermisjonStore()
  const [tab, setTab] = useState<Tab>('oppsett')
  const [minFerieFra, setMinFerieFra] = useState('')
  const [minFerieTil, setMinFerieTil] = useState('')

  const tilgjengelig = input.terminDato ? beregnTilgjengeligeUker(input) : null
  const oppsummering = input.terminDato && perioder.length > 0
    ? beregnOppsummering(input, perioder)
    : null
  const barnehageStart = input.terminDato
    ? beregnBarnehageStart(input.terminDato, input.fodselsDato)
    : null

  function leggTilMinFerie() {
    if (!minFerieFra || !minFerieTil) return
    setInput({ mineFerieblokker: [...input.mineFerieblokker, { fra: minFerieFra, til: minFerieTil, label: 'Ferie' }] })
    setMinFerieFra(''); setMinFerieTil('')
  }

  function fjernMinFerie(i: number) {
    setInput({ mineFerieblokker: input.mineFerieblokker.filter((_, idx) => idx !== i) })
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex gap-1 px-4 pt-3 border-b border-border shrink-0">
        {(['oppsett', 'tidslinje', 'ai'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-xs rounded-t font-medium transition-colors ${
              tab === t
                ? 'bg-background border border-b-background border-border text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'oppsett' ? 'Oppsett' : t === 'tidslinje' ? 'Tidslinje' : '🤖 AI-rådgiver'}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {tab === 'oppsett' && (
          <div className="space-y-4 max-w-2xl">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Baby className="h-4 w-4" /> Graviditet & dekningsgrad
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Termindato</Label>
                    <Input type="date" className="h-8 text-xs"
                      value={input.terminDato}
                      onChange={(e) => setInput({ terminDato: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Fødselsdato (hvis allerede født)</Label>
                    <Input type="date" className="h-8 text-xs"
                      value={input.fodselsDato ?? ''}
                      onChange={(e) => setInput({ fodselsDato: e.target.value || undefined })} />
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <Label className="text-xs">Dekningsgrad</Label>
                  {([100, 80] as const).map((d) => (
                    <button
                      key={d}
                      onClick={() => setInput({ dekningsgrad: d })}
                      className={`px-3 py-1 rounded text-xs border transition-colors ${
                        input.dekningsgrad === d
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'border-border text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {d} %
                    </button>
                  ))}
                </div>
                <div className="flex gap-4 text-xs">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={input.tvillinger}
                      onChange={(e) => setInput({ tvillinger: e.target.checked })} />
                    Tvillinger (+{input.dekningsgrad === 100 ? 17 : 21} uker)
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={input.forTidligFodsel}
                      onChange={(e) => setInput({ forTidligFodsel: e.target.checked })} />
                    Født før uke 33
                  </label>
                </div>

                {tilgjengelig && (
                  <div className="rounded-md bg-muted/30 px-3 py-2 text-xs space-y-1">
                    <p className="font-medium text-foreground">Tilgjengelige uker ({input.dekningsgrad} %)</p>
                    <div className="grid grid-cols-3 gap-2 text-muted-foreground">
                      <span>Mødrekvote: <b className="text-purple-400">{tilgjengelig.mødrekvote} uker</b></span>
                      <span>Fedrekvote: <b className="text-blue-400">{tilgjengelig.fedrekvote} uker</b></span>
                      <span>Fellesperiode: <b className="text-indigo-400">{tilgjengelig.fellesperiode} uker</b></span>
                    </div>
                    <p className="text-muted-foreground">
                      Totalt: <b className="text-foreground">{tilgjengelig.total} uker</b>
                      {barnehageStart && (
                        <> · Barnehagestart: <b className="text-green-400">{fmtDate(barnehageStart)}</b></>
                      )}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <GraduationCap className="h-4 w-4" /> Partner
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={input.partnerErLærer}
                    onChange={(e) => setInput({ partnerErLærer: e.target.checked })} />
                  Partner er lærer / skoleansatt
                </label>
                {input.partnerErLærer && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Sommerferie fra (MM-DD)</Label>
                      <Input className="h-8 text-xs" placeholder="06-22"
                        value={input.partnerSommerFraManedDag}
                        onChange={(e) => setInput({ partnerSommerFraManedDag: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Sommerferie til (MM-DD)</Label>
                      <Input className="h-8 text-xs" placeholder="08-14"
                        value={input.partnerSommerTilManedDag}
                        onChange={(e) => setInput({ partnerSommerTilManedDag: e.target.value })} />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Mine ferieblokker (5 uker)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Legg inn planlagte ferieperioder. Disse kan brukes som pause fra foreldrepenger, slik at ukene forskyves.
                </p>
                {input.mineFerieblokker.map((f, i) => (
                  <div key={i} className="flex items-center justify-between text-xs rounded border border-border px-2 py-1">
                    <span>{f.fra} → {f.til}</span>
                    <button className="text-muted-foreground hover:text-red-400" onClick={() => fjernMinFerie(i)}>×</button>
                  </div>
                ))}
                <div className="flex gap-2 items-end flex-wrap">
                  <div className="space-y-0.5">
                    <Label className="text-xs">Fra</Label>
                    <Input type="date" className="h-7 text-xs w-36" value={minFerieFra} onChange={(e) => setMinFerieFra(e.target.value)} />
                  </div>
                  <div className="space-y-0.5">
                    <Label className="text-xs">Til</Label>
                    <Input type="date" className="h-7 text-xs w-36" value={minFerieTil} onChange={(e) => setMinFerieTil(e.target.value)} />
                  </div>
                  <Button size="sm" className="h-7 text-xs" onClick={leggTilMinFerie}>Legg til</Button>
                </div>
              </CardContent>
            </Card>

            {input.terminDato && (
              <Button className="gap-2" onClick={() => { genererPlan(); setTab('tidslinje') }}>
                <RefreshCw className="h-4 w-4" />
                {perioder.length === 0 ? 'Generer plan' : 'Regenerer plan'}
              </Button>
            )}
          </div>
        )}

        {tab === 'tidslinje' && (
          <div className="space-y-4">
            {perioder.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground text-sm mb-3">Ingen plan ennå.</p>
                <Button onClick={() => setTab('oppsett')}>Gå til oppsett</Button>
              </div>
            ) : (
              <>
                <PermisjonTimeline input={input} perioder={perioder} />

                {oppsummering && (
                  <Card>
                    <CardContent className="pt-4 space-y-2 text-xs">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-muted-foreground mb-1 font-medium">Meg</p>
                          <p>Brukt: <b>{oppsummering.ukerdBruktMeg} uker</b></p>
                          <p>Igjen: <b className={oppsummering.ukerIgjenMeg > 0 ? 'text-amber-400' : 'text-green-400'}>{oppsummering.ukerIgjenMeg} uker</b></p>
                          {oppsummering.sluttdatoMeg && <p>Slutter: <b>{fmtDate(oppsummering.sluttdatoMeg)}</b></p>}
                        </div>
                        <div>
                          <p className="text-muted-foreground mb-1 font-medium">Partner</p>
                          <p>Brukt: <b>{oppsummering.ukerBruktPartner} uker</b></p>
                          <p>Igjen: <b className={oppsummering.ukerIgjenPartner > 0 ? 'text-amber-400' : 'text-green-400'}>{oppsummering.ukerIgjenPartner} uker</b></p>
                          {oppsummering.sluttdatoPartner && <p>Slutter: <b>{fmtDate(oppsummering.sluttdatoPartner)}</b></p>}
                          {oppsummering.partnerUkerISommerFerie > 0 && (
                            <p className="text-amber-400">⚠️ {oppsummering.partnerUkerISommerFerie} uker i sommerferie</p>
                          )}
                        </div>
                      </div>

                      <div className={`flex items-center gap-1.5 rounded px-2 py-1 ${
                        oppsummering.dekkerTilBarnehageStart ? 'bg-green-900/20 text-green-400' : 'bg-amber-900/20 text-amber-400'
                      }`}>
                        {oppsummering.dekkerTilBarnehageStart
                          ? <><CheckCircle className="h-3.5 w-3.5" /> Dekker til barnehagestart ({fmtDate(oppsummering.barnehageStart)})</>
                          : <><AlertTriangle className="h-3.5 w-3.5" /> Gap før barnehagestart ({fmtDate(oppsummering.barnehageStart)})</>
                        }
                      </div>

                      {oppsummering.validering.feil.map((f, i) => (
                        <p key={i} className="text-red-400 text-[11px] flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3 shrink-0" />{f}
                        </p>
                      ))}
                      {oppsummering.validering.advarsler.map((a, i) => (
                        <p key={i} className="text-amber-400 text-[11px] flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3 shrink-0" />{a}
                        </p>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </div>
        )}

        {tab === 'ai' && (
          <PermisjonAIChat input={input} perioder={perioder} oppsummering={oppsummering} />
        )}
      </div>
    </div>
  )
}
