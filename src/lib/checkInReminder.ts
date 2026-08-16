import { snapshotDates } from '../engine/growthEngine'
import type { BalanceSnapshot } from '../types/wallet'

export const CHECK_IN_INTERVAL_STORAGE_KEY = 'wallet-checkin-interval-days'
export const DEFAULT_CHECK_IN_INTERVAL_DAYS = 7
export const CHECK_IN_INTERVAL_OPTIONS = [1, 3, 7, 14, 30] as const

export type CheckInReminderStatus =
  | { kind: 'empty'; intervalDays: number }
  | {
      kind: 'ok'
      intervalDays: number
      latestDate: string
      daysSince: number
      daysUntilDue: number
    }
  | {
      kind: 'due'
      intervalDays: number
      latestDate: string
      daysSince: number
      daysOverdue: number
    }

function daysBetween(startDate: string, endDate: string): number {
  const start = Date.parse(`${startDate}T00:00:00Z`)
  const end = Date.parse(`${endDate}T00:00:00Z`)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0
  return Math.max(0, Math.round((end - start) / 86_400_000))
}

export function normalizeCheckInIntervalDays(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n < 1) return DEFAULT_CHECK_IN_INTERVAL_DAYS
  return Math.min(365, Math.round(n))
}

export function readCheckInIntervalDays(): number {
  try {
    const raw = localStorage.getItem(CHECK_IN_INTERVAL_STORAGE_KEY)
    if (raw == null) return DEFAULT_CHECK_IN_INTERVAL_DAYS
    return normalizeCheckInIntervalDays(Number(raw))
  } catch {
    return DEFAULT_CHECK_IN_INTERVAL_DAYS
  }
}

export function writeCheckInIntervalDays(days: number): void {
  const normalized = normalizeCheckInIntervalDays(days)
  try {
    localStorage.setItem(CHECK_IN_INTERVAL_STORAGE_KEY, String(normalized))
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event('wallet-checkin-interval-changed'))
}

export function buildCheckInReminderStatus(
  snapshots: BalanceSnapshot[],
  intervalDays: number,
  today: string,
): CheckInReminderStatus {
  const interval = normalizeCheckInIntervalDays(intervalDays)
  const dates = snapshotDates(snapshots)
  const latestDate = dates[dates.length - 1]
  if (!latestDate) return { kind: 'empty', intervalDays: interval }

  const daysSince = daysBetween(latestDate, today)
  if (daysSince >= interval) {
    return {
      kind: 'due',
      intervalDays: interval,
      latestDate,
      daysSince,
      daysOverdue: daysSince - interval,
    }
  }

  return {
    kind: 'ok',
    intervalDays: interval,
    latestDate,
    daysSince,
    daysUntilDue: interval - daysSince,
  }
}

export function formatDaysRu(days: number): string {
  const mod10 = days % 10
  const mod100 = days % 100
  if (mod10 === 1 && mod100 !== 11) return `${days} день`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${days} дня`
  return `${days} дней`
}
