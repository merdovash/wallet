import {
  buildTotalSeries,
  growthCapitalFlows,
  type RateBook,
} from '../engine/growthEngine'
import type {
  Account,
  BalanceSnapshot,
  IndexValue,
  MarketIndex,
  Transfer,
  WalletSettings,
} from '../types/wallet'

export interface IndexComparisonPoint {
  date: string
  actualTotal: number
  indexTotal: number
  actualGrowth: number
  indexGrowth: number
  difference: number
}

const DAY_MS = 86_400_000

function daysBetween(start: string, end: string): number {
  const a = Date.parse(`${start}T00:00:00Z`)
  const b = Date.parse(`${end}T00:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0
  return Math.max(0, Math.round((b - a) / DAY_MS))
}

function valueOnDate(values: IndexValue[], date: string): number | null {
  let current: number | null = null
  for (const item of values) {
    if (item.date > date) break
    current = item.value
  }
  return current
}

function normalizedValues(indexId: string, values: IndexValue[]): IndexValue[] {
  const byDate = new Map<string, IndexValue>()
  for (const item of values) {
    if (item.indexId === indexId && Number.isFinite(item.value)) byDate.set(item.date, item)
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

export function buildIndexComparison(input: {
  index: MarketIndex
  indexValues: IndexValue[]
  accounts: Account[]
  snapshots: BalanceSnapshot[]
  transfers: Transfer[]
  settings: WalletSettings
  rateBook?: RateBook
  range?: { startDate: string; endDate: string } | null
}): IndexComparisonPoint[] {
  const observations = normalizedValues(input.index.id, input.indexValues)
  if (observations.length === 0) return []

  const actualAll = buildTotalSeries(
    input.accounts,
    input.snapshots,
    input.settings,
    input.rateBook,
    input.transfers,
  )
  const lower = input.range?.startDate
  const upper = input.range?.endDate
  const actual = actualAll.filter(
    (point) =>
      (!lower || point.date >= lower) &&
      (!upper || point.date <= upper) &&
      valueOnDate(observations, point.date) != null,
  )
  if (actual.length === 0) return []

  const start = actual[0]!
  const end = actual[actual.length - 1]!
  const flows = growthCapitalFlows(
    start.date,
    end.date,
    input.snapshots,
    input.transfers,
    input.accounts,
    input.settings,
    input.rateBook,
  )
  const flowByDate = new Map<string, number>()
  for (const flow of flows) {
    flowByDate.set(flow.date, (flowByDate.get(flow.date) ?? 0) + flow.amount)
  }

  const indexTotalByDate =
    input.index.kind === 'annual_rate'
      ? buildRateTotals(start.date, start.total, actual.map((p) => p.date), observations, flowByDate)
      : buildAmountTotals(start.date, start.total, actual.map((p) => p.date), observations, flows)

  let cumulativeFlow = 0
  let previousDate = start.date
  return actual.map((point, position) => {
    if (position > 0) {
      for (const flow of flows) {
        if (flow.date > previousDate && flow.date <= point.date) cumulativeFlow += flow.amount
      }
    }
    const indexTotal = indexTotalByDate.get(point.date) ?? start.total
    const actualGrowth = point.total - start.total - cumulativeFlow
    const indexGrowth = indexTotal - start.total - cumulativeFlow
    previousDate = point.date
    return {
      date: point.date,
      actualTotal: point.total,
      indexTotal,
      actualGrowth,
      indexGrowth,
      difference: actualGrowth - indexGrowth,
    }
  })
}

function buildAmountTotals(
  startDate: string,
  startTotal: number,
  dates: string[],
  observations: IndexValue[],
  flows: Array<{ date: string; amount: number }>,
): Map<string, number> {
  const startLevel = valueOnDate(observations, startDate)
  if (startLevel == null || !(startLevel > 0)) return new Map()
  let units = startTotal / startLevel
  let previousDate = startDate
  const result = new Map<string, number>([[startDate, startTotal]])
  for (const date of dates.slice(1)) {
    for (const flow of flows) {
      if (flow.date <= previousDate || flow.date > date) continue
      const level = valueOnDate(observations, flow.date)
      if (level != null && level > 0) units += flow.amount / level
    }
    const level = valueOnDate(observations, date)
    if (level != null) result.set(date, units * level)
    previousDate = date
  }
  return result
}

function buildRateTotals(
  startDate: string,
  startTotal: number,
  outputDates: string[],
  observations: IndexValue[],
  flowByDate: Map<string, number>,
): Map<string, number> {
  let rate = valueOnDate(observations, startDate)
  if (rate == null) return new Map()
  let total = startTotal
  let previousDate = startDate
  const result = new Map<string, number>([[startDate, startTotal]])
  const outputSet = new Set(outputDates)
  const eventDates = new Set(outputDates.slice(1))
  for (const observation of observations) {
    if (observation.date > startDate && observation.date <= outputDates[outputDates.length - 1]!) {
      eventDates.add(observation.date)
    }
  }
  for (const date of flowByDate.keys()) {
    if (date > startDate && date <= outputDates[outputDates.length - 1]!) eventDates.add(date)
  }

  for (const date of [...eventDates].sort()) {
    total *= Math.pow(1 + rate, daysBetween(previousDate, date) / 365)
    const observation = observations.find((item) => item.date === date)
    if (observation) rate = observation.value
    total += flowByDate.get(date) ?? 0
    if (outputSet.has(date)) result.set(date, total)
    previousDate = date
  }
  return result
}
