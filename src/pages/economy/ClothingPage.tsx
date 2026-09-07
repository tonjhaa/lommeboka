import { useState, useMemo } from 'react'
import {
  Plus, Minus, Trash2, ArrowUpDown, ArrowUp, ArrowDown, Search, X, Pencil,
  Lock, LockOpen, Share2, ExternalLink, List, Store,
} from 'lucide-react'
import { useEconomyStore } from '@/application/useEconomyStore'
import { useSharedKlaerStore } from '@/store/useSharedKlaerStore'
import { CLOTHING_SIZES, type ClothingSize, type ClothingItem, totalQty } from '@/domain/clothing/clothingTypes'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export type { ClothingSize, ClothingItem }
export { CLOTHING_SIZES }

type SortKey = 'name' | 'total'
type SortDir = 'asc' | 'desc'
type View = 'liste' | 'nettbutikk'

/** Standard plaggtyper — brukt både til "Last inn standardliste" og til å fylle på
 *  manglende typer i eksisterende kleslister (se useEconomyStore-migreringen). Én rad
 *  per kategori — tagger legges på i etterkant hvis man vil beskrive varianter. */
const STANDARD_CLOTHING_ITEMS: Omit<ClothingItem, 'id' | 'note' | 'storeUrl' | 'sizes' | 'tags'>[] = [
  { category: 'Body' },
  { category: 'Sparkebukse/onesie' },
  { category: 'Pyjamas' },
  { category: 'Strømpebukse' },
  { category: 'Sokker' },
  { category: 'Ullsokker' },
  { category: 'Votter' },
  { category: 'Lue' },
  { category: 'Ytterdrakt/vognpose' },
  { category: 'Regndress' },
  { category: 'Fleecedress/-jakke' },
  { category: 'Ullundertøy-sett' },
  { category: 'Sko' },
]

const INITIAL_ITEMS: Omit<ClothingItem, 'id'>[] = STANDARD_CLOTHING_ITEMS.map((i) => ({ ...i, tags: [], note: '', sizes: {} }))

function newId() { return crypto.randomUUID() }

const EMPTY_ITEM = (): Omit<ClothingItem, 'id'> => ({ category: '', tags: [], note: '', storeUrl: '', sizes: {} })

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
    setSize: (id: string, size: ClothingSize, qty: number) =>
      setItems(items.map(i => i.id === id ? { ...i, sizes: { ...i.sizes, [size]: Math.max(0, qty) } } : i)),
  }
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ClothingPage() {
  const { items, init, save, remove, setSize, isShared, personalItems, migrated, migrateFrom } = useClothing()
  const [view, setView] = useState<View>('liste')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [editing, setEditing] = useState<ClothingItem | null>(null)
  const [isNew, setIsNew] = useState(false)
  /** Låst som default — hindrer at antall/rader endres ved et uhell når man bare skal se */
  const [editMode, setEditMode] = useState(false)
  const [activeTagFilters, setActiveTagFilters] = useState<Set<string>>(new Set())
  const sharedIsEmpty = useSharedKlaerStore((s) => (s.data?.length ?? 0) === 0 && !s.loading)
  const needsMigration = isShared && personalItems.length > 0 && sharedIsEmpty && !migrated
  const [migrating, setMigrating] = useState(false)

  async function handleMigrate() {
    setMigrating(true)
    try { await migrateFrom() } finally { setMigrating(false) }
  }

  const categories = useMemo(() => Array.from(new Set(items.map(i => i.category))).sort(), [items])
  const tagSuggestions = useMemo(() => Array.from(new Set(items.flatMap(i => i.tags))).sort(), [items])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = [...items]
    if (q) list = list.filter(i =>
      i.category.toLowerCase().includes(q) ||
      i.tags.some(t => t.toLowerCase().includes(q)) ||
      i.note.toLowerCase().includes(q)
    )
    if (activeTagFilters.size > 0) {
      list = list.filter(i => Array.from(activeTagFilters).every(t => i.tags.includes(t)))
    }
    list.sort((a, b) => {
      let va: string | number = '', vb: string | number = ''
      if (sortKey === 'name') { va = a.category; vb = b.category }
      else { va = totalQty(a); vb = totalQty(b) }
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return list
  }, [items, search, activeTagFilters, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  function toggleTagFilter(tag: string) {
    setActiveTagFilters(prev => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag); else next.add(tag)
      return next
    })
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
          categories={categories}
          tagSuggestions={tagSuggestions}
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
          <p className="text-[11px] text-muted-foreground mb-0.5">Plaggtyper</p>
          <p className="text-base font-semibold">{items.length}</p>
        </div>
        <div className="rounded-lg border border-border bg-card px-4 py-3">
          <p className="text-[11px] text-muted-foreground mb-0.5">Totalt antall plagg</p>
          <p className="text-base font-semibold font-mono">{totalPlagg}</p>
        </div>
      </div>

      {/* Visningsbryter */}
      <div className="px-5 pb-2 flex items-center gap-1 shrink-0">
        <ViewTab active={view === 'liste'} onClick={() => setView('liste')} icon={List} label="Liste" />
        <ViewTab active={view === 'nettbutikk'} onClick={() => setView('nettbutikk')} icon={Store} label="Nettbutikk" />
      </div>

      {/* Filter-rad */}
      <div className="px-5 pb-3 flex flex-wrap items-center gap-2 shrink-0">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Søk kategori eller tag..." className="h-8 text-xs pl-8" />
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

      {/* Tag-filter (begge visninger) */}
      {tagSuggestions.length > 0 && (
        <div className="px-5 pb-3 flex flex-wrap items-center gap-1.5 shrink-0">
          <span className="text-[11px] text-muted-foreground mr-1">Filtrer på:</span>
          {tagSuggestions.map(tag => (
            <button
              key={tag}
              onClick={() => toggleTagFilter(tag)}
              className={cn(
                'rounded-full px-2 py-0.5 text-[11px] border transition-colors',
                activeTagFilters.has(tag)
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-muted/40 text-muted-foreground border-border hover:text-foreground'
              )}
            >
              {tag}
            </button>
          ))}
          {activeTagFilters.size > 0 && (
            <button onClick={() => setActiveTagFilters(new Set())} className="text-[11px] text-muted-foreground hover:text-foreground underline ml-1">
              Nullstill
            </button>
          )}
        </div>
      )}

      {view === 'liste' ? (
        <ClothingTable
          items={filtered}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={toggleSort}
          editMode={editMode}
          onEdit={openEdit}
          onRemove={remove}
          onSetSize={setSize}
        />
      ) : (
        <ClothingShop items={filtered} editMode={editMode} onEdit={openEdit} />
      )}
    </div>
  )
}

