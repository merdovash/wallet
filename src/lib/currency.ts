import { convertViaCbr } from './cbrRates'
import type { ExchangeRates } from '../types/wallet'

export const CURRENCY_OPTIONS: { code: string; name: string }[] = [
  { code: 'RUB', name: 'Российский рубль' },
  { code: 'CBK', name: 'Кэшбек (1 = 1 ₽)' },
  { code: 'USD', name: 'Доллар США' },
  { code: 'EUR', name: 'Евро' },
  { code: 'USDT', name: 'Tether (USDT)' },
  { code: 'BYN', name: 'Белорусский рубль' },
  { code: 'AMD', name: 'Армянский драм' },
  { code: 'THB', name: 'Тайский бат' },
  { code: 'GEL', name: 'Грузинский лари' },
]

/**
 * Convert amount to base currency.
 * Prefer CBR RUB-pivot (`pivotPerUnit`); fall back to manual `rates` (base per 1 unit).
 */
export function toBase(
  amount: number,
  fromCurrency: string,
  baseCurrency: string,
  rates: ExchangeRates,
  pivotPerUnit?: Record<string, number> | null,
): number {
  if (fromCurrency === 'CBK' && baseCurrency === 'RUB') return amount
  if (fromCurrency === baseCurrency) return amount

  if (pivotPerUnit && Object.keys(pivotPerUnit).length > 0) {
    const viaCbr = convertViaCbr(amount, fromCurrency, baseCurrency, pivotPerUnit)
    if (viaCbr != null) return viaCbr
  }

  const rate = rates[fromCurrency]
  if (rate == null || !Number.isFinite(rate) || rate <= 0) return Number.NaN
  // Manual rates are expressed as base-currency units per 1 fromCurrency
  // when base is RUB this matches CBR pivot; for other bases treat as relative to base.
  if (baseCurrency === 'RUB') return amount * rate
  const baseRate = rates[baseCurrency]
  if (baseRate == null || !Number.isFinite(baseRate) || baseRate <= 0) return Number.NaN
  return (amount * rate) / baseRate
}

export function currencyLabel(code: string): string {
  return CURRENCY_OPTIONS.find((c) => c.code === code)?.name ?? code
}
