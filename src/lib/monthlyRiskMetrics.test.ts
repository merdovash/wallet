import { describe, expect, it } from 'vitest'
import { buildMonthlyRiskMetrics } from './monthlyRiskMetrics'
import type { MonthlyReturnRow } from './monthlyReturns'

function row(growthPct: number | null, yearMonth = '2026-01'): MonthlyReturnRow {
  return {
    yearMonth,
    label: yearMonth,
    startDate: '2026-01-01',
    endDate: '2026-01-31',
    startTotal: 100,
    endTotal: 100,
    growth: 0,
    netFlow: 0,
    weightedCapital: 100,
    growthPct,
    annualizedPct: null,
  }
}

describe('buildMonthlyRiskMetrics', () => {
  it('computes volatility, drawdown and positive share', () => {
    const metrics = buildMonthlyRiskMetrics([
      row(0.02, '2026-01'),
      row(-0.01, '2026-02'),
      row(0.03, '2026-03'),
      row(-0.05, '2026-04'),
    ])
    expect(metrics.monthCount).toBe(4)
    expect(metrics.positiveMonths).toBe(2)
    expect(metrics.positiveMonthsRatio).toBe(0.5)
    expect(metrics.volatilityPct).not.toBeNull()
    expect(metrics.maxDrawdownPct).not.toBeNull()
    expect(metrics.maxDrawdownPct!).toBeGreaterThan(0)
  })

  it('returns null volatility for a single month', () => {
    const metrics = buildMonthlyRiskMetrics([row(0.01)])
    expect(metrics.volatilityPct).toBeNull()
    expect(metrics.positiveMonthsRatio).toBe(1)
  })
})
