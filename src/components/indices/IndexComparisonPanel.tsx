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
import {
  buildIndexComparison,
  type IndexComparisonPoint,
} from '../../lib/indexComparison'
import {
  isCashbackKind,
  isCreditKind,
  isGrowthPortfolioAccount,
} from '../../lib/accountKinds'
import { paddedDataDomain } from '../../lib/chartAxisDomain'
import {
  chartActiveDot,
  chartDot,
  chartTooltipStyles,
  getChartTheme,
} from '../../lib/chartTheme'
import { dataQa } from '../../lib/dataQa'
import {
  formatCompactAxisValue,
  formatCurrency,
  formatShortDate,
} from '../../lib/format'
import { latestIndexValue, resolveIndexCurrency } from '../../lib/marketIndex'
import { usePeriodRange } from '../../lib/usePeriodRange'
import { useTheme } from '../../lib/useTheme'
import { useRatesStore } from '../../store/ratesStore'
import { useWalletStore } from '../../store/walletStore'
import type { MarketIndex } from '../../types/wallet'
import { Card, EmptyState } from '../ui/FormControls'
import { PageHeader } from '../ui/PageHeader'
import { PeriodFilter } from '../ui/PeriodFilter'

const INDEX_LINE_COLORS = [
  '#d97706',
  '#7c3aed',
  '#db2777',
  '#0891b2',
  '#65a30d',
]

interface ComparisonSeries {
  index: MarketIndex
  points: IndexComparisonPoint[]
  last: IndexComparisonPoint | null
}

type ChartRow = {
  date: string
  label: string
  actualTotal: number
  actualGrowth: number
} & Record<string, number | string>

interface ChartSeriesLine {
  key: string
  label: string
  color: string
}

function buildSeriesKey(prefix: 'capital' | 'growth', indexId: string): string {
  return `${prefix}:${indexId}`
}

function indexLineColor(index: MarketIndex, position: number): string {
  return index.color || INDEX_LINE_COLORS[position % INDEX_LINE_COLORS.length] || '#d97706'
}

