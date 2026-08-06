import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { buildDailyGrowthSeries, snapshotDates, totalOnDate, type RateBook } from '../../engine/growthEngine'
import {
  formatCompactAxisValue,
  formatCurrency,
  formatDateDisplay,
  formatPercent,
  formatShortDate,
  signedAmount,
  todayIsoDate,
} from '../../lib/format'
import { buildPeriodReturn, dailyGrowthInterval } from '../../lib/monthlyReturns'
import { useRatesStore } from '../../store/ratesStore'
import { useWalletStore } from '../../store/walletStore'
import { ReturnBreakdownPanel } from '../dashboard/ReturnBreakdownPanel'
import { Card, DateInput, EmptyState, Field } from '../ui/FormControls'

type DayRow = {
  date: string
  growth: number
  total: number
  cumulativeGrowth: number
  /** Growth ÷ all-money mass at the start of the interval. */
  growthPctOfAllMass: number | null
  label: string
  fill: string
}

function clampIsoDate(value: string, min: string, max: string): string {
  if (!value) return min
  if (min && value < min) return min
  if (max && value > max) return max
  return value
}

function dateFromChartClick(
  state: {
    activePayload?: Array<{ payload?: { date?: string } }>
    activeTooltipIndex?: number | string
  } | null,
  rows: DayRow[],
): string | undefined {
  const fromPayload = state?.activePayload?.[0]?.payload?.date
  if (fromPayload) return fromPayload
  const idx =
    typeof state?.activeTooltipIndex === 'number'
      ? state.activeTooltipIndex
      : typeof state?.activeTooltipIndex === 'string'
        ? Number(state.activeTooltipIndex)
        : NaN
  if (Number.isFinite(idx) && idx >= 0 && idx < rows.length) {
    return rows[idx]?.date
  }
  return undefined
}

function dateFromBarClick(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined
  const rec = data as { date?: string; payload?: { date?: string } }
  return rec.payload?.date ?? rec.date
}

function buildDayRow(
  p: { date: string; growth: number; total: number; cumulativeGrowth: number },
  checkInDates: string[],
  accounts: Parameters<typeof totalOnDate>[1],
  snapshots: Parameters<typeof totalOnDate>[2],
  settings: Parameters<typeof totalOnDate>[3],
  rateBook?: RateBook,
): DayRow {
  const interval = dailyGrowthInterval(p.date, checkInDates)
  const massStart = interval
    ? totalOnDate(interval.startDate, accounts, snapshots, settings, { rateBook })
    : 0
  const growthPctOfAllMass =
    Number.isFinite(massStart) && massStart !== 0 ? p.growth / massStart : null
  return {
    ...p,
    growthPctOfAllMass,
    label: formatShortDate(p.date),
    fill: p.growth > 0 ? '#059669' : p.growth < 0 ? '#dc2626' : '#94a3b8',
  }
}

