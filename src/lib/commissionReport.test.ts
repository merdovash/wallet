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
