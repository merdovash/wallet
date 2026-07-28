import { toBase } from './currency'
import { balanceOnDate, snapshotDates, type RateBook } from '../engine/growthEngine'
import { resolvePivotForDate } from './cbrRates'
import type { Account, BalanceSnapshot, WalletSettings } from '../types/wallet'

export interface CurrencyValuePoint {
  date: string
  /** currency code → value in base currency */
  values: Record<string, number>
}

export interface CurrencyValueChangeSummary {
  fromDate: string
  toDate: string
  startTotal: number
  endTotal: number
  /** Absolute change of total base-equivalent (FX + quantity). */
  absolute: number
  /** Relative change vs first date; null if start is zero. */
  relative: number | null
}

export function totalBaseOnPoint(point: CurrencyValuePoint): number {
  return Object.values(point.values).reduce((sum, value) => sum + value, 0)
}

export function summarizeCurrencyValueChange(
  points: CurrencyValuePoint[],
): CurrencyValueChangeSummary | null {
  if (points.length === 0) return null
  const first = points[0]!
  const last = points[points.length - 1]!
  const startTotal = totalBaseOnPoint(first)
  const endTotal = totalBaseOnPoint(last)
  const absolute = endTotal - startTotal
  return {
    fromDate: first.date,
    toDate: last.date,
    startTotal,
    endTotal,
    absolute,
    relative: startTotal !== 0 ? absolute / startTotal : null,
  }
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
