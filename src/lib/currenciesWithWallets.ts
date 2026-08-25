import {
  balanceOnDate,
  netWorthAmount,
  snapshotDates,
  type RateBook,
} from '../engine/growthEngine'
import type { Account, BalanceSnapshot, WalletSettings } from '../types/wallet'
import { resolvePivotForDate } from './cbrRates'
import { toBase } from './currency'

/**
 * Unique currencies that have at least one non-archived wallet,
 * ordered by current base-equivalent balance (desc).
 */
export function currenciesWithWalletsByBalance(
  accounts: Account[],
  snapshots: BalanceSnapshot[],
  settings: WalletSettings,
  rateBook?: RateBook,
  opts?: { excludeBase?: boolean },
): string[] {
  const active = accounts.filter((a) => !a.archived)
  const dates = snapshotDates(snapshots)
  const asOf = dates[dates.length - 1] ?? null
  const pivot =
    (asOf && rateBook ? resolvePivotForDate(asOf, rateBook) : null) ??
    (settings.baseCurrency === 'RUB' ? settings.exchangeRates : null)

  const totals = new Map<string, number>()
  for (const account of active) {
    if (opts?.excludeBase && account.currency === settings.baseCurrency) continue
    const recorded = asOf != null ? (balanceOnDate(account.id, asOf, snapshots) ?? 0) : 0
    const balance = netWorthAmount(account, recorded)
    const balanceBase = toBase(
      balance,
      account.currency,
      settings.baseCurrency,
      settings.exchangeRates,
      pivot,
    )
    const prev = totals.get(account.currency) ?? 0
    totals.set(account.currency, prev + (Number.isFinite(balanceBase) ? balanceBase : 0))
  }

  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([code]) => code)
}
