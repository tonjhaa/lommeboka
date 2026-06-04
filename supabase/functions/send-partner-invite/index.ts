import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY ikke konfigurert' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const { to, inviteLink } = await req.json()
  if (!to || !inviteLink) {
    return new Response(JSON.stringify({ error: 'Mangler to eller inviteLink' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Lommeboka <noreply@lommeboka.com>',
      to: [to],
      subject: 'Du har fått en invitasjon til Lommeboka',
      html: `
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
      `,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    return new Response(JSON.stringify({ error: body }), {
      status: res.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
