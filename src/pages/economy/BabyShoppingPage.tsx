import { useState, useMemo } from 'react'
import { Plus, Trash2, ExternalLink, ArrowUpDown, ArrowUp, ArrowDown, Search, X } from 'lucide-react'
import { useEconomyStore } from '@/application/useEconomyStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  actual: number
  note: string
  storeUrl?: string
  bestPriceNote?: string
}

const STATUS_LABELS: Record<ItemStatus, string> = {
  kjøpe: 'Skal kjøpes',
  bestilt: 'Bestilt',
  anskaffet: 'Anskaffet',
  arv_gave: 'Arv/gave',
}
const STATUS_COLORS: Record<ItemStatus, string> = {
  kjøpe: 'text-muted-foreground',
  bestilt: 'text-amber-400',
  anskaffet: 'text-green-400',
  arv_gave: 'text-sky-400',
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

const DEFAULT_CATEGORIES: { name: string; items: Omit<BabyShoppingItem, 'id'>[] }[] = [
  { name: 'Søvn', items: [
    { category: 'Søvn', name: 'Vugge eller seng', status: 'kjøpe', priority: 'må_ha', budgeted: 2000, actual: 0, note: '' },
    { category: 'Søvn', name: 'Madrass', status: 'kjøpe', priority: 'må_ha', budgeted: 800, actual: 0, note: '' },
    { category: 'Søvn', name: 'Sengetøy/sengesett', status: 'kjøpe', priority: 'må_ha', budgeted: 400, actual: 0, note: '' },
    { category: 'Søvn', name: 'Sovepose (0–6 mnd)', status: 'kjøpe', priority: 'må_ha', budgeted: 500, actual: 0, note: '' },
    { category: 'Søvn', name: 'Baby-alarm/monitor', status: 'kjøpe', priority: 'bra_å_ha', budgeted: 1500, actual: 0, note: '' },
    { category: 'Søvn', name: 'Mørkeleggingsgardiner', status: 'kjøpe', priority: 'bra_å_ha', budgeted: 600, actual: 0, note: '' },
  ]},
  { name: 'Stell', items: [
    { category: 'Stell', name: 'Stellebord', status: 'kjøpe', priority: 'bra_å_ha', budgeted: 1200, actual: 0, note: '' },
    { category: 'Stell', name: 'Stelleunderlag', status: 'kjøpe', priority: 'må_ha', budgeted: 200, actual: 0, note: '' },
    { category: 'Stell', name: 'Bleier (str. 1 og 2)', status: 'kjøpe', priority: 'må_ha', budgeted: 600, actual: 0, note: '' },
    { category: 'Stell', name: 'Bleierpose/-bøtte', status: 'kjøpe', priority: 'bra_å_ha', budgeted: 400, actual: 0, note: '' },
    { category: 'Stell', name: 'Babykrem/sesamolje', status: 'kjøpe', priority: 'må_ha', budgeted: 200, actual: 0, note: '' },
    { category: 'Stell', name: 'Termometer (øre/panne)', status: 'kjøpe', priority: 'må_ha', budgeted: 300, actual: 0, note: '' },
    { category: 'Stell', name: 'Neglesaks/-fil', status: 'kjøpe', priority: 'må_ha', budgeted: 100, actual: 0, note: '' },
  ]},
  { name: 'Ernæring', items: [
    { category: 'Ernæring', name: 'Brystpumpe', status: 'kjøpe', priority: 'bra_å_ha', budgeted: 2000, actual: 0, note: '' },
    { category: 'Ernæring', name: 'Flasker (2–3 stk)', status: 'kjøpe', priority: 'bra_å_ha', budgeted: 400, actual: 0, note: '' },
    { category: 'Ernæring', name: 'Sterilisator', status: 'kjøpe', priority: 'bra_å_ha', budgeted: 600, actual: 0, note: '' },
    { category: 'Ernæring', name: 'Smokk', status: 'kjøpe', priority: 'kan_vente', budgeted: 150, actual: 0, note: '' },
    { category: 'Ernæring', name: 'Bibs/smekker (5–10 stk)', status: 'kjøpe', priority: 'må_ha', budgeted: 200, actual: 0, note: '' },
    { category: 'Ernæring', name: 'Høystol (fra ~6 mnd)', status: 'kjøpe', priority: 'kan_vente', budgeted: 1500, actual: 0, note: '' },
  ]},
  { name: 'Transport', items: [
    { category: 'Transport', name: 'Bilsete (0–13 kg)', status: 'kjøpe', priority: 'må_ha', budgeted: 3000, actual: 0, note: 'Obligatorisk ved hjemreise fra sykehus' },
    { category: 'Transport', name: 'Barnevogn', status: 'kjøpe', priority: 'må_ha', budgeted: 5000, actual: 0, note: '' },
    { category: 'Transport', name: 'Bæresele/bærestol', status: 'kjøpe', priority: 'bra_å_ha', budgeted: 1500, actual: 0, note: '' },
    { category: 'Transport', name: 'Regnslag til vogn', status: 'kjøpe', priority: 'bra_å_ha', budgeted: 400, actual: 0, note: '' },
  ]},
  { name: 'Klær', items: [
    { category: 'Klær', name: 'Bodyer 50/56 cm (5–8 stk)', status: 'kjøpe', priority: 'må_ha', budgeted: 600, actual: 0, note: '' },
    { category: 'Klær', name: 'Sparkebukser/onesies (5–8 stk)', status: 'kjøpe', priority: 'må_ha', budgeted: 600, actual: 0, note: '' },
    { category: 'Klær', name: 'Luer (2 stk)', status: 'kjøpe', priority: 'må_ha', budgeted: 200, actual: 0, note: '' },
    { category: 'Klær', name: 'Votter (2–3 par)', status: 'kjøpe', priority: 'bra_å_ha', budgeted: 150, actual: 0, note: '' },
    { category: 'Klær', name: 'Ytterdrakt/overall', status: 'kjøpe', priority: 'bra_å_ha', budgeted: 800, actual: 0, note: '' },
  ]},
  { name: 'Bad', items: [
    { category: 'Bad', name: 'Babybadekar', status: 'kjøpe', priority: 'bra_å_ha', budgeted: 600, actual: 0, note: '' },
    { category: 'Bad', name: 'Badetermometer', status: 'kjøpe', priority: 'bra_å_ha', budgeted: 150, actual: 0, note: '' },
    { category: 'Bad', name: 'Mild babysåpe/shampoo', status: 'kjøpe', priority: 'må_ha', budgeted: 150, actual: 0, note: '' },
    { category: 'Bad', name: 'Myke badehåndklær (2–3 stk)', status: 'kjøpe', priority: 'må_ha', budgeted: 400, actual: 0, note: '' },
  ]},
  { name: 'Lek & utvikling', items: [
    { category: 'Lek & utvikling', name: 'Gymstativ med hengere', status: 'kjøpe', priority: 'bra_å_ha', budgeted: 600, actual: 0, note: '' },
    { category: 'Lek & utvikling', name: 'Leke-/aktivitetsteppe', status: 'kjøpe', priority: 'bra_å_ha', budgeted: 400, actual: 0, note: '' },
    { category: 'Lek & utvikling', name: 'Rasler/grep-leker (0–6 mnd)', status: 'kjøpe', priority: 'kan_vente', budgeted: 200, actual: 0, note: '' },
    { category: 'Lek & utvikling', name: 'Mobil over seng', status: 'kjøpe', priority: 'kan_vente', budgeted: 400, actual: 0, note: '' },
  ]},
]

function fmtNOK(n: number) { return n > 0 ? n.toLocaleString('no-NO') + ' kr' : '—' }
function newId() { return crypto.randomUUID() }

// ─── Store hook ───────────────────────────────────────────────────────────────

function useBabyShopping() {
  const items = useEconomyStore((s) => s.babyShoppingItems ?? []) as BabyShoppingItem[]
  const setBabyItems = useEconomyStore((s) => s.setBabyShoppingItems)

  function init() {
    setBabyItems(DEFAULT_CATEGORIES.flatMap(cat => cat.items.map(i => ({ ...i, id: newId() }))))
  }
  function update(id: string, patch: Partial<BabyShoppingItem>) {
    setBabyItems(items.map(i => i.id === id ? { ...i, ...patch } : i))
  }
  function remove(id: string) {
    setBabyItems(items.filter(i => i.id !== id))
  }
  function add() {
    setBabyItems([...items, { id: newId(), category: 'Annet', name: '', status: 'kjøpe', priority: 'bra_å_ha', budgeted: 0, actual: 0, note: '' }])
  }

  return { items, init, update, remove, add }
}

// ─── Main component ───────────────────────────────────────────────────────────

export function BabyShoppingPage() {
  const { items, init, update, remove, add } = useBabyShopping()
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('category')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [editingUrl, setEditingUrl] = useState<string | null>(null)

  const categories = useMemo(() => Array.from(new Set(items.map(i => i.category))).sort(), [items])

  const filtered = useMemo(() => {
    let list = [...items]
    if (search) list = list.filter(i => i.name.toLowerCase().includes(search.toLowerCase()) || i.category.toLowerCase().includes(search.toLowerCase()) || (i.bestPriceNote ?? '').toLowerCase().includes(search.toLowerCase()))
    if (filterCategory) list = list.filter(i => i.category === filterCategory)
    if (filterStatus) list = list.filter(i => i.status === filterStatus)
    if (filterPriority) list = list.filter(i => i.priority === filterPriority)

    list.sort((a, b) => {
      let va: string | number = '', vb: string | number = ''
      if (sortKey === 'name') { va = a.name; vb = b.name }
      else if (sortKey === 'category') { va = a.category; vb = b.category }
      else if (sortKey === 'priority') {
        const order = { må_ha: 0, bra_å_ha: 1, kan_vente: 2 }
        va = order[a.priority]; vb = order[b.priority]
      }
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

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-sm text-muted-foreground">Ingen innkjøpsliste ennå.</p>
        <Button onClick={init}>Last inn standardliste</Button>
      </div>
    )
  }

  const totalBudgeted = items.reduce((s, i) => s + (i.budgeted || 0), 0)
  const totalActual = items.reduce((s, i) => s + (i.actual || 0), 0)
  const done = items.filter(i => i.status === 'anskaffet' || i.status === 'arv_gave').length
  const remaining = items.filter(i => i.status === 'kjøpe' || i.status === 'bestilt').reduce((s, i) => s + i.budgeted, 0)

  return (
    <div className="h-full flex flex-col overflow-hidden">

      {/* ── Oversikt ── */}
      <div className="px-5 pt-4 pb-3 grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
        <div className="rounded-lg border border-border bg-card px-4 py-3">
          <p className="text-[11px] text-muted-foreground mb-0.5">Fullført</p>
          <p className="text-base font-semibold">{done} / {items.length}</p>
          <div className="mt-1 h-1 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-green-500 rounded-full" style={{ width: `${Math.round(done / items.length * 100)}%` }} />
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
          <p className="text-[11px] text-muted-foreground mb-0.5">Gjenstår å kjøpe</p>
          <p className="text-base font-semibold font-mono text-amber-400">{fmtNOK(remaining)}</p>
        </div>
      </div>

      {/* ── Filter-rad ── */}
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
        <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={add}>
          <Plus className="h-3.5 w-3.5" /> Legg til
        </Button>
      </div>

      {/* ── Tabell ── */}
      <div className="flex-1 overflow-auto px-5 pb-4">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 z-10 bg-background border-b border-border">
            <tr>
              <th className="w-6 py-2 pr-2"></th>
              <ThSort label="Produkt" k="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <ThSort label="Kategori" k="category" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <ThSort label="Prioritet" k="priority" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <ThSort label="Status" k="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <th className="py-2 px-3 text-left font-medium text-muted-foreground whitespace-nowrap">Nettbutikk</th>
              <th className="py-2 px-3 text-left font-medium text-muted-foreground whitespace-nowrap">Beste pris / butikk</th>
              <ThSort label="Budsjett" k="budgeted" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} right />
              <ThSort label="Faktisk" k="actual" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} right />
              <th className="w-6 py-2 pl-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(item => (
              <ItemRow
                key={item.id}
                item={item}
                categories={categories}
                editingUrl={editingUrl}
                setEditingUrl={setEditingUrl}
                onUpdate={update}
                onRemove={remove}
              />
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="text-center text-muted-foreground text-xs py-8">Ingen produkter matcher filteret.</p>
        )}
      </div>
    </div>
  )
}

