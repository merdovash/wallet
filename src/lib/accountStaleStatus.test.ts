import { describe, expect, it } from 'vitest'
import type { Account, BalanceSnapshot } from '../types/wallet'
import {
  accountIdsInLatestCheckIn,
  buildAccountStaleStatuses,
  formatStaleDays,
} from './accountStaleStatus'

function account(id: string): Account {
  return {
    id,
    name: id,
    currency: 'RUB',
    color: '#2563eb',
    archived: false,
    sortOrder: 0,
    kind: 'operational',
  }
}

describe('accountStaleStatus', () => {
  it('marks accounts missing from the latest check-in', () => {
    const snapshots: BalanceSnapshot[] = [
      {
        id: 's1',
        date: '2026-01-01',
        lines: [
          { accountId: 'a', amount: 1 },
          { accountId: 'b', amount: 2 },
        ],
      },
      {
        id: 's2',
        date: '2026-01-10',
        lines: [{ accountId: 'a', amount: 3 }],
      },
    ]
    expect([...accountIdsInLatestCheckIn(snapshots)]).toEqual(['a'])
    const statuses = buildAccountStaleStatuses([account('a'), account('b')], snapshots)
    expect(statuses.get('a')?.missingFromLatestCheckIn).toBe(false)
    expect(statuses.get('a')?.daysSinceRecorded).toBe(0)
    expect(statuses.get('b')?.missingFromLatestCheckIn).toBe(true)
    expect(statuses.get('b')?.daysSinceRecorded).toBe(9)
  })

  it('formats stale day labels', () => {
    expect(formatStaleDays(0)).toContain('последнем')
    expect(formatStaleDays(1)).toBe('1 день назад')
    expect(formatStaleDays(3)).toBe('3 дня назад')
    expect(formatStaleDays(11)).toBe('11 дней назад')
  })
})
