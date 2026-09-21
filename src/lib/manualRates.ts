import { convertAmount, type RateBook } from '../engine/growthEngine'
import type { ManualRate, WalletSettings } from '../types/wallet'

/**
 * Current manual rate for the pair: 1 `fromCurrency` = N × `toCurrency`.
 * A reverse pair is used as 1/rate. Returns null when the pair is not set.
 */
export function manualRateFor(
  fromCurrency: string,
  toCurrency: string,
  manualRates: ManualRate[],
): number | null {
  if (fromCurrency === toCurrency) return 1
  const direct = manualRates.find(
    (r) => r.fromCurrency === fromCurrency && r.toCurrency === toCurrency,
  )
  if (direct && Number.isFinite(direct.rate) && direct.rate > 0) return direct.rate
  const inverse = manualRates.find(
    (r) => r.fromCurrency === toCurrency && r.toCurrency === fromCurrency,
  )
  if (inverse && Number.isFinite(inverse.rate) && inverse.rate > 0) return 1 / inverse.rate
  return null
}

/** Convert via the manual pair rate only. Null when no manual rate is set. */
export function convertViaManualRate(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  manualRates: ManualRate[],
): number | null {
  const rate = manualRateFor(fromCurrency, toCurrency, manualRates)
  return rate == null ? null : amount * rate
}

/**
 * Exchange-time conversion: prefer the user's manual pair rate,
 * fall back to the official CBR conversion for `date`.
 */
export function convertForExchange(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  manualRates: ManualRate[],
  settings: WalletSettings,
  date: string,
  rateBook?: RateBook,
): number | null {
  const manual = convertViaManualRate(amount, fromCurrency, toCurrency, manualRates)
  if (manual != null && Number.isFinite(manual)) return manual
  const official = convertAmount(amount, fromCurrency, toCurrency, settings, date, rateBook)
  return Number.isFinite(official) ? official : null
}
