import { describe, expect, it } from 'vitest'
import { expandPivotAliases, mergeFetchedRates } from './ratesStore'

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

describe('mergeFetchedRates', () => {
  it('stores under both CBR rateDate and requestDate', () => {
    const pivot = { RUB: 1, USD: 80 }
    const next = mergeFetchedRates({}, '2026-07-28', '2026-07-27', pivot)
    expect(next['2026-07-27']).toEqual(pivot)
    expect(next['2026-07-28']).toEqual(pivot)
  })
})
