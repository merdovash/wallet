export interface CbrValute {
  CharCode: string
  Nominal: number
  Value: number
}

export interface CbrDailyResponse {
  Date: string
  Valute: Record<string, CbrValute>
}

export interface ParsedCbrRates {
  /** RUB per 1 unit of currency. */
  pivotPerUnit: Record<string, number>
  /** Actual CBR rate date as YYYY-MM-DD. */
  rateDate: string
}

/** Currencies without a CBR quote map to a proxy. */
export const CURRENCY_ALIASES: Record<string, string> = {
  USDT: 'USD',
}

export function resolveCurrencyCode(code: string): string {
  return CURRENCY_ALIASES[code] ?? code
}

export function parseCbrResponse(data: CbrDailyResponse): ParsedCbrRates {
  const rates: Record<string, number> = { RUB: 1 }

  for (const valute of Object.values(data.Valute)) {
    rates[valute.CharCode] = valute.Value / valute.Nominal
  }

  return { pivotPerUnit: rates, rateDate: cbrDateToIso(data.Date) }
}

/** CBR JSON Date like `2026-01-15T11:30:00+03:00` → `2026-01-15`. */
export function cbrDateToIso(value: string): string {
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/)
  if (match) return match[1]!
  // XML style DD.MM.YYYY
  const ru = value.match(/^(\d{2})\.(\d{2})\.(\d{4})/)
  if (ru) return `${ru[3]}-${ru[2]}-${ru[1]}`
  return value.slice(0, 10)
}

export function cbrDailyUrl(): string {
  return 'https://www.cbr-xml-daily.ru/daily_json.js'
}

/** Historical JSON archive for a calendar date. */
export function cbrArchiveUrl(isoDate: string): string {
  const [y, m, d] = isoDate.split('-')
  return `https://www.cbr-xml-daily.ru/archive/${y}/${m}/${d}/daily_json.js`
}

export function shiftIsoDate(isoDate: string, deltaDays: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const date = new Date(Date.UTC(y!, m! - 1, d!))
  date.setUTCDate(date.getUTCDate() + deltaDays)
  const yy = date.getUTCFullYear()
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(date.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

export function convertViaCbr(
  amount: number,
  from: string,
  to: string,
  pivotPerUnit: Record<string, number>,
): number | null {
  const fromCode = resolveCurrencyCode(from)
  const toCode = resolveCurrencyCode(to)
  if (fromCode === toCode) return amount

  const pivotFrom = fromCode === 'RUB' ? 1 : pivotPerUnit[fromCode]
  const pivotTo = toCode === 'RUB' ? 1 : pivotPerUnit[toCode]

  if (!pivotFrom || !pivotTo) return null

  const amountInPivot = fromCode === 'RUB' ? amount : amount * pivotFrom
  return toCode === 'RUB' ? amountInPivot : amountInPivot / pivotTo
}

/**
 * Fetch CBR rates for `isoDate`. Walks back up to `maxLookback` days on 404
 * (weekends / holidays). Uses today's feed when `isoDate` is today or empty.
 */
export async function fetchCbrRatesForDate(
  isoDate: string,
  opts?: { maxLookback?: number; fetchImpl?: typeof fetch },
): Promise<ParsedCbrRates> {
  const fetchImpl = opts?.fetchImpl ?? fetch
  const maxLookback = opts?.maxLookback ?? 14
  const today = todayUtcIso()

  if (!isoDate || isoDate >= today) {
    const response = await fetchImpl(cbrDailyUrl())
    if (!response.ok) throw new Error(`CBR request failed: ${response.status}`)
    const data = (await response.json()) as CbrDailyResponse
    return parseCbrResponse(data)
  }

  let cursor = isoDate
  for (let i = 0; i <= maxLookback; i += 1) {
    const response = await fetchImpl(cbrArchiveUrl(cursor))
    if (response.ok) {
      const data = (await response.json()) as CbrDailyResponse
      return parseCbrResponse(data)
    }
    if (response.status !== 404) {
      throw new Error(`CBR request failed: ${response.status}`)
    }
    cursor = shiftIsoDate(cursor, -1)
  }

  throw new Error(`CBR rates not found for ${isoDate}`)
}

function todayUtcIso(): string {
  const now = new Date()
  // CBR dates are Moscow calendar dates; for “latest” feed we still use local calendar day.
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Pick the latest cached pivot whose rateDate <= targetDate.
 * Keys of `byDate` are ISO dates of stored rate days.
 */
export function resolvePivotForDate(
  targetDate: string,
  byDate: Record<string, Record<string, number>>,
): Record<string, number> | null {
  const dates = Object.keys(byDate)
    .filter((d) => d <= targetDate)
    .sort()
  const best = dates[dates.length - 1]
  return best ? byDate[best]! : null
}

/** Latest rateDate key that is ≤ targetDate, or null. */
export function nearestRateDate(
  targetDate: string,
  byDate: Record<string, Record<string, number>>,
): string | null {
  const dates = Object.keys(byDate)
    .filter((d) => d <= targetDate)
    .sort()
  return dates[dates.length - 1] ?? null
}

export function daysBetweenIso(fromIso: string, toIso: string): number {
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

/**
 * Whether we still need to fetch rates for `targetDate`.
 * Historical dates tolerate up to 14 days lookback (weekends/holidays).
 * "Today" needs a rate not older than 3 days — otherwise refresh from CBR.
 */
export function needsRateFetch(
  targetDate: string,
  byDate: Record<string, Record<string, number>>,
  today: string = todayUtcIso(),
): boolean {
  const nearest = nearestRateDate(targetDate, byDate)
  if (!nearest) return true
  const gap = daysBetweenIso(nearest, targetDate)
  if (gap < 0) return true
  if (targetDate >= today) return gap > 3
  return gap > 14
}
