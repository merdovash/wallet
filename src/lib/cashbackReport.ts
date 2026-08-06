import type { Account, BalanceSnapshot, Transfer, WalletSettings } from '../types/wallet'
import { balanceOnDate, snapshotDates } from '../engine/growthEngine'
import { isCashbackKind, normalizeAccountKind } from './accountKinds'
import { toBase } from './currency'

export const CASHBACK_CURRENCY = 'CBK'

export interface CashbackPeriodRow {
  date: string
  expense: number
  cashbackEarned: number
  discountPct: number | null
}

export interface CashbackAccountBalance {
  id: string
  name: string
  balance: number
  balanceBase: number
}

export interface CashbackReport {
  totalExpense: number
  totalCashbackEarned: number
  effectiveDiscountPct: number | null
  currentCashbackBalance: number
  rows: CashbackPeriodRow[]
  accounts: CashbackAccountBalance[]
}

function compareDate(a: string, b: string): number {
  return a.localeCompare(b)
}

function cashbackAccounts(accounts: Account[]): Account[] {
  return accounts.filter((a) => !a.archived && isCashbackKind(normalizeAccountKind(a.kind)))
}

function transfersInToCashback(
  accountId: string,
  afterDate: string,
  onOrBeforeDate: string,
  transfers: Transfer[],
  accounts: Account[],
  settings: WalletSettings,
): number {
  let sum = 0
  for (const transfer of transfers) {
    if (transfer.toAccountId !== accountId) continue
    if (compareDate(transfer.date, afterDate) <= 0) continue
    if (compareDate(transfer.date, onOrBeforeDate) > 0) continue
    const from = accounts.find((a) => a.id === transfer.fromAccountId)
    if (!from) continue
    const inBase = toBase(transfer.amount, from.currency, settings.baseCurrency, settings.exchangeRates)
    if (Number.isFinite(inBase)) sum += inBase
  }
  return sum
}

function cashbackEarnedBetween(
  dates: string[],
  dateIndex: number,
  cashbackIds: string[],
  snapshots: BalanceSnapshot[],
  transfers: Transfer[],
  accounts: Account[],
  settings: WalletSettings,
): number {
  if (dateIndex <= 0 || cashbackIds.length === 0) return 0
  const prevDate = dates[dateIndex - 1]!
  const date = dates[dateIndex]!
  let earned = 0
  for (const accountId of cashbackIds) {
    const prev = balanceOnDate(accountId, prevDate, snapshots)
    const next = balanceOnDate(accountId, date, snapshots)
    if (prev == null || next == null) continue
    const account = accounts.find((a) => a.id === accountId)
    if (!account) continue
    const deltaBase = toBase(next - prev, account.currency, settings.baseCurrency, settings.exchangeRates)
    if (!Number.isFinite(deltaBase)) continue
    const transferIn = transfersInToCashback(accountId, prevDate, date, transfers, accounts, settings)
    earned += Math.max(0, deltaBase - transferIn)
  }
  return earned
}

export function buildCashbackReport(
  accounts: Account[],
  snapshots: BalanceSnapshot[],
  transfers: Transfer[],
  settings: WalletSettings,
): CashbackReport {
  const cbAccounts = cashbackAccounts(accounts)
  const dates = snapshotDates(snapshots)
  const cashbackIds = cbAccounts.map((a) => a.id)
  const lastDate = dates[dates.length - 1]

  const accountBalances: CashbackAccountBalance[] = cbAccounts.map((account) => {
    const balance = lastDate ? balanceOnDate(account.id, lastDate, snapshots) ?? 0 : 0
    const balanceBase = toBase(balance, account.currency, settings.baseCurrency, settings.exchangeRates)
    return {
      id: account.id,
      name: account.name,
      balance,
      balanceBase: Number.isFinite(balanceBase) ? balanceBase : 0,
    }
  })

  const rows: CashbackPeriodRow[] = []
  let totalExpense = 0
  let totalCashbackEarned = 0

  for (let i = 0; i < dates.length; i++) {
    const date = dates[i]!
    const snap = snapshots.find((s) => s.date === date)
    const expense = snap?.expense ?? 0
    const cashbackEarned =
      i === 0 ? 0 : cashbackEarnedBetween(dates, i, cashbackIds, snapshots, transfers, accounts, settings)
    totalExpense += expense
    totalCashbackEarned += cashbackEarned
    rows.push({
      date,
      expense,
      cashbackEarned,
      discountPct: expense > 0 ? cashbackEarned / expense : null,
    })
  }

  rows.reverse()

  return {
    totalExpense,
    totalCashbackEarned,
    effectiveDiscountPct: totalExpense > 0 ? totalCashbackEarned / totalExpense : null,
    currentCashbackBalance: accountBalances.reduce((sum, row) => sum + row.balanceBase, 0),
    rows,
    accounts: accountBalances,
  }
}

export function isCashbackCurrency(currency: string): boolean {
  return currency === CASHBACK_CURRENCY
}
