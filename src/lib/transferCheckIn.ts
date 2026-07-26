import { balanceOnDate, convertAmount, type RateBook } from '../engine/growthEngine'
import type {
  Account,
  BalanceSnapshot,
  SnapshotLine,
  Transfer,
  WalletSettings,
} from '../types/wallet'

/** Lines for a transfer check-in: adjust from/to from current forward-filled balances. */
export function buildTransferSnapshotLines(input: {
  date: string
  fromAccountId: string
  toAccountId: string
  amount: number
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
  const toAmount =
    from.currency === to.currency
      ? input.amount
      : convertAmount(
          input.amount,
          from.currency,
          to.currency,
          input.settings,
          input.date,
          input.rateBook,
        )

  return [
    { accountId: from.id, amount: fromBal - input.amount },
    { accountId: to.id, amount: toBal + toAmount },
  ]
}

export function formatTransferLabel(
  transfer: Pick<Transfer, 'fromAccountId' | 'toAccountId' | 'amount'>,
  accounts: Account[],
): string {
  const from = accounts.find((a) => a.id === transfer.fromAccountId)
  const to = accounts.find((a) => a.id === transfer.toAccountId)
  const fromName = from?.name ?? '—'
  const toName = to?.name ?? '—'
  const currency = from?.currency ?? 'RUB'
  const amount = transfer.amount.toLocaleString('ru-RU', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  })
  return `${fromName} → ${toName}: ${amount} ${currency}`
}
