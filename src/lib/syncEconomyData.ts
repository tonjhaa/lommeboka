import { supabase } from './supabase'
import { useEconomyStore } from '@/application/useEconomyStore'

export type SyncStatus = 'idle' | 'saving' | 'saved' | 'error'

// Eksportert signal slik at UI kan abonnere på synkstatus
let _syncListeners: Array<(s: SyncStatus) => void> = []
let _currentStatus: SyncStatus = 'idle'

export function getSyncStatus(): SyncStatus { return _currentStatus }

export function onSyncStatusChange(fn: (s: SyncStatus) => void): () => void {
  _syncListeners.push(fn)
  return () => { _syncListeners = _syncListeners.filter((l) => l !== fn) }
}

function setSyncStatus(s: SyncStatus) {
  _currentStatus = s
  _syncListeners.forEach((l) => l(s))
}

/**
 * Henter økonomidata fra Supabase og laster inn i storen.
 * - Ingen data i Supabase → last opp lokale data
 * - Nettverksfeil → gjør ingenting (behold lokale data)
 */
async function fetchEconomyData(userId: string): Promise<object | null> {
  const { data, error } = await supabase
    .from('user_data')
    .select('economy_data')
    .eq('user_id', userId)
    .single()
  if (error) {
    if (error.code === 'PGRST116') return undefined as unknown as null  // ingen rad ennå
    throw new Error(error.message)
  }
  return data?.economy_data ?? null
}

export async function loadFromSupabase(): Promise<boolean> {
  // Forsikre at auth er klar
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  let economyData: object | null
  try {
    economyData = await fetchEconomyData(user.id)
  } catch (err) {
    // Prøv én gang til etter 2 sekunder (nettverksfeil)
    console.warn('[sync] loadFromSupabase feil, prøver på nytt:', err)
    await new Promise(r => setTimeout(r, 2000))
    try {
      economyData = await fetchEconomyData(user.id)
    } catch (err2) {
      console.error('[sync] Retry feilet:', err2)
      return false
    }
  }

  if (economyData === undefined) {
    // Ingen rad i Supabase ennå — last opp lokale data
    const state = useEconomyStore.getState()
    if (state.profile || state.monthHistory.length > 0) await saveToSupabase()
    return false
  }

  if (!economyData) {
    // Rad finnes men economy_data er null — last opp lokale data
    const state = useEconomyStore.getState()
    if (state.profile || state.monthHistory.length > 0) await saveToSupabase()
    return false
  }

  // Ikke overskriv lokal data med tom Supabase-data
  const remote = economyData as { savingsAccounts?: unknown[]; monthHistory?: unknown[]; debts?: unknown[]; profile?: unknown }
  const remoteIsEmpty = !remote.profile && !(remote.savingsAccounts?.length) && !(remote.monthHistory?.length) && !(remote.debts?.length)
  const localState = useEconomyStore.getState()
  const localHasData = localState.profile !== null || localState.savingsAccounts.length > 0 || localState.monthHistory.length > 0 || localState.debts.length > 0
  if (remoteIsEmpty && localHasData) {
    await saveToSupabase()
    return true
  }

  setImporting(true)
  useEconomyStore.getState().importData(JSON.stringify(economyData))
  setImporting(false)

  // Auto-merk onboarding som fullført hvis brukeren allerede har data (f.eks. ny enhet)
  const storeAfterLoad = useEconomyStore.getState()
  const hasExistingData = storeAfterLoad.savingsAccounts.length > 0 || storeAfterLoad.monthHistory.length > 0 || storeAfterLoad.debts.length > 0 || storeAfterLoad.profile !== null
  if (hasExistingData && !storeAfterLoad.userPreferences?.onboardingCompleted) {
    const prefs = storeAfterLoad.userPreferences
    useEconomyStore.getState().setUserPreferences({
      enabledTabs: prefs?.enabledTabs ?? [],
      payDay: prefs?.payDay,
      birthYear: prefs?.birthYear,
      housingStatus: prefs?.housingStatus,
      onboardingCompleted: true,
    })
  }

  // Migrer eventuelle lokale PDFer til Storage (kjøres om noe mangler)
  let slipMod: typeof import('./slipStorage') | null = null
  try {
    slipMod = await import('./slipStorage')
  } catch {
    // Stale chunk — hopp over PDF-migrering denne gangen
    return true
  }
  const { migrateLocalPDFs } = slipMod
  const store = useEconomyStore.getState()
  await migrateLocalPDFs(store.monthHistory, (year, month, storagePath) => {
    useEconomyStore.setState((s) => ({
      monthHistory: s.monthHistory.map((m) =>
        m.year === year && m.month === month
          ? { ...m, slipStoragePath: storagePath }
          : m
      ),
    }))
  })

  return true
}

/**
 * Lagrer økonomidata til Supabase.
 * Stripper PDF-blobs for å holde payloaden liten.
 * Kaster feil ved lagringsproblem slik at kaller kan vise feedback.
 */
export async function saveToSupabase(): Promise<void> {
  const state = useEconomyStore.getState()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const monthHistoryUtenPDF = state.monthHistory.map(({ slipPdfBase64: _, ...rest }) => rest)

  const payload = {
    profile: state.profile,
    budgetTemplate: state.budgetTemplate,
    monthHistory: monthHistoryUtenPDF,
    atfEntries: state.atfEntries,
    savingsAccounts: state.savingsAccounts,
    savingsGoals: state.savingsGoals,
    debts: state.debts,
    absenceRecords: state.absenceRecords,
    absenceEvents: state.absenceEvents,
    absenceHireDate: state.absenceHireDate,
    taxSettlements: state.taxSettlements,
    subscriptions: state.subscriptions,
    insurances: state.insurances,
    policyRateHistory: state.policyRateHistory,
    temporaryPayEntries: state.temporaryPayEntries,
    lonnsoppgjor: state.lonnsoppgjor,
    ivfTransactions: state.ivfTransactions,
    ivfSettings: state.ivfSettings,
    budgetOverrides: state.budgetOverrides,
    fondPortfolio: state.fondPortfolio,
    userPreferences: state.userPreferences,
    savingsOverrides: state.savingsOverrides,
    partnerVeikart: state.partnerVeikart,
    savingsPlanTarget: state.savingsPlanTarget,
    savingsPlanHorizon: state.savingsPlanHorizon,
    pensionSettings: state.pensionSettings,
  }

  const { error } = await supabase.from('user_data').upsert({
    user_id: user.id,
    economy_data: payload,
    updated_at: new Date().toISOString(),
  })

  if (error) throw new Error(error.message)
}

// Debounce-timer
let saveTimer: ReturnType<typeof setTimeout> | null = null
// Blokker auto-lagring mens importData kjører (hindrer skriving av tom/delvis tilstand)
let isImporting = false

export function setImporting(v: boolean) { isImporting = v }

/**
 * Starter automatisk synkronisering til Supabase ved endringer i storen.
 * Lagrer maks én gang per 3 sekunder. Oppdaterer synkstatus for UI.
 */
export function startAutoSync(): () => void {
  const unsubscribe = useEconomyStore.subscribe(() => {
    if (isImporting) return  // ikke lagre mens vi importerer data
    if (saveTimer) clearTimeout(saveTimer)
    setSyncStatus('saving')
    saveTimer = setTimeout(() => {
      saveToSupabase()
        .then(() => setSyncStatus('saved'))
        .catch(() => setSyncStatus('error'))
    }, 3000)
  })

  return () => {
    unsubscribe()
    if (saveTimer) clearTimeout(saveTimer)
  }
}

