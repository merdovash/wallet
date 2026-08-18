import { useEffect, useMemo, useState } from 'react'
import {
  buildNetWorthSeries,
  buildTotalSeries,
  periodGrowth,
  snapshotDates,
  totalOnDate,
} from '../../engine/growthEngine'
import {
  buildCheckInReminderStatus,
  formatDaysRu,
  readCheckInIntervalDays,
} from '../../lib/checkInReminder'
import { slicePeriodSeries } from '../../lib/dashboardPeriod'
import { formatDateDisplay, todayIsoDate } from '../../lib/format'
import { buildPeriodReturn } from '../../lib/monthlyReturns'
import { buildPersonalCoefficients } from '../../lib/personalCoefficients'
import { usePeriodRange } from '../../lib/usePeriodRange'
import { useFxModeStore } from '../../store/fxModeStore'
import { useRatesStore } from '../../store/ratesStore'
import { useWalletStore } from '../../store/walletStore'
import { Button } from '../ui/FormControls'
import { FxModeToggle } from '../ui/FxModeToggle'
import { PeriodFilter } from '../ui/PeriodFilter'
import { CheckInPanel } from '../snapshots/CheckInPanel'
import { CreditFloatSummary } from './CreditFloatSummary'
import { CurrencyReportTable } from './CurrencyReportTable'
import { GrowthChart } from './GrowthChart'
import { ChartSeriesToggle } from './ChartSeriesToggle'
import { PersonalCoefficientsPanel } from './PersonalCoefficientsPanel'
import { SummaryCards } from './SummaryCards'

