import { describe, expect, it } from 'vitest'
import {
  buildCreditBuckets,
  buildCreditFloatSummary,
  creditDebt,
  graceDueDate,
} from './creditFloatEngine'
import { totalOnDate } from './growthEngine'
import type { Account, BalanceSnapshot, Transfer, WalletSettings } from '../types/wallet'

const settings: WalletSettings = {
  baseCurrency: 'RUB',
  exchangeRates: { RUB: 1 },
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

describe('creditFloatEngine', () => {
  it('computes debt from available remainder', () => {
    expect(creditDebt(300_000, 200_000)).toBe(100_000)
    expect(creditDebt(300_000, 300_000)).toBe(0)
    expect(creditDebt(300_000, 350_000)).toBe(0)
  })

  it('grace due date is end of month N+graceMonths', () => {
    expect(graceDueDate('2026-03')).toBe('2026-06-30')
    expect(graceDueDate('2026-03', 3)).toBe('2026-06-30')
    expect(graceDueDate('2026-03', 2)).toBe('2026-05-31')
    expect(graceDueDate('2026-03', 4)).toBe('2026-07-31')
    expect(graceDueDate('2025-11')).toBe('2026-02-28')
    expect(graceDueDate('2024-11')).toBe('2025-02-28')
  })

  it('builds spend buckets and applies repayments FIFO', () => {
    const credit = account({
      id: 'cc',
      name: 'Card',
      kind: 'credit',
      creditLimit: 300,
      linkedAccountId: 'float',
    })
    const float = account({ id: 'float', name: 'Float' })
    const accounts = [credit, float]
    const snapshots: BalanceSnapshot[] = [
      {
        id: 's1',
        date: '2026-03-31',
        lines: [
          { accountId: 'cc', amount: 200 },
          { accountId: 'float', amount: 100 },
        ],
      },
      {
        id: 's2',
        date: '2026-04-30',
        lines: [
          { accountId: 'cc', amount: 150 },
          { accountId: 'float', amount: 150 },
        ],
      },
      {
        id: 's3',
        date: '2026-05-15',
        lines: [
          { accountId: 'cc', amount: 220 },
          { accountId: 'float', amount: 80 },
        ],
      },
    ]
    const transfers: Transfer[] = [
      {
        id: 't1',
        date: '2026-05-10',
        fromAccountId: 'float',
        toAccountId: 'cc',
        amount: 70,
      },
    ]

    const buckets = buildCreditBuckets(credit, snapshots, transfers, accounts, '2026-05-15', settings)
    expect(buckets.find((b) => b.month === '2026-03')).toMatchObject({
      spent: 100,
      dueDate: '2026-06-30',
    })
    expect(buckets.find((b) => b.month === '2026-04')).toMatchObject({
      spent: 50,
      dueDate: '2026-07-31',
    })
    // FIFO: 70 goes to March first
    expect(buckets.find((b) => b.month === '2026-03')?.repaid).toBe(70)
    expect(buckets.find((b) => b.month === '2026-03')?.remaining).toBe(30)
    expect(buckets.find((b) => b.month === '2026-04')?.repaid).toBe(0)
    expect(buckets.find((b) => b.month === '2026-04')?.remaining).toBe(50)
  })

  it('attributes earned from avg debt share of linked growth (Dietz-weighted)', () => {
    const credit = account({
      id: 'cc',
      name: 'Card',
      kind: 'credit',
      creditLimit: 300,
      linkedAccountId: 'float',
    })
    const float = account({ id: 'float', name: 'Float' })
    const cash = account({ id: 'cash', name: 'Cash' })
    const accounts = [credit, float, cash]
    const snapshots: BalanceSnapshot[] = [
      {
        id: 's1',
        date: '2026-03-01',
        lines: [
          { accountId: 'cc', amount: 200 }, // debt 100
          { accountId: 'float', amount: 1000 },
          { accountId: 'cash', amount: 500 },
        ],
      },
      {
        id: 's2',
        date: '2026-03-31',
        lines: [
          { accountId: 'cc', amount: 200 },
          { accountId: 'float', amount: 1030 },
          { accountId: 'cash', amount: 500 },
        ],
      },
    ]

    const summary = buildCreditFloatSummary(
      credit,
      snapshots,
      [],
      accounts,
      settings,
      '2026-03-31',
    )
    const march = summary.months.find((m) => m.month === '2026-03')
    // growth 30, W=1000, avgDebt=100 → share 0.1 → earned 3
    expect(march?.linkedGrowth).toBeCloseTo(30, 8)
    expect(march?.floatSharePct).toBeCloseTo(0.1, 8)
    expect(march?.earned).toBeCloseTo(3, 8)
    expect(summary.cumulativeEarned).toBeCloseTo(3, 8)
  })

  it('uses repayment amount when it exceeds average debt', () => {
    const credit = account({
      id: 'cc',
      name: 'Card',
      kind: 'credit',
      creditLimit: 300,
      linkedAccountId: 'float',
    })
    const float = account({ id: 'float', name: 'Float' })
    const accounts = [credit, float]
    const snapshots: BalanceSnapshot[] = [
      {
        id: 's1',
        date: '2026-03-01',
        lines: [
          { accountId: 'cc', amount: 200 },
          { accountId: 'float', amount: 1000 },
        ],
      },
      {
        id: 's2',
        date: '2026-03-31',
        lines: [
          { accountId: 'cc', amount: 250 },
          { accountId: 'float', amount: 530 },
        ],
      },
    ]
    const transfers: Transfer[] = [
      {
        id: 't1',
        date: '2026-03-16',
        fromAccountId: 'float',
        toAccountId: 'cc',
        amount: 500,
      },
    ]

    const summary = buildCreditFloatSummary(
      credit,
      snapshots,
      transfers,
      accounts,
      settings,
      '2026-03-31',
    )
    const march = summary.months.find((m) => m.month === '2026-03')
    // growth 30, flow −500 day 15/30 → W=750; principal=max(avgDebt, 500)=500
    // earned = 30 × (500/750) = 20
    expect(march?.earned).toBeCloseTo(20, 8)
  })

  it('earns nothing when there is no credit debt and no linked repayments', () => {
    const credit = account({
      id: 'cc',
      name: 'Card',
      kind: 'credit',
      creditLimit: 300,
      linkedAccountId: 'float',
    })
    const float = account({ id: 'float', name: 'Float' })
    const accounts = [credit, float]
    const snapshots: BalanceSnapshot[] = [
      {
        id: 's1',
        date: '2026-03-01',
        lines: [
          { accountId: 'cc', amount: 300 }, // no debt
          { accountId: 'float', amount: 1000 },
        ],
      },
      {
        id: 's2',
        date: '2026-03-31',
        lines: [
          { accountId: 'cc', amount: 300 },
          { accountId: 'float', amount: 1030 },
        ],
      },
    ]
    const summary = buildCreditFloatSummary(
      credit,
      snapshots,
      [],
      accounts,
      settings,
      '2026-03-31',
    )
    expect(summary.months.find((m) => m.month === '2026-03')?.earned).toBe(0)
    expect(summary.cumulativeEarned).toBe(0)
  })

  it('does not count available credit as asset in total', () => {
    const accounts = [
      account({ id: 'cash', name: 'Cash' }),
      account({
        id: 'cc',
        name: 'Card',
        kind: 'credit',
        creditLimit: 300,
        linkedAccountId: 'cash',
      }),
    ]
    const snapshots: BalanceSnapshot[] = [
      {
        id: 's1',
        date: '2026-03-01',
        lines: [
          { accountId: 'cash', amount: 1000 },
          { accountId: 'cc', amount: 200 },
        ],
      },
    ]
    // cash 1000 + (−debt 100) = 900, not 1200
    expect(totalOnDate('2026-03-01', accounts, snapshots, settings)).toBe(900)
  })

  it('marks overdue grace buckets', () => {
    const credit = account({
      id: 'cc',
      name: 'Card',
      kind: 'credit',
      creditLimit: 300,
      graceMonths: 3,
    })
    const snapshots: BalanceSnapshot[] = [
      {
        id: 's1',
        date: '2026-03-31',
        lines: [{ accountId: 'cc', amount: 200 }],
      },
    ]
    const buckets = buildCreditBuckets(credit, snapshots, [], [credit], '2026-07-01', settings)
    expect(buckets[0]).toMatchObject({
      month: '2026-03',
      remaining: 100,
      dueDate: '2026-06-30',
      overdue: true,
    })
  })

  it('uses per-card grace months for due dates', () => {
    const credit = account({
      id: 'cc',
      name: 'Card',
      kind: 'credit',
      creditLimit: 300,
      graceMonths: 2,
    })
    const snapshots: BalanceSnapshot[] = [
      {
        id: 's1',
        date: '2026-03-31',
        lines: [{ accountId: 'cc', amount: 200 }],
      },
    ]
    const buckets = buildCreditBuckets(credit, snapshots, [], [credit], '2026-05-15', settings)
    expect(buckets[0]).toMatchObject({
      month: '2026-03',
      dueDate: '2026-05-31',
      overdue: false,
    })
  })
})
