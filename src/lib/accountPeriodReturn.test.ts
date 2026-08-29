import { describe, expect, it } from 'vitest'
import type { Account, BalanceSnapshot, Transfer, WalletSettings } from '../types/wallet'
import { buildAccountPeriodReturn } from './accountPeriodReturn'
import { MIN_ANNUALIZE_DAYS } from './monthlyReturns'

const settings: WalletSettings = {
  baseCurrency: 'RUB',
  exchangeRates: { RUB: 1 },
}

function account(partial: Partial<Account> & Pick<Account, 'id'>): Account {
  return {
    name: partial.name ?? partial.id,
    currency: 'RUB',
    color: '#2563eb',
    archived: false,
    sortOrder: 0,
    kind: 'fund',
    ...partial,
  }
}

describe('buildAccountPeriodReturn', () => {
  it('computes Modified Dietz return for an account', () => {
    const accounts = [account({ id: 'f' })]
    const snapshots: BalanceSnapshot[] = [
      { id: 's1', date: '2026-01-01', lines: [{ accountId: 'f', amount: 1000 }] },
      { id: 's2', date: '2026-02-01', lines: [{ accountId: 'f', amount: 1100 }] },
    ]
    const result = buildAccountPeriodReturn('f', accounts, snapshots, [], settings)
    expect(result?.growthPct).toBeCloseTo(0.1)
    expect(result?.days).toBeGreaterThanOrEqual(MIN_ANNUALIZE_DAYS)
    expect(result?.annualizedPct).not.toBeNull()
  })

  it('excludes transfers from account growth percentage', () => {
    const accounts = [account({ id: 'f' }), account({ id: 'op', kind: 'operational', name: 'Op' })]
    const snapshots: BalanceSnapshot[] = [
      {
        id: 's1',
        date: '2026-01-01',
        lines: [
          { accountId: 'f', amount: 1000 },
          { accountId: 'op', amount: 500 },
        ],
      },
      {
        id: 's2',
        date: '2026-02-01',
        lines: [
          { accountId: 'f', amount: 1600 },
          { accountId: 'op', amount: 0 },
        ],
      },
    ]
    const transfers: Transfer[] = [
      { id: 't1', date: '2026-01-15', fromAccountId: 'op', toAccountId: 'f', amount: 500 },
    ]
    const result = buildAccountPeriodReturn('f', accounts, snapshots, transfers, settings)
    expect(result?.growthPct).toBeCloseTo(0.078, 2)
  })

  it('does not annualize periods shorter than 30 days', () => {
    const accounts = [account({ id: 'f' })]
    const snapshots: BalanceSnapshot[] = [
      { id: 's1', date: '2026-01-01', lines: [{ accountId: 'f', amount: 1000 }] },
      { id: 's2', date: '2026-01-10', lines: [{ accountId: 'f', amount: 1100 }] },
    ]
    const result = buildAccountPeriodReturn('f', accounts, snapshots, [], settings)
    expect(result?.growthPct).toBeCloseTo(0.1)
    expect(result?.annualizedPct).toBeNull()
  })

  it.each(['operational', 'cash', 'credit', 'cashback'] as const)(
    'does not return growth percent for %s accounts',
    (kind) => {
      const accounts = [account({ id: 'a', kind })]
      const snapshots: BalanceSnapshot[] = [
        { id: 's1', date: '2026-01-01', lines: [{ accountId: 'a', amount: 1000 }] },
        { id: 's2', date: '2026-02-01', lines: [{ accountId: 'a', amount: 1100 }] },
      ]
      expect(buildAccountPeriodReturn('a', accounts, snapshots, [], settings)).toBeNull()
    },
  )
})
