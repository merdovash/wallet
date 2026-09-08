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
  appendComparisonDiagnosis,
  buildIndexComparison,
  chartIndexComparisonValue,
  diagnoseIndexComparison,
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
import { useAuthStore } from '../../store/authStore'
import { useRatesStore } from '../../store/ratesStore'
import { useWalletStore } from '../../store/walletStore'
import type { Account, MarketIndex } from '../../types/wallet'
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
} & Record<string, number | string | boolean>

interface ChartSeriesLine {
  key: string
  label: string
  color: string
  observedKey: string
  calculatedKey: string
}

interface StoredComparisonFilters {
  selectedIndexIds?: string[]
  selectedAccountIds?: string[]
}

const FILTER_STORAGE_KEY = 'wallet-index-comparison-filters'

function buildSeriesKey(prefix: 'capital' | 'growth', indexId: string): string {
  return `${prefix}:${indexId}`
}

function buildSeriesObservedKey(prefix: 'capital' | 'growth', indexId: string): string {
  return `${buildSeriesKey(prefix, indexId)}:observed`
}

function buildSeriesCalculatedKey(prefix: 'capital' | 'growth', indexId: string): string {
  return `${buildSeriesKey(prefix, indexId)}:calculated`
}

function indexLineColor(index: MarketIndex, position: number): string {
  return index.color || INDEX_LINE_COLORS[position % INDEX_LINE_COLORS.length] || '#d97706'
}

function accountChipColor(account: Account): string {
  return account.color || '#2563eb'
}

function defaultIndexIds(indices: MarketIndex[]): string[] {
  return indices[0] ? [indices[0].id] : []
}

function sanitizeSelectedIds(ids: string[] | undefined, allowed: Set<string>): string[] {
  if (!ids) return []
  const unique: string[] = []
  for (const id of ids) {
    if (!allowed.has(id) || unique.includes(id)) continue
    unique.push(id)
  }
  return unique
}

function readStoredFilters(userId: string | null): StoredComparisonFilters | null {
  if (!userId) return null
  try {
    const raw = localStorage.getItem(`${FILTER_STORAGE_KEY}:${userId}`)
    if (!raw) return null
    return JSON.parse(raw) as StoredComparisonFilters
  } catch {
    return null
  }
}

function writeStoredFilters(
  userId: string | null,
  value: StoredComparisonFilters,
): void {
  if (!userId) return
  try {
    localStorage.setItem(`${FILTER_STORAGE_KEY}:${userId}`, JSON.stringify(value))
  } catch {
    /* ignore */
  }
}

