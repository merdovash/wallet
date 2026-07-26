import { describe, expect, it } from 'vitest'
import { parseMoneyInput, sanitizeMoneyInput } from './moneyInput'

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

describe('parseMoneyInput', () => {
  it('parses comma and dot decimals', () => {
    expect(parseMoneyInput('12,5')).toBe(12.5)
    expect(parseMoneyInput('12.5')).toBe(12.5)
    expect(parseMoneyInput('')).toBeNull()
    expect(parseMoneyInput('-')).toBeNull()
  })
})
