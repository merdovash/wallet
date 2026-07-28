import { toBase } from './currency'
import { balanceOnDate, snapshotDates, type RateBook } from '../engine/growthEngine'
import { resolvePivotForDate } from './cbrRates'
import type { Account, BalanceSnapshot, WalletSettings } from '../types/wallet'

export interface CurrencyValuePoint {
  date: string
  /** currency code → value in base currency */
  values: Record<string, number>
}

export function buildCurrencyValueSeries(
  accounts: Account[],
  snapshots: BalanceSnapshot[],
  settings: WalletSettings,
  rateBook?: RateBook,
  opts?: { foreignOnly?: boolean },
): { currencies: string[]; points: CurrencyValuePoint[] } {
  const foreignOnly = opts?.foreignOnly ?? true
  const dates = snapshotDates(snapshots)
  const active = accounts.filter((a) => !a.archived)
  const currencies = [
    ...new Set(
      active
        .map((a) => a.currency)
        .filter((c) => (foreignOnly ? c !== settings.baseCurrency : true)),
    ),
  ].sort((a, b) => a.localeCompare(b))

  if (dates.length === 0 || currencies.length === 0) {
    return { currencies, points: [] }
  }

  const points: CurrencyValuePoint[] = dates.map((date) => {
    const pivot =
      (rateBook ? resolvePivotForDate(date, rateBook) : null) ??
      (settings.baseCurrency === 'RUB' ? settings.exchangeRates : null)
    const values: Record<string, number> = {}
    for (const currency of currencies) {
      let sum = 0
      for (const account of active) {
        if (account.currency !== currency) continue
        const bal = balanceOnDate(account.id, date, snapshots)
        if (bal == null) continue
        sum += toBase(bal, account.currency, settings.baseCurrency, settings.exchangeRates, pivot)
      }
      values[currency] = sum
    }
    return { date, values }
  })

  return { currencies, points }
}
