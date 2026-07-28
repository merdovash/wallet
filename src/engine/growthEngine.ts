import { toBase } from '../lib/currency'
import { growthAccounts } from '../lib/accountKinds'
import { resolvePivotForDate } from '../lib/cbrRates'
import type {
  Account,
  AccountPoint,
  AccountSummary,
  BalanceSnapshot,
  TotalPoint,
  Transfer,
  WalletSettings,
} from '../types/wallet'

/** CBR rate days: rateDate → RUB pivot per unit. */
export type RateBook = Record<string, Record<string, number>>

function compareDate(a: string, b: string): number {
  return a.localeCompare(b)
}

function sortSnapshots(snapshots: BalanceSnapshot[]): BalanceSnapshot[] {
  return [...snapshots].sort((a, b) => compareDate(a.date, b.date) || a.id.localeCompare(b.id))
}

function sortTransfers(transfers: Transfer[]): Transfer[] {
  return [...transfers].sort((a, b) => compareDate(a.date, b.date) || a.id.localeCompare(b.id))
}

/** Unique snapshot dates ascending. */
export function snapshotDates(snapshots: BalanceSnapshot[]): string[] {
  const set = new Set(snapshots.map((s) => s.date))
  return [...set].sort(compareDate)
}

/**
 * Balance of an account on `date` via forward-fill:
 * last snapshot line on or before `date`. Returns null if never recorded.
 */
export function balanceOnDate(
  accountId: string,
  date: string,
  snapshots: BalanceSnapshot[],
): number | null {
  let latest: number | null = null
  for (const snap of sortSnapshots(snapshots)) {
    if (compareDate(snap.date, date) > 0) break
    const line = snap.lines.find((l) => l.accountId === accountId)
    if (line) latest = line.amount
  }
  return latest
}

function pivotFor(
  date: string,
  settings: WalletSettings,
  rateBook?: RateBook,
): Record<string, number> | null {
  if (rateBook) {
    const pivot = resolvePivotForDate(date, rateBook)
    if (pivot) return pivot
  }
  // Manual fallback is already RUB-per-unit when base is RUB.
  if (settings.baseCurrency === 'RUB') return settings.exchangeRates
  return null
}

/**
 * Convert `amount` from `fromCurrency` into `toCurrency` using CBR pivot on `date`.
 */
export function convertAmount(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  settings: WalletSettings,
  date?: string,
  rateBook?: RateBook,
): number {
  if (fromCurrency === toCurrency) return amount
  const pivot = date ? pivotFor(date, settings, rateBook) : rateBook
    ? resolvePivotForDate(Object.keys(rateBook).sort().at(-1) ?? '', rateBook)
    : settings.baseCurrency === 'RUB'
      ? settings.exchangeRates
      : null

  const inBase = toBase(
    amount,
    fromCurrency,
    settings.baseCurrency,
    settings.exchangeRates,
    pivot,
  )
  if (toCurrency === settings.baseCurrency) return inBase

  const inverse = toBase(1, toCurrency, settings.baseCurrency, settings.exchangeRates, pivot)
  if (!inverse) return inBase
  return inBase / inverse
}

/**
 * Net transfers into account over (t0, t1] in that account's currency.
 * Incoming positive, outgoing negative. Transfer.amount is in the source account currency.
 */
export function netTransfersIn(
  accountId: string,
  t0: string,
  t1: string,
  transfers: Transfer[],
  accounts: Account[] = [],
  settings?: WalletSettings,
  rateBook?: RateBook,
): number {
  const map = accountById(accounts)
  let net = 0
  for (const t of transfers) {
    if (compareDate(t.date, t0) <= 0) continue
    if (compareDate(t.date, t1) > 0) continue
    if (t.fromAccountId === accountId) {
      net -= t.amount
      continue
    }
    if (t.toAccountId === accountId) {
      const from = map.get(t.fromAccountId)
      const to = map.get(t.toAccountId)
      if (from && to && settings && from.currency !== to.currency) {
        net += convertAmount(t.amount, from.currency, to.currency, settings, t.date, rateBook)
      } else {
        net += t.amount
      }
    }
  }
  return net
}

/**
 * growth(account, t0→t1) = (bal_t1 - bal_t0) - netTransfersIn(account, t0, t1)
 */
export function accountGrowth(
  accountId: string,
  t0: string,
  t1: string,
  snapshots: BalanceSnapshot[],
  transfers: Transfer[],
  accounts: Account[] = [],
  settings?: WalletSettings,
  rateBook?: RateBook,
): number | null {
  const bal0 = balanceOnDate(accountId, t0, snapshots)
  const bal1 = balanceOnDate(accountId, t1, snapshots)
  if (bal0 == null || bal1 == null) return null
  return bal1 - bal0 - netTransfersIn(accountId, t0, t1, transfers, accounts, settings, rateBook)
}

function accountById(accounts: Account[]): Map<string, Account> {
  return new Map(accounts.map((a) => [a.id, a]))
}

/**
 * Amount that contributes to net worth for a recorded balance.
 * Credit check-ins store available limit remainder; NW uses −debt.
 */
export function netWorthAmount(account: Account, recordedBalance: number): number {
  if (account.kind === 'credit') {
    const limit = account.creditLimit ?? 0
    const debt = Math.max(0, limit - recordedBalance)
    return -debt
  }
  return recordedBalance
}

