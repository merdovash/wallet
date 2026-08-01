import { describe, expect, it } from 'vitest'
import { toBase } from './currency'
import { formatCurrency } from './format'
import { convertAmount } from '../engine/growthEngine'

describe('currency conversion', () => {
  it('never treats a missing exchange rate as 1:1', () => {
    const converted = toBase(1_000, 'THB', 'RUB', { RUB: 1 })
    expect(Number.isNaN(converted)).toBe(true)
    expect(formatCurrency(converted, 'RUB')).toBe('—')
  })

  it('requires a valid base rate for non-RUB cross conversion', () => {
    const converted = toBase(100, 'USD', 'EUR', { USD: 90 })
    expect(Number.isNaN(converted)).toBe(true)
  })

  it('does not relabel a base amount when the target currency rate is missing', () => {
    const converted = convertAmount(
      100,
      'USD',
      'THB',
      { baseCurrency: 'RUB', exchangeRates: { RUB: 1, USD: 90 } },
    )
    expect(Number.isNaN(converted)).toBe(true)
  })
})
