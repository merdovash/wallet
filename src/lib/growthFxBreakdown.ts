import { netTransfersIn, type RateBook } from '../engine/growthEngine'
import { resolvePivotForDate } from './cbrRates'
import { toBase } from './currency'
import type { PeriodReturnAccountLine } from './monthlyReturns'
import type { Account, Transfer, WalletSettings } from '../types/wallet'
export interface GrowthFxAccountLine {
  accountId: string
  name: string
  currency: string
  growthNative: number
  growthBase: number
  quantityEffectBase: number
  fxEffectBase: number
  transferTimingBase: number
}

export interface GrowthFxBreakdown {
  quantityEffectBase: number
  fxEffectBase: number
  /** growthBase − quantity − fx (dates/rates of transfers vs end rate). */
  transferTimingBase: number
  totalGrowth: number
  accounts: GrowthFxAccountLine[]
}

function unitInBase(
  currency: string,
  settings: WalletSettings,
  pivot: Record<string, number> | null,
): number {
  return toBase(1, currency, settings.baseCurrency, settings.exchangeRates, pivot)
}

/**
 * Split portfolio growth into native earnings (× end FX) and FX on opening balances.
 * See growth-return.md §8.
 */
export function buildGrowthFxBreakdown(
  includedAccounts: PeriodReturnAccountLine[],
  accounts: Account[],
  _snapshots: unknown[],
  transfers: Transfer[],
  settings: WalletSettings,
  startDate: string,
  endDate: string,
  rateBook?: RateBook,
): GrowthFxBreakdown | null {
  if (includedAccounts.length === 0) return null

  const startPivot =
    (rateBook ? resolvePivotForDate(startDate, rateBook) : null) ??
    (settings.baseCurrency === 'RUB' ? settings.exchangeRates : null)
  const endPivot =
    (rateBook ? resolvePivotForDate(endDate, rateBook) : null) ??
    (settings.baseCurrency === 'RUB' ? settings.exchangeRates : null)

  const accountMap = new Map(accounts.map((a) => [a.id, a]))
  const lines: GrowthFxAccountLine[] = []

  for (const row of includedAccounts) {
    const account = accountMap.get(row.accountId)
    if (!account) continue

    const transferNative = netTransfersIn(
      row.accountId,
      startDate,
      endDate,
      transfers,
      accounts,
      settings,
      rateBook,
    )
    const growthNative = row.endBalance - row.startBalance - transferNative
    const rate0 = unitInBase(account.currency, settings, startPivot)
    const rate1 = unitInBase(account.currency, settings, endPivot)
    const quantityEffectBase = growthNative * rate1
    const fxEffectBase =
      account.currency === settings.baseCurrency ? 0 : row.startBalance * (rate1 - rate0)
    const transferTimingBase = row.growthBase - quantityEffectBase - fxEffectBase

    lines.push({
      accountId: row.accountId,
      name: row.name,
      currency: row.currency,
      growthNative,
      growthBase: row.growthBase,
      quantityEffectBase,
      fxEffectBase,
      transferTimingBase,
    })
  }

  lines.sort((a, b) => b.growthBase - a.growthBase || a.name.localeCompare(b.name))

  const quantityEffectBase = lines.reduce((s, l) => s + l.quantityEffectBase, 0)
  const fxEffectBase = lines.reduce((s, l) => s + l.fxEffectBase, 0)
  const totalGrowth = lines.reduce((s, l) => s + l.growthBase, 0)
  const transferTimingBase = totalGrowth - quantityEffectBase - fxEffectBase

  return {
    quantityEffectBase,
    fxEffectBase,
    transferTimingBase,
    totalGrowth,
    accounts: lines,
  }
}
