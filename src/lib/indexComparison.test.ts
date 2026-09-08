import { describe, expect, it } from 'vitest'
import {
  appendComparisonDiagnosis,
  buildIndexComparison,
  chartIndexComparisonValue,
  diagnoseIndexComparison,
  formatComparisonDiagnosis,
} from './indexComparison'
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

const deposit: Account = {
  ...fund,
  id: 'deposit',
  name: 'Вклад',
  sortOrder: 2,
  kind: 'deposit',
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
      currency: 'RUB',
      color: '#2563eb',
    }
    const points = buildIndexComparison({
      index,
      indices: [index],
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
      currency: 'RUB',
      color: '#059669',
    }
    const points = buildIndexComparison({
      index,
      indices: [index],
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

  it('limits the comparison to the selected wallets', () => {
    const index: MarketIndex = {
      id: 'imoex',
      name: 'Мосбиржа',
      kind: 'amount',
      currency: 'RUB',
      color: '#2563eb',
    }
    const points = buildIndexComparison({
      index,
      indices: [index],
      indexValues: [
        { indexId: index.id, date: '2025-01-01', value: 10 },
        { indexId: index.id, date: '2025-02-01', value: 11 },
      ],
      accounts: [fund, deposit],
      snapshots: [
        {
          id: 's1',
          date: '2025-01-01',
          origin: 'manual',
          income: 0,
          expense: 0,
          lines: [
            { accountId: fund.id, amount: 100 },
            { accountId: deposit.id, amount: 50 },
          ],
        },
        {
          id: 's2',
          date: '2025-02-01',
          origin: 'manual',
          income: 0,
          expense: 0,
          lines: [
            { accountId: fund.id, amount: 110 },
            { accountId: deposit.id, amount: 60 },
          ],
        },
      ],
      transfers: [],
      settings,
      selectedAccountIds: [fund.id],
    })

    expect(points.at(-1)).toMatchObject({
      actualTotal: 110,
      indexTotal: 110,
      actualGrowth: 10,
      indexGrowth: 10,
      difference: 0,
    })
  })

  it('includes the exchange-rate effect for an index quoted in foreign currency', () => {
    const index: MarketIndex = {
      id: 'sp500',
      name: 'S&P 500',
      kind: 'amount',
      currency: 'USD',
      color: '#2563eb',
    }
    const points = buildIndexComparison({
      index,
      indices: [index],
      indexValues: [
        { indexId: index.id, date: '2025-01-01', value: 10 },
        { indexId: index.id, date: '2025-02-01', value: 10 },
      ],
      accounts: [fund],
      snapshots: [
        snapshot('s1', '2025-01-01', 100),
        snapshot('s2', '2025-02-01', 100),
      ],
      transfers: [],
      settings,
      rateBook: {
        '2025-01-01': { RUB: 1, USD: 80 },
        '2025-02-01': { RUB: 1, USD: 100 },
      },
    })

    expect(points.at(-1)?.indexTotal).toBeCloseTo(125, 8)
    expect(points.at(-1)?.indexGrowth).toBeCloseTo(25, 8)
  })

  it('derives a rate series from the base index plus spread', () => {
    const baseIndex: MarketIndex = {
      id: 'base',
      name: 'Ключевая ставка',
      kind: 'annual_rate',
      currency: 'RUB',
      color: '#2563eb',
    }
    const derivedIndex: MarketIndex = {
      id: 'derived',
      name: 'Депозит +1',
      kind: 'derived_rate',
      currency: 'RUB',
      baseIndexId: baseIndex.id,
      rateSpreadPct: 0.01,
      color: '#059669',
    }
    const points = buildIndexComparison({
      index: derivedIndex,
      indices: [baseIndex, derivedIndex],
      indexValues: [{ indexId: baseIndex.id, date: '2025-01-01', value: 0.1 }],
      accounts: [fund],
      snapshots: [
        snapshot('s1', '2025-01-01', 100),
        snapshot('s2', '2026-01-01', 100),
      ],
      transfers: [],
      settings,
    })

    expect(points.at(-1)?.indexTotal).toBeCloseTo(111, 8)
    expect(points.at(-1)?.indexGrowth).toBeCloseTo(11, 8)
  })

  it('marks index observation dates and linearly interpolates chart values between them', () => {
    const index: MarketIndex = {
      id: 'imoex',
      name: 'Мосбиржа',
      kind: 'amount',
      currency: 'RUB',
      color: '#2563eb',
    }
    const points = buildIndexComparison({
      index,
      indices: [index],
      indexValues: [
        { indexId: index.id, date: '2025-01-01', value: 10 },
        { indexId: index.id, date: '2025-03-01', value: 30 },
      ],
      accounts: [fund],
      snapshots: [
        snapshot('s1', '2025-01-01', 100),
        snapshot('s2', '2025-02-01', 100),
        snapshot('s3', '2025-03-01', 100),
      ],
      transfers: [],
      settings,
    })

    expect(points.map((point) => point.indexObserved)).toEqual([true, false, true])
    expect(chartIndexComparisonValue(points, 0, 'indexTotal')).toEqual({
      value: points[0]!.indexTotal,
      calculated: false,
    })
    expect(chartIndexComparisonValue(points, 1, 'indexTotal').calculated).toBe(true)
    const interpolated = chartIndexComparisonValue(points, 1, 'indexTotal')
    const janMs = Date.parse('2025-01-01T00:00:00Z')
    const febMs = Date.parse('2025-02-01T00:00:00Z')
    const marMs = Date.parse('2025-03-01T00:00:00Z')
    const ratio = (febMs - janMs) / (marMs - janMs)
    const expected =
      points[0]!.indexTotal + (points[2]!.indexTotal - points[0]!.indexTotal) * ratio
    expect(interpolated.value).toBeCloseTo(expected, 8)
  })

  it('diagnoses wallets and indices missing comparison data', () => {
    const index: MarketIndex = {
      id: 'imoex',
      name: 'Мосбиржа',
      kind: 'amount',
      currency: 'RUB',
      color: '#2563eb',
    }
    const emptyWallet: Account = {
      ...fund,
      id: 'empty',
      name: 'Пустой',
      sortOrder: 3,
    }
    const diagnosis = diagnoseIndexComparison({
      indices: [index],
      indexValues: [{ indexId: index.id, date: '2025-01-01', value: 10 }],
      accounts: [fund, emptyWallet],
      snapshots: [snapshot('s1', '2025-01-01', 100)],
      transfers: [],
      settings,
      selectedIndexIds: [index.id],
      selectedAccountIds: [fund.id, emptyWallet.id],
    })

    expect(diagnosis.walletIssues).toEqual([
      {
        id: emptyWallet.id,
        name: 'Пустой',
        reason: 'нет чек-инов с балансом',
      },
    ])
    expect(diagnosis.indexIssues).toEqual([
      {
        id: index.id,
        name: 'Мосбиржа',
        reason: 'недостаточно общих дат (нужно минимум два чек-ина)',
      },
    ])
    expect(formatComparisonDiagnosis(diagnosis)).toContain('Мосбиржа')
    expect(formatComparisonDiagnosis(diagnosis)).toContain('Пустой')
    expect(
      appendComparisonDiagnosis('Недостаточно данных.', diagnosis),
    ).toContain('Недостаточно данных.')
  })
})