function defaultIndexIds(indices: MarketIndex[]): string[] {
  return indices[0] ? [indices[0].id] : []
}

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
  const accountOptions = useMemo(
    () =>
      accounts
        .filter((account) => !isCreditKind(account.kind) && !isCashbackKind(account.kind))
        .sort(
          (a, b) =>
            Number(a.archived) - Number(b.archived) ||
            a.sortOrder - b.sortOrder ||
            a.name.localeCompare(b.name),
        ),
    [accounts],
  )
  const defaultAccountIds = useMemo(() => {
    const growthIds = accountOptions
      .filter((account) => isGrowthPortfolioAccount(account))
      .map((account) => account.id)
    return growthIds.length > 0 ? growthIds : accountOptions.map((account) => account.id)
  }, [accountOptions])
  const available = useMemo(
    () =>
      indices
        .filter((index) => latestIndexValue(index.id, indices, indexValues) != null)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [indices, indexValues],
  )
  const [selectedIndexIds, setSelectedIndexIds] = useState<string[]>(() =>
    defaultIndexIds(available),
  )
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>(defaultAccountIds)

  useEffect(() => {
    const allowed = new Set(available.map((index) => index.id))
    setSelectedIndexIds((current) => {
      const filtered = current.filter((id) => allowed.has(id))
      if (filtered.length > 0) return filtered
      return defaultIndexIds(available)
    })
  }, [available])

  useEffect(() => {
    const allowed = new Set(accountOptions.map((account) => account.id))
    setSelectedAccountIds((current) => {
      const filtered = current.filter((id) => allowed.has(id))
      if (filtered.length > 0) return filtered
      return defaultAccountIds
    })
  }, [accountOptions, defaultAccountIds])

  const selectedIndices = useMemo(
    () => available.filter((index) => selectedIndexIds.includes(index.id)),
    [available, selectedIndexIds],
  )

  const comparisons = useMemo<ComparisonSeries[]>(() => {
    if (selectedIndices.length === 0 || selectedAccountIds.length === 0) return []

    const baseInput = {
      indices,
      indexValues,
      accounts,
      snapshots,
      transfers,
      settings,
      rateBook,
      selectedAccountIds,
    }
    const initial = selectedIndices.map((index) => ({
      index,
      points: buildIndexComparison({
        ...baseInput,
        index,
        range,
      }),
    }))
    if (selectedIndices.length === 1) {
      return initial.map((item) => ({
        ...item,
        last: item.points.at(-1) ?? null,
      }))
    }

    const firstDates = initial.map((item) => item.points[0]?.date).filter(Boolean) as string[]
    const lastDates = initial
      .map((item) => item.points.at(-1)?.date)
      .filter(Boolean) as string[]
    if (firstDates.length !== initial.length || lastDates.length !== initial.length) return []

    const sharedStart = [...firstDates].sort().at(-1)!
    const sharedEnd = [...lastDates].sort()[0]!
    if (sharedStart > sharedEnd) return []

    return selectedIndices.map((index) => {
      const points = buildIndexComparison({
        ...baseInput,
        index,
        range: {
          startDate: sharedStart,
          endDate: sharedEnd,
        },
      })
      return {
        index,
        points,
        last: points.at(-1) ?? null,
      }
    })
  }, [
    selectedIndices,
    selectedAccountIds,
    indices,
    indexValues,
    accounts,
    snapshots,
    transfers,
    settings,
    rateBook,
    range,
  ])

  const rows = useMemo<ChartRow[]>(() => {
    if (comparisons.length === 0) return []
    return comparisons[0]!.points
      .map((point) => {
        const row: ChartRow = {
          date: point.date,
          label: formatShortDate(point.date),
          actualTotal: point.actualTotal,
          actualGrowth: point.actualGrowth,
        }
        for (const comparison of comparisons) {
          const match = comparison.points.find((candidate) => candidate.date === point.date)
          if (!match) return null
          row[buildSeriesKey('capital', comparison.index.id)] = match.indexTotal
          row[buildSeriesKey('growth', comparison.index.id)] = match.indexGrowth
        }
        return row
      })
      .filter((row): row is ChartRow => row != null)
  }, [comparisons])

  const actualLast = comparisons[0]?.last ?? null
  const singleComparison = comparisons.length === 1 ? comparisons[0] : null
  const commonWindowMissing = selectedIndices.length > 1 && comparisons.length === 0
  const capitalLines = useMemo<ChartSeriesLine[]>(
    () =>
      comparisons.map((comparison, position) => ({
        key: buildSeriesKey('capital', comparison.index.id),
        label: comparison.index.name,
        color: indexLineColor(comparison.index, position),
      })),
    [comparisons],
  )
  const growthLines = useMemo<ChartSeriesLine[]>(
    () =>
      comparisons.map((comparison, position) => ({
        key: buildSeriesKey('growth', comparison.index.id),
        label: comparison.index.name,
        color: indexLineColor(comparison.index, position),
      })),
    [comparisons],
  )

  function toggleAccount(accountId: string) {
    setSelectedAccountIds((current) =>
      current.includes(accountId)
        ? current.filter((id) => id !== accountId)
        : [...current, accountId],
    )
  }

  function toggleIndex(indexId: string) {
    setSelectedIndexIds((current) =>
      current.includes(indexId)
        ? current.filter((id) => id !== indexId)
        : [...current, indexId],
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4" {...dataQa('index-comparison-page')}>
      <PageHeader
        title="Сравнение с индексами"
        description="Сценарий инвестирует стартовый капитал и все переводы по выбранным кошелькам в выбранные индексы."
        actions={<PeriodFilter showRange />}
        showPrimary={false}
      />

      <Card className="!p-3 sm:!p-4">
        <div className="space-y-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Индексы
              </span>
              <button
                type="button"
                onClick={() => setSelectedIndexIds(defaultIndexIds(available))}
                className="rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                data-qa="index-comparison-select-default-indices"
              >
                По умолчанию
              </button>
              <button
                type="button"
                onClick={() => setSelectedIndexIds(available.map((index) => index.id))}
                className="rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                data-qa="index-comparison-select-all-indices"
              >
                Все
              </button>
            </div>
            {available.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Нет индексов с зафиксированными значениями.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2" data-qa="index-comparison-indices">
                {available.map((index, position) => {
                  const active = selectedIndexIds.includes(index.id)
                  const accent = indexLineColor(index, position)
                  return (
                    <button
                      key={index.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleIndex(index.id)}
                      className={`rounded-lg border px-3 py-1.5 text-left text-xs transition ${
                        active
                          ? 'text-white'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                      }`}
                      style={active ? { borderColor: accent, backgroundColor: accent } : undefined}
                      data-qa={`index-comparison-index-${index.id}`}
                    >
                      <div className="font-medium">{index.name}</div>
                      <div className={active ? 'text-white/80' : 'text-slate-400 dark:text-slate-500'}>
                        {resolveIndexCurrency(index, indices)}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Кошельки
              </span>
              <button
                type="button"
                onClick={() => setSelectedAccountIds(defaultAccountIds)}
                className="rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                data-qa="index-comparison-select-default-wallets"
              >
                По умолчанию
              </button>
              <button
                type="button"
                onClick={() =>
                  setSelectedAccountIds(accountOptions.map((account) => account.id))
                }
                className="rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                data-qa="index-comparison-select-all-wallets"
              >
                Все
              </button>
            </div>
            <div className="flex flex-wrap gap-2" data-qa="index-comparison-wallets">
              {accountOptions.map((account) => {
                const active = selectedAccountIds.includes(account.id)
                return (
                  <button
                    key={account.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleAccount(account.id)}
                    className={`rounded-lg border px-3 py-1.5 text-left text-xs transition ${
                      active
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                    data-qa={`index-comparison-wallet-${account.id}`}
                  >
                    <div className="font-medium">{account.name}</div>
                    <div className={active ? 'text-blue-100' : 'text-slate-400 dark:text-slate-500'}>
                      {account.currency}
                      {account.archived ? ' · архив' : ''}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          Переводы внутри выбранных кошельков исключаются. Для нескольких индексов графики
          строятся только на общем периоде, где доступны все выбранные серии.
        </p>
      </Card>

      {available.length === 0 ? (
        <EmptyState
          title="Нет данных индексов"
          description="Добавьте индекс и зафиксируйте минимум одно значение на вкладке «Счета → Индексы»."
          dataQa="index-comparison-empty"
        />
      ) : selectedIndexIds.length === 0 ? (
        <EmptyState
          title="Выберите хотя бы один индекс"
          description="Отметьте один или несколько индексов для сравнения."
          dataQa="index-comparison-no-index"
        />
      ) : selectedAccountIds.length === 0 ? (
        <EmptyState
          title="Выберите хотя бы один кошелёк"
          description="Отметьте счета, по которым нужно строить сравнение с индексом."
          dataQa="index-comparison-no-wallets"
        />
      ) : actualLast ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
          <Metric
            label="Фактически заработано"
            value={actualLast.actualGrowth}
            currency={settings.baseCurrency}
            className={comparisons.length > 1 ? 'col-span-2 sm:col-span-1' : ''}
          />
          {singleComparison ? (
            <>
              <Metric
                label={`Заработал бы ${singleComparison.index.name}`}
                value={singleComparison.last?.indexGrowth ?? 0}
                currency={settings.baseCurrency}
              />
              <Metric
                label="Факт минус индекс"
                value={singleComparison.last?.difference ?? 0}
                currency={settings.baseCurrency}
                className="col-span-2 sm:col-span-1"
              />
            </>
          ) : (
            comparisons.map((comparison) => (
              <Metric
                key={comparison.index.id}
                label={comparison.index.name}
                value={comparison.last?.indexGrowth ?? 0}
                currency={settings.baseCurrency}
                hint={`Факт ${formatCurrency(actualLast.actualGrowth - (comparison.last?.indexGrowth ?? 0), settings.baseCurrency)}`}
              />
            ))
          )}
        </div>
      ) : null}

      {available.length === 0 || selectedIndexIds.length === 0 || selectedAccountIds.length === 0 ? null : commonWindowMissing ? (
        <EmptyState
          title="Нет общего периода"
          description="У выбранных индексов нет общего отрезка с доступными данными в текущем диапазоне."
          dataQa="index-comparison-no-overlap"
        />
      ) : rows.length < 2 ? (
        <EmptyState
          title="Недостаточно общих дат"
          description="Для сравнения нужны хотя бы два чек-ина после первого значения выбранных индексов."
          dataQa="index-comparison-no-range"
        />
      ) : (
        <>
          <ComparisonChart
            title="Капитал"
            rows={rows}
            primaryKey="actualTotal"
            primaryLabel="Фактический портфель"
            currency={settings.baseCurrency}
            chartTheme={chartTheme}
            series={capitalLines}
            dataQa="index-capital-chart"
          />
          <ComparisonChart
            title="Доход без пополнений"
            rows={rows}
            primaryKey="actualGrowth"
            primaryLabel="Фактический прирост"
            currency={settings.baseCurrency}
            chartTheme={chartTheme}
            series={growthLines}
            dataQa="index-growth-chart"
          />
        </>
      )}
    </div>
  )
}

function Metric({
  label,
  value,
  currency,
  className = '',
  hint,
}: {
  label: string
  value: number
  currency: string
  className?: string
  hint?: string
}) {
  return (
    <Card className={`!p-3 ${className}`}>
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p
        className={`mt-1 text-lg font-semibold tabular-nums ${
          value > 0
            ? 'text-emerald-700 dark:text-emerald-400'
            : value < 0
              ? 'text-red-600 dark:text-red-400'
              : 'text-slate-900 dark:text-slate-200'
        }`}
      >
        {formatCurrency(value, currency)}
      </p>
      {hint ? <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{hint}</p> : null}
    </Card>
  )
}

function ComparisonChart({
  title,
  rows,
  primaryKey,
  primaryLabel,
  currency,
  chartTheme,
  series,
  dataQa: qa,
}: {
  title: string
  rows: ChartRow[]
  primaryKey: 'actualTotal' | 'actualGrowth'
  primaryLabel: string
  currency: string
  chartTheme: ReturnType<typeof getChartTheme>
  series: ChartSeriesLine[]
  dataQa: string
}) {
  return (
    <Card className="!p-3 sm:!p-4" dataQa={qa}>
      <h2 className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-200">{title}</h2>
      <div className="h-64 w-full sm:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: chartTheme.tick }}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 11, fill: chartTheme.tick }}
              tickFormatter={formatCompactAxisValue}
              width={50}
              domain={paddedDataDomain}
            />
            <Tooltip
              {...chartTooltipStyles(chartTheme)}
              formatter={(value: number, name: string) => [formatCurrency(value, currency), name]}
              labelFormatter={(_, payload) => payload?.[0]?.payload?.date ?? ''}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey={primaryKey}
              name={primaryLabel}
              stroke={chartTheme.primaryLine}
              strokeWidth={2}
              dot={chartDot(chartTheme, chartTheme.primaryLine)}
              activeDot={chartActiveDot(chartTheme, chartTheme.primaryLine)}
            />
            {series.map((line) => (
              <Line
                key={line.key}
                type="monotone"
                dataKey={line.key}
                name={line.label}
                stroke={line.color}
                strokeWidth={2}
                dot={chartDot(chartTheme, line.color)}
                activeDot={chartActiveDot(chartTheme, line.color)}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
