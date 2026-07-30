import {
  accountGrowthBase,
  balanceOnDate,
  convertAmount,
  growthCapitalFlows,
  modifiedDietzReturn,
  netGrowthCapitalFlow,
  netTransfersInBase,
  netWorthAmount,
  snapshotDates,
  totalOnDate,
  type DatedCapitalFlow,
  type RateBook,
} from '../engine/growthEngine'
import {
  accountKindLabel,
  growthAccounts,
  isGrowthAccount,
  normalizeAccountKind,
} from './accountKinds'
import { toBase } from './currency'
import { resolvePivotForDate } from './cbrRates'
import type { Account, BalanceSnapshot, Transfer, WalletSettings } from '../types/wallet'

export interface MonthlyReturnRow {
  yearMonth: string
  label: string
  startDate: string
  endDate: string
  startTotal: number
  endTotal: number
  growth: number
  netFlow: number
  weightedCapital: number
  /** Modified Dietz return for the month. */
  growthPct: number | null
  /** (1 + growthPct)^12 − 1 */
  annualizedPct: number | null
}

export interface PeriodReturnAccountLine {
  accountId: string
  name: string
  kind: string
  kindLabel: string
  currency: string
  startBalance: number
  endBalance: number
  startBase: number
  endBase: number
  /** endBase − startBase (includes transfers). */
  balanceChangeBase: number
  /** Net transfers into the account in base over the period. */
  transfersBase: number
  /** Transfer-adjusted growth in base (balanceChange − transfers). */
  growthBase: number
}

export interface PeriodReturnTransferLine {
  id: string
  date: string
  fromAccountId: string
  fromName: string
  toAccountId: string
  toName: string
  /** Amount in base currency (from source amount converted on transfer date). */
  amountBase: number
  /** True if the transfer crosses the growth-portfolio boundary. */
  crossesGrowthBoundary: boolean
}

export interface PeriodReturnFlowLine {
  date: string
  amount: number
  weight: number
  weightedAmount: number
}

export interface PeriodReturnSummary {
  startDate: string
  endDate: string
  days: number
  startTotal: number
  endTotal: number
  /** Net capital into growth portfolio (boundary transfers only). */
  netFlow: number
  /** Start total + time-weighted flows (Modified Dietz denominator). */
  weightedCapital: number
  growth: number
  growthPct: number | null
  annualizedPct: number | null
  /** Number of fund/deposit/investment accounts in the calculation. */
  accountCount: number
  flows: PeriodReturnFlowLine[]
  /** Transfers that touch at least one growth account in the period. */
  transferMovements: PeriodReturnTransferLine[]
  includedAccounts: PeriodReturnAccountLine[]
  excludedAccounts: PeriodReturnAccountLine[]
}

const MONTH_LABELS = [
  'янв',
  'фев',
  'мар',
  'апр',
  'май',
  'июн',
  'июл',
  'авг',
  'сен',
  'окт',
  'ноя',
  'дек',
] as const

export function yearMonthOf(date: string): string {
  return date.slice(0, 7)
}

export function formatYearMonthLabel(yearMonth: string): string {
  const [y, m] = yearMonth.split('-')
  const monthIndex = Number(m) - 1
  const month = MONTH_LABELS[monthIndex] ?? m
  return `${month} ${y}`
}

/** Compound a single-period monthly return to an annual rate. */
export function annualizeMonthlyReturn(monthlyPct: number): number {
  return (1 + monthlyPct) ** 12 - 1
}

/** Annualize a return observed over `days` calendar days. */
export function annualizePeriodReturn(periodPct: number, days: number): number {
  if (!(days > 0) || !Number.isFinite(periodPct)) return periodPct
  return (1 + periodPct) ** (365 / days) - 1
}

function daysBetween(startDate: string, endDate: string): number {
  const start = Date.parse(`${startDate}T00:00:00Z`)
  const end = Date.parse(`${endDate}T00:00:00Z`)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0
  return Math.max(0, Math.round((end - start) / 86_400_000))
}

