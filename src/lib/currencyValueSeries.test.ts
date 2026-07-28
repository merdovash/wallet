import { describe, expect, it } from 'vitest'
import {
  buildCurrencyValueSeries,
  summarizeCurrencyValueChange,
} from './currencyValueSeries'
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
    kind: 'fund',
    ...partial,
  }
}

describe('buildCurrencyValueSeries', () => {
  it('tracks all currencies in base by default', () => {
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
        lines: [
          { accountId: 'u', amount: 12 },
          { accountId: 'r', amount: 1000 },
        ],
      },
    ]

    const { currencies, points } = buildCurrencyValueSeries(accounts, snapshots, settings)
    expect(currencies).toEqual(['RUB', 'USD'])
    expect(points[0]?.values).toEqual({ RUB: 1000, USD: 1000 })
    expect(points[1]?.values).toEqual({ RUB: 1000, USD: 1200 })
  })

  it('can still exclude base currency when foreignOnly', () => {
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
    ]

    const { currencies } = buildCurrencyValueSeries(accounts, snapshots, settings, undefined, {
      foreignOnly: true,
    })
    expect(currencies).toEqual(['USD'])
  })
})

describe('summarizeCurrencyValueChange', () => {
  it('includes fx and quantity changes in total base delta', () => {
    const accounts = [account({ id: 'u', name: 'USD', currency: 'USD' })]
    const snapshots: BalanceSnapshot[] = [
      {
        id: 's1',
        date: '2026-01-01',
        lines: [{ accountId: 'u', amount: 10 }],
      },
      {
        id: 's2',
        date: '2026-02-01',
        lines: [{ accountId: 'u', amount: 12 }],
      },
    ]
    const rateBook = {
      '2026-01-01': { RUB: 1, USD: 100 },
      '2026-02-01': { RUB: 1, USD: 101 },
    }

    const { points } = buildCurrencyValueSeries(accounts, snapshots, settings, rateBook)
    const summary = summarizeCurrencyValueChange(points)
    // start: 10*100=1000; end: 12*101=1212 → +212 (qty + FX)
    expect(summary).toMatchObject({
      fromDate: '2026-01-01',
      toDate: '2026-02-01',
      startTotal: 1000,
      endTotal: 1212,
      absolute: 212,
      relative: 0.212,
    })
  })
})
