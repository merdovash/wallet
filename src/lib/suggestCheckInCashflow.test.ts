import { describe, expect, it } from 'vitest'
import { suggestCheckInCashflow } from './suggestCheckInCashflow'
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
    kind: 'operational',
    ...partial,
  }
}

describe('suggestCheckInCashflow', () => {
  const accounts: Account[] = [
    account({ id: 'op', name: 'Карта', kind: 'operational' }),
    account({ id: 'fund', name: 'Фонд', kind: 'fund' }),
  ]

  const snapshots: BalanceSnapshot[] = [
    {
      id: 's1',
      date: '2026-01-01',
      lines: [
        { accountId: 'op', amount: 10_000 },
        { accountId: 'fund', amount: 50_000 },
      ],
    },
  ]

  it('suggests expense when operational balance drops', () => {
    const result = suggestCheckInCashflow({
      date: '2026-01-05',
      accounts,
      snapshots,
      settings,
      lines: [
        { accountId: 'op', amount: 8_000 },
        { accountId: 'fund', amount: 50_000 },
      ],
      transfers: [],
    })
    expect(result.hasPrevious).toBe(true)
    expect(result.income).toBe(0)
    expect(result.expense).toBe(2_000)
  })

  it('suggests income when operational balance rises', () => {
    const result = suggestCheckInCashflow({
      date: '2026-01-05',
      accounts,
      snapshots,
      settings,
      lines: [
        { accountId: 'op', amount: 15_000 },
        { accountId: 'fund', amount: 50_000 },
      ],
      transfers: [],
    })
    expect(result.income).toBe(5_000)
    expect(result.expense).toBe(0)
  })

  it('ignores growth-account balance changes', () => {
    const result = suggestCheckInCashflow({
      date: '2026-01-05',
      accounts,
      snapshots,
      settings,
      lines: [
        { accountId: 'op', amount: 10_000 },
        { accountId: 'fund', amount: 55_000 },
      ],
      transfers: [],
    })
    expect(result.income).toBe(0)
    expect(result.expense).toBe(0)
  })

  it('nets out transfers from operational into growth', () => {
    const result = suggestCheckInCashflow({
      date: '2026-01-05',
      accounts,
      snapshots,
      settings,
      lines: [
        { accountId: 'op', amount: 7_000 },
        { accountId: 'fund', amount: 53_000 },
      ],
      transfers: [{ fromAccountId: 'op', toAccountId: 'fund', amount: 3_000 }],
    })
    expect(result.income).toBe(0)
    expect(result.expense).toBe(0)
  })

  it('returns zeros without a previous check-in', () => {
    const result = suggestCheckInCashflow({
      date: '2026-01-01',
      accounts,
      snapshots,
      settings,
      lines: [{ accountId: 'op', amount: 10_000 }],
      transfers: [],
    })
    expect(result.hasPrevious).toBe(false)
    expect(result.net).toBe(0)
  })
})
