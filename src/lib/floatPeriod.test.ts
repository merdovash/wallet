import { describe, expect, it } from 'vitest'
import { daysInPeriod, floatDayInPeriod } from './floatPeriod'

const range = { startDate: '2026-07-29', endDate: '2026-08-29' }

describe('floatDayInPeriod', () => {
  it('keeps every day when there is no range', () => {
    expect(floatDayInPeriod('2020-01-01', null)).toBe(true)
  })

  it('includes the period bounds', () => {
    expect(floatDayInPeriod('2026-07-29', range)).toBe(true)
    expect(floatDayInPeriod('2026-08-29', range)).toBe(true)
  })

  it('drops days outside the period', () => {
    expect(floatDayInPeriod('2026-07-28', range)).toBe(false)
    expect(floatDayInPeriod('2026-08-30', range)).toBe(false)
  })
})

describe('daysInPeriod', () => {
  it('filters a month down to days inside the range', () => {
    const days = [{ date: '2026-07-15' }, { date: '2026-08-01' }, { date: '2026-09-01' }]
    expect(daysInPeriod(days, range).map((d) => d.date)).toEqual(['2026-08-01'])
  })
})
