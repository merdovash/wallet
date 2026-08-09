import { formatPercent } from '../../lib/format'

interface AnnualizedMetricProps {
  value: number | null | undefined
  unavailableReason: string | null
  valueClassName?: string
  compact?: boolean
}

export function AnnualizedMetric({
  value,
  unavailableReason,
  valueClassName,
  compact = false,
}: AnnualizedMetricProps) {
  const valueClass = compact
    ? `mt-0.5 text-sm font-semibold tabular-nums leading-tight ${valueClassName ?? ''}`
    : `mt-0.5 text-base font-semibold tabular-nums sm:text-lg ${valueClassName ?? ''}`

  if (value != null && Number.isFinite(value)) {
    return <p className={valueClass}>{formatPercent(value)}</p>
  }

  if (unavailableReason) {
    return (
      <p
        className={`mt-0.5 font-medium leading-snug text-amber-700 dark:text-amber-400 ${
          compact ? 'text-[10px]' : 'text-xs sm:text-sm'
        }`}
        title={unavailableReason}
      >
        {unavailableReason}
      </p>
    )
  }

  return <p className={valueClass}>—</p>
}
