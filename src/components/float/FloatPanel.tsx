import { useMemo } from 'react'
import { buildAllCreditFloatSummaries } from '../../engine/creditFloatEngine'
import { formatCurrency, formatPercent, signedAmount, todayIsoDate } from '../../lib/format'
import { useRatesStore } from '../../store/ratesStore'
import { useWalletStore } from '../../store/walletStore'
import { Card, EmptyState } from '../ui/FormControls'

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

function formatDueDate(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`
}

type MonthAgg = {
  month: string
  linkedGrowthBase: number
  earnedBase: number
  floatSharePct: number | null
  spent: number
  repaid: number
  remaining: number
  dueDate: string
  overdue: boolean
}

function earnTone(value: number): string {
  if (value > 0) return 'text-emerald-700'
  if (value < 0) return 'text-red-600'
  return 'text-slate-700 dark:text-slate-300'
}

export function FloatPanel() {
  const accounts = useWalletStore((s) => s.accounts)
  const snapshots = useWalletStore((s) => s.snapshots)
  const transfers = useWalletStore((s) => s.transfers)
  const settings = useWalletStore((s) => s.settings)
  const rateBook = useRatesStore((s) => s.byDate)

  const creditAccounts = useMemo(
    () => accounts.filter((a) => !a.archived && a.kind === 'credit'),
    [accounts],
  )

  const asOf = useMemo(() => {
    const dates = snapshots.map((s) => s.date).sort()
    return dates[dates.length - 1] ?? todayIsoDate()
  }, [snapshots])

  const summary = useMemo(
    () =>
      buildAllCreditFloatSummaries(
        accounts,
        snapshots,
        transfers,
        settings,
        asOf,
        rateBook,
      ),
    [accounts, snapshots, transfers, settings, asOf, rateBook],
  )

  const months = useMemo(() => {
    const byMonth = new Map<string, MonthAgg>()
    for (const card of summary.cards) {
      for (const row of card.months) {
        const prev = byMonth.get(row.month)
        if (!prev) {
          byMonth.set(row.month, {
            month: row.month,
            linkedGrowthBase: row.linkedGrowthBase,
            earnedBase: row.earnedBase,
            floatSharePct: null,
            spent: row.spent,
            repaid: row.repaid,
            remaining: row.remaining,
            dueDate: row.dueDate,
            overdue: row.overdue,
          })
        } else {
          prev.linkedGrowthBase += row.linkedGrowthBase
          prev.earnedBase += row.earnedBase
          prev.spent += row.spent
          prev.repaid += row.repaid
          prev.remaining += row.remaining
          prev.overdue = prev.overdue || row.overdue
          if (row.dueDate < prev.dueDate) prev.dueDate = row.dueDate
        }
      }
    }
    return [...byMonth.values()]
      .map((row) => ({
        ...row,
        floatSharePct:
          row.linkedGrowthBase !== 0 ? row.earnedBase / row.linkedGrowthBase : null,
      }))
      .sort((a, b) => b.month.localeCompare(a.month))
  }, [summary.cards])

  const currency = settings.baseCurrency
  const earnedColor = earnTone(summary.totalEarnedBase)

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Float</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Выгода от беспроцентного периода по связанным кошелькам
        </p>
      </div>

      {creditAccounts.length === 0 ? (
        <EmptyState
          title="Нет кредиток"
          description="Добавьте счёт типа «Кредитка» с лимитом, сроком грейса и связанным кошельком."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <Card className="!p-2.5 sm:!p-3">
              <p className="text-xs text-slate-500 dark:text-slate-400 sm:text-sm">Выгода float</p>
              <p
                className={`mt-0.5 text-base font-semibold tabular-nums sm:mt-1 sm:text-xl ${earnedColor}`}
              >
                {signedAmount(summary.totalEarnedBase, currency)}
              </p>
              <p className="mt-1 text-[11px] leading-snug text-slate-500 dark:text-slate-400 sm:text-xs">
                Доход благодаря беспроцентному кредиту
              </p>
            </Card>
            <Card className="!p-2.5 sm:!p-3">
              <p className="text-xs text-slate-500 dark:text-slate-400 sm:text-sm">Долг по кредиткам</p>
              <p className="mt-0.5 text-base font-semibold tabular-nums text-slate-900 dark:text-slate-100 sm:mt-1 sm:text-xl">
                {formatCurrency(
                  summary.cards.reduce((s, c) => s + c.totalDebt, 0),
                  currency,
                )}
              </p>
            </Card>
          </div>

          <Card className="!p-3 sm:!p-4">
            <h2 className="mb-1 text-sm font-semibold text-slate-800 dark:text-slate-200">По месяцам</h2>
            <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
              Счёт — прирост связанного кошелька. Доля — часть капитала под долгом кредитки.
              Float — доход благодаря беспроцентному периоду. Дедлайн: траты N → конец N+грейс.
            </p>
            {months.length === 0 ? (
              <EmptyState
                title="Пока нет данных"
                description="Зафиксируйте остатки кредитки и связанного кошелька в чек-инах."
              />
            ) : (
              <>
                {/* Mobile / adaptive cards */}
                <ul className="space-y-2 md:hidden">
                  {months.map((row) => (
                    <li
                      key={row.month}
                      className={`rounded-xl border px-3 py-2.5 ${
                        row.overdue
                          ? 'border-red-200 bg-red-50 dark:bg-red-950/40/70'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {formatMonthLabel(row.month)}
                          </p>
                          <p
                            className={`text-[11px] ${
                              row.overdue ? 'font-medium text-red-700' : 'text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            до {formatDueDate(row.dueDate)}
                            {row.overdue ? ' · просрочено' : ''}
                          </p>
                        </div>
                        <p
                          className={`shrink-0 text-sm font-semibold tabular-nums ${earnTone(row.earnedBase)}`}
                        >
                          {signedAmount(row.earnedBase, currency)}
                        </p>
                      </div>
                      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                        <div>
                          <dt className="text-slate-500 dark:text-slate-400">Счёт заработал</dt>
                          <dd className={`font-medium tabular-nums ${earnTone(row.linkedGrowthBase)}`}>
                            {signedAmount(row.linkedGrowthBase, currency)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-slate-500 dark:text-slate-400">Доля кредитки</dt>
                          <dd className="font-medium tabular-nums text-slate-800 dark:text-slate-200">
                            {formatPercent(row.floatSharePct)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-slate-500 dark:text-slate-400">Траты</dt>
                          <dd className="font-medium tabular-nums text-slate-800 dark:text-slate-200">
                            {formatCurrency(row.spent, currency)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-slate-500 dark:text-slate-400">Погашено</dt>
                          <dd className="font-medium tabular-nums text-slate-800 dark:text-slate-200">
                            {formatCurrency(row.repaid, currency)}
                          </dd>
                        </div>
                      </dl>
                    </li>
                  ))}
                </ul>

                {/* Desktop table */}
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[40rem] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                        <th className="py-2 pr-3 font-medium">Месяц</th>
                        <th className="py-2 pr-3 font-medium">Счёт заработал</th>
                        <th className="py-2 pr-3 font-medium">Доля кредитки</th>
                        <th className="py-2 pr-3 font-medium">Доход float</th>
                        <th className="py-2 pr-3 font-medium">Траты</th>
                        <th className="py-2 pr-3 font-medium">Погашено</th>
                        <th className="py-2 font-medium">Дедлайн</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {months.map((row) => (
                        <tr
                          key={row.month}
                          className={row.overdue ? 'bg-red-50 dark:bg-red-950/40/60' : undefined}
                        >
                          <td className="py-2.5 pr-3 font-medium text-slate-900 dark:text-slate-100">
                            {formatMonthLabel(row.month)}
                          </td>
                          <td
                            className={`py-2.5 pr-3 tabular-nums ${earnTone(row.linkedGrowthBase)}`}
                          >
                            {signedAmount(row.linkedGrowthBase, currency)}
                          </td>
                          <td className="py-2.5 pr-3 tabular-nums text-slate-700 dark:text-slate-300">
                            {formatPercent(row.floatSharePct)}
                          </td>
                          <td
                            className={`py-2.5 pr-3 tabular-nums font-medium ${earnTone(row.earnedBase)}`}
                          >
                            {signedAmount(row.earnedBase, currency)}
                          </td>
                          <td className="py-2.5 pr-3 tabular-nums text-slate-700 dark:text-slate-300">
                            {formatCurrency(row.spent, currency)}
                          </td>
                          <td className="py-2.5 pr-3 tabular-nums text-slate-700 dark:text-slate-300">
                            {formatCurrency(row.repaid, currency)}
                          </td>
                          <td
                            className={`py-2.5 ${
                              row.overdue ? 'font-medium text-red-700' : 'text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {formatDueDate(row.dueDate)}
                            {row.overdue ? ' · просрочено' : ''}
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
