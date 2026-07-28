import { describe, expect, it } from 'vitest'
import {
  cbrArchiveUrl,
  cbrDateToIso,
  convertViaCbr,
  needsRateFetch,
  parseCbrResponse,
  resolveCurrencyCode,
  resolvePivotForDate,
  shiftIsoDate,
} from './cbrRates'

describe('cbrRates', () => {
  it('parses CBR JSON into RUB pivot per unit', () => {
    const parsed = parseCbrResponse({
      Date: '2026-01-15T11:30:00+03:00',
      Valute: {
        USD: { CharCode: 'USD', Nominal: 1, Value: 78.5711 },
        AMD: { CharCode: 'AMD', Nominal: 100, Value: 20.6587 },
      },
    })
    expect(parsed.rateDate).toBe('2026-01-15')
    expect(parsed.pivotPerUnit.RUB).toBe(1)
    expect(parsed.pivotPerUnit.USD).toBeCloseTo(78.5711)
    expect(parsed.pivotPerUnit.AMD).toBeCloseTo(0.206587)
  })

  it('converts via RUB pivot and aliases USDT to USD', () => {
    const pivot = { RUB: 1, USD: 80, EUR: 100 }
    expect(convertViaCbr(10, 'USD', 'RUB', pivot)).toBe(800)
    expect(convertViaCbr(800, 'RUB', 'USD', pivot)).toBe(10)
    expect(convertViaCbr(10, 'USDT', 'RUB', pivot)).toBe(800)
    expect(resolveCurrencyCode('USDT')).toBe('USD')
  })

  it('builds archive URL and shifts dates', () => {
    expect(cbrArchiveUrl('2026-01-15')).toBe(
      'https://www.cbr-xml-daily.ru/archive/2026/01/15/daily_json.js',
    )
    expect(shiftIsoDate('2026-01-15', -1)).toBe('2026-01-14')
    expect(cbrDateToIso('15.01.2026')).toBe('2026-01-15')
  })

  it('resolves nearest previous pivot for a date', () => {
    const byDate = {
      '2026-01-10': { RUB: 1, USD: 70 },
      '2026-01-14': { RUB: 1, USD: 80 },
    }
    expect(resolvePivotForDate('2026-01-15', byDate)?.USD).toBe(80)
    expect(resolvePivotForDate('2026-01-12', byDate)?.USD).toBe(70)
    expect(resolvePivotForDate('2026-01-01', byDate)).toBeNull()
  })

  it('needsRateFetch refreshes stale "today" but accepts weekend lookback', () => {
    const byDate = {
      '2026-07-20': { RUB: 1, USD: 70 },
    }
    expect(needsRateFetch('2026-07-28', byDate, '2026-07-28')).toBe(true)
    expect(
      needsRateFetch('2026-07-28', { '2026-07-27': { RUB: 1, USD: 80 } }, '2026-07-28'),
    ).toBe(false)
    expect(
      needsRateFetch('2026-01-15', { '2026-01-10': { RUB: 1, USD: 70 } }, '2026-07-28'),
    ).toBe(false)
    expect(
      needsRateFetch('2026-01-15', { '2025-12-01': { RUB: 1, USD: 70 } }, '2026-07-28'),
    ).toBe(true)
  })
})
