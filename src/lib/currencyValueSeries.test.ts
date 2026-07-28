import { describe, expect, it } from 'vitest'
import { buildCurrencyValueSeries } from './currencyValueSeries'
import type { Account, BalanceSnapshot, WalletSettings } from '../types/wallet'

const settings: WalletSettings = {
  baseCurrency: 'RUB',
  exchangeRates: { RUB: 1, USD: 100, EUR: 110 },
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

describe('buildCurrencyValueSeries', () => {
  it('tracks foreign currency value in base over time', () => {
    const accounts = [
      account({ id: 'u', name: 'USD', currency: 'USD' }),
      account({ id: 'r', name: 'RUB', currency: 'RUB' }),
    ]
    const snapshots: BalanceSnapshot[] = [
      {
        id: 's1',
        date: '2026-01-01',
        lines: [
          { accountId: 'u', amount: 10 },
          { accountId: 'r', amount: 1000 },
        ],
      },
      {
        id: 's2',
        date: '2026-02-01',
        lines: [{ accountId: 'u', amount: 12 }],
      },
    ]

    const { currencies, points } = buildCurrencyValueSeries(accounts, snapshots, settings)
    expect(currencies).toEqual(['USD'])
    expect(points[0]?.values.USD).toBe(1000)
    expect(points[1]?.values.USD).toBe(1200)
  })
})
