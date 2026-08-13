import { useMemo } from 'react'
import { buildCashbackReport, CASHBACK_CURRENCY } from '../../lib/cashbackReport'
import { formatCurrency, formatDateDisplay, formatPercent } from '../../lib/format'
import { useWalletStore } from '../../store/walletStore'
import { Card, EmptyState } from '../ui/FormControls'

export function CashbackPanel() {
  const accounts = useWalletStore((s) => s.accounts)
  const snapshots = useWalletStore((s) => s.snapshots)
  const transfers = useWalletStore((s) => s.transfers)
  const settings = useWalletStore((s) => s.settings)

  const report = useMemo(
    () => buildCashbackReport(accounts, snapshots, transfers, settings),
    [accounts, snapshots, transfers, settings],
  )

  const hasCashbackAccounts = report.accounts.length > 0

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Кэшбек</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Эффективная скидка от расходов: начисленный кэшбек к сумме расходов в чек-инах (1 кэшбек = 1 ₽)
        </p>
      </div>

      {!hasCashbackAccounts ? (
        <Card>
          <EmptyState
            title="Нет кэшбек-счетов"
            description="Создайте счёт типа «Кэшбек» в разделе «Счета», чтобы отслеживать начисления и скидку от расходов."
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card className="!p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">Расходы (чек-ины)</p>
              <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
                {formatCurrency(report.totalExpense, settings.baseCurrency)}
              </p>
            </Card>
            <Card className="!p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">Начислено кэшбека</p>
              <p className="mt-1 text-lg font-semibold text-emerald-700 dark:text-emerald-400">
                {formatCurrency(report.totalCashbackEarned, settings.baseCurrency)}
              </p>
            </Card>
            <Card className="!p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">Эффективная скидка</p>
              <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
                {formatPercent(report.effectiveDiscountPct, 2)}
              </p>
            </Card>
            <Card className="!p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">Текущий баланс</p>
              <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
                {formatCurrency(report.currentCashbackBalance, CASHBACK_CURRENCY)}
              </p>
            </Card>
          </div>

          <Card className="overflow-hidden !p-0">
            <div className="border-b border-slate-100 dark:border-slate-800 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Кэшбек-счета</h2>
            </div>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {report.accounts.map((row) => (
                <li key={row.id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <span className="font-medium text-slate-800 dark:text-slate-200">{row.name}</span>
                  <span>{formatCurrency(row.balance, CASHBACK_CURRENCY)}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="overflow-hidden !p-0">
            <div className="border-b border-slate-100 dark:border-slate-800 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">По чек-инам</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Расход и начисление кэшбека за интервал до даты · новые сверху
              </p>
            </div>
            {report.rows.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-500 dark:text-slate-400">Пока нет чек-инов.</p>
            ) : (
              <>
                <ul className="divide-y divide-slate-100 dark:divide-slate-800 md:hidden">
                  {report.rows.map((row) => (
                    <li key={row.date} className="px-3 py-2.5">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {formatDateDisplay(row.date)}
                      </p>
                      <dl className="mt-1.5 grid grid-cols-3 gap-1 text-[11px]">
                        <div>
                          <dt className="text-slate-400 dark:text-slate-500">Расход</dt>
                          <dd className="mt-0.5 truncate tabular-nums text-slate-800 dark:text-slate-200">
                            {row.expense > 0
                              ? formatCurrency(row.expense, settings.baseCurrency)
                              : '—'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-slate-400 dark:text-slate-500">Кэшбек</dt>
                          <dd className="mt-0.5 truncate tabular-nums text-emerald-700 dark:text-emerald-400">
                            {row.cashbackEarned > 0
                              ? formatCurrency(row.cashbackEarned, settings.baseCurrency)
                              : '—'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-slate-400 dark:text-slate-500">Скидка</dt>
                          <dd className="mt-0.5 truncate tabular-nums text-slate-800 dark:text-slate-200">
                            {row.discountPct != null && row.expense > 0
                              ? formatPercent(row.discountPct, 2)
                              : '—'}
                          </dd>
                        </div>
                      </dl>
                    </li>
                  ))}
                </ul>
                <div className="hidden overflow-x-hidden md:block">
                  <table className="w-full table-fixed text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        <th className="px-4 py-2 font-medium">Дата</th>
                        <th className="px-4 py-2 font-medium text-right">Расход</th>
                        <th className="px-4 py-2 font-medium text-right">Кэшбек</th>
                        <th className="px-4 py-2 font-medium text-right">Скидка</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.rows.map((row) => (
                        <tr
                          key={row.date}
                          className="border-b border-slate-100 dark:border-slate-800 last:border-0"
                        >
                          <td className="px-4 py-2.5">{formatDateDisplay(row.date)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">
                            {row.expense > 0
                              ? formatCurrency(row.expense, settings.baseCurrency)
                              : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                            {row.cashbackEarned > 0
                              ? formatCurrency(row.cashbackEarned, settings.baseCurrency)
                              : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums">
                            {row.discountPct != null && row.expense > 0
                              ? formatPercent(row.discountPct, 2)
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
