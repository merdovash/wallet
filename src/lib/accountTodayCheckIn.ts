import type { BalanceSnapshot, SnapshotLine } from '../types/wallet'

export type AccountTodayCheckInPlan =
  | { action: 'create'; date: string; lines: SnapshotLine[] }
  | { action: 'update'; snapshotId: string; lines: SnapshotLine[] }

/** Один счёт на дату: новый чек-ин или merge строки в уже существующий за этот день. */
export function planAccountTodayCheckIn(
  accountId: string,
  amount: number,
  date: string,
  snapshots: BalanceSnapshot[],
): AccountTodayCheckInPlan {
  const lines: SnapshotLine[] = [{ accountId, amount }]
  const existing = snapshots.find((s) => s.date === date)
  if (existing) {
    return { action: 'update', snapshotId: existing.id, lines }
  }
  return { action: 'create', date, lines }
}
