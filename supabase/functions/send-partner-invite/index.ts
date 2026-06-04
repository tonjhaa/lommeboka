import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const APP_ORIGIN = (Deno.env.get('APP_ORIGIN') ?? 'https://tonjhaa.github.io').replace(/\/$/, '')

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': APP_ORIGIN,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, baggage, sentry-trace',
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // 1. Verifiser JWT — avvis uautentiserte kall
  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!jwt) {
    return new Response(JSON.stringify({ error: 'Uautorisert' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: { user }, error: authError } = await supabase.auth.getUser(jwt)
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Uautorisert' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // 2. Les partnershipId fra body — ingen inviteLink fra klient
  const { partnershipId } = await req.json()
  if (!partnershipId || typeof partnershipId !== 'string') {
    return new Response(JSON.stringify({ error: 'Mangler partnershipId' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // 3. Hent invitasjon fra DB — verifiser at kaller er inviter og status er pending
  const { data: partnership, error: dbError } = await supabase
    .from('partnerships')
    .select('id, invitee_email, inviter_id, status')
    .eq('id', partnershipId)
    .eq('inviter_id', user.id)
    .eq('status', 'pending')
    .single()

  if (dbError || !partnership) {
    return new Response(JSON.stringify({ error: 'Invitasjon ikke funnet' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // 4. Bygg inviteLink server-side — ingen klientdata i URL
  const inviteLink = `${APP_ORIGIN}/?invite=${partnership.id}`

  // 5. Send e-post
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY ikke konfigurert' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Lommeboka <noreply@lommeboka.com>',
      to: [partnership.invitee_email],
      subject: 'Du har fått en invitasjon til Lommeboka',
      html: buildEmailHtml(inviteLink),
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    return new Response(JSON.stringify({ error: body }), {
      status: res.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})

// inviteLink er alltid bygget server-side — ingen brukerdata når hit
function buildEmailHtml(inviteLink: string): string {
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
      <h2 style="margin: 0 0 8px; font-size: 20px; color: #111;">Invitasjon til Lommeboka</h2>
      <p style="margin: 0 0 24px; color: #555; font-size: 15px; line-height: 1.5;">
        En bruker har invitert deg til å dele økonomidata i Lommeboka.
        Klikk på knappen nedenfor for å akseptere.
      </p>
      <a href="${inviteLink}"
         style="display: inline-block; padding: 12px 24px; background: #7c3aed; color: #fff;
                text-decoration: none; border-radius: 8px; font-size: 15px; font-weight: 500;">
        Aksepter invitasjon
      </a>
      <p style="margin: 24px 0 0; color: #999; font-size: 12px;">
        Lenken er gyldig i 7 dager. Hvis du ikke kjenner til denne invitasjonen kan du se bort fra denne e-posten.
      </p>
    </div>
  `
}
