import { describe, expect, it } from 'vitest'
import type { Account, WalletSettings } from '../types/wallet'
import type { PeriodReturnAccountLine } from './monthlyReturns'
import { buildGrowthFxBreakdown } from './growthFxBreakdown'

const settings: WalletSettings = {
  baseCurrency: 'RUB',
  exchangeRates: { RUB: 1, USD: 90 },
}

function line(partial: Partial<PeriodReturnAccountLine> & Pick<PeriodReturnAccountLine, 'accountId'>): PeriodReturnAccountLine {
  return {
    name: partial.name ?? partial.accountId,
    kind: 'fund',
    kindLabel: 'Фонд',
    currency: 'RUB',
    startBalance: 0,
    endBalance: 0,
    startBase: 0,
    endBase: 0,
    balanceChangeBase: 0,
    transfersBase: 0,
    growthBase: 0,
    ...partial,
  }
}

describe('buildGrowthFxBreakdown', () => {
  it('splits native growth and FX revaluation of opening balance', () => {
    const accounts: Account[] = [
      {
        id: 'usd',
        name: 'USD fund',
        currency: 'USD',
        color: '#2563eb',
        archived: false,
        sortOrder: 0,
        kind: 'fund',
      },
    ]
    const included = [
      line({
        accountId: 'usd',
        name: 'USD fund',
        currency: 'USD',
        startBalance: 10,
        endBalance: 11,
        growthBase: 2000,
      }),
    ]
    const breakdown = buildGrowthFxBreakdown(
      included,
      accounts,
      [],
      [],
      settings,
      '2026-01-01',
      '2026-02-01',
      {
        '2026-01-01': { RUB: 1, USD: 90 },
        '2026-02-01': { RUB: 1, USD: 100 },
      },
    )
    expect(breakdown).not.toBeNull()
    expect(breakdown!.quantityEffectBase).toBeCloseTo(100)
    expect(breakdown!.fxEffectBase).toBeCloseTo(100)
    expect(breakdown!.totalGrowth).toBeCloseTo(2000)
    expect(
      breakdown!.quantityEffectBase + breakdown!.fxEffectBase + breakdown!.transferTimingBase,
    ).toBeCloseTo(breakdown!.totalGrowth, 4)
  })

  it('puts base-currency growth entirely in quantity effect', () => {
    const accounts: Account[] = [
      {
        id: 'rub',
        name: 'RUB fund',
        currency: 'RUB',
        color: '#2563eb',
        archived: false,
        sortOrder: 0,
        kind: 'fund',
      },
    ]
    const included = [
      line({
        accountId: 'rub',
        currency: 'RUB',
        startBalance: 1000,
        endBalance: 1100,
        growthBase: 100,
      }),
    ]
    const breakdown = buildGrowthFxBreakdown(
      included,
      accounts,
      [],
      [],
      settings,
      '2026-01-01',
      '2026-02-01',
    )
    expect(breakdown!.quantityEffectBase).toBe(100)
    expect(breakdown!.fxEffectBase).toBe(0)
    expect(breakdown!.transferTimingBase).toBe(0)
  })
})
