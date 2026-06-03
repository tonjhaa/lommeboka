import { supabase } from './supabase'
import { usePartnerStore } from '@/application/usePartnerStore'

// ----------------------------------------------------------------
// Types
// ----------------------------------------------------------------

export interface Partnership {
  id: string
  inviter_id: string
  invitee_email: string
  invitee_id: string | null
  status: 'pending' | 'accepted' | 'rejected'
  created_at: string
  accepted_at: string | null
}

// ----------------------------------------------------------------
// CRUD
// ----------------------------------------------------------------

/** Henter gjeldende partnerskap for innlogget bruker (akseptert, eller siste pending). */
export async function loadPartnership(): Promise<Partnership | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Akseptert partnerskap (inviter eller invitee)
  const { data: accepted } = await supabase
    .from('partnerships')
    .select('*')
    .or(`inviter_id.eq.${user.id},invitee_id.eq.${user.id}`)
    .eq('status', 'accepted')
    .maybeSingle()

  if (accepted) return accepted as Partnership

  // Pending sendt
  const { data: sent } = await supabase
    .from('partnerships')
    .select('*')
    .eq('inviter_id', user.id)
    .eq('status', 'pending')
    .maybeSingle()

  if (sent) return sent as Partnership

  // Pending mottatt (invitasjon til min e-post)
  const { data: received } = await supabase
    .from('partnerships')
    .select('*')
    .eq('invitee_email', user.email)
    .eq('status', 'pending')
    .maybeSingle()

  return received as Partnership | null
}

/** Inviterer en partner via e-post. Oppretter pending partnerskap. */
export async function invitePartner(email: string): Promise<{ error: string | null; partnership: Partnership | null }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Ikke innlogget', partnership: null }

  if (email.toLowerCase() === user.email?.toLowerCase()) {
    return { error: 'Du kan ikke invitere deg selv', partnership: null }
  }

  const { data, error } = await supabase
    .from('partnerships')
    .insert({ inviter_id: user.id, invitee_email: email.toLowerCase() })
    .select()
    .single()

  if (error) {
    const msg = error.code === '23505'
      ? 'Du har allerede sendt en invitasjon til denne e-posten'
      : error.message
    return { error: msg, partnership: null }
  }

  return { error: null, partnership: data as Partnership }
}

/** Aksepterer en invitasjon. Krever at invitee_email matcher innlogget bruker. */
export async function acceptInvitation(partnershipId: string): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 'Ikke innlogget'

  const { error } = await supabase
    .from('partnerships')
    .update({
      invitee_id: user.id,
      status: 'accepted',
      accepted_at: new Date().toISOString(),
    })
    .eq('id', partnershipId)
    .eq('invitee_email', user.email)
    .eq('status', 'pending')

  return error?.message ?? null
}

/** Avslutter partnerskap (setter status = rejected). Kun inviter eller invitee kan kalle. */
export async function disconnectPartner(partnershipId: string): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 'Ikke innlogget'

  const { error } = await supabase
    .from('partnerships')
    .update({ status: 'rejected' })
    .eq('id', partnershipId)
    .or(`inviter_id.eq.${user.id},invitee_id.eq.${user.id}`)

  return error?.message ?? null
}

// ----------------------------------------------------------------
// Data
// ----------------------------------------------------------------

/** Henter partnerens economy_data fra Supabase. */
export async function loadPartnerData(partnerId: string): Promise<object | null> {
  const { data } = await supabase
    .from('user_data')
    .select('economy_data')
    .eq('user_id', partnerId)
    .single()

  return data?.economy_data ?? null
}

/** Importerer partnerdata inn i usePartnerStore. */
export function importPartnerDataToStore(data: object): void {
  usePartnerStore.getState().importData(JSON.stringify(data))
}

/** Abonnerer på sanntidsendringer i partnerens data. Returnerer unsubscribe-funksjon. */
export function subscribeToPartnerData(
  partnerId: string,
  onUpdate: (data: object) => void,
): () => void {
  const channel = supabase
    .channel(`partner-${partnerId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'user_data', filter: `user_id=eq.${partnerId}` },
      (payload) => {
        if (payload.new?.economy_data) onUpdate(payload.new.economy_data as object)
      },
    )
    .subscribe()

  return () => { supabase.removeChannel(channel) }
}

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

/** Bygger invitasjonslink for å dele med partner. */
export function buildInviteLink(partnershipId: string): string {
  const base = window.location.origin + window.location.pathname
  return `${base}?invite=${partnershipId}`
}

/** Sender invitasjonse-post direkte fra appen via Supabase Edge Function + Resend. */
export async function sendInviteEmail(toEmail: string, inviteLink: string): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return 'Ikke innlogget'

  const { error } = await supabase.functions.invoke('send-partner-invite', {
    body: { to: toEmail, inviteLink },
  })

  if (error) return error.message ?? 'Kunne ikke sende e-post'
  return null
}
