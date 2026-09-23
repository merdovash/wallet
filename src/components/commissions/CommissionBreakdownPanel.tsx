import type { CommissionRow } from '../../lib/commissionReport'
import { dataQa } from '../../lib/dataQa'
import { formatDateDisplay } from '../../lib/format'
import { StackPanel } from '../ui/StackPanel'

interface CommissionBreakdownPanelProps {
  open: boolean
  onClose: () => void
  row: CommissionRow | null
}

/** Расшифровка комиссии формулами: слева алгоритм с конкретными значениями, справа итог. */
export function CommissionBreakdownPanel({ open, onClose, row }: CommissionBreakdownPanelProps) {
  const tone =
    row != null && row.commissionBase > 0
      ? 'text-red-600 dark:text-red-400'
      : 'text-emerald-700 dark:text-emerald-400'

  return (
    <StackPanel
      open={open}
      title="Расшифровка комиссии"
      onClose={onClose}
      dataQa="commission-breakdown"
    >
      {!row ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Операция не выбрана.</p>
      ) : (
        <div className="space-y-4 text-sm text-slate-700 dark:text-slate-300">
          <div>
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-slate-900 dark:text-slate-200">
                {formatDateDisplay(row.date)}
              </span>
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                  row.kind === 'transfer'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-sky-100 text-sky-800'
                }`}
              >
                {row.kind === 'transfer' ? 'перевод' : 'расход'}
              </span>
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {row.label} · {row.detail}
            </p>
          </div>

          <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
            <p className="font-semibold">Как считается</p>
            <p className="mt-1">
              {row.kind === 'transfer'
                ? 'Отправленная и полученная суммы приводятся к базовой валюте по курсу ЦБ на дату перевода; комиссия — их разница. Положительная — потеря, отрицательная — выгода.'
                : 'Комиссия — разница между списанием со счёта и расходом, пересчитанным по актуальному курсу обмена (ручному или ЦБ), зафиксированному при создании расхода.'}
            </p>
          </div>

          <ul
            className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-700"
            {...dataQa('commission-breakdown-lines')}
          >
            {row.breakdown.map((line, index) => (
              <li key={index} className="px-3 py-2.5" {...dataQa(`commission-breakdown-line-${index}`)}>
                <p className="text-xs text-slate-500 dark:text-slate-400">{line.label}</p>
                <p
                  className={`mt-1 tabular-nums ${
                    line.emphasize
                      ? `font-semibold ${tone}`
                      : 'text-slate-800 dark:text-slate-200'
                  }`}
                >
                  {line.expression != null ? (
                    <>
                      {line.expression} <span className="text-slate-400 dark:text-slate-500">=</span>{' '}
                      {line.result}
                    </>
                  ) : (
                    line.result
                  )}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </StackPanel>
  )
}