// ─── Visningsfane ───────────────────────────────────────────────────────────

function ViewTab({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof List; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
        active ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  )
}

// ─── Listevisning (tabell) ──────────────────────────────────────────────────

function ClothingTable({ items, sortKey, sortDir, onSort, editMode, onEdit, onRemove, onSetSize }: {
  items: ClothingItem[]
  sortKey: SortKey
  sortDir: SortDir
  onSort: (k: SortKey) => void
  editMode: boolean
  onEdit: (item: ClothingItem) => void
  onRemove: (id: string) => void
  onSetSize: (id: string, size: ClothingSize, qty: number) => void
}) {
  return (
    <div className="flex-1 overflow-auto px-5 pb-4">
      <table className="w-full text-xs border-collapse">
        <thead className="sticky top-0 z-10 bg-background border-b border-border">
          <tr>
            <Th k="name" label="Hva" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            {CLOTHING_SIZES.map(sz => (
              <th key={sz} className="py-2 px-1 text-center font-medium text-muted-foreground w-12">{sz}</th>
            ))}
            <Th k="total" label="Antall" sortKey={sortKey} sortDir={sortDir} onSort={onSort} right />
            <th className="w-16 py-2" />
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.id} className="border-b border-border/40 group hover:bg-muted/10 transition-colors">
              <td className={cn('py-2 px-3', editMode && 'cursor-pointer')} onClick={() => editMode && onEdit(item)}>
                <span className="font-medium">{item.category || <span className="text-muted-foreground italic">Uten navn</span>}</span>
                {item.tags.length > 0 && (
                  <span className="ml-1.5 inline-flex gap-1">
                    {item.tags.map(t => <TagChip key={t}>{t}</TagChip>)}
                  </span>
                )}
                {item.note && <p className="text-[10px] text-muted-foreground mt-0.5">{item.note}</p>}
              </td>
              {CLOTHING_SIZES.map(sz => (
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
        </tbody>
      </table>
      {items.length === 0 && (
        <p className="text-center text-muted-foreground text-xs py-8">Ingen plagg matcher filteret.</p>
      )}
    </div>
  )
}

// ─── Nettbutikk-visning (filtrerbart kort-galleri) ──────────────────────────

function ClothingShop({ items, editMode, onEdit }: {
  items: ClothingItem[]
  editMode: boolean
  onEdit: (item: ClothingItem) => void
}) {
  return (
    <div className="flex-1 overflow-auto px-5 pb-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {items.map(item => {
          const inStock = totalQty(item) > 0
          let hostname = ''
          if (item.storeUrl) { try { hostname = new URL(item.storeUrl).hostname.replace('www.', '') } catch { hostname = item.storeUrl } }
          return (
            <div
              key={item.id}
              onClick={() => editMode && onEdit(item)}
              className={cn(
                'rounded-lg border border-border bg-card p-3 flex flex-col gap-2',
                editMode && 'cursor-pointer hover:border-foreground/30 transition-colors'
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium">{item.category}</span>
                <span className={cn('shrink-0 h-2 w-2 rounded-full mt-1.5', inStock ? 'bg-green-500' : 'bg-muted')} title={inStock ? 'På lager' : 'Ikke på lager'} />
              </div>
              {item.tags.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {item.tags.map(t => <TagChip key={t}>{t}</TagChip>)}
                </div>
              ) : (
                <span className="text-[11px] text-muted-foreground italic">Ingen tagger</span>
              )}
              <div className="flex flex-wrap gap-1 mt-auto pt-1">
                {CLOTHING_SIZES.filter(sz => (item.sizes[sz] ?? 0) > 0).map(sz => (
                  <span key={sz} className="rounded border border-border px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                    {sz}: {item.sizes[sz]}
                  </span>
                ))}
                {totalQty(item) === 0 && <span className="text-[11px] text-muted-foreground/60">Ingen på lager</span>}
              </div>
              {item.note && <p className="text-[10px] text-muted-foreground">{item.note}</p>}
              {hostname && (
                <a href={item.storeUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="flex items-center gap-1 text-[11px] text-primary hover:underline">
                  <ExternalLink className="h-3 w-3 shrink-0" /> {hostname}
                </a>
              )}
            </div>
          )
        })}
      </div>
      {items.length === 0 && (
        <p className="text-center text-muted-foreground text-xs py-8">Ingen plagg matcher filteret.</p>
      )}
    </div>
  )
}

// ─── Tag-chip ───────────────────────────────────────────────────────────────

function TagChip({ children }: { children: string }) {
  return (
    <span className="inline-block rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground whitespace-nowrap">
      {children}
    </span>
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

// ─── Tag-input (frie merkelapper) ──────────────────────────────────────────────

function TagInput({ tags, onChange, suggestions }: {
  tags: string[]
  onChange: (tags: string[]) => void
  suggestions: string[]
}) {
  const [draft, setDraft] = useState('')

  function commit() {
    const v = draft.trim()
    if (v && !tags.some(t => t.toLowerCase() === v.toLowerCase())) onChange([...tags, v])
    setDraft('')
  }
  function remove(t: string) { onChange(tags.filter(x => x !== t)) }

  return (
    <div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {tags.map(t => (
            <span key={t} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px]">
              {t}
              <button type="button" onClick={() => remove(t)} className="text-muted-foreground hover:text-foreground">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <Input
        list="clothing-tag-suggestions"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit() } }}
        onBlur={commit}
        placeholder="f.eks. Hvit, trykk Enter..."
        className="text-xs h-8"
      />
      <datalist id="clothing-tag-suggestions">
        {suggestions.map(s => <option key={s} value={s} />)}
      </datalist>
    </div>
  )
}

// ─── Add / Edit dialog ────────────────────────────────────────────────────────

function ClothingDialog({ item, isNew, categories, tagSuggestions, onSave, onClose, onDelete }: {
  item: ClothingItem
  isNew: boolean
  categories: string[]
  tagSuggestions: string[]
  onSave: (item: ClothingItem) => void
  onClose: () => void
  onDelete?: () => void
}) {
  const [form, setForm] = useState<ClothingItem>(item)

  function set(patch: Partial<ClothingItem>) { setForm(f => ({ ...f, ...patch })) }

  const trimmedCategory = form.category.trim().toLowerCase()
  const otherCategories = categories.filter(c => c.toLowerCase() !== item.category.trim().toLowerCase())
  const isDuplicate = trimmedCategory !== '' && otherCategories.some(c => c.toLowerCase() === trimmedCategory)

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
              onChange={e => set({ category: e.target.value })}
              placeholder="f.eks. Body"
              className="text-xs h-8"
            />
            <datalist id="clothing-category-suggestions">
              {categories.map(c => <option key={c} value={c} />)}
            </datalist>
            {isDuplicate ? (
              <p className="text-[11px] text-red-400">Denne kategorien finnes allerede — rediger den raden i stedet, eller velg et annet navn.</p>
            ) : (
              <p className="text-[11px] text-muted-foreground">Én rad per kategori. Bruk tagger under for å beskrive varianter (farge, lengde osv.).</p>
            )}
          </div>

          {/* Tagger */}
          <div className="space-y-1.5">
            <Label className="text-xs">Tagger (valgfritt)</Label>
            <TagInput tags={form.tags} onChange={tags => set({ tags })} suggestions={tagSuggestions} />
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
