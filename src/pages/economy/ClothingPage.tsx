import { useState, useMemo } from 'react'
import { Plus, Minus, Trash2, ArrowUpDown, ArrowUp, ArrowDown, Search, X, Pencil } from 'lucide-react'
import { useEconomyStore } from '@/application/useEconomyStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

// ─── Types ───────────────────────────────────────────────────────────────────

export const CLOTHING_SIZES = ['50', '56', '62', '68', '74', '80', '86', '92'] as const
export type ClothingSize = (typeof CLOTHING_SIZES)[number]

type ItemStatus = 'kjøpe' | 'bestilt' | 'anskaffet' | 'arv_gave'
type ItemPriority = 'må_ha' | 'bra_å_ha' | 'kan_vente'
type SortKey = 'name' | 'priority' | 'status' | 'total' | 'budgeted' | 'actual'
type SortDir = 'asc' | 'desc'

export interface ClothingItem {
  id: string
  /** Plaggtype, f.eks. "Ull body" — én rad per type, antall fordelt på størrelser */
  name: string
  status: ItemStatus
  priority: ItemPriority
  budgeted: number
  actual: number
  note: string
  storeUrl?: string
  sizes: Partial<Record<ClothingSize, number>>
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

const INITIAL_ITEMS: Omit<ClothingItem, 'id'>[] = [
  { name: 'Ull body', status: 'kjøpe', priority: 'må_ha', budgeted: 800, actual: 0, note: '', sizes: {} },
  { name: 'Bodyer (bomull)', status: 'kjøpe', priority: 'må_ha', budgeted: 600, actual: 0, note: '', sizes: {} },
  { name: 'Sparkebukser/onesies', status: 'kjøpe', priority: 'må_ha', budgeted: 600, actual: 0, note: '', sizes: {} },
  { name: 'Luer', status: 'kjøpe', priority: 'må_ha', budgeted: 200, actual: 0, note: '', sizes: {} },
  { name: 'Votter', status: 'kjøpe', priority: 'bra_å_ha', budgeted: 150, actual: 0, note: '', sizes: {} },
  { name: 'Sokker/ullsokker', status: 'kjøpe', priority: 'bra_å_ha', budgeted: 150, actual: 0, note: '', sizes: {} },
  { name: 'Ytterdrakt/overall', status: 'kjøpe', priority: 'bra_å_ha', budgeted: 800, actual: 0, note: '', sizes: {} },
]

function fmtNOK(n: number) { return n > 0 ? n.toLocaleString('no-NO') + ' kr' : '—' }
function newId() { return crypto.randomUUID() }
function totalQty(item: ClothingItem) { return CLOTHING_SIZES.reduce((s, sz) => s + (item.sizes[sz] ?? 0), 0) }

const EMPTY_ITEM = (): Omit<ClothingItem, 'id'> => ({
  name: '', status: 'kjøpe', priority: 'bra_å_ha', budgeted: 0, actual: 0, note: '', storeUrl: '', sizes: {},
})

// ─── Store hook ───────────────────────────────────────────────────────────────

function useClothing() {
  const items = useEconomyStore((s) => s.clothingItems ?? []) as ClothingItem[]
  const setItems = useEconomyStore((s) => s.setClothingItems)
  return {
    items,
    init: () => setItems(INITIAL_ITEMS.map(i => ({ ...i, id: newId() }))),
    save: (item: ClothingItem) => {
      const exists = items.some(i => i.id === item.id)
      setItems(exists ? items.map(i => i.id === item.id ? item : i) : [...items, item])
    },
    remove: (id: string) => setItems(items.filter(i => i.id !== id)),
    toggleDone: (id: string) => setItems(items.map(i => i.id === id
      ? { ...i, status: (i.status === 'anskaffet' || i.status === 'arv_gave') ? 'kjøpe' : 'anskaffet' }
      : i)),
    setStatus: (id: string, status: ItemStatus) => setItems(items.map(i => i.id === id ? { ...i, status } : i)),
    setSize: (id: string, size: ClothingSize, qty: number) =>
      setItems(items.map(i => i.id === id ? { ...i, sizes: { ...i.sizes, [size]: Math.max(0, qty) } } : i)),
  }
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ClothingPage() {
  const { items, init, save, remove, toggleDone, setStatus, setSize } = useClothing()
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [editing, setEditing] = useState<ClothingItem | null>(null)
  const [isNew, setIsNew] = useState(false)

  const filtered = useMemo(() => {
    let list = [...items]
    if (search) list = list.filter(i =>
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      i.note.toLowerCase().includes(search.toLowerCase())
    )
    if (filterStatus) list = list.filter(i => i.status === filterStatus)
    if (filterPriority) list = list.filter(i => i.priority === filterPriority)
    list.sort((a, b) => {
      const priorityOrder = { må_ha: 0, bra_å_ha: 1, kan_vente: 2 }
      let va: string | number = '', vb: string | number = ''
      if (sortKey === 'name') { va = a.name; vb = b.name }
      else if (sortKey === 'priority') { va = priorityOrder[a.priority]; vb = priorityOrder[b.priority] }
      else if (sortKey === 'status') { va = a.status; vb = b.status }
      else if (sortKey === 'total') { va = totalQty(a); vb = totalQty(b) }
      else if (sortKey === 'budgeted') { va = a.budgeted; vb = b.budgeted }
      else if (sortKey === 'actual') { va = a.actual; vb = b.actual }
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return list
  }, [items, search, filterStatus, filterPriority, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  function openNew() {
    setEditing({ ...EMPTY_ITEM(), id: newId() })
    setIsNew(true)
  }
  function openEdit(item: ClothingItem) {
    setEditing({ ...item })
    setIsNew(false)
  }
  function closeDialog() { setEditing(null) }
  function handleSave(item: ClothingItem) { save(item); setEditing(null) }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-sm text-muted-foreground">Ingen klesliste ennå.</p>
        <Button onClick={init}>Last inn standardliste</Button>
      </div>
    )
  }

  const totalBudgeted = items.reduce((s, i) => s + i.budgeted, 0)
  const totalActual = items.reduce((s, i) => s + i.actual, 0)
  const done = items.filter(i => i.status === 'anskaffet' || i.status === 'arv_gave').length
  const remaining = items.filter(i => i.status === 'kjøpe' || i.status === 'bestilt').reduce((s, i) => s + i.budgeted, 0)

  return (
    <div className="h-full flex flex-col overflow-hidden">

      {/* Dialog */}
      {editing && (
        <ClothingDialog
          item={editing}
          isNew={isNew}
          onSave={handleSave}
          onClose={closeDialog}
          onDelete={isNew ? undefined : () => { remove(editing.id); closeDialog() }}
        />
      )}

      {/* Oversikt */}
      <div className="px-5 pt-4 pb-3 grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
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
          <p className="text-[11px] text-muted-foreground mb-0.5">Gjenstår å kjøpe</p>
          <p className="text-base font-semibold font-mono text-amber-400">{fmtNOK(remaining)}</p>
        </div>
      </div>

      {/* Filter-rad */}
      <div className="px-5 pb-3 flex flex-wrap items-center gap-2 shrink-0">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Søk plagg..." className="h-8 text-xs pl-8" />
          {search && <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>}
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-xs text-muted-foreground">
          <option value="">Alle statuser</option>
          {(Object.keys(STATUS_LABELS) as ItemStatus[]).map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-xs text-muted-foreground">
          <option value="">Alle prioriteter</option>
          {(Object.keys(PRIORITY_LABELS) as ItemPriority[]).map(p => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
        </select>
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} plagg</span>
        <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={openNew}>
          <Plus className="h-3.5 w-3.5" /> Legg til plagg
        </Button>
      </div>

      {/* Tabell */}
      <div className="flex-1 overflow-auto px-5 pb-4">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 z-10 bg-background border-b border-border">
            <tr>
              <th className="w-7 py-2 pr-1" />
              <Th k="name" label="Hva" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <Th k="priority" label="Prioritet" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <Th k="status" label="Status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              {CLOTHING_SIZES.map(sz => (
                <th key={sz} className="py-2 px-1 text-center font-medium text-muted-foreground w-12">{sz}</th>
              ))}
              <Th k="total" label="Antall" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} right />
              <Th k="budgeted" label="Budsjett" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} right />
              <Th k="actual" label="Faktisk" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} right />
              <th className="w-16 py-2" />
            </tr>
          </thead>
          <tbody>
            {filtered.map(item => {
              const isDone = item.status === 'anskaffet' || item.status === 'arv_gave'
              return (
                <tr key={item.id} className={cn('border-b border-border/40 group hover:bg-muted/10 transition-colors', isDone && 'opacity-50')}>
                  <td className="py-2 pr-1" onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={isDone} onChange={() => toggleDone(item.id)} className="h-3.5 w-3.5 accent-green-500" />
                  </td>
                  <td className="py-2 px-3 cursor-pointer" onClick={() => openEdit(item)}>
                    <span className={cn('font-medium', isDone && 'line-through')}>{item.name || <span className="text-muted-foreground italic">Uten navn</span>}</span>
                    {item.note && <p className="text-[10px] text-muted-foreground mt-0.5">{item.note}</p>}
                  </td>
                  <td className="py-2 px-3 cursor-pointer" onClick={() => openEdit(item)}>
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
                  {CLOTHING_SIZES.map(sz => (
                    <td key={sz} className="py-1 px-1" onClick={e => e.stopPropagation()}>
                      <SizeCell value={item.sizes[sz] ?? 0} onChange={v => setSize(item.id, sz, v)} />
                    </td>
                  ))}
                  <td className="py-2 px-3 text-right font-mono text-muted-foreground">{totalQty(item) || '—'}</td>
                  <td className="py-2 px-3 text-right font-mono cursor-pointer" onClick={() => openEdit(item)}>{fmtNOK(item.budgeted)}</td>
                  <td className={cn('py-2 px-3 text-right font-mono cursor-pointer', item.actual > 0 && 'text-green-400')} onClick={() => openEdit(item)}>{fmtNOK(item.actual)}</td>
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
          <p className="text-center text-muted-foreground text-xs py-8">Ingen plagg matcher filteret.</p>
        )}
      </div>
    </div>
  )
}

// ─── Størrelsescelle (enkel velger) ────────────────────────────────────────────

function SizeCell({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-center gap-0.5">
      <button
        type="button"
        onClick={() => onChange(value - 1)}
        disabled={value <= 0}
        className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/40 disabled:opacity-20 disabled:hover:bg-transparent"
      >
        <Minus className="h-3 w-3" />
      </button>
      <span className={cn('w-4 text-center text-[11px] font-mono tabular-nums', value > 0 ? 'text-foreground font-medium' : 'text-muted-foreground/40')}>
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/40"
      >
        <Plus className="h-3 w-3" />
      </button>
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

function ClothingDialog({ item, isNew, onSave, onClose, onDelete }: {
  item: ClothingItem
  isNew: boolean
  onSave: (item: ClothingItem) => void
  onClose: () => void
  onDelete?: () => void
}) {
  const [form, setForm] = useState<ClothingItem>(item)

  function set(patch: Partial<ClothingItem>) { setForm(f => ({ ...f, ...patch })) }

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">{isNew ? 'Legg til plagg' : 'Rediger plagg'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Navn */}
          <div className="space-y-1.5">
            <Label className="text-xs">Hva</Label>
            <Input value={form.name} onChange={e => set({ name: e.target.value })} placeholder="f.eks. Ull body" className="text-xs h-8" />
          </div>

          {/* Prioritet + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Prioritet</Label>
              <select value={form.priority} onChange={e => set({ priority: e.target.value as ItemPriority })} className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs">
                {(Object.keys(PRIORITY_LABELS) as ItemPriority[]).map(p => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Status</Label>
              <select value={form.status} onChange={e => set({ status: e.target.value as ItemStatus })} className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs">
                {(Object.keys(STATUS_LABELS) as ItemStatus[]).map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            </div>
          </div>

          {/* Budsjett + Faktisk */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Budsjettert pris (kr)</Label>
              <Input type="number" value={form.budgeted || ''} onChange={e => set({ budgeted: parseInt(e.target.value) || 0 })} placeholder="0" className="text-xs h-8 font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Faktisk betalt (kr)</Label>
              <Input type="number" value={form.actual || ''} onChange={e => set({ actual: parseInt(e.target.value) || 0 })} placeholder="0" className="text-xs h-8 font-mono" />
            </div>
          </div>

          {/* Nettbutikk */}
          <div className="space-y-1.5">
            <Label className="text-xs">Nettbutikk-lenke (valgfritt)</Label>
            <Input value={form.storeUrl ?? ''} onChange={e => set({ storeUrl: e.target.value })} placeholder="https://..." className="text-xs h-8" />
          </div>

          {/* Merknad */}
          <div className="space-y-1.5">
            <Label className="text-xs">Merknad</Label>
            <Input value={form.note} onChange={e => set({ note: e.target.value })} placeholder="Valgfri merknad..." className="text-xs h-8" />
          </div>

          <p className="text-[11px] text-muted-foreground">Antall per størrelse justerer du direkte i tabellen.</p>
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
