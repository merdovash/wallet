import { describe, expect, it } from 'vitest'
import { parseInflationPercentInput, realAnnualizedReturn } from './realReturn'

describe('realAnnualizedReturn', () => {
  it('computes Fisher-style real return', () => {
    expect(realAnnualizedReturn(0.1, 0.08)).toBeCloseTo(0.0185185, 4)
  })

  it('returns null without inflation assumption', () => {
    expect(realAnnualizedReturn(0.1, null)).toBeNull()
  })
})

describe('parseInflationPercentInput', () => {
  it('parses percent strings', () => {
    expect(parseInflationPercentInput('8')).toBeCloseTo(0.08)
    expect(parseInflationPercentInput('8,5')).toBeCloseTo(0.085)
    expect(parseInflationPercentInput('')).toBeNull()
  })
})
