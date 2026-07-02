import { useMemo } from 'react'
import { useActiveEconomyStore } from '@/contexts/EconomyStoreContext'
import { useKeyFigures } from '@/hooks/useKeyFigures'
import { buildPensionInputFromProfile, type PensionInput } from '@/domain/economy/pensionCalculator'
import { DEFAULT_PENSION_SETTINGS } from '@/application/useEconomyStore'
import type { PensionSettings } from '@/types/economy'

export type PensionBaseInput = Omit<PensionInput, 'uttaksalder'>

/**
 * Kanonisk pensjonsinput. Én kilde for Pensjon-siden, dashbord-chipen og
 * Simulatoren, slik at alle tre projiserer med identiske forutsetninger
 * (G, delingstall, opptjeningssatser, SPK-grunnlag).
 *
 * baseInput er null når profil mangler eller kohorten ikke støttes av modellen
 * (født før 1963). Mangler fødselsår brukes DEFAULT-fallback — sjekk
 * `hasBirthYear` der visningen krever at brukeren faktisk har oppgitt det
 * (dashbord-chip, Pensjon-siden).
 */
export function usePensionBaseInput(): {
  baseInput: PensionBaseInput | null
  settings: PensionSettings
  hasBirthYear: boolean
} {
  const profile = useActiveEconomyStore((s) => s.profile)
  const prefs = useActiveEconomyStore((s) => s.userPreferences)
  const stored = useActiveEconomyStore((s) => s.pensionSettings)
  const kf = useKeyFigures()

  return useMemo(() => {
    const settings: PensionSettings = stored ?? {
      ...DEFAULT_PENSION_SETTINGS,
      birthYear: prefs?.birthYear ?? DEFAULT_PENSION_SETTINGS.birthYear,
    }
    const hasBirthYear = Boolean(stored || prefs?.birthYear)
    if (!profile) return { baseInput: null, settings, hasBirthYear }
    try {
      const baseInput = buildPensionInputFromProfile(
        profile, settings, new Date().getFullYear(),
        kf.grunnbelop,
        kf.delingstall,
        {
          folketrygd: kf.folketrygdOpptjeningssats,
          spkLav: kf.spkPaaslagLav,
          spkHoy: kf.spkPaaslagHoy,
          afp: kf.afpOpptjeningssats,
          takFolketrygdG: kf.takFolketrygdG,
          takSpkG: kf.takSpkG,
        },
      )
      return { baseInput, settings, hasBirthYear }
    } catch {
      // Født før 1963 / ugyldig input — modellen støtter ikke kohorten.
      return { baseInput: null, settings, hasBirthYear }
    }
  }, [profile, prefs?.birthYear, stored, kf])
}
