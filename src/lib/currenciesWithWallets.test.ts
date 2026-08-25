import { describe, expect, it } from 'vitest'
import type { Account, BalanceSnapshot, WalletSettings } from '../types/wallet'
import { currenciesWithWalletsByBalance } from './currenciesWithWallets'

const settings: WalletSettings = {
  baseCurrency: 'RUB',
  exchangeRates: { RUB: 1, USD: 100, EUR: 110 },
}

function account(partial: Partial<Account> & Pick<Account, 'id' | 'name' | 'currency'>): Account {
  return {
    color: '#2563eb',
    archived: false,
    sortOrder: 0,
    kind: 'fund',
    ...partial,
  }
}

describe('currenciesWithWalletsByBalance', () => {
  it('lists only wallet currencies sorted by base balance desc', () => {
    const accounts = [
      account({ id: 'r', name: 'RUB', currency: 'RUB' }),
      account({ id: 'u', name: 'USD', currency: 'USD' }),
      account({ id: 'e', name: 'EUR', currency: 'EUR' }),
    ]
    const snapshots: BalanceSnapshot[] = [
      {
        id: 's1',
        date: '2026-02-01',
        lines: [
          { accountId: 'r', amount: 500 },
          { accountId: 'u', amount: 20 },
          { accountId: 'e', amount: 5 },
        ],
      },
    ]

    expect(currenciesWithWalletsByBalance(accounts, snapshots, settings)).toEqual([
      'USD',
      'EUR',
      'RUB',
    ])
  })

  it('skips archived wallets and can exclude base', () => {
    const accounts = [
      account({ id: 'r', name: 'RUB', currency: 'RUB' }),
      account({ id: 'u', name: 'USD', currency: 'USD' }),
      account({ id: 'old', name: 'Old EUR', currency: 'EUR', archived: true }),
    ]
    const snapshots: BalanceSnapshot[] = [
      {
        id: 's1',
        date: '2026-02-01',
        lines: [
          { accountId: 'r', amount: 1000 },
          { accountId: 'u', amount: 1 },
          { accountId: 'old', amount: 100 },
        ],
      },
    ]

    expect(
      currenciesWithWalletsByBalance(accounts, snapshots, settings, undefined, {
        excludeBase: true,
      }),
    ).toEqual(['USD'])
  })
})
