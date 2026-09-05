import { describe, expect, it } from 'vitest'
import { buildIndexComparison } from './indexComparison'
import type {
  Account,
  BalanceSnapshot,
  MarketIndex,
  WalletSettings,
} from '../types/wallet'

const settings: WalletSettings = {
  baseCurrency: 'RUB',
  exchangeRates: { RUB: 1 },
}

const fund: Account = {
  id: 'fund',
  name: 'Инвестиции',
  currency: 'RUB',
  color: '#2563eb',
  archived: false,
  sortOrder: 0,
  kind: 'investment',
}

const operational: Account = {
  ...fund,
  id: 'cash',
  name: 'Текущий',
  sortOrder: 1,
  kind: 'operational',
}

function snapshot(id: string, date: string, fundAmount: number, cashAmount = 0): BalanceSnapshot {
  return {
    id,
    date,
    origin: 'manual',
    income: 0,
    expense: 0,
    lines: [
      { accountId: fund.id, amount: fundAmount },
      { accountId: operational.id, amount: cashAmount },
    ],
  }
}

describe('buildIndexComparison', () => {
  it('buys index units with boundary transfers and ignores internal wallet reshuffling as return', () => {
    const index: MarketIndex = {
      id: 'imoex',
      name: 'Мосбиржа',
      kind: 'amount',
      color: '#2563eb',
    }
    const points = buildIndexComparison({
      index,
      indexValues: [
        { indexId: index.id, date: '2025-01-01', value: 10 },
        { indexId: index.id, date: '2025-02-01', value: 20 },
      ],
      accounts: [fund, operational],
      snapshots: [
        snapshot('s1', '2025-01-01', 100, 100),
        snapshot('s2', '2025-02-01', 200, 0),
      ],
      transfers: [
        {
          id: 't1',
          date: '2025-02-01',
          fromAccountId: operational.id,
          toAccountId: fund.id,
          amount: 100,
        },
      ],
      settings,
    })

    expect(points.at(-1)).toMatchObject({
      actualTotal: 200,
      indexTotal: 300,
      actualGrowth: 0,
      indexGrowth: 100,
      difference: -100,
    })
  })

  it('compounds annual-rate indices by elapsed days', () => {
    const index: MarketIndex = {
      id: 'rate',
      name: 'Ставка банка',
      kind: 'annual_rate',
      color: '#059669',
    }
    const points = buildIndexComparison({
      index,
      indexValues: [{ indexId: index.id, date: '2025-01-01', value: 0.1 }],
      accounts: [fund],
      snapshots: [
        snapshot('s1', '2025-01-01', 100),
        snapshot('s2', '2026-01-01', 100),
      ],
      transfers: [],
      settings,
    })

    expect(points.at(-1)?.indexTotal).toBeCloseTo(110, 8)
    expect(points.at(-1)?.indexGrowth).toBeCloseTo(10, 8)
  })
})
