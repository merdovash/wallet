import { describe, expect, it } from 'vitest'
import {
  buildCurrencyFxBreakdown,
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
  it('tracks foreign currencies only by default', () => {
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
    expect(currencies).toEqual(['USD'])
    expect(points[0]?.values).toEqual({ USD: 1000 })
    expect(points[1]?.values).toEqual({ USD: 1200 })
  })

  it('can include base currency when foreignOnly is false', () => {
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
      foreignOnly: false,
    })
    expect(currencies).toEqual(['RUB', 'USD'])
  })

  it('tracks foreign credit cards as negative debt, not available limit', () => {
    const accounts = [
      account({
        id: 'card',
        name: 'USD credit',
        currency: 'USD',
        kind: 'credit',
        creditLimit: 5_000,
      }),
    ]
    const snapshots: BalanceSnapshot[] = [
      { id: 's1', date: '2026-01-01', lines: [{ accountId: 'card', amount: 4_000 }] },
    ]

    const { points } = buildCurrencyValueSeries(accounts, snapshots, settings)
    expect(points[0]?.values.USD).toBe(-100_000)
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

describe('buildCurrencyFxBreakdown', () => {
  it('lists all foreign accounts by change desc and splits fx vs quantity', () => {
    const accounts = [
      account({ id: 'op', name: 'Op USD', currency: 'USD', kind: 'operational' }),
      account({ id: 'dep', name: 'Deposit USD', currency: 'USD', kind: 'deposit' }),
      account({ id: 'rub', name: 'RUB', currency: 'RUB' }),
    ]
    const snapshots: BalanceSnapshot[] = [
      {
        id: 's1',
        date: '2026-01-01',
        lines: [
          { accountId: 'op', amount: 10 },
          { accountId: 'dep', amount: 5 },
          { accountId: 'rub', amount: 1000 },
        ],
      },
      {
        id: 's2',
        date: '2026-02-01',
        lines: [
          { accountId: 'op', amount: 10 },
          { accountId: 'dep', amount: 8 },
          { accountId: 'rub', amount: 1000 },
        ],
      },
    ]
    const rateBook = {
      '2026-01-01': { RUB: 1, USD: 100 },
      '2026-02-01': { RUB: 1, USD: 110 },
    }

    const breakdown = buildCurrencyFxBreakdown(accounts, snapshots, settings, rateBook)
    expect(breakdown).not.toBeNull()
    expect(breakdown!.accounts.map((a) => a.accountId)).toEqual(['dep', 'op'])
    expect(breakdown!.accounts[0]?.changeBase).toBeCloseTo(380, 4)
    expect(breakdown!.accounts[1]?.changeBase).toBeCloseTo(100, 4)
    expect(breakdown!.absolute).toBeCloseTo(480, 4)

    const fx = breakdown!.factors.find((f) => f.key === 'fx')!
    const qty = breakdown!.factors.find((f) => f.key === 'qty')!
    expect(fx.amount).toBeCloseTo(150, 4)
    expect(qty.amount).toBeCloseTo(330, 4)
    expect(fx.amount + qty.amount).toBeCloseTo(breakdown!.absolute, 4)
  })
})
