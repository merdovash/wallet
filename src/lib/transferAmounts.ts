import type { RateBook } from '../engine/growthEngine'
import { isGrowthPortfolioAccount } from './accountKinds'
import { resolvePivotForDate } from './cbrRates'
import { toBase } from './currency'
import type { Account, Transfer, WalletSettings } from '../types/wallet'

export type TransferAmountsInput = Pick<
  Transfer,
  'fromAccountId' | 'toAccountId' | 'amount' | 'date'
> & { toAmount?: number }

const EPS = 0.005

function accountMap(accounts: Account[]): Map<string, Account> {
  return new Map(accounts.map((a) => [a.id, a]))
}

function pivotFor(
  date: string,
  settings: WalletSettings,
  rateBook?: RateBook,
): Record<string, number> | null {
  if (rateBook) {
    const pivot = resolvePivotForDate(date, rateBook)
    if (pivot) return pivot
  }
  if (settings.baseCurrency === 'RUB') return settings.exchangeRates
  return null
}

function convert(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  settings: WalletSettings,
  date: string,
  rateBook?: RateBook,
): number {
  if (fromCurrency === toCurrency) return amount
  const pivot = pivotFor(date, settings, rateBook)
  const inBase = toBase(amount, fromCurrency, settings.baseCurrency, settings.exchangeRates, pivot)
  if (toCurrency === settings.baseCurrency) return inBase
  const inverse = toBase(1, toCurrency, settings.baseCurrency, settings.exchangeRates, pivot)
  if (!Number.isFinite(inverse) || inverse <= 0) return Number.NaN
  return inBase / inverse
}

/** Destination receipt in the destination currency. */
export function transferReceivedAmount(
  transfer: TransferAmountsInput,
  from: Pick<Account, 'currency'> | undefined,
  to: Pick<Account, 'currency'> | undefined,
  settings: WalletSettings,
  rateBook?: RateBook,
): number {
  if (transfer.toAmount != null && Number.isFinite(transfer.toAmount) && transfer.toAmount > 0) {
    return transfer.toAmount
  }
  if (!from || !to || from.currency === to.currency) return transfer.amount
  const converted = convert(
    transfer.amount,
    from.currency,
    to.currency,
    settings,
    transfer.date,
    rateBook,
  )
  return Number.isFinite(converted) ? converted : transfer.amount
}

/**
 * FX / fee residual is booked on the source if it is a growth account
 * (fund / deposit / investment); otherwise on the destination.
 */
export function transferAbsorbsOnSource(from: Pick<Account, 'kind'> | undefined): boolean {
  return from != null && isGrowthPortfolioAccount(from)
}

export function transferSentBase(
  transfer: TransferAmountsInput,
  from: Pick<Account, 'currency'> | undefined,
  settings: WalletSettings,
  rateBook?: RateBook,
): number {
  if (!from) return transfer.amount
  return convert(
    transfer.amount,
    from.currency,
    settings.baseCurrency,
    settings,
    transfer.date,
    rateBook,
  )
}

export function transferReceivedBase(
  transfer: TransferAmountsInput,
  from: Pick<Account, 'currency'> | undefined,
  to: Pick<Account, 'currency'> | undefined,
  settings: WalletSettings,
  rateBook?: RateBook,
): number {
  if (!to) return transferSentBase(transfer, from, settings, rateBook)
  const received = transferReceivedAmount(transfer, from, to, settings, rateBook)
  return convert(
    received,
    to.currency,
    settings.baseCurrency,
    settings,
    transfer.date,
    rateBook,
  )
}

/** Received − sent in base currency. Negative = loss (fee / worse rate). */
export function transferSpreadBase(
  transfer: TransferAmountsInput,
  from: Pick<Account, 'currency'> | undefined,
  to: Pick<Account, 'currency'> | undefined,
  settings: WalletSettings,
  rateBook?: RateBook,
): number {
  const sent = transferSentBase(transfer, from, settings, rateBook)
  const received = transferReceivedBase(transfer, from, to, settings, rateBook)
  if (!Number.isFinite(sent) || !Number.isFinite(received)) return 0
  return received - sent
}

