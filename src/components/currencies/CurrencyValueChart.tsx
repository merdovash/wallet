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
import { formatCompactAxisValue, formatCurrency, formatShortDate } from '../../lib/format'
import { useRatesStore } from '../../store/ratesStore'
import { useWalletStore } from '../../store/walletStore'
import { Card, EmptyState } from '../ui/FormControls'

const LINE_COLORS = ['#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2']

interface CurrencyValueChartProps {
  foreignOnly?: boolean
}

export function CurrencyValueChart({ foreignOnly = true }: CurrencyValueChartProps) {
  const accounts = useWalletStore((s) => s.accounts)
  const snapshots = useWalletStore((s) => s.snapshots)
  const settings = useWalletStore((s) => s.settings)
  const rateBook = useRatesStore((s) => s.byDate)

  const { currencies, points } = useMemo(
    () => buildCurrencyValueSeries(accounts, snapshots, settings, rateBook, { foreignOnly }),
    [accounts, snapshots, settings, rateBook, foreignOnly],
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
        <p className="text-sm text-slate-500">Пока нет чек-инов для графика.</p>
      </Card>
    )
  }

  return (
    <Card className="!p-3 sm:!p-4">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-slate-800">Стоимость валютных счетов</h2>
        <p className="text-xs text-slate-500">
          В {settings.baseCurrency} по курсам на даты чек-инов
        </p>
      </div>
      <div className="h-64 w-full sm:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} interval="preserveStartEnd" />
            <YAxis
              tick={{ fontSize: 11, fill: '#64748b' }}
              tickFormatter={formatCompactAxisValue}
              width={48}
            />
            <Tooltip
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
