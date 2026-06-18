import { describe, it, expect } from 'vitest'
import { getDelingstall, DELINGSTALL_BASELINE } from '@/config/economy.config'

describe('getDelingstall', () => {
  it('returnerer eksakt tabellverdi for kjent alder', () => {
    expect(getDelingstall(67)).toBe(DELINGSTALL_BASELINE[67])
  })

  it('interpolerer lineært mellom to aldre', () => {
    const mid = (DELINGSTALL_BASELINE[67] + DELINGSTALL_BASELINE[68]) / 2
    expect(getDelingstall(67.5)).toBeCloseTo(mid, 4)
  })

  it('klamrer til ytterpunktene utenfor tabellen', () => {
    const minAlder = Math.min(...Object.keys(DELINGSTALL_BASELINE).map(Number))
    const maxAlder = Math.max(...Object.keys(DELINGSTALL_BASELINE).map(Number))
    expect(getDelingstall(minAlder - 5)).toBe(DELINGSTALL_BASELINE[minAlder])
    expect(getDelingstall(maxAlder + 5)).toBe(DELINGSTALL_BASELINE[maxAlder])
  })

  it('senere uttak gir lavere delingstall (monotont, hvert steg)', () => {
    const aldre = Object.keys(DELINGSTALL_BASELINE).map(Number).sort((a, b) => a - b)
    for (let i = 1; i < aldre.length; i++) {
      expect(getDelingstall(aldre[i])).toBeLessThan(getDelingstall(aldre[i - 1]))
    }
  })
})
