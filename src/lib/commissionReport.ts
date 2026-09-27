import { convertAmount, type RateBook } from '../engine/growthEngine'
import type { PeriodRange } from './dashboardPeriod'
import { formatCurrency } from './format'
import { convertForExchange } from './manualRates'
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
  FxOverride,
  ManualRate,
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
  /** Счета, участвующие в операции (для фильтра по кошелькам). */
  accountIds: string[]
  /** Комиссия в базовой валюте: положительная — потеря, отрицательная — выгода. */
  commissionBase: number
  /** Объём операции в базовой валюте (отправлено переводом / списано расходом). */
  amountBase: number
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
  /** Суммарный объём операций с комиссией в базовой валюте. */
  amountBase: number
  /** Комиссия в процентах от объёма операций; null, если объём нулевой. */
  commissionPercent: number | null
  months: CommissionMonthRow[]
}

function inRange(date: string, range?: PeriodRange | null): boolean {
  if (!range) return true
  return date >= range.startDate && date <= range.endDate
}

function formatRate(rate: number): string {
  return rate.toLocaleString('ru-RU', { maximumFractionDigits: 4 })
}

function exchangeToBase(
  amount: number,
  currency: string,
  settings: WalletSettings,
  date: string,
  rateBook: RateBook | undefined,
  manualRates: ManualRate[],
  fxOverrides: FxOverride[] | undefined,
): number {
  if (currency === settings.baseCurrency) return amount
  return (
    convertForExchange(
      amount,
      currency,
      settings.baseCurrency,
      manualRates,
      settings,
      date,
      rateBook,
      fxOverrides,
    ) ??
    convertAmount(amount, currency, settings.baseCurrency, settings, date, rateBook)
  )
}

/** Курс 1 единицы валюты в базовой на дату (ручной курс, иначе ЦБ). */
function baseRateFor(
  currency: string,
  settings: WalletSettings,
  date: string,
  rateBook: RateBook | undefined,
  manualRates: ManualRate[],
  fxOverrides: FxOverride[] | undefined,
): number {
  if (currency === settings.baseCurrency) return 1
  return exchangeToBase(1, currency, settings, date, rateBook, manualRates, fxOverrides)
}

/**
 * Сравнение конвертации: сумма по курсу ЦБ, по кастомному (ручному) курсу,
 * фактическая сумма и фактический курс оплаты/обмена.
 */
function conversionComparisonLines(input: {
  date: string
  amount: number
  fromCurrency: string
  toCurrency: string
  /** Фактическая сумма в toCurrency (зачислено / списано). */
  actualAmount: number
  actualLabel: string
  actualRateLabel: string
  cbrLabel: string
  customLabel: string
  manualRates: ManualRate[]
  fxOverrides?: FxOverride[]
  settings: WalletSettings
  rateBook?: RateBook
}): CommissionBreakdownLine[] {
  const lines: CommissionBreakdownLine[] = []
  const { amount, fromCurrency, toCurrency } = input

  const cbrRate = convertAmount(
    1,
    fromCurrency,
    toCurrency,
    input.settings,
    input.date,
    input.rateBook,
  )
  if (Number.isFinite(cbrRate) && cbrRate > 0) {
    lines.push({
      label: input.cbrLabel,
      expression: `${formatCurrency(amount, fromCurrency)} × ${formatRate(cbrRate)} ${toCurrency}/${fromCurrency}`,
      result: formatCurrency(amount * cbrRate, toCurrency),
    })
  }

  const customAmount = convertForExchange(
    amount,
    fromCurrency,
    toCurrency,
    input.manualRates,
    input.settings,
    input.date,
    input.rateBook,
    input.fxOverrides,
  )
  const cbrAmount = Number.isFinite(cbrRate) && cbrRate > 0 ? amount * cbrRate : null
  if (
    customAmount != null &&
    Number.isFinite(customAmount) &&
    (cbrAmount == null || Math.abs(customAmount - cbrAmount) >= 0.005)
  ) {
    const customRate = amount > 0 ? customAmount / amount : 0
    lines.push({
      label: input.customLabel,
      expression: `${formatCurrency(amount, fromCurrency)} × ${formatRate(customRate)} ${toCurrency}/${fromCurrency}`,
      result: formatCurrency(customAmount, toCurrency),
    })
  }

  lines.push({
    label: input.actualLabel,
    result: formatCurrency(input.actualAmount, toCurrency),
  })
  if (amount > 0) {
    lines.push({
      label: input.actualRateLabel,
      expression: `${formatCurrency(input.actualAmount, toCurrency)} ÷ ${formatCurrency(amount, fromCurrency)}`,
      result: `${formatRate(input.actualAmount / amount)} ${toCurrency}/${fromCurrency}`,
    })
  }
  return lines
}

