import { useMemo } from 'react'
import { formatCurrency, formatPercent, signedAmount } from '../../lib/format'
import { buildMonthlyReturns } from '../../lib/monthlyReturns'
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

  return (
    <Card className="!p-0">
      <div className="border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-800">Помесячный прирост</h2>
        <p className="mt-0.5 text-xs text-slate-500">
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
        <table className="w-full table-fixed text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="w-[28%] px-3 py-3 font-medium sm:px-4">Месяц</th>
              <th className="hidden px-4 py-3 font-medium tabular-nums md:table-cell">Прирост</th>
              <th className="w-[36%] px-3 py-3 font-medium tabular-nums sm:px-4">За месяц</th>
              <th className="w-[36%] px-3 py-3 text-right font-medium tabular-nums sm:px-4 sm:text-left">
                В годовых
              </th>
            </tr>
          </thead>
          <tbody>
            {[...rows].reverse().map((row) => {
              const pctColor =
                (row.growthPct ?? 0) > 0
                  ? 'text-emerald-700'
                  : (row.growthPct ?? 0) < 0
                    ? 'text-red-600'
                    : 'text-slate-700'
              return (
                <tr key={row.yearMonth} className="border-b border-slate-100">
                  <td className="px-3 py-3 font-medium text-slate-900 sm:px-4">
                    <div>{row.label}</div>
                    <div className="mt-0.5 text-xs font-normal text-slate-500 md:hidden">
                      {signedAmount(row.growth, settings.baseCurrency)}
                    </div>
                  </td>
                  <td className="hidden px-4 py-3 tabular-nums text-slate-800 md:table-cell">
                    {signedAmount(row.growth, settings.baseCurrency)}
                  </td>
                  <td className={`px-3 py-3 tabular-nums sm:px-4 ${pctColor}`}>
                    {formatPercent(row.growthPct)}
                  </td>
                  <td
                    className={`px-3 py-3 text-right tabular-nums sm:px-4 sm:text-left ${pctColor}`}
                  >
                    {formatPercent(row.annualizedPct)}
                    <div className="mt-0.5 hidden text-xs text-slate-400 sm:block">
                      от {formatCurrency(row.startTotal, settings.baseCurrency)}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </Card>
  )
}
