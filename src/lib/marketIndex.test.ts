import { describe, expect, it } from 'vitest'
import {
  pointsToRatePct,
  ratePctToPoints,
  resolveIndexValues,
} from './marketIndex'
import type { MarketIndex } from '../types/wallet'

describe('marketIndex helpers', () => {
  it('rounds percentage point conversions to avoid floating tails', () => {
    expect(ratePctToPoints(0.14)).toBe(14)
    expect(pointsToRatePct(14)).toBe(0.14)
  })

  it('rounds derived rate values after adding spread', () => {
    const baseIndex: MarketIndex = {
      id: 'base',
      name: 'Base',
      kind: 'annual_rate',
      currency: 'RUB',
      color: '#2563eb',
    }
    const derivedIndex: MarketIndex = {
      id: 'derived',
      name: 'Derived',
      kind: 'derived_rate',
      currency: 'RUB',
      baseIndexId: 'base',
      rateSpreadPct: 0.01,
      color: '#059669',
    }

    expect(
      resolveIndexValues('derived', [baseIndex, derivedIndex], [
        { indexId: 'base', date: '2026-01-01', value: 0.13 },
      ])[0]?.value,
    ).toBe(0.14)
  })
})
