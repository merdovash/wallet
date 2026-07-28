import {
  netExternalCashflow,
  snapshotDates,
  totalOnDate,
  type RateBook,
} from '../engine/growthEngine'
import type { Account, BalanceSnapshot, WalletSettings } from '../types/wallet'

export interface MonthlyReturnRow {
  yearMonth: string
  label: string
  startDate: string
  endDate: string
  startTotal: number
  endTotal: number
  growth: number
  /** Simple return for the month: growth / startTotal. */
  growthPct: number | null
  /** (1 + growthPct)^12 − 1 */
  annualizedPct: number | null
}

export interface PeriodReturnSummary {
  startDate: string
  endDate: string
  days: number
  startTotal: number
  endTotal: number
  growth: number
  growthPct: number | null
  annualizedPct: number | null
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

function pctOrNull(growth: number, startTotal: number): number | null {
  if (!Number.isFinite(startTotal) || startTotal === 0) return null
  return growth / startTotal
}

/**
 * Month-by-month returns using last snapshot of each month as the close,
 * and the previous month's close (or first snapshot in the first month) as open.
 * External income/expense are excluded from growth.
 */
export function buildMonthlyReturns(
  accounts: Account[],
  snapshots: BalanceSnapshot[],
  settings: WalletSettings,
  rateBook?: RateBook,
): MonthlyReturnRow[] {
  const dates = snapshotDates(snapshots)
  if (dates.length < 2) return []

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

    const startTotal = totalOnDate(startDate, accounts, snapshots, settings, { rateBook })
    const endTotal = totalOnDate(endDate, accounts, snapshots, settings, { rateBook })
    const netFlow = netExternalCashflow(startDate, endDate, snapshots)
    const growth = endTotal - startTotal - netFlow
    const growthPct = pctOrNull(growth, startTotal)

    rows.push({
      yearMonth,
      label: formatYearMonthLabel(yearMonth),
      startDate,
      endDate,
      startTotal,
      endTotal,
      growth,
      growthPct,
      annualizedPct: growthPct == null ? null : annualizeMonthlyReturn(growthPct),
    })
  }
  return rows
}

/** Overall return from first to last snapshot, cashflow-adjusted, with annualization. */
export function buildPeriodReturn(
  accounts: Account[],
  snapshots: BalanceSnapshot[],
  settings: WalletSettings,
  rateBook?: RateBook,
): PeriodReturnSummary | null {
  const dates = snapshotDates(snapshots)
  if (dates.length < 2) return null
  const startDate = dates[0]!
  const endDate = dates[dates.length - 1]!
  const startTotal = totalOnDate(startDate, accounts, snapshots, settings, { rateBook })
  const endTotal = totalOnDate(endDate, accounts, snapshots, settings, { rateBook })
  const netFlow = netExternalCashflow(startDate, endDate, snapshots)
  const growth = endTotal - startTotal - netFlow
  const growthPct = pctOrNull(growth, startTotal)
  const days = daysBetween(startDate, endDate)
  return {
    startDate,
    endDate,
    days,
    startTotal,
    endTotal,
    growth,
    growthPct,
    annualizedPct:
      growthPct == null || days <= 0 ? null : annualizePeriodReturn(growthPct, days),
  }
}
