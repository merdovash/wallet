import { describe, expect, it } from 'vitest'
import {
  annualizeMonthlyReturn,
  annualizePeriodReturn,
  buildMonthlyReturns,
  buildPeriodReturn,
} from './monthlyReturns'
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
    kind: 'fund',
    ...partial,
  }
}

describe('monthlyReturns', () => {
  it('annualizes monthly and period returns', () => {
    expect(annualizeMonthlyReturn(0.01)).toBeCloseTo((1.01) ** 12 - 1, 8)
    expect(annualizePeriodReturn(0.1, 365)).toBeCloseTo(0.1, 8)
  })

  it('builds monthly growth percent excluding boundary transfers', () => {
    const accounts = [
      account({ id: 'op', name: 'Op', kind: 'operational' }),
      account({ id: 'a', name: 'A' }),
    ]
    const snapshots: BalanceSnapshot[] = [
      {
        id: 's1',
        date: '2026-01-01',
        lines: [
          { accountId: 'op', amount: 5_000 },
          { accountId: 'a', amount: 100_000 },
        ],
      },
      {
        id: 's2',
        date: '2026-01-31',
        lines: [
          { accountId: 'op', amount: 5_000 },
          { accountId: 'a', amount: 101_000 },
        ],
      },
      {
        id: 's3',
        date: '2026-02-28',
        income: 5_000,
        lines: [
          { accountId: 'op', amount: 0 },
          { accountId: 'a', amount: 107_020 },
        ],
      },
    ]
    const transfers: Transfer[] = [
      {
        id: 't1',
        date: '2026-02-28',
        fromAccountId: 'op',
        toAccountId: 'a',
        amount: 5_000,
      },
    ]

    const rows = buildMonthlyReturns(accounts, snapshots, settings, undefined, transfers)
    expect(rows).toHaveLength(2)

    // Jan: 1000 / 100000 = 1%
    expect(rows[0]?.yearMonth).toBe('2026-01')
    expect(rows[0]?.growthPct).toBeCloseTo(0.01, 8)
    expect(rows[0]?.annualizedPct).toBeCloseTo(annualizeMonthlyReturn(0.01), 8)

    // Feb: end 107020 - start 101000 - transfer 5000 = 1020; income ignored
    // Flow on last day → weight 0 → denom = 101000
    expect(rows[1]?.yearMonth).toBe('2026-02')
    expect(rows[1]?.growth).toBeCloseTo(1020, 4)
    expect(rows[1]?.netFlow).toBe(5_000)
    expect(rows[1]?.growthPct).toBeCloseTo(1020 / 101_000, 8)
  })

  it('time-weights mid-period transfer in Modified Dietz percent', () => {
    const accounts = [
      account({ id: 'op', name: 'Op', kind: 'operational' }),
      account({ id: 'a', name: 'A' }),
    ]
    const snapshots: BalanceSnapshot[] = [
      {
        id: 's1',
        date: '2026-01-01',
        lines: [
          { accountId: 'op', amount: 50_000 },
          { accountId: 'a', amount: 100_000 },
        ],
      },
      {
        id: 's2',
        date: '2026-01-16',
        income: 50_000,
        lines: [
          { accountId: 'op', amount: 0 },
          { accountId: 'a', amount: 150_000 },
        ],
      },
      {
        id: 's3',
        date: '2026-01-31',
        lines: [
          { accountId: 'op', amount: 0 },
          { accountId: 'a', amount: 151_000 },
        ],
      },
    ]
    const transfers: Transfer[] = [
      {
        id: 't1',
        date: '2026-01-16',
        fromAccountId: 'op',
        toAccountId: 'a',
        amount: 50_000,
      },
    ]

    const summary = buildPeriodReturn(accounts, snapshots, settings, undefined, transfers)
    // growth = 151000 - 100000 - 50000 = 1000; income field ignored
    // days=30, flow day 15, w=15/30=0.5 → denom = 100000 + 25000 = 125000
    expect(summary?.growth).toBeCloseTo(1000, 4)
    expect(summary?.netFlow).toBe(50_000)
    expect(summary?.weightedCapital).toBeCloseTo(125_000, 4)
    expect(summary?.growthPct).toBeCloseTo(1000 / 125_000, 8)
  })

  it('treats transfer into deposit as capital from that date only', () => {
    const accounts = [
      account({ id: 'op', name: 'Op', kind: 'operational' }),
      account({ id: 'dep', name: 'Deposit', kind: 'deposit' }),
    ]
    const snapshots: BalanceSnapshot[] = [
      {
        id: 's1',
        date: '2026-01-01',
        lines: [
          { accountId: 'op', amount: 50_000 },
          { accountId: 'dep', amount: 100_000 },
        ],
      },
      {
        id: 's2',
        date: '2026-01-16',
        lines: [
          { accountId: 'op', amount: 0 },
          { accountId: 'dep', amount: 150_000 },
        ],
      },
      {
        id: 's3',
        date: '2026-01-31',
        lines: [
          { accountId: 'op', amount: 0 },
          { accountId: 'dep', amount: 151_000 },
        ],
      },
    ]
    const transfers: Transfer[] = [
      {
        id: 't1',
        date: '2026-01-16',
        fromAccountId: 'op',
        toAccountId: 'dep',
        amount: 50_000,
      },
    ]

    const summary = buildPeriodReturn(accounts, snapshots, settings, undefined, transfers)
    expect(summary?.startTotal).toBe(100_000)
    expect(summary?.endTotal).toBe(151_000)
    expect(summary?.netFlow).toBe(50_000)
    expect(summary?.growth).toBeCloseTo(1000, 4)
    expect(summary?.growthPct).toBeCloseTo(1000 / 125_000, 8)
  })

  it('summarizes overall period return', () => {
    const accounts = [account({ id: 'a', name: 'A' })]
    const snapshots: BalanceSnapshot[] = [
      { id: 's1', date: '2026-01-01', lines: [{ accountId: 'a', amount: 100 }] },
      { id: 's2', date: '2026-01-31', lines: [{ accountId: 'a', amount: 110 }] },
    ]
    const summary = buildPeriodReturn(accounts, snapshots, settings)
    expect(summary?.growthPct).toBeCloseTo(0.1, 8)
    expect(summary?.days).toBe(30)
    expect(summary?.netFlow).toBe(0)
    expect(summary?.accountCount).toBe(1)
    expect(summary?.includedAccounts).toHaveLength(1)
    expect(summary?.includedAccounts[0]?.growthBase).toBeCloseTo(10, 4)
    expect(summary?.excludedAccounts).toHaveLength(0)
    expect(summary?.annualizedPct).toBeCloseTo(annualizePeriodReturn(0.1, 30), 8)
  })

  it('attributes +6 account growth after withdrawal of 16 (100→105→90)', () => {
    const accounts = [
      account({ id: 'a', name: 'Fund' }),
      account({ id: 'op', name: 'Op', kind: 'operational' }),
    ]
    const snapshots: BalanceSnapshot[] = [
      {
        id: 's1',
        date: '2026-01-01',
        lines: [
          { accountId: 'a', amount: 100 },
          { accountId: 'op', amount: 0 },
        ],
      },
      { id: 's2', date: '2026-01-02', lines: [{ accountId: 'a', amount: 105 }] },
      {
        id: 's3',
        date: '2026-01-03',
        lines: [
          { accountId: 'a', amount: 90 },
          { accountId: 'op', amount: 16 },
        ],
      },
    ]
    const transfers: Transfer[] = [
      {
        id: 't1',
        date: '2026-01-03',
        fromAccountId: 'a',
        toAccountId: 'op',
        amount: 16,
      },
    ]
    const summary = buildPeriodReturn(accounts, snapshots, settings, undefined, transfers)
    expect(summary?.growth).toBe(6)
    expect(summary?.includedAccounts[0]?.growthBase).toBe(6)
    expect(summary?.includedAccounts[0]?.transfersBase).toBe(-16)
    expect(summary?.includedAccounts[0]?.balanceChangeBase).toBe(-10)
    expect(summary?.transferMovements).toHaveLength(1)
    expect(summary?.transferMovements[0]).toMatchObject({
      fromName: 'Fund',
      toName: 'Op',
      amountBase: 16,
      crossesGrowthBoundary: true,
    })
  })
})
