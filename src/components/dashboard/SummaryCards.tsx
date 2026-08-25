import { useState } from 'react'
import { formatCurrency, formatPercent, signedAmount } from '../../lib/format'
import {
  explainAnnualizedPct,
  explainRealAnnualizedPct,
  pctOfAllMass,
  type PeriodReturnSummary,
} from '../../lib/monthlyReturns'
import { useFxModeStore } from '../../store/fxModeStore'
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

type BreakdownFocus = 'growth' | 'growthPct' | 'annualizedPct' | 'topUp' | null

const cardClass = '!p-2'
const labelClass = 'text-[10px] leading-tight text-slate-500 dark:text-slate-400'
const valueClass = 'mt-0.5 text-sm font-semibold tabular-nums leading-tight'

export function SummaryCards({
  total,
  growth,
  currency,
  periodReturn,
  annualInflationPct,
}: SummaryCardsProps) {
  const [breakdownFocus, setBreakdownFocus] = useState<BreakdownFocus>(null)
  const fxMode = useFxModeStore((s) => s.fxMode)
  const withoutFx = fxMode === 'withoutFx'

  const displayGrowth = withoutFx
    ? (periodReturn?.quantityEffectBase ?? growth)
    : growth

  /** Прирост ÷ сумма инвест-счетов (фонд/вклад/инвестиции) на начало периода. */
  const investPct =
    periodReturn != null ? pctOfAllMass(displayGrowth, periodReturn.startTotal) : null
  /** Прирост ÷ весь остаток на начало периода (без кредитки). */
  const allMassPct =
    periodReturn != null
      ? pctOfAllMass(displayGrowth, periodReturn.startTotalAllMass)
      : null

  const growthColor =
    displayGrowth > 0
      ? 'text-emerald-700 dark:text-emerald-400'
      : displayGrowth < 0
        ? 'text-red-600'
        : 'text-slate-800 dark:text-slate-200'
  const topUp = periodReturn?.netFlow ?? 0
  const topUpColor =
    topUp > 0
      ? 'text-emerald-700 dark:text-emerald-400'
      : topUp < 0
        ? 'text-red-600'
        : 'text-slate-800 dark:text-slate-200'
  const pctColor =
    (investPct ?? 0) > 0
      ? 'text-emerald-700 dark:text-emerald-400'
      : (investPct ?? 0) < 0
        ? 'text-red-600'
        : 'text-slate-800 dark:text-slate-200'

  const realAnnualized = periodReturn?.realAnnualizedPct
  const realColor =
    (realAnnualized ?? 0) > 0
      ? 'text-emerald-700 dark:text-emerald-400'
      : (realAnnualized ?? 0) < 0
        ? 'text-red-600'
        : 'text-slate-800 dark:text-slate-200'

  const annualizedReason = explainAnnualizedPct(periodReturn)
  const realReason = explainRealAnnualizedPct(periodReturn, annualInflationPct)

  const clickCardClass =
    'rounded-xl text-left transition hover:ring-2 hover:ring-blue-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400'

  return (
    <>
      <div className="grid grid-cols-2 gap-1.5">
        <Card className={cardClass}>
          <p className={labelClass}>Остаток</p>
          <p className={`${valueClass} text-slate-900 dark:text-slate-200`}>
            {formatCurrency(total, currency)}
          </p>
        </Card>
        <button type="button" onClick={() => setBreakdownFocus('growth')} className={clickCardClass}>
          <Card className={cardClass}>
            <p className={labelClass}>
              Прирост{withoutFx ? ' · без курса' : ''}
            </p>
            <p className={`${valueClass} ${growthColor}`}>{signedAmount(displayGrowth, currency)}</p>
            <p className={`mt-0.5 text-[10px] font-semibold tabular-nums leading-tight ${pctColor}`}>
              {formatPercent(investPct)}
              <span className="font-normal text-slate-500 dark:text-slate-400"> инвест</span>
              {' · '}
              {formatPercent(allMassPct)}
              <span className="font-normal text-slate-500 dark:text-slate-400"> от всего</span>
            </p>
          </Card>
        </button>
        <button type="button" onClick={() => setBreakdownFocus('topUp')} className={clickCardClass}>
          <Card className={cardClass}>
            <p className={labelClass}>Чистый поток</p>
            <p className={`${valueClass} ${topUpColor}`}>
              {periodReturn ? signedAmount(topUp, currency) : '—'}
            </p>
          </Card>
        </button>
        <button type="button" onClick={() => setBreakdownFocus('annualizedPct')} className={clickCardClass}>
          <Card className={cardClass}>
            <p className={labelClass}>В годовых</p>
            <AnnualizedMetric
              value={periodReturn?.annualizedPct}
              unavailableReason={annualizedReason}
              valueClassName={pctColor}
              compact
            />
          </Card>
        </button>
        <Card className={`${cardClass} col-span-2`}>
          <p className={labelClass}>Реальных годовых</p>
          <AnnualizedMetric
            value={realAnnualized}
            unavailableReason={realReason}
            valueClassName={realColor}
            compact
          />
        </Card>
      </div>

      <ReturnBreakdownPanel
        open={breakdownFocus != null}
        onClose={() => setBreakdownFocus(null)}
        focus={breakdownFocus}
        periodReturn={periodReturn ?? null}
        currency={currency}
        fxMode={fxMode}
      />
    </>
  )
}
