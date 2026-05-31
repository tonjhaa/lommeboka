import type { PermisjonInput, PermisjonPeriode, PermisjonOppsummering } from '@/types/permisjon'

export function PermisjonAIChat(_props: {
  input: PermisjonInput
  perioder: PermisjonPeriode[]
  oppsummering: PermisjonOppsummering | null
}) {
  return <div className="text-muted-foreground text-sm p-4">AI-rådgiver kommer snart.</div>
}
