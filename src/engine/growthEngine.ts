import { toBase } from '../lib/currency'
import { growthAccounts, isGrowthAccount } from '../lib/accountKinds'
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

/** External capital movement into the growth portfolio on a date (base currency). */
export interface DatedCapitalFlow {
  date: string
  amount: number
}

function compareDate(a: string, b: string): number {
  return a.localeCompare(b)
}

function daysBetween(startDate: string, endDate: string): number {
  const start = Date.parse(`${startDate}T00:00:00Z`)
  const end = Date.parse(`${endDate}T00:00:00Z`)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0
  return Math.max(0, Math.round((end - start) / 86_400_000))
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
  if (!Number.isFinite(inverse) || inverse <= 0) return Number.NaN
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
  const account = accountById(accounts).get(accountId)
  const value0 = account ? netWorthAmount(account, bal0) : bal0
  const value1 = account ? netWorthAmount(account, bal1) : bal1
  return value1 - value0 - netTransfersIn(accountId, t0, t1, transfers, accounts, settings, rateBook)
}

/**
 * Net transfers into account over (t0, t1] converted to base currency
 * at each transfer's own date (FX-aware).
 */
export function netTransfersInBase(
  accountId: string,
  t0: string,
  t1: string,
  transfers: Transfer[],
  accounts: Account[],
  settings: WalletSettings,
  rateBook?: RateBook,
): number {
  const map = accountById(accounts)
  const account = map.get(accountId)
  if (!account) return 0
  let net = 0
  for (const t of transfers) {
    if (compareDate(t.date, t0) <= 0) continue
    if (compareDate(t.date, t1) > 0) continue
    if (t.fromAccountId === accountId) {
      net -= convertAmount(
        t.amount,
        account.currency,
        settings.baseCurrency,
        settings,
        t.date,
        rateBook,
      )
      continue
    }
    if (t.toAccountId === accountId) {
      const from = map.get(t.fromAccountId)
      // Transfer.amount is always in the source account currency.
      const fromCurrency = from?.currency ?? account.currency
      net += convertAmount(
        t.amount,
        fromCurrency,
        settings.baseCurrency,
        settings,
        t.date,
        rateBook,
      )
    }
  }
  return net
}

/**
 * Base-currency growth including FX: end NW − start NW − transfers (at their dates).
 * Native-currency growth can be negative while this is positive when the rate rises.
 */