function flowLines(
  startDate: string,
  endDate: string,
  flows: DatedCapitalFlow[],
): PeriodReturnFlowLine[] {
  const periodDays = daysBetween(startDate, endDate)
  return flows.map((flow) => {
    const elapsed = daysBetween(startDate, flow.date)
    const weight =
      periodDays > 0 ? Math.max(0, Math.min(1, (periodDays - elapsed) / periodDays)) : 0
    return {
      date: flow.date,
      amount: flow.amount,
      weight,
      weightedAmount: flow.amount * weight,
    }
  })
}

/**
 * Month-by-month returns using last snapshot of each month as the close,
 * and the previous month's close (or first snapshot in the first month) as open.
 * Income/expense and boundary transfers are excluded from growth and
 * time-weighted in the percentage (Modified Dietz).
 * Income/expense fields on check-ins are ignored (they belong to operational).
 */
export function buildMonthlyReturns(
  accounts: Account[],
  snapshots: BalanceSnapshot[],
  settings: WalletSettings,
  rateBook?: RateBook,
  transfers: Transfer[] = [],
): MonthlyReturnRow[] {
  const eligible = growthAccounts(accounts)
  const dates = snapshotDates(snapshots)
  if (dates.length < 2 || eligible.length === 0) return []

  const lastDateByMonth = new Map<string, string>()
  for (const date of dates) {
    lastDateByMonth.set(yearMonthOf(date), date)
  }
  const months = [...lastDateByMonth.keys()].sort()

  const rows: MonthlyReturnRow[] = []
  for (let i = 0; i < months.length; i += 1) {
    const yearMonth = months[i]!
    const endDate = lastDateByMonth.get(yearMonth)!
    let startDate: string
    if (i === 0) {
      const firstInMonth = dates.find((d) => yearMonthOf(d) === yearMonth)!
      startDate = firstInMonth
    } else {
      startDate = lastDateByMonth.get(months[i - 1]!)!
    }
    if (startDate === endDate) continue

    const startTotal = totalOnDate(startDate, eligible, snapshots, settings, { rateBook })
    const endTotal = totalOnDate(endDate, eligible, snapshots, settings, { rateBook })
    const flows = growthCapitalFlows(
      startDate,
      endDate,
      snapshots,
      transfers,
      accounts,
      settings,
      rateBook,
    )
    const netFlow = flows.reduce((sum, f) => sum + f.amount, 0)
    const growth = endTotal - startTotal - netFlow
    const { growthPct, weightedCapital } = modifiedDietzReturn(
      startTotal,
      growth,
      startDate,
      endDate,
      flows,
    )

    rows.push({
      yearMonth,
      label: formatYearMonthLabel(yearMonth),
      startDate,
      endDate,
      startTotal,
      endTotal,
      growth,
      netFlow,
      weightedCapital,
      growthPct,
      annualizedPct: growthPct == null ? null : annualizeMonthlyReturn(growthPct),
    })
  }
  return rows
}

