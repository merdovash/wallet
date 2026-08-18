import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { CreditFloatDayRow } from '../../engine/creditFloatEngine'
import { buildAllCreditFloatSummaries } from '../../engine/creditFloatEngine'
import { formatCurrency, formatPercent, signedAmount, todayIsoDate } from '../../lib/format'
import { usePeriodRange } from '../../lib/usePeriodRange'
import { useRatesStore } from '../../store/ratesStore'
import { useWalletStore } from '../../store/walletStore'
import { Card, EmptyState } from '../ui/FormControls'
import { PeriodFilter } from '../ui/PeriodFilter'

const MONTH_LABEL = new Intl.DateTimeFormat('ru-RU', {
  month: 'long',
  year: 'numeric',
})

function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  if (!y || !m) return ym
  const label = MONTH_LABEL.format(new Date(y, m - 1, 1))
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function formatDueDate(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`
}

type DayAgg = {
  date: string
  linkedGrowthBase: number
  earnedBase: number
  baseGrowthBase: number
  creditGrowthBase: number
  interestGrowthBase: number
  baseCapitalBase: number
  creditCapitalBase: number
  interestCapitalBase: number
  lockedEarningsBase: number
  floatSharePct: number | null
}

type MonthAgg = {
  month: string
  linkedGrowthBase: number
  earnedBase: number
  baseGrowthBase: number
  creditGrowthBase: number
  interestGrowthBase: number
  lockedEarningsBase: number
  floatSharePct: number | null
  spent: number
  repaid: number
  remaining: number
  dueDate: string
  overdue: boolean
  days: DayAgg[]
}

function earnTone(value: number): string {
  if (value > 0) return 'text-emerald-700 dark:text-emerald-400'
  if (value < 0) return 'text-red-600'
  return 'text-slate-700 dark:text-slate-300'
}

function canHover(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches
}

/** Number with hover (desktop) / click (mobile) explanation. */
function ExplainableValue({
  display,
  title,
  description,
  className = '',
}: {
  display: string
  title: string
  description: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    function onDocPointer(e: MouseEvent | TouchEvent) {
      const el = rootRef.current
      if (!el) return
      if (e.target instanceof Node && !el.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocPointer)
    document.addEventListener('touchstart', onDocPointer)
    return () => {
      document.removeEventListener('mousedown', onDocPointer)
      document.removeEventListener('touchstart', onDocPointer)
    }
  }, [open])

  return (
    <span ref={rootRef} className="relative inline-flex max-w-full">
      <button
        type="button"
        className={`underline decoration-dotted underline-offset-2 ${className}`}
        aria-expanded={open}
        aria-label={`${title}: ${description}`}
        onClick={() => {
          if (!canHover()) setOpen((v) => !v)
        }}
        onMouseEnter={() => {
          if (canHover()) setOpen(true)
        }}
        onMouseLeave={() => {
          if (canHover()) setOpen(false)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          if (canHover()) setOpen(false)
        }}
      >
        {display}
      </button>
      {open ? (
        <span
          role="tooltip"
          className="absolute left-1/2 top-full z-30 mt-1 w-44 -translate-x-1/2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-left shadow-lg dark:border-slate-600 dark:bg-slate-900 sm:w-52"
        >
          <span className="block text-[11px] font-semibold text-slate-800 dark:text-slate-100">
            {title}
          </span>
          <span className="mt-0.5 block text-[10px] leading-snug text-slate-500 dark:text-slate-400">
            {description}
          </span>
        </span>
      ) : null}
    </span>
  )
}

function FormulaOp({ children }: { children: string }) {
  return (
    <span className="shrink-0 pb-px text-[11px] font-medium text-slate-400 dark:text-slate-500">
      {children}
    </span>
  )
}

function FormulaLine({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-start gap-x-1 gap-y-0.5 text-[11px] tabular-nums leading-tight">
      {children}
    </div>
  )
}

function mergeDay(prev: DayAgg | undefined, day: CreditFloatDayRow): DayAgg {
  if (!prev) {
    return {
      date: day.date,
      linkedGrowthBase: day.linkedGrowthBase,
      earnedBase: day.earnedBase,
      baseGrowthBase: day.baseGrowthBase,
      creditGrowthBase: day.creditGrowthBase,
      interestGrowthBase: day.interestGrowthBase,
      baseCapitalBase: day.baseCapitalBase,
      creditCapitalBase: day.creditCapitalBase,
      interestCapitalBase: day.interestCapitalBase,
      lockedEarningsBase: day.lockedEarningsBase,
      floatSharePct: null,
    }
  }
  return {
    ...prev,
    linkedGrowthBase: prev.linkedGrowthBase + day.linkedGrowthBase,
    earnedBase: prev.earnedBase + day.earnedBase,
    baseGrowthBase: prev.baseGrowthBase + day.baseGrowthBase,
    creditGrowthBase: prev.creditGrowthBase + day.creditGrowthBase,
    interestGrowthBase: prev.interestGrowthBase + day.interestGrowthBase,
    baseCapitalBase: prev.baseCapitalBase + day.baseCapitalBase,
    creditCapitalBase: prev.creditCapitalBase + day.creditCapitalBase,
    interestCapitalBase: prev.interestCapitalBase + day.interestCapitalBase,
    lockedEarningsBase: prev.lockedEarningsBase + day.lockedEarningsBase,
  }
}

function DayBreakdown({ day, currency }: { day: DayAgg; currency: string }) {
  const baseEnd = day.baseCapitalBase + day.baseGrowthBase
  const creditEnd = day.creditCapitalBase + day.creditGrowthBase
  const lockedEnd = day.interestCapitalBase + day.creditGrowthBase + day.interestGrowthBase

  return (
    <div className="space-y-2.5 rounded-lg border border-slate-100 bg-slate-50/80 px-2.5 py-2 dark:border-slate-800 dark:bg-slate-950/50">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
          {formatDueDate(day.date)}
        </p>
        <p className={`text-xs font-semibold tabular-nums ${earnTone(day.earnedBase)}`}>
          float {signedAmount(day.earnedBase, currency)}
        </p>
      </div>

      <div className="space-y-2.5">
        <div className="space-y-1">
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
            База
          </p>
          <FormulaLine>
            <ExplainableValue
              display={formatCurrency(day.baseCapitalBase, currency)}
              title="База на начало дня"
              description="Собственные средства связанного счёта (взвешенный капитал минус долг кредитки и ранее закреплённый float)."
              className="font-medium text-slate-800 dark:text-slate-200"
            />
            <FormulaOp>+</FormulaOp>
            <ExplainableValue
              display={signedAmount(day.baseGrowthBase, currency)}
              title="Дельта базы"
              description="Доля дневного прироста связанного счёта, приходящаяся на собственные средства."
              className={`font-medium ${earnTone(day.baseGrowthBase)}`}
            />
            <FormulaOp>=</FormulaOp>
            <ExplainableValue
              display={formatCurrency(baseEnd, currency)}
              title="База на конец дня"
              description="Сумма собственных средств после прироста: начало + дельта базы."
              className="font-semibold text-slate-900 dark:text-slate-100"
            />
          </FormulaLine>
        </div>

        <div className="space-y-1">
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Кредитка
          </p>
          <FormulaLine>
            <ExplainableValue
              display={formatCurrency(day.creditCapitalBase, currency)}
              title="Кредитка на начало дня"
              description="Доля капитала под долгом / погашениями (float principal) на этот день."
              className="font-medium text-slate-800 dark:text-slate-200"
            />
            <FormulaOp>+</FormulaOp>
            <ExplainableValue
              display={signedAmount(day.creditGrowthBase, currency)}
              title="Доля кредитки"
              description="Часть прироста связанного счёта, отнесённая к кредитным средствам."
              className={`font-medium ${earnTone(day.creditGrowthBase)}`}
            />
            <FormulaOp>=</FormulaOp>
            <ExplainableValue
              display={formatCurrency(creditEnd, currency)}
              title="Кредитка на конец дня"
              description="Кредитная корзина после прироста: начало + доля кредитки."
              className="font-semibold text-slate-900 dark:text-slate-100"
            />
          </FormulaLine>
        </div>

        <div className="space-y-1">
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Накопленный
          </p>
          <FormulaLine>
            <ExplainableValue
              display={formatCurrency(day.interestCapitalBase, currency)}
              title="Накопленное на начало дня"
              description="Ранее закреплённая выгода float, которая уже лежит на связанном счёте и сама даёт прирост."
              className="font-medium text-slate-800 dark:text-slate-200"
            />
            <FormulaOp>+</FormulaOp>
            <ExplainableValue
              display={signedAmount(day.creditGrowthBase, currency)}
              title="Доля кредитки"
              description="Новый прирост от кредитных средств — закрепляется в накопленном float."
              className={`font-medium ${earnTone(day.creditGrowthBase)}`}
            />
            <FormulaOp>+</FormulaOp>
            <ExplainableValue
              display={signedAmount(day.interestGrowthBase, currency)}
              title="Доля накоплений"
              description="Прирост на ранее закреплённом float (проценты на проценты)."
              className={`font-medium ${earnTone(day.interestGrowthBase)}`}
            />
            <FormulaOp>=</FormulaOp>
            <ExplainableValue
              display={formatCurrency(day.lockedEarningsBase, currency)}
              title="Накопленное на конец дня"
              description={
                Math.abs(lockedEnd - day.lockedEarningsBase) < 0.01
                  ? 'Закреплённый float после дня: начало + доля кредитки + доля накоплений.'
                  : `Закреплённый float после дня (начало + доли = ${formatCurrency(lockedEnd, currency)}).`
              }
              className="font-semibold text-slate-900 dark:text-slate-100"
            />
          </FormulaLine>
        </div>
      </div>

      <p className="text-[11px] text-slate-500 dark:text-slate-400">
        Доля кредитных {formatPercent(day.floatSharePct)}
      </p>
    </div>
  )
}

export function FloatPanel() {
  const accounts = useWalletStore((s) => s.accounts)
  const snapshots = useWalletStore((s) => s.snapshots)
  const transfers = useWalletStore((s) => s.transfers)
  const settings = useWalletStore((s) => s.settings)
  const rateBook = useRatesStore((s) => s.byDate)
  const { range } = usePeriodRange()
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const creditAccounts = useMemo(
    () => accounts.filter((a) => !a.archived && a.kind === 'credit'),
    [accounts],
  )

  const asOf = useMemo(() => {
    const dates = snapshots.map((s) => s.date).sort()
    return dates[dates.length - 1] ?? todayIsoDate()
  }, [snapshots])

  const summary = useMemo(
    () =>
      buildAllCreditFloatSummaries(
        accounts,
        snapshots,
        transfers,
        settings,
        asOf,
        rateBook,
      ),
    [accounts, snapshots, transfers, settings, asOf, rateBook],
  )

  const months = useMemo(() => {
    const byMonth = new Map<string, MonthAgg>()
    for (const card of summary.cards) {
      for (const row of card.months) {
        const prev = byMonth.get(row.month)
        const dayMap = new Map<string, DayAgg>()
        for (const day of prev?.days ?? []) dayMap.set(day.date, day)
        for (const day of row.days) {
          dayMap.set(day.date, mergeDay(dayMap.get(day.date), day))
        }
        const days = [...dayMap.values()]
          .map((d) => ({
            ...d,
            floatSharePct:
              d.linkedGrowthBase !== 0 ? d.earnedBase / d.linkedGrowthBase : null,
          }))
          .sort((a, b) => b.date.localeCompare(a.date))

        if (!prev) {
          byMonth.set(row.month, {
            month: row.month,
            linkedGrowthBase: row.linkedGrowthBase,
            earnedBase: row.earnedBase,
            baseGrowthBase: row.baseGrowthBase,
            creditGrowthBase: row.creditGrowthBase,
            interestGrowthBase: row.interestGrowthBase,
            lockedEarningsBase: row.lockedEarningsBase,
            floatSharePct: null,
            spent: row.spent,
            repaid: row.repaid,
            remaining: row.remaining,
            dueDate: row.dueDate,
            overdue: row.overdue,
            days,
          })
        } else {
          prev.linkedGrowthBase += row.linkedGrowthBase
          prev.earnedBase += row.earnedBase
          prev.baseGrowthBase += row.baseGrowthBase
          prev.creditGrowthBase += row.creditGrowthBase
          prev.interestGrowthBase += row.interestGrowthBase
          prev.lockedEarningsBase += row.lockedEarningsBase
          prev.spent += row.spent
          prev.repaid += row.repaid
          prev.remaining += row.remaining
          prev.overdue = prev.overdue || row.overdue
          if (row.dueDate < prev.dueDate) prev.dueDate = row.dueDate
          prev.days = days
        }
      }
    }
    return [...byMonth.values()]
      .map((row) => ({
        ...row,
        floatSharePct:
          row.linkedGrowthBase !== 0 ? row.earnedBase / row.linkedGrowthBase : null,
      }))
      .filter((row) => {
        if (!range) return true
        return row.month >= range.startDate.slice(0, 7) && row.month <= range.endDate.slice(0, 7)
      })
      .sort((a, b) => b.month.localeCompare(a.month))
  }, [summary.cards, range])

  const totals = useMemo(() => {
    let baseGrowthBase = 0
    let creditGrowthBase = 0
    let interestGrowthBase = 0
    let linkedGrowthBase = 0
    for (const row of months) {
      baseGrowthBase += row.baseGrowthBase
      creditGrowthBase += row.creditGrowthBase
      interestGrowthBase += row.interestGrowthBase
      linkedGrowthBase += row.linkedGrowthBase
    }
    const earnedBase = creditGrowthBase + interestGrowthBase
    return {
      baseGrowthBase,
      creditGrowthBase,
      interestGrowthBase,
      linkedGrowthBase,
      earnedBase,
      creditShareOfGrowth:
        linkedGrowthBase !== 0 ? earnedBase / linkedGrowthBase : null,
    }
  }, [months])

  const currency = settings.baseCurrency
  const earnedColor = earnTone(summary.totalEarnedBase)
  const cumulativeInterestBase = summary.cards.reduce(
    (sum, c) => sum + c.cumulativeInterestBase,
    0,
  )

  function toggleMonth(month: string) {
    setExpanded((prev) => ({ ...prev, [month]: !prev[month] }))
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="space-y-2">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-200">Float</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Выгода от беспроцентного кредита на связанном счёте
          </p>
        </div>
        <PeriodFilter showRange />
      </div>

      {creditAccounts.length === 0 ? (
        <EmptyState
          title="Нет кредиток"
          description="Добавьте счёт типа «Кредитка» с лимитом, сроком грейса и связанным кошельком."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <Card className="!p-2.5 sm:!p-3">
              <p className="text-xs text-slate-500 dark:text-slate-400 sm:text-sm">Выгода float</p>
              <p
                className={`mt-0.5 text-base font-semibold tabular-nums sm:mt-1 sm:text-xl ${earnedColor}`}
              >
                {signedAmount(summary.totalEarnedBase, currency)}
              </p>
              <p className="mt-1 text-[11px] leading-snug text-slate-500 dark:text-slate-400 sm:text-xs">
                Накопление по дням изменений связанного счёта
              </p>
              {cumulativeInterestBase !== 0 ? (
                <p className={`mt-0.5 text-[11px] tabular-nums sm:text-xs ${earnTone(cumulativeInterestBase)}`}>
                  в т.ч. % с закреплённого {signedAmount(cumulativeInterestBase, currency)}
                </p>
              ) : null}
            </Card>
            <Card className="!p-2.5 sm:!p-3">
              <p className="text-xs text-slate-500 dark:text-slate-400 sm:text-sm">Долг по кредиткам</p>
              <p className="mt-0.5 text-base font-semibold tabular-nums text-slate-900 dark:text-slate-200 sm:mt-1 sm:text-xl">
                {formatCurrency(
                  summary.cards.reduce((s, c) => s + c.totalDebtBase, 0),
                  currency,
                )}
              </p>
            </Card>
          </div>

          <Card className="!p-3 sm:!p-4">
            <h2 className="mb-1 text-sm font-semibold text-slate-800 dark:text-slate-200">
              Расшифровка
            </h2>
            <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
              Прирост связанного счёта делится на базу, долю кредитки и проценты на ранее
              закреплённый float — каждый день изменения остатка.
            </p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-slate-500 dark:text-slate-400">База</dt>
                <dd className={`font-medium tabular-nums ${earnTone(totals.baseGrowthBase)}`}>
                  {signedAmount(totals.baseGrowthBase, currency)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500 dark:text-slate-400">Кредитка</dt>
                <dd className={`font-medium tabular-nums ${earnTone(totals.creditGrowthBase)}`}>
                  {signedAmount(totals.creditGrowthBase, currency)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500 dark:text-slate-400">% с кредитки</dt>
                <dd className={`font-medium tabular-nums ${earnTone(totals.interestGrowthBase)}`}>
                  {signedAmount(totals.interestGrowthBase, currency)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500 dark:text-slate-400">Доля от кредитных</dt>
                <dd className="font-medium tabular-nums text-slate-800 dark:text-slate-200">
                  {formatPercent(totals.creditShareOfGrowth)}
                </dd>
              </div>
            </dl>
          </Card>

          <Card className="!p-3 sm:!p-4">
            <h2 className="mb-1 text-sm font-semibold text-slate-800 dark:text-slate-200">По месяцам</h2>
            <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
              Откройте месяц: по каждому дню — формулы корзин. Наведите на число (на телефоне —
              нажмите), чтобы увидеть описание.
            </p>
            {months.length === 0 ? (
              <EmptyState
                title="Пока нет данных"
                description="Зафиксируйте остатки кредитки и связанного кошелька в чек-инах."
              />
            ) : (
              <ul className="space-y-2">
                {months.map((row) => {
                  const open = Boolean(expanded[row.month])
                  return (
                    <li
                      key={row.month}
                      className={`rounded-xl border ${
                        row.overdue
                          ? 'border-red-200 bg-red-50 dark:bg-red-950/40'
                          : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleMonth(row.month)}
                        className="flex w-full items-start justify-between gap-2 px-3 py-2.5 text-left"
                        aria-expanded={open}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 dark:text-slate-200">
                            <span className="mr-1.5 inline-block w-3 text-slate-400">
                              {open ? '▾' : '▸'}
                            </span>
                            {formatMonthLabel(row.month)}
                          </p>
                          <p
                            className={`text-[11px] ${
                              row.overdue
                                ? 'font-medium text-red-700'
                                : 'text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            до {formatDueDate(row.dueDate)}
                            {row.overdue ? ' · просрочено' : ''}
                            {' · '}
                            {row.days.length}{' '}
                            {row.days.length === 1 ? 'день' : 'дн.'}
                          </p>
                        </div>
                        <p
                          className={`shrink-0 text-sm font-semibold tabular-nums ${earnTone(row.earnedBase)}`}
                        >
                          {signedAmount(row.earnedBase, currency)}
                        </p>
                      </button>

                      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-slate-100 px-3 py-2 text-xs dark:border-slate-800 sm:grid-cols-4">
                        <div>
                          <dt className="text-slate-500 dark:text-slate-400">База</dt>
                          <dd className={`font-medium tabular-nums ${earnTone(row.baseGrowthBase)}`}>
                            {signedAmount(row.baseGrowthBase, currency)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-slate-500 dark:text-slate-400">Кредитка</dt>
                          <dd className={`font-medium tabular-nums ${earnTone(row.creditGrowthBase)}`}>
                            {signedAmount(row.creditGrowthBase, currency)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-slate-500 dark:text-slate-400">% с кредитки</dt>
                          <dd
                            className={`font-medium tabular-nums ${earnTone(row.interestGrowthBase)}`}
                          >
                            {signedAmount(row.interestGrowthBase, currency)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-slate-500 dark:text-slate-400">Доля кредитных</dt>
                          <dd className="font-medium tabular-nums text-slate-800 dark:text-slate-200">
                            {formatPercent(row.floatSharePct)}
                          </dd>
                        </div>
                      </dl>

                      {open ? (
                        <div className="space-y-2 border-t border-slate-100 px-3 py-2.5 dark:border-slate-800">
                          {row.days.length === 0 ? (
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              Нет дней с изменением связанного счёта
                            </p>
                          ) : (
                            row.days.map((day) => (
                              <DayBreakdown key={day.date} day={day} currency={currency} />
                            ))
                          )}
                        </div>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
