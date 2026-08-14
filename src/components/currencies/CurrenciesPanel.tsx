import { useEffect, useMemo, useState } from 'react'
import { snapshotDates } from '../../engine/growthEngine'
import {
  buildCurrencyFxBreakdown,
  buildCurrencyValueSeries,
  summarizeCurrencyValueChange,
} from '../../lib/currencyValueSeries'
import { formatCurrency, formatPercent, formatShortDate, signedAmount, todayIsoDate } from '../../lib/format'
import { useRatesStore } from '../../store/ratesStore'
import { useWalletStore } from '../../store/walletStore'
import { CurrencyReportTable } from '../dashboard/CurrencyReportTable'
import { Card } from '../ui/FormControls'
import { CurrencyFxBreakdownPanel } from './CurrencyFxBreakdownPanel'
import { CurrencyValueChart } from './CurrencyValueChart'

interface CurrenciesPanelProps {
  onOpenAccount: (accountId: string) => void
}

export function CurrenciesPanel({ onOpenAccount }: CurrenciesPanelProps) {
  const accounts = useWalletStore((s) => s.accounts)
  const snapshots = useWalletStore((s) => s.snapshots)
  const settings = useWalletStore((s) => s.settings)
  const rateBook = useRatesStore((s) => s.byDate)
  const ensureRates = useRatesStore((s) => s.ensureRates)
  const [breakdownOpen, setBreakdownOpen] = useState(false)

  const activeAccounts = useMemo(() => accounts.filter((a) => !a.archived), [accounts])
  const foreignAccounts = useMemo(
    () => activeAccounts.filter((a) => a.currency !== settings.baseCurrency),
    [activeAccounts, settings.baseCurrency],
  )
  const dates = useMemo(() => snapshotDates(snapshots), [snapshots])
  const foreignCurrencyCount = useMemo(
    () => new Set(foreignAccounts.map((a) => a.currency)).size,
    [foreignAccounts],
  )

  const change = useMemo(() => {
    const { points } = buildCurrencyValueSeries(accounts, snapshots, settings, rateBook, {
      foreignOnly: true,
    })
    return summarizeCurrencyValueChange(points)
  }, [accounts, snapshots, settings, rateBook])

  const breakdown = useMemo(
    () => buildCurrencyFxBreakdown(accounts, snapshots, settings, rateBook),
    [accounts, snapshots, settings, rateBook],
  )

  useEffect(() => {
    void ensureRates([...dates, todayIsoDate()])
  }, [dates, ensureRates])

  const absColor =
    (change?.absolute ?? 0) > 0
      ? 'text-emerald-700 dark:text-emerald-400'
      : (change?.absolute ?? 0) < 0
        ? 'text-red-600'
        : 'text-slate-800 dark:text-slate-200'
  const relColor =
    (change?.relative ?? 0) > 0
      ? 'text-emerald-700 dark:text-emerald-400'
      : (change?.relative ?? 0) < 0
        ? 'text-red-600'
        : 'text-slate-800 dark:text-slate-200'

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-200">Валюты</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Эквивалент иностранных валют в {settings.baseCurrency} (без {settings.baseCurrency})
          {foreignCurrencyCount > 0 ? ` · ${foreignCurrencyCount} вал.` : ''}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <button
          type="button"
          onClick={() => setBreakdownOpen(true)}
          className="rounded-xl text-left transition hover:ring-2 hover:ring-blue-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          title="Показать расшифровку курсовой разницы"
        >
          <Card className="!p-2.5 sm:!p-3">
            <p className="text-xs text-slate-500 dark:text-slate-400 sm:text-sm">Курсовая разница</p>
            <p className={`mt-0.5 text-base font-semibold tabular-nums sm:text-lg ${absColor}`}>
              {change ? signedAmount(change.absolute, settings.baseCurrency) : '—'}
            </p>
            <p className="mt-1 text-[10px] text-blue-600">
              {change
                ? `${formatShortDate(change.fromDate)} → ${formatShortDate(change.toDate)} · как считается`
                : 'от первой даты'}
            </p>
          </Card>
        </button>
        <button
          type="button"
          onClick={() => setBreakdownOpen(true)}
          className="rounded-xl text-left transition hover:ring-2 hover:ring-blue-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          title="Показать расшифровку курсовой разницы"
        >
          <Card className="!p-2.5 sm:!p-3">
            <p className="text-xs text-slate-500 dark:text-slate-400 sm:text-sm">Курсовая разница %</p>
            <p className={`mt-0.5 text-base font-semibold tabular-nums sm:text-lg ${relColor}`}>
              {formatPercent(change?.relative)}
            </p>
            <p className="mt-1 text-[10px] text-blue-600">
              {change
                ? `от ${formatCurrency(change.startTotal, settings.baseCurrency)} · как считается`
                : 'от первой даты'}
            </p>
          </Card>
        </button>
      </div>

      <CurrencyValueChart />

      <CurrencyReportTable
        accountCount={foreignAccounts.length}
        onOpenAccount={onOpenAccount}
        foreignOnly
        allKindsGrowth
        growthColumnLabel="Курсовая разница"
      />

      <CurrencyFxBreakdownPanel
        open={breakdownOpen}
        onClose={() => setBreakdownOpen(false)}
        breakdown={breakdown}
        baseCurrency={settings.baseCurrency}
      />
    </div>
  )
}
