import { formatCurrency, signedAmount } from '../../lib/format'
import { Card } from '../ui/FormControls'

interface SummaryCardsProps {
  total: number
  growth: number
  currency: string
}

export function SummaryCards({ total, growth, currency }: SummaryCardsProps) {
  const growthColor = growth > 0 ? 'text-emerald-700' : growth < 0 ? 'text-red-600' : 'text-slate-800'

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Card>
        <p className="text-sm text-slate-500">Всего</p>
        <p className="mt-1 text-xl font-semibold text-slate-900">{formatCurrency(total, currency)}</p>
      </Card>
      <Card>
        <p className="text-sm text-slate-500">Прирост</p>
        <p className={`mt-1 text-xl font-semibold ${growthColor}`}>{signedAmount(growth, currency)}</p>
      </Card>
    </div>
  )
}
