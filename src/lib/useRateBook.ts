import { useMemo } from 'react'
import { applyFxOverrides } from './fxRates'
import { useRatesStore } from '../store/ratesStore'
import { useWalletStore } from '../store/walletStore'
import type { RateBook } from '../engine/growthEngine'

/** CBR book with manual buy/sell mids applied. Use for all valuation. */
export function useRateBook(): RateBook {
  const byDate = useRatesStore((s) => s.byDate)
  const overrides = useWalletStore((s) => s.fxOverrides)
  return useMemo(() => applyFxOverrides(byDate, overrides), [byDate, overrides])
}
