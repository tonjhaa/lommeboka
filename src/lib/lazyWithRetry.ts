import { lazy, type ComponentType, type LazyExoticComponent } from 'react'

/**
 * Laster en dynamisk modul med automatisk gjenoppretting ved stale chunk.
 *
 * Når en ny versjon er deployet forsvinner de gamle (hash-navngitte) chunkene.
 * En åpen fane som lazy-laster en rute får da «Failed to fetch dynamically
 * imported module». Vi laster siden på nytt ÉN gang for å hente det nye bygget.
 *
 * Vakten (sessionStorage) tømmes ved SUKSESS, slik at en SENERE deploy i samme
 * økt også får ett friskt forsøk. Den tømmes aldri ved feil, så en genuint
 * ødelagt chunk gir maks én reload og deretter en ekte feil (ingen reload-loop).
 *
 * Skilt ut som ren funksjon (storage + reload injiseres) for å være testbar.
 */
export async function loadWithRetry<T>(
  factory: () => Promise<T>,
  key: string,
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
  reload: () => void,
): Promise<T> {
  try {
    const mod = await factory()
    storage.removeItem(key)
    return mod
  } catch (e) {
    if (!storage.getItem(key)) {
      storage.setItem(key, '1')
      reload()
      // Siden lastes på nytt — la promiset henge så Suspense ikke viser feil.
      return new Promise<T>(() => {})
    }
    throw e
  }
}

/**
 * React.lazy med stale-chunk-gjenoppretting. Erstatter de tidligere dupliserte
 * lazyWithRetry-kopiene i App/EconomyPage/PartnerPage/CalculatorPage/ResultsPanel.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  const key = `lazy-reload-${factory.toString().slice(0, 60)}`
  return lazy(() => loadWithRetry(factory, key, sessionStorage, () => window.location.reload()))
}
