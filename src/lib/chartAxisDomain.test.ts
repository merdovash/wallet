import { describe, expect, it } from 'vitest'
import { paddedDataDomain } from './chartAxisDomain'

describe('paddedDataDomain', () => {
  it('adds padding around a range without forcing zero', () => {
    const [lo, hi] = paddedDataDomain([1_000_000, 1_050_000])
    expect(lo).toBeGreaterThan(990_000)
    expect(hi).toBeLessThan(1_060_000)
    expect(lo).toBeGreaterThan(0)
  })

  it('pads a flat series', () => {
    const [lo, hi] = paddedDataDomain([100, 100])
    expect(lo).toBeLessThan(100)
    expect(hi).toBeGreaterThan(100)
  })
})
