import { useState } from 'react'
import { formatCurrency, formatPercent, signedAmount } from '../../lib/format'
import {
  explainAnnualizedPct,
  explainAnnualizedPctOfAllMass,
  explainRealAnnualizedPct,
  type PeriodReturnSummary,
} from '../../lib/monthlyReturns'
import { Card } from '../ui/FormControls'
import { AnnualizedMetric } from './AnnualizedMetric'
import { ReturnBreakdownPanel } from './ReturnBreakdownPanel'

interface SummaryCardsProps {
  total: number
  growth: number
  currency: string
  periodReturn?: PeriodReturnSummary | null
  annualInflationPct?: number | null
}

type BreakdownFocus =
  | 'growth'
  | 'growthPct'
  | 'annualizedPct'
  | 'annualizedPctOfAllMass'
  | 'topUp'
  | null

export function SummaryCards({
  total,
  growth,
  currency,
  periodReturn,
  annualInflationPct,
}: SummaryCardsProps) {
  const [breakdownFocus, setBreakdownFocus] = useState<BreakdownFocus>(null)

  const growthColor = growth > 0 ? 'text-emerald-700' : growth < 0 ? 'text-red-600' : 'text-slate-800 dark:text-slate-200'
  const topUp = periodReturn?.netFlow ?? 0
  const topUpColor = topUp > 0 ? 'text-emerald-700' : topUp < 0 ? 'text-red-600' : 'text-slate-800 dark:text-slate-200'
  const pctColor =
    (periodReturn?.growthPct ?? 0) > 0
      ? 'text-emerald-700'
      : (periodReturn?.growthPct ?? 0) < 0
        ? 'text-red-600'
        : 'text-slate-800 dark:text-slate-200'

  const allMassAnnualized = periodReturn?.annualizedPctOfAllMass
  const realAnnualized = periodReturn?.realAnnualizedPct
  const allMassColor =
    (allMassAnnualized ?? 0) > 0
      ? 'text-emerald-700'
      : (allMassAnnualized ?? 0) < 0
        ? 'text-red-600'
        : 'text-slate-800 dark:text-slate-200'

  const realColor =
    (realAnnualized ?? 0) > 0
      ? 'text-emerald-700'
      : (realAnnualized ?? 0) < 0
        ? 'text-red-600'
        : 'text-slate-800 dark:text-slate-200'

  const annualizedReason = explainAnnualizedPct(periodReturn)
  const allMassReason = explainAnnualizedPctOfAllMass(periodReturn)
  const realReason = explainRealAnnualizedPct(periodReturn, annualInflationPct)

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7">
        <Card className="!p-2.5 sm:!p-3">
          <p className="text-xs text-slate-500 dark:text-slate-400 sm:text-sm">Остаток</p>
          <p className="mt-0.5 text-base font-semibold tabular-nums text-slate-900 dark:text-slate-100 sm:text-lg">
            {formatCurrency(total, currency)}
          </p>
          <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">все счета · чистая стоимость</p>
        </Card>
        <button
          type="button"
          onClick={() => setBreakdownFocus('growth')}
          className="rounded-xl text-left transition hover:ring-2 hover:ring-blue-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          title="Показать расшифровку прироста"
        >
          <Card className="!p-2.5 sm:!p-3">
            <p className="text-xs text-slate-500 dark:text-slate-400 sm:text-sm">Прирост</p>
            <p className={`mt-0.5 text-base font-semibold tabular-nums sm:text-lg ${growthColor}`}>
              {signedAmount(growth, currency)}
            </p>
            <p className="mt-1 text-[10px] text-blue-600">портфель роста · как считается</p>
          </Card>
        </button>
        <button
          type="button"
          onClick={() => setBreakdownFocus('topUp')}
          className="rounded-xl text-left transition hover:ring-2 hover:ring-blue-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          title="Показать расшифровку чистого потока"
        >
          <Card className="!p-2.5 sm:!p-3">
            <p className="text-xs text-slate-500 dark:text-slate-400 sm:text-sm">Чистый поток</p>
            <p className={`mt-0.5 text-base font-semibold tabular-nums sm:text-lg ${topUpColor}`}>
              {periodReturn ? signedAmount(topUp, currency) : '—'}
            </p>
            <p className="mt-1 text-[10px] text-blue-600">как считается</p>
          </Card>
        </button>
        <button
          type="button"
          onClick={() => setBreakdownFocus('growthPct')}
          className="rounded-xl text-left transition hover:ring-2 hover:ring-blue-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          title="Прирост % только по фондам, вкладам и инвестициям"
        >
          <Card className="!p-2.5 sm:!p-3">
            <p className="text-xs text-slate-500 dark:text-slate-400 sm:text-sm">Прирост %</p>
            <p className={`mt-0.5 text-base font-semibold tabular-nums sm:text-lg ${pctColor}`}>
              {formatPercent(periodReturn?.growthPct)}
            </p>
            <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">фонды · вклады · инвестиции</p>
          </Card>
        </button>
        <button
          type="button"
          onClick={() => setBreakdownFocus('annualizedPct')}
          className="rounded-xl text-left transition hover:ring-2 hover:ring-blue-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          title="Годовые % только по фондам, вкладам и инвестициям"
        >
          <Card className="!p-2.5 sm:!p-3">
            <p className="text-xs text-slate-500 dark:text-slate-400 sm:text-sm">В годовых</p>
            <AnnualizedMetric
              value={periodReturn?.annualizedPct}
              unavailableReason={annualizedReason}
              valueClassName={pctColor}
            />
            <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">фонды · вклады · инвестиции</p>
          </Card>
        </button>
        <button
          type="button"
          onClick={() => setBreakdownFocus('annualizedPctOfAllMass')}
          className="rounded-xl text-left transition hover:ring-2 hover:ring-blue-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          title="Годовой прирост % от всей массы денег"
        >
          <Card className="!p-2.5 sm:!p-3">
            <p className="text-xs text-slate-500 dark:text-slate-400 sm:text-sm">Годовых от массы</p>
            <AnnualizedMetric
              value={allMassAnnualized}
              unavailableReason={allMassReason}
              valueClassName={allMassColor}
            />
            <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">прирост ÷ вся масса</p>
          </Card>
        </button>
        <Card className="!p-2.5 sm:!p-3">
          <p className="text-xs text-slate-500 dark:text-slate-400 sm:text-sm">Реальных годовых</p>
          <AnnualizedMetric
            value={realAnnualized}
            unavailableReason={realReason}
            valueClassName={realColor}
          />
          <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">за вычетом инфляции</p>
        </Card>
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
