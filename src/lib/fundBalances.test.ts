import { describe, expect, it } from 'vitest'
import type { Account, AccountFund, BalanceSnapshot, Transfer, WalletSettings } from '../types/wallet'
import { FREE_MONEY_SYSTEM_KEY } from './fundAllocation'
import { buildAccountFundsState } from './fundBalances'

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
    kind: 'fund',
    ...partial,
  }
}

function fund(
  partial: Partial<AccountFund> & Pick<AccountFund, 'id' | 'name'>,
): AccountFund {
  return {
    accountId: 'acc',
    monthlyTarget: 10_000,
    priority: 1,
    systemKey: null,
    ...partial,
  }
}

const acc = account({ id: 'acc', name: 'Накопления' })
const op = account({ id: 'op', name: 'Оперативный', kind: 'operational' })

const free = fund({
  id: 'free',
  name: 'Свободные деньги',
  monthlyTarget: 0,
  priority: -1_000_000,
  systemKey: FREE_MONEY_SYSTEM_KEY,
})
const vacation = fund({
  id: 'vac',
  name: 'Отпуск',
  monthlyTarget: 20_000,
  priority: 2,
})
const buffer = fund({
  id: 'buf',
  name: 'Подушка',
  monthlyTarget: 10_000,
  priority: 1,
})

describe('buildAccountFundsState', () => {
  it('puts pre-existing balance into free money', () => {
    const snapshots: BalanceSnapshot[] = [
      { id: 's1', date: '2026-01-01', lines: [{ accountId: 'acc', amount: 50_000 }] },
    ]
    const state = buildAccountFundsState(
      'acc',
      [vacation, buffer, free],
      snapshots,
      [],
      [acc, op],
      settings,
    )
    const byId = Object.fromEntries(state.rows.map((r) => [r.fund.id, r.balance]))
    expect(byId.free).toBeCloseTo(50_000, 6)
    expect(byId.vac).toBeCloseTo(0, 6)
    expect(byId.buf).toBeCloseTo(0, 6)
  })

  it('allocates inbound transfer by priority then free money', () => {
    const snapshots: BalanceSnapshot[] = [
      { id: 's1', date: '2026-01-01', lines: [{ accountId: 'acc', amount: 0 }, { accountId: 'op', amount: 40_000 }] },
      { id: 's2', date: '2026-01-10', lines: [{ accountId: 'acc', amount: 40_000 }, { accountId: 'op', amount: 0 }] },
    ]
    const transfers: Transfer[] = [
      {
        id: 't1',
        date: '2026-01-10',
        fromAccountId: 'op',
        toAccountId: 'acc',
        amount: 40_000,
      },
    ]
    const state = buildAccountFundsState(
      'acc',
      [vacation, buffer, free],
      snapshots,
      transfers,
      [acc, op],
      settings,
    )
    const byId = Object.fromEntries(state.rows.map((r) => [r.fund.id, r.balance]))
    expect(byId.vac).toBeCloseTo(20_000, 6)
    expect(byId.buf).toBeCloseTo(10_000, 6)
    expect(byId.free).toBeCloseTo(10_000, 6)
    expect(state.rows.find((r) => r.fund.id === 'vac')?.filledThisMonth).toBeCloseTo(20_000, 6)
  })

  it('grows envelopes proportionally to their share', () => {
    const snapshots: BalanceSnapshot[] = [
      { id: 's1', date: '2026-01-01', lines: [{ accountId: 'acc', amount: 0 }, { accountId: 'op', amount: 30_000 }] },
      { id: 's2', date: '2026-01-10', lines: [{ accountId: 'acc', amount: 30_000 }, { accountId: 'op', amount: 0 }] },
      { id: 's3', date: '2026-02-01', lines: [{ accountId: 'acc', amount: 33_000 }, { accountId: 'op', amount: 0 }] },
    ]
    const transfers: Transfer[] = [
      {
        id: 't1',
        date: '2026-01-10',
        fromAccountId: 'op',
        toAccountId: 'acc',
        amount: 30_000,
      },
    ]
    const state = buildAccountFundsState(
      'acc',
      [vacation, buffer, free],
      snapshots,
      transfers,
      [acc, op],
      settings,
    )
    const byId = Object.fromEntries(state.rows.map((r) => [r.fund.id, r.balance]))
    expect(byId.vac).toBeCloseTo(22_000, 4)
    expect(byId.buf).toBeCloseTo(11_000, 4)
    expect(byId.free).toBeCloseTo(0, 4)
  })

  it('withdraws from free money first', () => {
    const snapshots: BalanceSnapshot[] = [
      { id: 's1', date: '2026-01-01', lines: [{ accountId: 'acc', amount: 0 }, { accountId: 'op', amount: 30_000 }] },
      { id: 's2', date: '2026-01-10', lines: [{ accountId: 'acc', amount: 30_000 }, { accountId: 'op', amount: 0 }] },
      { id: 's3', date: '2026-01-20', lines: [{ accountId: 'acc', amount: 25_000 }, { accountId: 'op', amount: 5_000 }] },
    ]
    const transfers: Transfer[] = [
      {
        id: 't1',
        date: '2026-01-10',
        fromAccountId: 'op',
        toAccountId: 'acc',
        amount: 30_000,
      },
      {
        id: 't2',
        date: '2026-01-20',
        fromAccountId: 'acc',
        toAccountId: 'op',
        amount: 5_000,
      },
    ]
    const state = buildAccountFundsState(
      'acc',
      [vacation, buffer, free],
      snapshots,
      transfers,
      [acc, op],
      settings,
    )
    const byId = Object.fromEntries(state.rows.map((r) => [r.fund.id, r.balance]))
    expect(byId.vac).toBeCloseTo(20_000, 6)
    expect(byId.buf).toBeCloseTo(5_000, 6)
    expect(byId.free).toBeCloseTo(0, 6)
  })
})
