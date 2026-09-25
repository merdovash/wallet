import { useMemo, useState } from 'react'
import { buildCommissionReport, type CommissionRow } from '../../lib/commissionReport'
import { CommissionBreakdownPanel } from './CommissionBreakdownPanel'
import { dataQa } from '../../lib/dataQa'
import { formatDateDisplay, signedAmount } from '../../lib/format'
import { usePeriodRange } from '../../lib/usePeriodRange'
import { useRatesStore } from '../../store/ratesStore'
import { useWalletStore } from '../../store/walletStore'
import { Card, EmptyState } from '../ui/FormControls'
import { PageHeader } from '../ui/PageHeader'
import { PeriodFilter } from '../ui/PeriodFilter'

const MONTH_LABEL = new Intl.DateTimeFormat('ru-RU', {
  month: 'long',
  year: 'numeric',
})

function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  if (!y || !m) return ym
  const label = MONTH_LABEL.format(new Date(y, m - 1, 1))
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function commissionTone(value: number): string {
  return value > 0
    ? 'text-red-600 dark:text-red-400'
    : 'text-emerald-700 dark:text-emerald-400'
}

/** Комиссия > 0 — потеря; выводим со знаком минус (деньги ушли). */
function commissionLabel(value: number, currency: string): string {
  return signedAmount(-value, currency)
}

export function CommissionsPanel() {
  const accounts = useWalletStore((s) => s.accounts)
  const transfers = useWalletStore((s) => s.transfers)
  const expenses = useWalletStore((s) => s.expenses)
  const manualRates = useWalletStore((s) => s.manualRates)
  const settings = useWalletStore((s) => s.settings)
  const rateBook = useRatesStore((s) => s.byDate)
  const { range } = usePeriodRange()
  const [breakdownRowId, setBreakdownRowId] = useState<string | null>(null)

  const report = useMemo(
    () =>
      buildCommissionReport(
        accounts,
        transfers,
        expenses,
        manualRates,
        settings,
        rateBook,
        range ?? undefined,
      ),
    [accounts, transfers, expenses, manualRates, settings, rateBook, range],
  )

  return (
    <div className="mx-auto max-w-5xl space-y-4" {...dataQa('commissions-page')}>
      <PageHeader
        title="Комиссии"
        description="Потери на конвертации и комиссии: переводы (разница с курсом ЦБ) и расходы с обменом валюты"
        actions={<PeriodFilter showRange />}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card className="!p-4" dataQa="widget-commissions-total">
          <p className="text-xs text-slate-500 dark:text-slate-400">Комиссии за период</p>
          <p
            className={`mt-1 text-lg font-semibold tabular-nums ${commissionTone(report.totalBase)}`}
          >
            {commissionLabel(report.totalBase, settings.baseCurrency)}
          </p>
        </Card>
        <Card className="!p-4" dataQa="widget-commissions-transfers">
          <p className="text-xs text-slate-500 dark:text-slate-400">Переводы</p>
          <p
            className={`mt-1 text-lg font-semibold tabular-nums ${commissionTone(report.transfersBase)}`}
          >
            {commissionLabel(report.transfersBase, settings.baseCurrency)}
          </p>
        </Card>
        <Card className="!p-4" dataQa="widget-commissions-expenses">
          <p className="text-xs text-slate-500 dark:text-slate-400">Расходы</p>
          <p
            className={`mt-1 text-lg font-semibold tabular-nums ${commissionTone(report.expensesBase)}`}
          >
            {commissionLabel(report.expensesBase, settings.baseCurrency)}
          </p>
        </Card>
      </div>

      {report.rows.length === 0 ? (
        <Card>
          <EmptyState
            title="Комиссий не найдено"
            description="За период нет переводов с курсовой разницей и расходов с комиссией конвертации."
            dataQa="commissions-empty"
          />
        </Card>
      ) : (
        <>
          <Card className="overflow-hidden !p-0" dataQa="table-commissions-months">
            <div className="border-b border-slate-100 dark:border-slate-800 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                По месяцам
              </h2>
            </div>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {report.months.map((row) => (
                <li
                  key={row.month}
                  className="flex items-center justify-between px-4 py-2.5 text-sm"
                  {...dataQa(`commissions-month-${row.month}`)}
                >
                  <span className="text-slate-800 dark:text-slate-200">
                    {formatMonthLabel(row.month)}
                    <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">
                      {row.rowCount} опер.
                    </span>
                  </span>
                  <span className={`tabular-nums font-medium ${commissionTone(row.commissionBase)}`}>
                    {commissionLabel(row.commissionBase, settings.baseCurrency)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="overflow-hidden !p-0" dataQa="table-commissions">
            <div className="border-b border-slate-100 dark:border-slate-800 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Операции</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Красное — потеря (комиссия / курс хуже ЦБ), зелёное — выгода · новые сверху ·
                клик по операции — расшифровка расчёта
              </p>
            </div>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {report.rows.map((row) => (
                <li key={row.id} {...dataQa(`commissions-row-${row.id}`)}>
                  <button
                    type="button"
                    onClick={() => setBreakdownRowId(row.id)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800/60"
                    {...dataQa(`commissions-row-open-${row.id}`)}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
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
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-slate-500 dark:text-slate-400">
                        {row.label} · {row.detail}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 tabular-nums font-medium ${commissionTone(row.commissionBase)}`}
                    >
                      {commissionLabel(row.commissionBase, settings.baseCurrency)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}

      <CommissionBreakdownPanel
        open={breakdownRowId != null}
        onClose={() => setBreakdownRowId(null)}
        row={findRow(report.rows, breakdownRowId)}
      />
    </div>
  )
}

function findRow(rows: CommissionRow[], id: string | null): CommissionRow | null {
  if (!id) return null
  return rows.find((row) => row.id === id) ?? null
}
