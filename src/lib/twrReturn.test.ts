import { describe, expect, it } from 'vitest'
import { buildTimeWeightedReturn } from './twrReturn'
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

describe('buildTimeWeightedReturn', () => {
  it('chains sub-period returns between check-ins', () => {
    const accounts = [account({ id: 'a', name: 'A' })]
    const snapshots: BalanceSnapshot[] = [
      { id: 's1', date: '2026-01-01', lines: [{ accountId: 'a', amount: 100_000 }] },
      { id: 's2', date: '2026-01-16', lines: [{ accountId: 'a', amount: 110_000 }] },
      { id: 's3', date: '2026-01-31', lines: [{ accountId: 'a', amount: 121_000 }] },
    ]
    const { twrPct, subPeriods } = buildTimeWeightedReturn(
      accounts,
      snapshots,
      settings,
      undefined,
      [],
      '2026-01-01',
      '2026-01-31',
    )
    expect(subPeriods).toHaveLength(2)
    expect(subPeriods[0]?.subReturnPct).toBeCloseTo(0.1, 8)
    expect(subPeriods[1]?.subReturnPct).toBeCloseTo(0.1, 8)
    expect(twrPct).toBeCloseTo(1.1 * 1.1 - 1, 8)
  })

  it('adjusts sub-period for end-of-period deposit', () => {
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
        date: '2026-01-31',
        lines: [
          { accountId: 'op', amount: 0 },
          { accountId: 'a', amount: 165_000 },
        ],
      },
    ]
    const transfers: Transfer[] = [
      {
        id: 't1',
        date: '2026-01-31',
        fromAccountId: 'op',
        toAccountId: 'a',
        amount: 50_000,
      },
    ]
    const { twrPct } = buildTimeWeightedReturn(
      accounts,
      snapshots,
      settings,
      undefined,
      transfers,
      '2026-01-01',
      '2026-01-31',
    )
    // growth = 165000 - 100000 - 50000 = 15000 → 15% TWR
    expect(twrPct).toBeCloseTo(0.15, 8)
  })
})
