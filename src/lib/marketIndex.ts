import type { IndexValue, MarketIndex } from '../types/wallet'

function round(value: number, digits: number): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

export function normalizeRatePct(value: number): number {
  return round(value, 12)
}

export function ratePctToPoints(value: number): number {
  return round(normalizeRatePct(value) * 100, 8)
}

export function pointsToRatePct(value: number): number {
  return normalizeRatePct(value / 100)
}

export function isManualIndex(kind: MarketIndex['kind']): boolean {
  return kind !== 'derived_rate'
}

export function isRateIndex(kind: MarketIndex['kind']): boolean {
  return kind !== 'amount'
}

export function resolveIndexCurrency(
  index: MarketIndex,
  indices: MarketIndex[],
  visiting = new Set<string>(),
): string {
  if (index.kind !== 'derived_rate' || !index.baseIndexId) return index.currency
  if (visiting.has(index.id)) return index.currency
  const base = indices.find((item) => item.id === index.baseIndexId)
  if (!base) return index.currency
  visiting.add(index.id)
  return resolveIndexCurrency(base, indices, visiting)
}

export function resolveIndexValues(
  indexId: string,
  indices: MarketIndex[],
  values: IndexValue[],
  visiting = new Set<string>(),
): IndexValue[] {
  const index = indices.find((item) => item.id === indexId)
  if (!index) return []

  if (index.kind !== 'derived_rate') {
    const byDate = new Map<string, IndexValue>()
    for (const value of values) {
      if (value.indexId === indexId && Number.isFinite(value.value)) byDate.set(value.date, value)
    }
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
  }

  if (!index.baseIndexId || visiting.has(index.id)) return []
  const base = indices.find((item) => item.id === index.baseIndexId)
  if (!base || !isRateIndex(base.kind)) return []

  const nextVisiting = new Set(visiting)
  nextVisiting.add(index.id)
  const baseValues = resolveIndexValues(base.id, indices, values, nextVisiting)
  const spread = normalizeRatePct(index.rateSpreadPct ?? 0)
  return baseValues.map((value) => ({
    indexId,
    date: value.date,
    value: normalizeRatePct(value.value + spread),
  }))
}

export function latestIndexValue(
  indexId: string,
  indices: MarketIndex[],
  values: IndexValue[],
): IndexValue | null {
  const resolved = resolveIndexValues(indexId, indices, values)
  return resolved[resolved.length - 1] ?? null
}

export function formatIndexKindLabel(kind: MarketIndex['kind']): string {
  if (kind === 'annual_rate') return 'процентный'
  if (kind === 'derived_rate') return 'расчетный процент'
  return 'суммовой'
}

export function formatRateSpreadPoints(spreadPct: number | null | undefined): string {
  const points = ratePctToPoints(spreadPct ?? 0)
  const sign = points > 0 ? '+' : ''
  return `${sign}${points.toLocaleString('ru-RU', { maximumFractionDigits: 4 })} п.п.`
}
