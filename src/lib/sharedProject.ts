import * as Sentry from '@sentry/react'
import { supabase } from './supabase'
import type { IVFTransactionType } from '@/types/economy'

export interface SharedProjectTransaction {
  id: string
  partnership_id: string
  date: string
  label: string
  type: IVFTransactionType
  amount: number
  merknad?: string
  created_by?: string
  created_at: string
}

export async function loadSharedTransactions(
  partnershipId: string,
): Promise<SharedProjectTransaction[]> {
  const { data, error } = await supabase
    .from('shared_project_transactions')
    .select('*')
    .eq('partnership_id', partnershipId)
    .order('date', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []) as SharedProjectTransaction[]
}

export async function addSharedTransaction(
  partnershipId: string,
  tx: Omit<SharedProjectTransaction, 'id' | 'partnership_id' | 'created_at' | 'created_by'>,
): Promise<SharedProjectTransaction> {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('shared_project_transactions')
    .insert({ ...tx, partnership_id: partnershipId, created_by: user?.id })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data as SharedProjectTransaction
}

export async function updateSharedTransaction(
  id: string,
  updates: Partial<Pick<SharedProjectTransaction, 'date' | 'label' | 'type' | 'amount' | 'merknad'>>,
): Promise<void> {
  const { error } = await supabase
    .from('shared_project_transactions')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw new Error(error.message)
}

export async function removeSharedTransaction(id: string): Promise<void> {
  const { error } = await supabase
    .from('shared_project_transactions')
    .delete()
    .eq('id', id)

  if (error) throw new Error(error.message)
}

/** Supabase sin realtime-tenant sover ved inaktivitet og river ned kanalen — supabase-js
 *  re-abonnerer ikke automatisk ved CHANNEL_ERROR/TIMED_OUT, så vi må gjøre det selv. */
export function subscribeToSharedProject(
  partnershipId: string,
  onInsert: (tx: SharedProjectTransaction) => void,
  onUpdate: (tx: SharedProjectTransaction) => void,
  onDelete: (id: string) => void,
): () => void {
  let stopped = false
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let attempt = 0
  let channel: ReturnType<typeof supabase.channel> | null = null

  function connect() {
    channel = supabase
      .channel(`shared-project-${partnershipId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'shared_project_transactions', filter: `partnership_id=eq.${partnershipId}` },
        (p) => onInsert(p.new as SharedProjectTransaction),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'shared_project_transactions', filter: `partnership_id=eq.${partnershipId}` },
        (p) => onUpdate(p.new as SharedProjectTransaction),
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'shared_project_transactions', filter: `partnership_id=eq.${partnershipId}` },
        (p) => onDelete((p.old as { id: string }).id),
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          attempt = 0
          return
        }
        if (status !== 'CHANNEL_ERROR' && status !== 'TIMED_OUT') return
        Sentry.captureMessage(`Realtime shared-project ${status} (partnership ${partnershipId})`, 'warning')
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

/** Migrer personlige ivfTransactions til delt prosjekt. Hopper over duplikater (samme dato+label+beløp). */
export async function migratePersonalToShared(
  partnershipId: string,
  personalTxs: Array<{ id: string; date: string; label: string; type: IVFTransactionType; amount: number; merknad?: string }>,
): Promise<number> {
  if (personalTxs.length === 0) return 0

  const existing = await loadSharedTransactions(partnershipId)
  const existingKeys = new Set(existing.map((t) => `${t.date}|${t.label}|${t.amount}`))

  const toInsert = personalTxs.filter(
    (t) => !existingKeys.has(`${t.date}|${t.label}|${t.amount}`),
  )

  if (toInsert.length === 0) return 0

  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase.from('shared_project_transactions').insert(
    toInsert.map(({ id: _id, ...t }) => ({
      ...t,
      partnership_id: partnershipId,
      created_by: user?.id,
    })),
  )

  if (error) throw new Error(error.message)
  return toInsert.length
}
