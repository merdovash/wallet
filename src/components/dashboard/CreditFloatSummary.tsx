import { useMemo } from 'react'
import { buildAllCreditFloatSummaries } from '../../engine/creditFloatEngine'
import { formatCurrency, signedAmount, todayIsoDate } from '../../lib/format'
import { useRatesStore } from '../../store/ratesStore'
import { useWalletStore } from '../../store/walletStore'
import { Card } from '../ui/FormControls'

/** Compact float widgets for the dashboard (no monthly table, no card counter). */
export function CreditFloatSummary() {
  const accounts = useWalletStore((s) => s.accounts)
  const snapshots = useWalletStore((s) => s.snapshots)
  const transfers = useWalletStore((s) => s.transfers)
  const settings = useWalletStore((s) => s.settings)
  const rateBook = useRatesStore((s) => s.byDate)

  const hasCredit = useMemo(
    () => accounts.some((a) => !a.archived && a.kind === 'credit'),
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

  if (!hasCredit) return null

  const currency = settings.baseCurrency
  const earnedColor =
    summary.totalEarnedBase > 0
      ? 'text-emerald-700'
      : summary.totalEarnedBase < 0
        ? 'text-red-600'
        : 'text-slate-800'

  return (
    <div className="grid gap-3 sm:grid-cols-2">
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
    </div>
  )
}
