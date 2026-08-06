import { describe, expect, it } from 'vitest'
import type { Account, BalanceSnapshot, Transfer, WalletSettings } from '../types/wallet'
import { buildCashbackReport } from './cashbackReport'

const settings: WalletSettings = {
  baseCurrency: 'RUB',
  exchangeRates: { RUB: 1, CBK: 1 },
}

function account(partial: Partial<Account> & Pick<Account, 'id'>): Account {
  return {
    name: partial.name ?? partial.id,
    currency: 'CBK',
    color: '#2563eb',
    archived: false,
    sortOrder: 0,
    kind: 'cashback',
    ...partial,
  }
}

describe('buildCashbackReport', () => {
  it('computes effective discount from expenses and cashback earned', () => {
    const accounts = [account({ id: 'cb', name: 'СберСпасибо' })]
    const snapshots: BalanceSnapshot[] = [
      {
        id: 's1',
        date: '2026-01-01',
        lines: [{ accountId: 'cb', amount: 0 }],
        expense: 0,
      },
      {
        id: 's2',
        date: '2026-01-15',
        lines: [{ accountId: 'cb', amount: 500 }],
        expense: 10_000,
      },
      {
        id: 's3',
        date: '2026-02-01',
        lines: [{ accountId: 'cb', amount: 800 }],
        expense: 6_000,
      },
    ]

    const report = buildCashbackReport(accounts, snapshots, [], settings)
    expect(report.totalExpense).toBe(16_000)
    expect(report.totalCashbackEarned).toBe(800)
    expect(report.effectiveDiscountPct).toBeCloseTo(0.05)
    expect(report.currentCashbackBalance).toBe(800)
  })

  it('excludes transfers into cashback from earned amount', () => {
    const accounts = [
      account({ id: 'cb' }),
      account({ id: 'op', kind: 'operational', currency: 'RUB', name: 'Карта' }),
    ]
    const snapshots: BalanceSnapshot[] = [
      { id: 's1', date: '2026-01-01', lines: [{ accountId: 'cb', amount: 0 }] },
      { id: 's2', date: '2026-01-10', lines: [{ accountId: 'cb', amount: 1000 }], expense: 5_000 },
    ]
    const transfers: Transfer[] = [
      {
        id: 't1',
        date: '2026-01-08',
        fromAccountId: 'op',
        toAccountId: 'cb',
        amount: 700,
      },
    ]

    const report = buildCashbackReport(accounts, snapshots, transfers, settings)
    expect(report.totalCashbackEarned).toBe(300)
    expect(report.rows.find((r) => r.date === '2026-01-10')?.discountPct).toBeCloseTo(0.06)
  })
})
