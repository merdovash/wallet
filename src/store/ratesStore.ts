import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  CURRENCY_ALIASES,
  fetchCbrRatesForDate,
  needsRateFetch,
  type ParsedCbrRates,
} from '../lib/cbrRates'
import { todayIsoDate } from '../lib/format'

interface RatesState {
  /** rateDate (YYYY-MM-DD) → RUB pivot per unit */
  byDate: Record<string, Record<string, number>>
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
  lastFetchedAt: string | null
  /** Actual CBR rate day for the last successful refresh/ensure of "today". */
  latestRateDate: string | null
  ensureRates: (dates: string[]) => Promise<void>
  refreshDate: (date: string) => Promise<void>
  getPivot: (date: string) => Record<string, number> | null
}

/** In-flight ensureRates so concurrent callers share one load. */
let ensureInFlight: Promise<void> | null = null
let ensureQueuedDates = new Set<string>()

/** Copy proxy quotes (e.g. USDT ← USD) into the pivot map. */
export function expandPivotAliases(
  pivot: Record<string, number>,
): Record<string, number> {
  const next = { ...pivot }
  for (const [alias, target] of Object.entries(CURRENCY_ALIASES)) {
    if (next[alias] == null && next[target] != null) {
      next[alias] = next[target]!
    }
  }
  return next
}

/**
 * Store under the real CBR rateDate, and also under requestDate when they differ
 * so "today" appears in the registry after a refresh (CBR often labels the
 * previous business day).
 */
export function mergeFetchedRates(
  byDate: Record<string, Record<string, number>>,
  requestDate: string,
  rateDate: string,
  pivot: Record<string, number>,
): Record<string, Record<string, number>> {
  const next = { ...byDate, [rateDate]: pivot }
  if (requestDate !== rateDate) {
    next[requestDate] = pivot
  }
  return next
}

async function loadRatesForDate(
  isoDate: string,
  opts?: { forceRefresh?: boolean },
): Promise<ParsedCbrRates & { requestDate: string }> {
  const forceRefresh = opts?.forceRefresh ?? false
  let apiError: string | null = null
  try {
    const params = new URLSearchParams({ date: isoDate })
    if (forceRefresh) params.set('refresh', '1')
    const res = await fetch(`/api/rates?${params.toString()}`, {
      cache: 'no-store',
    })
    if (res.ok) {
      const data = (await res.json()) as {
        requestDate?: string
        rateDate: string
        pivotPerUnit: Record<string, number>
      }
      return {
        requestDate: data.requestDate ?? isoDate,
        rateDate: data.rateDate,
        pivotPerUnit: expandPivotAliases(data.pivotPerUnit),
      }
    }
    try {
      const body = (await res.json()) as { error?: string }
      apiError = body.error ?? `HTTP ${res.status}`
    } catch {
      apiError = `HTTP ${res.status}`
    }
  } catch {
    /* own API unreachable — try direct CBR (works for daily feed in browser) */
  }

  try {
    const parsed = await fetchCbrRatesForDate(isoDate)
    return {
      requestDate: isoDate,
      rateDate: parsed.rateDate,
      pivotPerUnit: expandPivotAliases(parsed.pivotPerUnit),
    }
  } catch (err) {
    const fallback = err instanceof Error ? err.message : 'Не удалось загрузить курсы ЦБ'
    throw new Error(apiError ? `${apiError}; ${fallback}` : fallback)
  }
}

async function loadMissingDates(
  missing: string[],
  seed: Record<string, Record<string, number>>,
): Promise<{
  byDate: Record<string, Record<string, number>>
  latestRateDate: string | null
}> {
  let next = { ...seed }
  let latestRateDate: string | null = null
  const concurrency = 4
  for (let i = 0; i < missing.length; i += concurrency) {
    const chunk = missing.slice(i, i + concurrency)
    const results = await Promise.all(
      chunk.map(async (date) => {
        if (!needsRateFetch(date, next)) return null
        return loadRatesForDate(date)
      }),
    )
    for (const parsed of results) {
      if (!parsed) continue
      next = mergeFetchedRates(next, parsed.requestDate, parsed.rateDate, parsed.pivotPerUnit)
      if (!latestRateDate || parsed.rateDate > latestRateDate) {
        latestRateDate = parsed.rateDate
      }
    }
  }
  return { byDate: next, latestRateDate }
}

export const useRatesStore = create<RatesState>()(
  persist(
    (set, get) => ({
      byDate: {},
      status: 'idle',
      error: null,
      lastFetchedAt: null,
      latestRateDate: null,

      getPivot: (date) => {
        const byDate = get().byDate
        const dates = Object.keys(byDate)
          .filter((d) => d <= date)
          .sort()
        const best = dates[dates.length - 1]
        return best ? byDate[best]! : null
      },

      ensureRates: async (dates) => {
        const unique = [...new Set(dates.filter(Boolean))].sort()
        if (unique.length === 0) unique.push(todayIsoDate())

        for (const d of unique) ensureQueuedDates.add(d)

        if (ensureInFlight) {
          await ensureInFlight
          const stillMissing = [...ensureQueuedDates].filter((d) =>
            needsRateFetch(d, get().byDate),
          )
          if (stillMissing.length === 0) {
            ensureQueuedDates.clear()
            return
          }
        }

        const run = (async () => {
          const requested = [...ensureQueuedDates]
          ensureQueuedDates.clear()
          const missing = requested.filter((d) => needsRateFetch(d, get().byDate))
          if (missing.length === 0) {
            set({ status: 'ready', error: null })
            return
          }

          set({ status: 'loading', error: null })
          try {
            const { byDate, latestRateDate } = await loadMissingDates(missing, get().byDate)
            set({
              byDate,
              status: 'ready',
              error: null,
              lastFetchedAt: new Date().toISOString(),
              latestRateDate: latestRateDate ?? get().latestRateDate,
            })
          } catch (err) {
            set({
              status: 'error',
              error: err instanceof Error ? err.message : 'Не удалось загрузить курсы ЦБ',
            })
          }
        })()

        ensureInFlight = run.finally(() => {
          ensureInFlight = null
        })
        await ensureInFlight
      },

      refreshDate: async (date) => {
        set({ status: 'loading', error: null })
        try {
          const parsed = await loadRatesForDate(date, { forceRefresh: true })
          set({
            byDate: mergeFetchedRates(
              get().byDate,
              parsed.requestDate,
              parsed.rateDate,
              parsed.pivotPerUnit,
            ),
            status: 'ready',
            error: null,
            lastFetchedAt: new Date().toISOString(),
            latestRateDate: parsed.rateDate,
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
      partialize: (state) => ({
        byDate: state.byDate,
        lastFetchedAt: state.lastFetchedAt,
        latestRateDate: state.latestRateDate,
      }),
      merge: (persisted, current) => {
        const p = persisted as Partial<RatesState> | undefined
        const byDate: Record<string, Record<string, number>> = {}
        for (const [date, pivot] of Object.entries(p?.byDate ?? {})) {
          byDate[date] = expandPivotAliases(pivot)
        }
        return {
          ...current,
          ...p,
          byDate,
        }
      },
    },
  ),
)
