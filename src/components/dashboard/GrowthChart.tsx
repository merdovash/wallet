import { useMemo, useState } from 'react'
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
import type { RateBook } from '../../engine/growthEngine'
import { getChartTheme } from '../../lib/chartTheme'
import { formatCompactAxisValue, formatCurrency, formatShortDate } from '../../lib/format'
import { useTheme } from '../../lib/useTheme'
import type { Account, AccountPoint, BalanceSnapshot, TotalPoint, WalletSettings } from '../../types/wallet'
import { Card } from '../ui/FormControls'
import { DayTotalsPanel } from './DayTotalsPanel'

export type GrowthChartSeriesKind = 'growth' | 'netWorth'

interface GrowthChartProps {
  data: TotalPoint[] | AccountPoint[]
  currency: string
  mode: 'total' | 'account'
  /** Dashboard total chart: growth portfolio vs full net worth. */
  seriesKind?: GrowthChartSeriesKind
  onSeriesKindChange?: (kind: GrowthChartSeriesKind) => void
  accounts?: Account[]
  snapshots?: BalanceSnapshot[]
  settings?: WalletSettings
  rateBook?: RateBook
  accountId?: string | null
}

export function GrowthChart({
  data,
  currency,
  mode,
  seriesKind = 'growth',
  onSeriesKindChange,
  accounts = [],
  snapshots = [],
  settings,
  rateBook,
  accountId = null,
}: GrowthChartProps) {
  const { mode: themeMode } = useTheme()
  const chartTheme = useMemo(() => getChartTheme(), [themeMode])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const rows = useMemo(
    () =>
      data.map((d) => ({
        ...d,
        label: formatShortDate(d.date),
        primary: mode === 'total' ? (d as TotalPoint).total : (d as AccountPoint).balance,
      })),
    [data, mode],
  )

  if (rows.length === 0) {
    return (
      <Card>
        <p className="text-sm text-slate-500 dark:text-slate-400">Пока нет точек для графика — сделайте первый чек-ин.</p>
      </Card>
    )
  }

  const primaryLabel =
    mode === 'total'
      ? seriesKind === 'netWorth'
        ? 'Чистая стоимость'
        : 'Капитал роста'
      : 'Остаток'
  const growthLabel =
    mode === 'total'
      ? seriesKind === 'netWorth'
        ? 'Изменение с начала'
        : 'Прирост (фонды/вклады/инвест.)'
      : 'Прирост (без переводов)'
  const canToggleSeries = mode === 'total' && onSeriesKindChange != null
  const canOpenDay = Boolean(settings)

  function selectDate(date: string | undefined) {
    if (!date || !canOpenDay) return
    setSelectedDate(date)
  }

  return (
    <>
      <Card className="!p-3 sm:!p-4">
        {canToggleSeries && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900">
              <button
                type="button"
                onClick={() => onSeriesKindChange?.('growth')}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  seriesKind === 'growth'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                Портфель роста
              </button>
              <button
                type="button"
                onClick={() => onSeriesKindChange?.('netWorth')}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  seriesKind === 'netWorth'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                Вся чистая стоимость
              </button>
            </div>
          </div>
        )}
        {canOpenDay && (
          <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">Нажмите на точку или дату, чтобы открыть итоги.</p>
        )}
        <div className="h-64 w-full sm:h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={rows}
              margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
              onClick={(state) => {
                const date = state?.activePayload?.[0]?.payload?.date as string | undefined
                selectDate(date)
              }}
              style={{ cursor: canOpenDay ? 'pointer' : undefined }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: chartTheme.tick }} interval="preserveStartEnd" />
              <YAxis
                yAxisId="primary"
                tick={{ fontSize: 11, fill: chartTheme.tick }}
                tickFormatter={formatCompactAxisValue}
                width={48}
              />
              <YAxis
                yAxisId="growth"
                orientation="right"
                tick={{ fontSize: 11, fill: chartTheme.growthTick }}
                tickFormatter={formatCompactAxisValue}
                width={48}
                domain={([dataMin, dataMax]) => {
                  const min = Number.isFinite(dataMin) ? dataMin : 0
                  const max = Number.isFinite(dataMax) ? dataMax : 0
                  if (min === max) {
                    const pad = Math.max(Math.abs(min) * 0.15, 1)
                    return [min - pad, max + pad]
                  }
                  const pad = (max - min) * 0.12
                  return [min - pad, max + pad]
                }}
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
                yAxisId="primary"
                type="monotone"
                dataKey="primary"
                name="primary"
                stroke={chartTheme.primaryLine}
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 6 }}
              />
              <Line
                yAxisId="growth"
                type="monotone"
                dataKey="growth"
                name="growth"
                stroke={chartTheme.growthLine}
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={{ r: 3 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {settings && (
        <DayTotalsPanel
          open={!!selectedDate}
          date={selectedDate}
          onClose={() => setSelectedDate(null)}
          mode={mode}
          accounts={accounts}
          snapshots={snapshots}
          settings={settings}
          rateBook={rateBook}
          series={data}
          accountId={accountId}
        />
      )}
    </>
  )
}
