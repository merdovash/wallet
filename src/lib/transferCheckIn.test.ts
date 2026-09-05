import { describe, expect, it } from 'vitest'
import { buildTransferSnapshotLines } from './transferCheckIn'
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
    kind: 'operational',
    ...partial,
  }
}

describe('buildTransferSnapshotLines', () => {
  it('adjusts from and to balances', () => {
    const accounts = [account({ id: 'a', name: 'A' }), account({ id: 'b', name: 'B' })]
    const snapshots: BalanceSnapshot[] = [
      {
        id: 's1',
        date: '2026-01-01',
        origin: 'manual',
        lines: [
          { accountId: 'a', amount: 1000 },
          { accountId: 'b', amount: 200 },
        ],
      },
    ]
    const lines = buildTransferSnapshotLines({
      date: '2026-01-10',
      fromAccountId: 'a',
      toAccountId: 'b',
      amount: 150,
      accounts,
      snapshots,
      settings,
    })
    expect(lines).toEqual([
      { accountId: 'a', amount: 850 },
      { accountId: 'b', amount: 350 },
    ])
  })

  it('credits the destination with the explicit receive amount', () => {
    const accounts = [account({ id: 'a', name: 'A' }), account({ id: 'b', name: 'B' })]
    const snapshots: BalanceSnapshot[] = [
      {
        id: 's1',
        date: '2026-01-01',
        origin: 'manual',
        lines: [
          { accountId: 'a', amount: 1000 },
          { accountId: 'b', amount: 200 },
        ],
      },
    ]
    const lines = buildTransferSnapshotLines({
      date: '2026-01-10',
      fromAccountId: 'a',
      toAccountId: 'b',
      amount: 150,
      toAmount: 140,
      accounts,
      snapshots,
      settings,
    })
    expect(lines).toEqual([
      { accountId: 'a', amount: 850 },
      { accountId: 'b', amount: 340 },
    ])
  })
})
