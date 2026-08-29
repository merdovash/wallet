import {
  formatCurrency,
  formatDateDisplay,
  formatPercent,
  signedAmount,
} from '../../lib/format'
import type { CurrencyFxBreakdown } from '../../lib/currencyValueSeries'
import { StackPanel } from '../ui/StackPanel'

interface CurrencyFxBreakdownPanelProps {
  open: boolean
  onClose: () => void
  breakdown: CurrencyFxBreakdown | null
  baseCurrency: string
}

function tone(value: number): string {
  if (value > 0) return 'text-emerald-700 dark:text-emerald-400'
  if (value < 0) return 'text-red-600'
  return 'text-slate-800 dark:text-slate-200'
}

export function CurrencyFxBreakdownPanel({
  open,
  onClose,
  breakdown,
  baseCurrency,
}: CurrencyFxBreakdownPanelProps) {
  return (
    <StackPanel open={open} title="Расшифровка: курсовая разница" onClose={onClose} dataQa="currency-fx">
      {!breakdown ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Недостаточно данных: нужны чек-ины и счета в иностранной валюте.
        </p>
      ) : (
        <div className="space-y-4 text-sm text-slate-700 dark:text-slate-300">
          <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
            <p className="font-semibold">Что считается</p>
            <p className="mt-1">
              Изменение эквивалента всех иностранных счетов (включая оперативные и наличные) в{' '}
              {baseCurrency}. Базовая валюта не входит. Итог = курсовой эффект + изменение
              остатков.
            </p>
          </div>

          <dl className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
            <Row
              label="Период"
              value={`${formatDateDisplay(breakdown.fromDate)} → ${formatDateDisplay(breakdown.toDate)}`}
            />
            <Row
              label="Эквивалент на начало"
              value={formatCurrency(breakdown.startTotal, baseCurrency)}
            />
            <Row
              label="Эквивалент на конец"
              value={formatCurrency(breakdown.endTotal, baseCurrency)}
            />
            <Row
              label="Курсовая разница"
              value={signedAmount(breakdown.absolute, baseCurrency)}
              valueClassName={tone(breakdown.absolute)}
            />
            <Row label="Относительно начала" value={formatPercent(breakdown.relative)} />
          </dl>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Факторы
            </h3>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
              {breakdown.factors.map((factor) => (
                <li
                  key={factor.key}
                  className="flex items-start justify-between gap-3 px-3 py-2"
                >
                  <span className="min-w-0">
                    <span className="block font-medium text-slate-900 dark:text-slate-200">{factor.label}</span>
                    {factor.hint ? (
                      <span className="text-[11px] text-slate-400 dark:text-slate-500">{factor.hint}</span>
                    ) : null}
                  </span>
                  <span className={`shrink-0 tabular-nums ${tone(factor.amount)}`}>
                    {factor.unit === 'rate'
                      ? `${factor.amount > 0 ? '+' : factor.amount < 0 ? '−' : ''}${Math.abs(factor.amount).toFixed(2).replace('.', ',')}`
                      : signedAmount(factor.amount, baseCurrency)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Счета по убыванию разницы
            </h3>
            {breakdown.accounts.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500">Нет валютных счетов</p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                {breakdown.accounts.map((acc) => (
                  <li key={acc.accountId} className="px-3 py-2" data-qa={`currency-fx-account-${acc.accountId}`}>
                    <div className="flex items-start justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-slate-900 dark:text-slate-200">
                          {acc.name}
                        </span>
                        <span className="text-[11px] text-slate-400 dark:text-slate-500">
                          {acc.kindLabel} · {acc.currency}
                        </span>
                      </span>
                      <span className={`shrink-0 text-right tabular-nums ${tone(acc.changeBase)}`}>
                        {signedAmount(acc.changeBase, baseCurrency)}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      <span>курс {signedAmount(acc.fxEffectBase, baseCurrency)}</span>
                      <span>остаток {signedAmount(acc.quantityEffectBase, baseCurrency)}</span>
                      <span>
                        {formatCurrency(acc.startBalance, acc.currency)} →{' '}
                        {formatCurrency(acc.endBalance, acc.currency)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </StackPanel>
  )
}

function Row({
  label,
  value,
  valueClassName,
}: {
  label: string
  value: string
  valueClassName?: string
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-3 py-2.5">
      <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
      <dd
        className={`shrink-0 text-right font-medium tabular-nums ${valueClassName ?? 'text-slate-900 dark:text-slate-200'}`}
      >
        {value}
      </dd>
    </div>
  )
}
