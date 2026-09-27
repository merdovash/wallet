import { describe, expect, it } from 'vitest'
import {
  applyFxOverrides,
  baseToRubPerUnit,
  buySellDiffer,
  convertViaDatedFx,
  midRubRate,
  rateInBase,
  rubPerUnitToBase,
} from './fxRates'

describe('fxRates', () => {
  it('uses mid of buy and sell as the valuation rate', () => {
    expect(midRubRate({ buyRate: 80, sellRate: 82 })).toBe(81)
    expect(buySellDiffer(80, 80)).toBe(false)
    expect(buySellDiffer(80, 82)).toBe(true)
  })

  it('converts RUB-per-unit quotes into another base', () => {
    const pivot = { RUB: 1, USD: 80, EUR: 100 }
    expect(rubPerUnitToBase(100, 'RUB', pivot)).toBe(100)
    expect(rubPerUnitToBase(100, 'USD', pivot)).toBe(1.25)
    expect(baseToRubPerUnit(1.25, 'USD', pivot)).toBe(100)
    expect(rateInBase(pivot, 'EUR', 'USD')).toBeCloseTo(1.25)
  })

  it('overlays an override on a CBR day without changing other currencies', () => {
    const byDate = {
      '2026-01-14': { RUB: 1, USD: 80, EUR: 100 },
    }
    const next = applyFxOverrides(byDate, [
      { date: '2026-01-14', currency: 'USD', buyRate: 79, sellRate: 85 },
    ])
    expect(next['2026-01-14']?.USD).toBe(82)
    expect(next['2026-01-14']?.EUR).toBe(100)
    expect(byDate['2026-01-14']?.USD).toBe(80)
  })

  it('creates a date from the nearest CBR pivot when only a manual quote exists', () => {
    const byDate = {
      '2026-01-14': { RUB: 1, USD: 80, EUR: 100 },
    }
    const next = applyFxOverrides(byDate, [
      { date: '2026-01-15', currency: 'USD', buyRate: 90, sellRate: 90 },
    ])
    expect(next['2026-01-15']?.USD).toBe(90)
    expect(next['2026-01-15']?.EUR).toBe(100)
  })
})

describe('convertViaDatedFx', () => {
  it('sells foreign at buy and buys foreign at sell', () => {
    const overrides = [{ date: '2026-03-01', currency: 'USD', buyRate: 80, sellRate: 90 }]
    const pivot = { RUB: 1, USD: 85 }
    expect(convertViaDatedFx(10, 'USD', 'RUB', '2026-03-01', overrides, pivot)).toBe(800)
    expect(convertViaDatedFx(900, 'RUB', 'USD', '2026-03-01', overrides, pivot)).toBe(10)
  })

  it('returns null when there is no dated override', () => {
    expect(convertViaDatedFx(10, 'USD', 'RUB', '2026-03-01', [], { RUB: 1, USD: 85 })).toBeNull()
  })
})