/** После стольких чек-инов показываем расширенные виджеты по умолчанию. */
const ADVANCED_DASHBOARD_AFTER_CHECKINS = 3

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
  const fxMode = useFxModeStore((s) => s.fxMode)
  const { range: selectedRange } = usePeriodRange()
  const [checkInOpen, setCheckInOpen] = useState(false)
  const [chartSeries, setChartSeries] = useState<'growth' | 'netWorth'>('growth')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [intervalDays, setIntervalDays] = useState(readCheckInIntervalDays)

  const activeAccounts = useMemo(() => accounts.filter((a) => !a.archived), [accounts])
  const dates = useMemo(() => snapshotDates(snapshots), [snapshots])
  const latestDate = dates[dates.length - 1]
  const manualCheckInCount = useMemo(
    () => snapshots.filter((s) => (s.origin ?? 'manual') === 'manual').length,
    [snapshots],
  )
  const advancedUnlocked = manualCheckInCount >= ADVANCED_DASHBOARD_AFTER_CHECKINS
  const showAdvancedWidgets = advancedUnlocked || showAdvanced

  useEffect(() => {
    void ensureRates([...dates, todayIsoDate()])
  }, [dates, ensureRates])

  useEffect(() => {
    function onStorage() {
      setIntervalDays(readCheckInIntervalDays())
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener('wallet-checkin-interval-changed', onStorage)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('wallet-checkin-interval-changed', onStorage)
    }
  }, [])

  const reminder = useMemo(
    () => buildCheckInReminderStatus(snapshots, intervalDays, todayIsoDate()),
    [snapshots, intervalDays],
  )

  const range = selectedRange ?? undefined

  const total = useMemo(
    () =>
      latestDate
        ? totalOnDate(latestDate, accounts, snapshots, settings, { rateBook })
        : 0,
    [latestDate, accounts, snapshots, settings, rateBook],
  )
  const fullSeries = useMemo(
    () => buildTotalSeries(accounts, snapshots, settings, rateBook, transfers, fxMode),
    [accounts, snapshots, settings, rateBook, transfers, fxMode],
  )
  const fullNetWorthSeries = useMemo(
    () => buildNetWorthSeries(accounts, snapshots, settings, rateBook),
    [accounts, snapshots, settings, rateBook],
  )
  const activeFullSeries = chartSeries === 'netWorth' ? fullNetWorthSeries : fullSeries
  const series = useMemo(
    () => (range ? slicePeriodSeries(activeFullSeries, range) : activeFullSeries),
    [activeFullSeries, range],
  )
  const periodReturn = useMemo(
    () => buildPeriodReturn(accounts, snapshots, settings, rateBook, transfers, range),
    [accounts, snapshots, settings, rateBook, transfers, range],
  )
  const growth = useMemo(() => {
    if (periodReturn) return periodReturn.growth
    if (range) return series.length > 0 ? series[series.length - 1]!.growth : 0
    return periodGrowth(accounts, snapshots, settings, rateBook, transfers, fxMode)
  }, [periodReturn, range, series, accounts, snapshots, settings, rateBook, transfers, fxMode])

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

  function openCheckIn() {
    setCheckInOpen(true)
  }

  return (
    <div className="mx-auto max-w-5xl space-y-3">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h1 className="min-w-0 truncate text-lg font-semibold text-slate-900 dark:text-slate-200 sm:text-xl">
            Дашборд
          </h1>
          <Button type="button" className="shrink-0 !px-3 !py-1.5 text-sm" onClick={openCheckIn}>
            Чек-ин
          </Button>
        </div>
        <PeriodFilter showRange />
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <FxModeToggle showLabel={false} compact />
          <ChartSeriesToggle value={chartSeries} onChange={setChartSeries} />
        </div>
      </div>

      <CheckInReminderBanner reminder={reminder} onCheckIn={openCheckIn} />

      <SummaryCards
        total={total}
        growth={growth}
        currency={settings.baseCurrency}
        periodReturn={periodReturn}
        annualInflationPct={settings.annualInflationPct}
      />

      <GrowthChart
        data={series}
        currency={settings.baseCurrency}
        mode="total"
        seriesKind={chartSeries}
        onSeriesKindChange={setChartSeries}
        hideSeriesToggle
        accounts={accounts}
        snapshots={snapshots}
        settings={settings}
        rateBook={rateBook}
      />

      {!showAdvancedWidgets ? (
        <button
          type="button"
          onClick={() => setShowAdvanced(true)}
          className="w-full rounded-xl border border-dashed border-slate-300 px-3 py-2.5 text-sm text-slate-600 hover:border-slate-400 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:bg-slate-800/50"
        >
          Показать дополнительные виджеты
        </button>
      ) : (
        <>
          <PersonalCoefficientsPanel coefficients={personalCoefficients} />
          <CreditFloatSummary />
          <CurrencyReportTable
            accountCount={activeAccounts.length}
            onOpenAccount={onOpenAccount}
          />
          {!advancedUnlocked && (
            <button
              type="button"
              onClick={() => setShowAdvanced(false)}
              className="text-xs text-slate-500 hover:underline dark:text-slate-400"
            >
              Скрыть дополнительные виджеты
            </button>
          )}
        </>
      )}

      <CheckInPanel
        open={checkInOpen}
        onClose={() => setCheckInOpen(false)}
      />
    </div>
  )
}

function CheckInReminderBanner({
  reminder,
  onCheckIn,
}: {
  reminder: ReturnType<typeof buildCheckInReminderStatus>
  onCheckIn: () => void
}) {
  if (reminder.kind === 'ok') return null

  const title =
    reminder.kind === 'empty'
      ? 'Сделайте первый чек-ин'
      : reminder.daysOverdue === 0
        ? 'Пора сделать чек-ин'
        : `Чек-ин просрочен на ${formatDaysRu(reminder.daysOverdue)}`

  const detail =
    reminder.kind === 'empty'
      ? `Цель — раз в ${formatDaysRu(reminder.intervalDays)}. Зафиксируйте остатки, чтобы считать прирост.`
      : `Последний ${formatDateDisplay(reminder.latestDate)} · интервал ${formatDaysRu(reminder.intervalDays)}`

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-900/50 dark:bg-amber-950/25">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">{title}</p>
        <p className="mt-0.5 text-xs text-amber-900/80 dark:text-amber-200/80">{detail}</p>
      </div>
      <Button type="button" className="shrink-0 !px-3 !py-1.5 text-sm" onClick={onCheckIn}>
        Чек-ин
      </Button>
    </div>
  )
}
