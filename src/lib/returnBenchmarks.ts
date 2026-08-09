import { nearestRateDate, resolvePivotForDate } from './cbrRates'
import { annualizePeriodReturn, MIN_ANNUALIZE_DAYS } from './monthlyReturns'

export interface ReturnBenchmarks {
  /** Key rate from settings (already annual). */
  keyRateAnnualizedPct: number | null
  /** USD/RUB change over the period (not annualized). */
  usdPeriodPct: number | null
  /** USD change annualized over the period. */
  usdAnnualizedPct: number | null
  /** Portfolio annualized minus key rate. */
  vsKeyRatePct: number | null
  /** Portfolio annualized minus USD annualized. */
  vsUsdPct: number | null
  usdStartRate: number | null
  usdEndRate: number | null
  usdStartRateDate: string | null
  usdEndRateDate: string | null
}

function usdRubRate(pivot: Record<string, number> | null | undefined): number | null {
  if (!pivot) return null
  const rate = pivot.USD
  if (rate == null || !Number.isFinite(rate) || rate <= 0) return null
  return rate
}

export function buildReturnBenchmarks(
  portfolioAnnualizedPct: number | null,
  days: number,
  startDate: string,
  endDate: string,
  keyRatePct: number | null | undefined,
  rateBook: Record<string, Record<string, number>> | undefined,
): ReturnBenchmarks {
  const keyRateAnnualizedPct =
    keyRatePct != null && Number.isFinite(keyRatePct) ? keyRatePct : null

  let usdStartRate: number | null = null
  let usdEndRate: number | null = null
  let usdStartRateDate: string | null = null
  let usdEndRateDate: string | null = null

  if (rateBook) {
    usdStartRateDate = nearestRateDate(startDate, rateBook)
    usdEndRateDate = nearestRateDate(endDate, rateBook)
    usdStartRate = usdRubRate(resolvePivotForDate(startDate, rateBook))
    usdEndRate = usdRubRate(resolvePivotForDate(endDate, rateBook))
  }

  const usdPeriodPct =
    usdStartRate != null && usdEndRate != null && usdStartRate > 0
      ? usdEndRate / usdStartRate - 1
      : null

  const usdAnnualizedPct =
    usdPeriodPct != null && days >= MIN_ANNUALIZE_DAYS
      ? annualizePeriodReturn(usdPeriodPct, days)
      : null

  const vsKeyRatePct =
    portfolioAnnualizedPct != null && keyRateAnnualizedPct != null
      ? portfolioAnnualizedPct - keyRateAnnualizedPct
      : null

  const vsUsdPct =
    portfolioAnnualizedPct != null && usdAnnualizedPct != null
      ? portfolioAnnualizedPct - usdAnnualizedPct
      : null

  return {
    keyRateAnnualizedPct,
    usdPeriodPct,
    usdAnnualizedPct,
    vsKeyRatePct,
    vsUsdPct,
    usdStartRate,
    usdEndRate,
    usdStartRateDate,
    usdEndRateDate,
  }
}
