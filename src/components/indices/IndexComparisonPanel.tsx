import { useEffect, useMemo, useState } from 'react'
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
import { buildIndexComparison } from '../../lib/indexComparison'
import { paddedDataDomain } from '../../lib/chartAxisDomain'
import { chartActiveDot, chartDot, chartTooltipStyles, getChartTheme } from '../../lib/chartTheme'
import { formatCompactAxisValue, formatCurrency, formatShortDate } from '../../lib/format'
import { usePeriodRange } from '../../lib/usePeriodRange'
import { useTheme } from '../../lib/useTheme'
import { useRatesStore } from '../../store/ratesStore'
import { useWalletStore } from '../../store/walletStore'
import { dataQa } from '../../lib/dataQa'
import { Card, EmptyState, Select } from '../ui/FormControls'
import { PageHeader } from '../ui/PageHeader'
import { PeriodFilter } from '../ui/PeriodFilter'

export function IndexComparisonPanel() {
  const accounts = useWalletStore((s) => s.accounts)
  const snapshots = useWalletStore((s) => s.snapshots)
  const transfers = useWalletStore((s) => s.transfers)
  const settings = useWalletStore((s) => s.settings)
  const indices = useWalletStore((s) => s.indices)
  const indexValues = useWalletStore((s) => s.indexValues)
  const rateBook = useRatesStore((s) => s.byDate)
  const { range } = usePeriodRange()
  const { mode } = useTheme()
  const chartTheme = useMemo(() => getChartTheme(), [mode])
  const [selectedId, setSelectedId] = useState('')

  const available = useMemo(
    () =>
      indices
        .filter((index) => indexValues.some((value) => value.indexId === index.id))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [indices, indexValues],
  )

  useEffect(() => {
    if (!available.some((index) => index.id === selectedId)) {
      setSelectedId(available[0]?.id ?? '')
    }
  }, [available, selectedId])

  const selected = available.find((index) => index.id === selectedId) ?? null
  const points = useMemo(
    () =>
      selected
        ? buildIndexComparison({
            index: selected,
            indexValues,
            accounts,
            snapshots,
            transfers,
            settings,
            rateBook,
            range,
          })
        : [],
    [selected, indexValues, accounts, snapshots, transfers, settings, rateBook, range],
  )
  const rows = useMemo(
    () => points.map((point) => ({ ...point, label: formatShortDate(point.date) })),
    [points],
  )
  const last = points.at(-1)

  return (
    <div className="mx-auto max-w-5xl space-y-4" {...dataQa('index-comparison-page')}>
      <PageHeader
        title="Сравнение с индексами"
        description="Сценарий инвестирует стартовый капитал и все переводы в портфель роста в выбранный индекс."
        actions={<PeriodFilter showRange />}
        showPrimary={false}
      />

      {available.length === 0 ? (
        <EmptyState
          title="Нет данных индексов"
          description="Добавьте индекс и зафиксируйте минимум одно значение на вкладке «Счета → Индексы»."
          dataQa="index-comparison-empty"
        />
      ) : (
        <>
          <Card className="!p-3 sm:!p-4">
            <label className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
              <span>Индекс</span>
              <Select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} className="w-full sm:w-auto sm:min-w-56" dataQa="index-comparison-select">
                {available.map((index) => (
                  <option key={index.id} value={index.id}>{index.name}</option>
                ))}
              </Select>
            </label>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Переводы между инвестиционными счетами исключаются. Перевод из обычного счёта в фонд, вклад или инвестиции покупает индекс по значению на дату перевода; обратный перевод продаёт его.
            </p>
          </Card>

          {last ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
              <Metric label="Фактически заработано" value={last.actualGrowth} currency={settings.baseCurrency} />
              <Metric label={`Заработал бы ${selected?.name ?? 'индекс'}`} value={last.indexGrowth} currency={settings.baseCurrency} />
              <Metric label="Факт минус индекс" value={last.difference} currency={settings.baseCurrency} className="col-span-2 sm:col-span-1" />
            </div>
          ) : null}

          {rows.length < 2 ? (
            <EmptyState
              title="Недостаточно общих дат"
              description="Для сравнения нужны хотя бы два чек-ина после первого значения индекса."
              dataQa="index-comparison-no-range"
            />
          ) : (
            <>
              <ComparisonChart
                title="Капитал"
                rows={rows}
                firstKey="actualTotal"
                firstLabel="Фактический портфель"
                secondKey="indexTotal"
                secondLabel={selected?.name ?? 'Индекс'}
                currency={settings.baseCurrency}
                chartTheme={chartTheme}
                dataQa="index-capital-chart"
              />
              <ComparisonChart
                title="Доход без пополнений"
                rows={rows}
                firstKey="actualGrowth"
                firstLabel="Фактический прирост"
                secondKey="indexGrowth"
                secondLabel="Прирост индекса"
                currency={settings.baseCurrency}
                chartTheme={chartTheme}
                dataQa="index-growth-chart"
              />
            </>
          )}
        </>
      )}
    </div>
  )
}

function Metric({ label, value, currency, className = '' }: { label: string; value: number; currency: string; className?: string }) {
  return (
    <Card className={`!p-3 ${className}`}>
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${value > 0 ? 'text-emerald-700 dark:text-emerald-400' : value < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-slate-200'}`}>
        {formatCurrency(value, currency)}
      </p>
    </Card>
  )
}

type ChartRow = ReturnType<typeof buildIndexComparison>[number] & { label: string }
type ChartKey = 'actualTotal' | 'indexTotal' | 'actualGrowth' | 'indexGrowth'

function ComparisonChart({
  title,
  rows,
  firstKey,
  firstLabel,
  secondKey,
  secondLabel,
  currency,
  chartTheme,
  dataQa: qa,
}: {
  title: string
  rows: ChartRow[]
  firstKey: ChartKey
  firstLabel: string
  secondKey: ChartKey
  secondLabel: string
  currency: string
  chartTheme: ReturnType<typeof getChartTheme>
  dataQa: string
}) {
  const secondColor = '#d97706'
  return (
    <Card className="!p-3 sm:!p-4" dataQa={qa}>
      <h2 className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-200">{title}</h2>
      <div className="h-64 w-full sm:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: chartTheme.tick }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 11, fill: chartTheme.tick }} tickFormatter={formatCompactAxisValue} width={50} domain={paddedDataDomain} />
            <Tooltip
              {...chartTooltipStyles(chartTheme)}
              formatter={(value: number, name: string) => [formatCurrency(value, currency), name]}
              labelFormatter={(_, payload) => payload?.[0]?.payload?.date ?? ''}
            />
            <Legend />
            <Line type="monotone" dataKey={firstKey} name={firstLabel} stroke={chartTheme.primaryLine} strokeWidth={2} dot={chartDot(chartTheme, chartTheme.primaryLine)} activeDot={chartActiveDot(chartTheme, chartTheme.primaryLine)} />
            <Line type="monotone" dataKey={secondKey} name={secondLabel} stroke={secondColor} strokeWidth={2} dot={chartDot(chartTheme, secondColor)} activeDot={chartActiveDot(chartTheme, secondColor)} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
