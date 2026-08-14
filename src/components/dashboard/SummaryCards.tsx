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

  const growthColor = growth > 0 ? 'text-emerald-700 dark:text-emerald-400' : growth < 0 ? 'text-red-600' : 'text-slate-800 dark:text-slate-200'
  const topUp = periodReturn?.netFlow ?? 0
  const topUpColor = topUp > 0 ? 'text-emerald-700 dark:text-emerald-400' : topUp < 0 ? 'text-red-600' : 'text-slate-800 dark:text-slate-200'
  const pctColor =
    (periodReturn?.growthPct ?? 0) > 0
      ? 'text-emerald-700 dark:text-emerald-400'
      : (periodReturn?.growthPct ?? 0) < 0
        ? 'text-red-600'
        : 'text-slate-800 dark:text-slate-200'

  const allMassAnnualized = periodReturn?.annualizedPctOfAllMass
  const realAnnualized = periodReturn?.realAnnualizedPct
  const allMassColor =
    (allMassAnnualized ?? 0) > 0
      ? 'text-emerald-700 dark:text-emerald-400'
      : (allMassAnnualized ?? 0) < 0
        ? 'text-red-600'
        : 'text-slate-800 dark:text-slate-200'

  const realColor =
    (realAnnualized ?? 0) > 0
      ? 'text-emerald-700 dark:text-emerald-400'
      : (realAnnualized ?? 0) < 0
        ? 'text-red-600'
        : 'text-slate-800 dark:text-slate-200'

  const annualizedReason = explainAnnualizedPct(periodReturn)
  const allMassReason = explainAnnualizedPctOfAllMass(periodReturn)
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
            <p className={labelClass}>Прирост</p>
            <p className={`${valueClass} ${growthColor}`}>{signedAmount(growth, currency)}</p>
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
        <button type="button" onClick={() => setBreakdownFocus('growthPct')} className={clickCardClass}>
          <Card className={cardClass}>
            <p className={labelClass}>Прирост %</p>
            <p className={`${valueClass} ${pctColor}`}>{formatPercent(periodReturn?.growthPct)}</p>
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
        <button
          type="button"
          onClick={() => setBreakdownFocus('annualizedPctOfAllMass')}
          className={clickCardClass}
        >
          <Card className={cardClass}>
            <p className={labelClass}>Годовых от массы</p>
            <AnnualizedMetric
              value={allMassAnnualized}
              unavailableReason={allMassReason}
              valueClassName={allMassColor}
              compact
            />
          </Card>
        </button>
        <Card className={cardClass}>
          <p className={labelClass}>Реальных годовых</p>
          <AnnualizedMetric
            value={realAnnualized}
            unavailableReason={realReason}
            valueClassName={realColor}
            compact
          />
        </Card>
        <button type="button" onClick={() => setBreakdownFocus('growth')} className={clickCardClass}>
          <Card className={cardClass}>
            <p className={labelClass}>Без курса</p>
            {periodReturn?.quantityEffectBase != null ? (
              <>
                <p
                  className={`${valueClass} ${
                    periodReturn.quantityEffectBase > 0
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : periodReturn.quantityEffectBase < 0
                        ? 'text-red-600'
                        : 'text-slate-800 dark:text-slate-200'
                  }`}
                >
                  {signedAmount(periodReturn.quantityEffectBase, currency)}
                </p>
                <p
                  className={`mt-0.5 text-[10px] font-semibold tabular-nums leading-tight ${
                    (periodReturn.quantityEffectPct ?? 0) > 0
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : (periodReturn.quantityEffectPct ?? 0) < 0
                        ? 'text-red-600'
                        : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {formatPercent(periodReturn.quantityEffectPct)}
                </p>
              </>
            ) : (
              <p className={`${valueClass} text-slate-800 dark:text-slate-200`}>—</p>
            )}
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
