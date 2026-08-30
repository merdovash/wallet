import { describe, expect, it } from 'vitest'
import type { BalanceSnapshot } from '../types/wallet'
import { avgMonthlyExpense, shiftIsoDateMonths } from './avgMonthlyExpense'

describe('avgMonthlyExpense', () => {
  it('sums check-in expenses in the last N months and divides by N', () => {
    const snapshots: BalanceSnapshot[] = [
      { id: 's0', date: '2026-04-30', expense: 10_000, lines: [] },
      { id: 's1', date: '2026-05-15', expense: 30_000, lines: [] },
      { id: 's2', date: '2026-06-10', expense: 20_000, lines: [] },
      { id: 's3', date: '2026-07-20', expense: 40_000, lines: [] },
    ]
    const result = avgMonthlyExpense(snapshots, 3, '2026-07-31')
    expect(result.startDate).toBe(shiftIsoDateMonths('2026-07-31', -3))
    expect(result.totalExpense).toBe(90_000)
    expect(result.avgMonthly).toBe(30_000)
  })

  it('excludes expenses on the exclusive start date', () => {
    const start = shiftIsoDateMonths('2026-08-30', -2)
    const snapshots: BalanceSnapshot[] = [
      { id: 'edge', date: start, expense: 99_000, lines: [] },
      { id: 'in', date: '2026-08-01', expense: 10_000, lines: [] },
    ]
    const result = avgMonthlyExpense(snapshots, 2, '2026-08-30')
    expect(result.totalExpense).toBe(10_000)
    expect(result.avgMonthly).toBe(5_000)
  })
})

describe('shiftIsoDateMonths', () => {
  it('shifts calendar months', () => {
    expect(shiftIsoDateMonths('2026-08-30', -3)).toBe('2026-05-30')
  })
})
