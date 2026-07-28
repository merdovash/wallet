import { describe, expect, it } from 'vitest'
import {
  accountGrowth,
  balanceOnDate,
  buildAccountSeries,
  buildTotalSeries,
  netTransfersIn,
  periodGrowth,
  totalOnDate,
} from './growthEngine'
import type { Account, BalanceSnapshot, Transfer, WalletSettings } from '../types/wallet'

const settings: WalletSettings = {
  baseCurrency: 'RUB',
  exchangeRates: { RUB: 1, USD: 100 },
}

function account(partial: Partial<Account> & Pick<Account, 'id' | 'name'>): Account {
  return {
    currency: 'RUB',
    color: '#2563eb',
    archived: false,
    sortOrder: 0,
    kind: 'bank',
    ...partial,
  }
}

describe('growthEngine', () => {
  it('forward-fills balance from last snapshot line', () => {
    const snapshots: BalanceSnapshot[] = [
      { id: 's1', date: '2026-01-01', lines: [{ accountId: 'a', amount: 100 }] },
      { id: 's2', date: '2026-01-10', lines: [{ accountId: 'b', amount: 50 }] },
    ]
    expect(balanceOnDate('a', '2026-01-05', snapshots)).toBe(100)
    expect(balanceOnDate('a', '2026-01-10', snapshots)).toBe(100)
    expect(balanceOnDate('a', '2025-12-31', snapshots)).toBeNull()
  })

  it('computes growth from balance changes without transfers', () => {
    const snapshots: BalanceSnapshot[] = [
      { id: 's1', date: '2026-01-01', lines: [{ accountId: 'a', amount: 1000 }] },
      { id: 's2', date: '2026-02-01', lines: [{ accountId: 'a', amount: 1300 }] },
    ]
    expect(accountGrowth('a', '2026-01-01', '2026-02-01', snapshots, [])).toBe(300)
  })

  it('excludes transfers from account growth', () => {
    const snapshots: BalanceSnapshot[] = [
      {
        id: 's1',
        date: '2026-01-01',
        lines: [
          { accountId: 'a', amount: 1000 },
          { accountId: 'b', amount: 500 },
        ],
      },
      {
        id: 's2',
        date: '2026-01-15',
        lines: [
          { accountId: 'a', amount: 700 },
          { accountId: 'b', amount: 800 },
        ],
      },
    ]
    const transfers: Transfer[] = [
      {
        id: 't1',
        date: '2026-01-10',
        fromAccountId: 'a',
        toAccountId: 'b',
        amount: 300,
      },
    ]

    expect(netTransfersIn('a', '2026-01-01', '2026-01-15', transfers)).toBe(-300)
    expect(netTransfersIn('b', '2026-01-01', '2026-01-15', transfers)).toBe(300)
    expect(accountGrowth('a', '2026-01-01', '2026-01-15', snapshots, transfers)).toBe(0)
    expect(accountGrowth('b', '2026-01-01', '2026-01-15', snapshots, transfers)).toBe(0)
  })

  it('does not change total wallet growth when money is only transferred', () => {
    const accounts = [account({ id: 'a', name: 'A' }), account({ id: 'b', name: 'B' })]
    const snapshots: BalanceSnapshot[] = [
      {
        id: 's1',
        date: '2026-01-01',
        lines: [
          { accountId: 'a', amount: 1000 },
          { accountId: 'b', amount: 500 },
        ],
      },
      {
        id: 's2',
        date: '2026-02-01',
        lines: [
          { accountId: 'a', amount: 400 },
          { accountId: 'b', amount: 1100 },
        ],
      },
    ]
    const transfers: Transfer[] = [
      {
        id: 't1',
        date: '2026-01-20',
        fromAccountId: 'a',
        toAccountId: 'b',
        amount: 600,
      },
    ]

    expect(totalOnDate('2026-01-01', accounts, snapshots, settings)).toBe(1500)
    expect(totalOnDate('2026-02-01', accounts, snapshots, settings)).toBe(1500)
    expect(periodGrowth(accounts, snapshots, settings)).toBe(0)

    const series = buildAccountSeries('a', snapshots, transfers)
    expect(series[0]).toMatchObject({ date: '2026-01-01', balance: 1000, growth: 0 })
    expect(series[1]).toMatchObject({ date: '2026-02-01', balance: 400, growth: 0 })
  })

  it('counts real growth on total and accounts', () => {
    const accounts = [account({ id: 'a', name: 'A' }), account({ id: 'b', name: 'B' })]
    const snapshots: BalanceSnapshot[] = [
      {
        id: 's1',
        date: '2026-01-01',
        lines: [
          { accountId: 'a', amount: 1000 },
          { accountId: 'b', amount: 0 },
        ],
      },
      {
        id: 's2',
        date: '2026-02-01',
        lines: [
          { accountId: 'a', amount: 800 },
          { accountId: 'b', amount: 500 },
        ],
      },
    ]
    const transfers: Transfer[] = [
      {
        id: 't1',
        date: '2026-01-15',
        fromAccountId: 'a',
        toAccountId: 'b',
        amount: 200,
      },
    ]

    const totalSeries = buildTotalSeries(accounts, snapshots, settings)
    expect(totalSeries[1]?.total).toBe(1300)
    expect(totalSeries[1]?.growth).toBe(300)

    expect(accountGrowth('a', '2026-01-01', '2026-02-01', snapshots, transfers)).toBe(0)
    expect(accountGrowth('b', '2026-01-01', '2026-02-01', snapshots, transfers)).toBe(300)
  })

  it('converts foreign currency accounts to base', () => {
    const accounts = [
      account({ id: 'rub', name: 'RUB', currency: 'RUB' }),
      account({ id: 'usd', name: 'USD', currency: 'USD' }),
    ]
    const snapshots: BalanceSnapshot[] = [
      {
        id: 's1',
        date: '2026-01-01',
        lines: [
          { accountId: 'rub', amount: 1000 },
          { accountId: 'usd', amount: 10 },
        ],
      },
    ]
    expect(totalOnDate('2026-01-01', accounts, snapshots, settings)).toBe(2000)
  })

  it('excludes daily income and expense from total growth', () => {
    const accounts = [account({ id: 'a', name: 'A' })]
    const snapshots: BalanceSnapshot[] = [
      {
        id: 's1',
        date: '2026-01-01',
        lines: [{ accountId: 'a', amount: 1000 }],
      },
      {
        id: 's2',
        date: '2026-02-01',
        income: 500,
        expense: 100,
        lines: [{ accountId: 'a', amount: 1500 }],
      },
    ]
    // Balance +500, but net external cashflow = +400 → growth = 100
    const totalSeries = buildTotalSeries(accounts, snapshots, settings)
    expect(totalSeries[1]?.total).toBe(1500)
    expect(totalSeries[1]?.growth).toBe(100)
    expect(periodGrowth(accounts, snapshots, settings)).toBe(100)
  })
})
