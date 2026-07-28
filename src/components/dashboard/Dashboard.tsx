import { useEffect, useMemo, useState } from 'react'
import {
  buildTotalSeries,
  periodGrowth,
  snapshotDates,
  totalOnDate,
} from '../../engine/growthEngine'
import { todayIsoDate } from '../../lib/format'
import { buildPeriodReturn } from '../../lib/monthlyReturns'
import { useRatesStore } from '../../store/ratesStore'
import { useWalletStore } from '../../store/walletStore'
import { Button } from '../ui/FormControls'
import { CheckInPanel } from '../snapshots/CheckInPanel'
import { CreditFloatSummary } from './CreditFloatSummary'
import { CurrencyReportTable } from './CurrencyReportTable'
import { GrowthChart } from './GrowthChart'
import { SummaryCards } from './SummaryCards'

interface DashboardProps {
  onOpenAccount: (accountId: string) => void
}

export function Dashboard({ onOpenAccount }: DashboardProps) {
  const accounts = useWalletStore((s) => s.accounts)
  const snapshots = useWalletStore((s) => s.snapshots)
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
  const periodReturn = useMemo(
    () => buildPeriodReturn(accounts, snapshots, settings, rateBook),
    [accounts, snapshots, settings, rateBook],
  )

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Дашборд</h1>
          <p className="text-sm text-slate-500">Остатки и прирост без учёта переводов между счетами</p>
        </div>
        <Button type="button" onClick={() => setCheckInOpen(true)}>
          Чек-ин
        </Button>
      </div>

      <SummaryCards
        total={total}
        growth={growth}
        currency={settings.baseCurrency}
        periodReturn={periodReturn}
      />

      <CreditFloatSummary />

      <GrowthChart
        data={series}
        currency={settings.baseCurrency}
        mode="total"
        accounts={accounts}
        snapshots={snapshots}
        settings={settings}
        rateBook={rateBook}
      />

      <CurrencyReportTable
        accountCount={activeAccounts.length}
        onOpenAccount={onOpenAccount}
      />

      <CheckInPanel open={checkInOpen} onClose={() => setCheckInOpen(false)} />
    </div>
  )
}
