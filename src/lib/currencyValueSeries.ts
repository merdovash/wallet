import { toBase } from './currency'
import {
  accountKindLabel,
  normalizeAccountKind,
} from './accountKinds'
import {
  balanceOnDate,
  netWorthAmount,
  snapshotDates,
  type RateBook,
} from '../engine/growthEngine'
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

export interface CurrencyFxAccountLine {
  accountId: string
  name: string
  kind: string
  kindLabel: string
  currency: string
  startBalance: number
  endBalance: number
  startBase: number
  endBase: number
  /** endBase − startBase */
  changeBase: number
  /** Effect of rate move on starting balance: startBal × (rate1 − rate0). */
  fxEffectBase: number
  /** Effect of balance change at end rate: (endBal − startBal) × rate1. */
  quantityEffectBase: number
}

export interface CurrencyFxFactorLine {
  key: string
  label: string
  amount: number
  unit: 'money' | 'rate'
  hint?: string
}

export interface CurrencyFxBreakdown {
  fromDate: string
  toDate: string
  startTotal: number
  endTotal: number
  absolute: number
  relative: number | null
  /** Accounts sorted by |changeBase| then changeBase desc. */
  accounts: CurrencyFxAccountLine[]
  /** Aggregated drivers of the total change. */
  factors: CurrencyFxFactorLine[]
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

function pivotForDate(
  date: string,
  settings: WalletSettings,
  rateBook?: RateBook,
): Record<string, number> | null {
  return (
    (rateBook ? resolvePivotForDate(date, rateBook) : null) ??
    (settings.baseCurrency === 'RUB' ? settings.exchangeRates : null)
  )
}

function unitInBase(
  currency: string,
  settings: WalletSettings,
  pivot: Record<string, number> | null,
): number {
  return toBase(1, currency, settings.baseCurrency, settings.exchangeRates, pivot)
}

/**
 * Breakdown of foreign-currency base-equivalent change for the Currencies tab.
 * Includes all account kinds (operational, cash, fund, …).
 */
export function buildCurrencyFxBreakdown(
  accounts: Account[],
  snapshots: BalanceSnapshot[],
  settings: WalletSettings,
  rateBook?: RateBook,
  range?: { startDate: string; endDate: string },
): CurrencyFxBreakdown | null {
  const { points } = buildCurrencyValueSeries(accounts, snapshots, settings, rateBook, {
    foreignOnly: true,
    range,
  })
  const summary = summarizeCurrencyValueChange(points)
  if (!summary) return null

  const fromDate = summary.fromDate
  const toDate = summary.toDate
  const startPivot = pivotForDate(fromDate, settings, rateBook)
  const endPivot = pivotForDate(toDate, settings, rateBook)

  const foreign = accounts.filter(
    (a) => !a.archived && a.currency !== settings.baseCurrency,
  )

  const accountLines: CurrencyFxAccountLine[] = []
  for (const account of foreign) {
    const startRec = balanceOnDate(account.id, fromDate, snapshots)
    const endRec = balanceOnDate(account.id, toDate, snapshots)
    if (startRec == null && endRec == null) continue
    const startBalance = netWorthAmount(account, startRec ?? 0)
    const endBalance = netWorthAmount(account, endRec ?? 0)
    const startBase = toBase(
      startBalance,
      account.currency,
      settings.baseCurrency,
      settings.exchangeRates,
      startPivot,
    )
    const endBase = toBase(
      endBalance,
      account.currency,
      settings.baseCurrency,
      settings.exchangeRates,
      endPivot,
    )
    const rate0 = unitInBase(account.currency, settings, startPivot)
    const rate1 = unitInBase(account.currency, settings, endPivot)
    const fxEffectBase = startBalance * (rate1 - rate0)
    const quantityEffectBase = (endBalance - startBalance) * rate1
    const kind = normalizeAccountKind(account.kind)
    accountLines.push({
      accountId: account.id,
      name: account.name,
      kind,
      kindLabel: accountKindLabel(kind),
      currency: account.currency,
      startBalance,
      endBalance,
      startBase,
      endBase,
      changeBase: endBase - startBase,
      fxEffectBase,
      quantityEffectBase,
    })
  }

  accountLines.sort(
    (a, b) => b.changeBase - a.changeBase || a.name.localeCompare(b.name),
  )

  const fxTotal = accountLines.reduce((s, a) => s + a.fxEffectBase, 0)
  const qtyTotal = accountLines.reduce((s, a) => s + a.quantityEffectBase, 0)

  const rateFactors: CurrencyFxFactorLine[] = []
  const seen = new Set<string>()
  for (const line of accountLines) {
    if (seen.has(line.currency)) continue
    seen.add(line.currency)
    const rate0 = unitInBase(line.currency, settings, startPivot)
    const rate1 = unitInBase(line.currency, settings, endPivot)
    const delta = rate1 - rate0
    if (Math.abs(delta) < 1e-12) continue
    rateFactors.push({
      key: `rate-${line.currency}`,
      label: `Курс ${line.currency}`,
      amount: delta,
      unit: 'rate',
      hint: `${rate0.toFixed(2)} → ${rate1.toFixed(2)} ${settings.baseCurrency}`,
    })
  }

  const factors: CurrencyFxFactorLine[] = [
    {
      key: 'fx',
      label: 'Курсовой эффект',
      amount: fxTotal,
      unit: 'money',
      hint: 'изменение курса × начальный остаток',
    },
    {
      key: 'qty',
      label: 'Изменение остатков',
      amount: qtyTotal,
      unit: 'money',
      hint: 'Δ количества × курс на конец',
    },
    ...rateFactors,
  ]

  return {
    ...summary,
    accounts: accountLines,
    factors,
  }
}

export function buildCurrencyValueSeries(
  accounts: Account[],
  snapshots: BalanceSnapshot[],
  settings: WalletSettings,
  rateBook?: RateBook,
  opts?: { foreignOnly?: boolean; range?: { startDate: string; endDate: string } },
): { currencies: string[]; points: CurrencyValuePoint[] } {
  const foreignOnly = opts?.foreignOnly ?? true
  const dates = snapshotDates(snapshots).filter((date) => {
    if (!opts?.range) return true
    return date >= opts.range.startDate && date <= opts.range.endDate
  })
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
    const pivot = pivotForDate(date, settings, rateBook)
    const values: Record<string, number> = {}
    for (const currency of currencies) {
      let sum = 0
      for (const account of active) {
        if (account.currency !== currency) continue
        const bal = balanceOnDate(account.id, date, snapshots)
        if (bal == null) continue
        const netWorth = netWorthAmount(account, bal)
        sum += toBase(
          netWorth,
          account.currency,
          settings.baseCurrency,
          settings.exchangeRates,
          pivot,
        )
      }
      values[currency] = sum
    }
    return { date, values }
  })

  return { currencies, points }
}
