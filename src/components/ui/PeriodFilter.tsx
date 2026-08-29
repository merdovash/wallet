import { DASHBOARD_PERIOD_OPTIONS, clampIsoDate } from '../../lib/dashboardPeriod'
import { formatDateDisplay } from '../../lib/format'
import { usePeriodRange } from '../../lib/usePeriodRange'
import { usePeriodStore } from '../../store/periodStore'
import { DateInput } from './FormControls'
import { dataQa } from '../../lib/dataQa'

interface PeriodFilterProps {
  className?: string
  /** Show resolved check-in dates next to the chips when they fit. */
  showRange?: boolean
}

const chipClass =
  'rounded-md px-1.5 py-0.5 text-[11px] font-medium transition sm:px-2 sm:py-1 sm:text-xs'

export function PeriodFilter({ className = '', showRange = false }: PeriodFilterProps) {
  const periodKey = usePeriodStore((s) => s.periodKey)
  const setPeriodKey = usePeriodStore((s) => s.setPeriodKey)
  const customStart = usePeriodStore((s) => s.customStart)
  const customEnd = usePeriodStore((s) => s.customEnd)
  const setCustomRange = usePeriodStore((s) => s.setCustomRange)
  const { range, dates } = usePeriodRange()
  const firstDate = dates[0] ?? ''
  const lastDate = dates[dates.length - 1] ?? ''
  const custom = periodKey === 'custom'

  function activateCustom() {
    const start = customStart || range?.startDate || firstDate
    const end = customEnd || range?.endDate || lastDate
    if (!start || !end) return
    setCustomRange(start, end)
  }

  function updateCustom(nextStart: string, nextEnd: string) {
    if (!firstDate || !lastDate) return
    let start = clampIsoDate(nextStart, firstDate, lastDate)
    let end = clampIsoDate(nextEnd, firstDate, lastDate)
    if (start > end) {
      const swap = start
      start = end
      end = swap
    }
    setCustomRange(start, end)
  }

  return (
    <div
      className={`flex min-w-0 max-w-full flex-wrap items-center gap-x-2 gap-y-1 ${className}`}
      {...dataQa('period-filter')}
    >
      <div
        role="group"
        aria-label="Период"
        className="inline-flex max-w-full min-w-0 flex-wrap rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900"
        {...dataQa('period-chips')}
      >
        {DASHBOARD_PERIOD_OPTIONS.map((option) => (
          <button
            key={option.key}
            type="button"
            title={option.label}
            aria-pressed={periodKey === option.key}
            onClick={() => setPeriodKey(option.key)}
            className={`${chipClass} ${
              periodKey === option.key
                ? 'bg-blue-600 text-white'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
            {...dataQa(`period-${option.key}`)}
          >
            <span className="sm:hidden">{option.shortLabel}</span>
            <span className="hidden sm:inline">{option.label}</span>
          </button>
        ))}
        <button
          type="button"
          title="Произвольный период"
          aria-pressed={custom}
          onClick={activateCustom}
          className={`${chipClass} ${
            custom
              ? 'bg-blue-600 text-white'
              : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
          }`}
          {...dataQa('period-custom')}
        >
          Свои
        </button>
      </div>
      {custom && firstDate && lastDate ? (
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-1.5" {...dataQa('period-custom-range')}>
          <DateInput
            aria-label="Начало периода"
            dataQa="period-start"
            value={customStart || firstDate}
            min={firstDate}
            max={lastDate}
            onChange={(iso) => {
              if (!iso) return
              updateCustom(iso, customEnd || lastDate)
            }}
            className="w-[9.25rem]"
          />
          <span className="text-[10px] text-slate-400 dark:text-slate-500">→</span>
          <DateInput
            aria-label="Конец периода"
            dataQa="period-end"
            value={customEnd || lastDate}
            min={firstDate}
            max={lastDate}
            onChange={(iso) => {
              if (!iso) return
              updateCustom(customStart || firstDate, iso)
            }}
            className="w-[9.25rem]"
          />
        </div>
      ) : showRange && range ? (
        <span className="min-w-0 truncate text-[10px] text-slate-500 dark:text-slate-400 sm:text-xs">
          {formatDateDisplay(range.startDate)} → {formatDateDisplay(range.endDate)}
        </span>
      ) : null}
    </div>
  )
}
