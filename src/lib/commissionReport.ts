import { convertAmount, type RateBook } from '../engine/growthEngine'
import type { PeriodRange } from './dashboardPeriod'
import { formatCurrency } from './format'
import {
  isMeaningfulTransferSpread,
  transferSpreadBase,
} from './transferAmounts'
import type {
  Account,
  Expense,
  Transfer,
  WalletSettings,
} from '../types/wallet'

export interface CommissionRow {
  id: string
  date: string
  kind: 'transfer' | 'expense'
  /** Человекочитаемое описание операции. */
  label: string
  /** Детали суммы операции в исходной валюте. */
  detail: string
  /** Комиссия в базовой валюте: положительная — потеря, отрицательная — выгода. */
  commissionBase: number
}

export interface CommissionMonthRow {
  /** YYYY-MM */
  month: string
  commissionBase: number
  rowCount: number
}

export interface CommissionReport {
  /** Все операции с комиссией, новые сверху. */
  rows: CommissionRow[]
  totalBase: number
  transfersBase: number
  expensesBase: number
  months: CommissionMonthRow[]
}

function inRange(date: string, range?: PeriodRange | null): boolean {
  if (!range) return true
  return date >= range.startDate && date <= range.endDate
}

/**
 * Отчёт по комиссиям: курсовая разница/комиссия переводов (получено − отправлено
 * по официальному курсу, со знаком минус — потеря) и зафиксированные комиссии
 * конвертации по расходам, всё в базовой валюте.
 */
export function buildCommissionReport(
  accounts: Account[],
  transfers: Transfer[],
  expenses: Expense[],
  settings: WalletSettings,
  rateBook?: RateBook,
  range?: PeriodRange | null,
): CommissionReport {
  const byId = new Map(accounts.map((a) => [a.id, a]))
  const rows: CommissionRow[] = []

  for (const transfer of transfers) {
    if (!inRange(transfer.date, range)) continue
    const from = byId.get(transfer.fromAccountId)
    const to = byId.get(transfer.toAccountId)
    const spread = transferSpreadBase(transfer, from, to, settings, rateBook)
    if (!isMeaningfulTransferSpread(spread)) continue
    rows.push({
      id: `transfer-${transfer.id}`,
      date: transfer.date,
      kind: 'transfer',
      label: `${from?.name ?? '—'} → ${to?.name ?? '—'}`,
      detail: `${formatCurrency(transfer.amount, from?.currency ?? settings.baseCurrency)}${
        transfer.toAmount != null
          ? ` → ${formatCurrency(transfer.toAmount, to?.currency ?? settings.baseCurrency)}`
          : ''
      }`,
      commissionBase: -spread,
    })
  }

  for (const expense of expenses) {
    if (!inRange(expense.date, range)) continue
    if (!Number.isFinite(expense.commission) || Math.abs(expense.commission) < 0.005) continue
    const account = byId.get(expense.accountId)
    const accountCurrency = account?.currency ?? settings.baseCurrency
    const commissionBase = convertAmount(
      expense.commission,
      accountCurrency,
      settings.baseCurrency,
      settings,
      expense.date,
      rateBook,
    )
    if (!Number.isFinite(commissionBase) || Math.abs(commissionBase) < 0.005) continue
    rows.push({
      id: `expense-${expense.id}`,
      date: expense.date,
      kind: 'expense',
      label: `Расход · ${account?.name ?? '—'}${expense.note ? ` · ${expense.note}` : ''}`,
      detail: `${formatCurrency(expense.amount, expense.currency)}${
        expense.currency !== accountCurrency
          ? ` → ${formatCurrency(expense.accountAmount, accountCurrency)}`
          : ''
      }`,
      commissionBase,
    })
  }

  rows.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))

  const totalBase = rows.reduce((sum, row) => sum + row.commissionBase, 0)
  const transfersBase = rows
    .filter((row) => row.kind === 'transfer')
    .reduce((sum, row) => sum + row.commissionBase, 0)
  const expensesBase = rows
    .filter((row) => row.kind === 'expense')
    .reduce((sum, row) => sum + row.commissionBase, 0)

  const byMonth = new Map<string, CommissionMonthRow>()
  for (const row of rows) {
    const month = row.date.slice(0, 7)
    const current = byMonth.get(month) ?? { month, commissionBase: 0, rowCount: 0 }
    current.commissionBase += row.commissionBase
    current.rowCount += 1
    byMonth.set(month, current)
  }
  const months = [...byMonth.values()].sort((a, b) => b.month.localeCompare(a.month))

  return { rows, totalBase, transfersBase, expensesBase, months }
}
