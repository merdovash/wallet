import { getPool, loadEnvFile } from '../db/pool'
import { CURRENCY_ALIASES, fetchCbrRatesForDate } from '../../src/lib/cbrRates'
import { ensureCbrRatesSchema, getNearestRateDay, saveRateDay } from './store'

export interface RatesApiResult {
  requestDate: string
  rateDate: string
  pivotPerUnit: Record<string, number>
  source: 'cache' | 'cbr'
}

function hasDatabaseUrl(): boolean {
  loadEnvFile()
  return Boolean(process.env.DATABASE_URL)
}

/** Copy proxy quotes (e.g. USDT ← USD) into the pivot before caching. */
function expandPivotAliases(pivot: Record<string, number>): Record<string, number> {
  const next = { ...pivot }
  for (const [alias, target] of Object.entries(CURRENCY_ALIASES)) {
    if (next[alias] == null && next[target] != null) {
      next[alias] = next[target]!
    }
  }
  return next
}

async function fetchAndCache(isoDate: string): Promise<RatesApiResult> {
  const fetched = await fetchCbrRatesForDate(isoDate)
  const pivot = expandPivotAliases(fetched.pivotPerUnit)

  if (hasDatabaseUrl()) {
    try {
      const pool = getPool()
      await pool.withConnection(async (query) => {
        await ensureCbrRatesSchema(query)
        await saveRateDay(query, fetched.rateDate, pivot)
      })
    } catch (err) {
      console.error('[rates] Failed to cache CBR day:', err)
    }
  }

  return {
    requestDate: isoDate,
    rateDate: fetched.rateDate,
    pivotPerUnit: pivot,
    source: 'cbr',
  }
}

/**
 * Resolve rates for a calendar date.
 * - Default: DB cache (nearest ≤ date within 14 days), else CBR.
 * - forceRefresh: always hit CBR and overwrite cache (used by «Обновить»).
 */
export async function resolveRatesForDate(
  isoDate: string,
  opts?: { forceRefresh?: boolean },
): Promise<RatesApiResult> {
  if (opts?.forceRefresh) {
    return fetchAndCache(isoDate)
  }

  if (hasDatabaseUrl()) {
    try {
      const pool = getPool()
      return await pool.withConnection(async (query) => {
        await ensureCbrRatesSchema(query)
        const cached = await getNearestRateDay(query, isoDate)
        if (cached) {
          const gap = daysBetween(cached.rateDate, isoDate)
          if (gap >= 0 && gap <= 14) {
            return {
              requestDate: isoDate,
              rateDate: cached.rateDate,
              pivotPerUnit: expandPivotAliases(cached.pivot),
              source: 'cache',
            }
          }
        }
        return fetchAndCache(isoDate)
      })
    } catch (err) {
      console.error('[rates] DB unavailable, fetching CBR directly:', err)
    }
  }

  return fetchAndCache(isoDate)
}

function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.UTC(
    Number(fromIso.slice(0, 4)),
    Number(fromIso.slice(5, 7)) - 1,
    Number(fromIso.slice(8, 10)),
  )
  const b = Date.UTC(
    Number(toIso.slice(0, 4)),
    Number(toIso.slice(5, 7)) - 1,
    Number(toIso.slice(8, 10)),
  )
  return Math.round((b - a) / 86_400_000)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function handleRatesApi(req: any, res: any, pathname: string): Promise<boolean> {
  if (pathname !== '/api/rates') return false
  const method = req.method ?? 'GET'
  if (method !== 'GET') {
    res.statusCode = 405
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ error: 'Method not allowed' }))
    return true
  }

  const url = new URL(req.url ?? '/', 'http://localhost')
  const date = url.searchParams.get('date') ?? ''
  const forceRefresh =
    url.searchParams.get('refresh') === '1' || url.searchParams.get('force') === '1'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.statusCode = 400
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ error: 'Query date=YYYY-MM-DD is required' }))
    return true
  }

  const result = await resolveRatesForDate(date, { forceRefresh })
  res.statusCode = 200
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', forceRefresh ? 'no-store' : 'public, max-age=300')
  res.end(JSON.stringify(result))
  return true
}
