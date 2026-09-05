import { describe, expect, it } from 'vitest'
import type { Account, WalletSettings } from '../types/wallet'
import {
  transferAbsorbsOnSource,
  transferBoundaryFlowBase,
  transferLegNative,
  transferReceivedAmount,
  transferSpreadBase,
} from './transferAmounts'

const settings: WalletSettings = {
  baseCurrency: 'RUB',
  exchangeRates: { RUB: 1, USD: 90 },
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

describe('transferReceivedAmount', () => {
  it('uses toAmount when set', () => {
    const from = account({ id: 'a', name: 'A', currency: 'USD' })
    const to = account({ id: 'b', name: 'B' })
    expect(
      transferReceivedAmount(
        { date: '2026-03-01', fromAccountId: 'a', toAccountId: 'b', amount: 100, toAmount: 8500 },
        from,
        to,
        settings,
      ),
    ).toBe(8500)
  })

  it('falls back to official FX when toAmount is omitted', () => {
    const from = account({ id: 'a', name: 'A', currency: 'USD' })
    const to = account({ id: 'b', name: 'B' })
    expect(
      transferReceivedAmount(
        { date: '2026-03-01', fromAccountId: 'a', toAccountId: 'b', amount: 100 },
        from,
        to,
        settings,
      ),
    ).toBe(9000)
  })
})

describe('transferSpreadBase', () => {
  it('is negative when the receive side is worse than the official rate', () => {
    const from = account({ id: 'a', name: 'A', currency: 'USD', kind: 'investment' })
    const to = account({ id: 'b', name: 'B' })
    expect(
      transferSpreadBase(
        { date: '2026-03-01', fromAccountId: 'a', toAccountId: 'b', amount: 100, toAmount: 8500 },
        from,
        to,
        settings,
      ),
    ).toBeCloseTo(-500)
  })

  it('is positive when the receive side is better than the official rate', () => {
    const from = account({ id: 'a', name: 'A' })
    const to = account({ id: 'b', name: 'B', currency: 'USD' })
    expect(
      transferSpreadBase(
        { date: '2026-03-01', fromAccountId: 'a', toAccountId: 'b', amount: 9000, toAmount: 110 },
        from,
        to,
        settings,
      ),
    ).toBeCloseTo(900)
  })
})

describe('transfer spread accounting', () => {
  it('books the residual on the source when the source is a growth account', () => {
    const from = account({ id: 'inv', name: 'Inv', kind: 'investment' })
    const to = account({ id: 'op', name: 'Op', kind: 'operational' })
    const accounts = [from, to]
    const transfer = {
      date: '2026-03-01',
      fromAccountId: 'inv',
      toAccountId: 'op',
      amount: 1000,
      toAmount: 980,
    }
    expect(transferAbsorbsOnSource(from)).toBe(true)
    expect(transferLegNative('inv', transfer, accounts, settings)).toBeCloseTo(-980)
    expect(transferLegNative('op', transfer, accounts, settings)).toBeCloseTo(980)
    expect(transferBoundaryFlowBase(transfer, from, to, settings)).toBeCloseTo(-980)
  })

  it('books the residual on the destination when the source is not a growth account', () => {
    const from = account({ id: 'op', name: 'Op', kind: 'operational' })
    const to = account({ id: 'inv', name: 'Inv', kind: 'investment' })
    const accounts = [from, to]
    const transfer = {
      date: '2026-03-01',
      fromAccountId: 'op',
      toAccountId: 'inv',
      amount: 1000,
      toAmount: 980,
    }
    expect(transferAbsorbsOnSource(from)).toBe(false)
    expect(transferLegNative('op', transfer, accounts, settings)).toBeCloseTo(-1000)
    expect(transferLegNative('inv', transfer, accounts, settings)).toBeCloseTo(1000)
    expect(transferBoundaryFlowBase(transfer, from, to, settings)).toBeCloseTo(1000)
  })
})
