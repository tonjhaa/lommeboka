import * as Sentry from '@sentry/react'
import { supabase } from '@/lib/supabase'
import type { MatchRow, NameRow, NameStat, SyncInfo, Vote } from './types'
import type { Tournament, FinalRank } from './tournament'

// Alle tilgangsregler håndheves av RLS/triggere i databasen (supabase/migrations/20260919000000_navnejakten.sql).
// Klienten kan bare lese egne stemmer; partnerens stemmer finnes ikke i noe svar.

const PAGE = 1000

interface NameDbRow {
  id: string; name: string; gender: 'girl' | 'boy'; letters: number; latest_year: number; latest_count: number
  latest_rank: number | null; latest_share: number | null; trend: 'rising' | 'stable' | 'falling' | null; timeless: boolean
}

function toName(r: NameDbRow): NameRow {
  return {
    id: r.id, name: r.name, gender: r.gender, letters: r.letters, latestYear: r.latest_year,
    latestCount: r.latest_count, latestRank: r.latest_rank,
    latestShare: r.latest_share === null ? null : Number(r.latest_share), trend: r.trend, timeless: r.timeless,
  }
}

/** PostgREST returnerer maks 1000 rader per kall — hent alle sider. */
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if (!data || data.length < PAGE) return out
  }
}

export async function fetchNames(): Promise<NameRow[]> {
  const rows = await fetchAll<NameDbRow>((from, to) =>
    supabase.from('names').select('*').order('id').range(from, to))
  return rows.map(toName)
}

export async function fetchNameStats(nameId: string): Promise<NameStat[]> {
  const { data, error } = await supabase
    .from('name_statistics').select('year, count, share, rank').eq('name_id', nameId).order('year')
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => ({ year: r.year, count: r.count, share: r.share === null ? null : Number(r.share), rank: r.rank }))
}

export async function fetchMyVotes(): Promise<Map<string, Vote>> {
  const rows = await fetchAll<{ name_id: string; vote: Vote }>((from, to) =>
    supabase.from('name_votes').select('name_id, vote').order('name_id').range(from, to))
  return new Map(rows.map((r) => [r.name_id, r.vote]))
}

export async function upsertVote(userId: string, nameId: string, vote: Vote): Promise<void> {
  const { error } = await supabase
    .from('name_votes')
    .upsert({ user_id: userId, name_id: nameId, vote, updated_at: new Date().toISOString() }, { onConflict: 'user_id,name_id' })
  if (error) throw new Error(error.message)
}

export async function deleteVote(userId: string, nameId: string): Promise<void> {
  const { error } = await supabase.from('name_votes').delete().eq('user_id', userId).eq('name_id', nameId)
  if (error) throw new Error(error.message)
}

interface MatchDbRow { id: string; name_id: string; matched_at: string }
const toMatch = (r: MatchDbRow): MatchRow => ({ id: r.id, nameId: r.name_id, matchedAt: r.matched_at })

export async function fetchMatches(): Promise<MatchRow[]> {
  const rows = await fetchAll<MatchDbRow>((from, to) =>
    supabase.from('name_matches').select('id, name_id, matched_at').order('matched_at', { ascending: false }).range(from, to))
  return rows.map(toMatch)
}

export async function fetchFavorites(): Promise<Set<string>> {
  const rows = await fetchAll<{ name_id: string }>((from, to) =>
    supabase.from('name_favorites').select('name_id').order('name_id').range(from, to))
  return new Set(rows.map((r) => r.name_id))
}

export async function setFavorite(userId: string, nameId: string, favorite: boolean): Promise<void> {
  const { error } = favorite
    ? await supabase.from('name_favorites').upsert({ user_id: userId, name_id: nameId }, { onConflict: 'user_id,name_id' })
    : await supabase.from('name_favorites').delete().eq('user_id', userId).eq('name_id', nameId)
  if (error) throw new Error(error.message)
}

export async function fetchSyncInfo(): Promise<SyncInfo | null> {
  const { data, error } = await supabase
    .from('ssb_sync_log').select('synced_at, latest_year, names_count').eq('status', 'ok')
    .order('synced_at', { ascending: false }).limit(1).maybeSingle()
  if (error) throw new Error(error.message)
  return data ? { syncedAt: data.synced_at, latestYear: data.latest_year, namesCount: data.names_count } : null
}

export async function invokeSsbSync(): Promise<{ ok: boolean; message: string }> {
  const { data, error } = await supabase.functions.invoke('sync-ssb-names')
  if (error) {
    let message = error.message
    const ctx = (error as { context?: Response }).context
    if (ctx && typeof ctx.json === 'function') {
      try { message = ((await ctx.json()) as { error?: string }).error ?? message } catch { /* behold generell melding */ }
    }
    return { ok: false, message }
  }
  const d = data as { names: number; statistics: number; latestYear: number }
  return { ok: true, message: `Hentet ${d.names} navn og ${d.statistics} årstall (siste år ${d.latestYear}).` }
}

