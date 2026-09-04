import { useState, useMemo } from 'react'
import { Plus, Minus, Trash2, ArrowUpDown, ArrowUp, ArrowDown, Search, X, Pencil, Lock, LockOpen } from 'lucide-react'
import { useEconomyStore } from '@/application/useEconomyStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

// ─── Types ───────────────────────────────────────────────────────────────────

export const CLOTHING_SIZES = ['50', '56', '62', '68', '74', '80', '86', '92'] as const
export type ClothingSize = (typeof CLOTHING_SIZES)[number]

type SortKey = 'name' | 'total'
type SortDir = 'asc' | 'desc'

export interface ClothingItem {
  id: string
  /** Plaggtype, f.eks. "Ull body" — én rad per type, antall fordelt på størrelser */
  name: string
  note: string
  storeUrl?: string
  sizes: Partial<Record<ClothingSize, number>>
}

/** Standard plaggtyper — brukt både til "Last inn standardliste" og til å fylle på
 *  manglende typer i eksisterende kleslister (se useEconomyStore-migreringen). */
export const STANDARD_CLOTHING_TYPES = [
  'Ull body, langermet',
  'Body, kortermet',
  'Body, langermet',
  'Sparkebukse/onesie',
  'Pyjamas',
  'Strømpebukse',
  'Sokker',
  'Ullsokker',
  'Votter',
  'Lue, bomull',
  'Lue, ull',
  'Ytterdrakt/vognpose',
  'Regndress',
  'Fleecedress/-jakke',
  'Ullundertøy-sett',
  'Sko, myke',
]

const INITIAL_ITEMS: Omit<ClothingItem, 'id'>[] = STANDARD_CLOTHING_TYPES.map((name) => ({ name, note: '', sizes: {} }))

function newId() { return crypto.randomUUID() }
function totalQty(item: ClothingItem) { return CLOTHING_SIZES.reduce((s, sz) => s + (item.sizes[sz] ?? 0), 0) }

const EMPTY_ITEM = (): Omit<ClothingItem, 'id'> => ({ name: '', note: '', storeUrl: '', sizes: {} })

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
    setSize: (id: string, size: ClothingSize, qty: number) =>
      setItems(items.map(i => i.id === id ? { ...i, sizes: { ...i.sizes, [size]: Math.max(0, qty) } } : i)),
  }
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ClothingPage() {
  const { items, init, save, remove, setSize } = useClothing()
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [editing, setEditing] = useState<ClothingItem | null>(null)
  const [isNew, setIsNew] = useState(false)
  /** Låst som default — hindrer at antall/rader endres ved et uhell når man bare skal se */
  const [editMode, setEditMode] = useState(false)

  const filtered = useMemo(() => {
    let list = [...items]
    if (search) list = list.filter(i =>
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      i.note.toLowerCase().includes(search.toLowerCase())
    )
    list.sort((a, b) => {
      let va: string | number = '', vb: string | number = ''
      if (sortKey === 'name') { va = a.name; vb = b.name }
      else if (sortKey === 'total') { va = totalQty(a); vb = totalQty(b) }
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return list
  }, [items, search, sortKey, sortDir])

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

  const totalPlagg = items.reduce((s, i) => s + totalQty(i), 0)

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
      <div className="px-5 pt-4 pb-3 grid grid-cols-2 gap-3 shrink-0">
        <div className="rounded-lg border border-border bg-card px-4 py-3">
          <p className="text-[11px] text-muted-foreground mb-0.5">Plaggtyper</p>
          <p className="text-base font-semibold">{items.length}</p>
        </div>
        <div className="rounded-lg border border-border bg-card px-4 py-3">
          <p className="text-[11px] text-muted-foreground mb-0.5">Totalt antall plagg</p>
          <p className="text-base font-semibold font-mono">{totalPlagg}</p>
        </div>
      </div>

      {/* Filter-rad */}
      <div className="px-5 pb-3 flex flex-wrap items-center gap-2 shrink-0">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Søk plagg..." className="h-8 text-xs pl-8" />
          {search && <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>}
        </div>
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} plagg</span>
        <div className={cn(
          'flex items-center gap-2 h-8 rounded-md border px-2.5 text-xs font-medium transition-colors',
          editMode ? 'border-amber-500/40 text-amber-400 bg-amber-500/10' : 'border-border text-muted-foreground'
        )}>
          {editMode ? <LockOpen className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
          <span className="cursor-pointer select-none" onClick={() => setEditMode(v => !v)}>Redigering</span>
          <Switch
            checked={editMode}
            onCheckedChange={setEditMode}
            className="h-4 w-7 [&>span]:h-3 [&>span]:w-3 [&>span]:data-[state=checked]:translate-x-3"
          />
        </div>
        {editMode && (
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={openNew}>
            <Plus className="h-3.5 w-3.5" /> Legg til plagg
          </Button>
        )}
      </div>

      {/* Tabell */}
      <div className="flex-1 overflow-auto px-5 pb-4">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 z-10 bg-background border-b border-border">
            <tr>
              <Th k="name" label="Hva" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              {CLOTHING_SIZES.map(sz => (
                <th key={sz} className="py-2 px-1 text-center font-medium text-muted-foreground w-12">{sz}</th>
              ))}
              <Th k="total" label="Antall" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} right />
              <th className="w-16 py-2" />
            </tr>
          </thead>
          <tbody>
            {filtered.map(item => (
              <tr key={item.id} className="border-b border-border/40 group hover:bg-muted/10 transition-colors">
                <td className={cn('py-2 px-3', editMode && 'cursor-pointer')} onClick={() => editMode && openEdit(item)}>
                  <span className="font-medium">{item.name || <span className="text-muted-foreground italic">Uten navn</span>}</span>
                  {item.note && <p className="text-[10px] text-muted-foreground mt-0.5">{item.note}</p>}
                </td>
                {CLOTHING_SIZES.map(sz => (
                  <td key={sz} className="py-1 px-1">
                    <SizeCell value={item.sizes[sz] ?? 0} onChange={v => setSize(item.id, sz, v)} editable={editMode} />
                  </td>
                ))}
                <td className="py-2 px-3 text-right font-mono text-muted-foreground">{totalQty(item) || '—'}</td>
                <td className="py-2 pl-1">
                  {editMode && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openEdit(item)} className="text-muted-foreground hover:text-foreground p-1"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={() => remove(item.id)} className="text-muted-foreground hover:text-red-400 p-1"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
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

function SizeCell({ value, onChange, editable }: { value: number; onChange: (v: number) => void; editable: boolean }) {
  if (!editable) {
    return (
      <div className="flex items-center justify-center">
        <span className={cn('w-4 text-center text-[11px] font-mono tabular-nums', value > 0 ? 'text-foreground font-medium' : 'text-muted-foreground/40')}>
          {value}
        </span>
      </div>
    )
  }
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
