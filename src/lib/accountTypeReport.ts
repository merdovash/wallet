import { toBase } from './currency'
import {
  accountGrowth,
  balanceOnDate,
  netWorthAmount,
  snapshotDates,
  type RateBook,
} from '../engine/growthEngine'
import { resolvePivotForDate } from './cbrRates'
import {
  ACCOUNT_KIND_ORDER,
  accountKindLabel,
  isGrowthAccount,
  normalizeAccountKind,
} from './accountKinds'
import type {
  Account,
  AccountKind,
  BalanceSnapshot,
  Transfer,
  WalletSettings,
} from '../types/wallet'

export interface AccountTypeReportAccountRow {
  accountId: string
  name: string
  currency: string
  /** Display amount in account currency (debt for credit cards). */
  balance: number
  /** Net-worth contribution in base currency. */
  balanceBase: number
  growth: number
  growthBase: number
}

export interface AccountTypeReportRow {
  kind: AccountKind
  label: string
  accountCount: number
  balanceBase: number
  growthBase: number
  share: number
  accounts: AccountTypeReportAccountRow[]
}

export interface AccountTypeReport {
  asOfDate: string | null
  baseCurrency: string
  grandTotalBase: number
  grandGrowthBase: number
  rows: AccountTypeReportRow[]
}

export function buildAccountTypeReport(
  accounts: Account[],
  snapshots: BalanceSnapshot[],
  transfers: Transfer[],
  settings: WalletSettings,
  rateBook?: RateBook,
): AccountTypeReport {
  const dates = snapshotDates(snapshots)
  const t0 = dates[0] ?? null
  const t1 = dates[dates.length - 1] ?? null
  const active = accounts
    .filter((a) => !a.archived)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))

  if (!t1 || active.length === 0) {
    return {
      asOfDate: t1,
      baseCurrency: settings.baseCurrency,
      grandTotalBase: 0,
      grandGrowthBase: 0,
      rows: [],
    }
  }

  const pivot =
    (rateBook ? resolvePivotForDate(t1, rateBook) : null) ??
    (settings.baseCurrency === 'RUB' ? settings.exchangeRates : null)

  const byKind = new Map<
    AccountKind,
    {
      balanceBase: number
      growthBase: number
      accounts: AccountTypeReportAccountRow[]
    }
  >()

  for (const account of active) {
    const kind = normalizeAccountKind(account.kind)
    const recorded = balanceOnDate(account.id, t1, snapshots) ?? 0
    const nw = netWorthAmount(account, recorded)
    const displayBalance =
      kind === 'credit' ? Math.max(0, (account.creditLimit ?? 0) - recorded) : recorded
    const growth =
      t0 != null && isGrowthAccount(account)
        ? (accountGrowth(
            account.id,
            t0,
            t1,
            snapshots,
            transfers,
            accounts,
            settings,
            rateBook,
          ) ?? 0)
        : 0
    const balanceBase = toBase(
      nw,
      account.currency,
      settings.baseCurrency,
      settings.exchangeRates,
      pivot,
    )
    const growthBase = toBase(
      growth,
      account.currency,
      settings.baseCurrency,
      settings.exchangeRates,
      pivot,
    )

    const bucket = byKind.get(kind) ?? {
      balanceBase: 0,
      growthBase: 0,
      accounts: [],
    }
    bucket.balanceBase += balanceBase
    bucket.growthBase += growthBase
    bucket.accounts.push({
      accountId: account.id,
      name: account.name,
      currency: account.currency,
      balance: displayBalance,
      balanceBase,
      growth,
      growthBase,
    })
    byKind.set(kind, bucket)
  }

  const grandTotalBase = [...byKind.values()].reduce((s, r) => s + r.balanceBase, 0)
  const grandGrowthBase = [...byKind.values()].reduce((s, r) => s + r.growthBase, 0)

  const rows: AccountTypeReportRow[] = ACCOUNT_KIND_ORDER.filter((kind) => byKind.has(kind)).map(
    (kind) => {
      const data = byKind.get(kind)!
      return {
        kind,
        label: accountKindLabel(kind),
        accountCount: data.accounts.length,
        balanceBase: data.balanceBase,
        growthBase: data.growthBase,
        share: grandTotalBase !== 0 ? data.balanceBase / Math.abs(grandTotalBase) : 0,
        accounts: data.accounts,
      }
    },
  )

  return {
    asOfDate: t1,
    baseCurrency: settings.baseCurrency,
    grandTotalBase,
    grandGrowthBase,
    rows,
  }
}
