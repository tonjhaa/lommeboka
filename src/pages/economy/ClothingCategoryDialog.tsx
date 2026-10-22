import { useMemo, useState } from 'react'
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { SIZE_SCALES, inferSizeScale, type ClothingItem, type SizeScaleKey } from '@/domain/clothing/clothingTypes'
import { addCategory, removeCategory, renameCategory, summarizeCategories, type CategoryResult } from '@/domain/clothing/categoryOps'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const SCALE_KEYS = Object.keys(SIZE_SCALES) as SizeScaleKey[]

export function ClothingCategoryDialog({ items, onChange, onClose }: {
  items: ClothingItem[]
  onChange: (next: ClothingItem[]) => void
  onClose: () => void
}) {
  const summaries = useMemo(() => summarizeCategories(items), [items])
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newScale, setNewScale] = useState<SizeScaleKey>('hoyde')
  const [scaleTouched, setScaleTouched] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function apply(result: CategoryResult): boolean {
    if (!result.ok) { setError(result.error); return false }
    setError(null)
    onChange(result.items)
    return true
  }

  function startRename(category: string) {
    setRenaming(category); setRenameValue(category); setDeleting(null); setError(null)
  }
  function commitRename() {
    if (renaming !== null && apply(renameCategory(items, renaming, renameValue))) setRenaming(null)
  }
  function handleNewName(value: string) {
    setNewName(value)
    if (!scaleTouched) setNewScale(inferSizeScale(value))
  }
  function handleAdd() {
    if (apply(addCategory(items, newName, newScale, crypto.randomUUID()))) {
      setNewName(''); setScaleTouched(false); setNewScale('hoyde')
    }
  }

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">Kategorier</DialogTitle>
        </DialogHeader>

        <div className="space-y-1 max-h-[50vh] overflow-auto -mx-1 px-1">
          {summaries.map(s => (
            <div key={s.category} className="flex items-center gap-2 rounded-md border border-border/50 px-2.5 py-1.5 text-xs">
              {renaming === s.category ? (
                <>
                  <Input
                    autoFocus
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenaming(null) }}
                    className="h-7 text-xs flex-1"
                  />
                  <button aria-label="Lagre navn" onClick={commitRename} className="text-emerald-400 hover:text-emerald-300"><Check className="h-4 w-4" /></button>
                  <button aria-label="Avbryt" onClick={() => setRenaming(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
                </>
              ) : deleting === s.category ? (
                <>
                  <span className="flex-1 text-red-400">
                    Slette «{s.category}» med {s.rows} {s.rows === 1 ? 'rad' : 'rader'}{s.plagg > 0 ? ` og ${s.plagg} plagg` : ''}?
                  </span>
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-red-400 hover:text-red-300"
                    onClick={() => { onChange(removeCategory(items, s.category)); setDeleting(null) }}>Slett</Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setDeleting(null)}>Avbryt</Button>
                </>
              ) : (
                <>
                  <span className="flex-1 font-medium truncate">{s.category}</span>
                  <span className="text-muted-foreground whitespace-nowrap">
                    {SIZE_SCALES[s.sizeScale].label} · {s.rows} {s.rows === 1 ? 'rad' : 'rader'} · {s.plagg} plagg
                  </span>
                  <button aria-label={`Gi ${s.category} nytt navn`} onClick={() => startRename(s.category)} className="text-muted-foreground hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                  <button aria-label={`Slett ${s.category}`} onClick={() => { setDeleting(s.category); setRenaming(null); setError(null) }} className="text-muted-foreground hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
                </>
              )}
            </div>
          ))}
        </div>

        <div className="space-y-2 pt-3 border-t border-border">
          <Label className="text-xs">Ny kategori</Label>
          <div className="flex gap-2">
            <Input
              value={newName}
              onChange={e => handleNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
              placeholder="f.eks. Badetøy"
              className="h-8 text-xs flex-1"
            />
            <select
              value={newScale}
              onChange={e => { setScaleTouched(true); setNewScale(e.target.value as SizeScaleKey) }}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            >
              {SCALE_KEYS.map(k => <option key={k} value={k}>{SIZE_SCALES[k].label}</option>)}
            </select>
            <Button size="sm" className="h-8 gap-1 text-xs" onClick={handleAdd} disabled={!newName.trim()}>
              <Plus className="h-3.5 w-3.5" /> Legg til
            </Button>
          </div>
          {error && <p className="text-[11px] text-red-400">{error}</p>}
          <p className="text-[11px] text-muted-foreground">
            Gir du en kategori samme navn som en annen, slås de sammen (hvis de bruker samme størrelsestype).
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
