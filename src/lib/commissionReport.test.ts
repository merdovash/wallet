import { describe, expect, it } from 'vitest'
import type { Account, Expense, Transfer, WalletSettings } from '../types/wallet'
import { buildCommissionReport } from './commissionReport'

const settings: WalletSettings = {
  baseCurrency: 'RUB',
  exchangeRates: { RUB: 1, USD: 90 },
}

function account(partial: Partial<Account> & Pick<Account, 'id' | 'name'>): Account {
  return {
    currency: 'RUB',
    color: '#2563eb',
    archived: false,
    sortOrder: 0,
    kind: 'operational',
    ...partial,
  }
}

const accounts = [
  account({ id: 'rub', name: 'Карта' }),
  account({ id: 'usd', name: 'Валютный', currency: 'USD' }),
]

const transfers: Transfer[] = [
  // 100 USD (9000 ₽ official) → 8 500 ₽ received: commission 500 ₽.
  {
    id: 't1',
    date: '2026-03-05',
    fromAccountId: 'usd',
    toAccountId: 'rub',
    amount: 100,
    toAmount: 8500,
  },
  // Same currency, no spread — excluded.
  { id: 't2', date: '2026-03-06', fromAccountId: 'rub', toAccountId: 'usd', amount: 9000, toAmount: 100 },
]

const expenses: Expense[] = [
  {
    id: 'e1',
    date: '2026-04-01',
    accountId: 'rub',
    currency: 'USD',
    amount: 10,
    accountAmount: 950,
    commission: 50,
  },
  // No commission — excluded.
  {
    id: 'e2',
    date: '2026-04-02',
    accountId: 'rub',
    currency: 'RUB',
    amount: 100,
    accountAmount: 100,
    commission: 0,
  },
]

describe('buildCommissionReport', () => {
  it('collects transfer spreads and expense commissions in base currency', () => {
    const report = buildCommissionReport(accounts, transfers, expenses, settings)
    expect(report.rows).toHaveLength(2)
    expect(report.transfersBase).toBeCloseTo(500)
    expect(report.expensesBase).toBeCloseTo(50)
    expect(report.totalBase).toBeCloseTo(550)
    // Newest first.
    expect(report.rows[0]!.id).toBe('expense-e1')
    expect(report.rows[1]!.id).toBe('transfer-t1')
  })

  it('groups by month', () => {
    const report = buildCommissionReport(accounts, transfers, expenses, settings)
    expect(report.months).toEqual([
      { month: '2026-04', commissionBase: 50, rowCount: 1 },
      { month: '2026-03', commissionBase: 500, rowCount: 1 },
    ])
  })

  it('filters by period range', () => {
    const report = buildCommissionReport(accounts, transfers, expenses, settings, undefined, {
      startDate: '2026-04-01',
      endDate: '2026-04-30',
    })
    expect(report.rows).toHaveLength(1)
    expect(report.totalBase).toBeCloseTo(50)
  })

  it('builds a formula breakdown for a transfer: sent, received, difference', () => {
    const report = buildCommissionReport(accounts, transfers, [], settings)
    const row = report.rows.find((r) => r.id === 'transfer-t1')!
    expect(row.breakdown).toHaveLength(3)
    // Отправлено: 100 USD × 90 RUB/USD = 9 000 ₽.
    expect(row.breakdown[0]!.expression).toContain('× 90')
    expect(row.breakdown[0]!.result).toContain('9')
    // Получено в базовой — без умножения (валюта уже базовая).
    expect(row.breakdown[1]!.expression).toBeUndefined()
    // Итог: 9 000 − 8 500 = 500, выделен.
    expect(row.breakdown[2]!.emphasize).toBe(true)
    expect(row.breakdown[2]!.expression).toContain('−')
    expect(row.breakdown[2]!.result).toContain('500')
  })

  it('builds a formula breakdown for an expense from the frozen reference rate', () => {
    const report = buildCommissionReport(accounts, [], expenses, settings)
    const row = report.rows.find((r) => r.id === 'expense-e1')!
    expect(row.breakdown).toHaveLength(2)
    // Референс: 950 − 50 = 900 ₽ за 10 USD → курс 90.
    expect(row.breakdown[0]!.expression).toContain('× 90')
    expect(row.breakdown[0]!.result).toContain('900')
    // Комиссия: 950 − 900 = 50 ₽, выделена (валюта счёта — базовая).
    expect(row.breakdown[1]!.expression).toContain('−')
    expect(row.breakdown[1]!.result).toContain('50')
    expect(row.breakdown[1]!.emphasize).toBe(true)
  })

  it('adds a base-conversion step for an expense on a foreign-currency account', () => {
    const usdExpenseRow: Expense = {
      id: 'e4',
      date: '2026-04-03',
      accountId: 'usd',
      currency: 'THB',
      amount: 320,
      accountAmount: 11,
      commission: 1,
    }
    const report = buildCommissionReport(accounts, [], [usdExpenseRow], settings)
    const row = report.rows[0]!
    expect(row.breakdown).toHaveLength(3)
    expect(row.breakdown[2]!.expression).toContain('× 90')
    expect(row.breakdown[2]!.emphasize).toBe(true)
  })

  it('converts expense commission from the account currency to base', () => {
    const usdExpense: Expense = {
      id: 'e3',
      date: '2026-04-03',
      accountId: 'usd',
      currency: 'THB',
      amount: 320,
      accountAmount: 11,
      commission: 1,
    }
    const report = buildCommissionReport(accounts, [], [usdExpense], settings)
    expect(report.totalBase).toBeCloseTo(90)
  })
})
