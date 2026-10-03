import { describe, expect, it } from 'vitest'
import {
  evaluateMoneyFormula,
  hasFormulaSyntax,
  sanitizeFormulaInput,
} from './moneyFormula'

describe('hasFormulaSyntax', () => {
  it('detects operators and grouped numbers', () => {
    expect(hasFormulaSyntax('1 000')).toBe(false)
    expect(hasFormulaSyntax('-12,5')).toBe(false)
    expect(hasFormulaSyntax('1 000 + 20')).toBe(true)
    expect(hasFormulaSyntax('12-5')).toBe(true)
    expect(hasFormulaSyntax('(2)')).toBe(true)
  })
})

describe('sanitizeFormulaInput', () => {
  it('keeps numbers, spaces and operators', () => {
    expect(sanitizeFormulaInput('12a + 3₽')).toBe('12 + 3')
    expect(sanitizeFormulaInput('10×2÷4')).toBe('10*2/4')
    expect(sanitizeFormulaInput('1 000,5')).toBe('1 000,5')
  })
})

describe('evaluateMoneyFormula', () => {
  it('evaluates arithmetic with precedence and parentheses', () => {
    expect(evaluateMoneyFormula('2+3*4')).toBe(14)
    expect(evaluateMoneyFormula('(2+3)*4')).toBe(20)
    expect(evaluateMoneyFormula('1 000 + 250')).toBe(1250)
    expect(evaluateMoneyFormula('10/4')).toBe(2.5)
    expect(evaluateMoneyFormula('0,1+0,2')).toBe(0.3)
    expect(evaluateMoneyFormula('2*-3+4')).toBe(-2)
    expect(evaluateMoneyFormula('-(2+3)')).toBe(-5)
    expect(evaluateMoneyFormula('5--3')).toBe(8)
  })

  it('accepts a plain amount', () => {
    expect(evaluateMoneyFormula('1 000,50')).toBe(1000.5)
    expect(evaluateMoneyFormula('12.')).toBe(12)
  })

  it('rejects invalid expressions', () => {
    expect(evaluateMoneyFormula('')).toBeNull()
    expect(evaluateMoneyFormula('100+')).toBeNull()
    expect(evaluateMoneyFormula('10/0')).toBeNull()
    expect(evaluateMoneyFormula('10/(2-2)')).toBeNull()
    expect(evaluateMoneyFormula('5++5')).toBeNull()
    expect(evaluateMoneyFormula('()')).toBeNull()
    expect(evaluateMoneyFormula('5-10', { allowNegative: false })).toBeNull()
    expect(evaluateMoneyFormula('5-3', { allowNegative: false })).toBe(2)
  })
})