export function accountGrowthBase(
  accountId: string,
  t0: string,
  t1: string,
  snapshots: BalanceSnapshot[],
  transfers: Transfer[],
  accounts: Account[],
  settings: WalletSettings,
  rateBook?: RateBook,
): number | null {
  const map = accountById(accounts)
  const account = map.get(accountId)
  if (!account) return null
  const bal0 = balanceOnDate(accountId, t0, snapshots)
  const bal1 = balanceOnDate(accountId, t1, snapshots)
  if (bal0 == null || bal1 == null) return null

  const startBase = toBase(
    netWorthAmount(account, bal0),
    account.currency,
    settings.baseCurrency,
    settings.exchangeRates,
    pivotFor(t0, settings, rateBook),
  )
  const endBase = toBase(
    netWorthAmount(account, bal1),
    account.currency,
    settings.baseCurrency,
    settings.exchangeRates,
    pivotFor(t1, settings, rateBook),
  )
  const transferBase = netTransfersInBase(
    accountId,
    t0,
    t1,
    transfers,
    accounts,
    settings,
    rateBook,
  )
  return endBase - startBase - transferBase
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
 * Capital flows into the growth portfolio over (t0, t1] in base currency:
 * transfers from non-growth → growth (+), growth → non-growth (−).
 * Check-in income/expense are ignored — they land on operational accounts
 * and do not belong in the growth portfolio until transferred in.
 * Internal transfers between growth accounts cancel out.
 */
export function growthCapitalFlows(
  t0: string,
  t1: string,
  snapshots: BalanceSnapshot[],
  transfers: Transfer[],
  accounts: Account[],
  settings: WalletSettings,
  rateBook?: RateBook,
): DatedCapitalFlow[] {
  const byDate = new Map<string, number>()

  const map = accountById(accounts)
  for (const t of transfers) {
    if (compareDate(t.date, t0) <= 0) continue
    if (compareDate(t.date, t1) > 0) continue
    const from = map.get(t.fromAccountId)
    const to = map.get(t.toAccountId)
    if (!from || !to) continue
    const fromGrowth = isGrowthAccount(from)
    const toGrowth = isGrowthAccount(to)
    if (fromGrowth === toGrowth) continue

    const amountBase = convertAmount(
      t.amount,
      from.currency,
      settings.baseCurrency,
      settings,
      t.date,
      rateBook,
    )
    const signed = toGrowth && !fromGrowth ? amountBase : -amountBase
    byDate.set(t.date, (byDate.get(t.date) ?? 0) + signed)
  }

  // A growth account first recorded inside the period with a non-zero balance
  // represents contributed capital, not investment return. Infer that flow only
  // when no recorded transfer already explains the account's opening balance.
  const orderedSnapshots = sortSnapshots(snapshots)
  for (const account of accounts.filter((a) => !a.archived && isGrowthAccount(a))) {
    if (balanceOnDate(account.id, t0, snapshots) != null) continue
    const first = orderedSnapshots.find(
      (snapshot) =>
        compareDate(snapshot.date, t0) > 0 &&
        compareDate(snapshot.date, t1) <= 0 &&
        snapshot.lines.some((line) => line.accountId === account.id),
    )
    const opening = first?.lines.find((line) => line.accountId === account.id)?.amount
    if (!first || opening == null || opening === 0) continue
    const explainedByTransfer = transfers.some(
      (transfer) =>
        transfer.toAccountId === account.id &&
        compareDate(transfer.date, t0) > 0 &&
        compareDate(transfer.date, first.date) <= 0,
    )
    if (explainedByTransfer) continue
    const amountBase = convertAmount(
      opening,
      account.currency,
      settings.baseCurrency,
      settings,
      first.date,
      rateBook,
    )
    byDate.set(first.date, (byDate.get(first.date) ?? 0) + amountBase)
  }

  return [...byDate.entries()]
    .filter(([, amount]) => amount !== 0)
    .sort(([a], [b]) => compareDate(a, b))
    .map(([date, amount]) => ({ date, amount }))
}

/** Net capital flow into the growth portfolio over (t0, t1]. */
export function netGrowthCapitalFlow(
  t0: string,
  t1: string,
  snapshots: BalanceSnapshot[],
  transfers: Transfer[],
  accounts: Account[],
  settings: WalletSettings,
  rateBook?: RateBook,
): number {
  return growthCapitalFlows(t0, t1, snapshots, transfers, accounts, settings, rateBook).reduce(
    (sum, f) => sum + f.amount,
    0,
  )
}

/**
 * Modified Dietz: flows enter the capital base only for the fraction of the
 * period remaining after the flow date (w = (T − t) / T).
 */
export function modifiedDietzReturn(
  startTotal: number,
  growth: number,
  startDate: string,
  endDate: string,
  flows: DatedCapitalFlow[],
): { growthPct: number | null; weightedCapital: number } {
  const periodDays = daysBetween(startDate, endDate)
  let weightedFlows = 0
  if (periodDays > 0) {
    for (const flow of flows) {
      const elapsed = daysBetween(startDate, flow.date)
      const weight = Math.max(0, Math.min(1, (periodDays - elapsed) / periodDays))
      weightedFlows += flow.amount * weight
    }
  }
  const weightedCapital = startTotal + weightedFlows
  if (!Number.isFinite(weightedCapital) || weightedCapital <= 0) {
    return { growthPct: null, weightedCapital }
  }
  return { growthPct: growth / weightedCapital, weightedCapital }
}

/**
 * Series for growth accounts on each snapshot date.
 * growth = total change minus cumulative external capital flows
 * (transfers across the growth boundary; income/expense are ignored).
 */
export function buildTotalSeries(
  accounts: Account[],
  snapshots: BalanceSnapshot[],
  settings: WalletSettings,
  rateBook?: RateBook,
  transfers: Transfer[] = [],
): TotalPoint[] {
  const dates = snapshotDates(snapshots)
  if (dates.length === 0) return []

  const eligible = growthAccounts(accounts)
  const startDate = dates[0]!

  const cashflowByDate = new Map<string, number>()
  for (const flow of growthCapitalFlows(
    startDate,
    dates[dates.length - 1]!,
    snapshots,
    transfers,
    accounts,
    settings,
    rateBook,
  )) {
    cashflowByDate.set(flow.date, (cashflowByDate.get(flow.date) ?? 0) + flow.amount)
  }

  const points: TotalPoint[] = []
  let baseline: number | null = null
  let cumCashflow = 0
  let prevDate: string | null = null
  for (const date of dates) {
    const total = totalOnDate(date, eligible, snapshots, settings, { rateBook })
    if (baseline == null || prevDate == null) {
      baseline = total
      prevDate = date
      points.push({ date, total, growth: 0 })
      continue
    }
    // Attribute flows on dates between check-ins to the interval ending here.
    for (const [flowDate, amount] of cashflowByDate) {
      if (compareDate(flowDate, prevDate) > 0 && compareDate(flowDate, date) <= 0) {
        cumCashflow += amount
      }
    }
    points.push({
      date,
      total,
      growth: total - baseline - cumCashflow,
    })
    prevDate = date
  }
  return points
}

export function buildDailyGrowthSeries(
  accounts: Account[],
  snapshots: BalanceSnapshot[],
  settings: WalletSettings,
  rateBook?: RateBook,
  transfers: Transfer[] = [],
): DailyGrowthPoint[] {
  const series = buildTotalSeries(accounts, snapshots, settings, rateBook, transfers)
  if (series.length < 2) return []
  const points: DailyGrowthPoint[] = []
  for (let i = 1; i < series.length; i += 1) {
    const prev = series[i - 1]!
    const cur = series[i]!
    points.push({
      date: cur.date,
      growth: cur.growth - prev.growth,
      total: cur.total,
      cumulativeGrowth: cur.growth,
    })
  }
  return points
}

export interface DailyGrowthPoint {
  date: string
  /** Incremental growth for the interval ending on this check-in date. */
  growth: number
  total: number
  cumulativeGrowth: number
}

/** @deprecated Prefer netGrowthCapitalFlow — kept for callers that only have income/expense. */
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
  transfers: Transfer[] = [],
): number {
  const series = buildTotalSeries(accounts, snapshots, settings, rateBook, transfers)
  if (series.length < 2) return series[0]?.growth ?? 0
  return series[series.length - 1]!.growth
}

export { sortSnapshots, sortTransfers }
