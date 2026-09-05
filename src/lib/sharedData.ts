import * as Sentry from '@sentry/react'
import { supabase } from './supabase'

/** Generisk partnerskaps-scopet JSONB-lager (tabellen `shared_project_data`) —
 *  ett rad per (partnership_id, key), brukt til å dele Utstyr/Klær/Gaver o.l.
 *  mellom to koblede kontoer. Samme RLS-/realtime-mønster som
 *  `shared_project_transactions` (se lib/sharedProject.ts), men som én hel
 *  JSON-verdi per nøkkel istedenfor én rad per element. */

export async function loadSharedData<T>(partnershipId: string, key: string, fallback: T): Promise<T> {
  const { data, error } = await supabase
    .from('shared_project_data')
    .select('data')
    .eq('partnership_id', partnershipId)
    .eq('key', key)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return (data?.data as T | undefined) ?? fallback
}

export async function saveSharedData<T>(partnershipId: string, key: string, data: T): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('shared_project_data')
    .upsert(
      { partnership_id: partnershipId, key, data, updated_by: user?.id, updated_at: new Date().toISOString() },
      { onConflict: 'partnership_id,key' },
    )

  if (error) throw new Error(error.message)
}

/** Samme reconnect-med-backoff-mønster som subscribeToSharedProject — Supabase sin
 *  realtime-tenant sover ved inaktivitet og river ned kanalen uten selv å re-abonnere. */
export function subscribeToSharedData<T>(
  partnershipId: string,
  key: string,
  onChange: (data: T) => void,
): () => void {
  let stopped = false
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let attempt = 0
  let channel: ReturnType<typeof supabase.channel> | null = null

  function connect() {
    channel = supabase
      .channel(`shared-data-${partnershipId}-${key}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shared_project_data', filter: `partnership_id=eq.${partnershipId}` },
        (payload) => {
          const row = payload.new as { key?: string; data?: T } | undefined
          if (row?.key === key && row.data !== undefined) onChange(row.data)
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          attempt = 0
          return
        }
        if (status !== 'CHANNEL_ERROR' && status !== 'TIMED_OUT') return
        Sentry.captureMessage(`Realtime shared-data ${status} (partnership ${partnershipId}, key ${key})`, 'warning')
        if (stopped) return
        if (channel) supabase.removeChannel(channel)
        attempt += 1
        const delay = Math.min(30000, 1000 * 2 ** (attempt - 1))
        retryTimer = setTimeout(connect, delay)
      })
  }

  connect()

  return () => {
    stopped = true
    if (retryTimer) clearTimeout(retryTimer)
    if (channel) supabase.removeChannel(channel)
  }
}
