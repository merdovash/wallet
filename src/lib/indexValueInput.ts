import type { IndexKind, MarketIndex } from '../types/wallet'
import { pointsToRatePct, ratePctToPoints } from './marketIndex'
import { formatMoneyInput, parseMoneyInput } from './moneyInput'

export function indexValueToInput(value: number, kind: IndexKind): string {
  const shown = kind === 'annual_rate' || kind === 'derived_rate' ? ratePctToPoints(value) : value
  return formatMoneyInput(String(shown).replace('.', ','))
}

export function parseIndexValueInput(raw: string, kind: IndexKind): number | null {
  const parsed = parseMoneyInput(raw)
  if (parsed == null) return null
  if (kind === 'annual_rate') return pointsToRatePct(parsed)
  return parsed
}

export function collectIndexValueEntries(
  updatable: MarketIndex[],
  amounts: Record<string, string>,
): Array<{ indexId: string; value: number }> {
  return updatable.flatMap((index) => {
    const raw = amounts[index.id]?.trim()
    if (!raw) return []
    const value = parseIndexValueInput(raw, index.kind)
    if (value == null) return []
    return [{ indexId: index.id, value }]
  })
}

/** True when two money-field strings encode different index values. */
export function indexValueInputsDiffer(a: string, b: string, kind: IndexKind): boolean {
  const left = parseIndexValueInput(a, kind)
  const right = parseIndexValueInput(b, kind)
  if (left == null && right == null) return a.trim() !== b.trim()
  if (left == null || right == null) return true
  return Math.abs(left - right) > 1e-10
}
