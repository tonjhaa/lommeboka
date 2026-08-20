import { useState, useMemo, useEffect, useRef } from 'react'
import { Plus, Trash2, ExternalLink, ArrowUpDown, ArrowUp, ArrowDown, Search, X, Pencil, Loader2, TrendingDown } from 'lucide-react'
import { useEconomyStore } from '@/application/useEconomyStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

// ─── Types ───────────────────────────────────────────────────────────────────

type ItemStatus = 'kjøpe' | 'bestilt' | 'anskaffet' | 'arv_gave'
type ItemPriority = 'må_ha' | 'bra_å_ha' | 'kan_vente'
type SortKey = 'name' | 'category' | 'priority' | 'status' | 'budgeted' | 'actual'
type SortDir = 'asc' | 'desc'

export interface BabyShoppingItem {
  id: string
  category: string
  name: string
  status: ItemStatus
  priority: ItemPriority
  budgeted: number
  /** Normalpris/ordinær pris før evt. rabatt — brukes til å regne ut hvor mye som er spart på salg */
  fullPrice?: number
  actual: number
  note: string
  storeUrl?: string
  bestPriceNote?: string
  bestPriceUrl?: string
  trackedBestPrice?: number
}

export interface PriceAlert {
  itemId: string
  itemName: string
  oldPrice: number
  newPrice: number
  pctDrop: number
  store: string
  url: string
  detectedAt: number
}

const STATUS_LABELS: Record<ItemStatus, string> = {
  kjøpe: 'Skal kjøpes',
  bestilt: 'Bestilt',
  anskaffet: 'Anskaffet',
  arv_gave: 'Arv/gave',
}
const STATUS_COLORS: Record<ItemStatus, string> = {
  kjøpe: 'text-muted-foreground border-border',
  bestilt: 'text-amber-400 border-amber-500/40',
  anskaffet: 'text-green-400 border-green-500/40',
  arv_gave: 'text-sky-400 border-sky-500/40',
}
const PRIORITY_LABELS: Record<ItemPriority, string> = {
  må_ha: 'Må ha',
  bra_å_ha: 'Bra å ha',
  kan_vente: 'Kan vente',
}
const PRIORITY_BADGE: Record<ItemPriority, string> = {
  må_ha: 'bg-red-500/15 text-red-400 border-red-500/30',
  bra_å_ha: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  kan_vente: 'bg-muted/40 text-muted-foreground border-border',
}

const DEFAULT_CATEGORIES = ['Søvn', 'Stell', 'Ernæring', 'Transport', 'Klær', 'Bad', 'Lek & utvikling', 'Annet']

