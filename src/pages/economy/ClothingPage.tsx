import { useState, useMemo, Fragment } from 'react'
import {
  Plus, Minus, Trash2, ArrowUpDown, ArrowUp, ArrowDown, Search, X, Pencil,
  Lock, LockOpen, Share2, ChevronRight, ChevronDown,
} from 'lucide-react'
import { useEconomyStore } from '@/application/useEconomyStore'
import { useSharedKlaerStore } from '@/store/useSharedKlaerStore'
import {
  SIZE_SCALES, DEFAULT_SIZE_SCALE, inferSizeScale, totalQty,
  type SizeScaleKey, type ClothingItem,
} from '@/domain/clothing/clothingTypes'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export type { ClothingItem }

type SortKey = 'name' | 'total'
type SortDir = 'asc' | 'desc'

const SCALE_ORDER: SizeScaleKey[] = ['hoyde', 'sko', 'alder']

/** Standard plaggtyper — brukt både til "Last inn standardliste" og til å fylle på
 *  manglende typer i eksisterende kleslister (se useEconomyStore-migreringen). Én rad
 *  per kategori — underkategorier (Langermet, Ull osv.) legges på i etterkant. */
const STANDARD_CLOTHING_ITEMS: Omit<ClothingItem, 'id' | 'note' | 'storeUrl' | 'sizes' | 'subcategory'>[] = [
  { category: 'Body', sizeScale: 'hoyde' },
  { category: 'Sparkebukse/onesie', sizeScale: 'hoyde' },
  { category: 'Pyjamas', sizeScale: 'hoyde' },
  { category: 'Strømpebukse', sizeScale: 'hoyde' },
  { category: 'Sokker', sizeScale: 'alder' },
  { category: 'Ullsokker', sizeScale: 'alder' },
  { category: 'Votter', sizeScale: 'alder' },
  { category: 'Lue', sizeScale: 'alder' },
  { category: 'Ytterdrakt/vognpose', sizeScale: 'hoyde' },
  { category: 'Regndress', sizeScale: 'hoyde' },
  { category: 'Fleecedress/-jakke', sizeScale: 'hoyde' },
  { category: 'Ullundertøy-sett', sizeScale: 'hoyde' },
  { category: 'Sko', sizeScale: 'sko' },
]

const INITIAL_ITEMS: Omit<ClothingItem, 'id'>[] = STANDARD_CLOTHING_ITEMS.map((i) => ({ ...i, subcategory: '', note: '', sizes: {} }))

function newId() { return crypto.randomUUID() }

const EMPTY_ITEM = (category = ''): Omit<ClothingItem, 'id'> => ({
  category, subcategory: '', sizeScale: category ? inferSizeScale(category) : DEFAULT_SIZE_SCALE, note: '', storeUrl: '', sizes: {},
})

interface CategoryGroup {
  category: string
  items: ClothingItem[]
}

function groupByCategory(items: ClothingItem[]): CategoryGroup[] {
  const map = new Map<string, ClothingItem[]>()
  for (const item of items) {
    const list = map.get(item.category) ?? []
    list.push(item)
    map.set(item.category, list)
  }
  return Array.from(map.entries()).map(([category, items]) => ({ category, items }))
}

function groupTotal(group: CategoryGroup): number {
  return group.items.reduce((s, i) => s + totalQty(i), 0)
}

function groupSizeSum(group: CategoryGroup, size: string): number {
  return group.items.reduce((s, i) => s + (i.sizes[size] ?? 0), 0)
}

// ─── Store hook ───────────────────────────────────────────────────────────────

