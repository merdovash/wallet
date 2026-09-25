import { balanceOnDate, type RateBook } from '../engine/growthEngine'
import { convertForExchange } from './manualRates'
import type {
  Account,
  BalanceSnapshot,
  ManualRate,
  SnapshotLine,
  WalletSettings,
} from '../types/wallet'

export interface ExpenseCheckInInput {
  date: string
  accountId: string
  /** Currency the expense was made in. */
  currency: string
  /** Expense amount in `currency`. */
  amount: number
  /** Charged from the account (account currency); required for cross-currency. */
  accountAmount?: number
  accounts: Account[]
  snapshots: BalanceSnapshot[]
  manualRates: ManualRate[]
  settings: WalletSettings
  rateBook?: RateBook
}

export interface ExpenseCheckInPlan {
  account: Account
  /** Charged from the account, in the account currency. */
  accountAmount: number
  /** Charged minus the expense converted at the current exchange rate (account currency). */
  commission: number
  /** Snapshot line with the reduced balance. */
  line: SnapshotLine
  /** Charged amount in the base currency, to add to the snapshot's external expense. */
  expenseBase: number
}

/** Expected charge for a cross-currency expense at the current exchange rate. */
export function suggestedAccountAmount(
  amount: number,
  currency: string,
  account: Pick<Account, 'currency'> | undefined,
  manualRates: ManualRate[],
  settings: WalletSettings,
  date: string,
  rateBook?: RateBook,
): number | null {
  if (!account || !(amount > 0)) return null
  if (currency === account.currency) return amount
  return convertForExchange(
    amount,
    currency,
    account.currency,
    manualRates,
    settings,
    date,
    rateBook,
  )
}

/**
 * Conversion commission: charge minus the expense converted at the current
 * exchange rate (manual pair rate preferred, else CBR). 0 for same currency
 * or when no rate is available.
 */
export function expenseCommission(
  input: {
    amount: number
    currency: string
    accountAmount: number
    accountCurrency: string
    date: string
  },
  manualRates: ManualRate[],
  settings: WalletSettings,
  rateBook?: RateBook,
): number {
  if (input.currency === input.accountCurrency) return 0
  const reference = convertForExchange(
    input.amount,
    input.currency,
    input.accountCurrency,
    manualRates,
    settings,
    input.date,
    rateBook,
  )
  if (reference == null || !Number.isFinite(reference)) return 0
  return input.accountAmount - reference
}

/** Charged amount in the base currency (for the snapshot's external expense). */
export function expenseChargeBase(
  accountAmount: number,
  accountCurrency: string,
  date: string,
  manualRates: ManualRate[],
  settings: WalletSettings,
  rateBook?: RateBook,
): number {
  const base =
    convertForExchange(
      accountAmount,
      accountCurrency,
      settings.baseCurrency,
      manualRates,
      settings,
      date,
      rateBook,
    ) ?? 0
  return Math.max(0, base)
}

/** Resolve amounts, commission and the check-in line for a standalone expense. */
export function buildExpenseCheckInPlan(input: ExpenseCheckInInput): ExpenseCheckInPlan | null {
  const account = input.accounts.find((a) => a.id === input.accountId)
  if (!account || !(input.amount > 0)) return null

  const sameCurrency = input.currency === account.currency
  const accountAmount = sameCurrency ? input.amount : input.accountAmount
  if (accountAmount == null || !(accountAmount > 0)) return null

  const commission = expenseCommission(
    {
      amount: input.amount,
      currency: input.currency,
      accountAmount,
      accountCurrency: account.currency,
      date: input.date,
    },
    input.manualRates,
    input.settings,
    input.rateBook,
  )

  const balance = balanceOnDate(account.id, input.date, input.snapshots) ?? 0
  const expenseBase = expenseChargeBase(
    accountAmount,
    account.currency,
    input.date,
    input.manualRates,
    input.settings,
    input.rateBook,
  )

  return {
    account,
    accountAmount,
    commission,
    line: { accountId: account.id, amount: balance - accountAmount },
    expenseBase,
  }
}
