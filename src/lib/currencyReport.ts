import { toBase, currencyLabel } from './currency'
import {
  accountGrowth,
  accountGrowthBase,
  balanceOnDate,
  netWorthAmount,
  snapshotDates,
  type RateBook,
} from '../engine/growthEngine'
import { resolvePivotForDate } from './cbrRates'
import { isGrowthAccount } from './accountKinds'
import type {
  Account,
  BalanceSnapshot,
  Transfer,
  WalletSettings,
} from '../types/wallet'

export interface CurrencyReportAccountRow {
  accountId: string
  name: string
  balance: number
  balanceBase: number
  growth: number
  growthBase: number
}

export interface CurrencyReportRow {
  currency: string
  label: string
  accountCount: number
  balance: number
  balanceBase: number
  growth: number
  growthBase: number
  share: number
  accounts: CurrencyReportAccountRow[]
}

export interface CurrencyReport {
  asOfDate: string | null
  baseCurrency: string
  grandTotalBase: number
  grandGrowthBase: number
  rows: CurrencyReportRow[]
}

export function buildCurrencyReport(
  accounts: Account[],
  snapshots: BalanceSnapshot[],
  transfers: Transfer[],
  settings: WalletSettings,
  rateBook?: RateBook,
  opts?: {
    baseCurrencyLast?: boolean
    foreignOnly?: boolean
    /** When true, growth includes operational/cash/credit — not only fund/deposit/investment. */
    allKindsGrowth?: boolean
  },
): CurrencyReport {
  const dates = snapshotDates(snapshots)
  const t0 = dates[0] ?? null
  const t1 = dates[dates.length - 1] ?? null
  const active = accounts
    .filter((a) => !a.archived)
    .filter((a) => (opts?.foreignOnly ? a.currency !== settings.baseCurrency : true))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))

  if (!t1 || active.length === 0) {
    return {
      asOfDate: t1,
      baseCurrency: settings.baseCurrency,
      grandTotalBase: 0,
      grandGrowthBase: 0,
      rows: [],
    }
  }

  const pivot =
    (rateBook ? resolvePivotForDate(t1, rateBook) : null) ??
    (settings.baseCurrency === 'RUB' ? settings.exchangeRates : null)

  const byCurrency = new Map<
    string,
    {
      balance: number
      balanceBase: number
      growth: number
      growthBase: number
      accounts: CurrencyReportAccountRow[]
    }
  >()

  for (const account of active) {
    const recorded = balanceOnDate(account.id, t1, snapshots) ?? 0
    const balance = netWorthAmount(account, recorded)
    const countGrowth = t0 != null && (opts?.allKindsGrowth || isGrowthAccount(account))
    const growth = countGrowth
      ? (accountGrowth(
          account.id,
          t0!,
          t1,
          snapshots,
          transfers,
          accounts,
          settings,
          rateBook,
        ) ?? 0)
      : 0
    const balanceBase = toBase(
      balance,
      account.currency,
      settings.baseCurrency,
      settings.exchangeRates,
      pivot,
    )
    const growthBase = countGrowth
      ? (accountGrowthBase(
          account.id,
          t0!,
          t1,
          snapshots,
          transfers,
          accounts,
          settings,
          rateBook,
        ) ?? 0)
      : 0

    const bucket = byCurrency.get(account.currency) ?? {
      balance: 0,
      balanceBase: 0,
      growth: 0,
      growthBase: 0,
      accounts: [],
    }
    bucket.balance += balance
    bucket.balanceBase += balanceBase
    bucket.growth += growth
    bucket.growthBase += growthBase
    bucket.accounts.push({
      accountId: account.id,
      name: account.name,
      balance,
      balanceBase,
      growth,
      growthBase,
    })
    byCurrency.set(account.currency, bucket)
  }

  const grandTotalBase = [...byCurrency.values()].reduce((s, r) => s + r.balanceBase, 0)
  const grandGrowthBase = [...byCurrency.values()].reduce((s, r) => s + r.growthBase, 0)

  const rows: CurrencyReportRow[] = [...byCurrency.entries()]
    .map(([currency, data]) => ({
      currency,
      label: currencyLabel(currency),
      accountCount: data.accounts.length,
      balance: data.balance,
      balanceBase: data.balanceBase,
      growth: data.growth,
      growthBase: data.growthBase,
      share: grandTotalBase !== 0 ? data.balanceBase / grandTotalBase : 0,
      accounts: data.accounts,
    }))
    .sort((a, b) => {
      if (opts?.baseCurrencyLast) {
        const aBase = a.currency === settings.baseCurrency ? 1 : 0
        const bBase = b.currency === settings.baseCurrency ? 1 : 0
        if (aBase !== bBase) return aBase - bBase
      }
      return b.balanceBase - a.balanceBase || a.currency.localeCompare(b.currency)
    })

  return {
    asOfDate: t1,
    baseCurrency: settings.baseCurrency,
    grandTotalBase,
    grandGrowthBase,
    rows,
  }
}
