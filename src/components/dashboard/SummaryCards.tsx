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
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <p className="text-sm text-slate-500">Остаток</p>
        <p className="mt-1 text-xl font-semibold text-slate-900">{formatCurrency(total, currency)}</p>
      </Card>
      <Card>
        <p className="text-sm text-slate-500">Прирост</p>
        <p className={`mt-1 text-xl font-semibold ${growthColor}`}>{signedAmount(growth, currency)}</p>
      </Card>
      <Card>
        <p className="text-sm text-slate-500">Прирост %</p>
        <p className={`mt-1 text-xl font-semibold ${pctColor}`}>
          {formatPercent(periodReturn?.growthPct)}
        </p>
      </Card>
      <Card>
        <p className="text-sm text-slate-500">В годовых</p>
        <p className={`mt-1 text-xl font-semibold ${pctColor}`}>
          {formatPercent(periodReturn?.annualizedPct)}
        </p>
      </Card>
    </div>
  )
}
