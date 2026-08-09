/** Real annualized return: (1 + nominal) / (1 + inflation) − 1. */
export function realAnnualizedReturn(
  nominalAnnualizedPct: number | null | undefined,
  annualInflationPct: number | null | undefined,
): number | null {
  if (nominalAnnualizedPct == null || !Number.isFinite(nominalAnnualizedPct)) return null
  if (annualInflationPct == null || !Number.isFinite(annualInflationPct)) return null
  if (annualInflationPct <= -1) return null
  return (1 + nominalAnnualizedPct) / (1 + annualInflationPct) - 1
}

/** Parse user input like "8" or "8,5" into decimal fraction 0.08. */
export function parseInflationPercentInput(raw: string): number | null {
  const trimmed = raw.trim().replace(',', '.')
  if (!trimmed) return null
  const pct = Number(trimmed)
  if (!Number.isFinite(pct) || pct < -99 || pct > 1000) return null
  return pct / 100
}

export function formatInflationPercentInput(decimal: number | null | undefined): string {
  if (decimal == null || !Number.isFinite(decimal)) return ''
  return String(Math.round(decimal * 1000) / 10).replace('.', ',')
}
