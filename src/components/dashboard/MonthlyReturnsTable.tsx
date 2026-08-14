import { useMemo } from 'react'
import { formatCurrency, formatPercent, signedAmount } from '../../lib/format'
import { buildMonthlyReturns } from '../../lib/monthlyReturns'
import { buildMonthlyRiskMetrics } from '../../lib/monthlyRiskMetrics'
import { useRatesStore } from '../../store/ratesStore'
import { useWalletStore } from '../../store/walletStore'
import { Card, EmptyState } from '../ui/FormControls'

export function MonthlyReturnsTable() {
  const accounts = useWalletStore((s) => s.accounts)
  const snapshots = useWalletStore((s) => s.snapshots)
  const transfers = useWalletStore((s) => s.transfers)
  const settings = useWalletStore((s) => s.settings)
  const rateBook = useRatesStore((s) => s.byDate)

  const rows = useMemo(
    () => buildMonthlyReturns(accounts, snapshots, settings, rateBook, transfers),
    [accounts, snapshots, settings, rateBook, transfers],
  )
  const risk = useMemo(() => buildMonthlyRiskMetrics(rows), [rows])

  return (
    <div className="space-y-4">
      {rows.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Card className="px-4 py-3">
            <p className="text-xs text-slate-500 dark:text-slate-400">Волатильность месяцев</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-200">
              {formatPercent(risk.volatilityPct)}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
              σ помесячных доходностей
            </p>
          </Card>
          <Card className="px-4 py-3">
            <p className="text-xs text-slate-500 dark:text-slate-400">Макс. просадка</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-red-600">
              {formatPercent(risk.maxDrawdownPct == null ? null : -risk.maxDrawdownPct)}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
              по кумулятивному индексу
            </p>
          </Card>
          <Card className="px-4 py-3">
            <p className="text-xs text-slate-500 dark:text-slate-400">Плюсовые месяцы</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-200">
              {risk.positiveMonthsRatio == null
                ? '—'
                : `${Math.round(risk.positiveMonthsRatio * 100)}%`}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
              {risk.positiveMonths} из {risk.monthCount}
            </p>
          </Card>
        </div>
      ) : null}

    <Card className="!p-0">
      <div className="border-b border-slate-100 dark:border-slate-800 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Помесячный прирост</h2>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          Без учёта доходов/расходов; пополнения — только переводы; % — Modified Dietz
        </p>
      </div>
      {rows.length === 0 ? (
        <div className="p-4">
          <EmptyState
            title="Недостаточно точек"
            description="Нужны чек-ины минимум в двух датах в разных интервалах месяца."
          />
        </div>
      ) : (
        <div className="overflow-x-hidden">
          <table className="w-full table-fixed text-xs sm:text-sm">
            <colgroup>
              <col className="w-[38%] sm:w-[34%]" />
              <col className="hidden md:table-column md:w-[22%]" />
              <col className="w-[31%] sm:w-[22%]" />
              <col className="w-[31%] sm:w-[22%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700 text-left text-slate-500 dark:text-slate-400">
                <th className="px-2 py-2 font-medium sm:px-4 sm:py-3">Месяц</th>
                <th className="hidden whitespace-nowrap px-4 py-3 font-medium tabular-nums md:table-cell">
                  Прирост
                </th>
                <th className="whitespace-nowrap px-2 py-2 font-medium tabular-nums sm:px-4 sm:py-3">
                  За месяц
                </th>
                <th className="whitespace-nowrap px-2 py-2 font-medium tabular-nums sm:px-4 sm:py-3">
                  В годовых
                </th>
              </tr>
            </thead>
            <tbody>
              {[...rows].reverse().map((row) => {
                const pctColor =
                  (row.growthPct ?? 0) > 0
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : (row.growthPct ?? 0) < 0
                      ? 'text-red-600'
                      : 'text-slate-700 dark:text-slate-300'
                return (
                  <tr key={row.yearMonth} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="px-2 py-2 font-medium text-slate-900 dark:text-slate-200 sm:px-4 sm:py-3">
                      <div className="truncate">{row.label}</div>
                      <div className="mt-0.5 truncate text-[11px] font-normal text-slate-500 dark:text-slate-400 md:hidden">
                        {signedAmount(row.growth, settings.baseCurrency)}
                      </div>
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3 tabular-nums text-slate-800 dark:text-slate-200 md:table-cell">
                      {signedAmount(row.growth, settings.baseCurrency)}
                    </td>
                    <td className={`truncate px-2 py-2 tabular-nums sm:px-4 sm:py-3 ${pctColor}`}>
                      {formatPercent(row.growthPct)}
                    </td>
                    <td className={`truncate px-2 py-2 tabular-nums sm:px-4 sm:py-3 ${pctColor}`}>
                      {formatPercent(row.annualizedPct)}
                      <div className="mt-0.5 hidden truncate text-xs text-slate-400 dark:text-slate-500 sm:block">
                        от {formatCurrency(row.startTotal, settings.baseCurrency)}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
    </div>
  )
}
