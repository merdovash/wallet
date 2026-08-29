import { creditDebt } from '../engine/creditFloatEngine'
import {
  balanceOnDate,
  netWorthAmount,
  snapshotDates,
  type RateBook,
} from '../engine/growthEngine'
import { isCashbackKind, normalizeAccountKind } from './accountKinds'
import { resolvePivotForDate } from './cbrRates'
import { toBase } from './currency'
import type { Account, BalanceSnapshot, WalletSettings } from '../types/wallet'

export interface AccountsPageTotals {
  asOfDate: string | null
  /** Active non-credit, non-cashback balances in base currency. */
  totalMoneyBase: number
  /** Active credit-card debt in base currency. */
  creditDebtBase: number
}

export function buildAccountsPageTotals(
  accounts: Account[],
  snapshots: BalanceSnapshot[],
  settings: WalletSettings,
  rateBook?: RateBook,
): AccountsPageTotals {
  const dates = snapshotDates(snapshots)
  const asOfDate = dates[dates.length - 1] ?? null
  if (!asOfDate) {
    return { asOfDate: null, totalMoneyBase: 0, creditDebtBase: 0 }
  }

  const pivot =
    resolvePivotForDate(asOfDate, rateBook ?? {}) ??
    (settings.baseCurrency === 'RUB' ? settings.exchangeRates : null)

  let totalMoneyBase = 0
  let creditDebtBase = 0

  for (const account of accounts) {
    if (account.archived) continue
    const kind = normalizeAccountKind(account.kind)
    const recorded = balanceOnDate(account.id, asOfDate, snapshots)
    if (recorded == null) continue

    if (kind === 'credit') {
      const debt = creditDebt(account.creditLimit ?? 0, recorded)
      if (debt <= 0) continue
      const base = toBase(
        debt,
        account.currency,
        settings.baseCurrency,
        settings.exchangeRates,
        pivot,
      )
      if (Number.isFinite(base)) creditDebtBase += base
      continue
    }

    if (isCashbackKind(kind)) continue

    const base = toBase(
      netWorthAmount(account, recorded),
      account.currency,
      settings.baseCurrency,
      settings.exchangeRates,
      pivot,
    )
    if (Number.isFinite(base)) totalMoneyBase += base
  }

  return { asOfDate, totalMoneyBase, creditDebtBase }
}
