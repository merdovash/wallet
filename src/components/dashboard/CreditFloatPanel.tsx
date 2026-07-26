import { useMemo } from 'react'
import { buildAllCreditFloatSummaries } from '../../engine/creditFloatEngine'
import { formatCurrency, signedAmount, todayIsoDate } from '../../lib/format'
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

export function CreditFloatPanel() {
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
    const byMonth = new Map<
      string,
      {
        month: string
        earnedBase: number
        spent: number
        repaid: number
        remaining: number
        dueDate: string
        overdue: boolean
      }
    >()
    for (const card of summary.cards) {
      for (const row of card.months) {
        const prev = byMonth.get(row.month)
        if (!prev) {
          byMonth.set(row.month, {
            month: row.month,
            earnedBase: row.earnedBase,
            spent: row.spent,
            repaid: row.repaid,
            remaining: row.remaining,
            dueDate: row.dueDate,
            overdue: row.overdue,
          })
        } else {
          prev.earnedBase += row.earnedBase
          prev.spent += row.spent
          prev.repaid += row.repaid
          prev.remaining += row.remaining
          prev.overdue = prev.overdue || row.overdue
          if (row.dueDate < prev.dueDate) prev.dueDate = row.dueDate
        }
      }
    }
    return [...byMonth.values()].sort((a, b) => b.month.localeCompare(a.month))
  }, [summary.cards])

  if (creditAccounts.length === 0) return null

  const currency = settings.baseCurrency
  const earnedColor =
    summary.totalEarnedBase > 0
      ? 'text-emerald-700'
      : summary.totalEarnedBase < 0
        ? 'text-red-600'
        : 'text-slate-800'

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <p className="text-sm text-slate-500">Выгода float</p>
          <p className={`mt-1 text-xl font-semibold ${earnedColor}`}>
            {signedAmount(summary.totalEarnedBase, currency)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Накопительно по связанным кошелькам (без переводов)
          </p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Долг по кредиткам</p>
          <p className="mt-1 text-xl font-semibold text-slate-900">
            {formatCurrency(
              summary.cards.reduce((s, c) => s + c.totalDebt, 0),
              currency,
            )}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Кредиток</p>
          <p className="mt-1 text-xl font-semibold text-slate-900">{creditAccounts.length}</p>
        </Card>
      </div>

      <Card>
        <h2 className="mb-1 text-sm font-semibold text-slate-800">Float по месяцам</h2>
        <p className="mb-3 text-xs text-slate-500">
          Заработано — прирост связанного кошелька за месяц. Траты месяца N закрыть до
          конца месяца N+3.
        </p>
        {months.length === 0 ? (
          <EmptyState
            title="Пока нет данных"
            description="Зафиксируйте остатки кредитки и связанного кошелька в чек-инах."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-500">
                  <th className="py-2 pr-3 font-medium">Месяц</th>
                  <th className="py-2 pr-3 font-medium">Заработано</th>
                  <th className="py-2 pr-3 font-medium">Траты</th>
                  <th className="py-2 pr-3 font-medium">Погашено</th>
                  <th className="py-2 pr-3 font-medium">К закрытию</th>
                  <th className="py-2 font-medium">Дедлайн</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {months.map((row) => {
                  const earnColor =
                    row.earnedBase > 0
                      ? 'text-emerald-700'
                      : row.earnedBase < 0
                        ? 'text-red-600'
                        : 'text-slate-700'
                  return (
                    <tr key={row.month} className={row.overdue ? 'bg-red-50/60' : undefined}>
                      <td className="py-2.5 pr-3 font-medium text-slate-900">
                        {formatMonthLabel(row.month)}
                      </td>
                      <td className={`py-2.5 pr-3 ${earnColor}`}>
                        {signedAmount(row.earnedBase, currency)}
                      </td>
                      <td className="py-2.5 pr-3 text-slate-700">
                        {formatCurrency(row.spent, currency)}
                      </td>
                      <td className="py-2.5 pr-3 text-slate-700">
                        {formatCurrency(row.repaid, currency)}
                      </td>
                      <td className="py-2.5 pr-3 text-slate-700">
                        {formatCurrency(row.remaining, currency)}
                      </td>
                      <td
                        className={`py-2.5 ${row.overdue ? 'font-medium text-red-700' : 'text-slate-700'}`}
                      >
                        {row.dueDate.slice(8, 10)}.{row.dueDate.slice(5, 7)}.
                        {row.dueDate.slice(0, 4)}
                        {row.overdue ? ' · просрочено' : ''}
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
