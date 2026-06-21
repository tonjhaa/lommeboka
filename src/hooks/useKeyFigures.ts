import { useMemo } from 'react'
import { useActiveEconomyStore } from '@/contexts/EconomyStoreContext'
import { resolveScalar, resolveDelingstall, isStale } from '@/domain/economy/keyFigureRegistry'
import type { KeyFigureKey } from '@/types/economy'

/** Resolverte nøkkeltall for inneværende år + staleness-sjekk. */
export function useKeyFigures() {
  const overrides = useActiveEconomyStore((s) => s.keyFigureOverrides)

  return useMemo(() => {
    const year = new Date().getFullYear()
    return {
      grunnbelop: resolveScalar('grunnbelop', overrides, year),
      feriepengerProsent: resolveScalar('feriepengerProsent', overrides, year),
      egenmeldingKvote: resolveScalar('egenmeldingKvote', overrides, year),
      folketrygdOpptjeningssats: resolveScalar('folketrygdOpptjeningssats', overrides, year),
      spkPaaslagLav: resolveScalar('spkPaaslagLav', overrides, year),
      spkPaaslagHoy: resolveScalar('spkPaaslagHoy', overrides, year),
      afpOpptjeningssats: resolveScalar('afpOpptjeningssats', overrides, year),
      takFolketrygdG: resolveScalar('takFolketrygdG', overrides, year),
      takSpkG: resolveScalar('takSpkG', overrides, year),
      delingstall: resolveDelingstall(overrides, year),
      stale: (key: KeyFigureKey) => isStale(key, overrides),
    }
  }, [overrides])
}
