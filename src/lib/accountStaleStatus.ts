import { lastSnapshotDateForAccount, snapshotDates } from '../engine/growthEngine'
import type { Account, BalanceSnapshot } from '../types/wallet'

export interface AccountStaleStatus {
  accountId: string
  lastRecordedDate: string | null
  daysSinceRecorded: number | null
  missingFromLatestCheckIn: boolean
}

function daysBetween(startDate: string, endDate: string): number {
  const start = Date.parse(`${startDate}T00:00:00Z`)
  const end = Date.parse(`${endDate}T00:00:00Z`)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0
  return Math.max(0, Math.round((end - start) / 86_400_000))
}

/** Account ids mentioned in any snapshot on the latest check-in date. */
export function accountIdsInLatestCheckIn(snapshots: BalanceSnapshot[]): Set<string> {
  const dates = snapshotDates(snapshots)
  if (dates.length === 0) return new Set()
  const latestDate = dates[dates.length - 1]!
  const ids = new Set<string>()
  for (const snap of snapshots) {
    if (snap.date !== latestDate) continue
    for (const line of snap.lines) ids.add(line.accountId)
  }
  return ids
}

export function buildAccountStaleStatuses(
  accounts: Account[],
  snapshots: BalanceSnapshot[],
): Map<string, AccountStaleStatus> {
  const dates = snapshotDates(snapshots)
  const asOf = dates[dates.length - 1] ?? null
  const latestIds = accountIdsInLatestCheckIn(snapshots)
  const map = new Map<string, AccountStaleStatus>()

  for (const account of accounts) {
    if (account.archived) continue
    const lastDate = lastSnapshotDateForAccount(account.id, snapshots)
    const daysSince =
      lastDate != null && asOf != null ? daysBetween(lastDate, asOf) : lastDate != null ? 0 : null
    map.set(account.id, {
      accountId: account.id,
      lastRecordedDate: lastDate,
      daysSinceRecorded: daysSince,
      missingFromLatestCheckIn: asOf != null && !latestIds.has(account.id),
    })
  }

  return map
}

export function formatStaleDays(days: number | null): string {
  if (days == null) return 'нет данных'
  if (days === 0) return 'обновлён в последнем чек-ине'
  const mod10 = days % 10
  const mod100 = days % 100
  if (mod10 === 1 && mod100 !== 11) return `${days} день назад`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${days} дня назад`
  return `${days} дней назад`
}
