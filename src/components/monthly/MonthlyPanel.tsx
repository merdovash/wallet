import { MonthlyReturnsTable } from '../dashboard/MonthlyReturnsTable'
import { FxModeToggle } from '../ui/FxModeToggle'
import { PeriodFilter } from '../ui/PeriodFilter'

export function MonthlyPanel() {
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="space-y-2">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-200">Помесячно</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Прирост по месяцам в процентах и пересчёт в годовые
            </p>
          </div>
          <FxModeToggle showLabel={false} compact className="shrink-0" />
        </div>
        <PeriodFilter showRange />
      </div>
      <MonthlyReturnsTable />
    </div>
  )
}