const INITIAL_ITEMS: Omit<BabyShoppingItem, 'id'>[] = [
  { category: 'Søvn', name: 'Vugge eller seng', status: 'kjøpe', priority: 'må_ha', budgeted: 2000, actual: 0, note: '' },
  { category: 'Søvn', name: 'Madrass', status: 'kjøpe', priority: 'må_ha', budgeted: 800, actual: 0, note: '' },
  { category: 'Søvn', name: 'Sengetøy/sengesett', status: 'kjøpe', priority: 'må_ha', budgeted: 400, actual: 0, note: '' },
  { category: 'Søvn', name: 'Sovepose (0–6 mnd)', status: 'kjøpe', priority: 'må_ha', budgeted: 500, actual: 0, note: '' },
  { category: 'Søvn', name: 'Baby-alarm/monitor', status: 'kjøpe', priority: 'bra_å_ha', budgeted: 1500, actual: 0, note: '' },
  { category: 'Søvn', name: 'Mørkeleggingsgardiner', status: 'kjøpe', priority: 'bra_å_ha', budgeted: 600, actual: 0, note: '' },
  { category: 'Stell', name: 'Stellebord', status: 'kjøpe', priority: 'bra_å_ha', budgeted: 1200, actual: 0, note: '' },
  { category: 'Stell', name: 'Stelleunderlag', status: 'kjøpe', priority: 'må_ha', budgeted: 200, actual: 0, note: '' },
  { category: 'Stell', name: 'Bleier (str. 1 og 2)', status: 'kjøpe', priority: 'må_ha', budgeted: 600, actual: 0, note: '' },
  { category: 'Stell', name: 'Bleierpose/-bøtte', status: 'kjøpe', priority: 'bra_å_ha', budgeted: 400, actual: 0, note: '' },
  { category: 'Stell', name: 'Babykrem/sesamolje', status: 'kjøpe', priority: 'må_ha', budgeted: 200, actual: 0, note: '' },
  { category: 'Stell', name: 'Termometer (øre/panne)', status: 'kjøpe', priority: 'må_ha', budgeted: 300, actual: 0, note: '' },
  { category: 'Stell', name: 'Neglesaks/-fil', status: 'kjøpe', priority: 'må_ha', budgeted: 100, actual: 0, note: '' },
  { category: 'Ernæring', name: 'Brystpumpe', status: 'kjøpe', priority: 'bra_å_ha', budgeted: 2000, actual: 0, note: '' },
  { category: 'Ernæring', name: 'Flasker (2–3 stk)', status: 'kjøpe', priority: 'bra_å_ha', budgeted: 400, actual: 0, note: '' },
  { category: 'Ernæring', name: 'Sterilisator', status: 'kjøpe', priority: 'bra_å_ha', budgeted: 600, actual: 0, note: '' },
  { category: 'Ernæring', name: 'Smokk', status: 'kjøpe', priority: 'kan_vente', budgeted: 150, actual: 0, note: '' },
  { category: 'Ernæring', name: 'Bibs/smekker (5–10 stk)', status: 'kjøpe', priority: 'må_ha', budgeted: 200, actual: 0, note: '' },
  { category: 'Ernæring', name: 'Høystol (fra ~6 mnd)', status: 'kjøpe', priority: 'kan_vente', budgeted: 1500, actual: 0, note: '' },
  { category: 'Transport', name: 'Bilsete (0–13 kg)', status: 'kjøpe', priority: 'må_ha', budgeted: 3000, actual: 0, note: 'Obligatorisk ved hjemreise fra sykehus' },
  { category: 'Transport', name: 'Barnevogn', status: 'kjøpe', priority: 'må_ha', budgeted: 5000, actual: 0, note: '' },
  { category: 'Transport', name: 'Bæresele/bærestol', status: 'kjøpe', priority: 'bra_å_ha', budgeted: 1500, actual: 0, note: '' },
  { category: 'Transport', name: 'Regnslag til vogn', status: 'kjøpe', priority: 'bra_å_ha', budgeted: 400, actual: 0, note: '' },
  { category: 'Klær', name: 'Bodyer 50/56 cm (5–8 stk)', status: 'kjøpe', priority: 'må_ha', budgeted: 600, actual: 0, note: '' },
  { category: 'Klær', name: 'Sparkebukser/onesies (5–8 stk)', status: 'kjøpe', priority: 'må_ha', budgeted: 600, actual: 0, note: '' },
  { category: 'Klær', name: 'Luer (2 stk)', status: 'kjøpe', priority: 'må_ha', budgeted: 200, actual: 0, note: '' },
  { category: 'Klær', name: 'Votter (2–3 par)', status: 'kjøpe', priority: 'bra_å_ha', budgeted: 150, actual: 0, note: '' },
  { category: 'Klær', name: 'Ytterdrakt/overall', status: 'kjøpe', priority: 'bra_å_ha', budgeted: 800, actual: 0, note: '' },
  { category: 'Bad', name: 'Babybadekar', status: 'kjøpe', priority: 'bra_å_ha', budgeted: 600, actual: 0, note: '' },
  { category: 'Bad', name: 'Badetermometer', status: 'kjøpe', priority: 'bra_å_ha', budgeted: 150, actual: 0, note: '' },
  { category: 'Bad', name: 'Mild babysåpe/shampoo', status: 'kjøpe', priority: 'må_ha', budgeted: 150, actual: 0, note: '' },
  { category: 'Bad', name: 'Myke badehåndklær (2–3 stk)', status: 'kjøpe', priority: 'må_ha', budgeted: 400, actual: 0, note: '' },
  { category: 'Lek & utvikling', name: 'Gymstativ med hengere', status: 'kjøpe', priority: 'bra_å_ha', budgeted: 600, actual: 0, note: '' },
  { category: 'Lek & utvikling', name: 'Leke-/aktivitetsteppe', status: 'kjøpe', priority: 'bra_å_ha', budgeted: 400, actual: 0, note: '' },
  { category: 'Lek & utvikling', name: 'Rasler/grep-leker (0–6 mnd)', status: 'kjøpe', priority: 'kan_vente', budgeted: 200, actual: 0, note: '' },
  { category: 'Lek & utvikling', name: 'Mobil over seng', status: 'kjøpe', priority: 'kan_vente', budgeted: 400, actual: 0, note: '' },
]

function fmtNOK(n: number) { return n > 0 ? n.toLocaleString('no-NO') + ' kr' : '—' }
function newId() { return crypto.randomUUID() }

