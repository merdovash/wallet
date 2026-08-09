import { describe, expect, it } from 'vitest'
import { buildReturnBenchmarks } from './returnBenchmarks'

describe('buildReturnBenchmarks', () => {
  const rateBook = {
    '2025-01-01': { RUB: 1, USD: 100 },
    '2025-07-01': { RUB: 1, USD: 110 },
  }

  it('computes USD period and annualized change from CBR cache', () => {
    const b = buildReturnBenchmarks(0.12, 181, '2025-01-01', '2025-07-01', null, rateBook)
    expect(b.usdPeriodPct).toBeCloseTo(0.1, 6)
    expect(b.usdAnnualizedPct).not.toBeNull()
    expect(b.usdStartRate).toBe(100)
    expect(b.usdEndRate).toBe(110)
  })

  it('compares portfolio annualized to key rate and USD', () => {
    const b = buildReturnBenchmarks(0.15, 365, '2025-01-01', '2025-07-01', 0.16, rateBook)
    expect(b.keyRateAnnualizedPct).toBe(0.16)
    expect(b.vsKeyRatePct).toBeCloseTo(-0.01, 6)
    expect(b.vsUsdPct).not.toBeNull()
  })

  it('skips annualization for short periods', () => {
    const shortBook = {
      '2025-01-01': { RUB: 1, USD: 100 },
      '2025-01-11': { RUB: 1, USD: 110 },
    }
    const b = buildReturnBenchmarks(0.05, 10, '2025-01-01', '2025-01-11', 0.16, shortBook)
    expect(b.usdPeriodPct).toBeCloseTo(0.1, 6)
    expect(b.usdAnnualizedPct).toBeNull()
  })
})
