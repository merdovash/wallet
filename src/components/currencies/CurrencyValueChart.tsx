import { useMemo } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { buildCurrencyValueSeries } from '../../lib/currencyValueSeries'
import { chartTooltipStyles, getChartTheme } from '../../lib/chartTheme'
import { formatCompactAxisValue, formatCurrency, formatShortDate } from '../../lib/format'
import { useTheme } from '../../lib/useTheme'
import { useRatesStore } from '../../store/ratesStore'
import { useWalletStore } from '../../store/walletStore'
import { Card, EmptyState } from '../ui/FormControls'

const LINE_COLORS = ['#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2']

export function CurrencyValueChart() {
  const accounts = useWalletStore((s) => s.accounts)
  const snapshots = useWalletStore((s) => s.snapshots)
  const settings = useWalletStore((s) => s.settings)
  const rateBook = useRatesStore((s) => s.byDate)
  const { mode: themeMode } = useTheme()
  const chartTheme = useMemo(() => getChartTheme(), [themeMode])

  const { currencies, points } = useMemo(
    () =>
      buildCurrencyValueSeries(accounts, snapshots, settings, rateBook, { foreignOnly: true }),
    [accounts, snapshots, settings, rateBook],
  )

  const rows = useMemo(
    () =>
      points.map((p) => ({
        date: p.date,
        label: formatShortDate(p.date),
        ...p.values,
      })),
    [points],
  )

  if (currencies.length === 0) {
    return (
      <Card>
        <EmptyState
          title="Нет валютных счетов"
          description="Добавьте счёт в валюте, отличной от базовой, чтобы увидеть динамику стоимости."
        />
      </Card>
    )
  }

  if (rows.length === 0) {
    return (
      <Card>
        <p className="text-sm text-slate-500 dark:text-slate-400">Пока нет чек-инов для графика.</p>
      </Card>
    )
  }

  return (
    <Card className="!p-3 sm:!p-4">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Стоимость валютных счетов</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          В {settings.baseCurrency} по курсам на даты чек-инов · без {settings.baseCurrency}
        </p>
      </div>
      <div className="h-64 w-full sm:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: chartTheme.tick }} interval="preserveStartEnd" />
            <YAxis
              tick={{ fontSize: 11, fill: chartTheme.tick }}
              tickFormatter={formatCompactAxisValue}
              width={48}
            />
            <Tooltip
              {...chartTooltipStyles(chartTheme)}
              formatter={(value: number, name: string) => [
                formatCurrency(value, settings.baseCurrency),
                name,
              ]}
              labelFormatter={(_, payload) => {
                const date = payload?.[0]?.payload?.date as string | undefined
                return date ?? ''
              }}
            />
            <Legend />
            {currencies.map((currency, index) => (
              <Line
                key={currency}
                type="monotone"
                dataKey={currency}
                name={currency}
                stroke={LINE_COLORS[index % LINE_COLORS.length]}
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
