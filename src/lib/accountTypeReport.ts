import { toBase } from './currency'
import {
  accountGrowth,
  accountGrowthBase,
  balanceOnDate,
  convertAmount,
  modifiedDietzReturn,
  netWorthAmount,
  snapshotDates,
  type DatedCapitalFlow,
  type GrowthFxMode,
  type RateBook,
} from '../engine/growthEngine'
import { resolvePivotForDate } from './cbrRates'
import {
  ACCOUNT_KIND_ORDER,
  accountKindLabel,
  isGrowthAccount,
  isGrowthKind,
  normalizeAccountKind,
} from './accountKinds'
import { annualizePeriodReturn, pctOfAllMass } from './monthlyReturns'
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
  /** Net-worth at the first check-in (base). */
  startBalanceBase: number
  growthBase: number
  /** Modified Dietz relative growth for this kind (null if not applicable). */
  growthPct: number | null
  /** Annualized relative growth for this kind. */
  annualizedPct: number | null
  share: number
  accounts: AccountTypeReportAccountRow[]
}

export interface AccountTypeReport {
  asOfDate: string | null
  startDate: string | null
  days: number
  baseCurrency: string
  grandTotalBase: number
  grandGrowthBase: number
  /** Growth ÷ invest accounts (fund/deposit/investment) at start. */
  growthPctInvest: number | null
  /** Growth ÷ all money at start (ex-top-ups in numerator). */
  growthPctOfAllMass: number | null
  /** @deprecated use growthPctOfAllMass — kept as alias for older call sites */
  growthPct: number | null
  annualizedPct: number | null
  rows: AccountTypeReportRow[]
}

function daysBetween(startDate: string, endDate: string): number {
  const start = Date.parse(`${startDate}T00:00:00Z`)
  const end = Date.parse(`${endDate}T00:00:00Z`)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0
  return Math.max(0, Math.round((end - start) / 86_400_000))
}

function kindCapitalFlows(
  kind: AccountKind,
  t0: string,
  t1: string,
  transfers: Transfer[],
  accounts: Account[],
  settings: WalletSettings,
  rateBook?: RateBook,
): DatedCapitalFlow[] {
  const map = new Map(accounts.map((a) => [a.id, a]))
  const byDate = new Map<string, number>()

  for (const t of transfers) {
    if (t.date <= t0 || t.date > t1) continue
    const from = map.get(t.fromAccountId)
    const to = map.get(t.toAccountId)
    if (!from || !to) continue
    const fromKind = normalizeAccountKind(from.kind)
    const toKind = normalizeAccountKind(to.kind)
    if (fromKind === toKind) continue
    if (fromKind !== kind && toKind !== kind) continue

    const amountBase = convertAmount(
      t.amount,
      from.currency,
      settings.baseCurrency,
      settings,
      t.date,
      rateBook,
    )
    const signed = toKind === kind ? amountBase : -amountBase
    byDate.set(t.date, (byDate.get(t.date) ?? 0) + signed)
  }

  return [...byDate.entries()]
    .filter(([, amount]) => amount !== 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, amount]) => ({ date, amount }))
}

function emptyReport(
  asOfDate: string | null,
  baseCurrency: string,
): AccountTypeReport {
  return {
    asOfDate,
    startDate: null,
    days: 0,
    baseCurrency,
    grandTotalBase: 0,
    grandGrowthBase: 0,
    growthPctInvest: null,
    growthPctOfAllMass: null,
    growthPct: null,
    annualizedPct: null,
    rows: [],
  }
}

