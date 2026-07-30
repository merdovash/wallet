import {
  formatCurrency,
  formatDateDisplay,
  formatPercent,
  signedAmount,
} from '../../lib/format'
import type { PeriodReturnAccountLine, PeriodReturnSummary } from '../../lib/monthlyReturns'
import { StackPanel } from '../ui/StackPanel'

interface ReturnBreakdownPanelProps {
  open: boolean
  onClose: () => void
  focus: 'growth' | 'growthPct' | 'annualizedPct' | 'topUp' | null
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
    focus === 'annualizedPct'
      ? 'Расчёт: в годовых'
      : focus === 'growth'
        ? 'Расшифровка: прирост'
        : focus === 'topUp'
          ? 'Расшифровка: пополнения'
          : 'Расчёт: прирост %'

  const includedSorted = periodReturn
    ? [...periodReturn.includedAccounts].sort(
        (a, b) => b.growthBase - a.growthBase || a.name.localeCompare(b.name),
      )
    : []

  return (
    <StackPanel open={open} title={title} onClose={onClose}>
      {!periodReturn ? (
        <p className="text-sm text-slate-500">
          Недостаточно данных: нужны минимум два чек-ина и счета типа накопления (фонд), вклад
          или инвестиции.
        </p>
      ) : (
        <div className="space-y-4 text-sm text-slate-700">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
            <p className="font-semibold">Что входит в прирост</p>
            <p className="mt-1">
              Только накопления (фонд), вклады и инвестиции — {periodReturn.accountCount} счёт(а).
              Доходы и расходы с оперативных счетов в прирост не входят. Пополнения
              переводом в портфель роста лишь меняют капитал с даты поступления (метод
              Modified Dietz).
            </p>
          </div>

          <dl className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            <Row
              label="Период"
              value={`${formatDateDisplay(periodReturn.startDate)} → ${formatDateDisplay(periodReturn.endDate)}`}
            />
            <Row label="Дней" value={String(periodReturn.days)} />
            <Row
              label="Капитал на начало"
              value={formatCurrency(periodReturn.startTotal, currency)}
              hint="сумма только включённых счетов"
            />
            <Row
              label="Капитал на конец"
              value={formatCurrency(periodReturn.endTotal, currency)}
            />
            <Row
              label="Чистый капитал (пополнения)"
              value={signedAmount(periodReturn.netFlow, currency)}
              hint="переводы в/из портфеля роста (доход/расход не входят)"
              emphasize={focus === 'topUp'}
            />
            <Row
              label="Взвешенный капитал"
              value={formatCurrency(periodReturn.weightedCapital, currency)}
              hint="начало + потоки × доля оставшихся дней"
            />
            <Row
              label="Прирост"
              value={signedAmount(periodReturn.growth, currency)}
              hint="конец − начало − поток"
              emphasize={focus === 'growth'}
            />
            <Row
              label="Прирост %"
              value={formatPercent(periodReturn.growthPct)}
              hint="прирост ÷ взвешенный капитал"
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

          {periodReturn.flows.length > 0 ? (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Потоки капитала
              </h3>
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {periodReturn.flows.map((flow) => (
                  <li
                    key={`${flow.date}-${flow.amount}`}
                    className="flex items-start justify-between gap-3 px-3 py-2 text-xs"
                  >
                    <span>
                      <span className="block font-medium text-slate-900">
                        {formatDateDisplay(flow.date)}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        вес {(flow.weight * 100).toFixed(0).replace('.', ',')}% периода
                      </span>
                    </span>
                    <span className="shrink-0 text-right tabular-nums text-slate-700">
                      <span className="block">{signedAmount(flow.amount, currency)}</span>
                      <span className="text-[11px] text-slate-400">
                        → {signedAmount(flow.weightedAmount, currency)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <AccountSection
            title={
              focus === 'growth' || focus === 'topUp'
                ? 'Счета по убыванию изменения'
                : 'Включены в расчёт'
            }
            tone="include"
            accounts={includedSorted}
            currency={currency}
            showDelta
          />
          <AccountSection
            title="Не учитываются"
            tone="exclude"
            accounts={periodReturn.excludedAccounts}
            currency={currency}
          />

          {(focus === 'growth' || focus === 'topUp') && (
            <FormulaBlock
              title="Формула прироста"
              lines={[
                'капитал = сумма фондов/накоплений + вкладов + инвестиций',
                'поток = переводы в/из портфеля роста',
                'прирост = капитал_конец − капитал_начало − поток',
              ]}
            />
          )}
          {focus === 'growthPct' && (
            <FormulaBlock
              title="Формула прироста %"
              lines={[
                'капитал = сумма фондов/накоплений + вкладов + инвестиций',
                'поток = переводы в/из портфеля роста (доход и расход с оперативных не входят)',
                'прирост = капитал_конец − капитал_начало − поток',
                'вес потока = (дни_после_даты) ÷ дней_периода',
                'взвеш.капитал = начало + Σ(поток × вес)',
                'прирост% = прирост ÷ взвеш.капитал',
              ]}
            />
          )}
          {focus === 'annualizedPct' && (
            <FormulaBlock
              title="Формула годовых"
              lines={[
                'Сначала считается прирост% за период (Modified Dietz, см. выше).',
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

function AccountSection({
  title,
  tone,
  accounts,
  currency,
  showDelta = false,
}: {
  title: string
  tone: 'include' | 'exclude'
  accounts: PeriodReturnAccountLine[]
  currency: string
  showDelta?: boolean
}) {
  if (accounts.length === 0) {
    return (
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
        <p className="mt-1 text-xs text-slate-400">Нет счетов</p>
      </div>
    )
  }

  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {accounts.map((acc) => {
          const delta = showDelta ? acc.growthBase : acc.endBase - acc.startBase
          return (
            <li key={acc.accountId} className="flex items-start justify-between gap-3 px-3 py-2">
              <span className="min-w-0">
                <span className="block truncate font-medium text-slate-900">{acc.name}</span>
                <span
                  className={`text-[11px] ${
                    tone === 'include' ? 'text-emerald-700' : 'text-slate-400'
                  }`}
                >
                  {acc.kindLabel}
                  {acc.kind === 'fund' ? ' · накопления' : ''} · {acc.currency}
                </span>
              </span>
              <span className="shrink-0 text-right text-xs tabular-nums text-slate-600">
                {showDelta ? (
                  <>
                    <span
                      className={`block ${
                        delta > 0 ? 'text-emerald-700' : delta < 0 ? 'text-red-600' : ''
                      }`}
                    >
                      {signedAmount(delta, currency)}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {formatCurrency(acc.startBase, currency)} →{' '}
                      {formatCurrency(acc.endBase, currency)}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="block">{formatCurrency(acc.endBase, currency)}</span>
                    <span className="text-[11px] text-slate-400">
                      было {formatCurrency(acc.startBase, currency)}
                    </span>
                  </>
                )}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
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