function useClothing() {
  const shared = useSharedKlaerStore()
  const personalItems = useEconomyStore((s) => s.clothingItems ?? []) as ClothingItem[]
  const setPersonalItems = useEconomyStore((s) => s.setClothingItems)
  const isShared = shared.partnershipId !== null
  // Bruk delt data kun etter at migrering er gjort ELLER delt liste allerede har innhold
  const sharedHasData = (shared.data?.length ?? 0) > 0 || shared.migrated
  const useShared = isShared && sharedHasData
  const items = useShared ? (shared.data ?? []) : personalItems
  const setItems = (next: ClothingItem[]) => { if (useShared) void shared.setData(next); else setPersonalItems(next) }

  return {
    items,
    isShared, personalItems, migrated: shared.migrated,
    migrateFrom: () => shared.migrateFrom(personalItems, (d) => d.length === 0),
    init: () => setItems(INITIAL_ITEMS.map(i => ({ ...i, id: newId() }))),
    save: (item: ClothingItem) => {
      const exists = items.some(i => i.id === item.id)
      setItems(exists ? items.map(i => i.id === item.id ? item : i) : [...items, item])
    },
    remove: (id: string) => setItems(items.filter(i => i.id !== id)),
    setSize: (id: string, size: string, qty: number) =>
      setItems(items.map(i => i.id === id ? { ...i, sizes: { ...i.sizes, [size]: Math.max(0, qty) } } : i)),
  }
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ClothingPage() {
  const { items, init, save, remove, setSize, isShared, personalItems, migrated, migrateFrom } = useClothing()
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [editing, setEditing] = useState<ClothingItem | null>(null)
  const [isNew, setIsNew] = useState(false)
  /** Låst som default — hindrer at antall/rader endres ved et uhell når man bare skal se */
  const [editMode, setEditMode] = useState(false)
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const sharedIsEmpty = useSharedKlaerStore((s) => (s.data?.length ?? 0) === 0 && !s.loading)
  const needsMigration = isShared && personalItems.length > 0 && sharedIsEmpty && !migrated
  const [migrating, setMigrating] = useState(false)

  async function handleMigrate() {
    setMigrating(true)
    try { await migrateFrom() } finally { setMigrating(false) }
  }

  const categories = useMemo(() => Array.from(new Set(items.map(i => i.category))).sort(), [items])
  const subcategorySuggestions = useMemo(() => Array.from(new Set(items.map(i => i.subcategory).filter(Boolean))).sort(), [items])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = [...items]
    if (q) list = list.filter(i =>
      i.category.toLowerCase().includes(q) ||
      i.subcategory.toLowerCase().includes(q) ||
      i.note.toLowerCase().includes(q)
    )
    list.sort((a, b) => {
      let va: string | number = '', vb: string | number = ''
      if (sortKey === 'name') { va = a.category; vb = b.category }
      else { va = totalQty(a); vb = totalQty(b) }
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

  function toggleExpand(category: string) {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      if (next.has(category)) next.delete(category); else next.add(category)
      return next
    })
  }
  const isExpanded = (category: string) => search.trim() !== '' || expandedCategories.has(category)

  function openNew(category?: string) {
    setEditing({ ...EMPTY_ITEM(category), id: newId() })
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
  const totalKategorier = categories.length

  return (
    <div className="h-full flex flex-col overflow-hidden">

      {/* Dialog */}
      {editing && (
        <ClothingDialog
          item={editing}
          isNew={isNew}
          items={items}
          categories={categories}
          subcategorySuggestions={subcategorySuggestions}
          onSave={handleSave}
          onClose={closeDialog}
          onDelete={isNew ? undefined : () => { remove(editing.id); closeDialog() }}
        />
      )}

      {/* Del med partner */}
      {needsMigration && (
        <div className="mx-5 mt-4 rounded-lg border border-violet-500/40 bg-violet-500/10 px-4 py-3 flex items-center justify-between gap-3 shrink-0">
          <div>
            <p className="text-sm font-medium text-violet-300 flex items-center gap-1.5">
              <Share2 className="h-4 w-4" />
              Del kleslisten med partner
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {personalItems.length} plaggtyper er klare til å flyttes til den felles listen.
            </p>
          </div>
          <button
            onClick={handleMigrate}
            disabled={migrating}
            className="text-xs px-3 py-1.5 rounded bg-violet-600 hover:bg-violet-500 text-white font-medium transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {migrating ? 'Flytter…' : 'Flytt til felles'}
          </button>
        </div>
      )}

      {/* Oversikt */}
      <div className="px-5 pt-4 pb-3 grid grid-cols-2 gap-3 shrink-0">
        <div className="rounded-lg border border-border bg-card px-4 py-3">
          <p className="text-[11px] text-muted-foreground mb-0.5">Kategorier</p>
          <p className="text-base font-semibold">{totalKategorier}</p>
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
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Søk kategori eller underkategori..." className="h-8 text-xs pl-8" />
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
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => openNew()}>
            <Plus className="h-3.5 w-3.5" /> Legg til plagg
          </Button>
        )}
      </div>

      <ClothingTable
        items={filtered}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={toggleSort}
        editMode={editMode}
        isExpanded={isExpanded}
        onToggleExpand={toggleExpand}
        onEdit={openEdit}
        onAddVariant={openNew}
        onRemove={remove}
        onSetSize={setSize}
      />
    </div>
  )
}

// ─── Listevisning (tabell, gruppert per størrelsesskala og kategori) ───────────