function ThSort({ label, k, sortKey, sortDir, onSort, right }: {
  label: string; k: SortKey; sortKey: SortKey; sortDir: SortDir
  onSort: (k: SortKey) => void; right?: boolean
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

function ItemRow({ item, categories, editingUrl, setEditingUrl, onUpdate, onRemove }: {
  item: BabyShoppingItem
  categories: string[]
  editingUrl: string | null
  setEditingUrl: (id: string | null) => void
  onUpdate: (id: string, patch: Partial<BabyShoppingItem>) => void
  onRemove: (id: string) => void
}) {
  const isDone = item.status === 'anskaffet' || item.status === 'arv_gave'

  return (
    <tr className={cn('border-b border-border/40 group hover:bg-muted/10 transition-colors', isDone && 'opacity-50')}>
      {/* Checkbox */}
      <td className="py-1.5 pr-2">
        <input
          type="checkbox"
          checked={isDone}
          onChange={() => onUpdate(item.id, { status: isDone ? 'kjøpe' : 'anskaffet' })}
          className="h-3.5 w-3.5 accent-green-500"
        />
      </td>

      {/* Produkt */}
      <td className="py-1.5 px-3">
        <Input
          value={item.name}
          onChange={e => onUpdate(item.id, { name: e.target.value })}
          className={cn('h-6 min-w-[160px] border-0 bg-transparent p-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-xs', isDone && 'line-through')}
          placeholder="Produktnavn..."
        />
        {item.note && <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{item.note}</p>}
      </td>

      {/* Kategori */}
      <td className="py-1.5 px-3">
        <select
          value={item.category}
          onChange={e => onUpdate(item.id, { category: e.target.value })}
          className="h-6 w-full rounded border border-input bg-background px-1.5 text-[11px] text-muted-foreground"
        >
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
          <option value={item.category}>{item.category}</option>
        </select>
      </td>

      {/* Prioritet */}
      <td className="py-1.5 px-3">
        <select
          value={item.priority}
          onChange={e => onUpdate(item.id, { priority: e.target.value as ItemPriority })}
          className={cn('h-6 rounded border px-1.5 text-[11px] bg-background cursor-pointer', PRIORITY_BADGE[item.priority])}
        >
          {(Object.keys(PRIORITY_LABELS) as ItemPriority[]).map(p => (
            <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
          ))}
        </select>
      </td>

      {/* Status */}
      <td className="py-1.5 px-3">
        <select
          value={item.status}
          onChange={e => onUpdate(item.id, { status: e.target.value as ItemStatus })}
          className={cn('h-6 rounded border border-input bg-background px-1.5 text-[11px] cursor-pointer', STATUS_COLORS[item.status])}
        >
          {(Object.keys(STATUS_LABELS) as ItemStatus[]).map(s => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
      </td>

      {/* Nettbutikk */}
      <td className="py-1.5 px-3">
        {editingUrl === item.id ? (
          <Input
            autoFocus
            value={item.storeUrl ?? ''}
            onChange={e => onUpdate(item.id, { storeUrl: e.target.value })}
            onBlur={() => setEditingUrl(null)}
            onKeyDown={e => e.key === 'Enter' && setEditingUrl(null)}
            className="h-6 w-48 text-[11px]"
            placeholder="https://..."
          />
        ) : item.storeUrl ? (
          <div className="flex items-center gap-1.5">
            <a href={item.storeUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1 max-w-[120px] truncate">
              <ExternalLink className="h-3 w-3 shrink-0" />
              <span className="truncate text-[11px]">{new URL(item.storeUrl).hostname.replace('www.', '')}</span>
            </a>
            <button onClick={() => setEditingUrl(item.id)} className="opacity-0 group-hover:opacity-100 text-[10px] text-muted-foreground hover:text-foreground">✎</button>
          </div>
        ) : (
          <button onClick={() => setEditingUrl(item.id)} className="opacity-0 group-hover:opacity-100 text-[11px] text-muted-foreground hover:text-primary transition-colors">
            + link
          </button>
        )}
      </td>

      {/* Beste pris / butikk */}
      <td className="py-1.5 px-3">
        <Input
          value={item.bestPriceNote ?? ''}
          onChange={e => onUpdate(item.id, { bestPriceNote: e.target.value })}
          className="h-6 min-w-[120px] border-0 bg-transparent p-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-[11px] text-muted-foreground placeholder:text-muted-foreground/40"
          placeholder="Finn.no, Jollyroom..."
        />
      </td>

      {/* Budsjett */}
      <td className="py-1.5 px-3 text-right">
        <div className="flex items-center justify-end gap-1">
          <Input
            type="number"
            value={item.budgeted || ''}
            onChange={e => onUpdate(item.id, { budgeted: parseInt(e.target.value) || 0 })}
            className="h-6 w-20 text-right text-[11px] font-mono"
            placeholder="0"
          />
          <span className="text-muted-foreground text-[10px] shrink-0">kr</span>
        </div>
      </td>

      {/* Faktisk */}
      <td className="py-1.5 px-3 text-right">
        <div className="flex items-center justify-end gap-1">
          <Input
            type="number"
            value={item.actual || ''}
            onChange={e => onUpdate(item.id, { actual: parseInt(e.target.value) || 0 })}
            className={cn('h-6 w-20 text-right text-[11px] font-mono', item.actual > 0 && 'text-green-400')}
            placeholder="—"
          />
          <span className="text-muted-foreground text-[10px] shrink-0">kr</span>
        </div>
      </td>

      {/* Slett */}
      <td className="py-1.5 pl-2">
        <button onClick={() => onRemove(item.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition-all">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  )
}
