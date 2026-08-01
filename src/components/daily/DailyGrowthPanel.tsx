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
import { buildDailyGrowthSeries, snapshotDates } from '../../engine/growthEngine'
import {
  formatCompactAxisValue,
  formatCurrency,
  formatDateDisplay,
  formatShortDate,
  signedAmount,
  todayIsoDate,
} from '../../lib/format'
import { buildPeriodReturn, dailyGrowthInterval } from '../../lib/monthlyReturns'
import { useRatesStore } from '../../store/ratesStore'
import { useWalletStore } from '../../store/walletStore'
import { ReturnBreakdownPanel } from '../dashboard/ReturnBreakdownPanel'
import { Card, EmptyState, Field, Select } from '../ui/FormControls'

type DayRow = {
  date: string
  growth: number
  total: number
  cumulativeGrowth: number
  label: string
  fill: string
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
    setFromDate((prev) =>
      prev && checkInDates.includes(prev) ? prev : firstDate,
    )
    setToDate((prev) => (prev && checkInDates.includes(prev) ? prev : lastDate))
  }, [firstDate, lastDate, checkInDates])

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

  const rows = useMemo(
    () =>
      filtered.map((p) => ({
        ...p,
        label: formatShortDate(p.date),
        fill: p.growth > 0 ? '#059669' : p.growth < 0 ? '#dc2626' : '#94a3b8',
      })),
    [filtered],
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

  const fromOptions = checkInDates.filter((d) => !toDate || d <= toDate)
  const toOptions = checkInDates.filter((d) => !fromDate || d >= fromDate)

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
          <Field label="С даты" className="w-36">
            <Select
              value={fromDate}
              disabled={checkInDates.length === 0}
              onChange={(e) => setFromDate(e.target.value)}
            >
              {fromOptions.map((d) => (
                <option key={d} value={d}>
                  {formatShortDate(d)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="По дату" className="w-36">
            <Select
              value={toDate}
              disabled={checkInDates.length === 0}
              onChange={(e) => setToDate(e.target.value)}
            >
              {toOptions.map((d) => (
                <option key={d} value={d}>
                  {formatShortDate(d)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>

      {checkInDates.length < 2 ? (
        <Card>
          <EmptyState
            title="Недостаточно чек-инов"
            description="Нужны минимум два чек-ина, чтобы показать прирост по дням."
          />
        </Card>
      ) : rows.length === 0 ? (
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
                {rows.filter((row) => row.growth > 0).length}
              </p>
            </Card>
          </div>

          <Card className="!p-3 sm:!p-4">
            <div className="mb-3">
              <h2 className="text-sm font-semibold text-slate-800">Прирост по дням чек-инов</h2>
              <p className="text-xs text-slate-500">
                Столбец — прирост за интервал до этой даты · нажмите день для расшифровки
              </p>
            </div>
            <div className="h-72 w-full touch-manipulation sm:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={rows}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                  style={{ cursor: 'pointer' }}
                  onClick={(state) => openDay(dateFromChartClick(state, rows))}
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
                    formatter={(value: number) => [
                      formatCurrency(value, settings.baseCurrency),
                      'Прирост',
                    ]}
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
                    {rows.map((row) => (
                      <Cell key={row.date} fill={row.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Reliable tap targets for adaptive / touch layouts */}
            <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200 md:hidden">
              {rows.map((row) => (
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
                      className={`shrink-0 tabular-nums font-medium ${
                        row.growth > 0
                          ? 'text-emerald-700'
                          : row.growth < 0
                            ? 'text-red-600'
                            : 'text-slate-700'
                      }`}
                    >
                      {signedAmount(row.growth, settings.baseCurrency)}
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
