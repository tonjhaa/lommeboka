import { describe, it, expect, beforeEach } from 'vitest'
import { useEconomyStore } from '@/application/useEconomyStore'

describe('keyFigureOverrides-actions', () => {
  beforeEach(() => { useEconomyStore.setState({ keyFigureOverrides: [] }) })

  it('setKeyFigureOverride legger til / erstatter per (key,year)', () => {
    useEconomyStore.getState().setKeyFigureOverride({ key: 'grunnbelop', year: 2026, value: 140_000, verifiedAt: '2026-05-01' })
    useEconomyStore.getState().setKeyFigureOverride({ key: 'grunnbelop', year: 2026, value: 141_000, verifiedAt: '2026-05-02' })
    const ov = useEconomyStore.getState().keyFigureOverrides.filter((o) => o.key === 'grunnbelop' && o.year === 2026)
    expect(ov).toHaveLength(1)
    expect(ov[0].value).toBe(141_000)
  })

  it('removeKeyFigureOverride fjerner per (key,year)', () => {
    useEconomyStore.getState().setKeyFigureOverride({ key: 'grunnbelop', year: 2026, value: 140_000, verifiedAt: '2026-05-01' })
    useEconomyStore.getState().removeKeyFigureOverride('grunnbelop', 2026)
    expect(useEconomyStore.getState().keyFigureOverrides).toHaveLength(0)
  })
})
