import { formatCurrency, formatPercent, signedAmount } from '../../lib/format'
import type { PeriodReturnSummary } from '../../lib/monthlyReturns'
import { Card } from '../ui/FormControls'

interface SummaryCardsProps {
  total: number
  growth: number
  currency: string
  periodReturn?: PeriodReturnSummary | null
}

export function SummaryCards({ total, growth, currency, periodReturn }: SummaryCardsProps) {
  const growthColor = growth > 0 ? 'text-emerald-700' : growth < 0 ? 'text-red-600' : 'text-slate-800'
  const pctColor =
    (periodReturn?.growthPct ?? 0) > 0
      ? 'text-emerald-700'
      : (periodReturn?.growthPct ?? 0) < 0
        ? 'text-red-600'
        : 'text-slate-800'

  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
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
      </Card>
      <Card className="!p-2.5 sm:!p-3">
        <p className="text-xs text-slate-500 sm:text-sm">Прирост %</p>
        <p className={`mt-0.5 text-base font-semibold tabular-nums sm:text-lg ${pctColor}`}>
          {formatPercent(periodReturn?.growthPct)}
        </p>
      </Card>
      <Card className="!p-2.5 sm:!p-3">
        <p className="text-xs text-slate-500 sm:text-sm">В годовых</p>
        <p className={`mt-0.5 text-base font-semibold tabular-nums sm:text-lg ${pctColor}`}>
          {formatPercent(periodReturn?.annualizedPct)}
        </p>
      </Card>
    </div>
  )
}