export function totalOnDate(
  date: string,
  accounts: Account[],
  snapshots: BalanceSnapshot[],
  settings: WalletSettings,
  opts?: { includeArchived?: boolean; rateBook?: RateBook },
): number {
  const includeArchived = opts?.includeArchived ?? false
  const pivot = pivotFor(date, settings, opts?.rateBook)
  let total = 0
  for (const account of accounts) {
    if (!includeArchived && account.archived) continue
    const bal = balanceOnDate(account.id, date, snapshots)
    if (bal == null) continue
    const nw = netWorthAmount(account, bal)
    total += toBase(nw, account.currency, settings.baseCurrency, settings.exchangeRates, pivot)
  }
  return total
}

/**
 * Series for the whole wallet on each snapshot date.
 * Only fund / deposit / investment accounts contribute (operational, cash, credit
 * are excluded from growth metrics).
 * growth = total change minus cumulative external cashflows (income − expense).
 * Transfers between tracked accounts cancel out in totals.
 */
export function buildTotalSeries(
  accounts: Account[],
  snapshots: BalanceSnapshot[],
  settings: WalletSettings,
  rateBook?: RateBook,
): TotalPoint[] {
  const dates = snapshotDates(snapshots)
  if (dates.length === 0) return []

  const eligible = growthAccounts(accounts)

  const cashflowByDate = new Map<string, number>()
  for (const snap of snapshots) {
    const net = (snap.income ?? 0) - (snap.expense ?? 0)
    cashflowByDate.set(snap.date, (cashflowByDate.get(snap.date) ?? 0) + net)
  }

  const points: TotalPoint[] = []
  let baseline: number | null = null
  let cumCashflow = 0
  for (const date of dates) {
    const total = totalOnDate(date, eligible, snapshots, settings, { rateBook })
    if (baseline == null) {
      baseline = total
      points.push({ date, total, growth: 0 })
      continue
    }
    // Cashflow on this date is attributed to the interval ending here.
    cumCashflow += cashflowByDate.get(date) ?? 0
    points.push({
      date,
      total,
      growth: total - baseline - cumCashflow,
    })
  }
  return points
}

/** Net external cashflow (income − expense) in base currency over (t0, t1]. */
export function netExternalCashflow(
  t0: string,
  t1: string,
  snapshots: BalanceSnapshot[],
): number {
  let net = 0
  for (const snap of snapshots) {
    if (compareDate(snap.date, t0) <= 0) continue
    if (compareDate(snap.date, t1) > 0) continue
    net += (snap.income ?? 0) - (snap.expense ?? 0)
  }
  return net
}

/**
 * Per-account series: raw balance + cumulative growth excluding transfers.
 * Growth is anchored at the first date where the account has a known balance.
 */
export function buildAccountSeries(
  accountId: string,
  snapshots: BalanceSnapshot[],
  transfers: Transfer[],
  accounts: Account[] = [],
  settings?: WalletSettings,
  rateBook?: RateBook,
): AccountPoint[] {
  const dates = snapshotDates(snapshots)
  const points: AccountPoint[] = []
  let anchorDate: string | null = null
  let anchorBalance: number | null = null

  for (const date of dates) {
    const balance = balanceOnDate(accountId, date, snapshots)
    if (balance == null) continue

    if (anchorDate == null || anchorBalance == null) {
      anchorDate = date
      anchorBalance = balance
      points.push({ date, balance, growth: 0 })
      continue
    }

    const growth =
      balance -
      anchorBalance -
      netTransfersIn(accountId, anchorDate, date, transfers, accounts, settings, rateBook)
    points.push({ date, balance, growth })
  }
  return points
}

export function summarizeAccounts(
  accounts: Account[],
  snapshots: BalanceSnapshot[],
  transfers: Transfer[],
  settings: WalletSettings,
  rateBook?: RateBook,
): AccountSummary[] {
  const dates = snapshotDates(snapshots)
  if (dates.length === 0) {
    return accounts
      .filter((a) => !a.archived)
      .map((a) => ({
        accountId: a.id,
        balance: 0,
        balanceBase: 0,
        growth: 0,
        growthBase: 0,
      }))
  }

  const t0 = dates[0]!
  const t1 = dates[dates.length - 1]!
  const map = accountById(accounts)
  const pivot = pivotFor(t1, settings, rateBook)

  return accounts
    .filter((a) => !a.archived)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map((account) => {
      const available = balanceOnDate(account.id, t1, snapshots) ?? 0
      const balance =
        account.kind === 'credit'
          ? Math.max(0, (account.creditLimit ?? 0) - available)
          : available
      const growth =
        accountGrowth(account.id, t0, t1, snapshots, transfers, accounts, settings, rateBook) ?? 0
      const acc = map.get(account.id)!
      return {
        accountId: account.id,
        balance,
        balanceBase: toBase(
          balance,
          acc.currency,
          settings.baseCurrency,
          settings.exchangeRates,
          pivot,
        ),
        growth,
        growthBase: toBase(
          growth,
          acc.currency,
          settings.baseCurrency,
          settings.exchangeRates,
          pivot,
        ),
      }
    })
}

export function periodGrowth(
  accounts: Account[],
  snapshots: BalanceSnapshot[],
  settings: WalletSettings,
  rateBook?: RateBook,
): number {
  const series = buildTotalSeries(accounts, snapshots, settings, rateBook)
  if (series.length < 2) return series[0]?.growth ?? 0
  return series[series.length - 1]!.growth
}

export { sortSnapshots, sortTransfers }