function transferBreakdown(
  transfer: Transfer,
  from: Account | undefined,
  to: Account | undefined,
  commissionBase: number,
  manualRates: ManualRate[],
  settings: WalletSettings,
  rateBook?: RateBook,
  fxOverrides?: FxOverride[],
): CommissionBreakdownLine[] {
  const base = settings.baseCurrency
  const fromCurrency = from?.currency ?? base
  const toCurrency = to?.currency ?? base
  const received = transferReceivedAmount(
    transfer,
    from,
    to,
    settings,
    rateBook,
    manualRates,
    fxOverrides,
  )
  const sentBase = transferSentBase(
    transfer,
    from,
    settings,
    rateBook,
    manualRates,
    fxOverrides,
  )
  const receivedBase = transferReceivedBase(
    transfer,
    from,
    to,
    settings,
    rateBook,
    manualRates,
    fxOverrides,
  )
  const fromRate = baseRateFor(fromCurrency, settings, transfer.date, rateBook, manualRates, fxOverrides)
  const toRate = baseRateFor(toCurrency, settings, transfer.date, rateBook, manualRates, fxOverrides)

  const lines: CommissionBreakdownLine[] = []
  if (fromCurrency !== toCurrency) {
    lines.push(
      ...conversionComparisonLines({
        date: transfer.date,
        amount: transfer.amount,
        fromCurrency,
        toCurrency,
        actualAmount: received,
        cbrLabel: 'Зачисление по курсу ЦБ на дату',
        customLabel: 'Зачисление по ручному курсу',
        actualLabel: 'Фактически зачислено',
        actualRateLabel: 'Фактический курс обмена',
        manualRates,
        fxOverrides,
        settings,
        rateBook,
      }),
    )
  }
  lines.push({
    label: `Отправлено в базовой валюте${fromCurrency !== base ? ' (курс на дату)' : ''}`,
    expression:
      fromCurrency !== base
        ? `${formatCurrency(transfer.amount, fromCurrency)} × ${formatRate(fromRate)} ${base}/${fromCurrency}`
        : undefined,
    result: formatCurrency(sentBase, base),
  })
  lines.push({
    label: `Получено в базовой валюте${toCurrency !== base ? ' (курс на дату)' : ''}`,
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
  manualRates: ManualRate[],
  settings: WalletSettings,
  rateBook?: RateBook,
  fxOverrides?: FxOverride[],
): CommissionBreakdownLine[] {
  const base = settings.baseCurrency
  // Референс зафиксирован при создании расхода: списано − комиссия.
  const referenceAmount = expense.accountAmount - expense.commission
  const referenceRate = expense.amount > 0 ? referenceAmount / expense.amount : 0

  const sameCurrency = expense.currency === accountCurrency
  const lines: CommissionBreakdownLine[] = [
    ...(sameCurrency
      ? [
          {
            label: 'Расход',
            expression: formatCurrency(expense.amount, expense.currency),
            result: formatCurrency(expense.amount, expense.currency),
          },
          {
            label: 'Комиссия',
            expression: formatCurrency(expense.commission, accountCurrency),
            result: formatCurrency(expense.commission, accountCurrency),
            emphasize: accountCurrency === base,
          },
          {
            label: 'Списано со счёта',
            expression: `${formatCurrency(expense.amount, expense.currency)} + ${formatCurrency(expense.commission, accountCurrency)}`,
            result: formatCurrency(expense.accountAmount, accountCurrency),
          },
        ]
      : [
          ...conversionComparisonLines({
            date: expense.date,
            amount: expense.amount,
            fromCurrency: expense.currency,
            toCurrency: accountCurrency,
            actualAmount: expense.accountAmount,
            cbrLabel: 'Расход по курсу ЦБ на дату',
            customLabel: 'Расход по ручному курсу',
            actualLabel: 'Фактически списано со счёта',
            actualRateLabel: 'Фактический курс оплаты',
            manualRates,
            fxOverrides,
            settings,
            rateBook,
          }),
          {
            label: 'Расход по курсу обмена на момент операции (зафиксирован)',
            expression: `${formatCurrency(expense.amount, expense.currency)} × ${formatRate(referenceRate)} ${accountCurrency}/${expense.currency}`,
            result: formatCurrency(referenceAmount, accountCurrency),
          },
          {
            label: 'Комиссия (списано со счёта − расход по курсу)',
            expression: `${formatCurrency(expense.accountAmount, accountCurrency)} − ${formatCurrency(referenceAmount, accountCurrency)}`,
            result: formatCurrency(expense.commission, accountCurrency),
            emphasize: accountCurrency === base,
          },
        ]),
  ]
  if (accountCurrency !== base) {
    const accountRate = baseRateFor(
      accountCurrency,
      settings,
      expense.date,
      rateBook,
      manualRates,
      fxOverrides,
    )
    lines.push({
      label: 'Комиссия в базовой валюте (курс на дату)',
      expression: `${formatCurrency(expense.commission, accountCurrency)} × ${formatRate(accountRate)} ${base}/${accountCurrency}`,
      result: formatCurrency(commissionBase, base),
      emphasize: true,
    })
  }
  return lines
}

/**
 * Отчёт по комиссиям: курсовая разница/комиссия переводов (получено − отправлено
 * по ручному курсу обмена, иначе по ЦБ) и зафиксированные комиссии
 * конвертации по расходам, всё в базовой валюте.
 */
export function buildCommissionReport(
  accounts: Account[],
  transfers: Transfer[],
  expenses: Expense[],
  manualRates: ManualRate[],
  settings: WalletSettings,
  rateBook?: RateBook,
  range?: PeriodRange | null,
  fxOverrides?: FxOverride[],
): CommissionReport {
  const byId = new Map(accounts.map((a) => [a.id, a]))
  const rows: CommissionRow[] = []

  for (const transfer of transfers) {
    if (!inRange(transfer.date, range)) continue
    const from = byId.get(transfer.fromAccountId)
    const to = byId.get(transfer.toAccountId)
    const spread = transferSpreadBase(
      transfer,
      from,
      to,
      settings,
      rateBook,
      manualRates,
      fxOverrides,
    )
    if (!isMeaningfulTransferSpread(spread)) continue
    const commissionAccount = transfer.commissionAccountId
      ? byId.get(transfer.commissionAccountId)
      : undefined
    const breakdown = transferBreakdown(
      transfer,
      from,
      to,
      -spread,
      manualRates,
      settings,
      rateBook,
      fxOverrides,
    )
    if (commissionAccount) {
      breakdown.push({
        label: 'Комиссия относится к кошельку',
        result: commissionAccount.name,
      })
    }
    rows.push({
      id: `transfer-${transfer.id}`,
      date: transfer.date,
      kind: 'transfer',
      // Указанный кошелёк комиссии перекрывает оба счёта перевода.
      accountIds: transfer.commissionAccountId
        ? [transfer.commissionAccountId]
        : [transfer.fromAccountId, transfer.toAccountId].filter(Boolean),
      label: `${from?.name ?? '—'} → ${to?.name ?? '—'}`,
      detail: `${formatCurrency(transfer.amount, from?.currency ?? settings.baseCurrency)}${
        transfer.toAmount != null
          ? ` → ${formatCurrency(transfer.toAmount, to?.currency ?? settings.baseCurrency)}`
          : ''
      }`,
      commissionBase: -spread,
      amountBase: transferSentBase(
        transfer,
        from,
        settings,
        rateBook,
        manualRates,
        fxOverrides,
      ),
      breakdown,
    })
  }

  for (const expense of expenses) {
    if (!inRange(expense.date, range)) continue
    if (!Number.isFinite(expense.commission) || Math.abs(expense.commission) < 0.005) continue
    const account = byId.get(expense.accountId)
    const accountCurrency = account?.currency ?? settings.baseCurrency
    const commissionBase = exchangeToBase(
      expense.commission,
      accountCurrency,
      settings,
      expense.date,
      rateBook,
      manualRates,
      fxOverrides,
    )
    if (!Number.isFinite(commissionBase) || Math.abs(commissionBase) < 0.005) continue
    rows.push({
      id: `expense-${expense.id}`,
      date: expense.date,
      kind: 'expense',
      accountIds: [expense.accountId],
      label: `Расход · ${account?.name ?? '—'}${expense.note ? ` · ${expense.note}` : ''}`,
      detail: `${formatCurrency(expense.amount, expense.currency)}${
        expense.currency !== accountCurrency
          ? ` → ${formatCurrency(expense.accountAmount, accountCurrency)}`
          : ''
      }`,
      commissionBase,
      amountBase: exchangeToBase(
        expense.accountAmount,
        accountCurrency,
        settings,
        expense.date,
        rateBook,
        manualRates,
        fxOverrides,
      ),
      breakdown: expenseBreakdown(
        expense,
        accountCurrency,
        commissionBase,
        manualRates,
        settings,
        rateBook,
        fxOverrides,
      ),
    })
  }

  rows.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))

  return summarizeCommissionRows(rows)
}