export function buildAccountTypeReport(
  accounts: Account[],
  snapshots: BalanceSnapshot[],
  transfers: Transfer[],
  settings: WalletSettings,
  rateBook?: RateBook,
  fxMode: GrowthFxMode = 'withFx',
  range?: { startDate: string; endDate: string },
): AccountTypeReport {
  const dates = snapshotDates(snapshots)
  const t0 = range?.startDate ?? dates[0] ?? null
  const t1 = range?.endDate ?? dates[dates.length - 1] ?? null
  const active = accounts
    .filter((a) => !a.archived)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))

  if (!t1 || active.length === 0) {
    return emptyReport(t1, settings.baseCurrency)
  }

  const days = t0 != null ? daysBetween(t0, t1) : 0
  const pivotT1 =
    (rateBook ? resolvePivotForDate(t1, rateBook) : null) ??
    (settings.baseCurrency === 'RUB' ? settings.exchangeRates : null)
  const pivotT0 =
    t0 != null
      ? ((rateBook ? resolvePivotForDate(t0, rateBook) : null) ??
        (settings.baseCurrency === 'RUB' ? settings.exchangeRates : null))
      : null

  const byKind = new Map<
    AccountKind,
    {
      balanceBase: number
      startBalanceBase: number
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
      pivotT1,
    )
    const startRecorded = t0 != null ? balanceOnDate(account.id, t0, snapshots) : null
    const startBalanceBase =
      t0 != null && startRecorded != null
        ? toBase(
            netWorthAmount(account, startRecorded),
            account.currency,
            settings.baseCurrency,
            settings.exchangeRates,
            pivotT0,
          )
        : 0
    const growthBase =
      t0 != null && isGrowthAccount(account)
        ? fxMode === 'withoutFx'
          ? convertAmount(
              growth,
              account.currency,
              settings.baseCurrency,
              settings,
              t1,
              rateBook,
            )
          : (accountGrowthBase(
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

    const bucket = byKind.get(kind) ?? {
      balanceBase: 0,
      startBalanceBase: 0,
      growthBase: 0,
      accounts: [],
    }
    bucket.balanceBase += balanceBase
    bucket.startBalanceBase += startBalanceBase
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
      let growthPct: number | null = null
      let annualizedPct: number | null = null
      if (t0 != null && t0 !== t1 && isGrowthKind(kind)) {
        const flows = kindCapitalFlows(kind, t0, t1, transfers, accounts, settings, rateBook)
        const dietz = modifiedDietzReturn(
          data.startBalanceBase,
          data.growthBase,
          t0,
          t1,
          flows,
        )
        growthPct = dietz.growthPct
        annualizedPct =
          growthPct == null || days <= 0 ? null : annualizePeriodReturn(growthPct, days)
      }
      return {
        kind,
        label: accountKindLabel(kind),
        accountCount: data.accounts.length,
        balanceBase: data.balanceBase,
        startBalanceBase: data.startBalanceBase,
        growthBase: data.growthBase,
        growthPct,
        annualizedPct,
        share: grandTotalBase !== 0 ? data.balanceBase / Math.abs(grandTotalBase) : 0,
        accounts: data.accounts,
      }
    },
  )

  const growthRows = rows.filter((r) => isGrowthKind(r.kind))
  const growthAmount = growthRows.reduce((s, r) => s + r.growthBase, 0)
  const investStart = growthRows.reduce((s, r) => s + r.startBalanceBase, 0)
  const allMassStart = [...byKind.values()].reduce((s, r) => s + r.startBalanceBase, 0)
  const growthPctInvest =
    t0 != null && t0 !== t1 ? pctOfAllMass(growthAmount, investStart) : null
  const growthPctOfAllMass =
    t0 != null && t0 !== t1 ? pctOfAllMass(growthAmount, allMassStart) : null
  const annualizedPct =
    growthPctInvest == null || days <= 0 ? null : annualizePeriodReturn(growthPctInvest, days)

  return {
    asOfDate: t1,
    startDate: t0,
    days,
    baseCurrency: settings.baseCurrency,
    grandTotalBase,
    grandGrowthBase,
    growthPctInvest,
    growthPctOfAllMass,
    growthPct: growthPctOfAllMass,
    annualizedPct,
    rows,
  }
}
