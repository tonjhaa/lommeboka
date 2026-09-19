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

interface SharedDataHub {
  listeners: Map<string, Set<(data: unknown) => void>>
  stop: () => void
}

/** Én realtime-kanal per partnerskap, delt av alle nøkler (gaver/utstyr/klaer). Alle nøklene
 *  lytter på samme tabell og filter, så egne kanaler per nøkkel ga bare flere kanaler som kunne falle. */
const hubs = new Map<string, SharedDataHub>()

/** Samme reconnect-med-backoff-mønster som subscribeToSharedProject — Supabase sin
 *  realtime-tenant sover ved inaktivitet og river ned kanalen uten selv å re-abonnere.
 *  Feil rapporteres til Sentry kun første gang i en feilrekke (til kanalen er SUBSCRIBED igjen). */
function createHub(partnershipId: string): SharedDataHub {
  const listeners: SharedDataHub['listeners'] = new Map()
  let stopped = false
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let attempt = 0
  let channel: ReturnType<typeof supabase.channel> | null = null

  function connect() {
    channel = supabase
      .channel(`shared-data-${partnershipId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shared_project_data', filter: `partnership_id=eq.${partnershipId}` },
        (payload) => {
          const row = payload.new as { key?: string; data?: unknown } | undefined
          if (!row?.key || row.data === undefined) return
          listeners.get(row.key)?.forEach((cb) => cb(row.data))
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          attempt = 0
          return
        }
        if (status !== 'CHANNEL_ERROR' && status !== 'TIMED_OUT') return
        if (stopped) return
        if (attempt === 0) {
          Sentry.captureMessage(`Realtime shared-data ${status} (partnership ${partnershipId})`, 'warning')
        }
        if (channel) supabase.removeChannel(channel)
        attempt += 1
        const delay = Math.min(30000, 1000 * 2 ** (attempt - 1))
        retryTimer = setTimeout(connect, delay)
      })
  }

  connect()

  return {
    listeners,
    stop: () => {
      stopped = true
      if (retryTimer) clearTimeout(retryTimer)
      if (channel) supabase.removeChannel(channel)
    },
  }
}

export function subscribeToSharedData<T>(
  partnershipId: string,
  key: string,
  onChange: (data: T) => void,
): () => void {
  let hub = hubs.get(partnershipId)
  if (!hub) {
    hub = createHub(partnershipId)
    hubs.set(partnershipId, hub)
  }
  const cb = onChange as (data: unknown) => void
  const set = hub.listeners.get(key) ?? new Set()
  set.add(cb)
  hub.listeners.set(key, set)

  const owner = hub
  return () => {
    const current = owner.listeners.get(key)
    current?.delete(cb)
    if (current?.size === 0) owner.listeners.delete(key)
    if (owner.listeners.size === 0) {
      owner.stop()
      if (hubs.get(partnershipId) === owner) hubs.delete(partnershipId)
    }
  }
}