export function isMeaningfulTransferSpread(spread: number): boolean {
  return Number.isFinite(spread) && Math.abs(spread) >= EPS
}

/** Actual cash movement in the account currency (not growth-adjusted). */
export function transferCashLegNative(
  accountId: string,
  transfer: TransferAmountsInput,
  accounts: Account[],
  settings?: WalletSettings,
  rateBook?: RateBook,
): number {
  const map = accountMap(accounts)
  const from = map.get(transfer.fromAccountId)
  const to = map.get(transfer.toAccountId)
  if (transfer.fromAccountId === accountId) return -transfer.amount
  if (transfer.toAccountId === accountId) {
    if (from && to && settings) {
      return transferReceivedAmount(transfer, from, to, settings, rateBook)
    }
    return transfer.toAmount ?? transfer.amount
  }
  return 0
}

/** Native-currency net for one side of a transfer (into the account). */
export function transferLegNative(
  accountId: string,
  transfer: TransferAmountsInput,
  accounts: Account[],
  settings?: WalletSettings,
  rateBook?: RateBook,
): number {
  const map = accountMap(accounts)
  const from = map.get(transfer.fromAccountId)
  const to = map.get(transfer.toAccountId)

  if (transfer.fromAccountId === accountId) {
    if (from && to && settings && transferAbsorbsOnSource(from)) {
      const received = transferReceivedAmount(transfer, from, to, settings, rateBook)
      return -convert(received, to.currency, from.currency, settings, transfer.date, rateBook)
    }
    return -transfer.amount
  }

  if (transfer.toAccountId === accountId) {
    if (from && to && settings && !transferAbsorbsOnSource(from)) {
      if (from.currency === to.currency) return transfer.amount
      return convert(transfer.amount, from.currency, to.currency, settings, transfer.date, rateBook)
    }
    if (from && to && settings) {
      return transferReceivedAmount(transfer, from, to, settings, rateBook)
    }
    return transfer.toAmount ?? transfer.amount
  }

  return 0
}

/** Base-currency net for one side of a transfer (into the account). */
export function transferLegBase(
  accountId: string,
  transfer: TransferAmountsInput,
  accounts: Account[],
  settings: WalletSettings,
  rateBook?: RateBook,
): number {
  const map = accountMap(accounts)
  const from = map.get(transfer.fromAccountId)
  const to = map.get(transfer.toAccountId)
  if (!from && transfer.fromAccountId === accountId) return -transfer.amount
  if (!to && transfer.toAccountId === accountId) return transfer.toAmount ?? transfer.amount

  const sentBase = transferSentBase(transfer, from, settings, rateBook)
  const receivedBase = transferReceivedBase(transfer, from, to, settings, rateBook)
  const absorbSource = transferAbsorbsOnSource(from)

  if (transfer.fromAccountId === accountId) {
    return absorbSource ? -receivedBase : -sentBase
  }
  if (transfer.toAccountId === accountId) {
    return absorbSource ? receivedBase : sentBase
  }
  return 0
}

/**
 * Portfolio-boundary flow in base: money that actually crossed in/out.
 * Residual (fee / FX) stays on the absorbing account as return, not as a flow.
 */
export function transferBoundaryFlowBase(
  transfer: TransferAmountsInput,
  from: Account,
  to: Account,
  settings: WalletSettings,
  rateBook?: RateBook,
): number {
  const fromGrowth = isGrowthPortfolioAccount(from)
  const toGrowth = isGrowthPortfolioAccount(to)
  if (fromGrowth === toGrowth) return 0

  const sentBase = transferSentBase(transfer, from, settings, rateBook)
  const receivedBase = transferReceivedBase(transfer, from, to, settings, rateBook)
  const absorbSource = transferAbsorbsOnSource(from)

  if (toGrowth && !fromGrowth) {
    return absorbSource ? receivedBase : sentBase
  }
  return absorbSource ? -receivedBase : -sentBase
}
