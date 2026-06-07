import { useState } from 'react'
import { Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { useEconomyStore } from '@/application/useEconomyStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

// ─── Types ───────────────────────────────────────────────────────────────────

type ItemStatus = 'kjøpe' | 'bestilt' | 'anskaffet' | 'arv_gave'
type ItemPriority = 'må_ha' | 'bra_å_ha' | 'kan_vente'

export interface BabyShoppingItem {
  id: string
  category: string
  name: string
  status: ItemStatus
  priority: ItemPriority
  budgeted: number
  actual: number
  note: string
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
const PRIORITY_COLORS: Record<ItemPriority, string> = {
  må_ha: 'border-red-500/40 text-red-400',
  bra_å_ha: 'border-amber-500/40 text-amber-400',
  kan_vente: 'border-border text-muted-foreground',
}

const DEFAULT_CATEGORIES: { name: string; items: Omit<BabyShoppingItem, 'id'>[] }[] = [
  {
    name: 'Søvn',
    items: [
      { category: 'Søvn', name: 'Vugge eller seng', status: 'kjøpe', priority: 'må_ha', budgeted: 2000, actual: 0, note: '' },
      { category: 'Søvn', name: 'Madrass', status: 'kjøpe', priority: 'må_ha', budgeted: 800, actual: 0, note: '' },
      { category: 'Søvn', name: 'Sengetøy/sengesett', status: 'kjøpe', priority: 'må_ha', budgeted: 400, actual: 0, note: '' },
      { category: 'Søvn', name: 'Sovepose (0–6 mnd)', status: 'kjøpe', priority: 'må_ha', budgeted: 500, actual: 0, note: '' },
      { category: 'Søvn', name: 'Baby-alarm/monitor', status: 'kjøpe', priority: 'bra_å_ha', budgeted: 1500, actual: 0, note: '' },
      { category: 'Søvn', name: 'Mørkeleggingsgardiner', status: 'kjøpe', priority: 'bra_å_ha', budgeted: 600, actual: 0, note: '' },
    ],
  },
  {
    name: 'Stell',
    items: [
      { category: 'Stell', name: 'Stellebord', status: 'kjøpe', priority: 'bra_å_ha', budgeted: 1200, actual: 0, note: '' },
      { category: 'Stell', name: 'Stelleunderlag', status: 'kjøpe', priority: 'må_ha', budgeted: 200, actual: 0, note: '' },
      { category: 'Stell', name: 'Bleier (str. 1 og 2)', status: 'kjøpe', priority: 'må_ha', budgeted: 600, actual: 0, note: '' },
      { category: 'Stell', name: 'Bleierpose/-bøtte', status: 'kjøpe', priority: 'bra_å_ha', budgeted: 400, actual: 0, note: '' },
      { category: 'Stell', name: 'Babykrem/sesamolje', status: 'kjøpe', priority: 'må_ha', budgeted: 200, actual: 0, note: '' },
      { category: 'Stell', name: 'Termometer (øre/panne)', status: 'kjøpe', priority: 'må_ha', budgeted: 300, actual: 0, note: '' },
      { category: 'Stell', name: 'Neglesaks/-fil', status: 'kjøpe', priority: 'må_ha', budgeted: 100, actual: 0, note: '' },
    ],
  },
  {
    name: 'Ernæring',
    items: [
      { category: 'Ernæring', name: 'Brystpumpe', status: 'kjøpe', priority: 'bra_å_ha', budgeted: 2000, actual: 0, note: '' },
      { category: 'Ernæring', name: 'Flasker (2–3 stk)', status: 'kjøpe', priority: 'bra_å_ha', budgeted: 400, actual: 0, note: '' },
      { category: 'Ernæring', name: 'Sterilisator', status: 'kjøpe', priority: 'bra_å_ha', budgeted: 600, actual: 0, note: '' },
      { category: 'Ernæring', name: 'Smokk', status: 'kjøpe', priority: 'kan_vente', budgeted: 150, actual: 0, note: '' },
      { category: 'Ernæring', name: 'Bibs/smekker (5–10 stk)', status: 'kjøpe', priority: 'må_ha', budgeted: 200, actual: 0, note: '' },
      { category: 'Ernæring', name: 'Høystol (fra ~6 mnd)', status: 'kjøpe', priority: 'kan_vente', budgeted: 1500, actual: 0, note: '' },
    ],
  },
  {
    name: 'Transport',
    items: [
      { category: 'Transport', name: 'Bilsete (0–13 kg)', status: 'kjøpe', priority: 'må_ha', budgeted: 3000, actual: 0, note: 'Obligatorisk ved hjemreise fra sykehus' },
      { category: 'Transport', name: 'Barnevogn', status: 'kjøpe', priority: 'må_ha', budgeted: 5000, actual: 0, note: '' },
      { category: 'Transport', name: 'Bæresele/bærestol', status: 'kjøpe', priority: 'bra_å_ha', budgeted: 1500, actual: 0, note: '' },
      { category: 'Transport', name: 'Regnslag til vogn', status: 'kjøpe', priority: 'bra_å_ha', budgeted: 400, actual: 0, note: '' },
    ],
  },
  {
    name: 'Klær',
    items: [
      { category: 'Klær', name: 'Bodyer (50/56/62 cm, 5–8 stk)', status: 'kjøpe', priority: 'må_ha', budgeted: 600, actual: 0, note: '' },
      { category: 'Klær', name: 'Sparkebukser/onesies (5–8 stk)', status: 'kjøpe', priority: 'må_ha', budgeted: 600, actual: 0, note: '' },
      { category: 'Klær', name: 'Luer (2 stk)', status: 'kjøpe', priority: 'må_ha', budgeted: 200, actual: 0, note: '' },
      { category: 'Klær', name: 'Votter (2–3 par)', status: 'kjøpe', priority: 'bra_å_ha', budgeted: 150, actual: 0, note: '' },
      { category: 'Klær', name: 'Ytterdrakt/overall', status: 'kjøpe', priority: 'bra_å_ha', budgeted: 800, actual: 0, note: '' },
    ],
  },
  {
    name: 'Bad',
    items: [
      { category: 'Bad', name: 'Babybadekar', status: 'kjøpe', priority: 'bra_å_ha', budgeted: 600, actual: 0, note: '' },
      { category: 'Bad', name: 'Badetermometer', status: 'kjøpe', priority: 'bra_å_ha', budgeted: 150, actual: 0, note: '' },
      { category: 'Bad', name: 'Mild babysåpe/shampoo', status: 'kjøpe', priority: 'må_ha', budgeted: 150, actual: 0, note: '' },
      { category: 'Bad', name: 'Mykebadehåndklær (2–3 stk)', status: 'kjøpe', priority: 'må_ha', budgeted: 400, actual: 0, note: '' },
    ],
  },
  {
    name: 'Lek & utvikling',
    items: [
      { category: 'Lek & utvikling', name: 'Gymstativ med hengere', status: 'kjøpe', priority: 'bra_å_ha', budgeted: 600, actual: 0, note: '' },
      { category: 'Lek & utvikling', name: 'Leke-/aktivitetsteppe', status: 'kjøpe', priority: 'bra_å_ha', budgeted: 400, actual: 0, note: '' },
      { category: 'Lek & utvikling', name: 'Rasler/grep-leker (0–6 mnd)', status: 'kjøpe', priority: 'kan_vente', budgeted: 200, actual: 0, note: '' },
      { category: 'Lek & utvikling', name: 'Mobil over seng', status: 'kjøpe', priority: 'kan_vente', budgeted: 400, actual: 0, note: '' },
    ],
  },
]

function fmtNOK(n: number) {
  return n.toLocaleString('no-NO') + ' kr'
}

function newId() { return crypto.randomUUID() }

// ─── Store hook (inline, lagres i useEconomyStore som misc JSON) ──────────────

function useBabyShopping() {
  const babyItems = useEconomyStore((s) => s.babyShoppingItems ?? []) as BabyShoppingItem[]
  const setBabyItems = useEconomyStore((s) => s.setBabyShoppingItems)

  function init() {
    const items: BabyShoppingItem[] = DEFAULT_CATEGORIES.flatMap(cat =>
      cat.items.map(item => ({ ...item, id: newId() }))
    )
    setBabyItems(items)
  }

  function toggle(id: string) {
    setBabyItems(babyItems.map(i =>
      i.id === id ? { ...i, status: i.status === 'anskaffet' ? 'kjøpe' : 'anskaffet' } : i
    ))
  }
  function update(id: string, patch: Partial<BabyShoppingItem>) {
    setBabyItems(babyItems.map(i => i.id === id ? { ...i, ...patch } : i))
  }
  function remove(id: string) {
    setBabyItems(babyItems.filter(i => i.id !== id))
  }
  function add(category: string) {
    setBabyItems([...babyItems, {
      id: newId(), category, name: '', status: 'kjøpe', priority: 'bra_å_ha',
      budgeted: 0, actual: 0, note: '',
    }])
  }

  return { items: babyItems, init, toggle, update, remove, add }
}

// ─── Main component ───────────────────────────────────────────────────────────

export function BabyShoppingPage() {
  const { items, init, toggle, update, remove, add } = useBabyShopping()
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-sm text-muted-foreground">Ingen innkjøpsliste ennå.</p>
        <Button onClick={init}>Last inn standardliste</Button>
      </div>
    )
  }

  const categories = Array.from(new Set(items.map(i => i.category)))
  const totalBudgeted = items.reduce((s, i) => s + (i.budgeted || 0), 0)
  const totalActual = items.reduce((s, i) => s + (i.actual || 0), 0)
  const done = items.filter(i => i.status === 'anskaffet' || i.status === 'arv_gave').length
  const pct = Math.round((done / items.length) * 100)

  function toggleCollapse(cat: string) {
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(cat) ? next.delete(cat) : next.add(cat)
      return next
    })
  }

  return (
    <div className="h-full overflow-y-auto px-6 py-5 space-y-4">

      {/* Oversikt */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border border-border bg-card px-4 py-3">
          <p className="text-[11px] text-muted-foreground mb-0.5">Fullført</p>
          <p className="text-lg font-semibold">{done} / {items.length}</p>
          <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card px-4 py-3">
          <p className="text-[11px] text-muted-foreground mb-0.5">Budsjettert</p>
          <p className="text-lg font-semibold font-mono">{fmtNOK(totalBudgeted)}</p>
        </div>
        <div className="rounded-lg border border-border bg-card px-4 py-3">
          <p className="text-[11px] text-muted-foreground mb-0.5">Faktisk betalt</p>
          <p className="text-lg font-semibold font-mono">{fmtNOK(totalActual)}</p>
        </div>
        <div className="rounded-lg border border-border bg-card px-4 py-3">
          <p className="text-[11px] text-muted-foreground mb-0.5">Gjenstår (budsjett)</p>
          <p className="text-lg font-semibold font-mono text-amber-400">
            {fmtNOK(items.filter(i => i.status === 'kjøpe' || i.status === 'bestilt').reduce((s, i) => s + i.budgeted, 0))}
          </p>
        </div>
      </div>

      {/* Kategorier */}
      {categories.map(cat => {
        const catItems = items.filter(i => i.category === cat)
        const isCollapsed = collapsed.has(cat)
        const catDone = catItems.filter(i => i.status === 'anskaffet' || i.status === 'arv_gave').length
        return (
          <Card key={cat}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <button
                  className="flex items-center gap-2 text-left"
                  onClick={() => toggleCollapse(cat)}
                >
                  {isCollapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
                  <CardTitle className="text-sm">{cat}</CardTitle>
                  <span className="text-xs text-muted-foreground">{catDone}/{catItems.length}</span>
                </button>
                <Button variant="ghost" size="sm" className="h-6 text-xs px-2 gap-1" onClick={() => add(cat)}>
                  <Plus className="h-3 w-3" /> Legg til
                </Button>
              </div>
            </CardHeader>
            {!isCollapsed && (
              <CardContent>
                <div className="space-y-2">
                  {catItems.map(item => (
                    <ItemRow key={item.id} item={item} onToggle={toggle} onUpdate={update} onRemove={remove} />
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        )
      })}
    </div>
  )
}

function ItemRow({
  item,
  onToggle,
  onUpdate,
  onRemove,
}: {
  item: BabyShoppingItem
  onToggle: (id: string) => void
  onUpdate: (id: string, patch: Partial<BabyShoppingItem>) => void
  onRemove: (id: string) => void
}) {
  const isDone = item.status === 'anskaffet' || item.status === 'arv_gave'

  return (
    <div className={cn(
      'flex items-start gap-2 rounded-md px-2 py-1.5 text-xs group transition-colors',
      isDone ? 'opacity-60' : 'hover:bg-muted/20'
    )}>
      {/* Checkbox */}
      <input
        type="checkbox"
        checked={isDone}
        onChange={() => onToggle(item.id)}
        className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-green-500"
      />

      {/* Navn */}
      <div className="flex-1 min-w-0 space-y-1">
        <Input
          value={item.name}
          onChange={e => onUpdate(item.id, { name: e.target.value })}
          className={cn('h-6 text-xs border-0 bg-transparent p-0 focus-visible:ring-0 focus-visible:ring-offset-0', isDone && 'line-through')}
          placeholder="Navn på utstyr..."
        />
        {item.note && <p className="text-[10px] text-muted-foreground">{item.note}</p>}
      </div>

      {/* Prioritet */}
      <select
        value={item.priority}
        onChange={e => onUpdate(item.id, { priority: e.target.value as ItemPriority })}
        className={cn('h-6 rounded border px-1 text-[10px] bg-background cursor-pointer', PRIORITY_COLORS[item.priority])}
      >
        {(Object.keys(PRIORITY_LABELS) as ItemPriority[]).map(p => (
          <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
        ))}
      </select>

      {/* Status */}
      <select
        value={item.status}
        onChange={e => onUpdate(item.id, { status: e.target.value as ItemStatus })}
        className={cn('h-6 rounded border border-border px-1 text-[10px] bg-background cursor-pointer', STATUS_COLORS[item.status])}
      >
        {(Object.keys(STATUS_LABELS) as ItemStatus[]).map(s => (
          <option key={s} value={s}>{STATUS_LABELS[s]}</option>
        ))}
      </select>

      {/* Budsjettert */}
      <div className="flex items-center gap-1 shrink-0">
        <Input
          type="number"
          value={item.budgeted || ''}
          onChange={e => onUpdate(item.id, { budgeted: parseInt(e.target.value) || 0 })}
          className="h-6 w-20 text-[10px] text-right font-mono"
          placeholder="budsjett"
        />
        <span className="text-muted-foreground">kr</span>
      </div>

      {/* Faktisk */}
      {isDone && (
        <div className="flex items-center gap-1 shrink-0">
          <Input
            type="number"
            value={item.actual || ''}
            onChange={e => onUpdate(item.id, { actual: parseInt(e.target.value) || 0 })}
            className="h-6 w-20 text-[10px] text-right font-mono text-green-400"
            placeholder="faktisk"
          />
          <span className="text-muted-foreground">kr</span>
        </div>
      )}

      {/* Slett */}
      <button
        onClick={() => onRemove(item.id)}
        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition-all"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
