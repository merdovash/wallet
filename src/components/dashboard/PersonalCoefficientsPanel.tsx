import { formatPercent } from '../../lib/format'
import type { PersonalCoefficients } from '../../lib/personalCoefficients'
import { Card } from '../ui/FormControls'

interface PersonalCoefficientsProps {
  coefficients: PersonalCoefficients | null
}

function formatMonths(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${value.toFixed(1).replace('.', ',')} мес.`
}

function formatRatio(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return formatPercent(value)
}

export function PersonalCoefficientsPanel({ coefficients }: PersonalCoefficientsProps) {
  if (!coefficients) return null

  const hasData =
    coefficients.savingsRate != null ||
    coefficients.liquidityCushionMonths != null ||
    coefficients.debtLoad != null

  if (!hasData) return null

  return (
    <div className="grid grid-cols-2 gap-1.5">
      <Card className="!p-2">
        <p className="text-[10px] leading-tight text-slate-500 dark:text-slate-400">Норма сбережений</p>
        <p className="mt-0.5 text-sm font-semibold tabular-nums leading-tight text-slate-900 dark:text-slate-100">
          {formatRatio(coefficients.savingsRate)}
        </p>
      </Card>
      <Card className="!p-2">
        <p className="text-[10px] leading-tight text-slate-500 dark:text-slate-400">Подушка ликвидности</p>
        <p className="mt-0.5 text-sm font-semibold tabular-nums leading-tight text-slate-900 dark:text-slate-100">
          {formatMonths(coefficients.liquidityCushionMonths)}
        </p>
      </Card>
      <Card className="!p-2">
        <p className="text-[10px] leading-tight text-slate-500 dark:text-slate-400">Долговая нагрузка</p>
        <p className="mt-0.5 text-sm font-semibold tabular-nums leading-tight text-slate-900 dark:text-slate-100">
          {formatRatio(coefficients.debtLoad)}
        </p>
      </Card>
    </div>
  )
}