/** Hvor mye spart på salg — kun meningsfullt når fullpris og faktisk betalt begge er satt, og fullpris er høyest */
function saved(item: BabyShoppingItem): number {
  const full = item.fullPrice ?? 0
  const actual = item.actual ?? 0
  return full > 0 && actual > 0 && full > actual ? full - actual : 0
}

const EMPTY_ITEM = (): Omit<BabyShoppingItem, 'id'> => ({
  category: 'Annet', name: '', status: 'kjøpe', priority: 'bra_å_ha',
  budgeted: 0, fullPrice: 0, actual: 0, note: '', storeUrl: '', bestPriceNote: '',
})

// ─── Store hook ───────────────────────────────────────────────────────────────

function useBabyShopping() {
  const items = useEconomyStore((s) => s.babyShoppingItems ?? []) as BabyShoppingItem[]
  const setItems = useEconomyStore((s) => s.setBabyShoppingItems)
  const priceAlerts = useEconomyStore((s) => s.priceAlerts ?? []) as PriceAlert[]
  const addPriceAlerts = useEconomyStore((s) => s.addPriceAlerts)
  const dismissPriceAlert = useEconomyStore((s) => s.dismissPriceAlert)
  const lastGlobalPriceCheckAt = useEconomyStore((s) => s.lastGlobalPriceCheckAt ?? 0)
  const setLastGlobalPriceCheckAt = useEconomyStore((s) => s.setLastGlobalPriceCheckAt)
  return {
    items, priceAlerts, lastGlobalPriceCheckAt,
    addPriceAlerts, dismissPriceAlert, setLastGlobalPriceCheckAt,
    init: () => setItems(INITIAL_ITEMS.map(i => ({ ...i, id: newId() }))),
    save: (item: BabyShoppingItem) => {
      const exists = items.some(i => i.id === item.id)
      setItems(exists ? items.map(i => i.id === item.id ? item : i) : [...items, item])
    },
    remove: (id: string) => setItems(items.filter(i => i.id !== id)),
    toggleDone: (id: string) => setItems(items.map(i => i.id === id
      ? { ...i, status: (i.status === 'anskaffet' || i.status === 'arv_gave') ? 'kjøpe' : 'anskaffet' }
      : i)),
    setStatus: (id: string, status: ItemStatus) => setItems(items.map(i => i.id === id ? { ...i, status } : i)),
    updateTrackedPrice: (id: string, price: number) =>
      setItems(items.map(i => i.id === id ? { ...i, trackedBestPrice: price } : i)),
  }
}

const CHECK_INTERVAL_MS = 20 * 60 * 60 * 1000 // 20 hours
const MAX_ITEMS_PER_CHECK = 12
const DELAY_BETWEEN_MS = 2500

