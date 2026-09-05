import {
  balanceOnDate,
  netWorthAmount,
  type RateBook,
} from '../engine/growthEngine'
import { isGrowthAccount } from './accountKinds'
import { transferReceivedAmount } from './transferAmounts'
import { toBase } from './currency'
import { resolvePivotForDate } from './cbrRates'
import type {
  Account,
  BalanceSnapshot,
  SnapshotLine,
  Transfer,
  WalletSettings,
} from '../types/wallet'

export interface SuggestCheckInCashflowInput {
  date: string
  accounts: Account[]
  snapshots: BalanceSnapshot[]
  settings: WalletSettings
  /** Effective balances for the check-in (typed + carried). */
  lines: SnapshotLine[]
  /** Transfers on this date (saved + pending). */
  transfers: Array<Pick<Transfer, 'fromAccountId' | 'toAccountId' | 'amount' | 'toAmount'>>
  rateBook?: RateBook
  /** When editing, ignore this snapshot so «previous» is read correctly. */
  excludeSnapshotId?: string | null
}

export interface SuggestedCashflow {
  income: number
  expense: number
  /** Signed external flow: income − expense. */
  net: number
  /** Whether a previous check-in exists to compare against. */
  hasPrevious: boolean
}

function previousCheckInDate(
  date: string,
  snapshots: BalanceSnapshot[],
  excludeSnapshotId?: string | null,
): string | null {
  let prev: string | null = null
  for (const snap of snapshots) {
    if (excludeSnapshotId && snap.id === excludeSnapshotId) continue
    if (snap.date >= date) continue
    if (prev == null || snap.date > prev) prev = snap.date
  }
  return prev
}

function amountInBase(
  amount: number,
  currency: string,
  date: string,
  settings: WalletSettings,
  rateBook?: RateBook,
): number {
  const pivot =
    (rateBook ? resolvePivotForDate(date, rateBook) : null) ??
    (settings.baseCurrency === 'RUB' ? settings.exchangeRates : null)
  return toBase(amount, currency, settings.baseCurrency, settings.exchangeRates, pivot)
}

/**
 * Suggest income/expense from the change in non-growth accounts (operational,
 * cash, credit) since the previous check-in, net of transfers across the
 * growth boundary.
 */
export function suggestCheckInCashflow(input: SuggestCheckInCashflowInput): SuggestedCashflow {
  const {
    date,
    accounts,
    snapshots,
    settings,
    lines,
    transfers,
    rateBook,
    excludeSnapshotId,
  } = input

  const prevDate = previousCheckInDate(date, snapshots, excludeSnapshotId)
  if (!prevDate) {
    return { income: 0, expense: 0, net: 0, hasPrevious: false }
  }

  const lineMap = new Map(lines.map((l) => [l.accountId, l.amount]))
  const snapsForPrev = excludeSnapshotId
    ? snapshots.filter((s) => s.id !== excludeSnapshotId)
    : snapshots

  let deltaNonGrowth = 0
  for (const account of accounts) {
    if (account.archived) continue
    if (isGrowthAccount(account)) continue

    const prevRecorded = balanceOnDate(account.id, prevDate, snapsForPrev)
    if (prevRecorded == null && !lineMap.has(account.id)) continue

    const prevNw = netWorthAmount(account, prevRecorded ?? 0)
    const curRecorded = lineMap.has(account.id)
      ? lineMap.get(account.id)!
      : (balanceOnDate(account.id, prevDate, snapsForPrev) ?? 0)
    const curNw = netWorthAmount(account, curRecorded)

    deltaNonGrowth +=
      amountInBase(curNw, account.currency, date, settings, rateBook) -
      amountInBase(prevNw, account.currency, prevDate, settings, rateBook)
  }

  let netTransfersIntoNonGrowth = 0
  const accountMap = new Map(accounts.map((a) => [a.id, a]))
  for (const t of transfers) {
    const from = accountMap.get(t.fromAccountId)
    const to = accountMap.get(t.toAccountId)
    if (!from || !to) continue
    const fromGrowth = isGrowthAccount(from)
    const toGrowth = isGrowthAccount(to)
    if (fromGrowth === toGrowth) continue

    const amountBase = amountInBase(t.amount, from.currency, date, settings, rateBook)
    if (fromGrowth && !toGrowth) {
      const received = transferReceivedAmount(
        { ...t, date },
        from,
        to,
        settings,
        rateBook,
      )
      netTransfersIntoNonGrowth += amountInBase(received, to.currency, date, settings, rateBook)
    } else if (!fromGrowth && toGrowth) {
      netTransfersIntoNonGrowth -= amountBase
    }
  }

  const external = deltaNonGrowth - netTransfersIntoNonGrowth
  const rounded = Math.round(external * 100) / 100
  if (rounded > 0) {
    return { income: rounded, expense: 0, net: rounded, hasPrevious: true }
  }
  if (rounded < 0) {
    return { income: 0, expense: -rounded, net: rounded, hasPrevious: true }
  }
  return { income: 0, expense: 0, net: 0, hasPrevious: true }
}
