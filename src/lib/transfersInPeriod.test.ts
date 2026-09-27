import { describe, expect, it } from 'vitest'
import { hasTransfersInPeriod } from './transfersInPeriod'

const transfers = [
  { date: '2026-02-01', fromAccountId: 'a', toAccountId: 'b' },
  { date: '2026-04-01', fromAccountId: 'b', toAccountId: 'c' },
]

describe('hasTransfersInPeriod', () => {
  it('is false when there are no transfers', () => {
    expect(hasTransfersInPeriod([], { startDate: '2026-01-01', endDate: '2026-12-31' })).toBe(false)
  })

  it('counts transfers on both range ends', () => {
    expect(hasTransfersInPeriod(transfers, { startDate: '2026-02-01', endDate: '2026-03-01' })).toBe(
      true,
    )
    expect(hasTransfersInPeriod(transfers, { startDate: '2026-03-01', endDate: '2026-04-01' })).toBe(
      true,
    )
  })

  it('is false when all transfers are outside the range', () => {
    expect(hasTransfersInPeriod(transfers, { startDate: '2026-02-02', endDate: '2026-03-31' })).toBe(
      false,
    )
  })

  it('without a range, any transfer matches', () => {
    expect(hasTransfersInPeriod(transfers, null)).toBe(true)
    expect(hasTransfersInPeriod([], null)).toBe(false)
  })

  it('can restrict to one account', () => {
    expect(
      hasTransfersInPeriod(transfers, { startDate: '2026-01-01', endDate: '2026-12-31' }, 'c'),
    ).toBe(true)
    expect(
      hasTransfersInPeriod(transfers, { startDate: '2026-01-01', endDate: '2026-03-01' }, 'c'),
    ).toBe(false)
  })
})
