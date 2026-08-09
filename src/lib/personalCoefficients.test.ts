import { describe, expect, it } from 'vitest'
import { buildPersonalCoefficients } from './personalCoefficients'
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

describe('buildPersonalCoefficients', () => {
  it('computes savings rate, liquidity cushion and debt load', () => {
    const accounts = [
      account({ id: 'op', name: 'Op', kind: 'operational' }),
      account({ id: 'cash', name: 'Cash', kind: 'cash' }),
      account({ id: 'fund', name: 'Fund', kind: 'fund' }),
      account({ id: 'cc', name: 'Card', kind: 'credit', creditLimit: 100_000 }),
    ]
    const snapshots: BalanceSnapshot[] = [
      {
        id: 's1',
        date: '2026-01-01',
        lines: [
          { accountId: 'op', amount: 60_000 },
          { accountId: 'cash', amount: 30_000 },
          { accountId: 'fund', amount: 200_000 },
          { accountId: 'cc', amount: 80_000 },
        ],
      },
      {
        id: 's2',
        date: '2026-01-31',
        income: 100_000,
        expense: 50_000,
        lines: [
          { accountId: 'op', amount: 40_000 },
          { accountId: 'cash', amount: 30_000 },
          { accountId: 'fund', amount: 250_000 },
          { accountId: 'cc', amount: 70_000 },
        ],
      },
    ]

    const coeffs = buildPersonalCoefficients(
      accounts,
      snapshots,
      settings,
      undefined,
      '2026-01-01',
      '2026-01-31',
      50_000,
    )

    expect(coeffs.savingsRate).toBeCloseTo(0.5, 6)
    expect(coeffs.liquidBalance).toBe(70_000)
    expect(coeffs.liquidityCushionMonths).toBeCloseTo(70_000 / 50_000, 4)
    expect(coeffs.creditDebt).toBe(30_000)
    expect(coeffs.debtLoad).toBeCloseTo(30_000 / 100_000, 6)
  })
})
