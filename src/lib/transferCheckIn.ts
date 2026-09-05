import { balanceOnDate, convertAmount, type RateBook } from '../engine/growthEngine'
import type {
  Account,
  BalanceSnapshot,
  SnapshotLine,
  Transfer,
  WalletSettings,
} from '../types/wallet'
import { formatCurrency } from './format'
import { transferReceivedAmount } from './transferAmounts'

/** Lines for a transfer check-in: adjust from/to from current forward-filled balances. */
export function buildTransferSnapshotLines(input: {
  date: string
  fromAccountId: string
  toAccountId: string
  amount: number
  toAmount?: number
  accounts: Account[]
  snapshots: BalanceSnapshot[]
  settings: WalletSettings
  rateBook?: RateBook
}): SnapshotLine[] {
  const from = input.accounts.find((a) => a.id === input.fromAccountId)
  const to = input.accounts.find((a) => a.id === input.toAccountId)
  if (!from || !to) return []

  const fromBal = balanceOnDate(from.id, input.date, input.snapshots) ?? 0
  const toBal = balanceOnDate(to.id, input.date, input.snapshots) ?? 0
  const toAmount = transferReceivedAmount(
    {
      date: input.date,
      fromAccountId: input.fromAccountId,
      toAccountId: input.toAccountId,
      amount: input.amount,
      toAmount: input.toAmount,
    },
    from,
    to,
    input.settings,
    input.rateBook,
  )

  return [
    { accountId: from.id, amount: fromBal - input.amount },
    { accountId: to.id, amount: toBal + toAmount },
  ]
}

export function formatTransferLabel(
  transfer: Pick<Transfer, 'fromAccountId' | 'toAccountId' | 'amount' | 'toAmount'>,
  accounts: Account[],
  opts?: {
    settings?: WalletSettings
    date?: string
    rateBook?: RateBook
  },
): string {
  const from = accounts.find((a) => a.id === transfer.fromAccountId)
  const to = accounts.find((a) => a.id === transfer.toAccountId)
  const fromName = from?.name ?? '—'
  const toName = to?.name ?? '—'
  const fromCurrency = from?.currency ?? 'RUB'
  const toCurrency = to?.currency ?? fromCurrency
  const sent = formatCurrency(transfer.amount, fromCurrency)

  let received = transfer.toAmount
  if (received == null && from && to && opts?.settings) {
    received = transferReceivedAmount(
      {
        date: opts.date ?? '',
        fromAccountId: transfer.fromAccountId,
        toAccountId: transfer.toAccountId,
        amount: transfer.amount,
        toAmount: transfer.toAmount,
      },
      from,
      to,
      opts.settings,
      opts.rateBook,
    )
  }

  if (
    received != null &&
    (fromCurrency !== toCurrency || Math.abs(received - transfer.amount) >= 0.005)
  ) {
    return `${fromName} → ${toName}: ${sent} → ${formatCurrency(received, toCurrency)}`
  }
  return `${fromName} → ${toName}: ${sent}`
}

/** Official conversion of the sent amount into the destination currency. */
export function suggestedReceiveAmount(
  amount: number,
  from: Pick<Account, 'currency'> | undefined,
  to: Pick<Account, 'currency'> | undefined,
  settings: WalletSettings,
  date: string,
  rateBook?: RateBook,
): number | null {
  if (!from || !to || !(amount > 0)) return null
  if (from.currency === to.currency) return amount
  const converted = convertAmount(amount, from.currency, to.currency, settings, date, rateBook)
  return Number.isFinite(converted) ? converted : null
}
