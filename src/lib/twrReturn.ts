import {
  growthPortfolioTotalOnDate,
  netGrowthCapitalFlow,
  snapshotDates,
  type RateBook,
} from '../engine/growthEngine'
import type { Account, BalanceSnapshot, Transfer, WalletSettings } from '../types/wallet'

export interface TwrSubPeriod {
  startDate: string
  endDate: string
  startTotal: number
  endTotal: number
  netFlow: number
  subReturnPct: number | null
}

export interface TimeWeightedReturnResult {
  twrPct: number | null
  subPeriods: TwrSubPeriod[]
}

/**
 * Time-weighted return: chain sub-period returns between consecutive check-ins.
 * For each sub-period: rᵢ = (V_end − CF) / V_start − 1, then ∏(1+rᵢ) − 1.
 */
export function buildTimeWeightedReturn(
  accounts: Account[],
  snapshots: BalanceSnapshot[],
  settings: WalletSettings,
  rateBook: RateBook | undefined,
  transfers: Transfer[],
  startDate: string,
  endDate: string,
): TimeWeightedReturnResult {
  const periodDates = snapshotDates(snapshots).filter(
    (d) => d.localeCompare(startDate) >= 0 && d.localeCompare(endDate) <= 0,
  )
  if (periodDates.length < 2) return { twrPct: null, subPeriods: [] }

  const subPeriods: TwrSubPeriod[] = []
  let compound = 1
  let hasReturn = false

  for (let i = 1; i < periodDates.length; i += 1) {
    const subStart = periodDates[i - 1]!
    const subEnd = periodDates[i]!
    const startTotal = growthPortfolioTotalOnDate(
      subStart,
      accounts,
      snapshots,
      settings,
      rateBook,
    )
    const endTotal = growthPortfolioTotalOnDate(
      subEnd,
      accounts,
      snapshots,
      settings,
      rateBook,
    )
    const netFlow = netGrowthCapitalFlow(
      subStart,
      subEnd,
      snapshots,
      transfers,
      accounts,
      settings,
      rateBook,
    )

    let subReturnPct: number | null = null
    if (Number.isFinite(startTotal) && startTotal > 0) {
      const value = (endTotal - netFlow) / startTotal - 1
      if (Number.isFinite(value)) {
        subReturnPct = value
        compound *= 1 + value
        hasReturn = true
      }
    }

    subPeriods.push({
      startDate: subStart,
      endDate: subEnd,
      startTotal,
      endTotal,
      netFlow,
      subReturnPct,
    })
  }

  return {
    twrPct: hasReturn ? compound - 1 : null,
    subPeriods,
  }
}