export function IndexComparisonPanel() {
  const user = useAuthStore((s) => s.user)
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
  const [filtersOwnerId, setFiltersOwnerId] = useState<string | null>(null)

  useEffect(() => {
    const userId = user?.id ?? null
    const indexAllowed = new Set(available.map((index) => index.id))
    const accountAllowed = new Set(accountOptions.map((account) => account.id))
    if (filtersOwnerId !== userId) {
      const stored = readStoredFilters(userId)
      setSelectedIndexIds(
        stored?.selectedIndexIds
          ? sanitizeSelectedIds(stored.selectedIndexIds, indexAllowed)
          : defaultIndexIds(available),
      )
      setSelectedAccountIds(
        stored?.selectedAccountIds
          ? sanitizeSelectedIds(stored.selectedAccountIds, accountAllowed)
          : defaultAccountIds,
      )
      setFiltersOwnerId(userId)
      return
    }

    setSelectedIndexIds((current) => sanitizeSelectedIds(current, indexAllowed))
    setSelectedAccountIds((current) => sanitizeSelectedIds(current, accountAllowed))
  }, [user?.id, filtersOwnerId, available, accountOptions, defaultAccountIds])

  useEffect(() => {
    const userId = user?.id ?? null
    if (filtersOwnerId !== userId) return
    writeStoredFilters(userId, {
      selectedIndexIds,
      selectedAccountIds,
    })
  }, [user?.id, filtersOwnerId, selectedIndexIds, selectedAccountIds])

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
    const basePoints = comparisons[0]!.points
    return basePoints
      .map((point) => {
        const row: ChartRow = {
          date: point.date,
          label: formatShortDate(point.date),
          actualTotal: point.actualTotal,
          actualGrowth: point.actualGrowth,
        }
        for (const comparison of comparisons) {
          const matchIndex = comparison.points.findIndex((candidate) => candidate.date === point.date)
          if (matchIndex < 0) return null
          const capital = chartIndexComparisonValue(
            comparison.points,
            matchIndex,
            'indexTotal',
          )
          const growth = chartIndexComparisonValue(
            comparison.points,
            matchIndex,
            'indexGrowth',
          )
          const capitalKey = buildSeriesKey('capital', comparison.index.id)
          const growthKey = buildSeriesKey('growth', comparison.index.id)
          row[capitalKey] = capital.value
          row[growthKey] = growth.value
          row[buildSeriesObservedKey('capital', comparison.index.id)] =
            comparison.points[matchIndex]?.indexObserved ?? false
          row[buildSeriesObservedKey('growth', comparison.index.id)] =
            comparison.points[matchIndex]?.indexObserved ?? false
          row[buildSeriesCalculatedKey('capital', comparison.index.id)] = capital.calculated
          row[buildSeriesCalculatedKey('growth', comparison.index.id)] = growth.calculated
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
        observedKey: buildSeriesObservedKey('capital', comparison.index.id),
        calculatedKey: buildSeriesCalculatedKey('capital', comparison.index.id),
      })),
    [comparisons],
  )
  const growthLines = useMemo<ChartSeriesLine[]>(
    () =>
      comparisons.map((comparison, position) => ({
        key: buildSeriesKey('growth', comparison.index.id),
        label: comparison.index.name,
        color: indexLineColor(comparison.index, position),
        observedKey: buildSeriesObservedKey('growth', comparison.index.id),
        calculatedKey: buildSeriesCalculatedKey('growth', comparison.index.id),
      })),
    [comparisons],
  )
  const comparisonDiagnosis = useMemo(
    () =>
      selectedIndexIds.length > 0 && selectedAccountIds.length > 0
        ? diagnoseIndexComparison({
            indices,
            indexValues,
            accounts,
            snapshots,
            transfers,
            settings,
            rateBook,
            range,
            selectedIndexIds,
            selectedAccountIds,
          })
        : null,
    [
      selectedIndexIds,
      selectedAccountIds,
      indices,
      indexValues,
      accounts,
      snapshots,
      transfers,
      settings,
      rateBook,
      range,
    ],
  )
  const indicesWithoutValues = useMemo(
    () =>
      indices
        .filter((index) => latestIndexValue(index.id, indices, indexValues) == null)
        .map((index) => index.name),
    [indices, indexValues],
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
                        active ? 'text-white' : 'hover:opacity-85'
                      }`}
                      style={{
                        borderColor: accent,
                        backgroundColor: active ? accent : 'transparent',
                        color: active ? '#ffffff' : accent,
                      }}
                      data-qa={`index-comparison-index-${index.id}`}
                    >
                      <div className="font-medium">{index.name}</div>
                      <div style={{ color: active ? 'rgba(255,255,255,0.8)' : accent }}>
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
                const accent = accountChipColor(account)
                return (
                  <button
                    key={account.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleAccount(account.id)}
                    className={`rounded-lg border px-3 py-1.5 text-left text-xs transition ${
                      active ? 'text-white' : 'hover:opacity-85'
                    }`}
                    style={{
                      borderColor: accent,
                      backgroundColor: active ? accent : 'transparent',
                      color: active ? '#ffffff' : accent,
                    }}
                    data-qa={`index-comparison-wallet-${account.id}`}
                  >
                    <div className="font-medium">{account.name}</div>
                    <div style={{ color: active ? 'rgba(255,255,255,0.8)' : accent }}>
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
          description={
            indicesWithoutValues.length > 0
              ? `Добавьте индекс и зафиксируйте минимум одно значение на вкладке «Счета → Индексы».\n\nИндексы: ${indicesWithoutValues.join(', ')} — нет зафиксированных значений`
              : 'Добавьте индекс и зафиксируйте минимум одно значение на вкладке «Счета → Индексы».'
          }
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
          description={
            comparisonDiagnosis
              ? appendComparisonDiagnosis(
                  'У выбранных индексов нет общего отрезка с доступными данными в текущем диапазоне.',
                  comparisonDiagnosis,
                )
              : 'У выбранных индексов нет общего отрезка с доступными данными в текущем диапазоне.'
          }
          dataQa="index-comparison-no-overlap"
        />
      ) : rows.length < 2 ? (
        <EmptyState
          title="Недостаточно общих дат"
          description={
            comparisonDiagnosis
              ? appendComparisonDiagnosis(
                  'Для сравнения нужны хотя бы два чек-ина после первого значения выбранных индексов.',
                  comparisonDiagnosis,
                )
              : 'Для сравнения нужны хотя бы два чек-ина после первого значения выбранных индексов.'
          }
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
  const calculatedKeys = useMemo(
    () => new Map(series.map((line) => [line.key, line.calculatedKey])),
    [series],
  )

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
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                const row = payload[0]?.payload as ChartRow | undefined
                return (
                  <div
                    className="rounded-lg border px-3 py-2 text-xs shadow-sm"
                    style={{
                      backgroundColor: chartTheme.tooltipBg,
                      borderColor: chartTheme.tooltipBorder,
                      color: chartTheme.tooltipText,
                    }}
                  >
                    <p className="mb-1 font-medium">{row?.date ?? label}</p>
                    {payload.map((entry) => {
                      const value = Number(entry.value)
                      if (!Number.isFinite(value)) return null
                      const calculatedKey = calculatedKeys.get(String(entry.dataKey))
                      const calculated = calculatedKey ? row?.[calculatedKey] === true : false
                      const name = calculated
                        ? `${String(entry.name)} (расчётное)`
                        : String(entry.name)
                      return (
                        <p key={String(entry.dataKey)} className="tabular-nums">
                          <span style={{ color: entry.color }}>{name}: </span>
                          {formatCurrency(value, currency)}
                        </p>
                      )
                    })}
                  </div>
                )
              }}
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
                type="linear"
                dataKey={line.key}
                name={line.label}
                stroke={line.color}
                strokeWidth={2}
                dot={(props) => {
                  const { cx, cy, payload, key } = props
                  if (cx == null || cy == null || !payload?.[line.observedKey]) {
                    return <g key={key} />
                  }
                  const dot = chartDot(chartTheme, line.color)
                  return (
                    <circle
                      key={key}
                      cx={cx}
                      cy={cy}
                      r={dot.r}
                      fill={dot.fill}
                      stroke={dot.stroke}
                      strokeWidth={dot.strokeWidth}
                    />
                  )
                }}
                activeDot={chartActiveDot(chartTheme, line.color)}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
