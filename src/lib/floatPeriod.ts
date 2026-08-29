import type { PeriodRange } from './dashboardPeriod'

/** Float day belongs to the dashboard period (same rule as «По дням»). */
export function floatDayInPeriod(
  date: string,
  range: PeriodRange | null,
): boolean {
  if (!range) return true
  return date >= range.startDate && date <= range.endDate
}

export function daysInPeriod<T extends { date: string }>(
  days: T[],
  range: PeriodRange | null,
): T[] {
  if (!range) return days
  return days.filter((d) => floatDayInPeriod(d.date, range))
}
