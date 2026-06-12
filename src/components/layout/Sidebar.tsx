import { useState } from 'react'
import { Plus, Trash2, Copy, Home } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { useNewScenario } from '@/hooks/useNewScenario'
import { useCalculator } from '@/hooks/useCalculator'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { ScenarioInput } from '@/types'

function ScenarioItem({ scenario }: { scenario: ScenarioInput }) {
  const activeId = useAppStore((s) => s.activeScenarioId)
  const setActive = useAppStore((s) => s.setActiveScenario)
  const removeScenario = useAppStore((s) => s.removeScenario)
  const { createFromExisting } = useNewScenario()
  const { analysis } = useCalculator(scenario.id)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const isActive = activeId === scenario.id
  const approved = analysis?.status.approved

  return (
    <div
      className={cn(
        'group relative flex items-center gap-2 rounded-md px-3 py-2.5 cursor-pointer transition-colors',
        isActive
          ? 'bg-primary/15 border border-primary/30'
          : 'hover:bg-accent border border-transparent'
      )}
      onClick={() => setActive(scenario.id)}
    >
      <div
        className={cn(
          'h-2 w-2 rounded-full shrink-0',
          approved === undefined
            ? 'bg-muted-foreground'
            : approved
            ? 'bg-green-400'
            : 'bg-red-400'
        )}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate" title={scenario.label}>{scenario.label}</p>
        {analysis && (
          <p className="text-xs text-muted-foreground">
            {new Intl.NumberFormat('nb-NO', {
              style: 'currency',
              currency: 'NOK',
              maximumFractionDigits: 0,
            }).format(scenario.property.price)}
          </p>
        )}
      </div>

      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={(e) => { e.stopPropagation(); createFromExisting(scenario) }}
          title="Dupliser"
        >
          <Copy className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-destructive hover:text-destructive"
          onClick={(e) => { e.stopPropagation(); setConfirmingDelete(true) }}
          title="Slett"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {confirmingDelete && (
        <Dialog open onOpenChange={(open) => { if (!open) setConfirmingDelete(false) }}>
          <DialogContent className="max-w-xs" onClick={(e) => e.stopPropagation()}>
            <DialogHeader>
              <DialogTitle>Slett scenario</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Er du sikker på at du vil slette <span className="font-medium text-foreground">«{scenario.label}»</span>?
              Dette kan ikke angres.
            </p>
            <div className="flex gap-2 justify-end pt-1">
              <Button variant="outline" size="sm" onClick={() => setConfirmingDelete(false)}>Avbryt</Button>
              <Button variant="destructive" size="sm" onClick={() => { removeScenario(scenario.id); setConfirmingDelete(false) }}>
                Slett
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

export function Sidebar() {
  const scenarios = useAppStore((s) => s.scenarios)
  const { createScenario } = useNewScenario()

  return (
    <aside className="flex flex-col w-64 shrink-0 border-r border-sidebar-border bg-sidebar h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <Home className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-sidebar-foreground">Scenarioer</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={createScenario}
          title="Nytt scenario"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {scenarios.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-8 px-4 text-center">
            <p className="text-xs text-muted-foreground">
              Ingen scenarioer ennå. Klikk + for å starte.
            </p>
          </div>
        ) : (
          scenarios.map((s) => <ScenarioItem key={s.id} scenario={s} />)
        )}
      </div>

      <div className="p-3 border-t border-sidebar-border">
        <Button
          variant="outline"
          size="sm"
          className="w-full gap-2 text-xs"
          onClick={createScenario}
        >
          <Plus className="h-3.5 w-3.5" />
          Nytt scenario
        </Button>
      </div>
    </aside>
  )
}
