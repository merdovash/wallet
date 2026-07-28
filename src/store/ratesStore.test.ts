import { describe, expect, it } from 'vitest'
import { expandPivotAliases } from '../store/ratesStore'

describe('expandPivotAliases', () => {
  it('copies USD quote to USDT', () => {
    expect(expandPivotAliases({ RUB: 1, USD: 90 })).toEqual({
      RUB: 1,
      USD: 90,
      USDT: 90,
    })
  })

  it('keeps an explicit USDT quote', () => {
    expect(expandPivotAliases({ RUB: 1, USD: 90, USDT: 89 })).toEqual({
      RUB: 1,
      USD: 90,
      USDT: 89,
    })
  })
})
