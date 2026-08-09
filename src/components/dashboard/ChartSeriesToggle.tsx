import type { GrowthChartSeriesKind } from './GrowthChart'

interface ChartSeriesToggleProps {
  value: GrowthChartSeriesKind
  onChange: (kind: GrowthChartSeriesKind) => void
}

export function ChartSeriesToggle({ value, onChange }: ChartSeriesToggleProps) {
  return (
    <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900">
      <button
        type="button"
        onClick={() => onChange('growth')}
        className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition sm:px-2.5 sm:py-1 sm:text-xs ${
          value === 'growth'
            ? 'bg-blue-600 text-white'
            : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
        }`}
      >
        Портфель
      </button>
      <button
        type="button"
        onClick={() => onChange('netWorth')}
        className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition sm:px-2.5 sm:py-1 sm:text-xs ${
          value === 'netWorth'
            ? 'bg-blue-600 text-white'
            : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
        }`}
      >
        Вся масса
      </button>
    </div>
  )
}
