import { describe, expect, it } from 'vitest'
import type { Account, Expense, ManualRate, Transfer, WalletSettings } from '../types/wallet'
import {
  buildCommissionReport,
  commissionByAccount,
  summarizeCommissionRows,
} from './commissionReport'

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
    const report = buildCommissionReport(accounts, transfers, expenses, [], settings)
    expect(report.rows).toHaveLength(2)
    expect(report.transfersBase).toBeCloseTo(500)
    expect(report.expensesBase).toBeCloseTo(50)
    expect(report.totalBase).toBeCloseTo(550)
    // Newest first.
    expect(report.rows[0]!.id).toBe('expense-e1')
    expect(report.rows[1]!.id).toBe('transfer-t1')
  })

  it('groups by month', () => {
    const report = buildCommissionReport(accounts, transfers, expenses, [], settings)
    expect(report.months).toEqual([
      { month: '2026-04', commissionBase: 50, rowCount: 1 },
      { month: '2026-03', commissionBase: 500, rowCount: 1 },
    ])
  })

  it('filters by period range', () => {
    const report = buildCommissionReport(accounts, transfers, expenses, [], settings, undefined, {
      startDate: '2026-04-01',
      endDate: '2026-04-30',
    })
    expect(report.rows).toHaveLength(1)
    expect(report.totalBase).toBeCloseTo(50)
  })

  it('builds a transfer breakdown: CBR, custom and actual amounts plus the actual rate', () => {
    const manualRates: ManualRate[] = [{ fromCurrency: 'USD', toCurrency: 'RUB', rate: 87 }]
    const report = buildCommissionReport(accounts, transfers, [], manualRates, settings)
    const row = report.rows.find((r) => r.id === 'transfer-t1')!
    expect(row.breakdown).toHaveLength(7)
    // По курсу ЦБ: 100 USD × 90 = 9 000 ₽.
    expect(row.breakdown[0]!.expression).toContain('× 90')
    expect(row.breakdown[0]!.result).toContain('9')
    // По кастомному курсу: 100 USD × 87 = 8 700 ₽.
    expect(row.breakdown[1]!.expression).toContain('× 87')
    expect(row.breakdown[1]!.result).toContain('700')
    // Фактически зачислено 8 500 ₽; фактический курс 8 500 ÷ 100 = 85 RUB/USD.
    expect(row.breakdown[2]!.expression).toBeUndefined()
    expect(row.breakdown[2]!.result).toContain('500')
    expect(row.breakdown[3]!.expression).toContain('÷')
    expect(row.breakdown[3]!.result).toContain('85')
    // Итог: 9 000 − 8 500 = 500, выделен.
    expect(row.breakdown[6]!.emphasize).toBe(true)
    expect(row.breakdown[6]!.expression).toContain('−')
    expect(row.breakdown[6]!.result).toContain('500')
  })

  it('omits the custom-rate line when the pair has no manual rate', () => {
    const report = buildCommissionReport(accounts, transfers, [], [], settings)
    const row = report.rows.find((r) => r.id === 'transfer-t1')!
    expect(row.breakdown).toHaveLength(6)
    expect(
      row.breakdown.some((line) => line.label.includes('кастомному')),
    ).toBe(false)
  })

  it('builds an expense breakdown: CBR, custom, actual, actual rate and frozen reference', () => {
    const manualRates: ManualRate[] = [{ fromCurrency: 'USD', toCurrency: 'RUB', rate: 100 }]
    const report = buildCommissionReport(accounts, [], expenses, manualRates, settings)
    const row = report.rows.find((r) => r.id === 'expense-e1')!
    expect(row.breakdown).toHaveLength(6)
    // По курсу ЦБ: 10 USD × 90 = 900 ₽.
    expect(row.breakdown[0]!.expression).toContain('× 90')
    expect(row.breakdown[0]!.result).toContain('900')
    // По кастомному курсу: 10 USD × 100 = 1 000 ₽.
    expect(row.breakdown[1]!.expression).toContain('× 100')
    // Фактически списано 950 ₽; фактический курс 950 ÷ 10 = 95 RUB/USD.
    expect(row.breakdown[2]!.result).toContain('950')
    expect(row.breakdown[3]!.expression).toContain('÷')
    expect(row.breakdown[3]!.result).toContain('95')
    // Референс на момент операции: 950 − 50 = 900 ₽ за 10 USD → курс 90.
    expect(row.breakdown[4]!.expression).toContain('× 90')
    expect(row.breakdown[4]!.result).toContain('900')
    // Комиссия: 950 − 900 = 50 ₽, выделена (валюта счёта — базовая).
    expect(row.breakdown[5]!.expression).toContain('−')
    expect(row.breakdown[5]!.result).toContain('50')
    expect(row.breakdown[5]!.emphasize).toBe(true)
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
    const report = buildCommissionReport(accounts, [], [usdExpenseRow], [], settings)
    const row = report.rows[0]!
    const last = row.breakdown[row.breakdown.length - 1]!
    expect(last.expression).toContain('× 90')
    expect(last.emphasize).toBe(true)
  })

  it('attributes the commission to the specified wallet only', () => {
    const attributed: Transfer[] = [{ ...transfers[0]!, commissionAccountId: 'rub' }]
    const report = buildCommissionReport(accounts, attributed, [], [], settings)
    const row = report.rows[0]!
    expect(row.accountIds).toEqual(['rub'])
    const last = row.breakdown[row.breakdown.length - 1]!
    expect(last.label).toContain('относится к кошельку')
    expect(last.result).toBe('Карта')
    const totals = commissionByAccount(report.rows)
    expect(totals.get('rub')).toBeCloseTo(500)
    expect(totals.has('usd')).toBe(false)
  })

  it('tags rows with the accounts involved', () => {
    const report = buildCommissionReport(accounts, transfers, expenses, [], settings)
    const transferRow = report.rows.find((r) => r.id === 'transfer-t1')!
    const expenseRow = report.rows.find((r) => r.id === 'expense-e1')!
    expect(transferRow.accountIds).toEqual(['usd', 'rub'])
    expect(expenseRow.accountIds).toEqual(['rub'])
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
    const report = buildCommissionReport(accounts, [], [usdExpense], [], settings)
    expect(report.totalBase).toBeCloseTo(90)
  })
})

describe('commissionByAccount', () => {
  it('sums the commission per account, counting a transfer in both its accounts', () => {
    const report = buildCommissionReport(accounts, transfers, expenses, [], settings)
    const totals = commissionByAccount(report.rows)
    // usd: только перевод (500); rub: перевод (500) + расход (50).
    expect(totals.get('usd')).toBeCloseTo(500)
    expect(totals.get('rub')).toBeCloseTo(550)
    expect(totals.size).toBe(2)
  })
})

describe('summarizeCommissionRows', () => {
  it('recomputes totals and months for a filtered subset', () => {
    const report = buildCommissionReport(accounts, transfers, expenses, [], settings)
    const onlyUsd = summarizeCommissionRows(
      report.rows.filter((row) => row.accountIds.includes('usd')),
    )
    expect(onlyUsd.rows).toHaveLength(1)
    expect(onlyUsd.totalBase).toBeCloseTo(500)
    expect(onlyUsd.transfersBase).toBeCloseTo(500)
    expect(onlyUsd.expensesBase).toBe(0)
    expect(onlyUsd.months).toEqual([{ month: '2026-03', commissionBase: 500, rowCount: 1 }])
  })
})
