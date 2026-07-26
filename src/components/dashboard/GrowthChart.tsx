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
import { formatCompactAxisValue, formatCurrency, formatShortDate } from '../../lib/format'
import { Card } from '../ui/FormControls'

interface GrowthChartProps {
  data: { date: string; total?: number; balance?: number; growth: number }[]
  currency: string
  mode: 'total' | 'account'
}

export function GrowthChart({ data, currency, mode }: GrowthChartProps) {
  const rows = useMemo(
    () =>
      data.map((d) => ({
        ...d,
        label: formatShortDate(d.date),
        primary: mode === 'total' ? d.total : d.balance,
      })),
    [data, mode],
  )

  if (rows.length === 0) {
    return (
      <Card>
        <p className="text-sm text-slate-500">Пока нет точек для графика — сделайте первый чек-ин.</p>
      </Card>
    )
  }

  const primaryLabel = mode === 'total' ? 'Всего' : 'Остаток'
  const growthLabel = mode === 'total' ? 'Прирост' : 'Прирост (без переводов)'

  return (
    <Card className="!p-3 sm:!p-4">
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
                formatCurrency(value, currency),
                name === 'primary' ? primaryLabel : growthLabel,
              ]}
              labelFormatter={(_, payload) => {
                const date = payload?.[0]?.payload?.date as string | undefined
                return date ?? ''
              }}
            />
            <Legend
              formatter={(value) => (value === 'primary' ? primaryLabel : growthLabel)}
            />
            <Line
              type="monotone"
              dataKey="primary"
              name="primary"
              stroke="#2563eb"
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
            <Line
              type="monotone"
              dataKey="growth"
              name="growth"
              stroke="#059669"
              strokeWidth={2}
              strokeDasharray="4 4"
              dot={{ r: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
