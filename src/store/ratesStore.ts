import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  fetchCbrRatesForDate,
  resolvePivotForDate,
  type ParsedCbrRates,
} from '../lib/cbrRates'
import { todayIsoDate } from '../lib/format'

interface RatesState {
  /** rateDate (YYYY-MM-DD) → RUB pivot per unit */
  byDate: Record<string, Record<string, number>>
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
  lastFetchedAt: string | null
  ensureRates: (dates: string[]) => Promise<void>
  refreshDate: (date: string) => Promise<void>
  getPivot: (date: string) => Record<string, number> | null
}

async function loadRatesForDate(isoDate: string): Promise<ParsedCbrRates> {
  try {
    const res = await fetch(`/api/rates?date=${encodeURIComponent(isoDate)}`)
    if (res.ok) {
      const data = (await res.json()) as {
        rateDate: string
        pivotPerUnit: Record<string, number>
      }
      return { rateDate: data.rateDate, pivotPerUnit: data.pivotPerUnit }
    }
  } catch {
    /* fall through to direct CBR */
  }
  return fetchCbrRatesForDate(isoDate)
}

export const useRatesStore = create<RatesState>()(
  persist(
    (set, get) => ({
      byDate: {},
      status: 'idle',
      error: null,
      lastFetchedAt: null,

      getPivot: (date) => resolvePivotForDate(date, get().byDate),

      ensureRates: async (dates) => {
        const unique = [...new Set(dates.filter(Boolean))].sort()
        if (unique.length === 0) unique.push(todayIsoDate())

        const missing = unique.filter((d) => !resolvePivotForDate(d, get().byDate))
        if (missing.length === 0) {
          set({ status: 'ready', error: null })
          return
        }

        set({ status: 'loading', error: null })
        try {
          const next = { ...get().byDate }
          for (const date of missing) {
            // Re-check: a previous fetch in this loop may already cover this date.
            if (resolvePivotForDate(date, next)) continue
            const parsed = await loadRatesForDate(date)
            next[parsed.rateDate] = parsed.pivotPerUnit
          }
          set({
            byDate: next,
            status: 'ready',
            error: null,
            lastFetchedAt: new Date().toISOString(),
          })
        } catch (err) {
          set({
            status: 'error',
            error: err instanceof Error ? err.message : 'Не удалось загрузить курсы ЦБ',
          })
        }
      },

      refreshDate: async (date) => {
        set({ status: 'loading', error: null })
        try {
          const parsed = await loadRatesForDate(date)
          set({
            byDate: { ...get().byDate, [parsed.rateDate]: parsed.pivotPerUnit },
            status: 'ready',
            error: null,
            lastFetchedAt: new Date().toISOString(),
          })
        } catch (err) {
          set({
            status: 'error',
            error: err instanceof Error ? err.message : 'Не удалось загрузить курсы ЦБ',
          })
        }
      },
    }),
    {
      name: 'wallet-cbr-rates',
      partialize: (state) => ({ byDate: state.byDate, lastFetchedAt: state.lastFetchedAt }),
    },
  ),
)