/** Overall return from first to last snapshot, cashflow-adjusted (Modified Dietz). */
export function buildPeriodReturn(
  accounts: Account[],
  snapshots: BalanceSnapshot[],
  settings: WalletSettings,
  rateBook?: RateBook,
  transfers: Transfer[] = [],
): PeriodReturnSummary | null {
  const eligible = growthAccounts(accounts)
  const dates = snapshotDates(snapshots)
  if (dates.length < 2 || eligible.length === 0) return null
  const startDate = dates[0]!
  const endDate = dates[dates.length - 1]!
  const startTotal = totalOnDate(startDate, eligible, snapshots, settings, { rateBook })
  const endTotal = totalOnDate(endDate, eligible, snapshots, settings, { rateBook })
  const flows = growthCapitalFlows(
    startDate,
    endDate,
    snapshots,
    transfers,
    accounts,
    settings,
    rateBook,
  )
  const netFlow = netGrowthCapitalFlow(
    startDate,
    endDate,
    snapshots,
    transfers,
    accounts,
    settings,
    rateBook,
  )
  const growth = endTotal - startTotal - netFlow
  const { growthPct, weightedCapital } = modifiedDietzReturn(
    startTotal,
    growth,
    startDate,
    endDate,
    flows,
  )
  const days = daysBetween(startDate, endDate)

  const startPivot =
    (rateBook ? resolvePivotForDate(startDate, rateBook) : null) ??
    (settings.baseCurrency === 'RUB' ? settings.exchangeRates : null)
  const endPivot =
    (rateBook ? resolvePivotForDate(endDate, rateBook) : null) ??
    (settings.baseCurrency === 'RUB' ? settings.exchangeRates : null)

  const active = accounts
    .filter((a) => !a.archived)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))

  function lineFor(account: Account): PeriodReturnAccountLine {
    const kind = normalizeAccountKind(account.kind)
    const startRec = balanceOnDate(account.id, startDate, snapshots)
    const endRec = balanceOnDate(account.id, endDate, snapshots)
    const startBal = startRec == null ? 0 : netWorthAmount(account, startRec)
    const endBal = endRec == null ? 0 : netWorthAmount(account, endRec)
    const startBase = toBase(
      startBal,
      account.currency,
      settings.baseCurrency,
      settings.exchangeRates,
      startPivot,
    )
    const endBase = toBase(
      endBal,
      account.currency,
      settings.baseCurrency,
      settings.exchangeRates,
      endPivot,
    )
    const transfersBase = isGrowthAccount(account)
      ? netTransfersInBase(
          account.id,
          startDate,
          endDate,
          transfers,
          accounts,
          settings,
          rateBook,
        )
      : 0
    const growthBase = isGrowthAccount(account)
      ? (accountGrowthBase(
          account.id,
          startDate,
          endDate,
          snapshots,
          transfers,
          accounts,
          settings,
          rateBook,
        ) ?? 0)
      : 0
    return {
      accountId: account.id,
      name: account.name,
      kind,
      kindLabel: accountKindLabel(kind),
      currency: account.currency,
      startBalance: startBal,
      endBalance: endBal,
      startBase,
      endBase,
      balanceChangeBase: endBase - startBase,
      transfersBase,
      growthBase,
    }
  }

  const includedAccounts = eligible.map(lineFor)
  const excludedAccounts = active.filter((a) => !isGrowthAccount(a)).map(lineFor)

  const nameById = new Map(accounts.map((a) => [a.id, a.name]))
  const transferMovements: PeriodReturnTransferLine[] = []
  for (const t of transfers) {
    if (t.date.localeCompare(startDate) <= 0) continue
    if (t.date.localeCompare(endDate) > 0) continue
    const from = accounts.find((a) => a.id === t.fromAccountId)
    const to = accounts.find((a) => a.id === t.toAccountId)
    if (!from || !to) continue
    const fromGrowth = isGrowthAccount(from)
    const toGrowth = isGrowthAccount(to)
    if (!fromGrowth && !toGrowth) continue
    const amountBase = convertAmount(
      t.amount,
      from.currency,
      settings.baseCurrency,
      settings,
      t.date,
      rateBook,
    )
    transferMovements.push({
      id: t.id,
      date: t.date,
      fromAccountId: from.id,
      fromName: nameById.get(from.id) ?? from.name,
      toAccountId: to.id,
      toName: nameById.get(to.id) ?? to.name,
      amountBase,
      crossesGrowthBoundary: fromGrowth !== toGrowth,
    })
  }
  transferMovements.sort(
    (a, b) => a.date.localeCompare(b.date) || a.fromName.localeCompare(b.fromName),
  )

  return {
    startDate,
    endDate,
    days,
    startTotal,
    endTotal,
    netFlow,
    weightedCapital,
    growth,
    growthPct,
    annualizedPct:
      growthPct == null || days <= 0 ? null : annualizePeriodReturn(growthPct, days),
    accountCount: eligible.length,
    flows: flowLines(startDate, endDate, flows),
    transferMovements,
    includedAccounts,
    excludedAccounts,
  }
}
