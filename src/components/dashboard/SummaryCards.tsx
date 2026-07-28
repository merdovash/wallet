import { useState } from 'react'
import { formatCurrency, formatPercent, signedAmount } from '../../lib/format'
import type { PeriodReturnSummary } from '../../lib/monthlyReturns'
import { Card } from '../ui/FormControls'
import { ReturnBreakdownPanel } from './ReturnBreakdownPanel'

interface SummaryCardsProps {
  total: number
  growth: number
  currency: string
  periodReturn?: PeriodReturnSummary | null
}

export function SummaryCards({ total, growth, currency, periodReturn }: SummaryCardsProps) {
  const [breakdownFocus, setBreakdownFocus] = useState<'growthPct' | 'annualizedPct' | null>(
    null,
  )

  const growthColor = growth > 0 ? 'text-emerald-700' : growth < 0 ? 'text-red-600' : 'text-slate-800'
  const topUp = periodReturn?.netFlow ?? 0
  const topUpColor = topUp > 0 ? 'text-emerald-700' : topUp < 0 ? 'text-red-600' : 'text-slate-800'
  const pctColor =
    (periodReturn?.growthPct ?? 0) > 0
      ? 'text-emerald-700'
      : (periodReturn?.growthPct ?? 0) < 0
        ? 'text-red-600'
        : 'text-slate-800'

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-5">
        <Card className="!p-2.5 sm:!p-3">
          <p className="text-xs text-slate-500 sm:text-sm">Остаток</p>
          <p className="mt-0.5 text-base font-semibold tabular-nums text-slate-900 sm:text-lg">
            {formatCurrency(total, currency)}
          </p>
        </Card>
        <Card className="!p-2.5 sm:!p-3">
          <p className="text-xs text-slate-500 sm:text-sm">Прирост</p>
          <p className={`mt-0.5 text-base font-semibold tabular-nums sm:text-lg ${growthColor}`}>
            {signedAmount(growth, currency)}
          </p>
          <p className="mt-1 text-[10px] text-slate-400">накоп./вклады/инвест.</p>
        </Card>
        <Card className="!p-2.5 sm:!p-3">
          <p className="text-xs text-slate-500 sm:text-sm">Пополнения</p>
          <p className={`mt-0.5 text-base font-semibold tabular-nums sm:text-lg ${topUpColor}`}>
            {periodReturn ? signedAmount(topUp, currency) : '—'}
          </p>
          <p className="mt-1 text-[10px] text-slate-400">фонд / вклад / инвест.</p>
        </Card>
        <button
          type="button"
          onClick={() => setBreakdownFocus('growthPct')}
          className="rounded-xl text-left transition hover:ring-2 hover:ring-blue-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          title="Показать расчёт прироста %"
        >
          <Card className="!p-2.5 sm:!p-3">
            <p className="text-xs text-slate-500 sm:text-sm">Прирост %</p>
            <p className={`mt-0.5 text-base font-semibold tabular-nums sm:text-lg ${pctColor}`}>
              {formatPercent(periodReturn?.growthPct)}
            </p>
            <p className="mt-1 text-[10px] text-blue-600">как считается</p>
          </Card>
        </button>
        <button
          type="button"
          onClick={() => setBreakdownFocus('annualizedPct')}
          className="rounded-xl text-left transition hover:ring-2 hover:ring-blue-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          title="Показать расчёт годовых"
        >
          <Card className="!p-2.5 sm:!p-3">
            <p className="text-xs text-slate-500 sm:text-sm">В годовых</p>
            <p className={`mt-0.5 text-base font-semibold tabular-nums sm:text-lg ${pctColor}`}>
              {formatPercent(periodReturn?.annualizedPct)}
            </p>
            <p className="mt-1 text-[10px] text-blue-600">как считается</p>
          </Card>
        </button>
      </div>

      <ReturnBreakdownPanel
        open={breakdownFocus != null}
        onClose={() => setBreakdownFocus(null)}
        focus={breakdownFocus}
        periodReturn={periodReturn ?? null}
        currency={currency}
      />
    </>
  )
}
