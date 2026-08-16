import { describe, expect, it } from 'vitest'
import type { BalanceSnapshot } from '../types/wallet'
import {
  buildCheckInReminderStatus,
  formatDaysRu,
  normalizeCheckInIntervalDays,
} from './checkInReminder'

function snap(date: string): BalanceSnapshot {
  return { id: date, date, lines: [] }
}

describe('normalizeCheckInIntervalDays', () => {
  it('falls back for invalid values', () => {
    expect(normalizeCheckInIntervalDays(NaN)).toBe(7)
    expect(normalizeCheckInIntervalDays(0)).toBe(7)
    expect(normalizeCheckInIntervalDays(-1)).toBe(7)
  })

  it('clamps and rounds', () => {
    expect(normalizeCheckInIntervalDays(7.4)).toBe(7)
    expect(normalizeCheckInIntervalDays(400)).toBe(365)
  })
})

describe('buildCheckInReminderStatus', () => {
  it('reports empty when there are no snapshots', () => {
    expect(buildCheckInReminderStatus([], 7, '2026-08-16')).toEqual({
      kind: 'empty',
      intervalDays: 7,
    })
  })

  it('reports ok within interval', () => {
    expect(
      buildCheckInReminderStatus([snap('2026-08-14')], 7, '2026-08-16'),
    ).toEqual({
      kind: 'ok',
      intervalDays: 7,
      latestDate: '2026-08-14',
      daysSince: 2,
      daysUntilDue: 5,
    })
  })

  it('reports due when interval elapsed', () => {
    expect(
      buildCheckInReminderStatus([snap('2026-08-01')], 7, '2026-08-16'),
    ).toEqual({
      kind: 'due',
      intervalDays: 7,
      latestDate: '2026-08-01',
      daysSince: 15,
      daysOverdue: 8,
    })
  })

  it('treats exact interval boundary as due', () => {
    expect(
      buildCheckInReminderStatus([snap('2026-08-09')], 7, '2026-08-16'),
    ).toMatchObject({ kind: 'due', daysSince: 7, daysOverdue: 0 })
  })
})

describe('formatDaysRu', () => {
  it('declines correctly', () => {
    expect(formatDaysRu(1)).toBe('1 день')
    expect(formatDaysRu(2)).toBe('2 дня')
    expect(formatDaysRu(5)).toBe('5 дней')
    expect(formatDaysRu(11)).toBe('11 дней')
    expect(formatDaysRu(21)).toBe('21 день')
  })
})
