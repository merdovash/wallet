import { formatCurrency, formatPercent } from '../../lib/format'
import type { PersonalCoefficients } from '../../lib/personalCoefficients'
import { Card } from '../ui/FormControls'

interface PersonalCoefficientsProps {
  coefficients: PersonalCoefficients | null
  currency: string
  periodLabel?: string
}

function formatMonths(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${value.toFixed(1).replace('.', ',')} мес.`
}

function formatRatio(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return formatPercent(value)
}

export function PersonalCoefficientsPanel({
  coefficients,
  currency,
  periodLabel,
}: PersonalCoefficientsProps) {
  if (!coefficients) return null

  const hasData =
    coefficients.savingsRate != null ||
    coefficients.liquidityCushionMonths != null ||
    coefficients.debtLoad != null

  if (!hasData) return null

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Card className="px-4 py-3">
        <p className="text-xs text-slate-500 dark:text-slate-400">Норма сбережений</p>
        <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
          {formatRatio(coefficients.savingsRate)}
        </p>
        <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
          {signedFlow(coefficients.netFlowToPortfolio, currency)} ÷{' '}
          {formatCurrency(coefficients.totalIncome, currency)}
          {periodLabel ? ` · ${periodLabel}` : ''}
        </p>
      </Card>
      <Card className="px-4 py-3">
        <p className="text-xs text-slate-500 dark:text-slate-400">Подушка ликвидности</p>
        <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
          {formatMonths(coefficients.liquidityCushionMonths)}
        </p>
        <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
          {formatCurrency(coefficients.liquidBalance, currency)} ÷{' '}
          {coefficients.avgMonthlyExpense != null
            ? `${formatCurrency(coefficients.avgMonthlyExpense, currency)}/мес`
            : '—'}
        </p>
      </Card>
      <Card className="px-4 py-3">
        <p className="text-xs text-slate-500 dark:text-slate-400">Долговая нагрузка</p>
        <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
          {formatRatio(coefficients.debtLoad)}
        </p>
        <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
          {formatCurrency(coefficients.creditDebt, currency)} ÷{' '}
          {coefficients.avgMonthlyIncome != null
            ? `${formatCurrency(coefficients.avgMonthlyIncome, currency)}/мес`
            : '—'}
        </p>
      </Card>
    </div>
  )
}

function signedFlow(value: number, currency: string): string {
  const abs = formatCurrency(Math.abs(value), currency)
  if (value > 0) return `+${abs}`
  if (value < 0) return `−${abs}`
  return abs
}
