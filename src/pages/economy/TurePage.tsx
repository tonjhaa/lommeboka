import 'leaflet/dist/leaflet.css'
import { useState, useRef, useCallback } from 'react'
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { Plus, Trash2, Pencil, Check, X, Map, ShoppingCart, CheckSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useTurStore, DEFAULT_LAT, DEFAULT_LNG } from '@/application/useTurStore'
import type { TurItem, TurItemType, TurPlan } from '@/application/useTurStore'

// ── Kart-hjelpere ────────────────────────────────────────────────

function createNumberedIcon(number: number, type: TurItemType, done: boolean) {
  const bg = done ? '#6b7280' : type === 'gjøremål' ? '#3b82f6' : '#f59e0b'
  return L.divIcon({
    className: '',
    html: `<div style="width:28px;height:28px;background:${bg};border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;font-size:11px;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35);opacity:${done ? 0.6 : 1}">${number}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  })
}

// Komponent som lytter på klikk på kartet for å plassere et nytt element
function MapClickListener({
  onMapClick,
}: {
  onMapClick: (lat: number, lng: number) => void
}) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

// ── Listeseksjon ─────────────────────────────────────────────────

function ListSection({
  type,
  items,
  planId,
  allItems,
  onHighlight,
  highlightedId,
  onRequestPlace,
  placingItemId,
}: {
  type: TurItemType
  items: TurItem[]
  planId: string
  allItems: TurItem[]
  onHighlight: (id: string | null) => void
  highlightedId: string | null
  onRequestPlace: (itemId: string) => void
  placingItemId: string | null
}) {
  const { addItem, updateItem, removeItem, toggleDone } = useTurStore()
  const [newText, setNewText] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')

  function handleAdd() {
    const text = newText.trim()
    if (!text) return
    // Plasser litt offset fra siste punkt, eller standard Norway-posisjon
    const last = [...allItems].reverse().find((it) => it)
    const lat = last ? last.lat + (Math.random() - 0.5) * 0.02 : DEFAULT_LAT
    const lng = last ? last.lng + (Math.random() - 0.5) * 0.02 : DEFAULT_LNG
    const id = addItem(planId, type, text, lat, lng)
    setNewText('')
    // Start plassering på kart
    onRequestPlace(id)
  }

  function startEdit(item: TurItem) {
    setEditingId(item.id)
    setEditText(item.text)
  }

  function confirmEdit(itemId: string) {
    const text = editText.trim()
    if (text) updateItem(planId, itemId, { text })
    setEditingId(null)
  }

  const label = type === 'gjøremål' ? 'Gjøremål' : 'Handleliste'
  const Icon = type === 'gjøremål' ? CheckSquare : ShoppingCart
  const accent = type === 'gjøremål' ? 'text-blue-400' : 'text-amber-400'
  const bgAccent = type === 'gjøremål' ? 'bg-blue-500/10 border-blue-500/20' : 'bg-amber-500/10 border-amber-500/20'

  // Global index for this item type (for pin numbering)
  const gjøremålItems = allItems.filter((it) => it.type === 'gjøremål')
  const offset = type === 'gjøremål' ? 0 : gjøremålItems.length

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Icon className={cn('h-3.5 w-3.5', accent)} />
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className="ml-auto text-xs text-muted-foreground/50">{items.length} stk</span>
      </div>

      <div className="space-y-1">
        {items.length === 0 && (
          <p className="text-xs text-muted-foreground/40 py-1 pl-1">Ingen {label.toLowerCase()} ennå</p>
        )}
        {items.map((item, idx) => {
          const pinNumber = offset + idx + 1
          const isHighlighted = highlightedId === item.id
          const isPlacing = placingItemId === item.id
          return (
            <div
              key={item.id}
              className={cn(
                'group flex items-center gap-1.5 rounded border px-2 py-1.5 text-xs cursor-pointer transition-colors',
                isHighlighted ? bgAccent : 'border-border/30 bg-card/20 hover:bg-muted/20',
                isPlacing && 'ring-2 ring-primary/40',
              )}
              onClick={() => onHighlight(isHighlighted ? null : item.id)}
            >
              {/* Pin-nummer */}
              <span
                className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white',
                  item.done ? 'bg-gray-500/60' : type === 'gjøremål' ? 'bg-blue-500' : 'bg-amber-500',
                )}
              >
                {pinNumber}
              </span>

              {editingId === item.id ? (
                <>
                  <Input
                    className="h-5 text-xs flex-1 px-1"
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') confirmEdit(item.id); if (e.key === 'Escape') setEditingId(null) }}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                  <button onClick={(e) => { e.stopPropagation(); confirmEdit(item.id) }} className="text-green-400 hover:text-green-300"><Check className="h-3.5 w-3.5" /></button>
                  <button onClick={(e) => { e.stopPropagation(); setEditingId(null) }} className="text-muted-foreground/50 hover:text-muted-foreground"><X className="h-3.5 w-3.5" /></button>
                </>
              ) : (
                <>
                  <button
                    className={cn('flex-1 text-left', item.done && 'line-through opacity-50')}
                    onClick={(e) => { e.stopPropagation(); toggleDone(planId, item.id) }}
                  >
                    {item.text}
                  </button>
                  <span className="text-muted-foreground/30 text-[9px] opacity-0 group-hover:opacity-100">
                    {item.lat.toFixed(3)},{item.lng.toFixed(3)}
                  </span>
                  <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      title="Plasser på kart"
                      onClick={(e) => { e.stopPropagation(); onRequestPlace(item.id) }}
                      className={cn('p-0.5 rounded hover:text-primary', isPlacing ? 'text-primary' : 'text-muted-foreground/40')}
                    >
                      <Map className="h-3 w-3" />
                    </button>
                    <button
                      title="Rediger"
                      onClick={(e) => { e.stopPropagation(); startEdit(item) }}
                      className="p-0.5 rounded text-muted-foreground/40 hover:text-foreground"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      title="Fjern"
                      onClick={(e) => { e.stopPropagation(); removeItem(planId, item.id) }}
                      className="p-0.5 rounded text-muted-foreground/40 hover:text-red-400"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>

      {/* Legg til-rad */}
      <div className="flex gap-1.5">
        <Input
          className="h-7 text-xs flex-1"
          placeholder={`Legg til ${label.toLowerCase()}…`}
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
        />
        <Button size="sm" className="h-7 px-2" onClick={handleAdd} disabled={!newText.trim()}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

// ── Kartkomponent ────────────────────────────────────────────────

function TurMap({
  plan,
  highlightedId,
  placingItemId,
  onPlaceItem,
  onMarkerDrag,
  onMarkerClick,
}: {
  plan: TurPlan
  highlightedId: string | null
  placingItemId: string | null
  onPlaceItem: (lat: number, lng: number) => void
  onMarkerDrag: (itemId: string, lat: number, lng: number) => void
  onMarkerClick: (itemId: string) => void
}) {
  const gjøremålItems = plan.items.filter((it) => it.type === 'gjøremål')
  const items = plan.items

  const center: [number, number] =
    items.length > 0
      ? [
          items.reduce((s, it) => s + it.lat, 0) / items.length,
          items.reduce((s, it) => s + it.lng, 0) / items.length,
        ]
      : [DEFAULT_LAT, DEFAULT_LNG]

  return (
    <MapContainer
      center={center}
      zoom={items.length > 0 ? 8 : 5}
      style={{ height: '100%', width: '100%', borderRadius: '0.5rem' }}
      className="z-0"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {placingItemId && <MapClickListener onMapClick={onPlaceItem} />}
      {items.map((item) => {
        const offset = item.type === 'handleliste' ? gjøremålItems.length : 0
        const typeIdx = item.type === 'gjøremål'
          ? gjøremålItems.findIndex((it) => it.id === item.id)
          : plan.items.filter((it) => it.type === 'handleliste').findIndex((it) => it.id === item.id)
        const pinNumber = offset + typeIdx + 1

        return (
          <Marker
            key={item.id}
            position={[item.lat, item.lng]}
            icon={createNumberedIcon(pinNumber, item.type, item.done)}
            draggable
            eventHandlers={{
              dragend(e) {
                const latlng = (e.target as L.Marker).getLatLng()
                onMarkerDrag(item.id, latlng.lat, latlng.lng)
              },
              click() {
                onMarkerClick(item.id)
              },
            }}
            opacity={item.id === highlightedId ? 1 : 0.85}
          />
        )
      })}
    </MapContainer>
  )
}

// ── Reiseplaner-side ─────────────────────────────────────────────

export function TurePage() {
  const { plans, activePlanId, createPlan, updatePlanName, deletePlan, setActivePlan, updateItem } = useTurStore()
  const [highlightedId, setHighlightedId] = useState<string | null>(null)
  const [placingItemId, setPlacingItemId] = useState<string | null>(null)
  const [newPlanName, setNewPlanName] = useState('')
  const [editingPlanName, setEditingPlanName] = useState(false)
  const [planNameDraft, setPlanNameDraft] = useState('')
  const planNameInputRef = useRef<HTMLInputElement>(null)

  const activePlan = plans.find((p) => p.id === activePlanId) ?? null
  const gjøremålItems = activePlan?.items.filter((it) => it.type === 'gjøremål') ?? []
  const handlelItems = activePlan?.items.filter((it) => it.type === 'handleliste') ?? []

  const handleMapClick = useCallback(
    (lat: number, lng: number) => {
      if (!placingItemId || !activePlanId) return
      updateItem(activePlanId, placingItemId, { lat, lng })
      setPlacingItemId(null)
    },
    [placingItemId, activePlanId, updateItem],
  )

  const handleMarkerDrag = useCallback(
    (itemId: string, lat: number, lng: number) => {
      if (!activePlanId) return
      updateItem(activePlanId, itemId, { lat, lng })
    },
    [activePlanId, updateItem],
  )

  function handleCreatePlan() {
    const name = newPlanName.trim() || 'Ny tur'
    createPlan(name)
    setNewPlanName('')
  }

  function startEditPlanName() {
    if (!activePlan) return
    setPlanNameDraft(activePlan.name)
    setEditingPlanName(true)
    setTimeout(() => planNameInputRef.current?.focus(), 0)
  }

  function confirmPlanName() {
    if (!activePlanId) return
    const name = planNameDraft.trim()
    if (name) updatePlanName(activePlanId, name)
    setEditingPlanName(false)
  }

  const totalItems = (activePlan?.items.length ?? 0)

  return (
    <div className="flex flex-col h-full gap-3 p-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Reiseplanlegger</h1>
          <p className="text-xs text-muted-foreground">Gjøremål og handleliste med veipunkter på kart</p>
        </div>
        {activePlan && (
          <span className="text-xs text-muted-foreground">
            {totalItems} veipunkt{totalItems !== 1 ? 'er' : ''} totalt
          </span>
        )}
      </div>

      {/* Tur-velger */}
      <div className="flex items-center gap-2 flex-wrap">
        {plans.map((p) => (
          <button
            key={p.id}
            onClick={() => setActivePlan(p.id)}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
              p.id === activePlanId
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border/50 text-muted-foreground hover:border-border hover:text-foreground',
            )}
          >
            {p.name}
          </button>
        ))}
        <div className="flex gap-1">
          <Input
            className="h-7 text-xs w-28"
            placeholder="Navn på tur…"
            value={newPlanName}
            onChange={(e) => setNewPlanName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreatePlan() }}
          />
          <Button size="sm" className="h-7 px-2" onClick={handleCreatePlan}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {!activePlan && (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
          Opprett en tur for å komme i gang
        </div>
      )}

      {activePlan && (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-3 min-h-0">
          {/* Venstrepanel: Lister */}
          <div className="flex flex-col gap-4 overflow-y-auto pr-1">
            {/* Tur-navn */}
            <div className="flex items-center gap-2">
              {editingPlanName ? (
                <>
                  <Input
                    ref={planNameInputRef}
                    className="h-7 text-xs flex-1"
                    value={planNameDraft}
                    onChange={(e) => setPlanNameDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') confirmPlanName(); if (e.key === 'Escape') setEditingPlanName(false) }}
                    onBlur={confirmPlanName}
                  />
                  <button onClick={confirmPlanName} className="text-green-400"><Check className="h-3.5 w-3.5" /></button>
                </>
              ) : (
                <>
                  <span className="text-sm font-medium">{activePlan.name}</span>
                  <button onClick={startEditPlanName} className="text-muted-foreground/40 hover:text-foreground">
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => { if (confirm(`Slett turen «${activePlan.name}»?`)) deletePlan(activePlan.id) }}
                    className="ml-auto text-muted-foreground/30 hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>

            {placingItemId && (
              <div className="rounded border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-primary animate-pulse">
                Klikk på kartet for å plassere veipunktet. Trykk Esc for å avbryte.
              </div>
            )}

            <ListSection
              type="gjøremål"
              items={gjøremålItems}
              planId={activePlan.id}
              allItems={activePlan.items}
              onHighlight={setHighlightedId}
              highlightedId={highlightedId}
              onRequestPlace={(id) => setPlacingItemId((prev) => prev === id ? null : id)}
              placingItemId={placingItemId}
            />

            <ListSection
              type="handleliste"
              items={handlelItems}
              planId={activePlan.id}
              allItems={activePlan.items}
              onHighlight={setHighlightedId}
              highlightedId={highlightedId}
              onRequestPlace={(id) => setPlacingItemId((prev) => prev === id ? null : id)}
              placingItemId={placingItemId}
            />
          </div>

          {/* Høyrepanel: Kart */}
          <div
            className={cn(
              'rounded-lg border border-border/60 overflow-hidden min-h-64 lg:min-h-0',
              placingItemId && 'ring-2 ring-primary/40 cursor-crosshair',
            )}
            onKeyDown={(e) => { if (e.key === 'Escape') setPlacingItemId(null) }}
            tabIndex={0}
          >
            <TurMap
              plan={activePlan}
              highlightedId={highlightedId}
              placingItemId={placingItemId}
              onPlaceItem={handleMapClick}
              onMarkerDrag={handleMarkerDrag}
              onMarkerClick={(id) => setHighlightedId((prev) => prev === id ? null : id)}
            />
          </div>
        </div>
      )}
    </div>
  )
}
