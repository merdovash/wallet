import { describe, expect, it } from 'vitest'
import type { BalanceSnapshot } from '../types/wallet'
import { planAccountTodayCheckIn } from './accountTodayCheckIn'

describe('planAccountTodayCheckIn', () => {
  it('creates a new check-in when the date has none', () => {
    const snapshots: BalanceSnapshot[] = [
      {
        id: 's1',
        date: '2026-08-01',
        lines: [{ accountId: 'a', amount: 100 }],
      },
    ]
    expect(planAccountTodayCheckIn('a', 150, '2026-08-29', snapshots)).toEqual({
      action: 'create',
      date: '2026-08-29',
      lines: [{ accountId: 'a', amount: 150 }],
    })
  })

  it('merges into the existing snapshot for the same date', () => {
    const snapshots: BalanceSnapshot[] = [
      {
        id: 'today',
        date: '2026-08-29',
        origin: 'manual',
        income: 10,
        expense: 5,
        lines: [
          { accountId: 'a', amount: 100 },
          { accountId: 'b', amount: 200 },
        ],
      },
    ]
    expect(planAccountTodayCheckIn('b', 250, '2026-08-29', snapshots)).toEqual({
      action: 'update',
      snapshotId: 'today',
      lines: [{ accountId: 'b', amount: 250 }],
    })
  })

  it('adds a new account line to a same-day transfer check-in without replacing it', () => {
    const snapshots: BalanceSnapshot[] = [
      {
        id: 'tr',
        date: '2026-08-29',
        origin: 'transfer',
        lines: [
          { accountId: 'a', amount: 80 },
          { accountId: 'b', amount: 20 },
        ],
      },
    ]
    expect(planAccountTodayCheckIn('c', 40, '2026-08-29', snapshots)).toEqual({
      action: 'update',
      snapshotId: 'tr',
      lines: [{ accountId: 'c', amount: 40 }],
    })
  })
})
