import type { TotalPoint } from '../types/wallet'

/** Dashboard period presets: month / quarter / year / whole history. */
export type DashboardPeriodKey = '1m' | '3m' | '1y' | 'all'

export interface DashboardPeriodOption {
  key: DashboardPeriodKey
  label: string
}

export const DASHBOARD_PERIOD_OPTIONS: DashboardPeriodOption[] = [
  { key: '1m', label: 'Месяц' },
  { key: '3m', label: 'Квартал' },
  { key: '1y', label: 'Год' },
  { key: 'all', label: 'Всё время' },
]

export interface PeriodRange {
  startDate: string
  endDate: string
}

const PERIOD_MONTHS: Record<Exclude<DashboardPeriodKey, 'all'>, number> = {
  '1m': 1,
  '3m': 3,
  '1y': 12,
}

/** ISO date shifted by `deltaMonths`, day-of-month clamped to the target month length. */
export function shiftIsoMonths(isoDate: string, deltaMonths: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  if (!y || !m || !d) return isoDate
  const lastDay = new Date(Date.UTC(y, m - 1 + deltaMonths + 1, 0)).getUTCDate()
  const date = new Date(Date.UTC(y, m - 1 + deltaMonths, Math.min(d, lastDay)))
  const yy = date.getUTCFullYear()
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(date.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/**
 * Resolve a period preset to concrete check-in dates.
 * End = last check-in. Start = latest check-in on or before (end − N months),
 * falling back to the first check-in when history is shorter.
 * Returns null when fewer than two check-ins exist or the range is empty.
 */
export function resolveDashboardPeriod(
  key: DashboardPeriodKey,
  checkInDates: string[],
): PeriodRange | null {
  if (checkInDates.length < 2) return null
  const sorted = [...checkInDates].sort((a, b) => a.localeCompare(b))
  const endDate = sorted[sorted.length - 1]!
  if (key === 'all') {
    const startDate = sorted[0]!
    return startDate < endDate ? { startDate, endDate } : null
  }
  const target = shiftIsoMonths(endDate, -PERIOD_MONTHS[key])
  let startDate = sorted[0]!
  for (const date of sorted) {
    if (date > target) break
    startDate = date
  }
  return startDate < endDate ? { startDate, endDate } : null
}

/**
 * Slice a growth series to a range and rebase cumulative growth to the
 * range start: growth(range, d) = growth(d) − growth(startDate).
 * Assumes range boundaries are check-in dates present in the series.
 */
export function slicePeriodSeries(series: TotalPoint[], range: PeriodRange): TotalPoint[] {
  const anchor = series.find((p) => p.date === range.startDate)
  const baseGrowth = anchor?.growth ?? 0
  return series
    .filter((p) => p.date >= range.startDate && p.date <= range.endDate)
    .map((p) => ({ ...p, growth: p.growth - baseGrowth }))
}