/** Итоги и помесячная сводка по набору строк (для пересчёта после фильтра по кошелькам). */
export function summarizeCommissionRows(rows: CommissionRow[]): CommissionReport {
  const totalBase = rows.reduce((sum, row) => sum + row.commissionBase, 0)
  const transfersBase = rows
    .filter((row) => row.kind === 'transfer')
    .reduce((sum, row) => sum + row.commissionBase, 0)
  const expensesBase = rows
    .filter((row) => row.kind === 'expense')
    .reduce((sum, row) => sum + row.commissionBase, 0)
  const amountBase = rows.reduce(
    (sum, row) => sum + (Number.isFinite(row.amountBase) ? row.amountBase : 0),
    0,
  )
  const commissionPercent = amountBase > 0 ? (totalBase / amountBase) * 100 : null

  const byMonth = new Map<string, CommissionMonthRow>()
  for (const row of rows) {
    const month = row.date.slice(0, 7)
    const current = byMonth.get(month) ?? { month, commissionBase: 0, rowCount: 0 }
    current.commissionBase += row.commissionBase
    current.rowCount += 1
    byMonth.set(month, current)
  }
  const months = [...byMonth.values()].sort((a, b) => b.month.localeCompare(a.month))

  return { rows, totalBase, transfersBase, expensesBase, amountBase, commissionPercent, months }
}

/** Сумма комиссии по каждому счёту (перевод учитывается в обоих его счетах). */
export function commissionByAccount(rows: CommissionRow[]): Map<string, number> {
  const totals = new Map<string, number>()
  for (const row of rows) {
    for (const accountId of new Set(row.accountIds)) {
      totals.set(accountId, (totals.get(accountId) ?? 0) + row.commissionBase)
    }
  }
  return totals
}
