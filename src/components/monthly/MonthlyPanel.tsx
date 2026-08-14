import { MonthlyReturnsTable } from '../dashboard/MonthlyReturnsTable'

export function MonthlyPanel() {
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-200">Помесячно</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Прирост по месяцам в процентах и пересчёт в годовые
        </p>
      </div>
      <MonthlyReturnsTable />
    </div>
  )
}
