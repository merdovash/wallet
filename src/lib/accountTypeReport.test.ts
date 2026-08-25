import { describe, expect, it } from 'vitest'
import { buildAccountTypeReport } from './accountTypeReport'
import type { Account, BalanceSnapshot, WalletSettings } from '../types/wallet'

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

describe('buildAccountTypeReport', () => {
  it('groups balances by account kind', () => {
    const accounts: Account[] = [
      account({ id: 'b', name: 'Карта', kind: 'operational', sortOrder: 0 }),
      account({ id: 'c', name: 'Кошелёк', kind: 'cash', sortOrder: 1 }),
      account({
        id: 'cr',
        name: 'Кредитка',
        kind: 'credit',
        creditLimit: 100_000,
        sortOrder: 2,
      }),
      account({ id: 'i', name: 'Брокер', kind: 'investment', sortOrder: 3 }),
    ]
    const snapshots: BalanceSnapshot[] = [
      {
        id: 's1',
        date: '2026-01-01',
        lines: [
          { accountId: 'b', amount: 10_000 },
          { accountId: 'c', amount: 2_000 },
          { accountId: 'cr', amount: 80_000 },
          { accountId: 'i', amount: 50_000 },
        ],
      },
    ]

    const report = buildAccountTypeReport(accounts, snapshots, [], settings)
    expect(report.rows.map((r) => r.kind)).toEqual([
      'operational',
      'investment',
      'cash',
      'credit',
    ])
    expect(report.rows.find((r) => r.kind === 'operational')?.balanceBase).toBe(10_000)
    expect(report.rows.find((r) => r.kind === 'cash')?.balanceBase).toBe(2_000)
    // Credit contributes −debt to net worth (limit 100k − available 80k = 20k debt)
    expect(report.rows.find((r) => r.kind === 'credit')?.balanceBase).toBe(-20_000)
    expect(report.rows.find((r) => r.kind === 'investment')?.balanceBase).toBe(50_000)
    expect(report.grandTotalBase).toBe(42_000)
    expect(report.growthPct).toBeNull()
    expect(report.annualizedPct).toBeNull()
  })

  it('computes relative and annualized growth per growth kind', () => {
    const accounts: Account[] = [
      account({ id: 'fund', name: 'Фонд', kind: 'fund' }),
      account({ id: 'dep', name: 'Вклад', kind: 'deposit' }),
    ]
    const snapshots: BalanceSnapshot[] = [
      {
        id: 's1',
        date: '2026-01-01',
        lines: [
          { accountId: 'fund', amount: 100_000 },
          { accountId: 'dep', amount: 50_000 },
        ],
      },
      {
        id: 's2',
        date: '2026-02-01',
        lines: [
          { accountId: 'fund', amount: 101_000 },
          { accountId: 'dep', amount: 50_500 },
        ],
      },
    ]

    const report = buildAccountTypeReport(accounts, snapshots, [], settings)
    expect(report.days).toBe(31)
    const fund = report.rows.find((r) => r.kind === 'fund')
    const dep = report.rows.find((r) => r.kind === 'deposit')
    expect(fund?.growthBase).toBe(1_000)
    expect(fund?.growthPct).toBeCloseTo(0.01, 8)
    expect(dep?.growthBase).toBe(500)
    expect(dep?.growthPct).toBeCloseTo(0.01, 8)
    expect(report.growthPct).toBeCloseTo(0.01, 8)
    expect(report.growthPctInvest).toBeCloseTo(0.01, 8)
    expect(report.growthPctOfAllMass).toBeCloseTo(0.01, 8)
    expect(report.annualizedPct).not.toBeNull()
  })

  it('takes overall % from all money, excluding top-ups', () => {
    const accounts: Account[] = [
      account({ id: 'fund', name: 'Фонд', kind: 'fund' }),
      account({ id: 'op', name: 'Карта', kind: 'operational' }),
    ]
    const snapshots: BalanceSnapshot[] = [
      {
        id: 's1',
        date: '2026-01-01',
        lines: [
          { accountId: 'fund', amount: 100_000 },
          { accountId: 'op', amount: 400_000 },
        ],
      },
      {
        id: 's2',
        date: '2026-01-31',
        lines: [
          { accountId: 'fund', amount: 151_000 },
          { accountId: 'op', amount: 350_000 },
        ],
      },
    ]
    const transfers = [
      {
        id: 't1',
        date: '2026-01-16',
        fromAccountId: 'op',
        toAccountId: 'fund',
        amount: 50_000,
      },
    ]
    const report = buildAccountTypeReport(accounts, snapshots, transfers, settings)
    expect(report.grandGrowthBase).toBeCloseTo(1_000, 4)
    expect(report.rows.find((r) => r.kind === 'fund')?.growthPct).toBeCloseTo(1_000 / 125_000, 8)
    expect(report.growthPctInvest).toBeCloseTo(1_000 / 100_000, 8)
    expect(report.growthPctOfAllMass).toBeCloseTo(1_000 / 500_000, 8)
    expect(report.growthPct).toBeCloseTo(1_000 / 500_000, 8)
  })

  it('limits growth to the selected period', () => {
    const accounts = [account({ id: 'fund', name: 'Фонд', kind: 'fund' })]
    const snapshots: BalanceSnapshot[] = [
      { id: 's1', date: '2026-01-01', lines: [{ accountId: 'fund', amount: 100_000 }] },
      { id: 's2', date: '2026-02-01', lines: [{ accountId: 'fund', amount: 101_000 }] },
      { id: 's3', date: '2026-03-01', lines: [{ accountId: 'fund', amount: 103_000 }] },
    ]
    const full = buildAccountTypeReport(accounts, snapshots, [], settings)
    expect(full.grandGrowthBase).toBeCloseTo(3_000, 4)
    const lastMonth = buildAccountTypeReport(
      accounts,
      snapshots,
      [],
      settings,
      undefined,
      'withFx',
      { startDate: '2026-02-01', endDate: '2026-03-01' },
    )
    expect(lastMonth.startDate).toBe('2026-02-01')
    expect(lastMonth.asOfDate).toBe('2026-03-01')
    expect(lastMonth.grandGrowthBase).toBeCloseTo(2_000, 4)
  })
})
