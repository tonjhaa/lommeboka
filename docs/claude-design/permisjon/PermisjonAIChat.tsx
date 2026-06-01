import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Send, Bot, RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { usePermisjonStore } from '@/application/usePermisjonStore'
import type { PermisjonInput, PermisjonPeriode, PermisjonOppsummering, ChatMessage } from '@/types/permisjon'
import { beregnTilgjengeligeUker } from '@/domain/economy/foreldrepengerRules'

const FORSLAG = [
  'Hva er den optimale planen gitt termindato og at partner er lærer?',
  'Hvordan unngår vi gap mellom permisjon og barnehagestart?',
  'Kan partner ta fedrekvote i ferien uten å "kaste bort" ukene?',
  'Hva skjer om vi velger 80 % i stedet for 100 %?',
  'Forklar fellesperioden og aktivitetskravet til mor.',
  'Hva bør vi gjøre med mine 5 uker ferie?',
]

function buildUserContext(
  input: PermisjonInput,
  perioder: PermisjonPeriode[],
  oppsummering: PermisjonOppsummering | null
): string {
  const tilgjengelig = input.terminDato ? beregnTilgjengeligeUker(input) : null
  const lines: (string | null)[] = [
    `Termindato: ${input.terminDato || 'ikke satt'}`,
    input.fodselsDato ? `Fødselsdato: ${input.fodselsDato}` : null,
    `Dekningsgrad: ${input.dekningsgrad} %`,
    input.tvillinger ? 'Tvillinger: ja' : null,
    input.forTidligFodsel ? 'Født for tidlig (< uke 33): ja' : null,
    `Partner er lærer: ${input.partnerErLærer ? 'ja' : 'nei'}`,
    input.partnerErLærer
      ? `Partner sommerferie: ${input.partnerSommerFraManedDag} – ${input.partnerSommerTilManedDag}`
      : null,
    input.mineFerieblokker.length > 0
      ? `Mine ferieblokker: ${input.mineFerieblokker.map((f) => `${f.fra}→${f.til}`).join(', ')}`
      : 'Ingen ferieblokker registrert',
    tilgjengelig
      ? `Tilgjengelige uker: forTermin=${tilgjengelig.forTermin}, mødrekvote=${tilgjengelig.mødrekvote}, fedrekvote=${tilgjengelig.fedrekvote}, felles=${tilgjengelig.fellesperiode}`
      : null,
    perioder.length > 0
      ? `Antall perioder i plan: ${perioder.length}`
      : 'Ingen plan generert ennå',
    oppsummering
      ? [
          `Meg slutter: ${oppsummering.sluttdatoMeg ?? 'ukjent'}`,
          `Partner slutter: ${oppsummering.sluttdatoPartner ?? 'ukjent'}`,
          `Barnehagestart: ${oppsummering.barnehageStart}`,
          `Dekker til barnehagestart: ${oppsummering.dekkerTilBarnehageStart ? 'ja' : 'nei'}`,
          oppsummering.partnerUkerISommerFerie > 0
            ? `Partner har ${oppsummering.partnerUkerISommerFerie} uker permisjon i sommerferie`
            : null,
        ].filter(Boolean).join('\n')
      : null,
  ]
  return lines.filter(Boolean).join('\n')
}

export function PermisjonAIChat({
  input,
  perioder,
  oppsummering,
}: {
  input: PermisjonInput
  perioder: PermisjonPeriode[]
  oppsummering: PermisjonOppsummering | null
}) {
  const { chatHistory, addChatMessage, clearChat } = usePermisjonStore()
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatHistory, loading])

  async function send(content: string) {
    if (!content.trim() || loading) return
    setDraft('')
    setError(null)

    const userMsg: ChatMessage = { role: 'user', content, timestamp: new Date().toISOString() }
    addChatMessage(userMsg)
    setLoading(true)

    const userContext = buildUserContext(input, perioder, oppsummering)
    const messages = [...chatHistory, userMsg].map(({ role, content: c }) => ({ role, content: c }))

    try {
      const { data, error: fnError } = await supabase.functions.invoke('permisjon-ai', {
        body: { messages, userContext },
      })
      if (fnError) throw fnError
      const assistantContent = (data as { content?: { text?: string } })?.content?.text ?? 'Ingen svar'
      addChatMessage({ role: 'assistant', content: assistantContent, timestamp: new Date().toISOString() })
    } catch (e) {
      setError(`Feil ved AI-kall: ${String(e)}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full min-h-[500px] space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-blue-400" />
          <span className="text-sm font-medium">AI-rådgiver</span>
        </div>
        {chatHistory.length > 0 && (
          <Button variant="ghost" size="sm" className="text-xs h-6 gap-1" onClick={clearChat}>
            <RefreshCw className="h-3 w-3" /> Ny samtale
          </Button>
        )}
      </div>

      {chatHistory.length === 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Vanlige spørsmål:</p>
          <div className="flex flex-wrap gap-1.5">
            {FORSLAG.map((f) => (
              <button
                key={f}
                onClick={() => send(f)}
                className="text-xs px-2 py-1 rounded border border-border hover:bg-muted/40 transition-colors text-muted-foreground hover:text-foreground"
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-3 rounded-md border border-border p-3 bg-muted/10 min-h-40">
        {chatHistory.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">
            Still meg et spørsmål om permisjonplanlegging — jeg kjenner regelverket og situasjonen din.
          </p>
        )}
        {chatHistory.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] rounded-lg px-3 py-2 text-xs whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-foreground'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-lg px-3 py-2 text-xs text-muted-foreground animate-pulse">
              Tenker…
            </div>
          </div>
        )}
        {error && <p className="text-xs text-red-400 text-center">{error}</p>}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-2">
        <input
          className="flex-1 h-9 rounded-md border border-border bg-background px-3 text-xs outline-none focus:border-primary"
          placeholder="Spør om permisjonplanlegging…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(draft) }
          }}
          disabled={loading}
        />
        <Button size="sm" className="h-9 px-3" onClick={() => send(draft)} disabled={!draft.trim() || loading}>
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