function ClothingTable({
  items, sortKey, sortDir, onSort, editMode, isExpanded, onToggleExpand, onEdit, onAddVariant, onRemove, onSetSize,
}: {
  items: ClothingItem[]
  sortKey: SortKey
  sortDir: SortDir
  onSort: (k: SortKey) => void
  editMode: boolean
  isExpanded: (category: string) => boolean
  onToggleExpand: (category: string) => void
  onEdit: (item: ClothingItem) => void
  onAddVariant: (category: string) => void
  onRemove: (id: string) => void
  onSetSize: (id: string, size: string, qty: number) => void
}) {
  const scaleGroups = SCALE_ORDER
    .map(scale => ({ scale, groups: groupByCategory(items.filter(i => i.sizeScale === scale)) }))
    .filter(g => g.groups.length > 0)

  return (
    <div className="flex-1 overflow-auto px-5 pb-4 space-y-6">
      {scaleGroups.map(({ scale, groups }) => (
        <div key={scale}>
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
            {SIZE_SCALES[scale].label}
          </p>
          <table className="text-xs border-collapse table-fixed">
            <colgroup>
              <col className="w-56" />
              {SIZE_SCALES[scale].sizes.map(sz => <col key={sz} className="w-20" />)}
              <col className="w-20" />
              <col className="w-16" />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-background border-b border-border">
              <tr>
                <Th k="name" label="Hva" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                {SIZE_SCALES[scale].sizes.map(sz => (
                  <th key={sz} className="py-2 px-1 text-center font-medium text-muted-foreground whitespace-nowrap">{sz}</th>
                ))}
                <Th k="total" label="Antall" sortKey={sortKey} sortDir={sortDir} onSort={onSort} right />
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {groups.map(group => {
                const isMulti = group.items.length > 1
                if (!isMulti) {
                  const item = group.items[0]
                  return (
                    <tr key={item.id} className="border-b border-border/40 group hover:bg-muted/10 transition-colors">
                      <td className={cn('py-2 px-3', editMode && 'cursor-pointer')} onClick={() => editMode && onEdit(item)}>
                        <span className="font-medium">{item.category || <span className="text-muted-foreground italic">Uten navn</span>}</span>
                        {item.subcategory && <span className="ml-1.5 text-muted-foreground">— {item.subcategory}</span>}
                        {item.note && <p className="text-[10px] text-muted-foreground mt-0.5">{item.note}</p>}
                      </td>
                      {SIZE_SCALES[scale].sizes.map(sz => (
                        <td key={sz} className="py-1 px-1">
                          <SizeCell value={item.sizes[sz] ?? 0} onChange={v => onSetSize(item.id, sz, v)} editable={editMode} />
                        </td>
                      ))}
                      <td className="py-2 px-3 text-right font-mono text-muted-foreground">{totalQty(item) || '—'}</td>
                      <td className="py-2 pl-1">
                        {editMode && (
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => onEdit(item)} className="text-muted-foreground hover:text-foreground p-1"><Pencil className="h-3.5 w-3.5" /></button>
                            <button onClick={() => onRemove(item.id)} className="text-muted-foreground hover:text-red-400 p-1"><Trash2 className="h-3.5 w-3.5" /></button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                }

                const expanded = isExpanded(group.category)
                return (
                  <Fragment key={group.category}>
                    <tr
                      className="border-b border-border/40 bg-muted/5 hover:bg-muted/15 transition-colors cursor-pointer"
                      onClick={() => onToggleExpand(group.category)}
                    >
                      <td className="py-2 px-3">
                        <span className="inline-flex items-center gap-1 font-medium">
                          {expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                          {group.category}
                          <span className="text-[10px] text-muted-foreground font-normal">({group.items.length} underkategorier)</span>
                        </span>
                      </td>
                      {SIZE_SCALES[scale].sizes.map(sz => (
                        <td key={sz} className="py-2 px-1 text-center font-mono text-muted-foreground">
                          {groupSizeSum(group, sz) || '—'}
                        </td>
                      ))}
                      <td className="py-2 px-3 text-right font-mono">{groupTotal(group) || '—'}</td>
                      <td className="py-2 pl-1">
                        {editMode && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onAddVariant(group.category) }}
                            className="text-muted-foreground hover:text-foreground p-1"
                            title="Legg til underkategori"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                    {expanded && group.items.map(item => (
                      <tr key={item.id} className="border-b border-border/40 group hover:bg-muted/10 transition-colors">
                        <td className={cn('py-2 pl-8 pr-3', editMode && 'cursor-pointer')} onClick={() => editMode && onEdit(item)}>
                          <span>{item.subcategory || <span className="text-muted-foreground italic">Uten underkategori</span>}</span>
                          {item.note && <p className="text-[10px] text-muted-foreground mt-0.5">{item.note}</p>}
                        </td>
                        {SIZE_SCALES[scale].sizes.map(sz => (
                          <td key={sz} className="py-1 px-1">
                            <SizeCell value={item.sizes[sz] ?? 0} onChange={v => onSetSize(item.id, sz, v)} editable={editMode} />
                          </td>
                        ))}
                        <td className="py-2 px-3 text-right font-mono text-muted-foreground">{totalQty(item) || '—'}</td>
                        <td className="py-2 pl-1">
                          {editMode && (
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => onEdit(item)} className="text-muted-foreground hover:text-foreground p-1"><Pencil className="h-3.5 w-3.5" /></button>
                              <button onClick={() => onRemove(item.id)} className="text-muted-foreground hover:text-red-400 p-1"><Trash2 className="h-3.5 w-3.5" /></button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      ))}
      {items.length === 0 && (
        <p className="text-center text-muted-foreground text-xs py-8">Ingen plagg matcher filteret.</p>
      )}
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
    <div className="flex items-center justify-center gap-0.5" onClick={e => e.stopPropagation()}>
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

function ClothingDialog({ item, isNew, items, categories, subcategorySuggestions, onSave, onClose, onDelete }: {
  item: ClothingItem
  isNew: boolean
  items: ClothingItem[]
  categories: string[]
  subcategorySuggestions: string[]
  onSave: (item: ClothingItem) => void
  onClose: () => void
  onDelete?: () => void
}) {
  const [form, setForm] = useState<ClothingItem>(item)
  const [scaleTouched, setScaleTouched] = useState(!isNew)

  function set(patch: Partial<ClothingItem>) { setForm(f => ({ ...f, ...patch })) }

  function setCategory(value: string) {
    // For et nytt plagg foreslår vi størrelsesskala basert på navnet, med mindre
    // brukeren allerede har valgt skala manuelt.
    if (isNew && !scaleTouched) set({ category: value, sizeScale: inferSizeScale(value) })
    else set({ category: value })
  }

  const trimmedCategory = form.category.trim().toLowerCase()
  const trimmedSub = form.subcategory.trim().toLowerCase()
  const isDuplicate = trimmedCategory !== '' && items.some(i =>
    i.id !== form.id &&
    i.category.trim().toLowerCase() === trimmedCategory &&
    i.subcategory.trim().toLowerCase() === trimmedSub
  )

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">{isNew ? 'Legg til plagg' : 'Rediger plagg'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Kategori */}
          <div className="space-y-1.5">
            <Label className="text-xs">Kategori</Label>
            <Input
              list="clothing-category-suggestions"
              value={form.category}
              onChange={e => setCategory(e.target.value)}
              placeholder="f.eks. Body"
              className="text-xs h-8"
            />
            <datalist id="clothing-category-suggestions">
              {categories.map(c => <option key={c} value={c} />)}
            </datalist>
          </div>

          {/* Underkategori */}
          <div className="space-y-1.5">
            <Label className="text-xs">Underkategori (valgfritt)</Label>
            <Input
              list="clothing-subcategory-suggestions"
              value={form.subcategory}
              onChange={e => set({ subcategory: e.target.value })}
              placeholder="f.eks. Langermet, Ull..."
              className="text-xs h-8"
            />
            <datalist id="clothing-subcategory-suggestions">
              {subcategorySuggestions.map(s => <option key={s} value={s} />)}
            </datalist>
            {isDuplicate && (
              <p className="text-[11px] text-red-400">Denne kombinasjonen finnes allerede — rediger den raden i stedet.</p>
            )}
            <p className="text-[11px] text-muted-foreground">
              Samme kategori som et annet plagg grupperer dem sammen, med underkategorien som skiller radene (f.eks. "Body" → "Langermet" / "Kortermet" / "Ull").
            </p>
          </div>

          {/* Størrelsesskala */}
          <div className="space-y-1.5">
            <Label className="text-xs">Størrelsestype</Label>
            <select
              value={form.sizeScale}
              onChange={e => { setScaleTouched(true); set({ sizeScale: e.target.value as SizeScaleKey }) }}
              className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs"
            >
              {SCALE_ORDER.map(key => <option key={key} value={key}>{SIZE_SCALES[key].label}</option>)}
            </select>
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
          <Button size="sm" className="text-xs" onClick={() => onSave(form)} disabled={!form.category.trim() || isDuplicate}>Lagre</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
