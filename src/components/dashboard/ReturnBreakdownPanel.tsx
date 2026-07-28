import {
  formatCurrency,
  formatDateDisplay,
  formatPercent,
  signedAmount,
} from '../../lib/format'
import type { PeriodReturnSummary } from '../../lib/monthlyReturns'
import { StackPanel } from '../ui/StackPanel'

interface ReturnBreakdownPanelProps {
  open: boolean
  onClose: () => void
  focus: 'growthPct' | 'annualizedPct' | null
  periodReturn: PeriodReturnSummary | null
  currency: string
}

export function ReturnBreakdownPanel({
  open,
  onClose,
  focus,
  periodReturn,
  currency,
}: ReturnBreakdownPanelProps) {
  const title =
    focus === 'annualizedPct' ? 'Расчёт: в годовых' : 'Расчёт: прирост %'

  return (
    <StackPanel open={open} title={title} onClose={onClose}>
      {!periodReturn ? (
        <p className="text-sm text-slate-500">
          Недостаточно данных: нужны минимум два чек-ина и счета типа фонд, вклад или инвестиции.
        </p>
      ) : (
        <div className="space-y-4 text-sm text-slate-700">
          <p className="text-xs text-slate-500">
            В расчёт входят только счета «фонд», «вклад» и «инвестиции» ({periodReturn.accountCount}
            ). Оперативные, наличка и кредитки не учитываются. Доходы и расходы чек-инов вычитаются
            из прироста.
          </p>

          <dl className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            <Row
              label="Период"
              value={`${formatDateDisplay(periodReturn.startDate)} → ${formatDateDisplay(periodReturn.endDate)}`}
            />
            <Row label="Дней" value={String(periodReturn.days)} />
            <Row
              label="Капитал на начало"
              value={formatCurrency(periodReturn.startTotal, currency)}
            />
            <Row
              label="Капитал на конец"
              value={formatCurrency(periodReturn.endTotal, currency)}
            />
            <Row
              label="Чистый внешний поток (доход − расход)"
              value={signedAmount(periodReturn.netFlow, currency)}
            />
            <Row
              label="Прирост"
              value={signedAmount(periodReturn.growth, currency)}
              hint="конец − начало − поток"
            />
            <Row
              label="Прирост %"
              value={formatPercent(periodReturn.growthPct)}
              hint="прирост ÷ капитал на начало"
              emphasize={focus === 'growthPct'}
            />
            <Row
              label="В годовых"
              value={formatPercent(periodReturn.annualizedPct)}
              hint={
                periodReturn.days > 0
                  ? `(1 + прирост%) ^ (365 ÷ ${periodReturn.days}) − 1`
                  : undefined
              }
              emphasize={focus === 'annualizedPct'}
            />
          </dl>

          {focus === 'growthPct' && (
            <FormulaBlock
              title="Формула прироста %"
              lines={[
                'прирост = капитал_конец − капитал_начало − (доход − расход)',
                'прирост% = прирост ÷ капитал_начало',
              ]}
            />
          )}
          {focus === 'annualizedPct' && (
            <FormulaBlock
              title="Формула годовых"
              lines={[
                'Сначала считается прирост% за период (см. выше).',
                `годовых = (1 + прирост%)^(365/${periodReturn.days || 'N'}) − 1`,
                'Так простой процент за период пересчитывается в эквивалент за 365 дней.',
              ]}
            />
          )}
        </div>
      )}
    </StackPanel>
  )
}

function Row({
  label,
  value,
  hint,
  emphasize = false,
}: {
  label: string
  value: string
  hint?: string
  emphasize?: boolean
}) {
  return (
    <div
      className={`flex items-start justify-between gap-3 px-3 py-2.5 ${
        emphasize ? 'bg-blue-50' : ''
      }`}
    >
      <dt className="min-w-0 text-slate-500">
        <span className="block">{label}</span>
        {hint ? <span className="mt-0.5 block text-[11px] text-slate-400">{hint}</span> : null}
      </dt>
      <dd className="shrink-0 text-right font-medium tabular-nums text-slate-900">{value}</dd>
    </div>
  )
}

function FormulaBlock({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <ul className="mt-2 space-y-1 font-mono text-xs text-slate-700">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  )
}