function usePriceChecker(
  items: BabyShoppingItem[],
  lastCheckAt: number,
  onAlerts: (alerts: PriceAlert[]) => void,
  onTrack: (id: string, price: number) => void,
  onDone: (ts: number) => void,
) {
  const [checking, setChecking] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const abortRef = useRef(false)

  useEffect(() => {
    if (Date.now() - lastCheckAt < CHECK_INTERVAL_MS) return
    const candidates = items
      .filter(i => i.name && i.status !== 'anskaffet' && i.status !== 'arv_gave')
      .sort((a, b) => b.budgeted - a.budgeted)
      .slice(0, MAX_ITEMS_PER_CHECK)
    if (candidates.length === 0) return

    abortRef.current = false
    setChecking(true)
    setProgress({ done: 0, total: candidates.length })
    const newAlerts: PriceAlert[] = []

    ;(async () => {
      for (let i = 0; i < candidates.length; i++) {
        if (abortRef.current) break
        const item = candidates[i]
        try {
          const params = new URLSearchParams({ name: item.name })
          if (item.storeUrl) params.set('storeUrl', item.storeUrl)
          const res = await fetch(`/api/find-best-price?${params}`)
          const data = await res.json()
          const results: { store: string; price: number; url: string }[] = data.results ?? []
          const best = results.find(r => r.price > 0)
          if (best) {
            onTrack(item.id, best.price)
            const prev = item.trackedBestPrice
            if (prev && prev > 0 && best.price < prev) {
              const pctDrop = Math.round((1 - best.price / prev) * 100)
              if (pctDrop >= 3) {
                newAlerts.push({
                  itemId: item.id,
                  itemName: item.name,
                  oldPrice: prev,
                  newPrice: best.price,
                  pctDrop,
                  store: best.store,
                  url: best.url,
                  detectedAt: Date.now(),
                })
              }
            }
          }
        } catch { /* skip item */ }
        setProgress({ done: i + 1, total: candidates.length })
        if (i < candidates.length - 1) await new Promise(r => setTimeout(r, DELAY_BETWEEN_MS))
      }
      if (newAlerts.length) onAlerts(newAlerts)
      onDone(Date.now())
      setChecking(false)
    })()

    return () => { abortRef.current = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // run once on mount

  return { checking, progress }
}

// ─── Main component ───────────────────────────────────────────────────────────

export function BabyShoppingPage() {
  const { items, priceAlerts, lastGlobalPriceCheckAt, addPriceAlerts, dismissPriceAlert,
          setLastGlobalPriceCheckAt, init, save, remove, toggleDone, setStatus, updateTrackedPrice } = useBabyShopping()

  const { checking, progress } = usePriceChecker(
    items, lastGlobalPriceCheckAt,
    addPriceAlerts, updateTrackedPrice, setLastGlobalPriceCheckAt,
  )
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('category')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [editing, setEditing] = useState<BabyShoppingItem | null>(null)
  const [isNew, setIsNew] = useState(false)

  const categories = useMemo(() => Array.from(new Set([...DEFAULT_CATEGORIES, ...items.map(i => i.category)])).sort(), [items])

  const filtered = useMemo(() => {
    let list = [...items]
    if (search) list = list.filter(i =>
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      i.category.toLowerCase().includes(search.toLowerCase()) ||
      (i.bestPriceNote ?? '').toLowerCase().includes(search.toLowerCase())
    )
    if (filterCategory) list = list.filter(i => i.category === filterCategory)
    if (filterStatus) list = list.filter(i => i.status === filterStatus)
    if (filterPriority) list = list.filter(i => i.priority === filterPriority)
    list.sort((a, b) => {
      const priorityOrder = { må_ha: 0, bra_å_ha: 1, kan_vente: 2 }
      let va: string | number = '', vb: string | number = ''
      if (sortKey === 'name') { va = a.name; vb = b.name }
      else if (sortKey === 'category') { va = a.category; vb = b.category }
      else if (sortKey === 'priority') { va = priorityOrder[a.priority]; vb = priorityOrder[b.priority] }
      else if (sortKey === 'status') { va = a.status; vb = b.status }
      else if (sortKey === 'budgeted') { va = a.budgeted; vb = b.budgeted }
      else if (sortKey === 'actual') { va = a.actual; vb = b.actual }
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return list
  }, [items, search, filterCategory, filterStatus, filterPriority, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  function openNew() {
    setEditing({ ...EMPTY_ITEM(), id: newId() })
    setIsNew(true)
  }
  function openEdit(item: BabyShoppingItem) {
    setEditing({ ...item })
    setIsNew(false)
  }
  function closeDialog() { setEditing(null) }
  function handleSave(item: BabyShoppingItem) { save(item); setEditing(null) }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-sm text-muted-foreground">Ingen innkjøpsliste ennå.</p>
        <Button onClick={init}>Last inn standardliste</Button>
      </div>
    )
  }

  const totalBudgeted = items.reduce((s, i) => s + i.budgeted, 0)
  const totalActual = items.reduce((s, i) => s + i.actual, 0)
  const totalSaved = items.reduce((s, i) => s + saved(i), 0)
  const done = items.filter(i => i.status === 'anskaffet' || i.status === 'arv_gave').length
  const remaining = items.filter(i => i.status === 'kjøpe' || i.status === 'bestilt').reduce((s, i) => s + i.budgeted, 0)

  return (
    <div className="h-full flex flex-col overflow-hidden">

      {/* Dialog */}
      {editing && (
        <ItemDialog
          item={editing}
          isNew={isNew}
          categories={categories}
          onSave={handleSave}
          onClose={closeDialog}
          onDelete={isNew ? undefined : () => { remove(editing.id); closeDialog() }}
        />
      )}

      {/* Oversikt */}
      <div className="px-5 pt-4 pb-3 grid grid-cols-2 sm:grid-cols-5 gap-3 shrink-0">
        <div className="rounded-lg border border-border bg-card px-4 py-3">
          <p className="text-[11px] text-muted-foreground mb-0.5">Fullført</p>
          <p className="text-base font-semibold">{done} / {items.length}</p>
          <div className="mt-1 h-1 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${Math.round(done / items.length * 100)}%` }} />
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card px-4 py-3">
          <p className="text-[11px] text-muted-foreground mb-0.5">Budsjettert totalt</p>
          <p className="text-base font-semibold font-mono">{fmtNOK(totalBudgeted)}</p>
        </div>
        <div className="rounded-lg border border-border bg-card px-4 py-3">
          <p className="text-[11px] text-muted-foreground mb-0.5">Faktisk betalt</p>
          <p className="text-base font-semibold font-mono">{fmtNOK(totalActual)}</p>
        </div>
        <div className="rounded-lg border border-border bg-card px-4 py-3">
          <p className="text-[11px] text-muted-foreground mb-0.5">Spart på salg</p>
          <p className={cn('text-base font-semibold font-mono', totalSaved > 0 && 'text-green-400')}>{fmtNOK(totalSaved)}</p>
        </div>
        <div className="rounded-lg border border-border bg-card px-4 py-3">
          <p className="text-[11px] text-muted-foreground mb-0.5">Gjenstår å kjøpe</p>
          <p className="text-base font-semibold font-mono text-amber-400">{fmtNOK(remaining)}</p>
        </div>
      </div>

      {/* Prisnedgang-varsler */}
      {priceAlerts.length > 0 && (
        <div className="mx-5 mb-2 rounded-lg border border-green-500/30 bg-green-500/8 overflow-hidden shrink-0">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-green-500/20">
            <TrendingDown className="h-3.5 w-3.5 text-green-400" />
            <span className="text-xs font-medium text-green-400">{priceAlerts.length} prisnedgang{priceAlerts.length > 1 ? 'er' : ''} oppdaget</span>
          </div>
          {priceAlerts.map(alert => (
            <div key={alert.itemId} className="flex items-center gap-3 px-3 py-2 border-b border-green-500/10 last:border-0">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{alert.itemName}</p>
                <p className="text-[11px] text-muted-foreground">
                  {alert.oldPrice.toLocaleString('no-NO')} kr → <span className="text-green-400 font-medium">{alert.newPrice.toLocaleString('no-NO')} kr</span>
                  {' '}(−{alert.pctDrop}%) hos {alert.store}
                </p>
              </div>
              {alert.url && /^https?:\/\//i.test(alert.url) && (
                <a href={alert.url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-[11px] text-primary hover:underline flex items-center gap-1">
                  <ExternalLink className="h-3 w-3" /> Kjøp
                </a>
              )}
              <button onClick={() => dismissPriceAlert(alert.itemId)} className="shrink-0 text-muted-foreground hover:text-foreground p-0.5">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Prissjekk-status */}
      {checking && (
        <div className="mx-5 mb-2 flex items-center gap-2 text-[11px] text-muted-foreground shrink-0">
          <Loader2 className="h-3 w-3 animate-spin" />
          Sjekker priser... ({progress.done}/{progress.total})
        </div>
      )}

      {/* Filter-rad */}
      <div className="px-5 pb-3 flex flex-wrap items-center gap-2 shrink-0">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Søk produkt, kategori, butikk..." className="h-8 text-xs pl-8" />
          {search && <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>}
        </div>
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-xs text-muted-foreground">
          <option value="">Alle kategorier</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-xs text-muted-foreground">
          <option value="">Alle statuser</option>
          {(Object.keys(STATUS_LABELS) as ItemStatus[]).map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-xs text-muted-foreground">
          <option value="">Alle prioriteter</option>
          {(Object.keys(PRIORITY_LABELS) as ItemPriority[]).map(p => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
        </select>
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} produkter</span>
        <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={openNew}>
          <Plus className="h-3.5 w-3.5" /> Legg til produkt
        </Button>
      </div>

      {/* Tabell */}
      <div className="flex-1 overflow-auto px-5 pb-4">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 z-10 bg-background border-b border-border">
            <tr>
              <th className="w-7 py-2 pr-1" />
              <Th k="name" label="Produkt" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <Th k="category" label="Kategori" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <Th k="priority" label="Prioritet" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <Th k="status" label="Status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <th className="py-2 px-3 text-left font-medium text-muted-foreground">Nettbutikk</th>
              <th className="py-2 px-3 text-left font-medium text-muted-foreground">Beste pris / butikk</th>
              <Th k="budgeted" label="Budsjett" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} right />
              <Th k="actual" label="Faktisk" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} right />
              <th className="w-16 py-2" />
            </tr>
          </thead>
          <tbody>
            {filtered.map(item => {
              const isDone = item.status === 'anskaffet' || item.status === 'arv_gave'
              let hostname = ''
              if (item.storeUrl) { try { hostname = new URL(item.storeUrl).hostname.replace('www.', '') } catch { hostname = item.storeUrl } }
              return (
                <tr key={item.id} className={cn('border-b border-border/40 group hover:bg-muted/10 transition-colors cursor-pointer', isDone && 'opacity-50')}>
                  <td className="py-2 pr-1" onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={isDone} onChange={() => toggleDone(item.id)} className="h-3.5 w-3.5 accent-green-500" />
                  </td>
                  <td className="py-2 px-3" onClick={() => openEdit(item)}>
                    <span className={cn('font-medium', isDone && 'line-through')}>{item.name || <span className="text-muted-foreground italic">Uten navn</span>}</span>
                    {item.note && <p className="text-[10px] text-muted-foreground mt-0.5">{item.note}</p>}
                  </td>
                  <td className="py-2 px-3 text-muted-foreground" onClick={() => openEdit(item)}>{item.category}</td>
                  <td className="py-2 px-3" onClick={() => openEdit(item)}>
                    <span className={cn('inline-block rounded border px-1.5 py-0.5 text-[10px] font-medium', PRIORITY_BADGE[item.priority])}>
                      {PRIORITY_LABELS[item.priority]}
                    </span>
                  </td>
                  <td className="py-2 px-3" onClick={e => e.stopPropagation()}>
                    <select
                      value={item.status}
                      onChange={e => setStatus(item.id, e.target.value as ItemStatus)}
                      className={cn('h-6 rounded border bg-background px-1.5 text-[11px] cursor-pointer', STATUS_COLORS[item.status])}
                    >
                      {(Object.keys(STATUS_LABELS) as ItemStatus[]).map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                    </select>
                  </td>
                  <td className="py-2 px-3" onClick={() => openEdit(item)}>
                    {hostname ? (
                      <a href={item.storeUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="flex items-center gap-1 text-primary hover:underline max-w-[120px]">
                        <ExternalLink className="h-3 w-3 shrink-0" />
                        <span className="truncate text-[11px]">{hostname}</span>
                      </a>
                    ) : <span className="text-muted-foreground/40 text-[11px]">—</span>}
                  </td>
                  <td className="py-2 px-3 text-[11px] text-muted-foreground max-w-[140px]" onClick={() => openEdit(item)}>
                    {item.bestPriceNote
                      ? (item.bestPriceUrl && /^https?:\/\//i.test(item.bestPriceUrl))
                        ? <a href={item.bestPriceUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="flex items-center gap-1 text-primary hover:underline truncate"><ExternalLink className="h-3 w-3 shrink-0" /><span className="truncate">{item.bestPriceNote}</span></a>
                        : <span className="truncate block">{item.bestPriceNote}</span>
                      : <span className="opacity-30">—</span>}
                  </td>
                  <td className="py-2 px-3 text-right font-mono" onClick={() => openEdit(item)}>{fmtNOK(item.budgeted)}</td>
                  <td className={cn('py-2 px-3 text-right font-mono', item.actual > 0 && 'text-green-400')} onClick={() => openEdit(item)}>
                    {fmtNOK(item.actual)}
                    {saved(item) > 0 && (
                      <p className="text-[10px] text-green-400/80 font-normal">spart {fmtNOK(saved(item))}</p>
                    )}
                  </td>
                  <td className="py-2 pl-1">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openEdit(item)} className="text-muted-foreground hover:text-foreground p-1"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={() => remove(item.id)} className="text-muted-foreground hover:text-red-400 p-1"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="text-center text-muted-foreground text-xs py-8">Ingen produkter matcher filteret.</p>
        )}
      </div>
    </div>
  )
}

// ─── Sort header ──────────────────────────────────────────────────────────────

function Th({ k, label, sortKey, sortDir, onSort, right }: {
  k: SortKey; label: string; sortKey: SortKey; sortDir: SortDir; onSort: (k: SortKey) => void; right?: boolean
}) {
  const active = sortKey === k
  return (
    <th className={cn('py-2 px-3 font-medium text-muted-foreground whitespace-nowrap', right ? 'text-right' : 'text-left')}>
      <button onClick={() => onSort(k)} className={cn('flex items-center gap-1 hover:text-foreground transition-colors', right && 'ml-auto', active && 'text-foreground')}>
        {label}
        {active
          ? sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
          : <ArrowUpDown className="h-3 w-3 opacity-40" />}
      </button>
    </th>
  )
}

// ─── Add / Edit dialog ────────────────────────────────────────────────────────

function ItemDialog({ item, isNew, categories, onSave, onClose, onDelete }: {
  item: BabyShoppingItem
  isNew: boolean
  categories: string[]
  onSave: (item: BabyShoppingItem) => void
  onClose: () => void
  onDelete?: () => void
}) {
  const [form, setForm] = useState<BabyShoppingItem>(item)
  const [scraping, setScraping] = useState(false)
  const [scrapeError, setScrapeError] = useState('')
  const [findingPrice, setFindingPrice] = useState(false)
  const [priceResults, setPriceResults] = useState<{ store: string; price: number; url: string }[]>([])
  const [searchLinks, setSearchLinks] = useState<{ store: string; price: number; url: string }[]>([])

  useEffect(() => { setForm(item) }, [item])

  function set(patch: Partial<BabyShoppingItem>) { setForm(f => ({ ...f, ...patch })) }

  function safeHttpUrl(u: string): string {
    try {
      const p = new URL(u)
      return (p.protocol === 'https:' || p.protocol === 'http:') ? p.href : ''
    } catch { return '' }
  }

  async function scrapeUrl(url: string) {
    if (!url) return
    let validUrl: string
    try { validUrl = new URL(url).href } catch { return }
    setScraping(true)
    setScrapeError('')
    try {
      const res = await fetch(`/api/scrape-product?url=${encodeURIComponent(validUrl)}`)
      const data = await res.json()
      if (data.error) { setScrapeError('Kunne ikke hente produktinfo'); return }
      const patch: Partial<BabyShoppingItem> = {}
      if (data.name) patch.name = data.name.replace(/\s*[-|–]\s*.+$/, '').trim()
      if (data.price) patch.budgeted = data.price
      if (data.category) patch.category = data.category
      setForm(f => ({ ...f, ...patch }))
      if (!data.name && !data.price) setScrapeError('Fant ikke produktinfo på siden')
    } catch {
      setScrapeError('Nettverksfeil — prøv igjen')
    } finally {
      setScraping(false)
    }
  }

  async function findBestPrice() {
    if (!form.name) return
    setFindingPrice(true)
    setPriceResults([])
    setSearchLinks([])
    try {
      const params = new URLSearchParams({ name: form.name })
      if (form.storeUrl) params.set('storeUrl', form.storeUrl)
      const res = await fetch(`/api/find-best-price?${params}`)
      const data = await res.json()
      setPriceResults(data.results ?? [])
      setSearchLinks(data.searchLinks ?? [])
    } catch {
      setSearchLinks([])
    } finally {
      setFindingPrice(false)
    }
  }

  function pickPrice(r: { store: string; price: number; url: string }) {
    const note = r.price > 0 ? `${r.price.toLocaleString('no-NO')} kr – ${r.store}` : r.store
    set({ bestPriceNote: note, bestPriceUrl: safeHttpUrl(r.url) })
    setPriceResults([])
  }

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm">{isNew ? 'Legg til produkt' : 'Rediger produkt'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* URL */}
          <div className="space-y-1.5">
            <Label className="text-xs">Nettbutikk-lenke</Label>
            <div className="flex gap-2">
              <Input
                value={form.storeUrl ?? ''}
                onChange={e => set({ storeUrl: e.target.value })}
                placeholder="https://www.barnashus.no/..."
                className="text-xs h-8 flex-1"
              />
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs shrink-0"
                disabled={scraping || !form.storeUrl}
                onClick={() => scrapeUrl(form.storeUrl ?? '')}
              >
                {scraping ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Hent info'}
              </Button>
            </div>
            {scrapeError && <p className="text-[11px] text-red-400">{scrapeError}</p>}
            {scraping && <p className="text-[11px] text-muted-foreground">Henter produktnavn og pris fra siden...</p>}
          </div>

          {/* Navn */}
          <div className="space-y-1.5">
            <Label className="text-xs">Produktnavn</Label>
            <Input value={form.name} onChange={e => set({ name: e.target.value })} placeholder="f.eks. Bugaboo Fox 5" className="text-xs h-8" />
          </div>

          {/* Kategori + Prioritet */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Kategori</Label>
              <select value={form.category} onChange={e => set({ category: e.target.value })} className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs">
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Prioritet</Label>
              <select value={form.priority} onChange={e => set({ priority: e.target.value as ItemPriority })} className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs">
                {(Object.keys(PRIORITY_LABELS) as ItemPriority[]).map(p => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
              </select>
            </div>
          </div>

          {/* Status */}
          <div className="space-y-1.5">
            <Label className="text-xs">Status</Label>
            <select value={form.status} onChange={e => set({ status: e.target.value as ItemStatus })} className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs">
              {(Object.keys(STATUS_LABELS) as ItemStatus[]).map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
          </div>

          {/* Beste pris */}
          <div className="space-y-1.5">
            <Label className="text-xs">Beste pris / butikk</Label>
            <div className="flex gap-2">
              {form.bestPriceNote ? (
                <div className="flex-1 flex items-center gap-2 rounded-md border border-input bg-muted/30 px-3 h-8 text-xs">
                  {form.bestPriceUrl
                    ? <a href={safeHttpUrl(form.bestPriceUrl ?? '')} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate flex items-center gap-1"><ExternalLink className="h-3 w-3 shrink-0" />{form.bestPriceNote}</a>
                    : <span className="truncate">{form.bestPriceNote}</span>}
                  <button onClick={() => set({ bestPriceNote: '', bestPriceUrl: '' })} className="ml-auto text-muted-foreground hover:text-foreground shrink-0"><X className="h-3 w-3" /></button>
                </div>
              ) : (
                <span className="flex-1 flex items-center text-xs text-muted-foreground italic">Ikke funnet ennå</span>
              )}
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs shrink-0 gap-1.5"
                disabled={findingPrice || !form.name}
                onClick={findBestPrice}
              >
                {findingPrice ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                Finn beste pris
              </Button>
            </div>
            {findingPrice && <p className="text-[11px] text-muted-foreground">Henter nåværende pris...</p>}
            {/* Current price from saved store URL */}
            {priceResults.length > 0 && (
              <div className="rounded-md border border-border divide-y divide-border overflow-hidden">
                <p className="px-3 py-1.5 text-[10px] font-medium text-muted-foreground bg-muted/20 uppercase tracking-wide">Nåværende pris</p>
                {priceResults.map((r, i) => (
                  <button key={i} onClick={() => pickPrice(r)} className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-muted/40 transition-colors text-left">
                    <span className="text-foreground">{r.store}</span>
                    <span className="font-mono font-medium text-primary ml-4 shrink-0">{r.price > 0 ? `${r.price.toLocaleString('no-NO')} kr` : 'Se pris'}</span>
                  </button>
                ))}
              </div>
            )}
            {/* Search links for manual price comparison */}
            {searchLinks.length > 0 && (
              <div className="rounded-md border border-border overflow-hidden">
                <p className="px-3 py-1.5 text-[10px] font-medium text-muted-foreground bg-muted/20 uppercase tracking-wide">Sammenlign selv</p>
                <div className="divide-y divide-border/50">
                  {searchLinks.map((r, i) => (
                    <a key={i} href={r.url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-between px-3 py-2 text-xs hover:bg-muted/40 transition-colors">
                      <span className="text-foreground">{r.store}</span>
                      <ExternalLink className="h-3 w-3 text-muted-foreground" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Budsjett + Fullpris + Faktisk */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Budsjettert pris (kr)</Label>
              <Input type="number" value={form.budgeted || ''} onChange={e => set({ budgeted: parseInt(e.target.value) || 0 })} placeholder="0" className="text-xs h-8 font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Fullpris (kr)</Label>
              <Input type="number" value={form.fullPrice || ''} onChange={e => set({ fullPrice: parseInt(e.target.value) || 0 })} placeholder="0" className="text-xs h-8 font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Faktisk betalt (kr)</Label>
              <Input type="number" value={form.actual || ''} onChange={e => set({ actual: parseInt(e.target.value) || 0 })} placeholder="0" className="text-xs h-8 font-mono" />
            </div>
          </div>
          {saved(form) > 0 && (
            <p className="text-[11px] text-green-400">
              Du sparer {fmtNOK(saved(form))} ({Math.round((saved(form) / (form.fullPrice ?? 1)) * 100)}%) sammenlignet med fullpris.
            </p>
          )}

          {/* Merknad */}
          <div className="space-y-1.5">
            <Label className="text-xs">Merknad</Label>
            <Input value={form.note} onChange={e => set({ note: e.target.value })} placeholder="Valgfri merknad..." className="text-xs h-8" />
          </div>
        </div>

        <div className="flex items-center gap-2 pt-2 border-t border-border">
          {onDelete && (
            <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-300 mr-auto text-xs" onClick={onDelete}>
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Slett
            </Button>
          )}
          <Button variant="outline" size="sm" className="text-xs" onClick={onClose}>Avbryt</Button>
          <Button size="sm" className="text-xs" onClick={() => onSave(form)} disabled={!form.name}>Lagre</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
