import { describe, expect, it } from 'vitest'
import { buildAccountsPageTotals } from './accountsPageTotals'
import type { Account, BalanceSnapshot, WalletSettings } from '../types/wallet'

const settings: WalletSettings = {
  baseCurrency: 'RUB',
  exchangeRates: { RUB: 1, USD: 80 },
}

function account(partial: Partial<Account> & Pick<Account, 'id'>): Account {
  return {
    name: partial.name ?? partial.id,
    currency: 'RUB',
    color: '#2563eb',
    archived: false,
    sortOrder: 0,
    kind: 'operational',
    ...partial,
  }
}

describe('buildAccountsPageTotals', () => {
  it('returns zeros without snapshots', () => {
    const accounts = [account({ id: 'a', kind: 'operational' })]
    expect(buildAccountsPageTotals(accounts, [], settings)).toEqual({
      asOfDate: null,
      totalMoneyBase: 0,
      creditDebtBase: 0,
    })
  })

  it('sums money without credit and reports credit debt separately', () => {
    const accounts = [
      account({ id: 'cash', name: 'Наличка', kind: 'cash' }),
      account({ id: 'fund', name: 'Фонд', kind: 'fund' }),
      account({ id: 'usd', name: 'USD', kind: 'investment', currency: 'USD' }),
      account({ id: 'cc', name: 'Карта', kind: 'credit', creditLimit: 100_000 }),
      account({ id: 'cb', name: 'Кэшбек', kind: 'cashback', currency: 'CBK' }),
    ]
    const snapshots: BalanceSnapshot[] = [
      {
        id: 's1',
        date: '2026-08-01',
        lines: [
          { accountId: 'cash', amount: 10_000 },
          { accountId: 'fund', amount: 50_000 },
          { accountId: 'usd', amount: 100 },
          { accountId: 'cc', amount: 70_000 },
          { accountId: 'cb', amount: 500 },
        ],
      },
    ]
    const result = buildAccountsPageTotals(accounts, snapshots, settings)
    expect(result.asOfDate).toBe('2026-08-01')
    expect(result.totalMoneyBase).toBe(10_000 + 50_000 + 100 * 80)
    expect(result.creditDebtBase).toBe(30_000)
  })

  it('ignores archived accounts', () => {
    const accounts = [
      account({ id: 'live', kind: 'operational' }),
      account({ id: 'old', kind: 'operational', archived: true }),
      account({ id: 'cc', kind: 'credit', creditLimit: 50_000, archived: true }),
    ]
    const snapshots: BalanceSnapshot[] = [
      {
        id: 's1',
        date: '2026-08-01',
        lines: [
          { accountId: 'live', amount: 1_000 },
          { accountId: 'old', amount: 9_000 },
          { accountId: 'cc', amount: 10_000 },
        ],
      },
    ]
    const result = buildAccountsPageTotals(accounts, snapshots, settings)
    expect(result.totalMoneyBase).toBe(1_000)
    expect(result.creditDebtBase).toBe(0)
  })
})
