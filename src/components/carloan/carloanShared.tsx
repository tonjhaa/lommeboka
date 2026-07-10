import type { ReactNode } from 'react'
import { Label } from '@/components/ui/label'
import { HelpTooltip } from '@/components/ui/help-tooltip'

export function fmtNOK(n: number): string {
  return Math.round(n).toLocaleString('no-NO') + ' kr'
}

/** Feltwrapper: label + valgfri hjelpetekst-tooltip + input */
export function Field({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  return (
    <div className="space-y-1 min-w-0">
      <Label className="text-xs flex items-center">
        {label}
        {help && <HelpTooltip content={help} />}
      </Label>
      {children}
    </div>
  )
}
