import type { MonthlyReturnRow } from './monthlyReturns'

export interface MonthlyRiskMetrics {
  monthCount: number
  /** Standard deviation of monthly returns (decimal). */
  volatilityPct: number | null
  /** Largest peak-to-trough decline on the cumulative return index. */
  maxDrawdownPct: number | null
  /** Share of months with positive return (0–1). */
  positiveMonthsRatio: number | null
  positiveMonths: number
}

function validReturns(rows: MonthlyReturnRow[]): number[] {
  return rows
    .map((r) => r.growthPct)
    .filter((v): v is number => v != null && Number.isFinite(v))
}

export function buildMonthlyRiskMetrics(rows: MonthlyReturnRow[]): MonthlyRiskMetrics {
  const returns = validReturns(rows)
  const monthCount = returns.length

  if (monthCount === 0) {
    return {
      monthCount: 0,
      volatilityPct: null,
      maxDrawdownPct: null,
      positiveMonthsRatio: null,
      positiveMonths: 0,
    }
  }

  const mean = returns.reduce((s, r) => s + r, 0) / monthCount
  const variance =
    monthCount > 1
      ? returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (monthCount - 1)
      : 0
  const volatilityPct = monthCount > 1 ? Math.sqrt(variance) : null

  let index = 1
  let peak = 1
  let maxDrawdown = 0
  for (const r of returns) {
    index *= 1 + r
    if (index > peak) peak = index
    if (peak > 0) {
      const drawdown = (peak - index) / peak
      if (drawdown > maxDrawdown) maxDrawdown = drawdown
    }
  }

  const positiveMonths = returns.filter((r) => r > 0).length

  return {
    monthCount,
    volatilityPct,
    maxDrawdownPct: monthCount > 0 ? maxDrawdown : null,
    positiveMonthsRatio: monthCount > 0 ? positiveMonths / monthCount : null,
    positiveMonths,
  }
}
