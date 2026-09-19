import { describe, it, expect } from 'vitest'
import { migrateAppState, useAppStore } from '../useAppStore'

const migrate = () => migrateAppState

describe('useAppStore-migrering: Navnejakten flyttet under Prosjekt', () => {
  it('sender en lagret «navnejakten»-side til Prosjekt → Navnejakten', () => {
    const out = migrate()({ currentView: 'economy', currentEconomyPage: 'navnejakten', prosjektTab: 'utstyr' }, 4)
    expect(out).toMatchObject({ currentView: 'ivf', prosjektTab: 'navnejakten', currentEconomyPage: 'dashboard' })
  })

  it('rører ikke annen lagret navigasjon', () => {
    const out = migrate()({ currentView: 'economy', currentEconomyPage: 'gaver', prosjektTab: 'klær' }, 4)
    expect(out).toMatchObject({ currentView: 'economy', currentEconomyPage: 'gaver', prosjektTab: 'klær' })
  })

  it('kan sette fanen som aktiv fane i Prosjekt', () => {
    useAppStore.getState().setProsjektTab('navnejakten')
    expect(useAppStore.getState().prosjektTab).toBe('navnejakten')
    useAppStore.getState().setProsjektTab('behandling')
  })
})
