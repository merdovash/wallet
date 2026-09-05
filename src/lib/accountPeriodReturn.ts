import {
  accountGrowth,
  accountGrowthBase,
  balanceOnDate,
  convertAmount,
  modifiedDietzReturn,
  netWorthAmount,
  snapshotDates,
  type DatedCapitalFlow,
  type RateBook,
} from '../engine/growthEngine'
import { annualizePeriodReturn, MIN_ANNUALIZE_DAYS } from './monthlyReturns'
import { isGrowthKind, normalizeAccountKind } from './accountKinds'
import { transferLegBase, transferLegNative } from './transferAmounts'
import type { Account, BalanceSnapshot, Transfer, WalletSettings } from '../types/wallet'

export interface AccountPeriodReturn {
  startDate: string
  endDate: string
  days: number
  /** Modified Dietz in base currency (includes FX). */
  growthPct: number | null
  annualizedPct: number | null
  /** Dietz in the account currency, only for foreign-currency accounts. */
  nativeGrowthPct: number | null
  nativeAnnualizedPct: number | null
}

function daysBetween(startDate: string, endDate: string): number {
  const start = Date.parse(`${startDate}T00:00:00Z`)
  const end = Date.parse(`${endDate}T00:00:00Z`)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0
  return Math.max(0, Math.round((end - start) / 86_400_000))
}

function accountCapitalFlows(
  accountId: string,
  t0: string,
  t1: string,
  transfers: Transfer[],
  accounts: Account[],
  settings: WalletSettings,
  rateBook?: RateBook,
): DatedCapitalFlow[] {
  const byDate = new Map<string, number>()
  for (const transfer of transfers) {
    if (transfer.date.localeCompare(t0) <= 0) continue
    if (transfer.date.localeCompare(t1) > 0) continue
    const amountBase = transferLegBase(accountId, transfer, accounts, settings, rateBook)
    if (amountBase === 0) continue
    byDate.set(transfer.date, (byDate.get(transfer.date) ?? 0) + amountBase)
  }
  return [...byDate.entries()]
    .filter(([, amount]) => amount !== 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, amount]) => ({ date, amount }))
}

function accountCapitalFlowsNative(
  accountId: string,
  t0: string,
  t1: string,
  transfers: Transfer[],
  accounts: Account[],
  settings: WalletSettings,
  rateBook?: RateBook,
): DatedCapitalFlow[] {
  const account = accounts.find((a) => a.id === accountId)
  if (!account) return []
  const byDate = new Map<string, number>()
  for (const transfer of transfers) {
    if (transfer.date.localeCompare(t0) <= 0) continue
    if (transfer.date.localeCompare(t1) > 0) continue
    const amountNative = transferLegNative(accountId, transfer, accounts, settings, rateBook)
    if (amountNative === 0) continue
    byDate.set(transfer.date, (byDate.get(transfer.date) ?? 0) + amountNative)
  }
  return [...byDate.entries()]
    .filter(([, amount]) => amount !== 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, amount]) => ({ date, amount }))
}

function firstSnapshotDateForAccount(accountId: string, snapshots: BalanceSnapshot[]): string | null {
  const dates = snapshotDates(snapshots)
  for (const date of dates) {
    if (snapshots.some((snap) => snap.date === date && snap.lines.some((l: { accountId: string }) => l.accountId === accountId))) {
      return date
    }
  }
  return null
}

export function buildAccountPeriodReturn(
  accountId: string,
  accounts: Account[],
  snapshots: BalanceSnapshot[],
  transfers: Transfer[],
  settings: WalletSettings,
  rateBook?: RateBook,
): AccountPeriodReturn | null {
  const account = accounts.find((a) => a.id === accountId)
  if (!account) return null
  if (!isGrowthKind(normalizeAccountKind(account.kind))) return null
  const dates = snapshotDates(snapshots)
  if (dates.length < 2) return null
  const startDate = firstSnapshotDateForAccount(accountId, snapshots)
  const endDate = dates[dates.length - 1]!
  if (!startDate || startDate === endDate) return null
  if (balanceOnDate(accountId, startDate, snapshots) == null) return null
  if (balanceOnDate(accountId, endDate, snapshots) == null) return null

  const startRec = balanceOnDate(accountId, startDate, snapshots)!
  const startTotal = convertAmount(
    netWorthAmount(account, startRec),
    account.currency,
    settings.baseCurrency,
    settings,
    startDate,
    rateBook,
  )
  const growth =
    accountGrowthBase(accountId, startDate, endDate, snapshots, transfers, accounts, settings, rateBook) ??
    0
  const flows = accountCapitalFlows(accountId, startDate, endDate, transfers, accounts, settings, rateBook)
  const { growthPct } = modifiedDietzReturn(startTotal, growth, startDate, endDate, flows)
  const days = daysBetween(startDate, endDate)
  const annualizedPct =
    growthPct != null && days >= MIN_ANNUALIZE_DAYS ? annualizePeriodReturn(growthPct, days) : null

  let nativeGrowthPct: number | null = null
  let nativeAnnualizedPct: number | null = null
  if (account.currency !== settings.baseCurrency) {
    const startNative = netWorthAmount(account, startRec)
    const growthNative =
      accountGrowth(accountId, startDate, endDate, snapshots, transfers, accounts, settings, rateBook) ??
      0
    const nativeFlows = accountCapitalFlowsNative(
      accountId,
      startDate,
      endDate,
      transfers,
      accounts,
      settings,
      rateBook,
    )
    nativeGrowthPct = modifiedDietzReturn(
      startNative,
      growthNative,
      startDate,
      endDate,
      nativeFlows,
    ).growthPct
    nativeAnnualizedPct =
      nativeGrowthPct != null && days >= MIN_ANNUALIZE_DAYS
        ? annualizePeriodReturn(nativeGrowthPct, days)
        : null
  }

  return { startDate, endDate, days, growthPct, annualizedPct, nativeGrowthPct, nativeAnnualizedPct }
}
