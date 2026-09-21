import { describe, expect, it } from 'vitest'
import type { ManualRate, WalletSettings } from '../types/wallet'
import { convertForExchange, convertViaManualRate, manualRateFor } from './manualRates'

const settings: WalletSettings = {
  baseCurrency: 'RUB',
  exchangeRates: { RUB: 1, USD: 90 },
}

const rates: ManualRate[] = [
  { fromCurrency: 'USD', toCurrency: 'RUB', rate: 100 },
  { fromCurrency: 'USDT', toCurrency: 'THB', rate: 32 },
]

describe('manualRateFor', () => {
  it('returns the direct pair rate', () => {
    expect(manualRateFor('USD', 'RUB', rates)).toBe(100)
    expect(manualRateFor('USDT', 'THB', rates)).toBe(32)
  })

  it('returns the inverse pair rate as 1/rate', () => {
    expect(manualRateFor('RUB', 'USD', rates)).toBeCloseTo(0.01)
    expect(manualRateFor('THB', 'USDT', rates)).toBeCloseTo(1 / 32)
  })

  it('returns 1 for the same currency and null for unknown pairs', () => {
    expect(manualRateFor('EUR', 'EUR', rates)).toBe(1)
    expect(manualRateFor('EUR', 'RUB', rates)).toBeNull()
  })
})

describe('convertViaManualRate', () => {
  it('multiplies by the pair rate', () => {
    expect(convertViaManualRate(50, 'USD', 'RUB', rates)).toBe(5000)
    expect(convertViaManualRate(3200, 'THB', 'USDT', rates)).toBeCloseTo(100)
  })

  it('returns null when the pair is not set', () => {
    expect(convertViaManualRate(50, 'EUR', 'RUB', rates)).toBeNull()
  })
})

describe('convertForExchange', () => {
  it('prefers the manual rate over the official conversion', () => {
    expect(convertForExchange(10, 'USD', 'RUB', rates, settings, '2026-03-01')).toBe(1000)
  })

  it('falls back to the official conversion when there is no manual pair', () => {
    expect(convertForExchange(10, 'USD', 'RUB', [], settings, '2026-03-01')).toBe(900)
  })

  it('uses the rate book when provided and there is no manual pair', () => {
    const rateBook = { '2026-03-01': { RUB: 1, USD: 95 } }
    expect(
      convertForExchange(10, 'USD', 'RUB', [], settings, '2026-03-01', rateBook),
    ).toBe(950)
  })

  it('returns null when no conversion is possible', () => {
    expect(convertForExchange(10, 'XXX', 'RUB', [], settings, '2026-03-01')).toBeNull()
  })
})
