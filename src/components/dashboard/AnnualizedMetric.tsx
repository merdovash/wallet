import { formatPercent } from '../../lib/format'

interface AnnualizedMetricProps {
  value: number | null | undefined
  unavailableReason: string | null
  valueClassName?: string
}

export function AnnualizedMetric({ value, unavailableReason, valueClassName }: AnnualizedMetricProps) {
  if (value != null && Number.isFinite(value)) {
    return (
      <p className={`mt-0.5 text-base font-semibold tabular-nums sm:text-lg ${valueClassName ?? ''}`}>
        {formatPercent(value)}
      </p>
    )
  }

  if (unavailableReason) {
    return (
      <p
        className="mt-0.5 text-xs font-medium leading-snug text-amber-700 dark:text-amber-400 sm:text-sm"
        title={unavailableReason}
      >
        {unavailableReason}
      </p>
    )
  }

  return (
    <p className={`mt-0.5 text-base font-semibold tabular-nums sm:text-lg ${valueClassName ?? ''}`}>
      —
    </p>
  )
}
