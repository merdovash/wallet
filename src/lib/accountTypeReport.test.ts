import { describe, expect, it } from 'vitest'
import { buildAccountTypeReport } from './accountTypeReport'
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
    kind: 'bank',
    ...partial,
  }
}

describe('buildAccountTypeReport', () => {
  it('groups balances by account kind', () => {
    const accounts: Account[] = [
      account({ id: 'b', name: 'Карта', kind: 'bank', sortOrder: 0 }),
      account({ id: 'c', name: 'Кошелёк', kind: 'cash', sortOrder: 1 }),
      account({
        id: 'cr',
        name: 'Кредитка',
        kind: 'credit',
        creditLimit: 100_000,
        sortOrder: 2,
      }),
      account({ id: 'i', name: 'Брокер', kind: 'investment', sortOrder: 3 }),
    ]
    const snapshots: BalanceSnapshot[] = [
      {
        id: 's1',
        date: '2026-01-01',
        lines: [
          { accountId: 'b', amount: 10_000 },
          { accountId: 'c', amount: 2_000 },
          { accountId: 'cr', amount: 80_000 },
          { accountId: 'i', amount: 50_000 },
        ],
      },
    ]

    const report = buildAccountTypeReport(accounts, snapshots, [], settings)
    expect(report.rows.map((r) => r.kind)).toEqual(['bank', 'cash', 'credit', 'investment'])
    expect(report.rows.find((r) => r.kind === 'bank')?.balanceBase).toBe(10_000)
    expect(report.rows.find((r) => r.kind === 'cash')?.balanceBase).toBe(2_000)
    // Credit contributes −debt to net worth (limit 100k − available 80k = 20k debt)
    expect(report.rows.find((r) => r.kind === 'credit')?.balanceBase).toBe(-20_000)
    expect(report.rows.find((r) => r.kind === 'investment')?.balanceBase).toBe(50_000)
    expect(report.grandTotalBase).toBe(42_000)
  })
})
