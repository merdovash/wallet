import { CURRENCY_ALIASES, nearestRateDate, resolveCurrencyCode } from './cbrRates'
import type { RateBook } from '../engine/growthEngine'
import type { FxOverride } from '../types/wallet'

const RATE_EPS = 1e-6

export function fxOverrideKey(date: string, currency: string): string {
  return `${date}:${currency}`
}

export function indexFxOverrides(overrides: FxOverride[]): Map<string, FxOverride> {
  const map = new Map<string, FxOverride>()
  for (const item of overrides) {
    map.set(fxOverrideKey(item.date, item.currency), item)
  }
  return map
}

export function findFxOverride(
  overrides: FxOverride[] | Map<string, FxOverride>,
  date: string,
  currency: string,
): FxOverride | undefined {
  if (Array.isArray(overrides)) {
    return overrides.find((item) => item.date === date && item.currency === currency)
  }
  return overrides.get(fxOverrideKey(date, currency))
}

export function midRubRate(override: Pick<FxOverride, 'buyRate' | 'sellRate'>): number {
  return (override.buyRate + override.sellRate) / 2
}

export function buySellDiffer(buy: number, sell: number): boolean {
  return Math.abs(buy - sell) > RATE_EPS
}

/** RUB-per-unit → units of baseCurrency per 1 quoted unit. */
export function rubPerUnitToBase(
  rubPerUnit: number,
  baseCurrency: string,
  pivot: Record<string, number>,
): number | null {
  if (!Number.isFinite(rubPerUnit)) return null
  if (baseCurrency === 'RUB') return rubPerUnit
  const resolved = resolveCurrencyCode(baseCurrency)
  const baseRub = pivot[baseCurrency] ?? pivot[resolved]
  if (baseRub == null || baseRub === 0) return null
  return rubPerUnit / baseRub
}

/** Displayed base-currency amount per 1 unit → RUB-per-unit. */
export function baseToRubPerUnit(
  amountInBase: number,
  baseCurrency: string,
  pivot: Record<string, number>,
): number | null {
  if (!Number.isFinite(amountInBase) || amountInBase <= 0) return null
  if (baseCurrency === 'RUB') return amountInBase
  const resolved = resolveCurrencyCode(baseCurrency)
  const baseRub = pivot[baseCurrency] ?? pivot[resolved]
  if (baseRub == null || baseRub === 0) return null
  return amountInBase * baseRub
}

export function rateInBase(
  pivot: Record<string, number>,
  code: string,
  baseCurrency: string,
): number | null {
  const resolved = CURRENCY_ALIASES[code] ?? code
  const rub = pivot[code] ?? pivot[resolved]
  if (rub == null) return null
  return rubPerUnitToBase(rub, baseCurrency, pivot)
}

function clonePivot(pivot: Record<string, number>): Record<string, number> {
  return { ...pivot }
}

function seedPivotForDate(
  byDate: RateBook,
  date: string,
): Record<string, number> {
  if (byDate[date]) return clonePivot(byDate[date]!)
  const nearest = nearestRateDate(date, byDate)
  if (nearest && byDate[nearest]) return clonePivot(byDate[nearest]!)
  return { RUB: 1 }
}

export function findNearestFxOverride(
  date: string,
  currency: string,
  overrides: FxOverride[],
): FxOverride | undefined {
  const resolved = resolveCurrencyCode(currency)
  let best: FxOverride | undefined
  for (const item of overrides) {
    if (item.date > date) continue
    if (item.currency !== currency && item.currency !== resolved) continue
    if (!best || item.date > best.date || (item.date === best.date && item.currency === currency)) {
      best = item
    }
  }
  return best
}

function pivotRubPerUnit(code: string, pivot: Record<string, number>): number | null {
  if (code === 'RUB' || resolveCurrencyCode(code) === 'RUB') return 1
  const resolved = resolveCurrencyCode(code)
  const rub = pivot[code] ?? pivot[resolved]
  return rub == null || !Number.isFinite(rub) || rub <= 0 ? null : rub
}

function sideRubPerUnit(
  code: string,
  date: string,
  side: 'buy' | 'sell',
  overrides: FxOverride[],
  pivot: Record<string, number>,
): number | null {
  if (code === 'RUB' || resolveCurrencyCode(code) === 'RUB') return 1
  const override = findNearestFxOverride(date, code, overrides)
  if (override) return side === 'buy' ? override.buyRate : override.sellRate
  return pivotRubPerUnit(code, pivot)
}

/**
 * Desk conversion for a date: sell `from` at buy, buy `to` at sell.
 * Null when neither currency has a dated override (caller falls back).
 */
export function convertViaDatedFx(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  date: string,
  overrides: FxOverride[],
  pivot: Record<string, number> | null | undefined,
): number | null {
  if (!(amount > 0) || !Number.isFinite(amount)) return null
  if (fromCurrency === toCurrency) return amount
  const fromOv = findNearestFxOverride(date, fromCurrency, overrides)
  const toOv = findNearestFxOverride(date, toCurrency, overrides)
  if (!fromOv && !toOv) return null
  const book = pivot ?? { RUB: 1 }
  const fromRub = sideRubPerUnit(fromCurrency, date, 'buy', overrides, book)
  const toRub = sideRubPerUnit(toCurrency, date, 'sell', overrides, book)
  if (fromRub == null || toRub == null || toRub === 0) return null
  return (amount * fromRub) / toRub
}

export function registryQuoteCodes(
  baseCurrency: string,
  currenciesInUse: string[],
  overrides: FxOverride[],
): string[] {
  const codes: string[] = []
  const seen = new Set<string>()
  for (const code of currenciesInUse) {
    if (code === 'RUB' || code === baseCurrency) continue
    if (seen.has(code)) continue
    seen.add(code)
    codes.push(code)
  }
  for (const item of overrides) {
    if (item.currency === 'RUB' || item.currency === baseCurrency) continue
    if (seen.has(item.currency)) continue
    seen.add(item.currency)
    codes.push(item.currency)
  }
  return codes
}

/**
 * Overlay manual buy/sell mids onto the CBR book so existing pivot lookup
 * (nearest date ≤ target) picks up overrides.
 */
export function applyFxOverrides(byDate: RateBook, overrides: FxOverride[]): RateBook {
  if (overrides.length === 0) return byDate
  const next: RateBook = { ...byDate }
  const datesTouched = new Set<string>()

  for (const item of overrides) {
    if (!datesTouched.has(item.date)) {
      next[item.date] = seedPivotForDate(next, item.date)
      datesTouched.add(item.date)
    }
    const pivot = next[item.date]!
    const mid = midRubRate(item)
    if (!Number.isFinite(mid) || mid <= 0) continue
    pivot[item.currency] = mid
  }

  return next
}
