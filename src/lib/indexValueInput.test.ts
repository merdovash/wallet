import { describe, expect, it } from 'vitest'
import { indexValueInputsDiffer, indexValueToInput, parseIndexValueInput } from './indexValueInput'

describe('indexValueInputsDiffer', () => {
  it('ignores thousand separators for the same number', () => {
    expect(indexValueInputsDiffer('1 000', '1000', 'amount')).toBe(false)
  })

  it('detects a changed level', () => {
    expect(indexValueInputsDiffer('1000', '1001', 'amount')).toBe(true)
  })

  it('compares annual rates in percentage points', () => {
    expect(indexValueInputsDiffer(indexValueToInput(0.14, 'annual_rate'), '14', 'annual_rate')).toBe(
      false,
    )
    expect(parseIndexValueInput('14,5', 'annual_rate')).toBeCloseTo(0.145)
  })
})
