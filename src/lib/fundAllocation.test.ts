import { describe, expect, it } from 'vitest'
import type { AccountFund } from '../types/wallet'
import {
  allocateInboundTransfer,
  allocateOutboundTransfer,
  FREE_MONEY_SYSTEM_KEY,
  isFundActiveForTransfer,
  nextLowerUserPriority,
} from './fundAllocation'

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

const free = fund({
  id: 'free',
  name: 'Свободные деньги',
  monthlyTarget: 0,
  priority: -1_000_000,
  systemKey: FREE_MONEY_SYSTEM_KEY,
})

describe('allocateInboundTransfer', () => {
  it('fills highest priority up to monthly remaining, rest to free money', () => {
    const funds = [
      fund({ id: 'rent', name: 'Аренда', monthlyTarget: 30_000, priority: 2 }),
      fund({ id: 'food', name: 'Еда', monthlyTarget: 20_000, priority: 1 }),
      free,
    ]
    const alloc = allocateInboundTransfer(40_000, funds, {})
    expect(alloc.rent).toBe(30_000)
    expect(alloc.food).toBe(10_000)
    expect(alloc.free).toBe(0)
  })

  it('sends overflow to free money when targets are met', () => {
    const funds = [
      fund({ id: 'a', name: 'A', monthlyTarget: 5_000, priority: 2 }),
      free,
    ]
    const alloc = allocateInboundTransfer(12_000, funds, { a: 5_000 })
    expect(alloc.a).toBe(0)
    expect(alloc.free).toBe(12_000)
  })

  it('respects already filled amount this month', () => {
    const funds = [
      fund({ id: 'a', name: 'A', monthlyTarget: 10_000, priority: 1 }),
      free,
    ]
    const alloc = allocateInboundTransfer(8_000, funds, { a: 7_000 })
    expect(alloc.a).toBe(3_000)
    expect(alloc.free).toBe(5_000)
  })
})

describe('allocateOutboundTransfer', () => {
  it('takes from free money first, then lowest priority', () => {
    const funds = [
      fund({ id: 'high', name: 'High', priority: 2 }),
      fund({ id: 'low', name: 'Low', priority: 1 }),
      free,
    ]
    const alloc = allocateOutboundTransfer(8_000, funds, {
      free: 5_000,
      high: 10_000,
      low: 4_000,
    })
    expect(alloc.free).toBe(5_000)
    expect(alloc.low).toBe(3_000)
    expect(alloc.high).toBe(0)
  })
})

describe('nextLowerUserPriority', () => {
  it('puts a new fund after existing ones', () => {
    expect(nextLowerUserPriority([fund({ id: 'a', name: 'A', priority: 2 }), free], 'acc')).toBe(1)
  })
})

describe('isFundActiveForTransfer', () => {
  it('ignores a fund created after the transfer', () => {
    const late = fund({
      id: 'late',
      name: 'Late',
      createdAt: '2026-02-01T12:00:00.000Z',
    })
    expect(
      isFundActiveForTransfer(late, {
        date: '2026-01-10',
        createdAt: '2026-01-10T10:00:00.000Z',
      }),
    ).toBe(false)
    expect(isFundActiveForTransfer(free, { date: '2026-01-10' })).toBe(true)
  })

  it('does not let a same-day later fund consume an earlier transfer', () => {
    const late = fund({
      id: 'late',
      name: 'Late',
      createdAt: '2026-01-10T15:00:00.000Z',
    })
    expect(
      isFundActiveForTransfer(late, {
        date: '2026-01-10',
        createdAt: '2026-01-10T10:00:00.000Z',
      }),
    ).toBe(false)
  })

  it('lets a fund receive a transfer posted after it was created', () => {
    const existing = fund({
      id: 'early',
      name: 'Early',
      createdAt: '2026-01-10T09:00:00.000Z',
    })
    expect(
      isFundActiveForTransfer(existing, {
        date: '2026-01-10',
        createdAt: '2026-01-10T11:00:00.000Z',
      }),
    ).toBe(true)
  })

  it('does not give an undated transfer to a fund created later that day', () => {
    const late = fund({
      id: 'late',
      name: 'Late',
      createdAt: '2026-01-10T15:00:00.000Z',
    })
    expect(isFundActiveForTransfer(late, { date: '2026-01-10' })).toBe(false)
  })
})
