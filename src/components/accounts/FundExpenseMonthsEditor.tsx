import { dataQa } from '../../lib/dataQa'
import { formatYearMonthRu } from '../../lib/fundOnboarding'
import { MoneyInput } from '../ui/FormControls'

export function FundExpenseMonthsEditor({
  months,
  amounts,
  onChangeAmount,
  lineIndex,
}: {
  months: string[]
  amounts: Record<string, string>
  onChangeAmount: (yearMonth: string, value: string) => void
  lineIndex?: number
}) {
  const suffix = lineIndex == null ? '' : `-${lineIndex}`
  return (
    <ul className="space-y-2">
      {months.map((month) => (
        <li key={month} className="flex flex-wrap items-center gap-2">
          <span className="w-32 shrink-0 text-sm text-slate-600 dark:text-slate-300">
            {formatYearMonthRu(month)}
          </span>
          <MoneyInput
            value={amounts[month] ?? ''}
            onChange={(value) => onChangeAmount(month, value)}
            allowNegative={false}
            className="max-w-xs"
            dataQa={`fund-expense-amount${suffix}-${month}`}
          />
        </li>
      ))}
    </ul>
  )
}

export function FundAutoTargetToggle({
  autoTarget,
  onChange,
}: {
  autoTarget: boolean
  onChange: (next: boolean) => void
}) {
  const btnClass = 'rounded-md px-2.5 py-1 text-xs font-medium transition'
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Цель фонда</p>
      <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900">
        <button
          type="button"
          className={`${btnClass} ${
            !autoTarget
              ? 'bg-blue-600 text-white'
              : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
          }`}
          onClick={() => onChange(false)}
          {...dataQa('fund-auto-target-off')}
        >
          Вручную
        </button>
        <button
          type="button"
          className={`${btnClass} ${
            autoTarget
              ? 'bg-blue-600 text-white'
              : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
          }`}
          onClick={() => onChange(true)}
          {...dataQa('fund-auto-target-on')}
        >
          По расходам
        </button>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {autoTarget
          ? 'Цель — среднее арифметическое введённых расходов за месяцы.'
          : 'Цель задаётся вручную. Расходы за месяцы всё равно сохраняются.'}
      </p>
    </div>
  )
}
