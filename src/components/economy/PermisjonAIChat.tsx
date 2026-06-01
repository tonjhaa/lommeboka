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
  const takKr = 819294 / 12  // 6G (819 294 kr/år per mai 2025) = 68 274 kr/mnd

  const lines: (string | null)[] = [
    `Jeg er: ${input.morErMeg ? 'mor (fødende)' : 'medmor / far'}`,
    `Termindato: ${input.terminDato || 'ikke satt'}`,
    input.fodselsDato ? `Fødselsdato: ${input.fodselsDato}` : null,
    `Dekningsgrad valgt: ${input.dekningsgrad} %`,
    input.tvillinger ? 'Tvillinger: ja' : null,
    input.forTidligFodsel ? 'Født for tidlig (< uke 33): ja' : null,
    input.minMaanedslonn
      ? `Min månedslønn: ${input.minMaanedslonn.toLocaleString('no-NO')} kr${input.minMaanedslonn > takKr ? ` (OVER 6G-taket ${Math.round(takKr).toLocaleString('no-NO')} kr/mnd — arbeidsgiver dekker over 6G: ${input.minAGDeкkerOver6G ? 'JA' : 'NEI/ukjent'})` : ' (under 6G-tak — full dekning)'}`
      : 'Min månedslønn: ikke oppgitt',
    input.partnerMaanedslonn
      ? `Partners månedslønn: ${input.partnerMaanedslonn.toLocaleString('no-NO')} kr${input.partnerMaanedslonn > takKr ? ` (OVER 6G-taket — arbeidsgiver dekker over 6G: ${input.partnerAGDeкkerOver6G ? 'JA' : 'NEI/ukjent'})` : ' (under 6G-tak — full dekning)'}`
      : 'Partners månedslønn: ikke oppgitt',
    `Partner har bunden sommerferie: ${input.partnerErLærer ? 'ja' : 'nei'}`,
    input.partnerErLærer
      ? `Partners sommerferie: ${input.partnerSommerFraManedDag} – ${input.partnerSommerTilManedDag}`
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

  async function send(content: string, retryCount = 0) {
    if (!content.trim() || loading) return
    setDraft('')
    setError(null)

    const userMsg: ChatMessage = { role: 'user', content, timestamp: new Date().toISOString() }
    if (retryCount === 0) addChatMessage(userMsg)
    setLoading(true)

    const userContext = buildUserContext(input, perioder, oppsummering)
    const allMessages = retryCount === 0 ? [...chatHistory, userMsg] : chatHistory
    const messages = allMessages.map(({ role, content: c }) => ({ role, content: c }))

    try {
      const { data, error: fnError } = await supabase.functions.invoke('permisjon-ai', {
        body: { messages, userContext },
      })
      if (fnError) throw fnError
      const assistantContent = (data as { content?: { text?: string } })?.content?.text ?? 'Ingen svar'
      addChatMessage({ role: 'assistant', content: assistantContent, timestamp: new Date().toISOString() })
    } catch (e) {
      const msg = String(e)
      const isNetworkError = msg.includes('FunctionsFetchError') || msg.includes('Failed to fetch') || msg.includes('NetworkError')
      if (isNetworkError && retryCount === 0) {
        // Automatisk retry ved nettverksfeil (kald start)
        await new Promise((r) => setTimeout(r, 2000))
        setLoading(false)
        await send(content, 1)
        return
      }
      setError(isNetworkError
        ? 'Tjenesten svarte ikke. Prøv igjen om et øyeblikk.'
        : `Feil ved AI-kall: ${msg}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full min-h-[500px] gap-4 max-w-3xl">
      {/* Topplinje med avatar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-primary/15 text-primary grid place-items-center">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <p className="text-base font-semibold leading-tight">AI-rådgiver</p>
            <p className="text-xs text-muted-foreground">Kjenner regelverket og situasjonen din</p>
          </div>
        </div>
        {chatHistory.length > 0 && (
          <Button variant="ghost" size="sm" className="text-xs gap-1.5" onClick={clearChat}>
            <RefreshCw className="h-3.5 w-3.5" /> Ny samtale
          </Button>
        )}
      </div>

      {/* Forslag som piller */}
      {chatHistory.length === 0 && (
        <div className="space-y-2.5">
          <p className="text-sm text-muted-foreground">Vanlige spørsmål</p>
          <div className="flex flex-wrap gap-2">
            {FORSLAG.map((f) => (
              <button
                key={f}
                onClick={() => send(f)}
                className="rounded-full px-4 py-2 text-[13px] font-medium border border-border bg-muted/20 text-foreground/80 transition-colors hover:bg-primary/15 hover:border-primary/50 hover:text-primary"
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Chat-vindu */}
      <div className="flex-1 overflow-y-auto rounded-2xl border border-border bg-muted/10 p-5 flex flex-col gap-4 min-h-[400px]">
        {chatHistory.length === 0 && (
          <p className="m-auto max-w-sm text-center text-sm text-muted-foreground leading-relaxed">
            Still meg et spørsmål om permisjonsplanlegging — jeg kjenner regelverket og situasjonen din.
          </p>
        )}
        {chatHistory.map((msg, i) => (
          <div key={i} className={`flex gap-3 max-w-[82%] ${msg.role === 'user' ? 'ml-auto flex-row-reverse' : ''}`}>
            {msg.role === 'assistant' && (
              <div className="h-7 w-7 shrink-0 rounded-lg bg-primary/15 text-primary grid place-items-center">
                <Bot className="h-4 w-4" />
              </div>
            )}
            <div
              className={`px-4 py-3 text-[13.5px] leading-relaxed whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground rounded-2xl rounded-tr-sm'
                  : 'bg-card border border-border text-foreground rounded-2xl rounded-tl-sm'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-3">
            <div className="h-7 w-7 shrink-0 rounded-lg bg-primary/15 text-primary grid place-items-center">
              <Bot className="h-4 w-4" />
            </div>
            <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3">
              <div className="flex gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce" />
              </div>
            </div>
          </div>
        )}
        {error && (
          <div className="flex flex-col items-center gap-2">
            <p className="text-xs text-red-400 text-center">{error}</p>
            <button
              className="text-xs underline text-muted-foreground hover:text-foreground"
              onClick={() => {
                const last = [...chatHistory].reverse().find((m) => m.role === 'user')
                if (last) { setError(null); send(last.content, 1) }
              }}
            >
              Prøv igjen
            </button>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Inndatafelt */}
      <div className="flex gap-2.5">
        <input
          className="flex-1 h-12 rounded-xl border border-border bg-background px-4 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
          placeholder="Spør om permisjonsplanlegging…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(draft) }
          }}
          disabled={loading}
        />
        <Button size="lg" className="h-12 px-5 gap-2" onClick={() => send(draft)} disabled={!draft.trim() || loading}>
          <Send className="h-4 w-4" /> Send
        </Button>
      </div>
    </div>
  )
}