export interface PartnerStats { rated: number; yes: number; maybe: number }

export async function fetchPartnerStats(): Promise<PartnerStats | null> {
  const { data, error } = await supabase.rpc('name_partner_stats')
  if (error) throw new Error(error.message)
  const row = (data as Array<{ rated: number; yes_count: number; maybe_count: number }> | null)?.[0]
  return row ? { rated: Number(row.rated), yes: Number(row.yes_count), maybe: Number(row.maybe_count) } : null
}

// ── Finalen

export interface FinalSession { id: string; nameIds: string[]; createdAt: string }
export interface FinalRun { state: Tournament; status: 'in_progress' | 'done'; result: FinalRank[] | null }

export async function fetchLatestFinal(partnershipId: string): Promise<FinalSession | null> {
  const { data, error } = await supabase
    .from('name_finals').select('id, name_ids, created_at').eq('partnership_id', partnershipId)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (error) throw new Error(error.message)
  return data ? { id: data.id, nameIds: data.name_ids, createdAt: data.created_at } : null
}

export async function createFinal(partnershipId: string, userId: string, nameIds: string[]): Promise<FinalSession> {
  const { data, error } = await supabase
    .from('name_finals').insert({ partnership_id: partnershipId, created_by: userId, name_ids: nameIds })
    .select('id, name_ids, created_at').single()
  if (error) throw new Error(error.message)
  return { id: data.id, nameIds: data.name_ids, createdAt: data.created_at }
}

export async function fetchMyRun(finalId: string, userId: string): Promise<FinalRun | null> {
  const { data, error } = await supabase
    .from('name_final_runs').select('state, status, result').eq('final_id', finalId).eq('user_id', userId).maybeSingle()
  if (error) throw new Error(error.message)
  return data ? { state: data.state as Tournament, status: data.status, result: data.result as FinalRank[] | null } : null
}

export async function saveRun(finalId: string, userId: string, run: FinalRun): Promise<void> {
  const { error } = await supabase.from('name_final_runs').upsert(
    { final_id: finalId, user_id: userId, state: run.state, status: run.status, result: run.result, updated_at: new Date().toISOString() },
    { onConflict: 'final_id,user_id' },
  )
  if (error) throw new Error(error.message)
}

export async function fetchPartnerDone(finalId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('name_final_partner_done', { p_final_id: finalId })
  if (error) throw new Error(error.message)
  return data === true
}

/** Tomt til begge er ferdige — databasen leverer ikke ut noe før da. */
export async function fetchFinalResults(finalId: string): Promise<Array<{ userId: string; result: FinalRank[] }>> {
  const { data, error } = await supabase.rpc('name_final_results', { p_final_id: finalId })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Array<{ user_id: string; result: FinalRank[] }>).map((r) => ({ userId: r.user_id, result: r.result }))
}

// ── Sanntid: match-visning hos den som stemte først

/** Samme reconnect-mønster som øvrige Realtime-abonnement (se lib/sharedData.ts). */
export function subscribeToNameMatches(partnershipId: string, onChange: () => void): () => void {
  let stopped = false
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let attempt = 0
  let downSince = 0
  let channel: ReturnType<typeof supabase.channel> | null = null

  function connect() {
    channel = supabase
      .channel(`name-matches-${partnershipId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'name_matches', filter: `partnership_id=eq.${partnershipId}` },
        () => onChange())
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          if (attempt > 0) {
            Sentry.addBreadcrumb({ category: 'realtime', level: 'info', message: 'Realtime name-matches gjenopprettet', data: { attempts: attempt, downMs: Date.now() - downSince } })
            onChange() // fang opp matcher vi kan ha gått glipp av mens kanalen var nede
          }
          attempt = 0
          return
        }
        if (status !== 'CHANNEL_ERROR' && status !== 'TIMED_OUT') return
        if (stopped) return
        if (attempt === 0) {
          downSince = Date.now()
          Sentry.captureMessage(`Realtime name-matches ${status} (partnership ${partnershipId})`, 'warning')
        }
        if (channel) supabase.removeChannel(channel)
        attempt += 1
        retryTimer = setTimeout(connect, Math.min(30000, 1000 * 2 ** (attempt - 1)))
      })
  }

  connect()
  return () => {
    stopped = true
    if (retryTimer) clearTimeout(retryTimer)
    if (channel) supabase.removeChannel(channel)
  }
}
