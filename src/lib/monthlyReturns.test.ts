import { describe, expect, it } from 'vitest'
import {
  annualizeMonthlyReturn,
  annualizePeriodReturn,
  buildMonthlyReturns,
  buildPeriodReturn,
} from './monthlyReturns'
import type { Account, BalanceSnapshot, WalletSettings } from '../types/wallet'

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
    kind: 'bank',
    ...partial,
  }
}

describe('monthlyReturns', () => {
  it('annualizes monthly and period returns', () => {
    expect(annualizeMonthlyReturn(0.01)).toBeCloseTo((1.01) ** 12 - 1, 8)
    expect(annualizePeriodReturn(0.1, 365)).toBeCloseTo(0.1, 8)
  })

  it('builds monthly growth percent excluding cashflows', () => {
    const accounts = [account({ id: 'a', name: 'A' })]
    const snapshots: BalanceSnapshot[] = [
      { id: 's1', date: '2026-01-01', lines: [{ accountId: 'a', amount: 100_000 }] },
      { id: 's2', date: '2026-01-31', lines: [{ accountId: 'a', amount: 101_000 }] },
      {
        id: 's3',
        date: '2026-02-28',
        income: 5_000,
        lines: [{ accountId: 'a', amount: 107_020 }],
      },
    ]

    const rows = buildMonthlyReturns(accounts, snapshots, settings)
    expect(rows).toHaveLength(2)

    // Jan: 1000 / 100000 = 1%
    expect(rows[0]?.yearMonth).toBe('2026-01')
    expect(rows[0]?.growthPct).toBeCloseTo(0.01, 8)
    expect(rows[0]?.annualizedPct).toBeCloseTo(annualizeMonthlyReturn(0.01), 8)

    // Feb: end 107020 - start 101000 - income 5000 = 1020 → ~1.01%
    expect(rows[1]?.yearMonth).toBe('2026-02')
    expect(rows[1]?.growth).toBeCloseTo(1020, 4)
    expect(rows[1]?.growthPct).toBeCloseTo(1020 / 101_000, 8)
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
    expect(summary?.annualizedPct).toBeCloseTo(annualizePeriodReturn(0.1, 30), 8)
  })
})
