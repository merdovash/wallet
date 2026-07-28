import { describe, expect, it } from 'vitest'
import { buildCurrencyReport } from './currencyReport'
import type { Account, BalanceSnapshot, Transfer, WalletSettings } from '../types/wallet'

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

describe('buildCurrencyReport', () => {
  it('groups balances by currency with base equivalents and shares', () => {
    const accounts = [
      account({ id: 'a', name: 'Cash', currency: 'RUB', sortOrder: 0 }),
      account({ id: 'b', name: 'USD card', currency: 'USD', sortOrder: 1 }),
      account({ id: 'c', name: 'Broker USD', currency: 'USD', sortOrder: 2 }),
    ]
    const snapshots: BalanceSnapshot[] = [
      {
        id: 's1',
        date: '2026-01-01',
        lines: [
          { accountId: 'a', amount: 1000 },
          { accountId: 'b', amount: 10 },
          { accountId: 'c', amount: 5 },
        ],
      },
      {
        id: 's2',
        date: '2026-02-01',
        lines: [
          { accountId: 'a', amount: 1500 },
          { accountId: 'b', amount: 10 },
          { accountId: 'c', amount: 10 },
        ],
      },
    ]
    const transfers: Transfer[] = []

    const report = buildCurrencyReport(accounts, snapshots, transfers, settings)
    expect(report.asOfDate).toBe('2026-02-01')
    expect(report.grandTotalBase).toBe(1500 + 10 * 100 + 10 * 100) // 3500
    expect(report.rows).toHaveLength(2)
    // Dashboard default: groups by descending amount
    expect(report.rows.map((r) => r.currency)).toEqual(['USD', 'RUB'])
    const withForeignOnly = buildCurrencyReport(accounts, snapshots, transfers, settings, undefined, {
      foreignOnly: true,
    })
    expect(withForeignOnly.rows.map((r) => r.currency)).toEqual(['USD'])
    expect(withForeignOnly.grandTotalBase).toBe(2000)

    const usd = report.rows.find((r) => r.currency === 'USD')!
    expect(usd.balance).toBe(20)
    expect(usd.balanceBase).toBe(2000)
    expect(usd.accountCount).toBe(2)
    expect(usd.share).toBeCloseTo(2000 / 3500)
    expect(usd.growth).toBe(5) // only c grew by 5; b unchanged

    const rub = report.rows.find((r) => r.currency === 'RUB')!
    expect(rub.balance).toBe(1500)
    expect(rub.growth).toBe(500)
  })

  it('returns empty rows without accounts or snapshots', () => {
    expect(buildCurrencyReport([], [], [], settings).rows).toEqual([])
    expect(
      buildCurrencyReport(
        [account({ id: 'a', name: 'A', currency: 'RUB' })],
        [],
        [],
        settings,
      ).rows,
    ).toEqual([])
  })
})
