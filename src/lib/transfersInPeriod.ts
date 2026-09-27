import type { PeriodRange } from './dashboardPeriod'

type TransferRef = {
  date: string
  fromAccountId: string
  toAccountId: string
}

/**
 * True when at least one transfer falls on a check-in date inside the range
 * (inclusive). Without a range, any matching transfer counts.
 * Pass `accountId` to ignore transfers that do not touch that account.
 */
export function hasTransfersInPeriod(
  transfers: TransferRef[],
  range?: PeriodRange | null,
  accountId?: string | null,
): boolean {
  return transfers.some((transfer) => {
    if (range && (transfer.date < range.startDate || transfer.date > range.endDate)) {
      return false
    }
    if (
      accountId &&
      transfer.fromAccountId !== accountId &&
      transfer.toAccountId !== accountId
    ) {
      return false
    }
    return true
  })
}