export function DailyGrowthPanel() {
  const accounts = useWalletStore((s) => s.accounts)
  const snapshots = useWalletStore((s) => s.snapshots)
  const transfers = useWalletStore((s) => s.transfers)
  const settings = useWalletStore((s) => s.settings)
  const rateBook = useRatesStore((s) => s.byDate)
  const ensureRates = useRatesStore((s) => s.ensureRates)

  const checkInDates = useMemo(() => snapshotDates(snapshots), [snapshots])
  const firstDate = checkInDates[0] ?? ''
  const lastDate = checkInDates[checkInDates.length - 1] ?? ''

  const [fromDate, setFromDate] = useState(firstDate)
  const [toDate, setToDate] = useState(lastDate)
  const [selectedEndDate, setSelectedEndDate] = useState<string | null>(null)

  useEffect(() => {
    if (!firstDate || !lastDate) {
      setFromDate('')
      setToDate('')
      return
    }
    setFromDate((prev) => clampIsoDate(prev || firstDate, firstDate, lastDate))
    setToDate((prev) => clampIsoDate(prev || lastDate, firstDate, lastDate))
  }, [firstDate, lastDate])

  useEffect(() => {
    void ensureRates([...checkInDates, todayIsoDate()])
  }, [checkInDates, ensureRates])

  const allPoints = useMemo(
    () => buildDailyGrowthSeries(accounts, snapshots, settings, rateBook, transfers),
    [accounts, snapshots, settings, rateBook, transfers],
  )

  const filtered = useMemo(() => {
    if (!fromDate || !toDate) return []
    const lo = fromDate <= toDate ? fromDate : toDate
    const hi = fromDate <= toDate ? toDate : fromDate
    return allPoints.filter((p) => p.date >= lo && p.date <= hi)
  }, [allPoints, fromDate, toDate])

  const buildRow = (p: (typeof filtered)[number]): DayRow =>
    buildDayRow(p, checkInDates, accounts, snapshots, settings, rateBook)

  /** Chart: oldest → newest (left to right). */
  const chartRows = useMemo(() => filtered.map(buildRow), [filtered, checkInDates, accounts, snapshots, settings, rateBook])

  /** Mobile list: newest → oldest. */
  const tableRows = useMemo(
    () => [...filtered].reverse().map(buildRow),
    [filtered, checkInDates, accounts, snapshots, settings, rateBook],
  )

  const rangeSum = useMemo(
    () => filtered.reduce((s, p) => s + p.growth, 0),
    [filtered],
  )

  const dayBreakdown = useMemo(() => {
    if (!selectedEndDate) return null
    const interval = dailyGrowthInterval(selectedEndDate, checkInDates)
    if (!interval) return null
    return buildPeriodReturn(accounts, snapshots, settings, rateBook, transfers, interval)
  }, [selectedEndDate, checkInDates, accounts, snapshots, settings, rateBook, transfers])

  function setFromClamped(iso: string) {
    if (!firstDate || !lastDate) {
      setFromDate(iso)
      return
    }
    setFromDate(clampIsoDate(iso, firstDate, lastDate))
  }

  function setToClamped(iso: string) {
    if (!firstDate || !lastDate) {
      setToDate(iso)
      return
    }
    setToDate(clampIsoDate(iso, firstDate, lastDate))
  }

  function openDay(date: string | undefined) {
    if (!date) return
    setSelectedEndDate(date)
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">По дням</h1>
          <p className="text-sm text-slate-500">
            Прирост портфеля роста между чек-инами · фонд / вклад / инвестиции
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="С даты" className="w-40">
            <DateInput
              value={fromDate}
              disabled={!firstDate}
              onChange={setFromClamped}
            />
          </Field>
          <Field label="По дату" className="w-40">
            <DateInput
              value={toDate}
              disabled={!lastDate}
              onChange={setToClamped}
            />
          </Field>
        </div>
      </div>
      {firstDate && lastDate ? (
        <p className="text-xs text-slate-500">
          Доступный интервал: {formatDateDisplay(firstDate)} — {formatDateDisplay(lastDate)}
        </p>
      ) : null}

      {checkInDates.length < 2 ? (
        <Card>
          <EmptyState
            title="Недостаточно чек-инов"
            description="Нужны минимум два чек-ина, чтобы показать прирост по дням."
          />
        </Card>
      ) : chartRows.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-500">В выбранном интервале нет точек прироста.</p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3">
            <Card className="!p-2.5 sm:!p-3">
              <p className="text-xs text-slate-500 sm:text-sm">Сумма за период</p>
              <p
                className={`mt-0.5 text-base font-semibold tabular-nums sm:text-lg ${
                  rangeSum > 0
                    ? 'text-emerald-700'
                    : rangeSum < 0
                      ? 'text-red-600'
                      : 'text-slate-800'
                }`}
              >
                {signedAmount(rangeSum, settings.baseCurrency)}
              </p>
            </Card>
            <Card className="!p-2.5 sm:!p-3">
              <p className="text-xs text-slate-500 sm:text-sm">Дней с приростом</p>
              <p className="mt-0.5 text-base font-semibold tabular-nums text-slate-900 sm:text-lg">
                {chartRows.filter((row) => row.growth > 0).length}
              </p>
            </Card>
          </div>

          <Card className="!p-3 sm:!p-4">
            <div className="mb-3">
              <h2 className="text-sm font-semibold text-slate-800">Прирост по дням чек-инов</h2>
              <p className="text-xs text-slate-500">
                Столбец — прирост за интервал до этой даты · слева старые дни · нажмите день для
                расшифровки
              </p>
            </div>
            <div className="h-72 w-full touch-manipulation sm:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartRows}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                  style={{ cursor: 'pointer' }}
                  onClick={(state) => openDay(dateFromChartClick(state, chartRows))}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    tickFormatter={formatCompactAxisValue}
                    width={48}
                  />
                  <Tooltip
                    formatter={(value: number, _name, item) => {
                      const pct = (item?.payload as DayRow | undefined)?.growthPctOfAllMass
                      const amount = formatCurrency(value, settings.baseCurrency)
                      if (pct == null) return [amount, 'Прирост']
                      return [`${amount} (${formatPercent(pct)} от массы)`, 'Прирост']
                    }}
                    labelFormatter={(_, payload) => {
                      const date = payload?.[0]?.payload?.date as string | undefined
                      return date ?? ''
                    }}
                    // Avoid first-tap-only tooltip on mobile swallowing the open action.
                    trigger="click"
                  />
                  <Bar
                    dataKey="growth"
                    name="Прирост"
                    radius={[4, 4, 0, 0]}
                    // Tiny / zero bars stay tappable on phones.
                    minPointSize={8}
                    onClick={(data) => openDay(dateFromBarClick(data))}
                  >
                    {chartRows.map((row) => (
                      <Cell key={row.date} fill={row.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Reliable tap targets for adaptive / touch layouts */}
            <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200 md:hidden">
              {tableRows.map((row) => (
                <li key={row.date}>
                  <button
                    type="button"
                    onClick={() => openDay(row.date)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm transition hover:bg-slate-50 active:bg-slate-100"
                  >
                    <span>
                      <span className="block font-medium text-slate-900">
                        {formatDateDisplay(row.date)}
                      </span>
                      <span className="text-[11px] text-blue-600">открыть расшифровку</span>
                    </span>
                    <span
                      className={`shrink-0 text-right tabular-nums font-medium ${
                        row.growth > 0
                          ? 'text-emerald-700'
                          : row.growth < 0
                            ? 'text-red-600'
                            : 'text-slate-700'
                      }`}
                    >
                      <span className="block">{signedAmount(row.growth, settings.baseCurrency)}</span>
                      {row.growthPctOfAllMass != null ? (
                        <span className="block text-[11px] font-normal text-slate-500">
                          {formatPercent(row.growthPctOfAllMass)} от массы
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}

      <ReturnBreakdownPanel
        open={selectedEndDate != null}
        onClose={() => setSelectedEndDate(null)}
        focus="growth"
        periodReturn={dayBreakdown}
        currency={settings.baseCurrency}
        title={
          selectedEndDate
            ? `Расшифровка: прирост за ${formatDateDisplay(selectedEndDate)}`
            : undefined
        }
      />
    </div>
  )
}
