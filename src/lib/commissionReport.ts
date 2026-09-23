import { convertAmount, type RateBook } from '../engine/growthEngine'
import type { PeriodRange } from './dashboardPeriod'
import { formatCurrency } from './format'
import {
  isMeaningfulTransferSpread,
  transferReceivedAmount,
  transferReceivedBase,
  transferSentBase,
  transferSpreadBase,
} from './transferAmounts'
import type {
  Account,
  Expense,
  Transfer,
  WalletSettings,
} from '../types/wallet'

/** Строка расшифровки: `expression = result` (слева алгоритм со значениями, справа итог). */
export interface CommissionBreakdownLine {
  label: string
  /** Левая часть формулы с конкретными значениями; пустая — показываем только итог. */
  expression?: string
  /** Правая часть — итоговая сумма (отформатированная). */
  result: string
  /** Итоговая строка формулы (выделяется и красится по знаку комиссии). */
  emphasize?: boolean
}

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
  /** Пошаговая расшифровка комиссии в виде формул. */
  breakdown: CommissionBreakdownLine[]
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

function formatRate(rate: number): string {
  return rate.toLocaleString('ru-RU', { maximumFractionDigits: 4 })
}

/** Курс 1 единицы валюты в базовой на дату (курс ЦБ / fallback). */
function baseRateFor(
  currency: string,
  settings: WalletSettings,
  date: string,
  rateBook?: RateBook,
): number {
  if (currency === settings.baseCurrency) return 1
  return convertAmount(1, currency, settings.baseCurrency, settings, date, rateBook)
}

function transferBreakdown(
  transfer: Transfer,
  from: Account | undefined,
  to: Account | undefined,
  commissionBase: number,
  settings: WalletSettings,
  rateBook?: RateBook,
): CommissionBreakdownLine[] {
  const base = settings.baseCurrency
  const fromCurrency = from?.currency ?? base
  const toCurrency = to?.currency ?? base
  const received = transferReceivedAmount(transfer, from, to, settings, rateBook)
  const sentBase = transferSentBase(transfer, from, settings, rateBook)
  const receivedBase = transferReceivedBase(transfer, from, to, settings, rateBook)
  const fromRate = baseRateFor(fromCurrency, settings, transfer.date, rateBook)
  const toRate = baseRateFor(toCurrency, settings, transfer.date, rateBook)

  const lines: CommissionBreakdownLine[] = []
  lines.push({
    label: `Отправлено в базовой валюте${fromCurrency !== base ? ' (курс ЦБ на дату)' : ''}`,
    expression:
      fromCurrency !== base
        ? `${formatCurrency(transfer.amount, fromCurrency)} × ${formatRate(fromRate)} ${base}/${fromCurrency}`
        : undefined,
    result: formatCurrency(sentBase, base),
  })
  lines.push({
    label: `Получено в базовой валюте${toCurrency !== base ? ' (курс ЦБ на дату)' : ''}`,
    expression:
      toCurrency !== base
        ? `${formatCurrency(received, toCurrency)} × ${formatRate(toRate)} ${base}/${toCurrency}`
        : undefined,
    result: formatCurrency(receivedBase, base),
  })
  lines.push({
    label: 'Комиссия / курсовая разница (отправлено − получено)',
    expression: `${formatCurrency(sentBase, base)} − ${formatCurrency(receivedBase, base)}`,
    result: formatCurrency(commissionBase, base),
    emphasize: true,
  })
  return lines
}

function expenseBreakdown(
  expense: Expense,
  accountCurrency: string,
  commissionBase: number,
  settings: WalletSettings,
  rateBook?: RateBook,
): CommissionBreakdownLine[] {
  const base = settings.baseCurrency
  // Референс зафиксирован при создании расхода: списано − комиссия.
  const referenceAmount = expense.accountAmount - expense.commission
  const referenceRate = expense.amount > 0 ? referenceAmount / expense.amount : 0

  const lines: CommissionBreakdownLine[] = [
    {
      label: 'Расход по курсу обмена на момент операции',
      expression: `${formatCurrency(expense.amount, expense.currency)} × ${formatRate(referenceRate)} ${accountCurrency}/${expense.currency}`,
      result: formatCurrency(referenceAmount, accountCurrency),
    },
    {
      label: 'Комиссия (списано со счёта − расход по курсу)',
      expression: `${formatCurrency(expense.accountAmount, accountCurrency)} − ${formatCurrency(referenceAmount, accountCurrency)}`,
      result: formatCurrency(expense.commission, accountCurrency),
      emphasize: accountCurrency === base,
    },
  ]
  if (accountCurrency !== base) {
    const accountRate = baseRateFor(accountCurrency, settings, expense.date, rateBook)
    lines.push({
      label: 'Комиссия в базовой валюте (курс ЦБ на дату)',
      expression: `${formatCurrency(expense.commission, accountCurrency)} × ${formatRate(accountRate)} ${base}/${accountCurrency}`,
      result: formatCurrency(commissionBase, base),
      emphasize: true,
    })
  }
  return lines
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
      breakdown: transferBreakdown(transfer, from, to, -spread, settings, rateBook),
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
      breakdown: expenseBreakdown(expense, accountCurrency, commissionBase, settings, rateBook),
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
