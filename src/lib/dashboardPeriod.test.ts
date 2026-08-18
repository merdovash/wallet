import { describe, expect, it } from 'vitest'
import {
  resolveCustomPeriod,
  resolveDashboardPeriod,
  shiftIsoMonths,
  slicePeriodSeries,
} from './dashboardPeriod'
import type { TotalPoint } from '../types/wallet'

describe('shiftIsoMonths', () => {
  it('shifts back whole months', () => {
    expect(shiftIsoMonths('2026-05-15', -1)).toBe('2026-04-15')
    expect(shiftIsoMonths('2026-05-15', -3)).toBe('2026-02-15')
    expect(shiftIsoMonths('2026-05-15', -12)).toBe('2025-05-15')
  })

  it('clamps day to target month length', () => {
    expect(shiftIsoMonths('2026-03-31', -1)).toBe('2026-02-28')
    expect(shiftIsoMonths('2026-07-31', -1)).toBe('2026-06-30')
  })
})

describe('resolveDashboardPeriod', () => {
  const dates = ['2025-06-01', '2025-12-01', '2026-03-01', '2026-04-01', '2026-05-01']

  it('returns full history for "all"', () => {
    expect(resolveDashboardPeriod('all', dates)).toEqual({
      startDate: '2025-06-01',
      endDate: '2026-05-01',
    })
  })

  it('picks latest check-in on or before end − N months', () => {
    expect(resolveDashboardPeriod('1m', dates)).toEqual({
      startDate: '2026-04-01',
      endDate: '2026-05-01',
    })
    // 3 months before 2026-05-01 is 2026-02-01; the latest check-in on or
    // before that date is 2025-12-01 — the period covers at least a quarter.
    expect(resolveDashboardPeriod('3m', dates)).toEqual({
      startDate: '2025-12-01',
      endDate: '2026-05-01',
    })
  })

  it('falls back to first check-in when history is shorter than the preset', () => {
    expect(resolveDashboardPeriod('1y', ['2026-03-01', '2026-05-01'])).toEqual({
      startDate: '2026-03-01',
      endDate: '2026-05-01',
    })
  })

  it('snaps a custom calendar range onto check-in dates', () => {
    expect(
      resolveCustomPeriod('2026-02-10', '2026-04-20', dates),
    ).toEqual({
      startDate: '2025-12-01',
      endDate: '2026-04-01',
    })
  })

  it('swaps inverted custom dates and expands a collapsed range', () => {
    expect(resolveCustomPeriod('2026-05-01', '2026-05-01', dates)).toEqual({
      startDate: '2026-04-01',
      endDate: '2026-05-01',
    })
    expect(
      resolveDashboardPeriod('custom', dates, {
        startDate: '2026-03-15',
        endDate: '2026-04-15',
      }),
    ).toEqual({
      startDate: '2026-03-01',
      endDate: '2026-04-01',
    })
  })

  it('returns null when fewer than two check-ins', () => {
    expect(resolveDashboardPeriod('1m', ['2026-05-01'])).toBeNull()
    expect(resolveDashboardPeriod('all', [])).toBeNull()
    expect(resolveDashboardPeriod('custom', dates, { startDate: '', endDate: '' })).toBeNull()
  })
})

describe('slicePeriodSeries', () => {
  const series: TotalPoint[] = [
    { date: '2026-01-01', total: 100, growth: 0 },
    { date: '2026-02-01', total: 110, growth: 10 },
    { date: '2026-03-01', total: 125, growth: 25 },
    { date: '2026-04-01', total: 120, growth: 20 },
  ]

  it('slices to range and rebases growth to range start', () => {
    const out = slicePeriodSeries(series, { startDate: '2026-02-01', endDate: '2026-04-01' })
    expect(out).toEqual([
      { date: '2026-02-01', total: 110, growth: 0 },
      { date: '2026-03-01', total: 125, growth: 15 },
      { date: '2026-04-01', total: 120, growth: 10 },
    ])
  })

  it('keeps series as-is for full range', () => {
    const out = slicePeriodSeries(series, { startDate: '2026-01-01', endDate: '2026-04-01' })
    expect(out).toEqual(series)
  })
})
