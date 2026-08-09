import { describe, expect, it } from 'vitest'
import {
  accountGrowth,
  balanceOnDate,
  buildAccountSeries,
  buildDailyGrowthSeries,
  buildTotalSeries,
  growthCapitalFlows,
  modifiedDietzReturn,
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
    kind: 'fund',
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

  it('ignores check-in income and expense for portfolio growth', () => {
    const accounts = [
      account({ id: 'op', name: 'Op', kind: 'operational' }),
      account({ id: 'f', name: 'Fund', kind: 'fund' }),
    ]
    const snapshots: BalanceSnapshot[] = [
      {
        id: 's1',
        date: '2026-01-01',
        lines: [
          { accountId: 'op', amount: 0 },
          { accountId: 'f', amount: 1000 },
        ],
      },
      {
        id: 's2',
        date: '2026-02-01',
        income: 500,
        expense: 100,
        lines: [
          { accountId: 'op', amount: 400 },
          { accountId: 'f', amount: 1100 },
        ],
      },
    ]
    // Income/expense hit operational; fund grew +100 → growth 100
    const totalSeries = buildTotalSeries(accounts, snapshots, settings)
    expect(totalSeries[1]?.total).toBe(1100)
    expect(totalSeries[1]?.growth).toBe(100)
    expect(periodGrowth(accounts, snapshots, settings)).toBe(100)
  })

  it('excludes operational, cash and credit from portfolio growth series', () => {
    const accounts = [
      account({ id: 'op', name: 'Op', kind: 'operational' }),
      account({ id: 'f', name: 'Fund', kind: 'fund' }),
    ]
    const snapshots: BalanceSnapshot[] = [
      {
        id: 's1',
        date: '2026-01-01',
        lines: [
          { accountId: 'op', amount: 1000 },
          { accountId: 'f', amount: 1000 },
        ],
      },
      {
        id: 's2',
        date: '2026-02-01',
        lines: [
          { accountId: 'op', amount: 2000 },
          { accountId: 'f', amount: 1100 },
        ],
      },
    ]
    const series = buildTotalSeries(accounts, snapshots, settings)
    expect(series[1]?.total).toBe(1100)
    expect(series[1]?.growth).toBe(100)
  })

  it('excludes transfer into fund from portfolio growth', () => {
    const accounts = [
      account({ id: 'op', name: 'Op', kind: 'operational' }),
      account({ id: 'f', name: 'Fund', kind: 'fund' }),
    ]
    const snapshots: BalanceSnapshot[] = [
      {
        id: 's1',
        date: '2026-01-01',
        lines: [
          { accountId: 'op', amount: 500 },
          { accountId: 'f', amount: 1000 },
        ],
      },
      {
        id: 's2',
        date: '2026-02-01',
        lines: [
          { accountId: 'op', amount: 0 },
          { accountId: 'f', amount: 1600 },
        ],
      },
    ]
    const transfers: Transfer[] = [
      {
        id: 't1',
        date: '2026-01-15',
        fromAccountId: 'op',
        toAccountId: 'f',
        amount: 500,
      },
    ]
    const series = buildTotalSeries(accounts, snapshots, settings, undefined, transfers)
    expect(series[1]?.total).toBe(1600)
    // +600 balance change − 500 transfer = 100 growth
    expect(series[1]?.growth).toBe(100)
    expect(periodGrowth(accounts, snapshots, settings, undefined, transfers)).toBe(100)
  })

  it('builds daily incremental growth between check-ins', () => {
    const accounts = [account({ id: 'a', name: 'A' })]
    const snapshots: BalanceSnapshot[] = [
      { id: 's1', date: '2026-01-01', lines: [{ accountId: 'a', amount: 1000 }] },
      { id: 's2', date: '2026-01-10', lines: [{ accountId: 'a', amount: 1100 }] },
      { id: 's3', date: '2026-01-20', lines: [{ accountId: 'a', amount: 1050 }] },
    ]
    const daily = buildDailyGrowthSeries(accounts, snapshots, settings)
    expect(daily).toHaveLength(2)
    expect(daily[0]).toMatchObject({ date: '2026-01-10', growth: 100 })
    expect(daily[1]).toMatchObject({ date: '2026-01-20', growth: -50 })
  })

  it('gives +6 growth when balance falls after a 16 withdrawal (100→105→90)', () => {
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

    // 90 − 100 − (−16) = 6
    expect(accountGrowth('a', '2026-01-01', '2026-01-03', snapshots, transfers, accounts, settings)).toBe(
      6,
    )
    expect(periodGrowth(accounts, snapshots, settings, undefined, transfers)).toBe(6)
    const series = buildTotalSeries(accounts, snapshots, settings, undefined, transfers)
    expect(series[series.length - 1]?.growth).toBe(6)

    const accountSeries = buildAccountSeries('a', snapshots, transfers, accounts, settings)
    expect(accountSeries[accountSeries.length - 1]?.growth).toBe(6)
  })

  it('does not report a Modified Dietz percentage for non-positive capital', () => {
    expect(
      modifiedDietzReturn(100, 10, '2026-01-01', '2026-01-31', [
        { date: '2026-01-02', amount: -200 },
      ]).growthPct,
    ).toBeNull()
    expect(modifiedDietzReturn(0, 10, '2026-01-01', '2026-01-31', []).growthPct).toBeNull()
  })

  it('uses the transfer interval boundary (start, end]', () => {
    const accounts = [
      account({ id: 'op', name: 'Op', kind: 'operational' }),
      account({ id: 'fund', name: 'Fund' }),
    ]
    const transfers: Transfer[] = [
      { id: 'start', date: '2026-01-01', fromAccountId: 'op', toAccountId: 'fund', amount: 100 },
      { id: 'end', date: '2026-01-31', fromAccountId: 'op', toAccountId: 'fund', amount: 50 },
    ]
    const flows = growthCapitalFlows(
      '2026-01-01',
      '2026-01-31',
      [],
      transfers,
      accounts,
      settings,
    )
    expect(flows).toEqual([{ date: '2026-01-31', amount: 50 }])
  })

  it('treats a newly recorded funded growth account as contributed capital', () => {
    const accounts = [
      account({ id: 'op', name: 'Op', kind: 'operational' }),
      account({ id: 'fund', name: 'New fund' }),
    ]
    const snapshots: BalanceSnapshot[] = [
      { id: 's1', date: '2026-01-01', lines: [{ accountId: 'op', amount: 1000 }] },
      {
        id: 's2',
        date: '2026-01-15',
        lines: [
          { accountId: 'op', amount: 900 },
          { accountId: 'fund', amount: 100 },
        ],
      },
      { id: 's3', date: '2026-01-31', lines: [{ accountId: 'fund', amount: 101 }] },
    ]
    const flows = growthCapitalFlows(
      '2026-01-01',
      '2026-01-31',
      snapshots,
      [],
      accounts,
      settings,
    )
    expect(flows).toEqual([{ date: '2026-01-15', amount: 100 }])
  })

  it('includes archived growth accounts in historical portfolio totals', () => {
    const accounts = [
      account({ id: 'dep', name: 'Closed deposit', kind: 'deposit', archived: true }),
      account({ id: 'fund', name: 'Fund', kind: 'fund' }),
    ]
    const snapshots: BalanceSnapshot[] = [
      {
        id: 's1',
        date: '2026-01-01',
        lines: [
          { accountId: 'dep', amount: 100_000 },
          { accountId: 'fund', amount: 10_000 },
        ],
      },
      {
        id: 's2',
        date: '2026-02-01',
        lines: [
          { accountId: 'dep', amount: 0 },
          { accountId: 'fund', amount: 10_500 },
        ],
      },
      {
        id: 's3',
        date: '2026-03-01',
        lines: [{ accountId: 'fund', amount: 11_000 }],
      },
    ]
    const series = buildTotalSeries(accounts, snapshots, settings)
    expect(series[0]?.total).toBe(110_000)
    expect(series[1]?.total).toBe(10_500)
    expect(series[1]?.growth).toBe(500)
    expect(series[2]?.total).toBe(11_000)
    expect(series[2]?.growth).toBe(1000)
  })

  it('counts transfers from archived growth accounts as portfolio outflows', () => {
    const accounts = [
      account({ id: 'dep', name: 'Closed deposit', kind: 'deposit', archived: true }),
      account({ id: 'op', name: 'Card', kind: 'operational' }),
    ]
    const snapshots: BalanceSnapshot[] = [
      {
        id: 's1',
        date: '2026-01-01',
        lines: [
          { accountId: 'dep', amount: 50_000 },
          { accountId: 'op', amount: 0 },
        ],
      },
      {
        id: 's2',
        date: '2026-02-01',
        lines: [
          { accountId: 'dep', amount: 0 },
          { accountId: 'op', amount: 50_000 },
        ],
      },
    ]
    const transfers: Transfer[] = [
      {
        id: 't1',
        date: '2026-01-20',
        fromAccountId: 'dep',
        toAccountId: 'op',
        amount: 50_000,
      },
    ]
    const series = buildTotalSeries(accounts, snapshots, settings, undefined, transfers)
    expect(series[1]?.total).toBe(0)
    expect(series[1]?.growth).toBe(0)
  })
})
