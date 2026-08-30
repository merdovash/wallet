import type { BalanceSnapshot } from '../types/wallet'
import { todayIsoDate } from './format'

const FUNDS_MONTHS_STORAGE_KEY = 'wallet-funds-expense-months'
export const FUNDS_EXPENSE_MONTHS_MIN = 1
export const FUNDS_EXPENSE_MONTHS_MAX = 12
export const FUNDS_EXPENSE_MONTHS_DEFAULT = 3

function clampMonths(n: number): number {
  if (!Number.isFinite(n)) return FUNDS_EXPENSE_MONTHS_DEFAULT
  return Math.min(FUNDS_EXPENSE_MONTHS_MAX, Math.max(FUNDS_EXPENSE_MONTHS_MIN, Math.round(n)))
}

export function readFundsExpenseMonths(): number {
  try {
    const raw = sessionStorage.getItem(FUNDS_MONTHS_STORAGE_KEY)
    if (raw == null) return FUNDS_EXPENSE_MONTHS_DEFAULT
    return clampMonths(Number(raw))
  } catch {
    return FUNDS_EXPENSE_MONTHS_DEFAULT
  }
}

export function writeFundsExpenseMonths(months: number): void {
  try {
    sessionStorage.setItem(FUNDS_MONTHS_STORAGE_KEY, String(clampMonths(months)))
  } catch {
    /* ignore */
  }
}

export function shiftIsoDateMonths(iso: string, deltaMonths: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return iso
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1 + deltaMonths, day))
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export interface AvgMonthlyExpense {
  months: number
  startDate: string
  endDate: string
  totalExpense: number
  avgMonthly: number
}

/**
 * Average check-in expense over the last N calendar months ending at `endDate`.
 * Does not persist a rollup — sums snapshot.expense in the window.
 */
export function avgMonthlyExpense(
  snapshots: BalanceSnapshot[],
  months: number,
  endDate: string = todayIsoDate(),
): AvgMonthlyExpense {
  const n = clampMonths(months)
  const startDate = shiftIsoDateMonths(endDate, -n)
  let totalExpense = 0
  for (const snap of snapshots) {
    if (snap.date.localeCompare(startDate) <= 0) continue
    if (snap.date.localeCompare(endDate) > 0) continue
    totalExpense += snap.expense ?? 0
  }
  return {
    months: n,
    startDate,
    endDate,
    totalExpense,
    avgMonthly: totalExpense / n,
  }
}
