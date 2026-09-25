import { describe, expect, it } from 'vitest'
import type { Account, BalanceSnapshot, ManualRate, WalletSettings } from '../types/wallet'
import {
  buildExpenseCheckInPlan,
  expenseChargeBase,
  expenseCommission,
  suggestedAccountAmount,
} from './expenseCheckIn'

const settings: WalletSettings = {
  baseCurrency: 'RUB',
  exchangeRates: { RUB: 1, USD: 90 },
}

function account(partial: Partial<Account> & Pick<Account, 'id' | 'name'>): Account {
  return {
    currency: 'RUB',
    color: '#2563eb',
    archived: false,
    sortOrder: 0,
    kind: 'operational',
    ...partial,
  }
}

const rub = account({ id: 'rub', name: 'Карта' })
const usd = account({ id: 'usd', name: 'Валютный', currency: 'USD' })

const snapshots: BalanceSnapshot[] = [
  {
    id: 's1',
    date: '2026-03-01',
    lines: [
      { accountId: 'rub', amount: 10000 },
      { accountId: 'usd', amount: 500 },
    ],
  },
]

const manualRates: ManualRate[] = [{ fromCurrency: 'USD', toCurrency: 'RUB', rate: 100 }]

describe('suggestedAccountAmount', () => {
  it('returns the amount itself for the account currency', () => {
    expect(suggestedAccountAmount(300, 'RUB', rub, manualRates, settings, '2026-03-02')).toBe(300)
  })

  it('converts via the manual rate for a cross-currency expense', () => {
    expect(suggestedAccountAmount(10, 'USD', rub, manualRates, settings, '2026-03-02')).toBe(1000)
  })

  it('falls back to the official rate without a manual pair', () => {
    expect(suggestedAccountAmount(10, 'USD', rub, [], settings, '2026-03-02')).toBe(900)
  })
})

describe('expenseCommission', () => {
  it('is zero for a same-currency expense', () => {
    expect(
      expenseCommission(
        { amount: 300, currency: 'RUB', accountAmount: 300, accountCurrency: 'RUB', date: '2026-03-02' },
        manualRates,
        settings,
      ),
    ).toBe(0)
  })

  it('is the charge minus the manual-rate reference', () => {
    expect(
      expenseCommission(
        { amount: 10, currency: 'USD', accountAmount: 1050, accountCurrency: 'RUB', date: '2026-03-02' },
        manualRates,
        settings,
      ),
    ).toBeCloseTo(50)
  })

  it('falls back to the official rate without a manual pair', () => {
    expect(
      expenseCommission(
        { amount: 10, currency: 'USD', accountAmount: 950, accountCurrency: 'RUB', date: '2026-03-02' },
        [],
        settings,
      ),
    ).toBeCloseTo(50)
  })
})

describe('expenseChargeBase', () => {
  it('returns the charge itself for a base-currency account', () => {
    expect(expenseChargeBase(1050, 'RUB', '2026-03-02', manualRates, settings)).toBe(1050)
  })

  it('converts via the manual rate for a foreign account', () => {
    expect(expenseChargeBase(40, 'USD', '2026-03-02', manualRates, settings)).toBeCloseTo(4000)
  })

  it('converts via the official rate without a manual pair', () => {
    expect(expenseChargeBase(40, 'USD', '2026-03-02', [], settings)).toBeCloseTo(3600)
  })
})

describe('buildExpenseCheckInPlan', () => {
  it('reduces the balance by the expense amount for the same currency', () => {
    const plan = buildExpenseCheckInPlan({
      date: '2026-03-02',
      accountId: 'rub',
      currency: 'RUB',
      amount: 1500,
      accounts: [rub, usd],
      snapshots,
      manualRates,
      settings,
    })
    expect(plan).not.toBeNull()
    expect(plan!.accountAmount).toBe(1500)
    expect(plan!.commission).toBe(0)
    expect(plan!.line).toEqual({ accountId: 'rub', amount: 8500 })
    expect(plan!.expenseBase).toBe(1500)
  })

  it('freezes the commission as charge minus the manual-rate conversion', () => {
    const plan = buildExpenseCheckInPlan({
      date: '2026-03-02',
      accountId: 'rub',
      currency: 'USD',
      amount: 10,
      accountAmount: 1050,
      accounts: [rub, usd],
      snapshots,
      manualRates,
      settings,
    })
    expect(plan).not.toBeNull()
    // Reference: 10 USD × 100 = 1000 ₽, charged 1050 ₽ → commission 50 ₽.
    expect(plan!.commission).toBeCloseTo(50)
    expect(plan!.line).toEqual({ accountId: 'rub', amount: 10000 - 1050 })
    expect(plan!.expenseBase).toBeCloseTo(1050)
  })

  it('uses the official rate as reference when there is no manual pair', () => {
    const plan = buildExpenseCheckInPlan({
      date: '2026-03-02',
      accountId: 'rub',
      currency: 'USD',
      amount: 10,
      accountAmount: 950,
      accounts: [rub, usd],
      snapshots,
      manualRates: [],
      settings,
    })
    expect(plan!.commission).toBeCloseTo(50)
  })

  it('converts the charge into base for a foreign-currency account', () => {
    const plan = buildExpenseCheckInPlan({
      date: '2026-03-02',
      accountId: 'usd',
      currency: 'USD',
      amount: 40,
      accounts: [rub, usd],
      snapshots,
      manualRates,
      settings,
    })
    expect(plan!.accountAmount).toBe(40)
    expect(plan!.line).toEqual({ accountId: 'usd', amount: 460 })
    // 40 USD × 100 (manual rate) = 4000 ₽ external expense.
    expect(plan!.expenseBase).toBeCloseTo(4000)
  })

  it('requires accountAmount for a cross-currency expense', () => {
    const plan = buildExpenseCheckInPlan({
      date: '2026-03-02',
      accountId: 'rub',
      currency: 'USD',
      amount: 10,
      accounts: [rub, usd],
      snapshots,
      manualRates,
      settings,
    })
    expect(plan).toBeNull()
  })
})
