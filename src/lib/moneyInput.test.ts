import { describe, expect, it } from 'vitest'
import {
  caretPosAfterMoneyUnits,
  formatMoneyInput,
  moneySignificantCount,
  normalizeMoneyInput,
  parseMoneyInput,
  sanitizeMoneyInput,
} from './moneyInput'

describe('sanitizeMoneyInput', () => {
  it('strips letters and extra symbols', () => {
    expect(sanitizeMoneyInput('12a3b')).toBe('123')
    expect(sanitizeMoneyInput('1 000,50₽')).toBe('1000,50')
    expect(sanitizeMoneyInput('abc')).toBe('')
  })

  it('keeps a single decimal separator', () => {
    expect(sanitizeMoneyInput('12.34.56')).toBe('12.3456')
    expect(sanitizeMoneyInput('12,34,56')).toBe('12,3456')
    expect(sanitizeMoneyInput('12.')).toBe('12.')
  })

  it('allows a leading minus when enabled', () => {
    expect(sanitizeMoneyInput('-12,5')).toBe('-12,5')
    expect(sanitizeMoneyInput('12-5')).toBe('125')
    expect(sanitizeMoneyInput('-12,5', { allowNegative: false })).toBe('12,5')
  })
})

describe('formatMoneyInput', () => {
  it('groups integer part into triads', () => {
    expect(formatMoneyInput('1000')).toBe('1 000')
    expect(formatMoneyInput('1234567,89')).toBe('1 234 567,89')
    expect(formatMoneyInput('-25000.5')).toBe('-25 000.5')
    expect(formatMoneyInput('12.')).toBe('12.')
    expect(formatMoneyInput('')).toBe('')
  })
})

describe('normalizeMoneyInput', () => {
  it('sanitizes and groups in one step', () => {
    expect(normalizeMoneyInput('1 234a56,7')).toBe('123 456,7')
  })
})

describe('caret helpers', () => {
  it('counts significant characters ignoring spaces', () => {
    expect(moneySignificantCount('1 000,5')).toBe(6)
  })

  it('maps significant count back into formatted caret', () => {
    expect(caretPosAfterMoneyUnits('1 000', 1)).toBe(1)
    expect(caretPosAfterMoneyUnits('1 000', 2)).toBe(3)
    expect(caretPosAfterMoneyUnits('1 000', 4)).toBe(5)
  })
})

describe('parseMoneyInput', () => {
  it('parses comma and dot decimals', () => {
    expect(parseMoneyInput('12,5')).toBe(12.5)
    expect(parseMoneyInput('12.5')).toBe(12.5)
    expect(parseMoneyInput('')).toBeNull()
    expect(parseMoneyInput('-')).toBeNull()
  })

  it('parses grouped thousands', () => {
    expect(parseMoneyInput('1 000,50')).toBe(1000.5)
    expect(parseMoneyInput('1\u00A0234')).toBe(1234)
  })
})
