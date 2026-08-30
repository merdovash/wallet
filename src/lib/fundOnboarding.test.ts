import { describe, expect, it } from 'vitest'
import {
  draftsFromOnboardingLines,
  formatYearMonthRu,
  meanEnteredAmounts,
  onboardingMonthKeys,
  shiftYearMonth,
  visibleMonthKeys,
} from './fundOnboarding'

describe('onboardingMonthKeys', () => {
  it('starts from the previous calendar month', () => {
    expect(onboardingMonthKeys('2026-08-30', 3)).toEqual(['2026-07', '2026-06', '2026-05'])
  })
})

describe('shiftYearMonth', () => {
  it('crosses the year boundary', () => {
    expect(shiftYearMonth('2026-01', -1)).toBe('2025-12')
  })
})

describe('formatYearMonthRu', () => {
  it('uses nominative month and year', () => {
    expect(formatYearMonthRu('2026-07')).toBe('Июль 2026')
  })
})

describe('visibleMonthKeys', () => {
  const months = ['2026-07', '2026-06', '2026-05', '2026-04']

  it('shows only the latest month until an amount is entered', () => {
    expect(visibleMonthKeys({}, months)).toEqual(['2026-07'])
  })

  it('reveals the previous month after 0 is entered', () => {
    expect(visibleMonthKeys({ '2026-07': '0' }, months)).toEqual(['2026-07', '2026-06'])
  })

  it('reveals another month after the newly shown one is filled', () => {
    expect(visibleMonthKeys({ '2026-07': '10 000', '2026-06': '8' }, months)).toEqual([
      '2026-07',
      '2026-06',
      '2026-05',
    ])
  })
})

describe('meanEnteredAmounts', () => {
  it('is the arithmetic mean including zeros', () => {
    expect(meanEnteredAmounts({ a: '10 000', b: '0', c: '5 000' })).toBe(5_000)
  })

  it('ignores empty fields', () => {
    expect(meanEnteredAmounts({ a: '9 000', b: '' })).toBe(9_000)
  })
})

describe('draftsFromOnboardingLines', () => {
  it('builds funds with mean targets and first line as highest priority', () => {
    const drafts = draftsFromOnboardingLines([
      { id: '1', name: 'Аренда', amounts: { '2026-07': '30 000', '2026-06': '30 000' } },
      { id: '2', name: 'Еда', amounts: { '2026-07': '20 000', '2026-06': '10 000' } },
      { id: '3', name: 'Пусто', amounts: {} },
    ])
    expect(drafts).toEqual([
      { name: 'Аренда', monthlyTarget: 30_000, priority: 2 },
      { name: 'Еда', monthlyTarget: 15_000, priority: 1 },
    ])
  })
})
