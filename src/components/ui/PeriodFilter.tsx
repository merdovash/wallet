import { DASHBOARD_PERIOD_OPTIONS } from '../../lib/dashboardPeriod'
import { formatDateDisplay } from '../../lib/format'
import { usePeriodRange } from '../../lib/usePeriodRange'
import { usePeriodStore } from '../../store/periodStore'

interface PeriodFilterProps {
  className?: string
  /** Show resolved check-in dates next to the chips when they fit. */
  showRange?: boolean
}

export function PeriodFilter({ className = '', showRange = false }: PeriodFilterProps) {
  const periodKey = usePeriodStore((s) => s.periodKey)
  const setPeriodKey = usePeriodStore((s) => s.setPeriodKey)
  const { range } = usePeriodRange()

  return (
    <div className={`flex min-w-0 max-w-full flex-wrap items-center gap-x-2 gap-y-1 ${className}`}>
      <div
        role="group"
        aria-label="Период"
        className="inline-flex max-w-full min-w-0 flex-wrap rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900"
      >
        {DASHBOARD_PERIOD_OPTIONS.map((option) => (
          <button
            key={option.key}
            type="button"
            title={option.label}
            aria-pressed={periodKey === option.key}
            onClick={() => setPeriodKey(option.key)}
            className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium transition sm:px-2 sm:py-1 sm:text-xs ${
              periodKey === option.key
                ? 'bg-blue-600 text-white'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <span className="sm:hidden">{option.shortLabel}</span>
            <span className="hidden sm:inline">{option.label}</span>
          </button>
        ))}
      </div>
      {showRange && range ? (
        <span className="min-w-0 truncate text-[10px] text-slate-500 dark:text-slate-400 sm:text-xs">
          {formatDateDisplay(range.startDate)} → {formatDateDisplay(range.endDate)}
        </span>
      ) : null}
    </div>
  )
}
