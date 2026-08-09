import { useEffect, useMemo, useState } from 'react'
import {
  buildTotalSeries,
  periodGrowth,
  snapshotDates,
  totalOnDate,
} from '../../engine/growthEngine'
import {
  DASHBOARD_PERIOD_OPTIONS,
  resolveDashboardPeriod,
  slicePeriodSeries,
  type DashboardPeriodKey,
} from '../../lib/dashboardPeriod'
import { formatDateDisplay, todayIsoDate } from '../../lib/format'
import { buildPeriodReturn } from '../../lib/monthlyReturns'
import { buildPersonalCoefficients } from '../../lib/personalCoefficients'
import { useRatesStore } from '../../store/ratesStore'
import { useWalletStore } from '../../store/walletStore'
import { Button } from '../ui/FormControls'
import { CheckInPanel } from '../snapshots/CheckInPanel'
import { CreditFloatSummary } from './CreditFloatSummary'
import { CurrencyReportTable } from './CurrencyReportTable'
import { GrowthChart } from './GrowthChart'
import { PersonalCoefficientsPanel } from './PersonalCoefficientsPanel'
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
  const [periodKey, setPeriodKey] = useState<DashboardPeriodKey>('all')

  const activeAccounts = useMemo(() => accounts.filter((a) => !a.archived), [accounts])
  const dates = useMemo(() => snapshotDates(snapshots), [snapshots])
  const latestDate = dates[dates.length - 1]

  useEffect(() => {
    void ensureRates([...dates, todayIsoDate()])
  }, [dates, ensureRates])

  const range = useMemo(
    () => (periodKey === 'all' ? undefined : (resolveDashboardPeriod(periodKey, dates) ?? undefined)),
    [periodKey, dates],
  )

  const total = useMemo(
    () =>
      latestDate
        ? totalOnDate(latestDate, accounts, snapshots, settings, { rateBook })
        : 0,
    [latestDate, accounts, snapshots, settings, rateBook],
  )
  const fullSeries = useMemo(
    () => buildTotalSeries(accounts, snapshots, settings, rateBook, transfers),
    [accounts, snapshots, settings, rateBook, transfers],
  )
  const series = useMemo(
    () => (range ? slicePeriodSeries(fullSeries, range) : fullSeries),
    [fullSeries, range],
  )
  const periodReturn = useMemo(
    () => buildPeriodReturn(accounts, snapshots, settings, rateBook, transfers, range),
    [accounts, snapshots, settings, rateBook, transfers, range],
  )
  const growth = useMemo(() => {
    if (periodReturn) return periodReturn.growth
    if (range) return series.length > 0 ? series[series.length - 1]!.growth : 0
    return periodGrowth(accounts, snapshots, settings, rateBook, transfers)
  }, [periodReturn, range, series, accounts, snapshots, settings, rateBook, transfers])

  const personalCoefficients = useMemo(() => {
    if (!periodReturn) return null
    return buildPersonalCoefficients(
      accounts,
      snapshots,
      settings,
      rateBook,
      periodReturn.startDate,
      periodReturn.endDate,
      periodReturn.netFlow,
    )
  }, [accounts, snapshots, settings, rateBook, periodReturn])

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Дашборд</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Остаток — все счета. «В годовых» — портфель роста. «Годовых от массы» — прирост ÷ вся
            масса
          </p>
        </div>
        <Button type="button" onClick={() => setCheckInOpen(true)}>
          Чек-ин
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900">
          {DASHBOARD_PERIOD_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setPeriodKey(option.key)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition sm:text-sm ${
                periodKey === option.key
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        {periodReturn && (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {formatDateDisplay(periodReturn.startDate)} → {formatDateDisplay(periodReturn.endDate)}
          </span>
        )}
      </div>

      <SummaryCards
        total={total}
        growth={growth}
        currency={settings.baseCurrency}
        periodReturn={periodReturn}
      />

      <PersonalCoefficientsPanel
        coefficients={personalCoefficients}
        currency={settings.baseCurrency}
        periodLabel={
          periodReturn
            ? `${formatDateDisplay(periodReturn.startDate)} → ${formatDateDisplay(periodReturn.endDate)}`
            : undefined
        }
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
