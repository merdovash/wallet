import { useEffect, useMemo, useState } from 'react'
import {
  buildTotalSeries,
  periodGrowth,
  snapshotDates,
  summarizeAccounts,
  totalOnDate,
} from '../../engine/growthEngine'
import { formatCurrency, signedAmount, todayIsoDate } from '../../lib/format'
import { useRatesStore } from '../../store/ratesStore'
import { useWalletStore } from '../../store/walletStore'
import { Button, Card, EmptyState } from '../ui/FormControls'
import { CheckInPanel } from '../snapshots/CheckInPanel'
import { GrowthChart } from './GrowthChart'
import { SummaryCards } from './SummaryCards'

interface DashboardProps {
  onOpenAccount: (accountId: string) => void
}

export function Dashboard({ onOpenAccount }: DashboardProps) {
  const accounts = useWalletStore((s) => s.accounts)
  const snapshots = useWalletStore((s) => s.snapshots)
  const transfers = useWalletStore((s) => s.transfers)
  const settings = useWalletStore((s) => s.settings)
  const rateBook = useRatesStore((s) => s.byDate)
  const ensureRates = useRatesStore((s) => s.ensureRates)
  const [checkInOpen, setCheckInOpen] = useState(false)

  const activeAccounts = useMemo(() => accounts.filter((a) => !a.archived), [accounts])
  const dates = useMemo(() => snapshotDates(snapshots), [snapshots])
  const latestDate = dates[dates.length - 1]

  useEffect(() => {
    void ensureRates([...dates, todayIsoDate()])
  }, [dates, ensureRates])

  const total = useMemo(
    () =>
      latestDate
        ? totalOnDate(latestDate, accounts, snapshots, settings, { rateBook })
        : 0,
    [latestDate, accounts, snapshots, settings, rateBook],
  )
  const growth = useMemo(
    () => periodGrowth(accounts, snapshots, settings, rateBook),
    [accounts, snapshots, settings, rateBook],
  )
  const series = useMemo(
    () => buildTotalSeries(accounts, snapshots, settings, rateBook),
    [accounts, snapshots, settings, rateBook],
  )
  const summaries = useMemo(
    () => summarizeAccounts(accounts, snapshots, transfers, settings, rateBook),
    [accounts, snapshots, transfers, settings, rateBook],
  )

  const accountMap = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Обзор</h1>
          <p className="text-sm text-slate-500">Остатки и прирост без учёта переводов между счетами</p>
        </div>
        <Button type="button" onClick={() => setCheckInOpen(true)}>
          Чек-ин
        </Button>
      </div>

      <SummaryCards
        total={total}
        growth={growth}
        accountCount={activeAccounts.length}
        currency={settings.baseCurrency}
      />

      <GrowthChart data={series} currency={settings.baseCurrency} mode="total" />

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-slate-800">Счета</h2>
        {summaries.length === 0 ? (
          <EmptyState
            title="Нет счетов"
            description="Добавьте счета во вкладке «Счета», затем зафиксируйте остатки через чек-ин."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {summaries.map((row) => {
              const account = accountMap.get(row.accountId)
              if (!account) return null
              const growthColor =
                row.growthBase > 0
                  ? 'text-emerald-700'
                  : row.growthBase < 0
                    ? 'text-red-600'
                    : 'text-slate-600'
              return (
                <li key={row.accountId}>
                  <button
                    type="button"
                    onClick={() => onOpenAccount(row.accountId)}
                    className="flex w-full items-center gap-3 py-3 text-left hover:bg-slate-50"
                  >
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: account.color }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-slate-900">{account.name}</span>
                      <span className="text-xs text-slate-500">{account.currency}</span>
                    </span>
                    <span className="text-right">
                      <span className="block font-medium text-slate-900">
                        {formatCurrency(row.balance, account.currency)}
                      </span>
                      {account.currency !== settings.baseCurrency && (
                        <span className="block text-xs text-slate-500">
                          ≈ {formatCurrency(row.balanceBase, settings.baseCurrency)}
                        </span>
                      )}
                      <span className={`block text-xs ${growthColor}`}>
                        {signedAmount(row.growth, account.currency)}
                      </span>
                      {account.currency !== settings.baseCurrency && (
                        <span className={`block text-xs ${growthColor} opacity-80`}>
                          ≈ {signedAmount(row.growthBase, settings.baseCurrency)}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <CheckInPanel open={checkInOpen} onClose={() => setCheckInOpen(false)} />
    </div>
  )
}
